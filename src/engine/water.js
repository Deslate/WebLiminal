// Optional GPU Physical Water Module.
// Only instantiated when a compiled map declares a water volume. Dry maps
// allocate zero water buffers, zero wave/caustic shaders, and zero per-frame work.
// Features:
//   - Neumann solid-masked 9-point isotropic wave simulation with viscous dissipation & wading wakes
//   - Real-time GPU photon-refracted water caustics (zero fake sine caustic patterns!)
//   - Full-scene BVH Snell refraction + exact analytic submerged tiles + full-scene BVH reflections

import bvhCommonWGSL from "./shaders/bvh-common.wgsl?raw";
import waterSimWGSL from "./shaders/water-sim.wgsl?raw";
import waterCausticsWGSL from "./shaders/water-caustics.wgsl?raw";
import waterRenderWGSL from "./shaders/water-render.wgsl?raw";

export async function createWaterModule(
  device,
  waterDesc,
  collision,
  frameUniformBuffer,
  linSampler,
  sceneBindings,
  isSoftware = false,
) {
  const sizeX = waterDesc.maxX - waterDesc.minX;
  const sizeZ = waterDesc.maxZ - waterDesc.minZ;
  const targetCell = waterDesc.cellSize ?? 0.075;
  const nx = Math.max(32, Math.min(384, Math.round(sizeX / targetCell)));
  const nz = Math.max(32, Math.min(384, Math.round(sizeZ / targetCell)));
  const dx = Math.max(sizeX / nx, sizeZ / nz);
  const cellCount = nx * nz;

  // Caustic world-space grid size (higher photon density on hardware GPU)
  const causticSize = isSoftware ? 160 : 256;
  const causticSubSamples = isSoftware ? 1 : 2;

  // Rasterize 2D solids intersecting the water level into a Neumann zero-flux solid mask.
  const solidMaskData = new Uint32Array(cellCount);
  const wl = waterDesc.level;
  for (let iz = 0; iz < nz; iz++) {
    const wz = waterDesc.minZ + ((iz + 0.5) / nz) * sizeZ;
    for (let ix = 0; ix < nx; ix++) {
      const wx = waterDesc.minX + ((ix + 0.5) / nx) * sizeX;
      let solid = 0;
      for (const s of collision.solids ?? []) {
        if (s.minY !== undefined && s.minY > wl + 0.08) continue;
        if (s.maxY !== undefined && s.maxY < wl - 0.08) continue;
        if (s.kind === "circle") {
          const rx = wx - s.x;
          const rz = wz - s.z;
          if (rx * rx + rz * rz <= s.radius * s.radius) {
            solid = 1;
            break;
          }
        } else if (wx >= s.minX && wx <= s.maxX && wz >= s.minZ && wz <= s.maxZ) {
          solid = 1;
          break;
        }
      }
      solidMaskData[iz * nx + ix] = solid;
    }
  }

  const solidMaskBuf = device.createBuffer({
    label: "water solid mask",
    size: solidMaskData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(solidMaskBuf, 0, solidMaskData);

  // Ping-pong wave height/velocity state buffers (vec2f per cell).
  const stateBufs = [0, 1].map((i) =>
    device.createBuffer({
      label: `water wave state ${i}`,
      size: cellCount * 8,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    }),
  );

  // Photon caustic GPU buffers & resolved texture.
  const staticMapBuf = device.createBuffer({
    label: "water static sun/floor map",
    size: causticSize * causticSize * 16,
    usage: GPUBufferUsage.STORAGE,
  });
  const causticAccumBuf = device.createBuffer({
    label: "water caustic atomic accum",
    size: causticSize * causticSize * 12,
    usage: GPUBufferUsage.STORAGE,
  });
  const causticTex = device.createTexture({
    label: "water caustic irradiance",
    size: [causticSize, causticSize],
    format: "rgba16float",
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
  });
  const causticView = causticTex.createView();

  // Uniform buffers.
  const simUniformBuf = device.createBuffer({
    label: "water sim uniform",
    size: 16 * 11,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const causticUniformBuf = device.createBuffer({
    label: "water caustic uniform",
    size: 48,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const renderUniformBuf = device.createBuffer({
    label: "water render uniform",
    size: 64,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Write static caustic domain uniform.
  {
    const cBuf = new ArrayBuffer(48);
    const cf = new Float32Array(cBuf);
    const cu = new Uint32Array(cBuf);
    cf[0] = waterDesc.minX;
    cf[1] = waterDesc.minZ;
    cf[2] = 1 / sizeX;
    cf[3] = 1 / sizeZ;
    cu[4] = nx;
    cu[5] = nz;
    cu[6] = causticSize;
    cu[7] = causticSubSamples;
    cf[8] = waterDesc.level;
    cf[9] = waterDesc.waveAmp ?? 0.018;
    cf[10] = sizeX;
    cf[11] = sizeZ;
    device.queue.writeBuffer(causticUniformBuf, 0, cBuf);
  }

  const quadVerts = new Float32Array([0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0]);
  const quadBuf = device.createBuffer({
    label: "water surface quad",
    size: quadVerts.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(quadBuf, 0, quadVerts);

  const compileMod = async (label, code) => {
    const mod = device.createShaderModule({ label, code });
    const info = await mod.getCompilationInfo();
    for (const msg of info.messages) {
      if (msg.type === "error") throw new Error(`Water WGSL ${label}:${msg.lineNum}: ${msg.message}`);
    }
    return mod;
  };

  const [simMod, causticMod, renMod] = await Promise.all([
    compileMod("water-sim", waterSimWGSL),
    compileMod("water-caustics", bvhCommonWGSL + "\n" + waterCausticsWGSL),
    compileMod("water-render", bvhCommonWGSL + "\n" + waterRenderWGSL),
  ]);

  const [simPipeline, bakeStaticPipe, clearCausticPipe, splatCausticPipe, resolveCausticPipe, renderPipeline] =
    await Promise.all([
      device.createComputePipelineAsync({ label: "water-wave-step", layout: "auto", compute: { module: simMod, entryPoint: "stepWaves" } }),
      device.createComputePipelineAsync({ label: "water-static-bake", layout: "auto", compute: { module: causticMod, entryPoint: "bakeWaterStatic" } }),
      device.createComputePipelineAsync({ label: "water-caustic-clear", layout: "auto", compute: { module: causticMod, entryPoint: "clearCaustics" } }),
      device.createComputePipelineAsync({ label: "water-caustic-splat", layout: "auto", compute: { module: causticMod, entryPoint: "splatCaustics" } }),
      device.createComputePipelineAsync({ label: "water-caustic-resolve", layout: "auto", compute: { module: causticMod, entryPoint: "resolveCaustics" } }),
      device.createRenderPipelineAsync({
        label: "water-surface-render",
        layout: "auto",
        vertex: {
          module: renMod,
          entryPoint: "vsWater",
          buffers: [{ arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }] }],
        },
        fragment: {
          module: renMod,
          entryPoint: "fsWater",
          targets: [{ format: "rgba16float" }],
        },
        primitive: { topology: "triangle-list", cullMode: "none" },
      }),
    ]);

  const simGroups = [0, 1].map((i) =>
    device.createBindGroup({
      layout: simPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: simUniformBuf } },
        { binding: 1, resource: { buffer: solidMaskBuf } },
        { binding: 2, resource: { buffer: stateBufs[i] } },
        { binding: 3, resource: { buffer: stateBufs[1 - i] } },
      ],
    }),
  );

  const bakeStaticGroup = device.createBindGroup({
    layout: bakeStaticPipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: frameUniformBuffer } },
      { binding: 1, resource: { buffer: causticUniformBuf } },
      { binding: 2, resource: { buffer: sceneBindings.bvhNodeBuf } },
      { binding: 3, resource: { buffer: sceneBindings.bvhTriBuf } },
      { binding: 5, resource: { buffer: staticMapBuf } },
    ],
  });

  const clearCausticGroup = device.createBindGroup({
    layout: clearCausticPipe.getBindGroupLayout(0),
    entries: [
      { binding: 1, resource: { buffer: causticUniformBuf } },
      { binding: 6, resource: { buffer: causticAccumBuf } },
    ],
  });

  const splatCausticGroups = [0, 1].map((i) =>
    device.createBindGroup({
      layout: splatCausticPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: frameUniformBuffer } },
        { binding: 1, resource: { buffer: causticUniformBuf } },
        { binding: 4, resource: { buffer: stateBufs[i] } },
        { binding: 5, resource: { buffer: staticMapBuf } },
        { binding: 6, resource: { buffer: causticAccumBuf } },
      ],
    }),
  );

  const resolveCausticGroup = device.createBindGroup({
    layout: resolveCausticPipe.getBindGroupLayout(0),
    entries: [
      { binding: 1, resource: { buffer: causticUniformBuf } },
      { binding: 6, resource: { buffer: causticAccumBuf } },
      { binding: 7, resource: causticView },
    ],
  });

  let ping = 0;
  let simTime = 0;
  let accumDt = 0;
  let stepCount = 0;
  let staticBaked = false;
  const fixedDt = 1 / 60;
  const maxWaveSpeed = Math.min(1.25, (0.42 * dx) / fixedDt);
  const pendingWakes = [];
  let renderGroups = [null, null];

  function bindSceneTextures(sceneDepthView) {
    renderGroups = [0, 1].map((i) =>
      device.createBindGroup({
        layout: renderPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: frameUniformBuffer } },
          { binding: 1, resource: { buffer: renderUniformBuf } },
          { binding: 2, resource: { buffer: stateBufs[i] } },
          { binding: 3, resource: sceneDepthView },
          { binding: 4, resource: linSampler },
          { binding: 5, resource: { buffer: sceneBindings.bvhNodeBuf } },
          { binding: 6, resource: { buffer: sceneBindings.bvhTriBuf } },
          { binding: 7, resource: { buffer: sceneBindings.materialBuf } },
          { binding: 8, resource: sceneBindings.lmIrradFinalView },
          { binding: 9, resource: causticView },
        ],
      }),
    );
  }

  function addWake(x, z, radius = 0.34, strength = -0.18) {
    if (x < waterDesc.minX || x > waterDesc.maxX || z < waterDesc.minZ || z > waterDesc.maxZ) return;
    if (pendingWakes.length >= 8) pendingWakes.shift();
    pendingWakes.push([x, z, radius, strength]);
  }

  function writeSimUniform() {
    const buf = new ArrayBuffer(176);
    const u = new Uint32Array(buf);
    const f = new Float32Array(buf);
    u[0] = nx;
    u[1] = nz;
    u[2] = stepCount;
    u[3] = pendingWakes.length;
    f[4] = waterDesc.minX;
    f[5] = waterDesc.minZ;
    f[6] = dx;
    f[7] = fixedDt;
    f[8] = maxWaveSpeed;
    f[9] = 0.42;
    f[10] = waterDesc.waveAmp ?? 0.008;
    f[11] = simTime;
    for (let i = 0; i < pendingWakes.length; i++) {
      f.set(pendingWakes[i], 12 + i * 4);
    }
    device.queue.writeBuffer(simUniformBuf, 0, buf);
    pendingWakes.length = 0;
  }

  // Pre-warm wave simulation (~72 steps = 1.2s) on load so the very first frame already has
  // natural, settled organic pool undulations with zero flat-mirror startup artifact!
  {
    const warmSteps = 72;
    for (let w = 0; w < warmSteps; w++) {
      simTime += fixedDt;
      stepCount++;
      writeSimUniform();
      const enc = device.createCommandEncoder({ label: "water-prewarm" });
      const pass = enc.beginComputePass();
      pass.setPipeline(simPipeline);
      pass.setBindGroup(0, simGroups[ping]);
      pass.dispatchWorkgroups(Math.ceil(nx / 8), Math.ceil(nz / 8));
      pass.end();
      device.queue.submit([enc.finish()]);
      ping = 1 - ping;
    }
  }

  function advance(encoder, dt) {
    // Bake static water sun-visibility & floor depth once on first frame (after frameUniform is populated).
    if (!staticBaked) {
      const wgC = Math.ceil(causticSize / 8);
      const p = encoder.beginComputePass({ label: "water-static-bake" });
      p.setPipeline(bakeStaticPipe);
      p.setBindGroup(0, bakeStaticGroup);
      p.dispatchWorkgroups(wgC, wgC);
      p.end();
      staticBaked = true;
    }

    accumDt = Math.min(accumDt + Math.max(0, Math.min(dt, 0.05)), fixedDt * 3);
    let ran = false;
    while (accumDt >= fixedDt) {
      accumDt -= fixedDt;
      simTime += fixedDt;
      stepCount++;
      writeSimUniform();

      const pass = encoder.beginComputePass({ label: "water-wave-sim" });
      pass.setPipeline(simPipeline);
      pass.setBindGroup(0, simGroups[ping]);
      pass.dispatchWorkgroups(Math.ceil(nx / 8), Math.ceil(nz / 8));
      pass.end();
      ping = 1 - ping;
      ran = true;
    }

    // Live GPU photon-refracted caustic map update
    const wgC = Math.ceil(causticSize / 8);
    {
      let p = encoder.beginComputePass({ label: "water-caustic-clear" });
      p.setPipeline(clearCausticPipe);
      p.setBindGroup(0, clearCausticGroup);
      p.dispatchWorkgroups(wgC, wgC);
      p.end();

      p = encoder.beginComputePass({ label: "water-caustic-splat" });
      p.setPipeline(splatCausticPipe);
      p.setBindGroup(0, splatCausticGroups[ping]);
      p.dispatchWorkgroups(wgC, wgC);
      p.end();

      p = encoder.beginComputePass({ label: "water-caustic-resolve" });
      p.setPipeline(resolveCausticPipe);
      p.setBindGroup(0, resolveCausticGroup);
      p.dispatchWorkgroups(wgC, wgC);
      p.end();
    }

    // Update water render uniforms.
    const rBuf = new ArrayBuffer(64);
    const rf = new Float32Array(rBuf);
    const ru = new Uint32Array(rBuf);
    rf[0] = waterDesc.minX;
    rf[1] = waterDesc.minZ;
    rf[2] = 1 / sizeX;
    rf[3] = 1 / sizeZ;
    ru[4] = nx;
    ru[5] = nz;
    ru[6] = 0;
    ru[7] = 0;
    rf[8] = waterDesc.absorption[0];
    rf[9] = waterDesc.absorption[1];
    rf[10] = waterDesc.absorption[2];
    rf[11] = waterDesc.causticStrength ?? 1.05;
    rf[12] = waterDesc.level;
    rf[13] = waterDesc.waveAmp ?? 0.018;
    rf[14] = sizeX;
    rf[15] = sizeZ;
    device.queue.writeBuffer(renderUniformBuf, 0, rBuf);
    return ran;
  }

  function render(encoder, targetHdrView) {
    const pass = encoder.beginRenderPass({
      label: "water-surface",
      colorAttachments: [{ view: targetHdrView, loadOp: "load", storeOp: "store" }],
    });
    pass.setPipeline(renderPipeline);
    pass.setBindGroup(0, renderGroups[ping]);
    pass.setVertexBuffer(0, quadBuf);
    pass.draw(6);
    pass.end();
  }

  function destroy() {
    solidMaskBuf.destroy();
    stateBufs[0].destroy();
    stateBufs[1].destroy();
    staticMapBuf.destroy();
    causticAccumBuf.destroy();
    causticTex.destroy();
    simUniformBuf.destroy();
    causticUniformBuf.destroy();
    renderUniformBuf.destroy();
    quadBuf.destroy();
  }

  return {
    level: waterDesc.level,
    absorption: waterDesc.absorption,
    nx,
    nz,
    bindSceneTextures,
    addWake,
    advance,
    render,
    destroy,
  };
}
