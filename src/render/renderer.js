import common from "./common.wgsl?raw";
import photonPorcelain from "../../materials/photon-porcelain.wgsl?raw";
import porcelain from "../../materials/porcelain.wgsl?raw";
import level from "../../levels/poolrooms.json";
import photons from "./photons.wgsl?raw";
import sky from "./sky.wgsl?raw";
import resolve from "./resolve.wgsl?raw";
import camera from "./camera.wgsl?raw";
import waterCaustics from "./water-caustics.wgsl?raw";
import composeLight from "./compose-light.wgsl?raw";
import diffuseTransfer from "./diffuse-transfer.wgsl?raw";
import reflectionFilter from "./reflection-filter.wgsl?raw";
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
    module("photon transport", common + photonPorcelain + photons),
    module("world irradiance estimate", common + resolve),
    module("camera transport", common + porcelain + camera),
    module("lens and film", present),
    module("area sky integral", common + sky),
    module("current water flux", common + waterCaustics),
    module("instant diffuse transfer", common + photonPorcelain + diffuseTransfer),
    module("assemble current lighting",common+composeLight),
    module("continuous reflection footprint",common+reflectionFilter),
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
    device.createComputePipelineAsync({label:"64-point area sky",layout:"auto",compute:{module:shaderModules[4],entryPoint:"integrateSky"}}),
    device.createComputePipelineAsync({label:"separable photon kernel",layout:"auto",compute:{module:shaderModules[1],entryPoint:"horizontal"}}),
    ...["emitWater","waterHorizontal","waterResolve"].map(entryPoint=>device.createComputePipelineAsync({label:entryPoint,layout:"auto",compute:{module:shaderModules[5],entryPoint}})),
    ...["bakeTransfer","propagate"].map(entryPoint=>device.createComputePipelineAsync({label:entryPoint,layout:"auto",compute:{module:shaderModules[6],entryPoint}})),
    device.createComputePipelineAsync({label:"compose current light",layout:"auto",compute:{module:shaderModules[7],entryPoint:"compose"}}),
    ...["horizontalReflection","verticalReflection"].map(entryPoint=>device.createComputePipelineAsync({label:entryPoint,layout:"auto",compute:{module:shaderModules[8],entryPoint}})),
  ]);
  const uniforms = device.createBuffer({
    label: "physical parameters",
    size: 208,
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
    photonCount: 49152,
    lightBatches: 32,
    sunGrid:384,skyGridX:128,skyGridY:256,diffuseIterations:4,
    ...level.optics,
    freeze: false,
    waveTime: 1.7,
    seed: 7819301,
    diagnostic: 0,
    focusDistance: 10,
    focalLength: 28,
    fNumber: 5.6,
    reflectionCone: .018,
    reflectionFilter:1,
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
  const lightBatches=()=>config.lightBatches;
  let lastPhotonTime=0,quality=0,lastRenderTime=null,frameCost=null;
  let composeGroup,reflectionHorizontalGroup,reflectionVerticalGroup;
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
        [5, pathAudit],
      ]),
      null,
      bindings(pipelines[2], [
        ...shared,
        [3,buffers.combined],[4,imageBuffer],[5,reflectionBuffer],[6,reflectionGuideBuffer],[8,buffers.sky],
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
    liveEmitGroup=bindings(pipelines[6],[[0,uniforms],[1,buffers.geometry],[2,buffers.surfaces],[3,buffers.liveFlux],[6,pathAudit],[7,counters]]);
    liveHorizontalGroup=bindings(pipelines[7],[[0,uniforms],[2,buffers.surfaces],[3,buffers.liveFlux],[5,buffers.cellSurface],[8,buffers.rows]]);
    liveResolveGroup=bindings(pipelines[8],[[0,uniforms],[2,buffers.surfaces],[4,buffers.liveField],[5,buffers.cellSurface],[8,buffers.rows]]);
    flatResolveGroup=bindings(pipelines[8],[[0,uniforms],[2,buffers.surfaces],[4,buffers.flatField],[5,buffers.cellSurface],[8,buffers.rows]]);
    composeGroup=bindings(pipelines[11],[[0,uniforms],[2,buffers.surfaces],[3,buffers.irradiance0],[4,buffers.fine0],[5,buffers.liveField],[6,buffers.bounce0],[7,buffers.combined],[8,buffers.cellSurface]]);
    bakeGroup=bindings(pipelines[9],[[0,uniforms],[1,buffers.geometry],[2,buffers.surfaces],[3,buffers.probeSurface],[4,buffers.links]]);
    propagateGroups=[0,1].map(i=>bindings(pipelines[10],[[0,uniforms],[3,buffers.probeSurface],[4,buffers.links],[5,buffers.liveField],[6,buffers[`bounce${i}`]],[7,buffers[`bounce${1-i}`]],[8,buffers.flatField]]));

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
    buffers.links=device.createBuffer({size:geometry.probeCount*64*32,usage:GPUBufferUsage.STORAGE});
    for(let i=0;i<2;i++)buffers[`bounce${i}`]=device.createBuffer({size:geometry.probeCount*16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
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
      const dt=lastRenderTime===null?0:Math.max(0,Math.min(.05,time-lastRenderTime));lastRenderTime=time;
      quality=Math.max(0,Math.min(1,quality+(moving?-dt/.35:dt/.8)));
      const costStart=performance.now();
      elapsed = time;
      // Camera motion never selects a stochastic mode or pauses water.
      autoStatic=true;
      const staticExposure=true;
      frame++;
      history++;
      const data = new ArrayBuffer(208),
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
        const skyEncoder=device.createCommandEncoder();compute(skyEncoder,pipelines[4],skyGroup,geometry.totalCells,64);device.queue.submit([skyEncoder.finish()]);
        const baseBudget=config.freeze?lightBatches():128;
        for(let b=1;b<=baseBudget;b++)photonBatch(0,lastWaveTime,b);
        const bakeEncoder=device.createCommandEncoder();compute(bakeEncoder,pipelines[9],bakeGroup,geometry.probeCount,64);device.queue.submit([bakeEncoder.finish()]);
        f[22]=0;device.queue.writeBuffer(uniforms,0,data);
        const flatEncoder=device.createCommandEncoder();flatEncoder.clearBuffer(buffers.liveFlux);flatEncoder.clearBuffer(counters);flatEncoder.clearBuffer(pathAudit);
        compute(flatEncoder,pipelines[6],liveEmitGroup,Math.max(config.sunGrid**2,config.skyGridX*config.skyGridY),64);
        compute(flatEncoder,pipelines[7],liveHorizontalGroup,geometry.totalCells);compute(flatEncoder,pipelines[8],flatResolveGroup,geometry.totalCells);
        device.queue.submit([flatEncoder.finish()]);f[22]=config.waveAmplitude;
      }
      // No keyframes. Every water-light buffer is replaced at this frame's exact
      // phase before camera rays are submitted. The static field carries the mean-water diffuse solution.
      f[20]=lastWaveTime;u[30]=sceneBatches;u[38]=sceneBatches;u[41]=1;f[34]=1;
      f.set([0,config.reflectionCone,quality*quality*(3-2*quality),config.reflectionFilter],44);
      device.queue.writeBuffer(uniforms,0,data);
      const waterEncoder=device.createCommandEncoder();waterEncoder.clearBuffer(buffers.liveFlux);waterEncoder.clearBuffer(counters);waterEncoder.clearBuffer(pathAudit);
      compute(waterEncoder,pipelines[6],liveEmitGroup,Math.max(config.sunGrid**2,config.skyGridX*config.skyGridY),64);
      compute(waterEncoder,pipelines[7],liveHorizontalGroup,geometry.totalCells);
      compute(waterEncoder,pipelines[8],liveResolveGroup,geometry.totalCells);
      waterEncoder.clearBuffer(buffers.bounce0);
      for(let i=0;i<config.diffuseIterations;i++)compute(waterEncoder,pipelines[10],propagateGroups[i%2],geometry.probeCount);
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
      if(config.profile)frameCost={lighting:lightingDone-costStart,camera:performance.now()-lightingDone};
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
      const offset=su[24],nx=su[25],ny=su[26],size=nx*ny*16;
      const readFloor=device.createBuffer({size,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
      const encFloor=device.createCommandEncoder();encFloor.copyBufferToBuffer(buffers.liveField,offset*16,readFloor,0,size);device.queue.submit([encFloor.finish()]);await readFloor.mapAsync(GPUMapMode.READ);
      const values=new Float32Array(readFloor.getMappedRange());let sum=[0,0,0],peak=0,positive=0;const roi=[];
      for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
        const i=(y*nx+x)*4,rgb=Array.from(values.subarray(i,i+3));for(let c=0;c<3;c++)sum[c]+=rgb[c]*sf[30];peak=Math.max(peak,values[i+3]);if(values[i+3]>0)positive++;
        const px=-7+(x+.5)*14/nx,pz=-17+(y+.5)*27/ny;if(px>=2&&px<4&&pz>=-1.5&&pz<.5)roi.push(...rgb);
      }
      floor={sid:3,dimensions:[nx,ny],cellArea:sf[30],integratedRGB:sum,peak,positive,roi:{bounds:[2,4,-1.5,.5],rgb:roi}};readFloor.unmap();readFloor.destroy();
    }
    return {
      floor,
      paths,
      emitted: numbers[0],
      waterIntersections: numbers[1],
      indirectDeposits: numbers[2],
      waterCausticDeposits: numbers[3],
      aboveWaterCausticDeposits: numbers[4],
      config: { ...config },
      waveTime: lastPhotonTime,
      cameraWaveTime: lastWaveTime,
      waterLight:{time:liveTime,frames:liveFrames,keyframes:false},
      batches: sceneBatches,
      baseEmittedSinceReset: sceneBatches * config.photonCount,
      livePacketsPerFrame: config.sunGrid**2+config.skyGridX*config.skyGridY*4,
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
    get dynamics() {return {frameCost,baseBatches:sceneBatches,quality:quality*quality*(3-2*quality),gridCells:geometry.totalCells,probeCount:geometry.probeCount,skySamples:64,waveTime:lastWaveTime,causticTime:liveTime,diffuseTime:liveTime,lightFrames:liveFrames,lightKeyframes:false,sunPackets:config.sunGrid**2,skyPackets:config.skyGridX*config.skyGridY*4,diffuseLinks:geometry.probeCount*64,diffuseIterations:config.diffuseIterations};},
    get busy() {
      return activeJobs > 0;
    },
  };
}
