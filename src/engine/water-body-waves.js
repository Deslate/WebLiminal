// 256x256 GPU Spectral FFT Finite-Depth Gravity-Capillary Body Wake & Footstep Solver.
// Ported from v1 body-waves.js into the reusable v2 engine with a dynamic player-centered anchor.

import bodyWavesWGSL from "./shaders/water-body-waves.wgsl?raw";
import { kickImpacts } from "./wake-trail.js";

export const BODY_FFT_N = 256;
export const BODY_DOMAIN_SIZE = 24.0;
export const BODY_DX = BODY_DOMAIN_SIZE / BODY_FFT_N; // 0.09375 m

export async function createBodyWaveSolver(device) {
  const module = device.createShaderModule({ label: "v2-water-body-waves", code: bodyWavesWGSL });
  const info = await module.getCompilationInfo();
  for (const m of info.messages) {
    if (m.type === "error") throw new Error(`water-body-waves WGSL:${m.lineNum}: ${m.message}`);
  }

  const layout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform", hasDynamicOffset: true } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
    ],
  });
  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });

  const [fftPipe, evolvePipe, absorbPipe] = await Promise.all(
    ["fft", "evolve", "absorb"].map((entryPoint) =>
      device.createComputePipelineAsync({ label: `body-wave-${entryPoint}`, layout: pipelineLayout, compute: { module, entryPoint } }),
    ),
  );
  const pipes = [fftPipe, evolvePipe, absorbPipe];

  const count = BODY_FFT_N * BODY_FFT_N;
  const byteSize = count * 16;
  const states = [0, 1].map((i) =>
    device.createBuffer({
      label: `body-wave-state-${i}`,
      size: byteSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    }),
  );

  const passCount = 34; // 8 X FFT + 8 Z FFT + 1 evolve + 8 X IFFT + 8 Z IFFT + 1 absorb (returns to state 0)
  const stride = 512;
  const paramsBuf = device.createBuffer({
    label: "body-wave-params",
    size: passCount * stride,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const groups = [0, 1].map((i) =>
    device.createBindGroup({
      layout,
      entries: [
        { binding: 0, resource: { buffer: paramsBuf, size: 288 } },
        { binding: 1, resource: { buffer: states[i] } },
        { binding: 2, resource: { buffer: states[1 - i] } },
      ],
    }),
  );

  const workgroups = count / 128; // 512 workgroups
  const zeroBuf = new Float32Array(byteSize / 4);
  const paramData = new ArrayBuffer(passCount * stride);
  const paramF32 = new Float32Array(paramData);
  const paramU32 = new Uint32Array(paramData);

  let anchorMinX = -BODY_DOMAIN_SIZE * 0.5;
  let anchorMinZ = -BODY_DOMAIN_SIZE * 0.5;
  let lastTime = null;
  let prevBody = null;
  let contact = null;
  let impacts = [];
  let activeTimer = 0; // seconds remaining before solver can sleep cleanly when totally calm

  function reset(centerX = 0, centerZ = 0) {
    anchorMinX = Math.round(centerX) - BODY_DOMAIN_SIZE * 0.5;
    anchorMinZ = Math.round(centerZ) - BODY_DOMAIN_SIZE * 0.5;
    lastTime = null;
    prevBody = null;
    contact = null;
    impacts = [];
    activeTimer = 0;
    device.queue.writeBuffer(states[0], 0, zeroBuf);
    device.queue.writeBuffer(states[1], 0, zeroBuf);
  }

  function addFootstep(stepContact) {
    const t = stepContact.time ?? lastTime ?? 0;
    contact = { ...stepContact, time: t };
    impacts.push(...kickImpacts(contact));
    if (impacts.length > 48) impacts = impacts.slice(-48);
    activeTimer = Math.max(activeTimer, 10.0);
  }

  function addImpulse(x, z, strength = 0.2, time = null) {
    const t = time ?? lastTime ?? 0;
    impacts.push({ x, z, time: t, momentum: Math.min(0.035, Math.abs(strength) * 0.045) });
    if (impacts.length > 48) impacts = impacts.slice(-48);
    activeTimer = Math.max(activeTimer, 10.0);
  }

  function recenterIfNeeded(body) {
    if (!body) return;
    const cx = anchorMinX + BODY_DOMAIN_SIZE * 0.5;
    const cz = anchorMinZ + BODY_DOMAIN_SIZE * 0.5;
    if (Math.hypot(body.x - cx, body.z - cz) > 6.5) {
      reset(body.x, body.z);
    }
  }

  function encodeAdvance(encoder, time, depth, body) {
    recenterIfNeeded(body);

    const initializing = lastTime === null;
    const start = lastTime ?? time;
    const delta = lastTime === null ? 0.016 : Math.min(0.05, Math.max(0, time - lastTime));
    lastTime = time;

    let vx = 0;
    let vz = 0;
    if (body && prevBody && delta > 1e-4) {
      vx = (body.x - prevBody.x) / delta;
      vz = (body.z - prevBody.z) / delta;
      // Ignore teleports (> 2.6 m/s) as body wake impulses.
      if (Math.hypot(vx, vz) > 2.6) {
        vx = 0;
        vz = 0;
      }
    }
    prevBody = body ? { x: body.x, z: body.z } : null;

    const speed = Math.hypot(vx, vz);
    if (speed > 0.04 || impacts.length > 0 || (contact && time - contact.time < 0.2)) {
      activeTimer = Math.max(activeTimer, 10.0);
    }

    if (activeTimer <= 0 && !initializing) {
      return false;
    }
    activeTimer = Math.max(0, activeTimer - delta);

    const hits = impacts.filter((v) => v.time >= start - 1e-5 && v.time <= time + 1e-5).slice(0, 12);
    impacts = impacts.filter((v) => v.time > time + 1e-5);

    const wakeGain = 1.0 + 0.45 * Math.min(1, speed / 0.8) * Math.max(0, Math.min(1, (1.65 - speed) / 0.8));
    const bodyAmp = body ? Math.min(0.046, Math.max(0.08, depth) * 0.088) * wakeGain : 0;

    let slot = 0;
    let active = 0;

    const writeSlot = (axis, stage, inverse) => {
      const o = slot * 128;
      paramF32[o + 0] = time;
      paramF32[o + 1] = delta;
      paramF32[o + 2] = Math.max(0.08, depth);
      paramF32[o + 3] = initializing ? 1 : 0;
      paramF32[o + 4] = body ? body.x : anchorMinX + BODY_DOMAIN_SIZE * 0.5;
      paramF32[o + 5] = body ? body.z : anchorMinZ + BODY_DOMAIN_SIZE * 0.5;
      paramF32[o + 6] = bodyAmp;
      paramF32[o + 7] = 0;
      paramF32[o + 8] = vx;
      paramF32[o + 9] = vz;
      paramF32[o + 10] = hits.length;
      paramF32[o + 11] = 0;
      paramU32[o + 12] = axis;
      paramU32[o + 13] = stage;
      paramU32[o + 14] = inverse;
      paramU32[o + 15] = 0;
      paramF32[o + 16] = anchorMinX;
      paramF32[o + 17] = anchorMinZ;
      paramF32[o + 18] = BODY_DOMAIN_SIZE;
      paramF32[o + 19] = BODY_DX;
      if (contact) {
        paramF32[o + 20] = contact.x;
        paramF32[o + 21] = contact.z;
        paramF32[o + 22] = contact.time;
        paramF32[o + 23] = (contact.amplitude ?? 0.014) * 34.0;
      } else {
        paramF32[o + 20] = 0;
        paramF32[o + 21] = 0;
        paramF32[o + 22] = -10;
        paramF32[o + 23] = 0;
      }
      for (let n = 0; n < hits.length; n++) {
        const hit = hits[n];
        paramF32[o + 24 + n * 4 + 0] = hit.x;
        paramF32[o + 24 + n * 4 + 1] = hit.z;
        paramF32[o + 24 + n * 4 + 2] = hit.time;
        paramF32[o + 24 + n * 4 + 3] = hit.momentum;
      }
    };

    const runPass = (pipeIdx, axis = 0, stage = 0, inverse = 0) => {
      writeSlot(axis, stage, inverse);
      const p = encoder.beginComputePass();
      p.setPipeline(pipes[pipeIdx]);
      p.setBindGroup(0, groups[active], [slot * stride]);
      p.dispatchWorkgroups(workgroups);
      p.end();
      active = 1 - active;
      slot++;
    };

    for (let axis = 0; axis < 2; axis++) {
      for (let stage = 0; stage < 8; stage++) runPass(0, axis, stage, 0);
    }
    runPass(1, 0, 0, 0);
    for (let axis = 0; axis < 2; axis++) {
      for (let stage = 0; stage < 8; stage++) runPass(0, axis, stage, 1);
    }
    runPass(2, 0, 0, 0);

    device.queue.writeBuffer(paramsBuf, 0, paramData);
    return true;
  }

  function destroy() {
    states[0].destroy();
    states[1].destroy();
    paramsBuf.destroy();
  }

  return {
    field: states[0],
    reset,
    addFootstep,
    addImpulse,
    encodeAdvance,
    destroy,
    get anchor() {
      return { minX: anchorMinX, minZ: anchorMinZ, size: BODY_DOMAIN_SIZE, dx: BODY_DX };
    },
    get isActive() {
      return activeTimer > 0;
    },
  };
}
