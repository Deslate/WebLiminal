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

// World-stable integer value noise & FBM (ported from v1 common.wgsl for authentic porcelain weathering).
fn vHashU(v: u32) -> u32 {
  var x = v;
  x = ((x >> 16u) ^ x) * 0x7feb352du;
  x = ((x >> 15u) ^ x) * 0x846ca68bu;
  return (x >> 16u) ^ x;
}

fn vHash2(p: vec2f) -> f32 {
  let q = vec2i(floor(p));
  return f32(vHashU((bitcast<u32>(q.x) * 73856093u) ^ (bitcast<u32>(q.y) * 19349663u))) * (1.0 / 4294967296.0);
}

fn vNoise2(p: vec2f) -> f32 {
  let b = floor(p);
  let t = fract(p);
  let f = t * t * (3.0 - 2.0 * t);
  return mix(
    mix(vHash2(b), vHash2(b + vec2f(1.0, 0.0)), f.x),
    mix(vHash2(b + vec2f(0.0, 1.0)), vHash2(b + vec2f(1.0, 1.0)), f.x),
    f.y,
  );
}

fn vFbm2(p: vec2f) -> f32 {
  return vNoise2(p) * 0.55
       + vNoise2(p * 2.071 + vec2f(17.3, 17.3)) * 0.27
       + vNoise2(p * 4.317 - vec2f(8.4, 8.4)) * 0.12
       + vNoise2(p * 8.193) * 0.06;
}

// Flat architectural glazed porcelain ceramic evaluation (v1 porcelain.wgsl calibration):
// - Genuinely FLAT fired ceramic tile faces (ZERO pillow/cushion bulge!)
// - Razor-thin ~1.8 mm recessed grout shoulder + mathematically exact box-filtered grout lines
// - Delicate hand-laid per-tile mounting tilt (~0.011 rad) + subtle organic glaze waviness
// - 4-tap footprint slope-moment roughness compensation (pow(r^4 + varX + varY, 0.25))
// - Authentic architectural weathering: mineral joint staining, subtle streaks, scale deposits & chips
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
// Eliminates ALL black-dot aliasing & moire on tiled walls and refracted underwater pool floors.
fn filteredGridCoverage(g: vec2f, fw: vec2f, lineW: f32) -> f32 {
  let d = clamp(fw, vec2f(0.0010), vec2f(0.45));
  let p = g + vec2f(0.5 * lineW);
  let a = p + 0.5 * d;
  let b = p - 0.5 * d;
  let iA = floor(a) + min(fract(a) / lineW, vec2f(1.0));
  let iB = floor(b) + min(fract(b) / lineW, vec2f(1.0));
  let cov = clamp((iA - iB) * (lineW / d), vec2f(0.0), vec2f(1.0));
  return clamp(cov.x + cov.y - cov.x * cov.y, 0.0, 1.0);
}

struct TileMetric {
  edge: f32,     // meters inward from recessed mortar shoulder (<0 inside grout)
  bevel: f32,    // narrow rounded shoulder width in meters (~1.4..2.4 mm)
  id: f32,       // stable per-tile hash [0..1]
  slope: vec2f,  // exact metric surface gradient (flat face + tiny mounting tilt + narrow shoulder)
};

