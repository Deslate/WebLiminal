import common from "./common.wgsl?raw";
import porcelain from "../../materials/porcelain.wgsl?raw";
import level from "../../levels/poolrooms.json";
import photons from "./photons.wgsl?raw";
import resolve from "./resolve.wgsl?raw";
import camera from "./camera.wgsl?raw";
import present from "./present.wgsl?raw";
import { makeGeometry } from "./geometry.js";

export async function createRenderer(canvas) {
  if (!navigator.gpu) throw new Error("此版本需要支持 WebGPU 的桌面浏览器。");
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: "high-performance",
  });
  if (!adapter) throw new Error("WebGPU 无可用适配器。");
  const device = await adapter.requestDevice({
    requiredLimits: {
      maxStorageBufferBindingSize: Math.min(
        adapter.limits.maxStorageBufferBindingSize,
        256 * 1024 * 1024,
      ),
      maxBufferSize: Math.min(adapter.limits.maxBufferSize, 256 * 1024 * 1024),
    },
  });
  const errors = [];
  device.addEventListener("uncapturederror", (e) => {
    errors.push(e.error.message);
    console.error(e.error.message);
  });
  const context = canvas.getContext("webgpu");
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "opaque" });
  const module = (label, code) => device.createShaderModule({ label, code });
  const shaderModules = [
    module("photon transport", common + porcelain + photons),
    module("world irradiance estimate", common + resolve),
    module("camera transport", common + porcelain + camera),
    module("lens and film", present),
  ];
  const infos = await Promise.all(
    shaderModules.map((m) => m.getCompilationInfo()),
  );
  for (let i = 0; i < infos.length; i++)
    for (const message of infos[i].messages)
      if (message.type === "error")
        throw new Error(`WGSL ${i}:${message.lineNum}: ${message.message}`);
  const pipelines = await Promise.all([
    device.createComputePipelineAsync({
      label: "photon transport",
      layout: "auto",
      compute: { module: shaderModules[0], entryPoint: "photons" },
    }),
    device.createComputePipelineAsync({
      label: "irradiance resolve",
      layout: "auto",
      compute: { module: shaderModules[1], entryPoint: "resolve" },
    }),
    device.createComputePipelineAsync({
      label: "camera transport",
      layout: "auto",
      compute: { module: shaderModules[2], entryPoint: "camera" },
    }),
    device.createRenderPipelineAsync({
      label: "display",
      layout: "auto",
      vertex: { module: shaderModules[3], entryPoint: "vs" },
      fragment: {
        module: shaderModules[3],
        entryPoint: "fs",
        targets: [{ format }],
      },
      primitive: { topology: "triangle-list" },
    }),
  ]);
  const uniforms = device.createBuffer({
    label: "physical parameters",
    size: 192,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const displayUniform = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const pathAudit = device.createBuffer({
    label: "independent Fresnel Snell audit paths",
    size: 512 * 8 * 16,
    usage:
      GPUBufferUsage.STORAGE |
      GPUBufferUsage.COPY_SRC |
      GPUBufferUsage.COPY_DST,
  });
  const counters = device.createBuffer({
    label: "photon path audit counters",
    size: 32,
    usage:
      GPUBufferUsage.STORAGE |
      GPUBufferUsage.COPY_SRC |
      GPUBufferUsage.COPY_DST,
  });
  const config = {
    photonCount: 131072,
    ...level.optics,
    freeze: false,
    waveTime: 1.7,
    seed: 7819301,
    diagnostic: 0,
    focusDistance: 10,
    focalLength: 28,
    fNumber: 5.6,
    reflectionCone: .018,
    grain: .004,
  };
  let geometry,
    buffers = {},
    groups = [],
    width = 960,
    height = 624,
    frame = 0,
    sceneBatches = 0,
    history = 0,
    imageBuffer,
    elapsed = 0,
    lastWaveTime = 0,
    activeJobs = 0;
  const LIGHT_STEP=.4, LIGHT_BATCHES=16;
  let cacheOrder=[0,1,2],cacheTimes=[0,0,0],futureBatches=0,
      cacheVersion=0,cacheLateFrames=0,lastPhotonTime=0,lightBlend=0;
  let resolveGroups=[];
  const buffer = (label, data, usage = GPUBufferUsage.STORAGE) => {
    const b = device.createBuffer({
      label,
      size: Math.max(16, data.byteLength),
      usage: usage | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
    device.queue.writeBuffer(b, 0, data);
    return b;
  };
  function bindings(pipeline, entries) {
    return device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: entries.map(([binding, b]) => ({
        binding,
        resource: { buffer: b },
      })),
    });
  }
  function regroup() {
    const shared = [
      [0, uniforms],
      [1, buffers.geometry],
      [2, buffers.surfaces],
    ];
    groups = [
      bindings(pipelines[0], [
        ...shared,
        [3, buffers.flux],
        [4, counters],
        [5, pathAudit],
      ]),
      bindings(pipelines[1], [
        [0, uniforms],
        [2, buffers.surfaces],
        [3, buffers.flux],
        [4, buffers[`irradiance${cacheOrder[2]}`]],
        [5, buffers.cellSurface],
      ]),
      bindings(pipelines[2], [
        ...shared,
        [3, buffers[`irradiance${cacheOrder[0]}`]],
        [5, buffers[`irradiance${cacheOrder[1]}`]],
        [4, imageBuffer],
      ]),
      bindings(pipelines[3], [
        [0, imageBuffer],
        [1, displayUniform],
      ]),
    ];
    resolveGroups=[0,1,2].map(i=>bindings(pipelines[1],[[0,uniforms],[2,buffers.surfaces],[3,buffers.flux],[4,buffers[`irradiance${i}`]],[5,buffers.cellSurface]]));
  }
  function rebuild() {
    for (const b of Object.values(buffers)) b.destroy();
    geometry = makeGeometry(config.apertureWidth, config.apertureDepth);
    buffers.geometry = buffer("analytic scene geometry", geometry.geometryData);
    buffers.surfaces = buffer(
      "surface density grid descriptors",
      geometry.surfaces,
    );
    buffers.cellSurface = buffer(
      "grid to physical surface index",
      geometry.cellSurfaces,
    );
    buffers.flux = device.createBuffer({
      label: "photons atomic flux",
      size: geometry.totalCells * 16,
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_DST |
        GPUBufferUsage.COPY_SRC,
    });
    for(let i=0;i<3;i++) buffers[`irradiance${i}`] = device.createBuffer({
      label: "progressive world-space irradiance",
      size: geometry.totalCells * 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    sceneBatches = 0;
    history = 0;
    if (imageBuffer) regroup();
  }
  function resize(w, h, scale = 1) {
    width = Math.max(256, Math.round((w * scale) / 8) * 8);
    height = Math.max(192, Math.round((h * scale) / 8) * 8);
    canvas.width = Math.round(w);
    canvas.height = Math.round(h);
    if (imageBuffer) imageBuffer.destroy();
    imageBuffer = device.createBuffer({
      label: "camera radiance accumulation",
      size: width * height * 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    history = 0;
    regroup();
  }
  rebuild();
  resize(1512, 982, 0.63);
  let autoStatic=false;
  function configure(patch) {
    const wasWidth = config.apertureWidth,
      wasDepth = config.apertureDepth;
    Object.assign(config, patch);
    autoStatic=false;
    config.photonCount=Math.max(32768,Math.min(262144,Math.round(config.photonCount/512)*512));
    config.waterLevel = Math.max(0.12, Math.min(1.05, config.waterLevel));
    config.waveAmplitude = Math.max(
      0.001,
      Math.min(0.14, config.waveAmplitude),
    );
    config.apertureWidth = Math.max(0.5, Math.min(7.8, config.apertureWidth));
    config.apertureDepth = Math.max(0.5, Math.min(9, config.apertureDepth));
    if (wasWidth !== config.apertureWidth || wasDepth !== config.apertureDepth)
      rebuild();
    sceneBatches = 0;
    history = 0;
  }
  async function render(view, time, moving, sun = 1) {
    if (activeJobs > 1) return false;
    activeJobs++;
    try {
      elapsed = time;
      // Camera motion never selects a stochastic mode or pauses water.
      autoStatic=true;
      const staticExposure=true;
      frame++;
      history++;
      const data = new ArrayBuffer(192),
        f = new Float32Array(data),
        u = new Uint32Array(data);
      const sy = Math.sin(view.yaw),
        cy = Math.cos(view.yaw),
        sp = Math.sin(view.pitch),
        cp = Math.cos(view.pitch);
      f.set([view.x, view.y, view.z, 1], 0);
      f.set([cy, 0, -sy, 0], 4);
      f.set([sy * sp, cp, cy * sp, 0], 8);
      f.set([-sy * cp, sp, -cy * cp, 0], 12);
      // A 36 x 24 mm full-frame gate, cropped to the viewport; focal length in mm.
      const tanY =
        (Math.min(24, 36 / (width / height)) * 0.5) / config.focalLength;
      f.set(
        [
          width / height,
          tanY,
          (config.focalLength / config.fNumber) * 0.0005,
          config.focusDistance,
        ],
        16,
      );
      lastWaveTime = config.waveTime + (config.freeze ? 0 : time);
      f.set(
        [
          lastWaveTime,
          config.waterLevel,
          config.waveAmplitude,
          config.exposure,
        ],
        20,
      );
      f.set(geometry.aperture, 24);
      u.set([width, height, sceneBatches, geometry.shapes.length], 28);
      f.set(
        [
          1 / Math.min(history, staticExposure ? 8192 : 24),
          1 / Math.min(sceneBatches, staticExposure ? 8192 : 8),
          sun,
          config.diagnostic,
        ],
        32,
      );
      u.set(
        [geometry.totalCells, geometry.surfaceCount, sceneBatches, config.seed],
        36,
      );
      u.set([config.photonCount,0,0,0],40);
      device.queue.writeBuffer(uniforms, 0, data);
      device.queue.writeBuffer(
        displayUniform,
        0,
        new Float32Array([
          width,
          height,
          0,
          0,
          config.exposure,
          time,
          lastWaveTime,
          config.grain,
        ]),
      );
      const photonBatch=(slot,phase,batch)=>{
        // Common random numbers across time: only optical geometry changes,
        // never the population of photon samples. Build into an unseen slot.
        f[20]=phase;u[30]=batch;u[38]=batch;u[41]=0;f[33]=1/batch;f[34]=1;
        device.queue.writeBuffer(uniforms,0,data);
        const enc=device.createCommandEncoder();enc.clearBuffer(buffers.flux);
        enc.clearBuffer(counters);enc.clearBuffer(pathAudit);
        let p=enc.beginComputePass();p.setPipeline(pipelines[0]);p.setBindGroup(0,groups[0]);p.dispatchWorkgroups(config.photonCount/64);p.end();
        p=enc.beginComputePass();p.setPipeline(pipelines[1]);p.setBindGroup(0,resolveGroups[slot]);p.dispatchWorkgroups(Math.ceil(geometry.totalCells/128));p.end();
        device.queue.submit([enc.finish()]);sceneBatches++;lastPhotonTime=phase;
      };
      if(sceneBatches===0){
        cacheOrder=[0,1,2];cacheTimes=[lastWaveTime,lastWaveTime+LIGHT_STEP,lastWaveTime+2*LIGHT_STEP];futureBatches=0;cacheLateFrames=0;cacheVersion=0;regroup();
        for(let slot=0;slot<2;slot++)for(let b=1;b<=LIGHT_BATCHES;b++)photonBatch(slot,config.freeze?lastWaveTime:cacheTimes[slot],b);
      }
      if(!config.freeze){
        if(lastWaveTime>=cacheTimes[cacheOrder[1]] && futureBatches===LIGHT_BATCHES){
          cacheOrder=[cacheOrder[1],cacheOrder[2],cacheOrder[0]];
          cacheTimes[cacheOrder[2]]=cacheTimes[cacheOrder[1]]+LIGHT_STEP;
          futureBatches=0;cacheVersion++;regroup();
        }
        if(lastWaveTime>cacheTimes[cacheOrder[1]]+.001)cacheLateFrames++;
        for(let j=0;j<2&&futureBatches<LIGHT_BATCHES;j++)photonBatch(cacheOrder[2],cacheTimes[cacheOrder[2]],++futureBatches);
      }
      const a=cacheTimes[cacheOrder[0]],b=cacheTimes[cacheOrder[1]];
      const uBlend=config.freeze?0:Math.max(0,Math.min(1,(lastWaveTime-a)/(b-a)));
      lightBlend=uBlend*uBlend*(3-2*uBlend);
      f[20]=lastWaveTime;u[30]=sceneBatches;u[38]=sceneBatches;u[41]=1;f[34]=sun;
      f.set([lightBlend,config.reflectionCone,0,0],44);
      device.queue.writeBuffer(uniforms,0,data);
      const encoder=device.createCommandEncoder();
      let pass;
      pass = encoder.beginComputePass();
      pass.setPipeline(pipelines[2]);
      pass.setBindGroup(0, groups[2]);
      pass.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8));
      pass.end();
      const draw = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            loadOp: "clear",
            storeOp: "store",
            clearValue: { r: 0.7, g: 0.7, b: 0.6, a: 1 },
          },
        ],
      });
      draw.setPipeline(pipelines[3]);
      draw.setBindGroup(0, groups[3]);
      draw.draw(3);
      draw.end();
      device.queue.submit([encoder.finish()]);
      await device.queue.onSubmittedWorkDone();
      return true;
    } finally {
      activeJobs--;
    }
  }
  async function audit() {
    await device.queue.onSubmittedWorkDone();
    const read = device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const enc = device.createCommandEncoder();
    enc.copyBufferToBuffer(counters, 0, read, 0, 32);
    device.queue.submit([enc.finish()]);
    await read.mapAsync(GPUMapMode.READ);
    const numbers = Array.from(new Uint32Array(read.getMappedRange()).slice());
    read.unmap();
    read.destroy();
    const pathsRead = device.createBuffer({
      size: 512 * 8 * 16,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const pe = device.createCommandEncoder();
    pe.copyBufferToBuffer(pathAudit, 0, pathsRead, 0, 512 * 8 * 16);
    device.queue.submit([pe.finish()]);
    await pathsRead.mapAsync(GPUMapMode.READ);
    const paths = Array.from(
      new Float32Array(pathsRead.getMappedRange()).slice(),
    );
    pathsRead.unmap();
    pathsRead.destroy();
    return {
      paths,
      emitted: numbers[0],
      waterIntersections: numbers[1],
      indirectDeposits: numbers[2],
      waterCausticDeposits: numbers[3],
      aboveWaterCausticDeposits: numbers[4],
      config: { ...config },
      waveTime: lastPhotonTime,
      cameraWaveTime: lastWaveTime,
      cache: {times:cacheOrder.map(i=>cacheTimes[i]),version:cacheVersion,lateFrames:cacheLateFrames,blend:lightBlend,preparedBatches:futureBatches},
      batches: sceneBatches,
      totalEmittedSinceReset: sceneBatches * config.photonCount,
      atlasCells: geometry.totalCells,
      internal: [width, height],
      adapter: {
        vendor: adapter.info.vendor,
        architecture: adapter.info.architecture,
        description: adapter.info.description,
      },
      errors: [...errors],
    };
  }
  return {
    render,
    configure,
    resize,
    audit,
    get solids() {
      return geometry.solids;
    },
    get config() {
      return { ...config };
    },
    get resolution() {
      return [width, height];
    },
    get samples() {
      return history;
    },
    get errors() {
      return [...errors];
    },
    get autoStatic() { return autoStatic; },
    get lightingBatches() { return sceneBatches; },
    get dynamics() {return {waveTime:lastWaveTime,lightTimes:cacheOrder.map(i=>cacheTimes[i]),lightBlend,cacheVersion,cacheLateFrames,futureBatches};},
    get busy() {
      return activeJobs > 0;
    },
  };
}
