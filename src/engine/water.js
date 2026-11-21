// Optional GPU interactive water module.
// Only instantiated when a compiled map declares a water volume. Dry maps
// allocate zero water buffers, zero wave shaders, and zero per-frame work.

import waterSimWGSL from "./shaders/water-sim.wgsl?raw";
import waterRenderWGSL from "./shaders/water-render.wgsl?raw";

export async function createWaterModule(device, waterDesc, collision, frameUniformBuffer, linSampler) {
  const sizeX = waterDesc.maxX - waterDesc.minX;
  const sizeZ = waterDesc.maxZ - waterDesc.minZ;
  const targetCell = waterDesc.cellSize ?? 0.075;
  const nx = Math.max(32, Math.min(384, Math.round(sizeX / targetCell)));
  const nz = Math.max(32, Math.min(384, Math.round(sizeZ / targetCell)));
  const dx = Math.max(sizeX / nx, sizeZ / nz);
  const cellCount = nx * nz;

  // Rasterize 2D solids that intersect the water level into a Neumann solid mask.
  const solidMaskData = new Uint32Array(cellCount);
  const wl = waterDesc.level;
  for (let iz = 0; iz < nz; iz++) {
    const wz = waterDesc.minZ + ((iz + 0.5) / nz) * sizeZ;
    for (let ix = 0; ix < nx; ix++) {
      const wx = waterDesc.minX + ((ix + 0.5) / nx) * sizeX;
      let solid = 0;
      for (const s of collision.solids ?? []) {
        if (s.minY !== undefined && s.minY > wl + 0.1) continue;
        if (s.maxY !== undefined && s.maxY < wl - 0.1) continue;
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

  // Uniform buffers.
  const simUniformBuf = device.createBuffer({
    label: "water sim uniform",
    size: 16 * 11, // 3 vec4 + 8 vec4 wakes = 176 bytes
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const renderUniformBuf = device.createBuffer({
    label: "water render uniform",
    size: 64,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Simple 2-triangle water surface quad (in normalized [0..1]^2 XZ domain).
  const quadVerts = new Float32Array([0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0]);
  const quadBuf = device.createBuffer({
    label: "water surface quad",
    size: quadVerts.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(quadBuf, 0, quadVerts);

  const simMod = device.createShaderModule({ label: "water-sim", code: waterSimWGSL });
  const renMod = device.createShaderModule({ label: "water-render", code: waterRenderWGSL });
  for (const mod of [simMod, renMod]) {
    const info = await mod.getCompilationInfo();
    for (const msg of info.messages) {
      if (msg.type === "error") throw new Error(`Water WGSL ${mod.label}:${msg.lineNum}: ${msg.message}`);
    }
  }

  const simPipeline = await device.createComputePipelineAsync({
    label: "water wave step",
    layout: "auto",
    compute: { module: simMod, entryPoint: "stepWaves" },
  });

  const renderPipeline = await device.createRenderPipelineAsync({
    label: "water surface render",
    layout: "auto",
    vertex: {
      module: renMod,
      entryPoint: "vsWater",
      buffers: [
        {
          arrayStride: 8,
          attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
        },
      ],
    },
    fragment: {
      module: renMod,
      entryPoint: "fsWater",
      targets: [{ format: "rgba16float" }],
    },
    primitive: { topology: "triangle-list", cullMode: "none" },
  });

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

  let ping = 0;
  let simTime = 0;
  let accumDt = 0;
  let stepCount = 0;
  const fixedDt = 1 / 60;
  const maxWaveSpeed = Math.min(1.35, (0.45 * dx) / fixedDt); // CFL-stable wave speed
  const pendingWakes = [];
  let renderGroups = [null, null];

  function bindSceneTextures(sceneColorView, sceneDepthView) {
    renderGroups = [0, 1].map((i) =>
      device.createBindGroup({
        layout: renderPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: frameUniformBuffer } },
          { binding: 1, resource: { buffer: renderUniformBuf } },
          { binding: 2, resource: { buffer: stateBufs[i] } },
          { binding: 3, resource: sceneColorView },
          { binding: 4, resource: sceneDepthView },
          { binding: 5, resource: linSampler },
        ],
      }),
    );
  }

  function addWake(x, z, radius = 0.34, strength = -0.18) {
    if (x < waterDesc.minX || x > waterDesc.maxX || z < waterDesc.minZ || z > waterDesc.maxZ) return;
    if (pendingWakes.length >= 8) pendingWakes.shift();
    pendingWakes.push([x, z, radius, strength]);
  }

  function advance(encoder, dt) {
    accumDt = Math.min(accumDt + Math.max(0, Math.min(dt, 0.05)), fixedDt * 3);
    let ran = false;
    while (accumDt >= fixedDt) {
      accumDt -= fixedDt;
      simTime += fixedDt;
      stepCount++;

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
      f[9] = 0.58; // gentle viscous damping
      f[10] = waterDesc.waveAmp ?? 0.012;
      f[11] = simTime;
      for (let i = 0; i < pendingWakes.length; i++) {
        f.set(pendingWakes[i], 12 + i * 4);
      }
      device.queue.writeBuffer(simUniformBuf, 0, buf);
      pendingWakes.length = 0;

      const pass = encoder.beginComputePass({ label: "water wave sim" });
      pass.setPipeline(simPipeline);
      pass.setBindGroup(0, simGroups[ping]);
      pass.dispatchWorkgroups(Math.ceil(nx / 8), Math.ceil(nz / 8));
      pass.end();
      ping = 1 - ping;
      ran = true;
    }

    // Always update water render uniforms with latest elapsed simTime.
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
    rf[11] = waterDesc.causticStrength ?? 1.35;
    rf[12] = waterDesc.level;
    rf[13] = dx;
    rf[14] = waterDesc.waveAmp ?? 0.012;
    rf[15] = simTime;
    device.queue.writeBuffer(renderUniformBuf, 0, rBuf);
    return ran;
  }

  function render(encoder, targetHdrView) {
    const pass = encoder.beginRenderPass({
      label: "water surface",
      colorAttachments: [
        {
          view: targetHdrView,
          loadOp: "load",
          storeOp: "store",
        },
      ],
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
    simUniformBuf.destroy();
    renderUniformBuf.destroy();
    quadBuf.destroy();
  }

  return {
    level: waterDesc.level,
    nx,
    nz,
    bindSceneTextures,
    addWake,
    advance,
    render,
    destroy,
  };
}
