import {LAB_DEFAULTS,normalizeLab} from "../lab-settings.js";
import {labShader} from "./lab-shaders.js";
import { createWaveSimulation } from "./wave-simulation.js";
import commonSource from "./common.wgsl?raw";
import { curvedShader } from "./curved-shapes.js";
import { conductorShader, conductorCommon } from "./conductor-shaders.js";
import { apertureCommon, apertureShader } from "./apertures.js";
import { airGrid, airBakeSource, airCamera } from "./atmosphere.js";
import photons from "./photons.wgsl?raw";
import sky from "./sky.wgsl?raw";
import resolve from "./resolve.wgsl?raw";
import camera from "./camera.wgsl?raw";
import waterCaustics from "./water-caustics.wgsl?raw";
import composeLight from "./compose-light.wgsl?raw";
import diffuseTransfer from "./diffuse-transfer.wgsl?raw";
import reflectionFilter from "./reflection-filter.wgsl?raw";
import present from "./present.wgsl?raw";
import { packScene, sceneShaderPrelude, waterGrid } from "./scene.js";

// `level` is a level module (see docs/LEVELS.md): optics, limits, material
// WGSL and a scene(options) builder. The renderer knows no level by name.
export async function createRenderer(canvas, level) {
  if (!navigator.gpu) throw new Error("This version needs a desktop browser with WebGPU support.");
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: "high-performance",
  });
  if (!adapter) throw new Error("No WebGPU adapter is available.");
  const device = await adapter.requestDevice({
    requiredLimits: {
      maxStorageBufferBindingSize: Math.min(
        adapter.limits.maxStorageBufferBindingSize,
        1024 * 1024 * 1024,
      ),
      maxBufferSize: Math.min(adapter.limits.maxBufferSize, 1024 * 1024 * 1024),
      // The camera pass of a window with scattering air binds a ninth buffer.
      maxStorageBuffersPerShaderStage: Math.min(adapter.limits.maxStorageBuffersPerShaderStage, 10),
    },
  });
  const errors = [];
  device.addEventListener("uncapturederror", (e) => {
    errors.push(e.error.message);
    console.error(e.error.message);
  });
  // Water rectangle, aperture plane and floor receiver are fixed per level and
  // compiled into every shader; the aperture rectangle stays a uniform.
  const initialScene = level.scene(level.optics);
  const common = apertureCommon(conductorCommon(curvedShader(commonSource, initialScene), initialScene), initialScene);
  const prelude = sceneShaderPrelude(initialScene);
  // Optional single-scattering air: a fixed world grid baked with the light caches.
  // Air needs a ninth camera storage buffer; adapters without it render without air.
  const air = device.limits.maxStorageBuffersPerShaderStage >= 9 ? airGrid(initialScene) : null;
  const simulation = await createWaveSimulation(device, { grid: waterGrid(initialScene.water), prelude });
  const { near: nearMaterial, photon: photonMaterial } = level.materials;
  const context = canvas.getContext("webgpu");
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "opaque" });
  const module = (label, code) => device.createShaderModule({ label, code });
  let lab={...LAB_DEFAULTS},pipelines;
  async function compileLab(){
  const shaderModules = [
    module("photon transport", prelude + common + photonMaterial + apertureShader('photons', conductorShader('photons', photons, initialScene), initialScene)),
    module("world irradiance estimate", prelude + common + labShader("resolve",resolve,lab)),
    module("camera transport", prelude + common + nearMaterial + (air ? airCamera(conductorShader('camera', labShader("camera",camera,lab), initialScene), initialScene) : conductorShader('camera', labShader("camera",camera,lab), initialScene))),
    module("lens and film", present),
    module("area sky integral", prelude + common + apertureShader('sky', labShader("sky",sky,lab), initialScene)),
    module("current water flux", prelude + common + apertureShader('water', labShader("water",waterCaustics,lab), initialScene)),
    module("instant diffuse transfer", prelude + common + photonMaterial + labShader("diffuse",diffuseTransfer,lab)),
    module("assemble current lighting",prelude+common+composeLight),
    module("continuous reflection footprint",prelude+common+reflectionFilter),
    ...(air?[module("air light grid",prelude+common+airBakeSource(initialScene))]:[]),
  ];
  const infos = await Promise.all(
    shaderModules.map((m) => m.getCompilationInfo()),
  );
  for (let i = 0; i < infos.length; i++)
    for (const message of infos[i].messages)
      if (message.type === "error")
        throw new Error(`WGSL ${i}:${message.lineNum}: ${message.message}`);
  return await Promise.all([
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
    device.createComputePipelineAsync({label:"64-point area sky",layout:"auto",compute:{module:shaderModules[4],entryPoint:"integrateSky"}}),
    device.createComputePipelineAsync({label:"separable photon kernel",layout:"auto",compute:{module:shaderModules[1],entryPoint:"horizontal"}}),
    ...["emitWater","waterHorizontal","waterResolve"].map(entryPoint=>device.createComputePipelineAsync({label:entryPoint,layout:"auto",compute:{module:shaderModules[5],entryPoint}})),
    ...["bakeTransfer","propagate"].map(entryPoint=>device.createComputePipelineAsync({label:entryPoint,layout:"auto",compute:{module:shaderModules[6],entryPoint}})),
    device.createComputePipelineAsync({label:"compose current light",layout:"auto",compute:{module:shaderModules[7],entryPoint:"compose"}}),
    ...["horizontalReflection","verticalReflection"].map(entryPoint=>device.createComputePipelineAsync({label:entryPoint,layout:"auto",compute:{module:shaderModules[8],entryPoint}})),
    device.createComputePipelineAsync({label:"finite-volume diffuse source",layout:"auto",compute:{module:shaderModules[6],entryPoint:"restrictPatches"}}),
    ...(air?[device.createComputePipelineAsync({label:"air light grid",layout:"auto",compute:{module:shaderModules[9],entryPoint:"bakeAir"}})]:[]),
  ]);
  }
  pipelines=await compileLab();
  const uniforms = device.createBuffer({
    label: "physical parameters",
    size: 416,
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
    photonCount: 196608,
    lightBatches: 32,
    sunGrid:384,skyGridX:256,skyGridY:512,diffuseIterations:4,
    ...level.optics,
    freeze: false,
    waveTime: 1.7,
    seed: 7819301,
    diagnostic: 0,
    focusDistance: 10,
    focalLength: level.optics.focalLength ?? 28,
    fNumber: 5.6,
    reflectionCone: .018,
    reflectionFilter:1,
    grain: .004,
  };
  let wakes=[],body=null;
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
  const lightBatches=()=>config.lightBatches;
  let lastPhotonTime=0,quality=0,lastRenderTime=null,frameCost=null;
  let composeGroup,reflectionHorizontalGroup,reflectionVerticalGroup,restrictGroup;
  let reflectionBuffer,reflectionGuideBuffer,reflectionRowsBuffer;
  let resolveGroups=[],skyGroup,horizontalGroup,liveEmitGroup,liveHorizontalGroup,liveResolveGroup,flatResolveGroup,bakeGroup,propagateGroups=[];
  let liveTime=0,liveFrames=0;
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
        [5, pathAudit],[9,simulation.field],
      ]),
      null,
      bindings(pipelines[2], [
        ...shared,
        [3,buffers.combined],[4,imageBuffer],[5,reflectionBuffer],[6,reflectionGuideBuffer],[8,buffers.sky],[9,simulation.field],...(air?[[10,buffers.air]]:[]),
      ]),
      bindings(pipelines[3], [
        [0, imageBuffer],
        [1, displayUniform],
      ]),
    ];
    reflectionHorizontalGroup=bindings(pipelines[12],[[0,uniforms],[3,reflectionBuffer],[4,reflectionGuideBuffer],[5,reflectionRowsBuffer]]);
    reflectionVerticalGroup=bindings(pipelines[13],[[0,uniforms],[4,reflectionGuideBuffer],[5,reflectionRowsBuffer],[6,imageBuffer]]);
    resolveGroups=[0].map(i=>bindings(pipelines[1],[[0,uniforms],[2,buffers.surfaces],[4,buffers[`irradiance${i}`]],[5,buffers.cellSurface],[6,buffers[`fine${i}`]],[7,buffers.rows]]));
    horizontalGroup=bindings(pipelines[5],[[0,uniforms],[2,buffers.surfaces],[3,buffers.flux],[5,buffers.cellSurface],[7,buffers.rows]]);
    skyGroup=bindings(pipelines[4],[[0,uniforms],[1,buffers.geometry],[2,buffers.surfaces],[3,buffers.cellSurface],[4,buffers.sky]]);
    liveEmitGroup=bindings(pipelines[6],[[0,uniforms],[1,buffers.geometry],[2,buffers.surfaces],[3,buffers.liveFlux],[6,pathAudit],[7,counters],[9,simulation.field]]);
    liveHorizontalGroup=bindings(pipelines[7],[[0,uniforms],[2,buffers.surfaces],[3,buffers.liveFlux],[5,buffers.cellSurface],[8,buffers.rows]]);
    liveResolveGroup=bindings(pipelines[8],[[0,uniforms],[2,buffers.surfaces],[4,buffers.liveField],[5,buffers.cellSurface],[8,buffers.rows]]);
    flatResolveGroup=bindings(pipelines[8],[[0,uniforms],[2,buffers.surfaces],[4,buffers.flatField],[5,buffers.cellSurface],[8,buffers.rows]]);
    composeGroup=bindings(pipelines[11],[[0,uniforms],[2,buffers.surfaces],[3,buffers.irradiance0],[4,buffers.fine0],[5,buffers.liveField],[6,buffers.bounce0],[7,buffers.combined],[8,buffers.cellSurface]]);
    restrictGroup=bindings(pipelines[14],[[0,uniforms],[2,buffers.surfaces],[3,buffers.probeSurface],[10,buffers.liveField],[11,buffers.flatField],[12,buffers.cellSurface],[13,buffers.patchDelta]]);
    bakeGroup=bindings(pipelines[9],[[0,uniforms],[1,buffers.geometry],[2,buffers.surfaces],[3,buffers.probeSurface],[4,buffers.links],[14,buffers.linkCounts]]);
    propagateGroups=[0,1].map(i=>bindings(pipelines[10],[[0,uniforms],[3,buffers.probeSurface],[4,buffers.links],[5,buffers.patchDelta],[6,buffers[`bounce${i}`]],[7,buffers[`bounce${1-i}`]],[14,buffers.linkCounts]]));

  }
  function rebuild() {
    for (const b of Object.values(buffers)) b.destroy();
    const scene = level.scene(config);
    if (sceneShaderPrelude(scene) !== prelude) throw new Error("The level changed its water, aperture plane or floor receiver after load.");
    geometry = packScene(scene, lab.gridScale);
    simulation.reset(config,geometry);
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
    for(let i=0;i<1;i++) buffers[`irradiance${i}`] = device.createBuffer({
      label: "progressive world-space irradiance",
      size: geometry.totalCells * 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    for(let i=0;i<1;i++)buffers[`fine${i}`]=device.createBuffer({size:geometry.totalCells*16,usage:GPUBufferUsage.STORAGE});
    buffers.rows=device.createBuffer({size:geometry.totalCells*48,usage:GPUBufferUsage.STORAGE});
    buffers.sky=device.createBuffer({size:geometry.totalCells*16,usage:GPUBufferUsage.STORAGE});
    buffers.combined=device.createBuffer({size:geometry.totalCells*16,usage:GPUBufferUsage.STORAGE});
    buffers.liveFlux=device.createBuffer({size:geometry.totalCells*16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
    buffers.liveField=device.createBuffer({size:geometry.totalCells*16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
    buffers.flatField=device.createBuffer({size:geometry.totalCells*16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
    buffers.probeSurface=buffer("diffuse probe surfaces",geometry.probeSurfaces);
    buffers.linkCounts=device.createBuffer({size:geometry.probeCount*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
    buffers.patchDelta=device.createBuffer({size:geometry.probeCount*16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
    buffers.links=device.createBuffer({size:geometry.probeCount*256*16*(lab.diffuseDirections/128),usage:GPUBufferUsage.STORAGE});
    for(let i=0;i<2;i++)buffers[`bounce${i}`]=device.createBuffer({size:geometry.probeCount*16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
    if(air)buffers.air=device.createBuffer({label:"air light grid",size:air.count*16,usage:GPUBufferUsage.STORAGE});
    sceneBatches = 0;
    history = 0;
    if (imageBuffer) regroup();
  }
  function resize(w, h, scale = 1) {
    width = Math.max(256, Math.round((w * scale) / 8) * 8);
    height = Math.max(192, Math.round((h * scale) / 8) * 8);
    if(canvas.width!==Math.round(w))canvas.width = Math.round(w);
    if(canvas.height!==Math.round(h))canvas.height = Math.round(h);
    if (imageBuffer) imageBuffer.destroy();
    imageBuffer = device.createBuffer({
      label: "camera radiance accumulation",
      size: width * height * 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    for(const b of [reflectionBuffer,reflectionGuideBuffer,reflectionRowsBuffer])if(b)b.destroy();
    const reflectionStorage=()=>device.createBuffer({size:width*height*16,usage:GPUBufferUsage.STORAGE});
    reflectionBuffer=reflectionStorage();reflectionGuideBuffer=reflectionStorage();reflectionRowsBuffer=reflectionStorage();
    history = 0;
    regroup();
  }
  rebuild();
  resize(1512, 982, 0.63);
  let autoStatic=false;
  function configure(patch) {
    if(patch.wakes?.length)throw Error('Analytic wake lists are obsolete: replay physical pressure sources in time order.');
    wakes=[];
    const wasWidth = config.apertureWidth,
      wasDepth = config.apertureDepth;
    Object.assign(config, patch);
    autoStatic=false;quality=0;lastRenderTime=null;liveFrames=0;
    config.sunGrid=Math.max(128,Math.min(768,Math.round(config.sunGrid/8)*8));
    config.diffuseIterations=Math.max(2,Math.min(8,Math.round(config.diffuseIterations/2)*2));
    config.lightBatches=Math.max(16,Math.min(256,Math.round(config.lightBatches)));
    config.photonCount=Math.max(32768,Math.min(262144,Math.round(config.photonCount/512)*512));
    config.waterLevel = Math.max(0.12, Math.min(1.05, config.waterLevel));
    config.waveAmplitude = Math.max(
      0.001,
      Math.min(0.14, config.waveAmplitude),
    );
    const clampTo = (v, [lo, hi]) => Math.max(lo, Math.min(hi, v));
    config.apertureWidth = clampTo(config.apertureWidth, level.limits.apertureWidth);
    config.apertureDepth = clampTo(config.apertureDepth, level.limits.apertureDepth);
    if (wasWidth !== config.apertureWidth || wasDepth !== config.apertureDepth)
      rebuild();
    simulation.reset(config,geometry);
    sceneBatches = 0;
    history = 0;
  }
  async function setLab(value){
    const next=normalizeLab(value);if(JSON.stringify(next)===JSON.stringify(lab))return;
    const old=lab;lab=next;
    try{const compiled=await compileLab();await device.queue.onSubmittedWorkDone();pipelines=compiled;config.photonCount=lab.photonCount;rebuild();quality=0;lastRenderTime=null;liveFrames=0;wakes=[];}
    catch(e){lab=old;throw e;}
  }
  async function render(view, time, moving, sun = 1) {
    if (activeJobs > 1) return false;
    activeJobs++;
    try {
      const dt=lastRenderTime===null?0:Math.max(0,Math.min(.05,time-lastRenderTime));lastRenderTime=time;
      quality=Math.max(0,Math.min(1,quality+(moving?-dt/.35:dt/.8)));
      const costStart=performance.now();
      elapsed = time;
      simulation.advance(time);
      if(config.profile)await device.queue.onSubmittedWorkDone();
      const simulationDone=performance.now();
      // Camera motion never selects a stochastic mode or pauses water.
      autoStatic=true;
      const staticExposure=true;
      frame++;
      history++;
      const data = new ArrayBuffer(416),
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
      const wakeEnvelope=.34; // conservative simulated-height root bracket, not a clamp
      f.set(
        [
          lastWaveTime,
          config.waterLevel,
          config.waveAmplitude,
          config.exposure,
        ],
        20,
      );
      for(let i=0;i<wakes.length;i++){const w=wakes[i];f.set([w.x,w.z,w.time+config.waveTime,w.amplitude],52+i*4);}
      if(body)f.set([body.x,body.z,.19,1.05],100);
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
      f.set([wakeEnvelope,config.reflectionCone,quality*quality*(3-2*quality),config.reflectionFilter],44);
      u.set([config.photonCount,0,1,0],40);
      u.set([config.sunGrid,config.skyGridX,config.skyGridY,geometry.probeCount],48);
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
        // Build the mean-water diffuse background once; no temporal light slots.
        f[20]=phase;u[30]=batch;u[38]=batch;u[41]=0;f[33]=1/batch;f[34]=1;
        device.queue.writeBuffer(uniforms,0,data);
        const enc=device.createCommandEncoder();if(batch===1)enc.clearBuffer(buffers.flux);
        enc.clearBuffer(counters);enc.clearBuffer(pathAudit);
        let p=enc.beginComputePass();p.setPipeline(pipelines[0]);p.setBindGroup(0,groups[0]);p.dispatchWorkgroups(config.photonCount/64);p.end();
        if(batch===lightBatches() || batch===128){p=enc.beginComputePass();p.setPipeline(pipelines[5]);p.setBindGroup(0,horizontalGroup);p.dispatchWorkgroups(Math.ceil(geometry.totalCells/128));p.end();p=enc.beginComputePass();p.setPipeline(pipelines[1]);p.setBindGroup(0,resolveGroups[slot]);p.dispatchWorkgroups(Math.ceil(geometry.totalCells/128));p.end();}
        device.queue.submit([enc.finish()]);sceneBatches++;lastPhotonTime=phase;
      };
      const compute=(enc,pipeline,group,count,workgroup=128)=>{const pass=enc.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil(count/workgroup));pass.end();};
      if(sceneBatches===0){
        const skyEncoder=device.createCommandEncoder();compute(skyEncoder,pipelines[4],skyGroup,geometry.totalCells,lab.gridScale>1?128:64);
        if(air)compute(skyEncoder,pipelines[15],bindings(pipelines[15],[[0,uniforms],[1,buffers.geometry],[3,buffers.air]]),air.count,64);
        device.queue.submit([skyEncoder.finish()]);
        const baseBudget=config.freeze?lightBatches():128;
        for(let b=1;b<=baseBudget;b++)photonBatch(0,lastWaveTime,b);
        const bakeEncoder=device.createCommandEncoder();compute(bakeEncoder,pipelines[9],bakeGroup,geometry.probeCount,64);device.queue.submit([bakeEncoder.finish()]);
        const activeWakes=f.slice(52);f.fill(0,52);
        // Keep identical emission quadrature; only flatten the water geometry.
        u[43]=1;device.queue.writeBuffer(uniforms,0,data);
        const flatEncoder=device.createCommandEncoder();flatEncoder.clearBuffer(buffers.liveFlux);flatEncoder.clearBuffer(counters);flatEncoder.clearBuffer(pathAudit);
        if(lab.waterMode!=="off"){compute(flatEncoder,pipelines[6],liveEmitGroup,Math.max(config.sunGrid**2,config.skyGridX*config.skyGridY),64);
        compute(flatEncoder,pipelines[7],liveHorizontalGroup,geometry.totalCells);compute(flatEncoder,pipelines[8],flatResolveGroup,geometry.totalCells);
        }device.queue.submit([flatEncoder.finish()]);u[43]=0;f.set(activeWakes,52);
      }
      // No keyframes. Every water-light buffer is replaced at this frame's exact
      // phase before camera rays are submitted. The static field carries the mean-water diffuse solution.
      f[20]=lastWaveTime;u[30]=sceneBatches;u[38]=sceneBatches;u[41]=1;f[34]=1;
      f.set([wakeEnvelope,config.reflectionCone,quality*quality*(3-2*quality),config.reflectionFilter],44);
      device.queue.writeBuffer(uniforms,0,data);
      const waterEncoder=device.createCommandEncoder();waterEncoder.clearBuffer(buffers.liveFlux);waterEncoder.clearBuffer(counters);waterEncoder.clearBuffer(pathAudit);
      if(lab.waterMode!=="off"){compute(waterEncoder,pipelines[6],liveEmitGroup,Math.max(config.sunGrid**2,config.skyGridX*config.skyGridY),64);
      compute(waterEncoder,pipelines[7],liveHorizontalGroup,geometry.totalCells);
      compute(waterEncoder,pipelines[8],liveResolveGroup,geometry.totalCells);
      compute(waterEncoder,pipelines[14],restrictGroup,geometry.probeCount,64);
      waterEncoder.clearBuffer(buffers.bounce0);
      for(let i=0;i<config.diffuseIterations;i++)compute(waterEncoder,pipelines[10],propagateGroups[i%2],geometry.probeCount*32);
      }
      compute(waterEncoder,pipelines[11],composeGroup,geometry.totalCells);
      device.queue.submit([waterEncoder.finish()]);liveTime=lastWaveTime;lastPhotonTime=lastWaveTime;liveFrames++;
      if(config.profile)await device.queue.onSubmittedWorkDone();
      const lightingDone=performance.now();
      f[34]=sun;
      device.queue.writeBuffer(uniforms,0,data);
      const encoder=device.createCommandEncoder();
      let pass;
      pass = encoder.beginComputePass();
      pass.setPipeline(pipelines[2]);
      pass.setBindGroup(0, groups[2]);
      pass.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8));
      pass.end();
      compute(encoder,pipelines[12],reflectionHorizontalGroup,width*height);
      compute(encoder,pipelines[13],reflectionVerticalGroup,width*height);
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
      if(config.profile)frameCost={simulation:simulationDone-costStart,lighting:lightingDone-simulationDone,camera:performance.now()-lightingDone};
      return true;
    } finally {
      activeJobs--;
    }
  }
  async function audit(options={}) {
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
    let floor=null;
    if(options.floor){
      // Read the actual transported irradiance, before materials, refraction
      // and tone mapping. Diagnostics only; never used to draw the image.
      const su=new Uint32Array(geometry.surfaces),sf=new Float32Array(geometry.surfaces);
      const sid=geometry.floorSid,o=sid*16,offset=su[o],nx=su[o+1],ny=su[o+2],size=nx*ny*16,chart=sf.slice(o+8,o+12);
      const readFloor=device.createBuffer({size,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
      const encFloor=device.createCommandEncoder();encFloor.copyBufferToBuffer(buffers.liveField,offset*16,readFloor,0,size);device.queue.submit([encFloor.finish()]);await readFloor.mapAsync(GPUMapMode.READ);
      const values=new Float32Array(readFloor.getMappedRange());let sum=[0,0,0],peak=0,positive=0;const roi=[];
      for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
        const i=(y*nx+x)*4,rgb=Array.from(values.subarray(i,i+3));for(let c=0;c<3;c++)sum[c]+=rgb[c]*sf[o+6];peak=Math.max(peak,values[i+3]);if(values[i+3]>0)positive++;
        const px=chart[0]+(x+.5)*(chart[2]-chart[0])/nx,pz=chart[1]+(y+.5)*(chart[3]-chart[1])/ny;if(px>=2&&px<4&&pz>=-1.5&&pz<.5)roi.push(...rgb);
      }
      floor={sid,dimensions:[nx,ny],cellArea:sf[o+6],integratedRGB:sum,peak,positive,roi:{bounds:[2,4,-1.5,.5],rgb:roi}};readFloor.unmap();readFloor.destroy();
    }
    const receivers={};
    for(const sid of options.receivers||[]){
      const u=new Uint32Array(geometry.surfaces),o=sid*16,nx=u[o+1],ny=u[o+2],size=nx*ny*16;
      const rb=device.createBuffer({size,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});const e=device.createCommandEncoder();e.copyBufferToBuffer(buffers.liveField,u[o]*16,rb,0,size);device.queue.submit([e.finish()]);await rb.mapAsync(GPUMapMode.READ);receivers[sid]={nx,ny,irradiance:Array.from(new Float32Array(rb.getMappedRange()))};rb.unmap();rb.destroy();
    }
    return {
      simulation: options.simulation ? await simulation.audit() : simulation.info,
      receivers,
      floor,
      paths,
      emitted: numbers[0],
      waterIntersections: numbers[1],
      indirectDeposits: numbers[2],
      waterCausticDeposits: numbers[3],
      aboveWaterCausticDeposits: numbers[4],
      config: { ...config,wakes:wakes.map(w=>({...w,time:w.time+config.waveTime})) },
      waveTime: lastPhotonTime,
      cameraWaveTime: lastWaveTime,
      waterLight:{enabled:lab.waterMode!=="off",transport:lab.waterMode,time:liveTime,frames:liveFrames,keyframes:false},
      batches: sceneBatches,
      baseEmittedSinceReset: sceneBatches * config.photonCount,
      livePacketsPerFrame: lab.waterMode==="off"?0:config.sunGrid**2*2+config.skyGridX*config.skyGridY*(lab.waterMode==="full"?68:4),
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
    async destroy() {
      await device.queue.onSubmittedWorkDone();
      context.unconfigure();
      device.destroy();
    },
    render,
    setBody(p){body=p?{...p}:null;simulation.setBody(body);},
    addWake(w){simulation.addWake(w);wakes.push(w);wakes=wakes.slice(-12);},
    get wakes(){return wakes.map(w=>({...w}));},
    configure,
    setLab,
    get lab(){return {...lab};},
    resize,
    audit,
    get solids() {
      return geometry.solids;
    },
    get bounds() {
      return { ...geometry.bounds };
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
    get dynamics() {return {simulation:simulation.info,frameCost,baseBatches:sceneBatches,quality:quality*quality*(3-2*quality),gridCells:geometry.totalCells,probeCount:geometry.probeCount,skySamples:lab.skySamples,waveTime:lastWaveTime,causticTime:liveTime,diffuseTime:liveTime,lightFrames:liveFrames,lightKeyframes:false,sunPackets:lab.waterMode==="off"?0:config.sunGrid**2*2,skyPackets:lab.waterMode==="off"?0:config.skyGridX*config.skyGridY*(lab.waterMode==="full"?68:4),diffuseLinks:geometry.probeCount*2*lab.diffuseDirections,diffuseIterations:lab.waterMode==="off"?0:config.diffuseIterations};},
    get busy() {
      return activeJobs > 0;
    },
  };
}
