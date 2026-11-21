// Shared flat SAH BVH traversal, physical sky evaluation, analytic ceramic porcelain,
// GGX PBR helpers, and RNG utilities.
// Prepended to bake-lightmap.wgsl, gbuffer-pbr.wgsl, ssr.wgsl, water-render.wgsl,
// water-caustics.wgsl, and volumetric.wgsl.

const PI: f32 = 3.14159265359;
const INV_PI: f32 = 0.31830988618;
const INF: f32 = 1e20;

struct BVHNode {
  minB: vec3f,
  leftFirst: u32,
  maxB: vec3f,
  triCount: u32,
};

struct BVHTri {
  v0: vec3f,
  matId: u32,
  e1: vec3f,
  pad1: f32,
  e2: vec3f,
  pad2: f32,
  gn: vec3f,
  area: f32,
  lm0_dlm1: vec4f,   // xy = lm0, zw = lm1 - lm0
  dlm2_uv0: vec4f,   // xy = lm2 - lm0, zw = uv0
  duv1_duv2: vec4f,  // xy = uv1 - uv0, zw = uv2 - uv0
};

struct AreaLight {
  originArea: vec4f,   // xyz = corner p0, w = area
  edgeUPower: vec4f,   // xyz = p1 - p0, w = radiant power
  edgeVKind: vec4f,    // xyz = p3 - p0, w = kind (0 area, 1 skylight)
  radianceCdf: vec4f,  // rgb = radiance, w = CDF upper bound
};

struct MaterialGPU {
  albedoScale: vec4f,  // rgb = linear albedo * tint, w = tileScale
  pbr: vec4f,          // x = roughness, y = metallic, z = coat, w = pomDepth
  emissive: vec4f,     // rgb = emissive color, w = emissive strength
  extra: vec4f,        // x = presetId, y = wetness, z = seed, w = flicker
};

struct EnvUniform {
  sunDirRad: vec4f,    // xyz = normalized dir toward sun, w = angular radius
  sunColorInt: vec4f,  // rgb = sun color * intensity, w = sunEnabled (0 or 1)
  skyTop: vec4f,       // rgb = zenith radiance, w = ambientFloor
  skyHorizon: vec4f,   // rgb = horizon radiance, w = lightCount (as f32)
  counts: vec4u,       // x = atlasSize, y = batchIndex, z = samplesPerBatch, w = triCount
  extra: vec4f,        // x = totalLightPower, y = bounceBoost, z = aoRadius, w = hasSkylights
  waterOptics: vec4f,  // rgb = Beer-Lambert absorption, w = waterLevel (-100 if dry)
};

fn pcgHash(state: ptr<function, u32>) -> u32 {
  let old = *state;
  *state = old * 747796405u + 2891336453u;
  let word = ((old >> ((old >> 28u) + 4u)) ^ old) * 277803737u;
  return (word >> 22u) ^ word;
}

fn rand01(state: ptr<function, u32>) -> f32 {
  return f32(pcgHash(state)) * (1.0 / 4294967296.0);
}

