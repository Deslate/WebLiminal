// Post-Processing Pipeline:
// - Half-res HDR bright-pass extraction & separable Gaussian bloom
// - Distance + height atmospheric fog composite + volumetric shafts
// - AgX Filmic Tone Mapping + subtle lens vignette + optional Found-Footage camcorder mode

struct FrameUniform {
  viewProj: mat4x4f,
  invViewProj: mat4x4f,
  cameraPos: vec4f,
  resolution: vec4f,
  sunDirRad: vec4f,
  sunColorInt: vec4f,
  skyTop: vec4f,
  skyHorizon: vec4f,
  fogColorDens: vec4f,
  fogParams: vec4f,
  waterInfo: vec4f,
};

@group(0) @binding(0) var<uniform> frame: FrameUniform;
@group(0) @binding(1) var hdrTex: texture_2d<f32>;
@group(0) @binding(2) var volTex: texture_2d<f32>;
@group(0) @binding(3) var bloomTex: texture_2d<f32>;
@group(0) @binding(4) var depthTex: texture_depth_2d;
@group(0) @binding(5) var linSampler: sampler;

// --- Bloom Compute Passes ---
@group(1) @binding(0) var bloomSrc: texture_2d<f32>;
@group(1) @binding(1) var bloomDst: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8)
fn bloomExtract(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(bloomDst);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let invD = 1.0 / vec2f(dims);
  let uv = (vec2f(gid.xy) + 0.5) * invD;
  // 2x2 pre-filter downsample prevents thin 1-pixel fluorescent tubes from undersampling or strobing!
  let o = invD * 0.25;
  let col = 0.25 * (
    textureSampleLevel(bloomSrc, linSampler, uv + vec2f(-o.x, -o.y), 0.0).rgb +
    textureSampleLevel(bloomSrc, linSampler, uv + vec2f( o.x, -o.y), 0.0).rgb +
    textureSampleLevel(bloomSrc, linSampler, uv + vec2f(-o.x,  o.y), 0.0).rgb +
    textureSampleLevel(bloomSrc, linSampler, uv + vec2f( o.x,  o.y), 0.0).rgb
  );
  let luma = dot(col, vec3f(0.2126, 0.7152, 0.0722));
  let threshold = 2.35;
  let knee = 0.85;
  let soft = clamp(luma - threshold + knee, 0.0, 2.0 * knee);
  let contrib = max(luma - threshold, (soft * soft) / (4.0 * knee + 1e-4)) / max(luma, 1e-4);
  textureStore(bloomDst, vec2i(gid.xy), vec4f(min(col * contrib, vec3f(8.0)), 1.0));
}

fn gaussianBlur(gid: vec3u, dir: vec2f) {
  let dims = textureDimensions(bloomDst);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let uv = (vec2f(gid.xy) + 0.5) / vec2f(dims);
  let stepUV = dir / vec2f(dims);
  // Continuous unit-stride 17-tap Gaussian (sigma = 3.4 texels) — zero comb-striping on thin light tubes!
  var sum = textureSampleLevel(bloomSrc, linSampler, uv, 0.0).rgb;
  var wSum = 1.0;
  for (var i = 1; i <= 8; i++) {
    let fi = f32(i);
    let w = exp(-(fi * fi) / (2.0 * 3.4 * 3.4));
    let off = stepUV * fi;
    sum += (
      textureSampleLevel(bloomSrc, linSampler, uv + off, 0.0).rgb +
      textureSampleLevel(bloomSrc, linSampler, uv - off, 0.0).rgb
    ) * w;
    wSum += 2.0 * w;
  }
  textureStore(bloomDst, vec2i(gid.xy), vec4f(sum / wSum, 1.0));
}

@compute @workgroup_size(8, 8)
fn bloomBlurH(@builtin(global_invocation_id) gid: vec3u) {
  gaussianBlur(gid, vec2f(1.0, 0.0));
}

