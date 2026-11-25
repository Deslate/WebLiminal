// WebLiminal WebGPU 3D Engine Renderer.
// Pure framework core: knows zero levels or materials by name.
// Pipeline:
//   On load:  1) Procedural PBR Texture Synthesis + Toksvig Mipmaps
//             2) Lightmap UV2 G-Buffer Rasterization + Gutter Dilation
//             3) Initial BVH Path-Traced Directional GI Bake + Bilateral Denoise
//   Per frame:4) Optional Background Progressive GI Refinement
//             5) Hardware-Rasterized Sky + PBR + POM + Directional Lightmap
//             6) Half-Res Screen-Space Reflections + Roughness-Aware Composite
//             7) Optional Interactive Wave Simulation + Refracted Water & Live Caustics
//             8) Half-Res BVH Volumetric Sunbeams & Area-Light Haze
//             9) Bloom + Atmospheric Fog + AgX Filmic Tone Mapping + Present

import bakeTexturesWGSL from "./shaders/bake-textures.wgsl?raw";
import mipmapWGSL from "./shaders/mipmap.wgsl?raw";
import bakeGBufferWGSL from "./shaders/bake-gbuffer.wgsl?raw";
import bvhCommonWGSL from "./shaders/bvh-common.wgsl?raw";
import bakeLightmapWGSL from "./shaders/bake-lightmap.wgsl?raw";
import denoiseLightmapWGSL from "./shaders/denoise-lightmap.wgsl?raw";
import gbufferPbrWGSL from "./shaders/gbuffer-pbr.wgsl?raw";
import ssrWGSL from "./shaders/ssr.wgsl?raw";
import volumetricWGSL from "./shaders/volumetric.wgsl?raw";
import postprocessWGSL from "./shaders/postprocess.wgsl?raw";
import referencePtWGSL from "./shaders/reference-pt.wgsl?raw";
import { createWaterModule } from "./water.js";

function normalize3(v) {
  const l = Math.hypot(v[0], v[1], v[2]);
  return l > 1e-8 ? [v[0] / l, v[1] / l, v[2] / l] : [0, 1, 0];
}

// Builds column-major View-Projection matrix for WebGPU right-handed NDC (z in [0, 1]).
function buildViewProj(view, aspect, fovDeg = 68) {
  const sy = Math.sin(view.yaw);
  const cy = Math.cos(view.yaw);
  const sp = Math.sin(view.pitch);
  const cp = Math.cos(view.pitch);

  const rx = cy, ry = 0, rz = -sy;
  const fx = -sy * cp, fy = sp, fz = -cy * cp;
  const ux = ry * fz - rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy - ry * fx;

  const ex = view.x, ey = view.y, ez = view.z;
  const near = 0.06;
  const far = 140.0;
  const f = 1.0 / Math.tan((fovDeg * Math.PI) / 360);
  const a = f / aspect;
  const nf = far / (near - far);
  const p32 = (far * near) / (near - far);

  // V row-dots:
  // row 0: right
  // row 1: up
  // row 2: -forward
  const bx = -fx, by = -fy, bz = -fz;
  const tx = -(rx * ex + ry * ey + rz * ez);
  const ty = -(ux * ex + uy * ey + uz * ez);
  const tz = -(bx * ex + by * ey + bz * ez);

  // P * V in column-major order
  const m = new Float32Array(16);
  m[0] = a * rx;  m[1] = f * ux;  m[2] = nf * bx;       m[3] = -bx;
  m[4] = a * ry;  m[5] = f * uy;  m[6] = nf * by;       m[7] = -by;
  m[8] = a * rz;  m[9] = f * uz;  m[10] = nf * bz;      m[11] = -bz;
  m[12] = a * tx; m[13] = f * ty; m[14] = nf * tz + p32; m[15] = -tz;
  return m;
}

function invertMat4(m) {
  const inv = new Float32Array(16);
  const m00 = m[0], m01 = m[1], m02 = m[2], m03 = m[3];
  const m10 = m[4], m11 = m[5], m12 = m[6], m13 = m[7];
  const m20 = m[8], m21 = m[9], m22 = m[10], m23 = m[11];
  const m30 = m[12], m31 = m[13], m32 = m[14], m33 = m[15];

  const b00 = m00 * m11 - m01 * m10;
  const b01 = m00 * m12 - m02 * m10;
  const b02 = m00 * m13 - m03 * m10;
  const b03 = m01 * m12 - m02 * m11;
  const b04 = m01 * m13 - m03 * m11;
  const b05 = m02 * m13 - m03 * m12;
  const b06 = m20 * m31 - m21 * m30;
  const b07 = m20 * m32 - m22 * m30;
  const b08 = m20 * m33 - m23 * m30;
  const b09 = m21 * m32 - m22 * m31;
  const b10 = m21 * m33 - m23 * m31;
  const b11 = m22 * m33 - m23 * m32;

  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (Math.abs(det) < 1e-12) return inv;
  det = 1.0 / det;

  inv[0] = (m11 * b11 - m12 * b10 + m13 * b09) * det;
  inv[1] = (m02 * b10 - m01 * b11 - m03 * b09) * det;
  inv[2] = (m31 * b05 - m32 * b04 + m33 * b03) * det;
  inv[3] = (m22 * b04 - m21 * b05 - m23 * b03) * det;
  inv[4] = (m12 * b08 - m10 * b11 - m13 * b07) * det;
  inv[5] = (m00 * b11 - m02 * b08 + m03 * b07) * det;
  inv[6] = (m32 * b02 - m30 * b05 - m33 * b01) * det;
  inv[7] = (m20 * b05 - m22 * b02 + m23 * b01) * det;
  inv[8] = (m10 * b10 - m11 * b08 + m13 * b06) * det;
  inv[9] = (m01 * b08 - m00 * b10 - m03 * b06) * det;
  inv[10] = (m30 * b04 - m31 * b02 + m33 * b00) * det;
  inv[11] = (m21 * b02 - m20 * b04 - m23 * b00) * det;
  inv[12] = (m11 * b07 - m10 * b09 - m12 * b06) * det;
  inv[13] = (m00 * b09 - m01 * b07 + m02 * b06) * det;
  inv[14] = (m31 * b01 - m30 * b03 - m32 * b00) * det;
  inv[15] = (m20 * b03 - m21 * b01 + m22 * b00) * det;
  return inv;
}