fn tileHash21(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn tileHash22(p: vec2f) -> vec2f {
  var p3 = fract(vec3f(p.xyx) * vec3f(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

fn orthoBasis(n: vec3f) -> mat3x3f {
  let s = select(-1.0, 1.0, n.z >= 0.0);
  let a = -1.0 / (s + n.z);
  let b = n.x * n.y * a;
  let t = vec3f(1.0 + s * n.x * n.x * a, s * b, -s * n.x);
  let bt = vec3f(b, s + n.y * n.y * a, -n.y);
  return mat3x3f(t, bt, n);
}

fn sampleCosineHemisphere(n: vec3f, u1: f32, u2: f32) -> vec3f {
  let r = sqrt(u1);
  let phi = 2.0 * PI * u2;
  let local = vec3f(r * cos(phi), r * sin(phi), sqrt(max(0.0, 1.0 - u1)));
  return normalize(orthoBasis(n) * local);
}

fn evalSkyRadiance(rd: vec3f, skyTop: vec3f, skyHorizon: vec3f, sunDir: vec3f, sunCol: vec3f, hasSun: bool) -> vec3f {
  let up = clamp(rd.y, 0.0, 1.0);
  var col = mix(skyHorizon, skyTop, pow(up, 0.55));
  if (hasSun) {
    let cosA = max(dot(rd, sunDir), 0.0);
    col += sunCol * (0.045 * pow(cosA, 28.0) + 0.012 * pow(cosA, 4.0));
  }
  return col;
}

fn evalSky(rd: vec3f, env: EnvUniform) -> vec3f {
  return evalSkyRadiance(rd, env.skyTop.rgb, env.skyHorizon.rgb, env.sunDirRad.xyz, env.sunColorInt.rgb, env.sunColorInt.w > 0.5);
}

fn hitAABB(bMin: vec3f, bMax: vec3f, ro: vec3f, invD: vec3f, bestT: f32) -> f32 {
  let t0 = (bMin - ro) * invD;
  let t1 = (bMax - ro) * invD;
  let tmin = max(max(min(t0.x, t1.x), min(t0.y, t1.y)), min(t0.z, t1.z));
  let tmax = min(min(max(t0.x, t1.x), max(t0.y, t1.y)), max(t0.z, t1.z));
  return select(INF, max(tmin, 0.0), tmax >= max(tmin, 0.0) && tmin < bestT);
}

struct RayHit {
  t: f32,
  n: vec3f,
  matId: u32,
  hit: bool,
  lmUV: vec2f,
  uv: vec2f,
};

// Analytic photographic ceramic porcelain evaluation:
// Razor-thin recessed mortar joints, crisp glazed micro-bevel lips, per-tile 3D mounting tilt
// + subtle glaze pillowing (making tiled walls sparkle tile-by-tile like real glazed porcelain!).
struct CeramicEval {
  isCeramic: bool,
  albedo: vec3f,
  rough: f32,
  coat: f32,
  ao: f32,
  slope: vec2f,
  inGrout: f32,
};

fn isCeramicPreset(preset: u32) -> bool {
  return preset == 0u || preset == 1u || preset == 2u || preset == 16u;
}

fn ceramicGridFreq(preset: u32, tileScale: f32) -> f32 {
  let baseFreq = select(4.0, 8.0, preset == 2u);
  return baseFreq * tileScale;
}

// Exact 1D box-filter integral of a periodic thin line of width `lineW` centered on integers.
// Eliminates ALL black-dot aliasing & moire on tiled walls and refracted underwater pool floors!
fn filteredGridCoverage(g: vec2f, fw: vec2f, lineW: f32) -> f32 {
  let d = clamp(fw, vec2f(0.0012), vec2f(0.45));
  let p = g + vec2f(0.5 * lineW);
  let a = p + 0.5 * d;
  let b = p - 0.5 * d;
  let iA = floor(a) + min(fract(a) / lineW, vec2f(1.0));
  let iB = floor(b) + min(fract(b) / lineW, vec2f(1.0));
  let cov = clamp((iA - iB) * (lineW / d), vec2f(0.0), vec2f(1.0));
  return clamp(cov.x + cov.y - cov.x * cov.y, 0.0, 1.0);
}

fn evalAnalyticCeramic(uv: vec2f, m: MaterialGPU, baseAlbedo: vec3f, baseRough: f32, fwUV: vec2f) -> CeramicEval {
  let preset = u32(m.extra.x + 0.5);
  if (!isCeramicPreset(preset)) {
    return CeramicEval(false, baseAlbedo, baseRough, m.pbr.z, 1.0, vec2f(0.0), 0.0);
  }

  let freq = ceramicGridFreq(preset, m.albedoScale.w);
  let g = uv * freq;
  let fw = fwUV * freq;
  let cell = floor(g);
  let f = fract(g);
  let seed = m.extra.z;

  let rnd = tileHash22(cell + seed * 13.7);
  let rnd3 = tileHash21(cell + seed * 41.3);

  // Fine architectural grout: ~2.6mm total joint on 200mm tiles (narrower on mosaic).
  let lineW = select(0.017, 0.032, preset == 2u);
  let groutHalf = lineW * 0.5;
  let bevelW = select(0.036, 0.048, preset == 2u);

  // Mathematically exact box-filtered grout coverage — silky smooth at ALL distances & angles!
  let inGrout = filteredGridCoverage(g, fw, lineW);
  let fwMax = max(fw.x, fw.y);
  let detailFade = 1.0 / (1.0 + fwMax * 3.5);

  // Crisp glazed tile micro-bevel slope right inside the mortar joint.
  let dx = min(f.x, 1.0 - f.x);
  let dy = min(f.y, 1.0 - f.y);
  let bevelMaskX = (1.0 - smoothstep(groutHalf, groutHalf + bevelW, dx)) * smoothstep(groutHalf * 0.65, groutHalf + 0.004, dx);
  let bevelMaskY = (1.0 - smoothstep(groutHalf, groutHalf + bevelW, dy)) * smoothstep(groutHalf * 0.65, groutHalf + 0.004, dy);
  let signX = select(1.0, -1.0, f.x < 0.5);
  let signY = select(1.0, -1.0, f.y < 0.5);
  let bevelSlope = vec2f(signX * bevelMaskX, signY * bevelMaskY) * 0.28 * detailFade;

  // Per-tile 3D hand-laid mounting micro-tilt + subtle glaze cushion pillowing!
  // Breaks up window & skylight reflections into sparkling individual ceramic tiles (like image.png & image_3.png).
  let centered = (f - 0.5) * 2.0;
  let cushion = centered * (0.028 + 0.045 * dot(centered, centered));
  let tiltStrength = select(0.068, 0.082, preset == 16u);
  let tileTilt = (rnd - 0.5) * tiltStrength;
  let slope = (tileTilt + cushion * detailFade + bevelSlope) * (1.0 - inGrout);

  // Subtle individual ceramic tile tone & glaze roughness micro-variation.
  let tone = vec3f(0.962 + rnd.x * 0.068, 0.970 + rnd.y * 0.055, 0.960 + rnd3 * 0.064);
  let tileCol = baseAlbedo * tone;
  // Soft recessed neutral cement grout (never harsh pitch-black ink lines!).
  let groutCol = select(
    mix(vec3f(0.18, 0.20, 0.19), baseAlbedo * 0.34, 0.35),
    vec3f(0.022, 0.065, 0.055),
    preset == 16u,
  );
  let albedo = mix(tileCol, groutCol, inGrout);

  let tileRough = clamp(baseRough + (rnd.x - 0.5) * 0.045, 0.038, 0.55);
  let rough = mix(tileRough, 0.92, inGrout);
  let coat = mix(m.pbr.z, 0.0, inGrout);
  let ao = mix(1.0, 0.62, inGrout) * (1.0 - 0.06 * max(bevelMaskX, bevelMaskY) * detailFade);

  return CeramicEval(true, albedo, rough, coat, ao, slope, inGrout);
}

// Fast exact unpolarized dielectric Fresnel (air n1=1.0 -> medium n2=ior).
fn exactDielectricFresnel(cosThetaI: f32, ior: f32) -> f32 {
  let ci = clamp(cosThetaI, 0.0, 1.0);
  let sin2T = (1.0 - ci * ci) / (ior * ior);
  if (sin2T >= 1.0) { return 1.0; }
  let ct = sqrt(max(0.0, 1.0 - sin2T));
  let rs = (ci - ior * ct) / max(ci + ior * ct, 1e-5);
  let rp = (ior * ci - ct) / max(ior * ci + ct, 1e-5);
  return clamp(0.5 * (rs * rs + rp * rp), 0.0, 1.0);
}

// Physical finite-depth dispersive indoor pool background wave spectrum:
// 8 non-repeating gravity-capillary modes obeying omega^2 = (9.81*k + 0.000073*k^3) * tanh(k * H).
// Linearly superposed with the live Neumann-masked interactive wake grid so reflections,
// Snell-refracted submerged tiles, and GPU photon caustics stay 100% optically locked!
fn evalDispersiveWaveSlope(p: vec2f, t: f32, depth: f32, amp: f32) -> vec2f {
  let H = max(depth, 0.25);
  let dirs = array<vec2f, 8>(
    vec2f( 1.92,  0.84),
    vec2f(-1.46,  2.18),
    vec2f( 2.85, -1.94),
    vec2f(-3.32, -2.15),
    vec2f( 4.18,  2.95),
    vec2f(-4.72,  3.64),
    vec2f( 6.15, -4.42),
    vec2f(-5.85, -6.28),
  );
  let weights = array<f32, 8>(0.24, 0.21, 0.16, 0.13, 0.10, 0.075, 0.050, 0.035);
  let phases = array<f32, 8>(0.4, 1.9, 3.7, 5.1, 2.3, 4.8, 0.9, 3.1);

  var slope = vec2f(0.0);
  for (var i = 0; i < 8; i++) {
    let kv = dirs[i];
    let k = length(kv);
    let omega = sqrt((9.81 * k + 0.000073 * k * k * k) * tanh(k * H));
    let phase = dot(kv, p) - omega * t + phases[i];
    // Derivative of A * sin(k.x - wt) is A * cos(k.x - wt) * k
    slope += kv * (cos(phase) * weights[i]);
  }
  return slope * amp;
}

