// Optional GPU Physical Water Module (v2).
// Only instantiated when a compiled map declares a water volume. Dry maps allocate
// zero water buffers, zero wave/caustic shaders, and zero per-frame work.
//
// Two-solver physical architecture (ported from v1 into a local player-tracking window):
//   1) Chebyshev Finite-Depth Neumann Background Solver:
//      Solves h_tt = -G(L)[g*h + (sigma/rho)*L*h + p/rho] - damping*h_t on the wet-domain
//      9-point isotropic graph Laplacian, driven by homogeneous band-limited stochastic pressure.
//   2) 256x256 Spectral FFT Dispersive Body Wake & Footstep Solver:
//      Integrates exact omega^2 = (g*k + (sigma/rho)*k^3)*tanh(k*H) driven by continuous moving
//      wading body displacement, alternating collision-resolved footsteps, and kick-splash parcels.
//   3) Shared C1 Catmull-Rom composition feeding BOTH live GPU photon-refracted caustics and
//      full-scene BVH Snell refraction + Beer-Lambert optics + full-scene BVH mirror reflections.

import bvhCommonWGSL from "./shaders/bvh-common.wgsl?raw";
import waterReconstructWGSL from "./shaders/water-reconstruct.wgsl?raw";
import waterCausticsWGSL from "./shaders/water-caustics.wgsl?raw";
import waterRenderWGSL from "./shaders/water-render.wgsl?raw";
import { createFiniteDepthSolver } from "./water-finite-depth.js";
import { createBodyWaveSolver, BODY_DX } from "./water-body-waves.js";
import { computeWaterWindowUpdate } from "./water-dispersion.js";

