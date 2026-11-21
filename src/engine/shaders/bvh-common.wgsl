// Shared flat SAH BVH traversal, physical sky evaluation, and RNG helpers.
// Prepended to bake-lightmap.wgsl and volumetric.wgsl.

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
};

struct AreaLight {
  originArea: vec4f,   // xyz = corner p0, w = area
  edgeUPower: vec4f,   // xyz = p1 - p0, w = radiant power
  edgeVKind: vec4f,    // xyz = p3 - p0, w = kind (0 area, 1 skylight)
  radianceCdf: vec4f,  // rgb = radiance, w = CDF upper bound
};

struct MaterialGPU {
  albedoScale: vec4f,
  pbr: vec4f,
  emissive: vec4f,
  extra: vec4f,
};

struct EnvUniform {
  sunDirRad: vec4f,    // xyz = normalized dir toward sun, w = angular radius
  sunColorInt: vec4f,  // rgb = sun color * intensity, w = sunEnabled (0 or 1)
  skyTop: vec4f,       // rgb = zenith radiance, w = ambientFloor
  skyHorizon: vec4f,   // rgb = horizon radiance, w = lightCount (as f32)
  counts: vec4u,       // x = atlasSize, y = batchIndex, z = samplesPerBatch, w = totalLightPowerBits/triCount
  extra: vec4f,        // x = totalLightPower, y = bounceBoost, z = aoRadius, w = time
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

fn evalSky(rd: vec3f, env: EnvUniform) -> vec3f {
  let up = clamp(rd.y, 0.0, 1.0);
  var col = mix(env.skyHorizon.rgb, env.skyTop.rgb, pow(up, 0.55));
  if (env.sunColorInt.w > 0.5) {
    let cosA = max(dot(rd, env.sunDirRad.xyz), 0.0);
    // Subtle circumsolar atmospheric glow (actual sun disc is sampled via NEE).
    col += env.sunColorInt.rgb * (0.04 * pow(cosA, 24.0) + 0.012 * pow(cosA, 4.0));
  }
  return col;
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
};
