// Chebyshev finite-depth gravity-capillary background wave solver on a Neumann wet-domain graph.
// Solves h_tt = -G(L)[g*h + (sigma/rho)*L*h + p/rho] - damping*h_t with G(L) = sqrt(L)*tanh(H*sqrt(L)).
// Ported from v1 finite-depth.js into the reusable v2 engine with dynamic local window shifting.

import finiteDepthWGSL from "./shaders/water-finite-depth.wgsl?raw";
import { dispersionPolynomial } from "./water-dispersion.js";

export { dispersionPolynomial };

export async function createFiniteDepthSolver(device, { nx, nz, dx, states, pressurePasses = 3 }) {
  const count = nx * nz;
  const maxDegree = 48;
  const maxSlots = 32;
  const paramStride = 256;
  const ctrlStride = 256;

  const module = device.createShaderModule({ label: "v2-water-finite-depth", code: finiteDepthWGSL });
  const info = await module.getCompilationInfo();
  for (const m of info.messages) {
    if (m.type === "error") throw new Error(`water-finite-depth WGSL:${m.lineNum}: ${m.message}`);
  }

  const mkStorage = (label, size) =>
    device.createBuffer({ label, size, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });

  const potential = mkStorage("fd-potential", count * 4);
  const rhs = mkStorage("fd-rhs", count * 4);
  const recurrence = [mkStorage("fd-recur-a", count * 8), mkStorage("fd-recur-b", count * 8)];
  const maskBuf = mkStorage("fd-neumann-mask", count * 4);
  const paramsBuf = device.createBuffer({
    label: "fd-params",
    size: maxSlots * paramStride,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const controlsBuf = device.createBuffer({
    label: "fd-chebyshev-controls",
    size: (maxDegree + 1) * ctrlStride,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const layout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform", hasDynamicOffset: true } },
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((binding) => ({
        binding,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: [1, 3, 6, 8].includes(binding) ? "read-only-storage" : "storage" },
      })),
      { binding: 9, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform", hasDynamicOffset: true } },
    ],
  });
  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });

  const entryNames = [
    "prepare",
    "beginPolynomial",
    "recur",
    "finish",
    "seedPressure",
    "diffusePressure",
    "initializeState",
    "shiftState",
  ];
  const pipes = await Promise.all(
    entryNames.map((entryPoint) =>
      device.createComputePipelineAsync({ label: `fd-${entryPoint}`, layout: pipelineLayout, compute: { module, entryPoint } }),
    ),
  );

  const groups = states.map((st, i) =>
    recurrence.map((rec, j) =>
      device.createBindGroup({
        layout,
        entries: [
          { binding: 0, resource: { buffer: paramsBuf, size: 64 } },
          { binding: 1, resource: { buffer: st } },
          { binding: 2, resource: { buffer: states[1 - i] } },
          { binding: 3, resource: { buffer: rec } },
          { binding: 4, resource: { buffer: potential } },
          { binding: 5, resource: { buffer: rhs } },
          { binding: 6, resource: { buffer: rec } },
          { binding: 7, resource: { buffer: recurrence[1 - j] } },
          { binding: 8, resource: { buffer: maskBuf } },
          { binding: 9, resource: { buffer: controlsBuf, size: 16 } },
        ],
      }),
    ),
  );

  let degree = 18;
  let fit = null;
  const workgroups = Math.ceil(count / 128);
  const invDx2 = 1 / (dx * dx);
  const paramBatchData = new ArrayBuffer(maxSlots * paramStride);
  const paramF32 = new Float32Array(paramBatchData);
  const paramU32 = new Uint32Array(paramBatchData);

  function setDepth(depth) {
    const H = Math.max(0.12, depth);
    const kMax = Math.sqrt(16 / (3 * dx * dx));
    degree = Math.max(16, Math.min(maxDegree, Math.ceil(1.25 * H * kMax)));
    fit = dispersionPolynomial(H, degree, dx);
    const bytes = new ArrayBuffer((degree + 1) * ctrlStride);
    const f = new Float32Array(bytes);
    const u = new Uint32Array(bytes);
    for (let k = 0; k <= degree; k++) {
      f[k * 64] = fit.coefficients[k];
      f[k * 64 + 1] = fit.limit;
      u[k * 64 + 2] = k;
    }
    device.queue.writeBuffer(controlsBuf, 0, bytes);
  }

  // Builds 9-point Neumann zero-flux connectivity mask from wet binary array (1 = wet, 0 = solid/dry).
  function uploadWetMask(wetArray) {
    const bits = new Uint32Array(count);
    const off = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ];
    const isWet = (x, z) => x >= 0 && z >= 0 && x < nx && z < nz && wetArray[z * nx + x] > 0;
    for (let z = 0; z < nz; z++) {
      for (let x = 0; x < nx; x++) {
        const i = z * nx + x;
        if (!isWet(x, z)) continue;
        let b = 0x80000000;
        for (let j = 0; j < 8; j++) {
          const [ox, oz] = off[j];
          if (isWet(x + ox, z + oz) && (j < 4 || (isWet(x + ox, z) && isWet(x, z + oz)))) {
            b |= 1 << j;
          }
        }
        bits[i] = b >>> 0;
      }
    }
    device.queue.writeBuffer(maskBuf, 0, bits);
  }

  function writeParamSlot(slot, { time, dt, amp, seed = 1, forcing = 1, shiftX = 0, shiftZ = 0 }) {
    const o = slot * 64;
    paramF32[o + 0] = time;
    paramF32[o + 1] = dt;
    paramF32[o + 2] = 0;
    paramF32[o + 3] = 0;
    paramF32[o + 4] = amp;
    paramF32[o + 5] = 0;
    paramF32[o + 6] = seed;
    paramF32[o + 7] = forcing;
    paramU32[o + 8] = nx;
    paramU32[o + 9] = nz;
    paramU32[o + 10] = count;
    paramU32[o + 11] = 0;
    paramF32[o + 12] = dx;
    paramF32[o + 13] = invDx2;
    paramF32[o + 14] = shiftX;
    paramF32[o + 15] = shiftZ;
  }

  function flushParams(slotCount) {
    if (slotCount <= 0) return;
    device.queue.writeBuffer(paramsBuf, 0, paramBatchData, 0, Math.min(slotCount, maxSlots) * paramStride);
  }

  function dispatch(encoder, active, slot, pipeIdx, j, k = 0) {
    const p = encoder.beginComputePass();
    p.setPipeline(pipes[pipeIdx]);
    p.setBindGroup(0, groups[active][j], [slot * paramStride, k * ctrlStride]);
    p.dispatchWorkgroups(workgroups);
    p.end();
  }

  function buildPressure(encoder, active, slot) {
    dispatch(encoder, active, slot, 4, 0, 0); // seedPressure -> recurrence[1]
    let j = 1;
    for (let i = 0; i < pressurePasses; i++) {
      dispatch(encoder, active, slot, 5, j, 0); // diffusePressure
      j = 1 - j;
    }
    return j;
  }

  function encodeInitialize(encoder, active, slot) {
    const j = buildPressure(encoder, active, slot);
    dispatch(encoder, active, slot, 6, j, 0); // initializeState -> states[1 - active]
  }

  function encodeShift(encoder, active, slot) {
    const j = buildPressure(encoder, active, slot);
    dispatch(encoder, active, slot, 7, j, 0); // shiftState -> states[1 - active]
  }

  function encodeStep(encoder, active, slot) {
    const noiseJ = buildPressure(encoder, active, slot);
    dispatch(encoder, active, slot, 0, noiseJ, degree); // prepare
    dispatch(encoder, active, slot, 1, 0, degree); // beginPolynomial -> recurrence[1]
    let j = 1;
    for (let k = degree - 1; k >= 1; k--) {
      dispatch(encoder, active, slot, 2, j, k); // recur
      j = 1 - j;
    }
    dispatch(encoder, active, slot, 3, j, 0); // finish -> states[1 - active]
  }

  function destroy() {
    potential.destroy();
    rhs.destroy();
    recurrence[0].destroy();
    recurrence[1].destroy();
    maskBuf.destroy();
    paramsBuf.destroy();
    controlsBuf.destroy();
  }

  return {
    maskBuf,
    setDepth,
    uploadWetMask,
    writeParamSlot,
    flushParams,
    encodeInitialize,
    encodeShift,
    encodeStep,
    destroy,
    get info() {
      return { degree, dx, nx, nz, pressurePasses, limit: fit?.limit ?? 0 };
    },
  };
}