fn ceramicMetricProfile(uvM: vec2f, tileSize: f32, preset: u32, seed: f32, fwMax: f32) -> TileMetric {
  let cell = floor(uvM / tileSize);
  let center = (cell + 0.5) * tileSize;
  let q = uvM - center;

  let id = vHash2(cell + vec2f(seed * 17.19, 0.0));
  let r = vec2f(
    vHash2(cell + vec2f(13.1 + seed * 31.0, 7.3)),
    vHash2(cell + vec2f(28.7, 9.1 + seed * 11.0)),
  );

  // Authentic ~5.0 mm full grout joint on 200-250 mm architectural tiles (~2.8 mm on 125 mm mosaic), matching v1.
  let groutHalf = select(0.0025, 0.0014, preset == 2u);
  let halfSize = max(tileSize * 0.5 - groutHalf, 0.01);
  let cornerR = 0.0018 + 0.0010 * id;
  let d = abs(q) - halfSize + cornerR;
  let edge = -(length(max(d, vec2f(0.0))) + min(max(d.x, d.y), 0.0) - cornerR);

  // Crisp ~3.2-4.6 mm fired porcelain rounded glaze shoulder (flat 96% tile face, zero pillow bulge, catches real edge glints!).
  let bevel = 0.0032 + 0.0014 * r.y;
  let shoulder = smoothstep(0.0, bevel, edge);

  // Subtle hand-laid mounting micro-tilt (v1 porcelain uses ~0.011 rad).
  let tiltMag = select(0.013, 0.016, preset == 16u);
  let tilt = (r - 0.5) * tiltMag;

  // Outward-facing glazed shoulder gradient along the rounded ceramic lip, band-limited smoothly before Nyquist.
  var ge = -sign(q) * select(vec2f(0.0, 1.0), vec2f(1.0, 0.0), d.x > d.y);
  if (any(d > vec2f(0.0))) {
    ge = -sign(q) * normalize(max(d, vec2f(1e-6)));
  }
  let u = clamp(edge / bevel, 0.0, 1.0);
  let lipWeight = 1.0 - smoothstep(0.0035, 0.024, fwMax);
  let lipSlope = ge * (0.46 * 4.0 * u * (1.0 - u) * lipWeight);

  // Band-limited kiln-fired glaze waviness & micro-texture: fade cleanly before Nyquist
  // (unresolved variance is analytically folded into GGX roughness in evalAnalyticCeramicFull).
  let tSeed = vec2f(id * 173.1, seed * 13.71);
  let waveWeight = 1.0 - smoothstep(0.0045, 0.022, fwMax);
  let microWeight = 1.0 - smoothstep(0.0010, 0.0048, fwMax);
  let waviness = vec2f(vNoise2(uvM * 23.7 + tSeed), vNoise2(uvM * 27.1 - tSeed)) - 0.5;
  let micro = vec2f(vNoise2(uvM * 137.3 + tSeed), vNoise2(uvM * 143.7 - tSeed)) - 0.5;
  let glaze = (waviness * (0.017 * waveWeight) + micro * (0.018 * microWeight)) * shoulder;

  let totalSlope = (tilt * shoulder + lipSlope + glaze);
  return TileMetric(edge, bevel, id, totalSlope);
}