@compute @workgroup_size(8, 8)
fn bloomBlurV(@builtin(global_invocation_id) gid: vec3u) {
  gaussianBlur(gid, vec2f(0.0, 1.0));
}

// --- Final Present Pass ---
struct VSOut {
  @builtin(position) clipPos: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vsPresent(@builtin(vertex_index) vid: u32) -> VSOut {
  let pts = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: VSOut;
  o.clipPos = vec4f(pts[vid], 0.0, 1.0);
  o.uv = vec2f(pts[vid].x * 0.5 + 0.5, 0.5 - pts[vid].y * 0.5);
  return o;
}

// Troy Sobotka AgX Filmic Tone Mapping (clean highlight roll-off, realistic saturation).
fn agxDefaultContrastApprox(x: vec3f) -> vec3f {
  let x2 = x * x;
  let x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}

fn agxToneMap(val: vec3f) -> vec3f {
  let agxMat = mat3x3f(
    vec3f(0.842479062253094, 0.0423282422610123, 0.0423756549057051),
    vec3f(0.0784335999999992, 0.878468636469772, 0.0784336),
    vec3f(0.0792237451477643, 0.0791661274605434, 0.879142973793104),
  );
  let agxInv = mat3x3f(
    vec3f(1.19687900512017, -0.0528968517574562, -0.0529716355144438),
    vec3f(-0.0980208811401368, 1.15190312990417, -0.0980434501171241),
    vec3f(-0.0990297440797205, -0.0989611768448433, 1.15107367264116),
  );
  var v = max(val, vec3f(1e-6));
  v = agxMat * v;
  v = clamp((log2(v) - (-12.47393)) / (4.026069 - (-12.47393)), vec3f(0.0), vec3f(1.0));
  v = agxDefaultContrastApprox(v);
  v = agxInv * v;
  // Photographic contrast punch (deep obsidian shadows like v1 ACES + smooth AgX highlight roll-off).
  let luma = dot(v, vec3f(0.2126, 0.7152, 0.0722));
  v = pow(max(v, vec3f(0.0)), vec3f(1.14));
  v = mix(vec3f(luma), v, 1.10);
  return clamp(v, vec3f(0.0), vec3f(1.0));
}

fn acesToneMap(x: vec3f) -> vec3f {
  let a = x * (2.51 * x + 0.03);
  let b = x * (2.43 * x + 0.59) + 0.14;
  return clamp(a / b, vec3f(0.0), vec3f(1.0));
}

fn linearToSRGB(c: vec3f) -> vec3f {
  let lo = c * 12.92;
  let hi = 1.055 * pow(max(c, vec3f(0.0)), vec3f(1.0 / 2.4)) - 0.055;
  return select(lo, hi, c > vec3f(0.0031308));
}

fn hash12(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

@fragment
fn fsPresent(i: VSOut) -> @location(0) vec4f {
  let vhs = (u32(frame.waterInfo.w + 0.5) & 1u) != 0u;
  let hasWater = frame.waterInfo.y > 0.5;
  var uv = i.uv;

  // Subtle barrel distortion in Found-Footage camcorder mode.
  if (vhs) {
    let centered = uv - 0.5;
    let r2 = dot(centered, centered);
    uv = 0.5 + centered * (1.0 + 0.055 * r2);
  }

  let fullDims = vec2i(textureDimensions(depthTex));
  let px = clamp(vec2i(uv * vec2f(fullDims)), vec2i(0), fullDims - vec2i(1));
  let depth = textureLoad(depthTex, px, 0);

  // Sample HDR color (subtle v1 present.wgsl optical lens CA on Poolrooms; stronger corner CA in VHS mode).
  var col: vec3f;
  if (vhs) {
    let offset = (uv - 0.5) * 0.0042;
    col.r = textureSampleLevel(hdrTex, linSampler, uv + offset, 0.0).r;
    col.g = textureSampleLevel(hdrTex, linSampler, uv, 0.0).g;
    col.b = textureSampleLevel(hdrTex, linSampler, uv - offset, 0.0).b;
  } else if (hasWater) {
    let cUV = uv - 0.5;
    let ca = cUV * dot(cUV, cUV) * 0.0016;
    col.r = textureSampleLevel(hdrTex, linSampler, uv + ca, 0.0).r;
    col.g = textureSampleLevel(hdrTex, linSampler, uv, 0.0).g;
    col.b = textureSampleLevel(hdrTex, linSampler, uv - ca, 0.0).b;
  } else {
    col = textureSampleLevel(hdrTex, linSampler, uv, 0.0).rgb;
  }

  let dbg = u32(frame.waterInfo.z + 0.5);
  if (dbg == 0u) {
    // Distance + height exponential atmospheric fog (skip open sky pixels).
    if (depth < 0.9999) {
      let ndc = vec4f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, depth, 1.0);
      let wp = frame.invViewProj * ndc;
      let worldPos = wp.xyz / wp.w;
      let dist = length(worldPos - frame.cameraPos.xyz);
      let hFactor = exp(-max(0.0, worldPos.y) * frame.fogParams.x);
      let fogFactor = 1.0 - exp(-dist * frame.fogColorDens.w * mix(0.65, 1.25, hFactor));
      col = mix(col, frame.fogColorDens.rgb, clamp(fogFactor, 0.0, 0.85));
    }

    // Add volumetric sunbeams / area-light haze & HDR bloom halation.
    let vol = textureSampleLevel(volTex, linSampler, uv, 0.0).rgb;
    let bloom = textureSampleLevel(bloomTex, linSampler, uv, 0.0).rgb;
    col += vol + bloom * frame.fogParams.z;
  }

  // Exposure + Tone Mapping:
  // - Poolrooms (hasWater): exact v1 present.wgsl ACES Filmic + sRGB for radiant sunlit cream highlights
  //   and deep obsidian foreground framing.
  // - Dry interiors (Level 0): GTPT-calibrated AgX Filmic curve.
  let exposure = frame.skyTop.w;
  var mapped: vec3f;
  if (dbg == 2u || dbg == 3u || dbg == 4u) {
    mapped = pow(clamp(col, vec3f(0.0), vec3f(1.0)), vec3f(1.0 / 2.2));
  } else if (hasWater) {
    let vig = 1.0 - dot(uv - 0.5, uv - 0.5) * select(0.24, 0.52, vhs);
    mapped = linearToSRGB(acesToneMap(max(col * exposure * vig, vec3f(0.0))));
  } else {
    mapped = agxToneMap(col * exposure);
    let dCenter = length((uv - 0.5) * vec2f(1.22, 1.0));
    let vigStrength = select(0.24, 0.48, vhs);
    mapped *= 1.0 - smoothstep(0.38, 1.08, dCenter) * vigStrength;
  }

  // Clean mode: zero time-animated grain (only ultra-subtle static 8-bit banding dither, plus v1-subtle
  // luminance-weighted emulsion texture on Poolrooms). VHS mode keeps animated camcorder grain & scanlines.
  if (vhs) {
    let grain = (hash12(i.clipPos.xy + fract(frame.cameraPos.w * 13.7) * 512.0) - 0.5) * 0.036;
    mapped += vec3f(grain);
    let scan = 0.972 + 0.028 * sin(i.clipPos.y * 3.14159);
    mapped *= scan;
  } else if (hasWater) {
    let g = hash12(i.clipPos.xy) - 0.5;
    let lum = dot(mapped, vec3f(0.2126, 0.7152, 0.0722));
    mapped += vec3f(g * 0.009 * (0.25 + 0.75 * smoothstep(0.02, 0.4, lum)));
  } else {
    let dither = (hash12(i.clipPos.xy) - 0.5) * (1.0 / 255.0);
    mapped += vec3f(dither);
  }

  return vec4f(clamp(mapped, vec3f(0.0), vec3f(1.0)), 1.0);
}