export async function createWaterModule(
  device,
  waterDesc,
  collision,
  frameUniformBuffer,
  linSampler,
  sceneBindings,
  isSoftware = false,
) {
  const mapMinX = waterDesc.minX;
  const mapMinZ = waterDesc.minZ;
  const mapSizeX = waterDesc.maxX - waterDesc.minX;
  const mapSizeZ = waterDesc.maxZ - waterDesc.minZ;
  const wl = waterDesc.level;

  // Player-tracking local simulation window: 8 cm cell spacing resolves crisp 16-55 cm indoor pool
  // ripples with ~20 Chebyshev passes instead of ~29, cutting GPU water compute cost by >2.5x!
  const dx = 0.08;
  const maxWinCells = isSoftware ? 224 : 256; // 17.92 m (software) or 20.48 m (hardware GPU)
  const nx = Math.max(64, Math.min(maxWinCells, Math.ceil(mapSizeX / dx)));
  const nz = Math.max(64, Math.min(maxWinCells, Math.ceil(mapSizeZ / dx)));
  const winSizeX = nx * dx;
  const winSizeZ = nz * dx;
  const cellCount = nx * nz;
  const pressurePasses = 2;

  // Caustic world-space grid spans the exact active local window (~9.8 cm photon density!).
  const causticSize = isSoftware ? 160 : 208;
  const causticSubSamples = 1;

  // Ping-pong finite-depth height/velocity buffers + combined wave buffer (vec2f per cell).
  const fdStates = [0, 1].map((i) =>
    device.createBuffer({
      label: `water-fd-state-${i}`,
      size: cellCount * 8,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    }),
  );
  const combinedWaveBuf = device.createBuffer({
    label: "water-combined-wave",
    size: cellCount * 8,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  const [finiteDepth, bodyWaves] = await Promise.all([
    createFiniteDepthSolver(device, { nx, nz, dx, states: fdStates, pressurePasses }),
    createBodyWaveSolver(device),
  ]);
  finiteDepth.setDepth(Math.max(0.2, wl));

  // Photon caustic GPU buffers & resolved texture.
  const staticMapBuf = device.createBuffer({
    label: "water-static-sun-floor",
    size: causticSize * causticSize * 16,
    usage: GPUBufferUsage.STORAGE,
  });
  const causticAccumBuf = device.createBuffer({
    label: "water-caustic-accum",
    size: causticSize * causticSize * 12,
    usage: GPUBufferUsage.STORAGE,
  });
  const causticTex = device.createTexture({
    label: "water-caustic-irradiance",
    size: [causticSize, causticSize],
    format: "rgba16float",
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
  });
  const causticView = causticTex.createView();

  // Uniform buffers.
  const reconstructUniformBuf = device.createBuffer({
    label: "water-reconstruct-uniform",
    size: 48,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const causticUniformBuf = device.createBuffer({
    label: "water-caustic-uniform",
    size: 48,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const renderUniformBuf = device.createBuffer({
    label: "water-render-uniform",
    size: 80,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const quadVerts = new Float32Array([0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0]);
  const quadBuf = device.createBuffer({
    label: "water-surface-quad",
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

  const [reconMod, causticMod, renMod] = await Promise.all([
    compileMod("water-reconstruct", waterReconstructWGSL),
    compileMod("water-caustics", bvhCommonWGSL + "\n" + waterCausticsWGSL),
    compileMod("water-render", bvhCommonWGSL + "\n" + waterRenderWGSL),
  ]);

  const [reconPipe, bakeStaticPipe, clearCausticPipe, splatCausticPipe, resolveCausticPipe, renderPipeline] =
    await Promise.all([
      device.createComputePipelineAsync({ label: "water-reconstruct", layout: "auto", compute: { module: reconMod, entryPoint: "reconstruct" } }),
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
        depthStencil: {
          format: "depth32float",
          depthWriteEnabled: false,
          depthCompare: "less",
        },
        primitive: { topology: "triangle-list", cullMode: "none" },
      }),
    ]);

  const reconGroups = [0, 1].map((i) =>
    device.createBindGroup({
      layout: reconPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: reconstructUniformBuf } },
        { binding: 1, resource: { buffer: fdStates[i] } },
        { binding: 2, resource: { buffer: finiteDepth.maskBuf } },
        { binding: 3, resource: { buffer: bodyWaves.field } },
        { binding: 4, resource: { buffer: combinedWaveBuf } },
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

  const splatCausticGroup = device.createBindGroup({
    layout: splatCausticPipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: frameUniformBuffer } },
      { binding: 1, resource: { buffer: causticUniformBuf } },
      { binding: 4, resource: { buffer: combinedWaveBuf } },
      { binding: 5, resource: { buffer: staticMapBuf } },
      { binding: 6, resource: { buffer: causticAccumBuf } },
    ],
  });

  const resolveCausticGroup = device.createBindGroup({
    layout: resolveCausticPipe.getBindGroupLayout(0),
    entries: [
      { binding: 1, resource: { buffer: causticUniformBuf } },
      { binding: 6, resource: { buffer: causticAccumBuf } },
      { binding: 7, resource: causticView },
    ],
  });

  // Rasterizes both 2D solid obstacles AND raised walkable decks/terraces above waterLevel
  // so finite-depth background ripples reflect realistically off walls, columns, AND pool decks!
  const wetScratch = new Uint8Array(cellCount);
  function rasterizeWetMask(wMinX, wMinZ) {
    const solids = collision.solids ?? [];
    const floors = collision.floors ?? [];
    for (let iz = 0; iz < nz; iz++) {
      const wz = wMinZ + (iz + 0.5) * dx;
      const inZ = wz >= mapMinZ && wz <= mapMinZ + mapSizeZ;
      for (let ix = 0; ix < nx; ix++) {
        const wx = wMinX + (ix + 0.5) * dx;
        if (!inZ || wx < mapMinX || wx > mapMinX + mapSizeX) {
          wetScratch[iz * nx + ix] = 0;
          continue;
        }
        let blocked = false;
        for (let sIdx = 0; sIdx < solids.length; sIdx++) {
          const s = solids[sIdx];
          if (s.minY !== undefined && s.minY > wl + 0.04) continue;
          if (s.maxY !== undefined && s.maxY < wl - 0.04) continue;
          if (s.kind === "circle") {
            const rx = wx - s.x;
            const rz = wz - s.z;
            if (rx * rx + rz * rz <= s.radius * s.radius) {
              blocked = true;
              break;
            }
          } else if (wx >= s.minX && wx <= s.maxX && wz >= s.minZ && wz <= s.maxZ) {
            blocked = true;
            break;
          }
        }
        if (!blocked) {
          for (let fIdx = 0; fIdx < floors.length; fIdx++) {
            const fl = floors[fIdx];
            if (wx < fl.minX || wx > fl.maxX || wz < fl.minZ || wz > fl.maxZ) continue;
            if (fl.kind === "ramp") {
              const t = fl.axis === "x"
                ? (wx - fl.minX) / Math.max(fl.maxX - fl.minX, 1e-4)
                : (wz - fl.minZ) / Math.max(fl.maxZ - fl.minZ, 1e-4);
              const fy = fl.y0 + (fl.y1 - fl.y0) * Math.max(0, Math.min(1, t));
              if (fy >= wl - 0.02) {
                blocked = true;
                break;
              }
            } else if (fl.y >= wl - 0.02) {
              blocked = true;
              break;
            }
          }
        }
        wetScratch[iz * nx + ix] = blocked ? 0 : 1;
      }
    }
    finiteDepth.uploadWetMask(wetScratch);
  }

  let winMinX = mapMinX;
  let winMinZ = mapMinZ;
  let lastFocusX = mapMinX + mapSizeX * 0.5;
  let lastFocusZ = mapMinZ + mapSizeZ * 0.5;
  let windowReady = false;
  let staticBaked = false;
  let fdActive = 0;
  let simTime = 0;
  let accumDt = 0;
  let pendingShift = null;
  let bodyPose = null;
  let renderGroup = null;
  let boundDepthView = null;

  const fixedDt = 1 / 60;
  const waveAmp = waterDesc.waveAmp ?? 0.018;
  const waveSeed = waterDesc.seed ?? 137;

  // Runs fast physical initialization + brief warmup steps when loading or teleporting to a new chamber.
  function initializeWindow(cx, cz, minX, minZ) {
    winMinX = minX;
    winMinZ = minZ;
    lastFocusX = cx;
    lastFocusZ = cz;
    rasterizeWetMask(winMinX, winMinZ);
    bodyWaves.reset(cx, cz);
    staticBaked = false;
    windowReady = true;
    pendingShift = null;
    accumDt = 0;

    // 1 init + 14 physical finite-depth steps (~0.23 s) in ONE command buffer so frame 0 already
    // displays natural, wall-reflected indoor pool ripples with zero startup flatness.
    const warmSteps = 14;
    const enc = device.createCommandEncoder({ label: "water-fd-init-warm" });
    finiteDepth.writeParamSlot(0, { time: simTime, dt: fixedDt, amp: waveAmp, seed: waveSeed, forcing: 1 });
    finiteDepth.encodeInitialize(enc, fdActive, 0);
    fdActive = 1 - fdActive;

    for (let s = 1; s <= warmSteps; s++) {
      simTime += fixedDt;
      finiteDepth.writeParamSlot(s, { time: simTime, dt: fixedDt, amp: waveAmp, seed: waveSeed, forcing: 1 });
      finiteDepth.encodeStep(enc, fdActive, s);
      fdActive = 1 - fdActive;
    }
    finiteDepth.flushParams(warmSteps + 1);
    device.queue.submit([enc.finish()]);
  }

  function bindSceneTextures(sceneDepthView) {
    boundDepthView = sceneDepthView;
    renderGroup = device.createBindGroup({
      layout: renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: frameUniformBuffer } },
        { binding: 1, resource: { buffer: renderUniformBuf } },
        { binding: 2, resource: { buffer: combinedWaveBuf } },
        { binding: 4, resource: linSampler },
        { binding: 5, resource: { buffer: sceneBindings.bvhNodeBuf } },
        { binding: 6, resource: { buffer: sceneBindings.bvhTriBuf } },
        { binding: 7, resource: { buffer: sceneBindings.materialBuf } },
        { binding: 8, resource: sceneBindings.lmIrradFinalView },
        { binding: 9, resource: causticView },
      ],
    });
  }

  function setBody(pose) {
    bodyPose = pose ? { x: pose.x, z: pose.z } : null;
  }

  function addFootstep(contact) {
    bodyWaves.addFootstep(contact);
  }

  function addWake(x, z, _radius = 0.34, strength = -0.18) {
    if (x < mapMinX || x > mapMinX + mapSizeX || z < mapMinZ || z > mapMinZ + mapSizeZ) return;
    bodyWaves.addImpulse(x, z, strength);
  }

  // Called right before main frame CommandEncoder starts: ensures local simulation window covers
  // the active player/camera location (re-initializing ONLY on startup/teleport, never near map edges!).
  function prepare(focusPos) {
    const fx = focusPos?.x ?? mapMinX + mapSizeX * 0.5;
    const fz = focusPos?.z ?? mapMinZ + mapSizeZ * 0.5;
    const plan = computeWaterWindowUpdate({
      focusX: fx,
      focusZ: fz,
      lastFocusX,
      lastFocusZ,
      winMinX,
      winMinZ,
      winSizeX,
      winSizeZ,
      mapMinX,
      mapMinZ,
      mapSizeX,
      mapSizeZ,
      dx,
      windowReady,
    });
    lastFocusX = fx;
    lastFocusZ = fz;

    if (plan.action === "init") {
      initializeWindow(fx, fz, plan.minX, plan.minZ);
    } else if (plan.action === "shift") {
      winMinX = plan.minX;
      winMinZ = plan.minZ;
      rasterizeWetMask(winMinX, winMinZ);
      staticBaked = false;
      pendingShift = { shiftX: plan.shiftX, shiftZ: plan.shiftZ };
    }
  }

  function advance(encoder, dt, elapsed = null) {
    if (!windowReady) prepare(null);

    // 1. Finite-depth Neumann background wave propagation (with optional seamless window shift).
    let slot = 0;
    if (pendingShift) {
      finiteDepth.writeParamSlot(slot, {
        time: simTime,
        dt: fixedDt,
        amp: waveAmp,
        seed: waveSeed,
        forcing: 1,
        shiftX: pendingShift.shiftX,
        shiftZ: pendingShift.shiftZ,
      });
      finiteDepth.encodeShift(encoder, fdActive, slot);
      fdActive = 1 - fdActive;
      slot++;
      pendingShift = null;
    }

    // Cap to at most 2 fixed 60 Hz steps per rendered frame to avoid spiral-of-death at lower FPS.
    accumDt = Math.min(accumDt + Math.max(0, Math.min(dt, 0.05)), fixedDt * 2);
    let ran = false;
    while (accumDt >= fixedDt && slot < 3) {
      accumDt -= fixedDt;
      simTime += fixedDt;
      finiteDepth.writeParamSlot(slot, {
        time: simTime,
        dt: fixedDt,
        amp: waveAmp,
        seed: waveSeed,
        forcing: 1,
      });
      finiteDepth.encodeStep(encoder, fdActive, slot);
      fdActive = 1 - fdActive;
      slot++;
      ran = true;
    }
    if (slot > 0) finiteDepth.flushParams(slot);

    // 2. Spectral FFT dispersive body wake + alternating footstep + kick-splash evolution.
    const bodyClock = elapsed ?? simTime;
    bodyWaves.encodeAdvance(encoder, bodyClock, wl, bodyPose);

    // 3. Compose finite-depth background + spectral FFT body wake into shared combinedWaveBuf.
    {
      const rBuf = new ArrayBuffer(48);
      const rf = new Float32Array(rBuf);
      const ru = new Uint32Array(rBuf);
      const anc = bodyWaves.anchor;
      rf[0] = winMinX;
      rf[1] = winMinZ;
      rf[2] = dx;
      rf[3] = Math.min(fixedDt, Math.max(0, accumDt));
      rf[4] = anc.minX;
      rf[5] = anc.minZ;
      rf[6] = 1 / BODY_DX;
      rf[7] = bodyWaves.isActive || bodyPose ? 1 : 0;
      ru[8] = nx;
      ru[9] = nz;
      ru[10] = cellCount;
      ru[11] = 0;
      device.queue.writeBuffer(reconstructUniformBuf, 0, rBuf);

      const p = encoder.beginComputePass({ label: "water-reconstruct" });
      p.setPipeline(reconPipe);
      p.setBindGroup(0, reconGroups[fdActive]);
      p.dispatchWorkgroups(Math.ceil(cellCount / 128));
      p.end();
    }

    // 4. Update local-window caustic domain uniform & trace live GPU photon caustics.
    {
      const cBuf = new ArrayBuffer(48);
      const cf = new Float32Array(cBuf);
      const cu = new Uint32Array(cBuf);
      cf[0] = winMinX;
      cf[1] = winMinZ;
      cf[2] = 1 / winSizeX;
      cf[3] = 1 / winSizeZ;
      cu[4] = nx;
      cu[5] = nz;
      cu[6] = causticSize;
      cu[7] = causticSubSamples;
      cf[8] = wl;
      cf[9] = dx;
      cf[10] = winSizeX;
      cf[11] = winSizeZ;
      device.queue.writeBuffer(causticUniformBuf, 0, cBuf);

      const wgC = Math.ceil(causticSize / 8);
      if (!staticBaked) {
        const p = encoder.beginComputePass({ label: "water-static-bake" });
        p.setPipeline(bakeStaticPipe);
        p.setBindGroup(0, bakeStaticGroup);
        p.dispatchWorkgroups(wgC, wgC);
        p.end();
        staticBaked = true;
      }

      let p = encoder.beginComputePass({ label: "water-caustic-clear" });
      p.setPipeline(clearCausticPipe);
      p.setBindGroup(0, clearCausticGroup);
      p.dispatchWorkgroups(wgC, wgC);
      p.end();

      p = encoder.beginComputePass({ label: "water-caustic-splat" });
      p.setPipeline(splatCausticPipe);
      p.setBindGroup(0, splatCausticGroup);
      p.dispatchWorkgroups(wgC, wgC);
      p.end();

      p = encoder.beginComputePass({ label: "water-caustic-resolve" });
      p.setPipeline(resolveCausticPipe);
      p.setBindGroup(0, resolveCausticGroup);
      p.dispatchWorkgroups(wgC, wgC);
      p.end();
    }

    // 5. Update water surface render uniforms (full map quad + active local physics window).
    {
      const uBuf = new ArrayBuffer(80);
      const uf = new Float32Array(uBuf);
      const uu = new Uint32Array(uBuf);
      uf[0] = mapMinX;
      uf[1] = mapMinZ;
      uf[2] = mapSizeX;
      uf[3] = mapSizeZ;
      uf[4] = winMinX;
      uf[5] = winMinZ;
      uf[6] = 1 / winSizeX;
      uf[7] = 1 / winSizeZ;
      uu[8] = nx;
      uu[9] = nz;
      uu[10] = 0;
      uu[11] = 0;
      uf[12] = waterDesc.absorption[0];
      uf[13] = waterDesc.absorption[1];
      uf[14] = waterDesc.absorption[2];
      uf[15] = waterDesc.causticStrength ?? 1.15;
      uf[16] = wl;
      uf[17] = dx;
      uf[18] = winSizeX;
      uf[19] = winSizeZ;
      device.queue.writeBuffer(renderUniformBuf, 0, uBuf);
    }

    return ran;
  }

  function render(encoder, targetHdrView) {
    if (!renderGroup || !boundDepthView) return;
    const pass = encoder.beginRenderPass({
      label: "water-surface",
      colorAttachments: [{ view: targetHdrView, loadOp: "load", storeOp: "store" }],
      depthStencilAttachment: {
        view: boundDepthView,
        depthReadOnly: true,
      },
    });
    pass.setPipeline(renderPipeline);
    pass.setBindGroup(0, renderGroup);
    pass.setVertexBuffer(0, quadBuf);
    pass.draw(6);
    pass.end();
  }

  function destroy() {
    finiteDepth.destroy();
    bodyWaves.destroy();
    fdStates[0].destroy();
    fdStates[1].destroy();
    combinedWaveBuf.destroy();
    staticMapBuf.destroy();
    causticAccumBuf.destroy();
    causticTex.destroy();
    reconstructUniformBuf.destroy();
    causticUniformBuf.destroy();
    renderUniformBuf.destroy();
    quadBuf.destroy();
  }

  return {
    level: wl,
    absorption: waterDesc.absorption,
    nx,
    nz,
    dx,
    bindSceneTextures,
    setBody,
    addFootstep,
    addWake,
    prepare,
    advance,
    render,
    destroy,
  };
}