export async function createRenderer(canvas, options = {}) {
  if (!navigator.gpu) {
    throw new Error("WebGPU is required. Please open in a WebGPU-enabled browser.");
  }
  let adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) {
    adapter = await navigator.gpu.requestAdapter({ forceFallbackAdapter: true });
  }
  if (!adapter) {
    throw new Error("No WebGPU adapter is available on this device.");
  }

  const adapterInfo = adapter.info ?? {};
  const isSoftware =
    Boolean(adapterInfo.isFallbackAdapter) ||
    /swiftshader|llvmpipe|software/i.test(
      `${adapterInfo.vendor ?? ""} ${adapterInfo.architecture ?? ""} ${adapterInfo.device ?? ""} ${adapterInfo.description ?? ""}`,
    );

  const device = await adapter.requestDevice({
    requiredLimits: {
      maxStorageBufferBindingSize: Math.min(adapter.limits.maxStorageBufferBindingSize, 512 * 1024 * 1024),
      maxBufferSize: Math.min(adapter.limits.maxBufferSize, 512 * 1024 * 1024),
    },
  });

  const errors = [];
  device.addEventListener("uncapturederror", (e) => {
    const msg = e.error?.message || String(e.error);
    errors.push(msg);
    console.error("[WebLiminal GPU]", msg);
  });
  device.lost.then((info) => {
    const msg = `GPU device lost (${info.reason}): ${info.message}`;
    errors.push(msg);
    console.error("[WebLiminal GPU]", msg);
  });

  const context = canvas.getContext("webgpu");
  const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format: canvasFormat, alphaMode: "opaque" });

  // Compile all engine shaders once — zero shader recompilation when switching maps!
  async function compileShader(label, code) {
    const mod = device.createShaderModule({ label, code });
    const info = await mod.getCompilationInfo();
    for (const msg of info.messages) {
      if (msg.type === "error") {
        throw new Error(`WGSL [${label}] line ${msg.lineNum}: ${msg.message}`);
      }
    }
    return mod;
  }

  const [
    bakeTexMod,
    mipMod,
    bakeGBufMod,
    bakeLmMod,
    denoiseLmMod,
    pbrMod,
    ssrMod,
    volMod,
    postMod,
  ] = await Promise.all([
    compileShader("bake-textures", bakeTexturesWGSL),
    compileShader("mipmap", mipmapWGSL),
    compileShader("bake-gbuffer", bakeGBufferWGSL),
    compileShader("bake-lightmap", bvhCommonWGSL + "\n" + bakeLightmapWGSL),
    compileShader("denoise-lightmap", denoiseLightmapWGSL),
    compileShader("gbuffer-pbr", bvhCommonWGSL + "\n" + gbufferPbrWGSL),
    compileShader("ssr", bvhCommonWGSL + "\n" + ssrWGSL),
    compileShader("volumetric", bvhCommonWGSL + "\n" + volumetricWGSL),
    compileShader("postprocess", postprocessWGSL),
  ]);

  const vertexBufferLayout = [
    {
      arrayStride: 64,
      attributes: [
        { shaderLocation: 0, offset: 0, format: "float32x3" },  // pos
        { shaderLocation: 1, offset: 12, format: "uint32" },    // matId
        { shaderLocation: 2, offset: 16, format: "float32x3" }, // normal
        { shaderLocation: 3, offset: 32, format: "float32x4" }, // tangent
        { shaderLocation: 4, offset: 48, format: "float32x2" }, // uv
        { shaderLocation: 5, offset: 56, format: "float32x2" }, // uv2
      ],
    },
  ];

  const [
    bakeTexPipe,
    mipPipe,
    bakeGBufRenderPipe,
    dilateGBufPipe,
    bakeLmPipe,
    resolveLmPipe,
    bilateralLmPipe,
    dilateLmPipe,
    skyPipe,
    pbrPipe,
    ssrTracePipe,
    ssrFilterHPipe,
    ssrFilterVPipe,
    ssrCompPipe,
    volMarchPipe,
    volBlurPipe,
    bloomExtractPipe,
    bloomHVPipesH,
    bloomHVPipesV,
    presentPipe,
  ] = await Promise.all([
    device.createComputePipelineAsync({ label: "bake-tex", layout: "auto", compute: { module: bakeTexMod, entryPoint: "main" } }),
    device.createComputePipelineAsync({ label: "mipmap", layout: "auto", compute: { module: mipMod, entryPoint: "main" } }),
    device.createRenderPipelineAsync({
      label: "bake-gbuf-raster",
      layout: "auto",
      vertex: { module: bakeGBufMod, entryPoint: "vs", buffers: vertexBufferLayout },
      fragment: {
        module: bakeGBufMod,
        entryPoint: "fs",
        targets: [{ format: "rgba32float" }, { format: "rgba16float" }],
      },
      primitive: { topology: "triangle-list", cullMode: "none" },
    }),
    device.createComputePipelineAsync({ label: "dilate-gbuf", layout: "auto", compute: { module: bakeGBufMod, entryPoint: "dilateGBuffer" } }),
    device.createComputePipelineAsync({ label: "bake-lm", layout: "auto", compute: { module: bakeLmMod, entryPoint: "main" } }),
    device.createComputePipelineAsync({ label: "resolve-lm", layout: "auto", compute: { module: denoiseLmMod, entryPoint: "resolveRaw" } }),
    device.createComputePipelineAsync({ label: "bilateral-lm", layout: "auto", compute: { module: denoiseLmMod, entryPoint: "bilateralPass" } }),
    device.createComputePipelineAsync({ label: "dilate-lm", layout: "auto", compute: { module: denoiseLmMod, entryPoint: "dilateFinal" } }),
    device.createRenderPipelineAsync({
      label: "sky-backdrop",
      layout: "auto",
      vertex: { module: pbrMod, entryPoint: "vsSky" },
      fragment: {
        module: pbrMod,
        entryPoint: "fsSky",
        targets: [{ format: "rgba16float" }, { format: "rgba16float" }, { format: "rgba8unorm" }, { format: "rgba16float" }],
      },
      depthStencil: { format: "depth32float", depthWriteEnabled: false, depthCompare: "always" },
      primitive: { topology: "triangle-list" },
    }),
    device.createRenderPipelineAsync({
      label: "pbr-scene",
      layout: "auto",
      vertex: { module: pbrMod, entryPoint: "vsMain", buffers: vertexBufferLayout },
      fragment: {
        module: pbrMod,
        entryPoint: "fsMain",
        targets: [{ format: "rgba16float" }, { format: "rgba16float" }, { format: "rgba8unorm" }, { format: "rgba16float" }],
      },
      depthStencil: { format: "depth32float", depthWriteEnabled: true, depthCompare: "less" },
      primitive: { topology: "triangle-list", frontFace: "ccw", cullMode: "back" },
    }),
    device.createComputePipelineAsync({ label: "ssr-trace", layout: "auto", compute: { module: ssrMod, entryPoint: "traceSSR" } }),
    device.createComputePipelineAsync({ label: "ssr-filter-h", layout: "auto", compute: { module: ssrMod, entryPoint: "filterSSRH" } }),
    device.createComputePipelineAsync({ label: "ssr-filter-v", layout: "auto", compute: { module: ssrMod, entryPoint: "filterSSRV" } }),
    device.createComputePipelineAsync({ label: "ssr-comp", layout: "auto", compute: { module: ssrMod, entryPoint: "compositeSSR" } }),
    device.createComputePipelineAsync({ label: "vol-march", layout: "auto", compute: { module: volMod, entryPoint: "marchVolumetric" } }),
    device.createComputePipelineAsync({ label: "vol-blur", layout: "auto", compute: { module: volMod, entryPoint: "blurVolumetric" } }),
    device.createComputePipelineAsync({ label: "bloom-extract", layout: "auto", compute: { module: postMod, entryPoint: "bloomExtract" } }),
    device.createComputePipelineAsync({ label: "bloom-h", layout: "auto", compute: { module: postMod, entryPoint: "bloomBlurH" } }),
    device.createComputePipelineAsync({ label: "bloom-v", layout: "auto", compute: { module: postMod, entryPoint: "bloomBlurV" } }),
    device.createRenderPipelineAsync({
      label: "present",
      layout: "auto",
      vertex: { module: postMod, entryPoint: "vsPresent" },
      fragment: { module: postMod, entryPoint: "fsPresent", targets: [{ format: canvasFormat }] },
      primitive: { topology: "triangle-list" },
    }),
  ]);

  const texSampler = device.createSampler({
    addressModeU: "repeat",
    addressModeV: "repeat",
    magFilter: "linear",
    minFilter: "linear",
    mipmapFilter: "linear",
    maxAnisotropy: 8,
  });
  const linSampler = device.createSampler({
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
    magFilter: "linear",
    minFilter: "linear",
  });

  const frameUniformBuf = device.createBuffer({
    label: "frame uniform",
    size: 272,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const envUniformBuf = device.createBuffer({
    label: "env uniform",
    size: 112,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const denoiseParamBufs = [1, 2, 4, 8].map((step) => {
    const b = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    return { step, buf: b };
  });
  const resolveParamBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

  const bloomExtractSamplerGroup = device.createBindGroup({
    layout: bloomExtractPipe.getBindGroupLayout(0),
    entries: [{ binding: 5, resource: linSampler }],
  });
  const bloomHSamplerGroup = device.createBindGroup({
    layout: bloomHVPipesH.getBindGroupLayout(0),
    entries: [{ binding: 5, resource: linSampler }],
  });
  const bloomVSamplerGroup = device.createBindGroup({
    layout: bloomHVPipesV.getBindGroupLayout(0),
    entries: [{ binding: 5, resource: linSampler }],
  });

  // Render settings adjustable at runtime via Inspector / API.
  const settings = {
    exposure: 1.0,
    fov: 68,
    debugView: 0, // 0 Final, 1 Lightmap GI, 2 Albedo, 3 Normals, 4 Rough/AO
    vhsMode: false,
    ssrEnabled: true,
    volumetricEnabled: true,
    bloomEnabled: true,
    targetSpp: options.targetSpp ?? (isSoftware ? 32 : 96),
    texSize: options.texSize ?? (isSoftware ? 256 : 512),
    atlasSize: options.atlasSize ?? (isSoftware ? 384 : 768),
  };

  let width = 960;
  let height = 540;
  let rt = null;
  let sceneRes = null;
  let activeAtmosphere = null;
  let bakeState = { bakedSpp: 0, targetSpp: settings.targetSpp, batchIndex: 0, textureMs: 0, initBakeMs: 0 };

  function destroyRenderTargets() {
    if (!rt) return;
    for (const k of [
      "hdrRaw",
      "hdrComposite",
      "hdrWaterSrc",
      "gNormalRough",
      "gAlbedoMetal",
      "sunDirect",
      "depth",
      "ssr",
      "volA",
      "volB",
      "bloomA",
      "bloomB",
    ]) {
      rt[k]?.destroy();
    }
    rt = null;
  }

  function destroySceneResources() {
    if (!sceneRes) return;
    sceneRes.water?.destroy();
    for (const k of [
      "vertexBuf",
      "indexBuf",
      "bvhNodeBuf",
      "bvhTriBuf",
      "materialBuf",
      "lightBuf",
      "lmPosBuf",
      "lmNormBuf",
      "accumIrradBuf",
      "accumDirBuf",
      "albedoRoughTex",
      "normalHeightTex",
      "metaTex",
      "lmIrradA",
      "lmIrradB",
      "lmDirA",
      "lmDirB",
    ]) {
      sceneRes[k]?.destroy();
    }
    sceneRes = null;
  }

  function createBufferWithData(label, data, usage) {
    const byteLen = Math.max(16, Math.ceil(data.byteLength / 4) * 4);
    const buf = device.createBuffer({ label, size: byteLen, usage: usage | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(buf, 0, data);
    return buf;
  }

  function rebuildFrameBindGroups() {
    if (!rt || !sceneRes) return;

    rt.skyGroup = device.createBindGroup({
      layout: skyPipe.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: frameUniformBuf } }],
    });

    rt.pbrGroup = device.createBindGroup({
      layout: pbrPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: frameUniformBuf } },
        { binding: 1, resource: { buffer: sceneRes.materialBuf } },
        { binding: 2, resource: { buffer: sceneRes.lightBuf } },
        { binding: 3, resource: texSampler },
        { binding: 4, resource: linSampler },
        { binding: 5, resource: sceneRes.albedoRoughView },
        { binding: 6, resource: sceneRes.normalHeightView },
        { binding: 7, resource: sceneRes.metaView },
        { binding: 8, resource: sceneRes.lmIrradFinalView },
        { binding: 9, resource: sceneRes.lmDirFinalView },
        { binding: 10, resource: { buffer: sceneRes.bvhNodeBuf } },
        { binding: 11, resource: { buffer: sceneRes.bvhTriBuf } },
      ],
    });

    rt.ssrTraceGroup = device.createBindGroup({
      layout: ssrTracePipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: frameUniformBuf } },
        { binding: 2, resource: rt.gNormalRoughView },
        { binding: 3, resource: rt.gAlbedoMetalView },
        { binding: 4, resource: rt.depthView },
        { binding: 5, resource: linSampler },
        { binding: 6, resource: rt.ssrView },
        { binding: 7, resource: { buffer: sceneRes.bvhNodeBuf } },
        { binding: 8, resource: { buffer: sceneRes.bvhTriBuf } },
        { binding: 9, resource: { buffer: sceneRes.materialBuf } },
        { binding: 10, resource: sceneRes.lmIrradFinalView },
        { binding: 11, resource: { buffer: sceneRes.lightBuf } },
      ],
    });

    rt.ssrFilterHGroup0 = device.createBindGroup({
      layout: ssrFilterHPipe.getBindGroupLayout(0),
      entries: [
        { binding: 2, resource: rt.gNormalRoughView },
        { binding: 3, resource: rt.gAlbedoMetalView },
        { binding: 4, resource: rt.depthView },
        { binding: 6, resource: rt.ssrBView },
      ],
    });
    rt.ssrFilterHGroup1 = device.createBindGroup({
      layout: ssrFilterHPipe.getBindGroupLayout(1),
      entries: [{ binding: 0, resource: rt.ssrView }],
    });

    rt.ssrFilterVGroup0 = device.createBindGroup({
      layout: ssrFilterVPipe.getBindGroupLayout(0),
      entries: [
        { binding: 2, resource: rt.gNormalRoughView },
        { binding: 3, resource: rt.gAlbedoMetalView },
        { binding: 4, resource: rt.depthView },
        { binding: 6, resource: rt.ssrView },
      ],
    });
    rt.ssrFilterVGroup1 = device.createBindGroup({
      layout: ssrFilterVPipe.getBindGroupLayout(1),
      entries: [{ binding: 0, resource: rt.ssrBView }],
    });

    rt.ssrCompGroup0 = device.createBindGroup({
      layout: ssrCompPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: frameUniformBuf } },
        { binding: 1, resource: rt.hdrRawView },
        { binding: 2, resource: rt.gNormalRoughView },
        { binding: 3, resource: rt.gAlbedoMetalView },
        { binding: 4, resource: rt.depthView },
        { binding: 7, resource: { buffer: sceneRes.bvhNodeBuf } },
        { binding: 8, resource: { buffer: sceneRes.bvhTriBuf } },
        { binding: 9, resource: { buffer: sceneRes.materialBuf } },
      ],
    });
    rt.ssrCompGroup1 = device.createBindGroup({
      layout: ssrCompPipe.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: rt.ssrView },
        { binding: 1, resource: rt.hdrCompositeView },
        { binding: 2, resource: rt.sunDirectView },
      ],
    });

    if (sceneRes.water) {
      sceneRes.water.bindSceneTextures(rt.depthView);
    }

    rt.volMarchGroup = device.createBindGroup({
      layout: volMarchPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: frameUniformBuf } },
        { binding: 1, resource: { buffer: sceneRes.bvhNodeBuf } },
        { binding: 2, resource: { buffer: sceneRes.bvhTriBuf } },
        { binding: 3, resource: { buffer: sceneRes.lightBuf } },
        { binding: 4, resource: rt.depthView },
        { binding: 5, resource: rt.volAView },
      ],
    });
    rt.volBlurGroup0 = device.createBindGroup({
      layout: volBlurPipe.getBindGroupLayout(0),
      entries: [{ binding: 5, resource: rt.volBView }],
    });
    rt.volBlurGroup1 = device.createBindGroup({
      layout: volBlurPipe.getBindGroupLayout(1),
      entries: [{ binding: 0, resource: rt.volAView }],
    });

    rt.bloomExtractGroup1 = device.createBindGroup({
      layout: bloomExtractPipe.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: rt.hdrCompositeView },
        { binding: 1, resource: rt.bloomAView },
      ],
    });
    rt.bloomHGroup1 = device.createBindGroup({
      layout: bloomHVPipesH.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: rt.bloomAView },
        { binding: 1, resource: rt.bloomBView },
      ],
    });
    rt.bloomVGroup1 = device.createBindGroup({
      layout: bloomHVPipesV.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: rt.bloomBView },
        { binding: 1, resource: rt.bloomAView },
      ],
    });

    rt.presentGroup = device.createBindGroup({
      layout: presentPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: frameUniformBuf } },
        { binding: 1, resource: rt.hdrCompositeView },
        { binding: 2, resource: rt.volBView },
        { binding: 3, resource: rt.bloomAView },
        { binding: 4, resource: rt.depthView },
        { binding: 5, resource: linSampler },
      ],
    });
  }

  function resize(cssW, cssH, dpr = Math.min(window.devicePixelRatio || 1, 2)) {
    const w = Math.max(64, Math.round(cssW * dpr));
    const h = Math.max(64, Math.round(cssH * dpr));
    if (rt && width === w && height === h) return;
    width = w;
    height = h;
    canvas.width = w;
    canvas.height = h;

    destroyRenderTargets();
    const halfW = Math.max(32, Math.ceil(w / 2));
    const halfH = Math.max(32, Math.ceil(h / 2));

    const mkTex = (label, tw, th, format, usage) =>
      device.createTexture({ label, size: [tw, th], format, usage });

    const hdrRaw = mkTex("hdrRaw", w, h, "rgba16float", GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC);
    const hdrComposite = mkTex("hdrComposite", w, h, "rgba16float", GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST);
    const hdrWaterSrc = mkTex("hdrWaterSrc", w, h, "rgba16float", GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST);
    const gNormalRough = mkTex("gNormalRough", w, h, "rgba16float", GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING);
    const gAlbedoMetal = mkTex("gAlbedoMetal", w, h, "rgba8unorm", GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING);
    const sunDirect = mkTex("sunDirect", w, h, "rgba16float", GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING);
    const depth = mkTex("depth", w, h, "depth32float", GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING);
    const ssrW = halfW;
    const ssrH = halfH;
    const ssr = mkTex("ssr", ssrW, ssrH, "rgba16float", GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING);
    const ssrB = mkTex("ssrB", ssrW, ssrH, "rgba16float", GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING);
    const volA = mkTex("volA", halfW, halfH, "rgba16float", GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING);
    const volB = mkTex("volB", halfW, halfH, "rgba16float", GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING);
    const bloomA = mkTex("bloomA", halfW, halfH, "rgba16float", GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING);
    const bloomB = mkTex("bloomB", halfW, halfH, "rgba16float", GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING);

    rt = {
      width: w,
      height: h,
      halfW,
      halfH,
      ssrW,
      ssrH,
      hdrRaw, hdrRawView: hdrRaw.createView(),
      hdrComposite, hdrCompositeView: hdrComposite.createView(),
      hdrWaterSrc, hdrWaterSrcView: hdrWaterSrc.createView(),
      gNormalRough, gNormalRoughView: gNormalRough.createView(),
      gAlbedoMetal, gAlbedoMetalView: gAlbedoMetal.createView(),
      sunDirect, sunDirectView: sunDirect.createView(),
      depth, depthView: depth.createView(),
      ssr, ssrView: ssr.createView(),
      ssrB, ssrBView: ssrB.createView(),
      volA, volAView: volA.createView(),
      volB, volBView: volB.createView(),
      bloomA, bloomAView: bloomA.createView(),
      bloomB, bloomBView: bloomB.createView(),
    };
    rebuildFrameBindGroups();
  }

  function writeEnvUniform(batchIndex, spp) {
    const atm = activeAtmosphere;
    const sun = atm.sun;
    const sunDir = sun ? normalize3(sun.direction) : [0, 1, 0];
    const sunCol = sun ? sun.color : [0, 0, 0];
    const sunInt = sun ? sun.intensity : 0;

    const buf = new ArrayBuffer(112);
    const f = new Float32Array(buf);
    const u = new Uint32Array(buf);
    f[0] = sunDir[0]; f[1] = sunDir[1]; f[2] = sunDir[2]; f[3] = sun?.angularRadius ?? 0.025;
    f[4] = sunCol[0] * sunInt; f[5] = sunCol[1] * sunInt; f[6] = sunCol[2] * sunInt; f[7] = sun ? 1 : 0;
    f[8] = atm.skyTop[0]; f[9] = atm.skyTop[1]; f[10] = atm.skyTop[2]; f[11] = atm.ambientFloor ?? 0.015;
    f[12] = atm.skyHorizon[0]; f[13] = atm.skyHorizon[1]; f[14] = atm.skyHorizon[2]; f[15] = sceneRes.lightCount;
    u[16] = sceneRes.atlasSize;
    u[17] = batchIndex;
    u[18] = spp;
    u[19] = sceneRes.triCount;
    f[20] = sceneRes.totalLightPower;
    f[21] = atm.bounceBoost ?? 1.15;
    f[22] = atm.aoRadius ?? 1.6;
    const perPixelLights = Boolean(atm.perPixelAreaLights ?? !atm.sun);
    f[23] = (sceneRes.hasSkylights ? 1 : 0) | (perPixelLights ? 2 : 0);
    if (sceneRes.water) {
      f[24] = sceneRes.water.absorption[0];
      f[25] = sceneRes.water.absorption[1];
      f[26] = sceneRes.water.absorption[2];
      f[27] = sceneRes.water.level;
    } else {
      f[24] = 0; f[25] = 0; f[26] = 0; f[27] = -100;
    }
    device.queue.writeBuffer(envUniformBuf, 0, buf);
  }

  function runDenoiseAndDilate(encoder) {
    const wg = Math.ceil(sceneRes.atlasSize / 8);
    // 1. Resolve accumulated buffers -> B
    let p = encoder.beginComputePass({ label: "lm-resolve" });
    p.setPipeline(resolveLmPipe);
    p.setBindGroup(0, sceneRes.lmResolveGroup);
    p.dispatchWorkgroups(wg, wg);
    p.end();

    // 2. Bilateral pass step 1: B -> A
    p = encoder.beginComputePass({ label: "lm-bilateral-1" });
    p.setPipeline(bilateralLmPipe);
    p.setBindGroup(0, sceneRes.lmBilateral1Group0);
    p.setBindGroup(1, sceneRes.lmBilateral1Group1);
    p.dispatchWorkgroups(wg, wg);
    p.end();

    // 3. Bilateral pass step 2: A -> B
    p = encoder.beginComputePass({ label: "lm-bilateral-2" });
    p.setPipeline(bilateralLmPipe);
    p.setBindGroup(0, sceneRes.lmBilateral2Group0);
    p.setBindGroup(1, sceneRes.lmBilateral2Group1);
    p.dispatchWorkgroups(wg, wg);
    p.end();

    // 4. Bilateral pass step 4: B -> A
    p = encoder.beginComputePass({ label: "lm-bilateral-3" });
    p.setPipeline(bilateralLmPipe);
    p.setBindGroup(0, sceneRes.lmBilateral3Group0);
    p.setBindGroup(1, sceneRes.lmBilateral3Group1);
    p.dispatchWorkgroups(wg, wg);
    p.end();

    // 5. Bilateral pass step 8: A -> B (plane-aware broad smoothing eliminates all shadow mottle!)
    p = encoder.beginComputePass({ label: "lm-bilateral-4" });
    p.setPipeline(bilateralLmPipe);
    p.setBindGroup(0, sceneRes.lmBilateral4Group0);
    p.setBindGroup(1, sceneRes.lmBilateral4Group1);
    p.dispatchWorkgroups(wg, wg);
    p.end();

    // 6. Final gutter dilation: B -> A (final sampled lightmap!)
    p = encoder.beginComputePass({ label: "lm-dilate" });
    p.setPipeline(dilateLmPipe);
    p.setBindGroup(0, sceneRes.lmDilateGroup0);
    p.setBindGroup(1, sceneRes.lmDilateGroup1);
    p.dispatchWorkgroups(wg, wg);
    p.end();
  }

  function dispatchBakeBatch(spp, doResolve = true) {
    if (!sceneRes) return;
    writeEnvUniform(bakeState.batchIndex, spp);
    const encoder = device.createCommandEncoder({ label: "lightmap-batch" });
    const wg = Math.ceil(sceneRes.atlasSize / 8);
    const p = encoder.beginComputePass({ label: "lm-trace" });
    p.setPipeline(bakeLmPipe);
    p.setBindGroup(0, sceneRes.lmBakeGroup);
    p.dispatchWorkgroups(wg, wg);
    p.end();
    if (doResolve) runDenoiseAndDilate(encoder);
    device.queue.submit([encoder.finish()]);
    bakeState.batchIndex++;
    bakeState.bakedSpp += spp;
  }

  async function loadScene(compiled, atmosphere = {}) {
    await device.queue.onSubmittedWorkDone();
    destroySceneResources();

    activeAtmosphere = {
      fogColor: atmosphere.fogColor ?? [0.55, 0.62, 0.60],
      fogDensity: atmosphere.fogDensity ?? 0.012,
      heightFogFalloff: atmosphere.heightFogFalloff ?? 0.25,
      skyTop: atmosphere.skyTop ?? [0.22, 0.36, 0.56],
      skyHorizon: atmosphere.skyHorizon ?? [0.68, 0.78, 0.84],
      sun: atmosphere.sun ?? null,
      exposure: atmosphere.exposure ?? 1.0,
      bloomStrength: atmosphere.bloomStrength ?? 0.22,
      volumetricStrength: atmosphere.volumetricStrength ?? 0.25,
      ambientFloor: atmosphere.ambientFloor ?? 0.015,
      bounceBoost: atmosphere.bounceBoost ?? 1.15,
      aoRadius: atmosphere.aoRadius ?? 1.6,
      perPixelAreaLights: atmosphere.perPixelAreaLights,
    };
    settings.exposure = activeAtmosphere.exposure;
    settings.fov = atmosphere.fov ?? 68;

    const atlasSize = compiled.atlas.atlasSize;
    const layerCount = Math.max(1, compiled.materials.length);
    const texSize = settings.texSize;
    const mipLevels = Math.floor(Math.log2(texSize)) + 1;

    const vertexBuf = createBufferWithData("mesh vertices", compiled.vertexData, GPUBufferUsage.VERTEX);
    const indexBuf = createBufferWithData("mesh indices", compiled.indexData, GPUBufferUsage.INDEX);
    const bvhNodeBuf = createBufferWithData("bvh nodes", compiled.bvh.nodeData, GPUBufferUsage.STORAGE);
    const bvhTriBuf = createBufferWithData("bvh tris", compiled.bvh.triData, GPUBufferUsage.STORAGE);
    const materialBuf = createBufferWithData("materials", compiled.materialData, GPUBufferUsage.STORAGE);
    const lightBuf = createBufferWithData("area lights", compiled.lightData, GPUBufferUsage.STORAGE);

    // 1. Startup Procedural PBR Texture Bake + Toksvig Mipmap Generation
    const tTexStart = performance.now();
    const mkArrayTex = (label) =>
      device.createTexture({
        label,
        size: [texSize, texSize, layerCount],
        mipLevelCount: mipLevels,
        format: "rgba8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
      });
    const albedoRoughTex = mkArrayTex("pbr-albedo-rough");
    const normalHeightTex = mkArrayTex("pbr-normal-height");
    const metaTex = mkArrayTex("pbr-meta");

    const bakeInfoBuf = createBufferWithData(
      "tex bake info",
      new Uint32Array([texSize, layerCount, 0, 0]),
      GPUBufferUsage.UNIFORM,
    );
    const bakeTexEnc = device.createCommandEncoder({ label: "startup-texture-bake" });
    {
      const pass = bakeTexEnc.beginComputePass({ label: "bake-pbr-mip0" });
      pass.setPipeline(bakeTexPipe);
      pass.setBindGroup(
        0,
        device.createBindGroup({
          layout: bakeTexPipe.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: materialBuf } },
            { binding: 1, resource: { buffer: bakeInfoBuf } },
            { binding: 2, resource: albedoRoughTex.createView({ dimension: "2d-array", baseMipLevel: 0, mipLevelCount: 1 }) },
            { binding: 3, resource: normalHeightTex.createView({ dimension: "2d-array", baseMipLevel: 0, mipLevelCount: 1 }) },
            { binding: 4, resource: metaTex.createView({ dimension: "2d-array", baseMipLevel: 0, mipLevelCount: 1 }) },
          ],
        }),
      );
      pass.dispatchWorkgroups(Math.ceil(texSize / 8), Math.ceil(texSize / 8), layerCount);
      pass.end();
    }

    const mipUniforms = [];
    for (let mip = 1; mip < mipLevels; mip++) {
      const dstSize = Math.max(1, texSize >> mip);
      const uBuf = createBufferWithData(`mip-${mip}`, new Uint32Array([dstSize, layerCount, 0, 0]), GPUBufferUsage.UNIFORM);
      mipUniforms.push(uBuf);
      const pass = bakeTexEnc.beginComputePass({ label: `mipmap-${mip}` });
      pass.setPipeline(mipPipe);
      pass.setBindGroup(
        0,
        device.createBindGroup({
          layout: mipPipe.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: uBuf } },
            { binding: 1, resource: albedoRoughTex.createView({ dimension: "2d-array", baseMipLevel: mip - 1, mipLevelCount: 1 }) },
            { binding: 2, resource: normalHeightTex.createView({ dimension: "2d-array", baseMipLevel: mip - 1, mipLevelCount: 1 }) },
            { binding: 3, resource: metaTex.createView({ dimension: "2d-array", baseMipLevel: mip - 1, mipLevelCount: 1 }) },
            { binding: 4, resource: albedoRoughTex.createView({ dimension: "2d-array", baseMipLevel: mip, mipLevelCount: 1 }) },
            { binding: 5, resource: normalHeightTex.createView({ dimension: "2d-array", baseMipLevel: mip, mipLevelCount: 1 }) },
            { binding: 6, resource: metaTex.createView({ dimension: "2d-array", baseMipLevel: mip, mipLevelCount: 1 }) },
          ],
        }),
      );
      pass.dispatchWorkgroups(Math.ceil(dstSize / 8), Math.ceil(dstSize / 8), layerCount);
      pass.end();
    }
    device.queue.submit([bakeTexEnc.finish()]);
    await device.queue.onSubmittedWorkDone();
    bakeInfoBuf.destroy();
    for (const u of mipUniforms) u.destroy();
    const textureMs = performance.now() - tTexStart;

    // 2. Rasterize Lightmap UV2 G-Buffer & Dilate Gutter Texels
    const tBakeStart = performance.now();
    const rawPosTex = device.createTexture({
      label: "lm-raw-pos",
      size: [atlasSize, atlasSize],
      format: "rgba32float",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    const rawNormTex = device.createTexture({
      label: "lm-raw-norm",
      size: [atlasSize, atlasSize],
      format: "rgba16float",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    const lmCells = atlasSize * atlasSize;
    const lmPosBuf = device.createBuffer({ label: "lm-pos", size: lmCells * 16, usage: GPUBufferUsage.STORAGE });
    const lmNormBuf = device.createBuffer({ label: "lm-norm", size: lmCells * 16, usage: GPUBufferUsage.STORAGE });
    const accumIrradBuf = device.createBuffer({ label: "lm-accum-irrad", size: lmCells * 16, usage: GPUBufferUsage.STORAGE });
    const accumDirBuf = device.createBuffer({ label: "lm-accum-dir", size: lmCells * 16, usage: GPUBufferUsage.STORAGE });

    const atlasInfoBuf = createBufferWithData("atlas-info", new Uint32Array([atlasSize, 0, 0, 0]), GPUBufferUsage.UNIFORM);
    const gbufEnc = device.createCommandEncoder({ label: "lm-gbuffer" });
    {
      const rpass = gbufEnc.beginRenderPass({
        colorAttachments: [
          { view: rawPosTex.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: "clear", storeOp: "store" },
          { view: rawNormTex.createView(), clearValue: { r: 0, g: 1, b: 0, a: 0 }, loadOp: "clear", storeOp: "store" },
        ],
      });
      rpass.setPipeline(bakeGBufRenderPipe);
      rpass.setVertexBuffer(0, vertexBuf);
      rpass.setIndexBuffer(indexBuf, "uint32");
      rpass.drawIndexed(compiled.indexCount);
      rpass.end();
    }
    {
      const cpass = gbufEnc.beginComputePass({ label: "dilate-gbuf" });
      cpass.setPipeline(dilateGBufPipe);
      cpass.setBindGroup(
        0,
        device.createBindGroup({
          layout: dilateGBufPipe.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: atlasInfoBuf } },
            { binding: 1, resource: rawPosTex.createView() },
            { binding: 2, resource: rawNormTex.createView() },
            { binding: 3, resource: { buffer: lmPosBuf } },
            { binding: 4, resource: { buffer: lmNormBuf } },
          ],
        }),
      );
      cpass.dispatchWorkgroups(Math.ceil(atlasSize / 8), Math.ceil(atlasSize / 8));
      cpass.end();
    }
    device.queue.submit([gbufEnc.finish()]);
    await device.queue.onSubmittedWorkDone();
    rawPosTex.destroy();
    rawNormTex.destroy();
    atlasInfoBuf.destroy();

    // Allocate ping-pong filterable lightmap textures.
    const mkLmTex = (label) =>
      device.createTexture({
        label,
        size: [atlasSize, atlasSize],
        format: "rgba16float",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
      });
    const lmIrradA = mkLmTex("lm-irrad-a");
    const lmIrradB = mkLmTex("lm-irrad-b");
    const lmDirA = mkLmTex("lm-dir-a");
    const lmDirB = mkLmTex("lm-dir-b");
    const lmIrradAView = lmIrradA.createView();
    const lmIrradBView = lmIrradB.createView();
    const lmDirAView = lmDirA.createView();
    const lmDirBView = lmDirB.createView();

    const indirectMode = activeAtmosphere.sun ? 1 : 0;
    device.queue.writeBuffer(resolveParamBuf, 0, new Uint32Array([atlasSize, 1, indirectMode, 0]));
    device.queue.writeBuffer(denoiseParamBufs[0].buf, 0, new Uint32Array([atlasSize, 1, indirectMode, 0]));
    device.queue.writeBuffer(denoiseParamBufs[1].buf, 0, new Uint32Array([atlasSize, 2, indirectMode, 0]));
    device.queue.writeBuffer(denoiseParamBufs[2].buf, 0, new Uint32Array([atlasSize, 4, indirectMode, 0]));
    device.queue.writeBuffer(denoiseParamBufs[3].buf, 0, new Uint32Array([atlasSize, 8, indirectMode, 0]));

    const lmBakeGroup = device.createBindGroup({
      layout: bakeLmPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: envUniformBuf } },
        { binding: 1, resource: { buffer: bvhNodeBuf } },
        { binding: 2, resource: { buffer: bvhTriBuf } },
        { binding: 3, resource: { buffer: materialBuf } },
        { binding: 4, resource: { buffer: lightBuf } },
        { binding: 5, resource: { buffer: lmPosBuf } },
        { binding: 6, resource: { buffer: lmNormBuf } },
        { binding: 7, resource: { buffer: accumIrradBuf } },
        { binding: 8, resource: { buffer: accumDirBuf } },
      ],
    });
    // Resolve writes B -> bilateral1 (B->A) -> bilateral2 (A->B) -> bilateral3 (B->A) -> bilateral4 (A->B) -> dilate (B->A)
    const lmResolveGroup = device.createBindGroup({
      layout: resolveLmPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: resolveParamBuf } },
        { binding: 1, resource: { buffer: lmPosBuf } },
        { binding: 3, resource: { buffer: accumIrradBuf } },
        { binding: 4, resource: { buffer: accumDirBuf } },
        { binding: 5, resource: lmIrradBView },
        { binding: 6, resource: lmDirBView },
      ],
    });
    const lmBilateral1Group0 = device.createBindGroup({
      layout: bilateralLmPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: denoiseParamBufs[0].buf } },
        { binding: 1, resource: { buffer: lmPosBuf } },
        { binding: 2, resource: { buffer: lmNormBuf } },
        { binding: 5, resource: lmIrradAView },
        { binding: 6, resource: lmDirAView },
      ],
    });
    const lmBilateral1Group1 = device.createBindGroup({
      layout: bilateralLmPipe.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: lmIrradBView },
        { binding: 1, resource: lmDirBView },
      ],
    });
    const lmBilateral2Group0 = device.createBindGroup({
      layout: bilateralLmPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: denoiseParamBufs[1].buf } },
        { binding: 1, resource: { buffer: lmPosBuf } },
        { binding: 2, resource: { buffer: lmNormBuf } },
        { binding: 5, resource: lmIrradBView },
        { binding: 6, resource: lmDirBView },
      ],
    });
    const lmBilateral2Group1 = device.createBindGroup({
      layout: bilateralLmPipe.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: lmIrradAView },
        { binding: 1, resource: lmDirAView },
      ],
    });
    const lmBilateral3Group0 = device.createBindGroup({
      layout: bilateralLmPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: denoiseParamBufs[2].buf } },
        { binding: 1, resource: { buffer: lmPosBuf } },
        { binding: 2, resource: { buffer: lmNormBuf } },
        { binding: 5, resource: lmIrradAView },
        { binding: 6, resource: lmDirAView },
      ],
    });
    const lmBilateral3Group1 = device.createBindGroup({
      layout: bilateralLmPipe.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: lmIrradBView },
        { binding: 1, resource: lmDirBView },
      ],
    });
    const lmBilateral4Group0 = device.createBindGroup({
      layout: bilateralLmPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: denoiseParamBufs[3].buf } },
        { binding: 1, resource: { buffer: lmPosBuf } },
        { binding: 2, resource: { buffer: lmNormBuf } },
        { binding: 5, resource: lmIrradBView },
        { binding: 6, resource: lmDirBView },
      ],
    });
    const lmBilateral4Group1 = device.createBindGroup({
      layout: bilateralLmPipe.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: lmIrradAView },
        { binding: 1, resource: lmDirAView },
      ],
    });
    const lmDilateGroup0 = device.createBindGroup({
      layout: dilateLmPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: resolveParamBuf } },
        { binding: 5, resource: lmIrradAView },
        { binding: 6, resource: lmDirAView },
      ],
    });
    const lmDilateGroup1 = device.createBindGroup({
      layout: dilateLmPipe.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: lmIrradBView },
        { binding: 1, resource: lmDirBView },
      ],
    });

    // Optional physical water module (zero cost on dry levels!)
    const water = compiled.water
      ? await createWaterModule(
          device,
          compiled.water,
          compiled.collision,
          frameUniformBuf,
          linSampler,
          { bvhNodeBuf, bvhTriBuf, materialBuf, lmIrradFinalView: lmIrradAView },
          isSoftware,
        )
      : null;

    sceneRes = {
      vertexBuf,
      indexBuf,
      indexCount: compiled.indexCount,
      triCount: compiled.triCount,
      bvhNodeBuf,
      bvhTriBuf,
      materialBuf,
      lightBuf,
      lightCount: compiled.lightCount,
      totalLightPower: compiled.totalLightPower,
      hasSkylights: compiled.skylights.length > 0,
      atlasSize,
      albedoRoughTex,
      normalHeightTex,
      metaTex,
      albedoRoughView: albedoRoughTex.createView({ dimension: "2d-array" }),
      normalHeightView: normalHeightTex.createView({ dimension: "2d-array" }),
      metaView: metaTex.createView({ dimension: "2d-array" }),
      lmPosBuf,
      lmNormBuf,
      accumIrradBuf,
      accumDirBuf,
      lmIrradA, lmIrradB, lmDirA, lmDirB,
      lmIrradFinalView: lmIrradAView,
      lmDirFinalView: lmDirAView,
      lmBakeGroup,
      lmResolveGroup,
      lmBilateral1Group0, lmBilateral1Group1,
      lmBilateral2Group0, lmBilateral2Group1,
      lmBilateral3Group0, lmBilateral3Group1,
      lmBilateral4Group0, lmBilateral4Group1,
      lmDilateGroup0, lmDilateGroup1,
      water,
      stats: compiled.stats,
    };

    bakeState = {
      bakedSpp: 0,
      targetSpp: settings.targetSpp,
      batchIndex: 0,
      textureMs: Number(textureMs.toFixed(1)),
      initBakeMs: 0,
    };

    // 3. Initial Fast Lightmap Bake so the very first frame already has clean multi-bounce GI!
    const initSpp = isSoftware ? 4 : 32;
    dispatchBakeBatch(initSpp, true);
    await device.queue.onSubmittedWorkDone();
    bakeState.initBakeMs = Number((performance.now() - tBakeStart).toFixed(1));

    rebuildFrameBindGroups();
    return { stats: compiled.stats, bake: { ...bakeState } };
  }

  // Synchronously finishes lightmap baking up to requested SPP (used for high-quality captures or user button).
  async function bakeTo(targetSpp = settings.targetSpp) {
    if (!sceneRes) return;
    bakeState.targetSpp = Math.max(bakeState.targetSpp, targetSpp);
    const step = isSoftware ? 4 : 16;
    while (bakeState.bakedSpp < targetSpp) {
      const rem = Math.min(step, targetSpp - bakeState.bakedSpp);
      const isLast = bakeState.bakedSpp + rem >= targetSpp;
      dispatchBakeBatch(rem, isLast);
      await device.queue.onSubmittedWorkDone();
    }
  }

  let frameCounter = 0;

  function render(view, elapsed, dt = 0.016) {
    if (!rt || !sceneRes) return;
    frameCounter++;

    // Background progressive GI refinement throttled to every 2nd frame so frame pacing stays silky!
    if (bakeState.bakedSpp < bakeState.targetSpp && (isSoftware || (frameCounter & 1) === 0)) {
      const batchSpp = 4;
      const willFinish = bakeState.bakedSpp + batchSpp >= bakeState.targetSpp;
      const doResolve = willFinish || bakeState.batchIndex % 4 === 0;
      dispatchBakeBatch(batchSpp, doResolve);
    }

    const aspect = width / Math.max(1, height);
    const vp = buildViewProj(view, aspect, settings.fov);
    const invVp = invertMat4(vp);
    const atm = activeAtmosphere;
    const sun = atm.sun;
    const sunDir = sun ? normalize3(sun.direction) : [0, 1, 0];
    const sunCol = sun ? sun.color : [0, 0, 0];
    const sunInt = sun ? sun.intensity : 0;
    const perPixelLights = Boolean(atm.perPixelAreaLights ?? !atm.sun);
    const flags = (settings.vhsMode ? 1 : 0) | (settings.ssrEnabled ? 0 : 2) | (perPixelLights ? 4 : 0);

    const fBuf = new Float32Array(68);
    fBuf.set(vp, 0);
    fBuf.set(invVp, 16);
    fBuf.set([view.x, view.y, view.z, elapsed], 32);
    fBuf.set([width, height, 1 / width, 1 / height], 36);
    fBuf.set([sunDir[0], sunDir[1], sunDir[2], sun?.angularRadius ?? 0.025], 40);
    fBuf.set([sunCol[0] * sunInt, sunCol[1] * sunInt, sunCol[2] * sunInt, sun ? 1 : 0], 44);
    fBuf.set([atm.skyTop[0], atm.skyTop[1], atm.skyTop[2], settings.exposure], 48);
    fBuf.set([atm.skyHorizon[0], atm.skyHorizon[1], atm.skyHorizon[2], sceneRes.lightCount], 52);
    fBuf.set([atm.fogColor[0], atm.fogColor[1], atm.fogColor[2], atm.fogDensity], 56);
    fBuf.set([
      atm.heightFogFalloff,
      settings.volumetricEnabled ? atm.volumetricStrength : 0,
      settings.bloomEnabled ? atm.bloomStrength : 0,
      atm.ambientFloor,
    ], 60);
    fBuf.set([
      sceneRes.water ? sceneRes.water.level : -100,
      sceneRes.water ? 1 : 0,
      settings.debugView,
      flags,
    ], 64);
    device.queue.writeBuffer(frameUniformBuf, 0, fBuf);

    // Update local player-tracking water window before recording main frame passes
    if (sceneRes.water) {
      sceneRes.water.prepare(view);
    }

    const enc = device.createCommandEncoder({ label: "frame" });

    // Two-solver GPU water step: Chebyshev finite-depth Neumann ripples + FFT dispersive wading wake
    if (sceneRes.water) {
      sceneRes.water.advance(enc, dt, elapsed);
    }

    // Pass 1: Sky Backdrop + Opaque Hardware-Rasterized PBR Scene (+ 1-ray Bayer direct sun visibility)
    {
      const rpass = enc.beginRenderPass({
        label: "gbuffer-pbr",
        colorAttachments: [
          { view: rt.hdrRawView, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store" },
          { view: rt.gNormalRoughView, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store" },
          { view: rt.gAlbedoMetalView, clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: "clear", storeOp: "store" },
          { view: rt.sunDirectView, clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: "clear", storeOp: "store" },
        ],
        depthStencilAttachment: {
          view: rt.depthView,
          depthClearValue: 1.0,
          depthLoadOp: "clear",
          depthStoreOp: "store",
        },
      });
      rpass.setPipeline(skyPipe);
      rpass.setBindGroup(0, rt.skyGroup);
      rpass.draw(3);

      rpass.setPipeline(pbrPipe);
      rpass.setBindGroup(0, rt.pbrGroup);
      rpass.setVertexBuffer(0, sceneRes.vertexBuf);
      rpass.setIndexBuffer(sceneRes.indexBuf, "uint32");
      rpass.drawIndexed(sceneRes.indexCount);
      rpass.end();
    }

    // Pass 2: Half-Res 1-Ray Deterministic BVH Reflections + Separable H/V Roughness Cone Filter
    //         + Full-Res Edge-Only 12-Tap Soft Sun Penumbra & Bilinear Reflection Composite
    if (settings.debugView === 0) {
      if (settings.ssrEnabled) {
        const wgX = Math.ceil(rt.ssrW / 8);
        const wgY = Math.ceil(rt.ssrH / 8);
        let cpass = enc.beginComputePass({ label: "bvh-refl-trace" });
        cpass.setPipeline(ssrTracePipe);
        cpass.setBindGroup(0, rt.ssrTraceGroup);
        cpass.dispatchWorkgroups(wgX, wgY);
        cpass.end();

        cpass = enc.beginComputePass({ label: "bvh-refl-filter-h" });
        cpass.setPipeline(ssrFilterHPipe);
        cpass.setBindGroup(0, rt.ssrFilterHGroup0);
        cpass.setBindGroup(1, rt.ssrFilterHGroup1);
        cpass.dispatchWorkgroups(wgX, wgY);
        cpass.end();

        cpass = enc.beginComputePass({ label: "bvh-refl-filter-v" });
        cpass.setPipeline(ssrFilterVPipe);
        cpass.setBindGroup(0, rt.ssrFilterVGroup0);
        cpass.setBindGroup(1, rt.ssrFilterVGroup1);
        cpass.dispatchWorkgroups(wgX, wgY);
        cpass.end();
      }

      const cpass = enc.beginComputePass({ label: "bvh-refl-shadow-composite" });
      cpass.setPipeline(ssrCompPipe);
      cpass.setBindGroup(0, rt.ssrCompGroup0);
      cpass.setBindGroup(1, rt.ssrCompGroup1);
      cpass.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8));
      cpass.end();
    } else {
      enc.copyTextureToTexture({ texture: rt.hdrRaw }, { texture: rt.hdrComposite }, [width, height, 1]);
    }

    // Pass 3: Optional Physical BVH Water (Early-Z, Snell Refraction, Live Photon Caustics & BVH Mirror Reflections)
    if (sceneRes.water && settings.debugView === 0) {
      sceneRes.water.render(enc, rt.hdrCompositeView);
    }

    // Pass 4: Half-Res BVH Volumetric Sunbeams & Area-Light Haze
    {
      let cpass = enc.beginComputePass({ label: "vol-march" });
      cpass.setPipeline(volMarchPipe);
      cpass.setBindGroup(0, rt.volMarchGroup);
      cpass.dispatchWorkgroups(Math.ceil(rt.halfW / 8), Math.ceil(rt.halfH / 8));
      cpass.end();

      cpass = enc.beginComputePass({ label: "vol-blur" });
      cpass.setPipeline(volBlurPipe);
      cpass.setBindGroup(0, rt.volBlurGroup0);
      cpass.setBindGroup(1, rt.volBlurGroup1);
      cpass.dispatchWorkgroups(Math.ceil(rt.halfW / 8), Math.ceil(rt.halfH / 8));
      cpass.end();
    }

    // Pass 5: HDR Bloom Extract & Separable Blur
    {
      const wgX = Math.ceil(rt.halfW / 8);
      const wgY = Math.ceil(rt.halfH / 8);
      let cpass = enc.beginComputePass({ label: "bloom-extract" });
      cpass.setPipeline(bloomExtractPipe);
      cpass.setBindGroup(0, bloomExtractSamplerGroup);
      cpass.setBindGroup(1, rt.bloomExtractGroup1);
      cpass.dispatchWorkgroups(wgX, wgY);
      cpass.end();

      cpass = enc.beginComputePass({ label: "bloom-h" });
      cpass.setPipeline(bloomHVPipesH);
      cpass.setBindGroup(0, bloomHSamplerGroup);
      cpass.setBindGroup(1, rt.bloomHGroup1);
      cpass.dispatchWorkgroups(wgX, wgY);
      cpass.end();

      cpass = enc.beginComputePass({ label: "bloom-v" });
      cpass.setPipeline(bloomHVPipesV);
      cpass.setBindGroup(0, bloomVSamplerGroup);
      cpass.setBindGroup(1, rt.bloomVGroup1);
      cpass.dispatchWorkgroups(wgX, wgY);
      cpass.end();
    }

    // Pass 6: Final Tone Mapping & Present to Canvas
    {
      const rpass = enc.beginRenderPass({
        label: "present",
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      rpass.setPipeline(presentPipe);
      rpass.setBindGroup(0, rt.presentGroup);
      rpass.draw(3);
      rpass.end();
    }

    device.queue.submit([enc.finish()]);
  }

  function stepWater(view, elapsed, dt = 0.016) {
    if (!sceneRes?.water) return;
    const aspect = width / Math.max(1, height);
    const vp = buildViewProj(view, aspect, settings.fov);
    const invVp = invertMat4(vp);
    const atm = activeAtmosphere;
    const sun = atm.sun;
    const sunDir = sun ? normalize3(sun.direction) : [0, 1, 0];
    const sunCol = sun ? sun.color : [0, 0, 0];
    const sunInt = sun ? sun.intensity : 0;
    const flags = (settings.vhsMode ? 1 : 0) | (settings.ssrEnabled ? 0 : 2);
    const fBuf = new Float32Array(68);
    fBuf.set(vp, 0);
    fBuf.set(invVp, 16);
    fBuf.set([view.x, view.y, view.z, elapsed], 32);
    fBuf.set([width, height, 1 / width, 1 / height], 36);
    fBuf.set([sunDir[0], sunDir[1], sunDir[2], sun?.angularRadius ?? 0.025], 40);
    fBuf.set([sunCol[0] * sunInt, sunCol[1] * sunInt, sunCol[2] * sunInt, sun ? 1 : 0], 44);
    fBuf.set([atm.skyTop[0], atm.skyTop[1], atm.skyTop[2], settings.exposure], 48);
    fBuf.set([atm.skyHorizon[0], atm.skyHorizon[1], atm.skyHorizon[2], sceneRes.lightCount], 52);
    fBuf.set([atm.fogColor[0], atm.fogColor[1], atm.fogColor[2], atm.fogDensity], 56);
    fBuf.set([atm.heightFogFalloff, settings.volumetricEnabled ? atm.volumetricStrength : 0, settings.bloomEnabled ? atm.bloomStrength : 0, atm.ambientFloor], 60);
    fBuf.set([sceneRes.water.level, 1, settings.debugView, flags], 64);
    device.queue.writeBuffer(frameUniformBuf, 0, fBuf);
    sceneRes.water.prepare(view);
    const enc = device.createCommandEncoder({ label: "water-step-only" });
    sceneRes.water.advance(enc, dt, elapsed);
    device.queue.submit([enc.finish()]);
  }

  let referencePtPipe = null;
  let referencePtDenoisePipe = null;

  // Lazy offline Ground-Truth Monte Carlo Path Tracer (0 bytes & 0 ms during normal gameplay).
  // Renders the exact same BVH, analytic materials, area lights, depth fog, volumetric haze,
  // bloom, and Filmic tone mapping + edge-preserving À-trous PT denoise for noise-free inspection.
  async function renderReferencePT(view, elapsed = 0, { spp = 96, batchSpp = 8 } = {}) {
    if (!rt || !sceneRes) return;
    if (!referencePtPipe) {
      const mod = await compileShader("reference-pt", bvhCommonWGSL + "\n" + referencePtWGSL);
      referencePtPipe = await device.createComputePipelineAsync({
        label: "reference-pt",
        layout: "auto",
        compute: { module: mod, entryPoint: "main" },
      });
      referencePtDenoisePipe = await device.createComputePipelineAsync({
        label: "reference-pt-denoise",
        layout: "auto",
        compute: { module: mod, entryPoint: "denoisePT" },
      });
    }

    const aspect = width / Math.max(1, height);
    const vp = buildViewProj(view, aspect, settings.fov);
    const invVp = invertMat4(vp);
    const atm = activeAtmosphere;
    const sun = atm.sun;
    const sunDir = sun ? normalize3(sun.direction) : [0, 1, 0];
    const sunCol = sun ? sun.color : [0, 0, 0];
    const sunInt = sun ? sun.intensity : 0;
    const flags = (settings.vhsMode ? 1 : 0) | (settings.ssrEnabled ? 0 : 2);

    const fBuf = new Float32Array(68);
    fBuf.set(vp, 0);
    fBuf.set(invVp, 16);
    fBuf.set([view.x, view.y, view.z, elapsed], 32);
    fBuf.set([width, height, 1 / width, 1 / height], 36);
    fBuf.set([sunDir[0], sunDir[1], sunDir[2], sun?.angularRadius ?? 0.025], 40);
    fBuf.set([sunCol[0] * sunInt, sunCol[1] * sunInt, sunCol[2] * sunInt, sun ? 1 : 0], 44);
    fBuf.set([atm.skyTop[0], atm.skyTop[1], atm.skyTop[2], settings.exposure], 48);
    fBuf.set([atm.skyHorizon[0], atm.skyHorizon[1], atm.skyHorizon[2], sceneRes.lightCount], 52);
    fBuf.set([atm.fogColor[0], atm.fogColor[1], atm.fogColor[2], atm.fogDensity], 56);
    fBuf.set([
      atm.heightFogFalloff,
      settings.volumetricEnabled ? atm.volumetricStrength : 0,
      settings.bloomEnabled ? atm.bloomStrength : 0,
      atm.ambientFloor,
    ], 60);
    fBuf.set([sceneRes.water ? sceneRes.water.level : -100, sceneRes.water ? 1 : 0, 0, flags], 64);
    device.queue.writeBuffer(frameUniformBuf, 0, fBuf);

    // Populate depth buffer & volumetric buffer identically to real-time Pass 1 + Pass 4
    {
      const enc = device.createCommandEncoder({ label: "pt-prepass" });
      const rpass = enc.beginRenderPass({
        label: "pt-depth-gbuf",
        colorAttachments: [
          { view: rt.hdrRawView, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store" },
          { view: rt.gNormalRoughView, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store" },
          { view: rt.gAlbedoMetalView, clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: "clear", storeOp: "store" },
          { view: rt.sunDirectView, clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: "clear", storeOp: "store" },
        ],
        depthStencilAttachment: {
          view: rt.depthView,
          depthClearValue: 1.0,
          depthLoadOp: "clear",
          depthStoreOp: "store",
        },
      });
      rpass.setPipeline(pbrPipe);
      rpass.setBindGroup(0, rt.pbrGroup);
      rpass.setVertexBuffer(0, sceneRes.vertexBuf);
      rpass.setIndexBuffer(sceneRes.indexBuf, "uint32");
      rpass.drawIndexed(sceneRes.indexCount);
      rpass.end();

      let cpass = enc.beginComputePass({ label: "pt-vol-march" });
      cpass.setPipeline(volMarchPipe);
      cpass.setBindGroup(0, rt.volMarchGroup);
      cpass.dispatchWorkgroups(Math.ceil(rt.halfW / 8), Math.ceil(rt.halfH / 8));
      cpass.end();

      cpass = enc.beginComputePass({ label: "pt-vol-blur" });
      cpass.setPipeline(volBlurPipe);
      cpass.setBindGroup(0, rt.volBlurGroup0);
      cpass.setBindGroup(1, rt.volBlurGroup1);
      cpass.dispatchWorkgroups(Math.ceil(rt.halfW / 8), Math.ceil(rt.halfH / 8));
      cpass.end();

      device.queue.submit([enc.finish()]);
      await device.queue.onSubmittedWorkDone();
    }

    const ptParamBuf = device.createBuffer({
      label: "pt-params",
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const ptAccumBuf = device.createBuffer({
      label: "pt-accum",
      size: width * height * 16,
      usage: GPUBufferUsage.STORAGE,
    });
    const ptTempBuf = device.createBuffer({
      label: "pt-temp",
      size: width * height * 16,
      usage: GPUBufferUsage.STORAGE,
    });
    const ptGuideBuf = device.createBuffer({
      label: "pt-guide",
      size: width * height * 16,
      usage: GPUBufferUsage.STORAGE,
    });

    const ptBindGroup = device.createBindGroup({
      layout: referencePtPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: frameUniformBuf } },
        { binding: 1, resource: { buffer: ptParamBuf } },
        { binding: 2, resource: { buffer: sceneRes.bvhNodeBuf } },
        { binding: 3, resource: { buffer: sceneRes.bvhTriBuf } },
        { binding: 4, resource: { buffer: sceneRes.materialBuf } },
        { binding: 5, resource: { buffer: sceneRes.lightBuf } },
        { binding: 6, resource: texSampler },
        { binding: 7, resource: sceneRes.albedoRoughView },
        { binding: 8, resource: sceneRes.normalHeightView },
        { binding: 9, resource: sceneRes.metaView },
        { binding: 10, resource: { buffer: ptAccumBuf } },
        { binding: 11, resource: rt.hdrCompositeView },
        { binding: 12, resource: { buffer: ptGuideBuf } },
      ],
    });
    const ptDenoiseGroup0 = device.createBindGroup({
      layout: referencePtDenoisePipe.getBindGroupLayout(0),
      entries: [{ binding: 1, resource: { buffer: ptParamBuf } }],
    });
    const ptDenoiseA2B = device.createBindGroup({
      layout: referencePtDenoisePipe.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: { buffer: ptAccumBuf } },
        { binding: 1, resource: { buffer: ptTempBuf } },
        { binding: 2, resource: rt.gNormalRoughView },
        { binding: 3, resource: rt.depthView },
        { binding: 4, resource: rt.hdrCompositeView },
        { binding: 5, resource: { buffer: ptGuideBuf } },
      ],
    });
    const ptDenoiseB2A = device.createBindGroup({
      layout: referencePtDenoisePipe.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: { buffer: ptTempBuf } },
        { binding: 1, resource: { buffer: ptAccumBuf } },
        { binding: 2, resource: rt.gNormalRoughView },
        { binding: 3, resource: rt.depthView },
        { binding: 4, resource: rt.hdrCompositeView },
        { binding: 5, resource: { buffer: ptGuideBuf } },
      ],
    });

    const wgX = Math.ceil(width / 8);
    const wgY = Math.ceil(height / 8);
    const batches = Math.max(1, Math.ceil(spp / batchSpp));
    let doneSpp = 0;

    try {
      for (let b = 0; b < batches; b++) {
        const curSpp = Math.min(batchSpp, spp - doneSpp);
        device.queue.writeBuffer(ptParamBuf, 0, new Uint32Array([b, curSpp, width, height]));
        const enc = device.createCommandEncoder({ label: `pt-batch-${b}` });
        const cpass = enc.beginComputePass({ label: "pt-trace" });
        cpass.setPipeline(referencePtPipe);
        cpass.setBindGroup(0, ptBindGroup);
        cpass.dispatchWorkgroups(wgX, wgY);
        cpass.end();
        device.queue.submit([enc.finish()]);
        await device.queue.onSubmittedWorkDone();
        doneSpp += curSpp;
      }

      // 3-pass albedo-demodulated edge-preserving firefly-rejecting À-trous PT denoise (steps 1, 2, 4)
      const denoiseSteps = [
        { step: 1, writeHdr: 0, grp1: ptDenoiseA2B },
        { step: 2, writeHdr: 0, grp1: ptDenoiseB2A },
        { step: 4, writeHdr: 1, grp1: ptDenoiseA2B },
      ];
      for (const ds of denoiseSteps) {
        device.queue.writeBuffer(ptParamBuf, 0, new Uint32Array([ds.step, ds.writeHdr, width, height]));
        const enc = device.createCommandEncoder({ label: `pt-denoise-${ds.step}` });
        const cpass = enc.beginComputePass({ label: `pt-denoise-${ds.step}` });
        cpass.setPipeline(referencePtDenoisePipe);
        cpass.setBindGroup(0, ptDenoiseGroup0);
        cpass.setBindGroup(1, ds.grp1);
        cpass.dispatchWorkgroups(wgX, wgY);
        cpass.end();
        device.queue.submit([enc.finish()]);
        await device.queue.onSubmittedWorkDone();
      }

      // Run identical Bloom + Present (Filmic Tone Mapping + Fog + Vignette) onto canvas!
      const enc = device.createCommandEncoder({ label: "pt-present" });
      {
        const bWgX = Math.ceil(rt.halfW / 8);
        const bWgY = Math.ceil(rt.halfH / 8);
        let cpass = enc.beginComputePass({ label: "pt-bloom-extract" });
        cpass.setPipeline(bloomExtractPipe);
        cpass.setBindGroup(0, bloomExtractSamplerGroup);
        cpass.setBindGroup(1, rt.bloomExtractGroup1);
        cpass.dispatchWorkgroups(bWgX, bWgY);
        cpass.end();

        cpass = enc.beginComputePass({ label: "pt-bloom-h" });
        cpass.setPipeline(bloomHVPipesH);
        cpass.setBindGroup(0, bloomHSamplerGroup);
        cpass.setBindGroup(1, rt.bloomHGroup1);
        cpass.dispatchWorkgroups(bWgX, bWgY);
        cpass.end();

        cpass = enc.beginComputePass({ label: "pt-bloom-v" });
        cpass.setPipeline(bloomHVPipesV);
        cpass.setBindGroup(0, bloomVSamplerGroup);
        cpass.setBindGroup(1, rt.bloomVGroup1);
        cpass.dispatchWorkgroups(bWgX, bWgY);
        cpass.end();
      }
      {
        const rpass = enc.beginRenderPass({
          label: "pt-present-pass",
          colorAttachments: [
            {
              view: context.getCurrentTexture().createView(),
              clearValue: { r: 0, g: 0, b: 0, a: 1 },
              loadOp: "clear",
              storeOp: "store",
            },
          ],
        });
        rpass.setPipeline(presentPipe);
        rpass.setBindGroup(0, rt.presentGroup);
        rpass.draw(3);
        rpass.end();
      }
      device.queue.submit([enc.finish()]);
      await device.queue.onSubmittedWorkDone();
    } finally {
      ptParamBuf.destroy();
      ptAccumBuf.destroy();
      ptTempBuf.destroy();
      ptGuideBuf.destroy();
    }
    return { spp: doneSpp, width, height };
  }

  return {
    isSoftware,
    adapterInfo,
    settings,
    loadScene,
    bakeTo,
    resize,
    render,
    renderReferencePT,
    stepWater,
    setBody(pose) {
      sceneRes?.water?.setBody(pose);
    },
    addFootstep(contact) {
      sceneRes?.water?.addFootstep(contact);
    },
    addWake(x, z, radius, strength) {
      sceneRes?.water?.addWake(x, z, radius, strength);
    },
    async waitIdle() {
      await device.queue.onSubmittedWorkDone();
    },
    getBakeState: () => ({ ...bakeState }),
    getResolution: () => ({ width, height }),
    getErrors: () => errors.slice(),
    setSettings(patch) {
      Object.assign(settings, patch);
    },
    destroy() {
      destroySceneResources();
      destroyRenderTargets();
      frameUniformBuf.destroy();
      envUniformBuf.destroy();
      resolveParamBuf.destroy();
      denoiseParamBufs.forEach((d) => d.buf.destroy());
      device.destroy();
    },
  };
}