// Primary-camera porcelain evaluation with 4-tap footprint slope-moment roughness compensation.
fn evalAnalyticCeramicFull(
  uv: vec2f,
  m: MaterialGPU,
  baseAlbedo: vec3f,
  baseRough: f32,
  fwUV: vec2f,
  worldY: f32,
  waterLevel: f32,
  hasWater: bool,
) -> CeramicEval {
  let preset = u32(m.extra.x + 0.5);
  if (!isCeramicPreset(preset)) {
    return CeramicEval(false, baseAlbedo, baseRough, m.pbr.z, 1.0, vec2f(0.0), 0.0);
  }

  let freq = ceramicGridFreq(preset, m.albedoScale.w);
  let tileSize = 1.0 / max(freq, 0.25);
  let seed = m.extra.z;
  let g = uv * freq;
  let fwGrid = fwUV * freq;
  let fwMeters = clamp(fwUV, vec2f(0.00015), vec2f(0.06));
  let fwMax = max(fwMeters.x, fwMeters.y);

  let t = ceramicMetricProfile(uv, tileSize, preset, seed, fwMax);
  let tSeed = vec2f(t.id * 173.1, seed * 13.71);

  // Exact box-filtered grout coverage (silky smooth at every distance & grazing angle).
  let groutHalf = select(0.0020, 0.0012, preset == 2u);
  let lineWFrac = (groutHalf * 2.0) * freq;
  let inGrout = filteredGridCoverage(g, fwGrid, lineWFrac);

  // 4-tap footprint slope moments (ported from v1 porcelain.wgsl glazeMoments):
  // Unresolved bevel/micro-waviness variance smoothly broadens GGX roughness instead of shimmering!
  let halfFoot = clamp(fwMeters * 0.5, vec2f(0.00012), vec2f(0.04));
  var meanSlope = vec2f(0.0);
  var secondMoment = vec2f(0.0);
  for (var qi = 0u; qi < 4u; qi++) {
    let qOff = vec2f(select(-1.0, 1.0, (qi & 1u) != 0u), select(-1.0, 1.0, (qi & 2u) != 0u));
    let s = ceramicMetricProfile(uv + qOff * halfFoot * 0.577350269, tileSize, preset, seed, fwMax).slope;
    meanSlope += s * 0.25;
    secondMoment += s * s * 0.25;
  }
  let waveWeight = 1.0 - smoothstep(0.0045, 0.022, fwMax);
  let microWeight = 1.0 - smoothstep(0.0010, 0.0048, fwMax);
  let fadedGlazeVar = (1.0 - microWeight * microWeight) * 0.000055 + (1.0 - waveWeight * waveWeight) * 0.000038;
  let slopeVar = max(secondMoment - meanSlope * meanSlope, vec2f(0.0)) + vec2f(fadedGlazeVar);
  let slope = meanSlope * (1.0 - inGrout);

  // Authentic architectural porcelain color & weathering (exact v1 porcelain.wgsl kiln batch range!).
  let detail = 1.0 - smoothstep(0.0009, 0.006, fwMax);
  // Real handcrafted kiln-fired tile-to-tile tonal variation (v1 mix(.57..80) ratio!).
  let batchWarm = mix(vec3f(0.82, 0.85, 0.78), vec3f(1.10, 1.07, 0.99), t.id * 0.68 + 0.16);
  var color = baseAlbedo * batchWarm;

  // Soft 3D porcelain glaze bevel shoulder darkening as the lip curves gently into the recessed mortar
  let bevelShade = (1.0 - smoothstep(0.0, t.bevel * 1.15 + fwMax * 0.4, t.edge)) * (1.0 - inGrout);
  color *= 1.0 - bevelShade * 0.14;

  // Edge mineral staining & subtle vertical water streaks.
  let mineral = smoothstep(0.43, 0.70, vFbm2(uv * 4.7 + tSeed)) * exp(-max(0.0, t.edge) / 0.025);
  let streak = pow(vNoise2(vec2f(uv.x * 39.0, uv.y * 2.3) + tSeed), 3.0);
  let waterline = select(0.0, exp(-abs(worldY - waterLevel - 0.045) / 0.08), hasWater);
  color *= 1.0 - mineral * 0.13 - streak * 0.065 - waterline * 0.20;

  // Subtle fired edge micro-chips & mineral scale deposits (close-up realism).
  let chip = (1.0 - smoothstep(0.001, 0.008, t.edge)) * smoothstep(0.60, 0.84, vNoise2(uv * 217.0 + tSeed));
  color = mix(color, color * 0.44, chip * 0.32 * detail);
  let scaleDeposit = smoothstep(0.58, 0.79, vNoise2(uv * 17.3 + tSeed) + vNoise2(uv * 61.7 - tSeed) * 0.14) * (0.18 + 0.62 * mineral);
  color = mix(color, mix(color, vec3f(0.71, 0.71, 0.62), 0.5), scaleDeposit * 0.22);
  color *= 1.0 + (vNoise2(uv * 491.3 + tSeed) - 0.5) * 0.032 * detail;

  // Recessed warm cement mortar (soft natural ceramic grout matching v1 porcelain.wgsl, never harsh CAD black lines!).
  let dirt = vFbm2(uv * 71.9 + tSeed);
  let groutBase = select(
    vec3f(0.255, 0.265, 0.225) * (0.72 + 0.28 * dirt) * (1.0 - waterline * 0.22),
    vec3f(0.030, 0.078, 0.065) * (0.72 + 0.28 * dirt),
    preset == 16u,
  );
  let albedo = mix(color, groutBase, inGrout);

  // Per-tile glaze roughness (0.09..0.22 like v1 porcelain!) + isotropic slope-moment NDF broadening.
  let baseTileRough = clamp(baseRough + (t.id - 0.5) * 0.12 + scaleDeposit * 0.12 + mineral * 0.055, 0.065, 0.50);
  let momentRough = min(0.92, pow(pow(baseTileRough, 4.0) + slopeVar.x + slopeVar.y, 0.25));
  let rough = mix(momentRough, 0.88, inGrout);
  let coat = mix(m.pbr.z, 0.0, inGrout);
  let ao = mix(1.0, 0.82, inGrout);

  return CeramicEval(true, albedo, rough, coat, ao, slope, inGrout);
}

// Fast secondary-ray ceramic evaluation (used by water refraction, water reflection & BVH glossy bounces).
fn evalAnalyticCeramic(uv: vec2f, m: MaterialGPU, baseAlbedo: vec3f, baseRough: f32, fwUV: vec2f) -> CeramicEval {
  let preset = u32(m.extra.x + 0.5);
  if (!isCeramicPreset(preset)) {
    return CeramicEval(false, baseAlbedo, baseRough, m.pbr.z, 1.0, vec2f(0.0), 0.0);
  }
  let freq = ceramicGridFreq(preset, m.albedoScale.w);
  let tileSize = 1.0 / max(freq, 0.25);
  let seed = m.extra.z;
  let g = uv * freq;
  let cell = floor(uv / tileSize);
  let id = vHash2(cell + vec2f(seed * 17.19, 0.0));

  let groutHalf = select(0.0020, 0.0012, preset == 2u);
  let lineWFrac = (groutHalf * 2.0) * freq;
  let inGrout = filteredGridCoverage(g, fwUV * freq, lineWFrac);

  let batchWarm = mix(vec3f(0.82, 0.85, 0.78), vec3f(1.10, 1.07, 0.99), id * 0.68 + 0.16);
  let tileCol = baseAlbedo * batchWarm;
  let groutBase = select(vec3f(0.245, 0.255, 0.215), vec3f(0.030, 0.078, 0.065), preset == 16u);
  let albedo = mix(tileCol, groutBase, inGrout);
  let rough = mix(clamp(baseRough + (id - 0.5) * 0.10, 0.08, 0.52), 0.88, inGrout);
  return CeramicEval(true, albedo, rough, mix(m.pbr.z, 0.0, inGrout), mix(1.0, 0.82, inGrout), vec2f(0.0), inGrout);
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

// Subtle fine-scale capillary-gravity tail used ONLY outside the active local finite-depth + FFT
// simulation window (far distant tunnel water >10m away) so there is zero giant-wavelength jello.
fn evalFarCapillarySlope(p: vec2f, t: f32, depth: f32, amp: f32) -> vec2f {
  let H = max(depth, 0.25);
  let dirs = array<vec2f, 6>(
    vec2f( 11.4,   5.8),
    vec2f( -8.6,  12.2),
    vec2f( 15.8, -10.6),
    vec2f(-17.4, -13.2),
    vec2f( 21.6,  14.8),
    vec2f(-23.2,  18.4),
  );
  let weights = array<f32, 6>(0.26, 0.23, 0.18, 0.14, 0.11, 0.08);
  let phases = array<f32, 6>(0.7, 2.3, 4.1, 1.4, 5.2, 3.6);

  var slope = vec2f(0.0);
  for (var i = 0; i < 6; i++) {
    let kv = dirs[i];
    let k = length(kv);
    let omega = sqrt((9.81 * k + 0.000073 * k * k * k) * tanh(k * H));
    let phase = dot(kv, p) - omega * t + phases[i];
    slope += (kv / k) * (cos(phase) * weights[i]);
  }
  return slope * amp;
}

// Procedural botanical hanging/climbing ivy vine silhouette (slender winding woody stem +
// staggered pointed 3-lobed ivy leaves with central leaf veins). Returns vec2f(alpha, shade):
// alpha < 0.5 discards transparent air gaps in both G-buffer rendering and BVH shadow rays!
fn evalFoliageVine(uv: vec2f) -> vec2f {
  let u = clamp(uv.x, 0.0, 1.0);
  let v = uv.y;
  let stemX = 0.50 + 0.08 * sin(v * 2.8) + 0.035 * cos(v * 6.5);
  let stemD = abs(u - stemX);
  var alpha = select(0.0, 1.0, stemD < 0.020);
  var shade = select(0.50, 0.30, stemD < 0.020);

  let cellFreq = 3.6;
  let baseCell = floor(v * cellFreq);
  for (var di = -1; di <= 1; di++) {
    let cid = baseCell + f32(di);
    let h1 = vHash2(vec2f(cid, 11.7));
    let h2 = vHash2(vec2f(cid, 37.3));
    let h3 = vHash2(vec2f(cid, 73.1));
    let side = select(-1.0, 1.0, (i32(cid) & 1) == 0);
    for (var sub = 0; sub < 3; sub++) {
      let sh = select(select(h1, h2, sub == 1), h3, sub == 2);
      let sh2 = select(select(h2, h3, sub == 1), h1, sub == 2);
      let sgn = select(select(side, -side * 0.85, sub == 1), side * 0.35, sub == 2);
      let lcV = (cid + 0.18 + 0.68 * sh2) / cellFreq;
      let reach = select(0.16 + 0.20 * sh, 0.07 + 0.10 * sh, sub == 2);
      let lcU = stemX + sgn * reach;
      // Thin leaf petiole connecting leaf base to main vine stem
      let petT = clamp((u - stemX) / select(lcU - stemX, 1e-4, abs(lcU - stemX) < 1e-4), 0.0, 1.0);
      let petV = mix(lcV + 0.03, lcV, petT);
      if (abs(v - petV) * cellFreq < 0.055 && petT > 0.02 && petT < 0.95) {
        alpha = 1.0;
        shade = max(shade, 0.36);
      }
      let ang = sgn * (0.45 + 0.85 * sh) + select(0.0, 0.35, sub == 1);
      let ca = cos(ang);
      let sa = sin(ang);
      let du = u - lcU;
      let dv = (v - lcV) * 0.85;
      let lx = du * ca + dv * sa;
      let ly = -du * sa + dv * ca;
      let lSize = select(0.115 + 0.075 * sh, 0.085 + 0.055 * sh, sub == 2);
      let nx = lx / lSize;
      let ny = ly / (lSize * 0.84);
      // Pointed 3-lobed ivy heart leaf: tapers sharply toward +nx tip, slight basal indent at -nx
      let taper = max(0.16, 1.0 - max(0.0, nx) * 0.72);
      let lobe = 1.0 + 0.16 * cos(atan2(ny, nx + 0.24 + 1e-4) * 3.0);
      let d2 = (nx * nx) / (lobe * lobe) + (ny * ny) / (taper * taper * lobe * lobe);
      if (d2 < 1.0) {
        alpha = 1.0;
        let vein = exp(-abs(ny) * 14.0) * 0.20 + (1.0 - sqrt(max(0.0, d2))) * 0.24;
        shade = max(shade, 0.58 + 0.52 * sh + vein);
      }
    }
  }
  return vec2f(alpha, shade);
}

// Ultra-lightweight register-free dappled foliage shadow alpha test for BVH shadow rays (zero loops / atan2).
fn evalFoliageShadowAlpha(uv: vec2f) -> f32 {
  let stem = abs(uv.x - (0.50 + 0.08 * sin(uv.y * 2.8)));
  if (stem < 0.025) { return 1.0; }
  let edge = 1.0 - smoothstep(0.24, 0.48, abs(uv.x - 0.50));
  return select(0.0, 1.0, vNoise2(vec2f(uv.x * 5.6, uv.y * 8.2)) * edge > 0.34);
}




