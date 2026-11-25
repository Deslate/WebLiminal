// Startup GPU Procedural PBR Texture Synthesizer.
// Bakes all materials used by the active level into 2D texture arrays once on load
// (zero bitmap assets). All noise is strictly periodic so textures tile seamlessly.

struct MaterialGPU {
  albedoScale: vec4f, // rgb = linear albedo * tint, w = tileScale
  pbr: vec4f,         // x = roughness, y = metallic, z = coat, w = pomDepth
  emissive: vec4f,    // rgb = emissive color, w = emissive strength
  extra: vec4f,        // x = presetId, y = wetness, z = seed, w = flicker
};

@group(0) @binding(0) var<storage, read> materials: array<MaterialGPU>;
@group(0) @binding(1) var<uniform> info: vec4u; // x = texSize, y = layerCount
@group(0) @binding(2) var outAlbedoRough: texture_storage_2d_array<rgba8unorm, write>;
@group(0) @binding(3) var outNormalHeight: texture_storage_2d_array<rgba8unorm, write>;
@group(0) @binding(4) var outMeta: texture_storage_2d_array<rgba8unorm, write>;

fn hash21(p: vec2f) -> f32 {
  let q = fract(p * vec2f(123.34, 456.21));
  let d = dot(q, q + 45.32);
  return fract(d * (q.x + q.y));
}

fn hash22(p: vec2f) -> vec2f {
  let k = vec2f(dot(p, vec2f(127.1, 311.7)), dot(p, vec2f(269.5, 183.3)));
  return fract(sin(k) * 43758.5453);
}

// Strictly periodic value noise on [0, period)^2 for seamless texture tiling.
fn pNoise(uv: vec2f, period: vec2f, seed: f32) -> f32 {
  let p = uv * period;
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let i00 = ((i % period) + period) % period;
  let i10 = (((i + vec2f(1.0, 0.0)) % period) + period) % period;
  let i01 = (((i + vec2f(0.0, 1.0)) % period) + period) % period;
  let i11 = (((i + vec2f(1.0, 1.0)) % period) + period) % period;
  let a = hash21(i00 + seed * 17.3);
  let b = hash21(i10 + seed * 17.3);
  let c = hash21(i01 + seed * 17.3);
  let d = hash21(i11 + seed * 17.3);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn pFbm(uv: vec2f, basePeriod: vec2f, seed: f32, octaves: i32) -> f32 {
  var sum = 0.0;
  var amp = 0.5;
  var per = basePeriod;
  var norm = 0.0;
  for (var o = 0; o < octaves; o++) {
    sum += amp * pNoise(uv, per, seed + f32(o) * 3.17);
    norm += amp;
    per *= 2.0;
    amp *= 0.5;
  }
  return sum / norm;
}

struct Sample {
  albedo: vec3f,
  roughness: f32,
  height: f32,
  ao: f32,
  metallic: f32,
  coat: f32,
  emissiveMask: f32,
  wetness: f32,
  slopeBias: vec2f, // extra subtle analytic normal tilt (e.g., per-tile ceramic tilt)
};

// Signed distance to a rounded box for clean procedural lettering & shapes.
fn sdBox(p: vec2f, b: vec2f) -> f32 {
  let q = abs(p) - b;
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0);
}

fn sdSegment(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

// Crisp procedural "EXIT" mask in UV [0..1]^2.
fn exitLetters(uv: vec2f) -> f32 {
  // Flip V so upright in world space (+V up)
  let p = vec2f(uv.x, uv.y) - vec2f(0.5);
  var d = 1e6;
  let th = 0.022;
  // E centered around x = -0.27
  let pe = p - vec2f(-0.27, 0.0);
  d = min(d, sdSegment(pe, vec2f(-0.055, -0.17), vec2f(-0.055, 0.17)));
  d = min(d, sdSegment(pe, vec2f(-0.055, 0.17), vec2f(0.055, 0.17)));
  d = min(d, sdSegment(pe, vec2f(-0.055, 0.0), vec2f(0.04, 0.0)));
  d = min(d, sdSegment(pe, vec2f(-0.055, -0.17), vec2f(0.055, -0.17)));
  // X centered around x = -0.07
  let px = p - vec2f(-0.07, 0.0);
  d = min(d, sdSegment(px, vec2f(-0.055, -0.17), vec2f(0.055, 0.17)));
  d = min(d, sdSegment(px, vec2f(-0.055, 0.17), vec2f(0.055, -0.17)));
  // I centered around x = 0.10
  let pi = p - vec2f(0.10, 0.0);
  d = min(d, sdSegment(pi, vec2f(0.0, -0.17), vec2f(0.0, 0.17)));
  d = min(d, sdSegment(pi, vec2f(-0.035, 0.17), vec2f(0.035, 0.17)));
  d = min(d, sdSegment(pi, vec2f(-0.035, -0.17), vec2f(0.035, -0.17)));
  // T centered around x = 0.27
  let pt = p - vec2f(0.27, 0.0);
  d = min(d, sdSegment(pt, vec2f(0.0, -0.17), vec2f(0.0, 0.17)));
  d = min(d, sdSegment(pt, vec2f(-0.065, 0.17), vec2f(0.065, 0.17)));
  return 1.0 - smoothstep(th - 0.008, th + 0.008, d);
}

// Calligraphic brush stroke SDF: arched quadratic spine + press-lift-press width taper (顿笔-行笔-收笔).
fn sdBrush(p: vec2f, a: vec2f, b: vec2f, bow: f32, w0: f32, wm: f32, w1: f32) -> f32 {
  let ba = b - a;
  let len2 = max(dot(ba, ba), 1e-5);
  let dir = ba * inverseSqrt(len2);
  let perp = vec2f(-dir.y, dir.x);
  let t = clamp(dot(p - a, ba) / len2, 0.0, 1.0);
  let c = a + ba * t + perp * (4.0 * t * (1.0 - t) * bow);
  let u = 1.0 - t;
  let w = u * u * w0 + 2.0 * u * t * wm + t * t * w1;
  return length(p - c) - w;
}

// Hand-brushed Chinese calligraphy (行楷手写体) for the 8 couplet glyphs (富贵由天 / 平安是福).
// Horizontals slant naturally upward left-to-right with curved arches and tapered brush entry/exit.
fn coupletGlyphDist(uIn: vec2f, id: u32) -> f32 {
  // Subtle organic hand posture tilt & slight brush-paper wobble
  let tilt = select(-0.045, 0.045, (id & 1u) == 0u);
  let p0 = uIn - vec2f(0.5);
  let u = vec2f(p0.x - p0.y * tilt, p0.y + p0.x * tilt * 0.5) + vec2f(0.5);
  var d = 10.0;
  switch (id & 7u) {
    case 0u: { // 富
      d = min(d, sdBrush(u, vec2f(0.45, 0.94), vec2f(0.54, 0.84), 0.015, 0.022, 0.048, 0.056));
      d = min(d, sdBrush(u, vec2f(0.20, 0.82), vec2f(0.12, 0.69), -0.025, 0.042, 0.046, 0.022));
      d = min(d, sdBrush(u, vec2f(0.20, 0.80), vec2f(0.84, 0.84), 0.028, 0.042, 0.030, 0.054));
      d = min(d, sdBrush(u, vec2f(0.84, 0.84), vec2f(0.76, 0.72), 0.018, 0.050, 0.036, 0.016));
      d = min(d, sdBrush(u, vec2f(0.30, 0.70), vec2f(0.71, 0.73), 0.018, 0.046, 0.028, 0.048));
      d = min(d, sdBrush(u, vec2f(0.31, 0.61), vec2f(0.34, 0.47), -0.012, 0.044, 0.032, 0.040));
      d = min(d, sdBrush(u, vec2f(0.32, 0.60), vec2f(0.70, 0.63), 0.020, 0.038, 0.028, 0.048));
      d = min(d, sdBrush(u, vec2f(0.69, 0.62), vec2f(0.66, 0.49), 0.014, 0.046, 0.034, 0.040));
      d = min(d, sdBrush(u, vec2f(0.34, 0.48), vec2f(0.67, 0.50), 0.012, 0.040, 0.026, 0.044));
      d = min(d, sdBrush(u, vec2f(0.22, 0.40), vec2f(0.26, 0.11), -0.018, 0.048, 0.034, 0.046));
      d = min(d, sdBrush(u, vec2f(0.23, 0.39), vec2f(0.79, 0.43), 0.026, 0.044, 0.028, 0.054));
      d = min(d, sdBrush(u, vec2f(0.78, 0.42), vec2f(0.74, 0.11), 0.022, 0.052, 0.036, 0.048));
      d = min(d, sdBrush(u, vec2f(0.26, 0.26), vec2f(0.74, 0.29), 0.016, 0.038, 0.024, 0.042));
      d = min(d, sdBrush(u, vec2f(0.51, 0.40), vec2f(0.50, 0.13), -0.010, 0.046, 0.030, 0.042));
      d = min(d, sdBrush(u, vec2f(0.25, 0.12), vec2f(0.76, 0.14), 0.015, 0.044, 0.030, 0.050));
    }
    case 1u: { // 贵
      d = min(d, sdBrush(u, vec2f(0.26, 0.85), vec2f(0.29, 0.69), -0.014, 0.044, 0.032, 0.040));
      d = min(d, sdBrush(u, vec2f(0.27, 0.84), vec2f(0.74, 0.88), 0.022, 0.040, 0.028, 0.050));
      d = min(d, sdBrush(u, vec2f(0.73, 0.87), vec2f(0.69, 0.71), 0.016, 0.048, 0.034, 0.040));
      d = min(d, sdBrush(u, vec2f(0.29, 0.70), vec2f(0.71, 0.73), 0.014, 0.040, 0.026, 0.044));
      d = min(d, sdBrush(u, vec2f(0.50, 0.95), vec2f(0.49, 0.59), -0.012, 0.054, 0.034, 0.044));
      d = min(d, sdBrush(u, vec2f(0.11, 0.56), vec2f(0.89, 0.62), 0.032, 0.050, 0.030, 0.056));
      d = min(d, sdBrush(u, vec2f(0.27, 0.49), vec2f(0.28, 0.22), -0.016, 0.046, 0.032, 0.038));
      d = min(d, sdBrush(u, vec2f(0.28, 0.48), vec2f(0.73, 0.52), 0.020, 0.040, 0.026, 0.050));
      d = min(d, sdBrush(u, vec2f(0.72, 0.51), vec2f(0.71, 0.23), 0.018, 0.048, 0.034, 0.042));
      d = min(d, sdBrush(u, vec2f(0.50, 0.43), vec2f(0.45, 0.21), -0.028, 0.044, 0.032, 0.028));
      d = min(d, sdBrush(u, vec2f(0.45, 0.22), vec2f(0.17, 0.07), -0.040, 0.038, 0.032, 0.014));
      d = min(d, sdBrush(u, vec2f(0.55, 0.22), vec2f(0.84, 0.08), 0.028, 0.026, 0.046, 0.058));
    }
    case 2u: { // 由
      d = min(d, sdBrush(u, vec2f(0.49, 0.94), vec2f(0.50, 0.15), -0.018, 0.056, 0.034, 0.044));
      d = min(d, sdBrush(u, vec2f(0.19, 0.68), vec2f(0.24, 0.14), -0.024, 0.050, 0.034, 0.048));
      d = min(d, sdBrush(u, vec2f(0.20, 0.66), vec2f(0.81, 0.72), 0.030, 0.044, 0.028, 0.056));
      d = min(d, sdBrush(u, vec2f(0.80, 0.71), vec2f(0.76, 0.14), 0.024, 0.054, 0.036, 0.048));
      d = min(d, sdBrush(u, vec2f(0.24, 0.41), vec2f(0.76, 0.45), 0.020, 0.040, 0.026, 0.044));
      d = min(d, sdBrush(u, vec2f(0.23, 0.15), vec2f(0.77, 0.18), 0.018, 0.046, 0.030, 0.052));
    }
    case 3u: { // 天
      d = min(d, sdBrush(u, vec2f(0.21, 0.80), vec2f(0.79, 0.86), 0.028, 0.050, 0.032, 0.056));
      d = min(d, sdBrush(u, vec2f(0.14, 0.52), vec2f(0.86, 0.58), 0.032, 0.050, 0.030, 0.058));
      d = min(d, sdBrush(u, vec2f(0.51, 0.83), vec2f(0.46, 0.45), -0.025, 0.054, 0.036, 0.038));
      d = min(d, sdBrush(u, vec2f(0.46, 0.46), vec2f(0.14, 0.09), -0.070, 0.042, 0.036, 0.014));
      d = min(d, sdBrush(u, vec2f(0.47, 0.47), vec2f(0.87, 0.10), 0.068, 0.028, 0.046, 0.066));
    }
    case 4u: { // 平
      d = min(d, sdBrush(u, vec2f(0.21, 0.82), vec2f(0.80, 0.88), 0.028, 0.050, 0.032, 0.056));
      d = min(d, sdBrush(u, vec2f(0.24, 0.72), vec2f(0.35, 0.56), 0.022, 0.026, 0.044, 0.052));
      d = min(d, sdBrush(u, vec2f(0.77, 0.74), vec2f(0.64, 0.55), -0.028, 0.050, 0.036, 0.016));
      d = min(d, sdBrush(u, vec2f(0.11, 0.44), vec2f(0.89, 0.51), 0.034, 0.052, 0.030, 0.060));
      d = min(d, sdBrush(u, vec2f(0.51, 0.84), vec2f(0.49, 0.07), -0.016, 0.056, 0.038, 0.014));
    }
    case 5u: { // 安
      d = min(d, sdBrush(u, vec2f(0.46, 0.94), vec2f(0.54, 0.84), 0.014, 0.022, 0.048, 0.054));
      d = min(d, sdBrush(u, vec2f(0.20, 0.81), vec2f(0.13, 0.67), -0.024, 0.044, 0.046, 0.020));
      d = min(d, sdBrush(u, vec2f(0.20, 0.79), vec2f(0.84, 0.84), 0.028, 0.042, 0.030, 0.054));
      d = min(d, sdBrush(u, vec2f(0.84, 0.84), vec2f(0.75, 0.70), 0.020, 0.050, 0.034, 0.016));
      d = min(d, sdBrush(u, vec2f(0.49, 0.74), vec2f(0.33, 0.36), -0.042, 0.050, 0.036, 0.038));
      d = min(d, sdBrush(u, vec2f(0.33, 0.36), vec2f(0.77, 0.12), 0.036, 0.034, 0.044, 0.058));
      d = min(d, sdBrush(u, vec2f(0.67, 0.61), vec2f(0.20, 0.09), -0.080, 0.048, 0.038, 0.016));
      d = min(d, sdBrush(u, vec2f(0.11, 0.51), vec2f(0.89, 0.57), 0.030, 0.048, 0.028, 0.056));
    }
    case 6u: { // 是
      d = min(d, sdBrush(u, vec2f(0.28, 0.88), vec2f(0.31, 0.61), -0.014, 0.046, 0.032, 0.042));
      d = min(d, sdBrush(u, vec2f(0.29, 0.87), vec2f(0.72, 0.91), 0.022, 0.042, 0.028, 0.050));
      d = min(d, sdBrush(u, vec2f(0.71, 0.90), vec2f(0.68, 0.62), 0.018, 0.048, 0.034, 0.042));
      d = min(d, sdBrush(u, vec2f(0.31, 0.74), vec2f(0.69, 0.77), 0.016, 0.036, 0.024, 0.040));
      d = min(d, sdBrush(u, vec2f(0.31, 0.61), vec2f(0.69, 0.64), 0.016, 0.040, 0.026, 0.044));
      d = min(d, sdBrush(u, vec2f(0.12, 0.47), vec2f(0.88, 0.53), 0.032, 0.050, 0.030, 0.058));
      d = min(d, sdBrush(u, vec2f(0.50, 0.49), vec2f(0.49, 0.19), -0.012, 0.050, 0.034, 0.040));
      d = min(d, sdBrush(u, vec2f(0.50, 0.34), vec2f(0.76, 0.38), 0.018, 0.040, 0.028, 0.046));
      d = min(d, sdBrush(u, vec2f(0.32, 0.39), vec2f(0.16, 0.10), -0.042, 0.044, 0.034, 0.014));
      d = min(d, sdBrush(u, vec2f(0.27, 0.27), vec2f(0.88, 0.10), 0.064, 0.026, 0.044, 0.064));
    }
    default: { // 7: 福
      d = min(d, sdBrush(u, vec2f(0.20, 0.90), vec2f(0.29, 0.79), 0.015, 0.022, 0.046, 0.052));
      d = min(d, sdBrush(u, vec2f(0.10, 0.69), vec2f(0.35, 0.73), 0.018, 0.042, 0.028, 0.046));
      d = min(d, sdBrush(u, vec2f(0.34, 0.72), vec2f(0.10, 0.41), -0.048, 0.044, 0.034, 0.014));
      d = min(d, sdBrush(u, vec2f(0.24, 0.56), vec2f(0.23, 0.10), -0.014, 0.048, 0.034, 0.036));
      d = min(d, sdBrush(u, vec2f(0.25, 0.53), vec2f(0.37, 0.43), 0.014, 0.024, 0.040, 0.046));
      d = min(d, sdBrush(u, vec2f(0.43, 0.82), vec2f(0.87, 0.87), 0.024, 0.046, 0.028, 0.052));
      d = min(d, sdBrush(u, vec2f(0.48, 0.71), vec2f(0.50, 0.56), -0.010, 0.040, 0.028, 0.036));
      d = min(d, sdBrush(u, vec2f(0.49, 0.70), vec2f(0.83, 0.73), 0.018, 0.036, 0.026, 0.044));
      d = min(d, sdBrush(u, vec2f(0.82, 0.72), vec2f(0.80, 0.57), 0.012, 0.044, 0.032, 0.038));
      d = min(d, sdBrush(u, vec2f(0.50, 0.56), vec2f(0.80, 0.59), 0.012, 0.036, 0.024, 0.040));
      d = min(d, sdBrush(u, vec2f(0.44, 0.45), vec2f(0.47, 0.12), -0.016, 0.044, 0.032, 0.042));
      d = min(d, sdBrush(u, vec2f(0.45, 0.44), vec2f(0.87, 0.48), 0.022, 0.040, 0.026, 0.050));
      d = min(d, sdBrush(u, vec2f(0.86, 0.47), vec2f(0.83, 0.12), 0.018, 0.048, 0.034, 0.044));
      d = min(d, sdBrush(u, vec2f(0.47, 0.28), vec2f(0.84, 0.31), 0.014, 0.036, 0.024, 0.038));
      d = min(d, sdBrush(u, vec2f(0.66, 0.45), vec2f(0.65, 0.14), -0.010, 0.042, 0.028, 0.038));
      d = min(d, sdBrush(u, vec2f(0.47, 0.13), vec2f(0.84, 0.16), 0.014, 0.040, 0.028, 0.046));
    }
  }
  return d;
}

// Hand-scrawled Taoist door talisman / wild cursive strokes (狂草符箓) for the two small door strips.
fn talismanCursiveDist(uv: vec2f, variant: f32) -> f32 {
  let s = select(1.0, -1.0, variant > 4.5);
  let p = vec2f(0.5 + (uv.x - 0.5) * s, uv.y);
  var d = 10.0;
  // Triple-flick talisman crown (三勾符头)
  d = min(d, sdBrush(p, vec2f(0.24, 0.87), vec2f(0.42, 0.80), 0.05, 0.028, 0.020, 0.014));
  d = min(d, sdBrush(p, vec2f(0.48, 0.90), vec2f(0.52, 0.77), -0.04, 0.034, 0.022, 0.016));
  d = min(d, sdBrush(p, vec2f(0.76, 0.86), vec2f(0.58, 0.79), -0.05, 0.028, 0.020, 0.014));
  // Wild sweeping cross-bars & continuous S-curve spine
  d = min(d, sdBrush(p, vec2f(0.18, 0.74), vec2f(0.84, 0.78), 0.04, 0.034, 0.020, 0.036));
  d = min(d, sdBrush(p, vec2f(0.78, 0.76), vec2f(0.24, 0.62), -0.09, 0.026, 0.018, 0.028));
  d = min(d, sdBrush(p, vec2f(0.24, 0.62), vec2f(0.78, 0.54), 0.08, 0.030, 0.022, 0.034));
  d = min(d, sdBrush(p, vec2f(0.76, 0.53), vec2f(0.26, 0.42), -0.10, 0.028, 0.020, 0.032));
  d = min(d, sdBrush(p, vec2f(0.26, 0.42), vec2f(0.74, 0.34), 0.09, 0.032, 0.020, 0.030));
  d = min(d, sdBrush(p, vec2f(0.68, 0.33), vec2f(0.32, 0.21), -0.08, 0.028, 0.022, 0.026));
  // Piercing central cursive spine flicking downward
  d = min(d, sdBrush(p, vec2f(0.52, 0.80), vec2f(0.46, 0.13), 0.06, 0.036, 0.022, 0.010));
  // Lower coiled talisman tail & ink flicks
  d = min(d, sdBrush(p, vec2f(0.20, 0.25), vec2f(0.82, 0.28), 0.05, 0.026, 0.018, 0.032));
  d = min(d, sdBrush(p, vec2f(0.32, 0.20), vec2f(0.76, 0.14), 0.06, 0.024, 0.020, 0.012));
  return d;
}

fn evalCeramicBase(uv: vec2f, m: MaterialGPU) -> Sample {
  let seed = m.extra.z;
  // Low-frequency organic ceramic glaze mottling, subtle mineral deposit, and gentle glaze undulation.
  // Razor-sharp millimeter grout seams, bevels, and per-tile 3D micro-tilt are evaluated analytically
  // per-pixel at infinite resolution so ceramic tiles never blur into thick grey grids!
  let macroVar = pFbm(uv, vec2f(2.0), seed + 1.3, 3);
  let glazeRipple = pFbm(uv, vec2f(6.0), seed + 4.7, 3);
  let fineGrain = pFbm(uv, vec2f(16.0), seed + 9.1, 2);
  let mineral = smoothstep(0.60, 0.88, pFbm(uv, vec2f(3.0), seed + 13.5, 3));

  let col = m.albedoScale.rgb * (0.955 + 0.085 * macroVar) * (1.0 - mineral * 0.045);
  let rough = clamp(m.pbr.x + (glazeRipple - 0.5) * 0.035 + mineral * 0.04, 0.04, 0.90);
  let height = clamp(0.55 + (glazeRipple - 0.5) * 0.08 + (fineGrain - 0.5) * 0.03, 0.0, 1.0);
  let ao = 0.96 + 0.04 * macroVar;
  return Sample(col, rough, height, ao, 0.0, m.pbr.z, 0.0, m.extra.y, vec2f(0.0));
}

fn evalMaterial(uv: vec2f, m: MaterialGPU) -> Sample {
  let preset = u32(m.extra.x + 0.5);
  let seed = m.extra.z;
  let baseCol = m.albedoScale.rgb;
  let baseRough = m.pbr.x;

  // 0: tile_white, 1: tile_pool, 2: tile_mosaic, 16: tile_dado_green
  // (organic glaze base baked here; crisp millimeter joints & per-tile tilt computed analytically!)
  if (preset == 0u || preset == 1u || preset == 2u || preset == 16u) {
    return evalCeramicBase(uv, m);
  }
  // 3: plaster_warm
  if (preset == 3u) {
    let n1 = pFbm(uv, vec2f(4.0), seed, 4);
    let n2 = pFbm(uv, vec2f(16.0), seed + 4.0, 3);
    let h = 0.5 + (n1 - 0.5) * 0.22 + (n2 - 0.5) * 0.14;
    let col = baseCol * (0.90 + 0.18 * n1) * (0.96 + 0.08 * n2);
    return Sample(col, clamp(baseRough + (n2 - 0.5) * 0.12, 0.4, 0.98), h, 0.92 + 0.08 * n1, 0.0, m.pbr.z, 0.0, 0.0, vec2f(0.0));
  }
  // 4: wallpaper_yellow (4 authentic Backrooms wallpaper patterns selected by seed!)
  if (preset == 4u) {
    var pattern = 0.0;
    if (seed < 15.0) {
      // Variant A: iconic fine 12 cm vertical chevron/arrow damask (2002 original photo right wall!)
      let rep = vec2f(10.0, 6.0);
      let cell = fract(uv * rep);
      let dx = abs(cell.x - 0.5);
      let stripe = 1.0 - smoothstep(0.055, 0.095, dx);
      let cx = dx * 2.0;
      let cy = cell.y;
      let chev1 = abs((cy - 0.25) - cx * 0.42);
      let chev2 = abs((cy - 0.72) - cx * 0.42);
      let motif = (1.0 - smoothstep(0.024, 0.052, min(chev1, chev2))) * (1.0 - smoothstep(0.42, 0.62, cx));
      let stem = (1.0 - smoothstep(0.04, 0.075, abs(cell.x - 0.5))) * 0.35;
      let dotRow = 1.0 - smoothstep(0.04, 0.075, length(vec2f(cell.x - 0.0, fract(cell.y * 3.0) - 0.5) * vec2f(1.2, 0.8)));
      pattern = clamp(motif * 0.78 + stem + stripe * 0.22 + dotRow * 0.42, 0.0, 1.0);
    } else if (seed < 30.0) {
      // Variant B: fine vintage vertical micro-dot columns (2002 original photo left wall!)
      let rep = vec2f(12.0, 12.0);
      let cell = fract(uv * rep);
      let dot1 = 1.0 - smoothstep(0.06, 0.12, length(cell - vec2f(0.5, 0.5)));
      let dot2 = 1.0 - smoothstep(0.05, 0.10, length(cell - vec2f(0.0, 0.0)));
      let faintStripe = 1.0 - smoothstep(0.06, 0.14, abs(cell.x - 0.5));
      pattern = clamp(max(dot1, dot2) * 0.68 + faintStripe * 0.16, 0.0, 1.0);
    } else if (seed < 45.0) {
      // Variant C: fine repeating vertical beige-olive pinstripe (2002 original midground partition!)
      let rep = vec2f(16.0, 4.0);
      let cell = fract(uv * rep);
      let s1 = 1.0 - smoothstep(0.06, 0.12, abs(cell.x - 0.25));
      let s2 = 1.0 - smoothstep(0.03, 0.07, abs(cell.x - 0.75));
      pattern = clamp(s1 * 0.55 + s2 * 0.35, 0.0, 1.0);
    } else {
      // Variant D: large vintage Baroque floral/medallion damask (Kane Pixels Pier Hall & Corridor!)
      let rep = vec2f(3.0, 3.0);
      let p = uv * rep;
      let stagger = vec2f(0.5 * floor(p.y), 0.0);
      let cell = fract(p + stagger) - 0.5;
      let ax = abs(cell.x);
      let ay = abs(cell.y);
      let r = length(cell * vec2f(1.25, 0.92));
      let ang = atan2(cell.y, cell.x);
      let petal = 0.28 + 0.075 * cos(ang * 4.0) + 0.04 * cos(ang * 8.0);
      let medallion = (1.0 - smoothstep(petal - 0.05, petal + 0.03, r)) * smoothstep(0.04, 0.11, r);
      let innerStar = 1.0 - smoothstep(0.05, 0.10, length(cell * vec2f(1.4, 1.0)));
      let scroll = (1.0 - smoothstep(0.03, 0.075, abs(ax - 0.38 - 0.06 * sin(cell.y * 12.566)))) * smoothstep(0.48, 0.12, ay);
      let leafCrown = 1.0 - smoothstep(0.04, 0.095, length(vec2f(ax * 1.4, ay - 0.36)));
      pattern = clamp(medallion * 0.55 + innerStar * 0.48 + scroll * 0.36 + leafCrown * 0.42, 0.0, 1.0);
    }

    let blotch = pFbm(uv, vec2f(2.0), seed + 2.0, 3);
    let fiber = pFbm(uv, vec2f(40.0, 10.0), seed + 11.0, 3);

    // Luminous mono-yellow ground with organic tonal damask print
    var col = baseCol * mix(vec3f(1.03, 1.02, 0.98), vec3f(0.76, 0.72, 0.50), pattern);
    col *= 0.94 + 0.11 * blotch;
    col *= 0.96 + 0.08 * fiber;

    let h = 0.52 + pattern * 0.055 + (fiber - 0.5) * 0.08;
    let rough = clamp(baseRough - pattern * 0.12 + (fiber - 0.5) * 0.06, 0.54, 0.94);
    let ao = 0.94 + 0.06 * fiber;
    return Sample(col, rough, clamp(h, 0.0, 1.0), ao, 0.0, pattern * 0.08, 0.0, 0.04, vec2f(0.0));
  }
  // 5: carpet_damp (tactile broadloom commercial wool-loop pile carpet — crisp fibrous weave!)
  if (preset == 5u) {
    let ribWeave = 0.5 + 0.5 * sin(uv.x * 96.0 * 6.2831853);
    let finePile = pNoise(uv, vec2f(112.0, 112.0), seed) * 0.50
                 + pNoise(uv, vec2f(56.0, 72.0), seed + 4.0) * 0.38
                 + ribWeave * 0.12;
    let tuft = pFbm(uv, vec2f(18.0, 18.0), seed + 9.0, 3);
    let nap = pFbm(uv, vec2f(3.0, 5.0), seed + 14.0, 3);

    var col = baseCol * (0.83 + 0.30 * finePile) * (0.90 + 0.18 * tuft) * (0.94 + 0.12 * nap);
    let h = clamp(0.26 + finePile * 0.54 + tuft * 0.18, 0.0, 1.0);
    let rough = clamp(baseRough + (1.0 - finePile) * 0.05, 0.78, 0.99);
    let ao = 0.76 + 0.24 * finePile;
    return Sample(col, rough, h, ao, 0.0, 0.0, 0.0, 0.12, vec2f(0.0));
  }
  // 6: ceiling_grid (clean bright ivory commercial fissured mineral acoustic tile; crisp T-bars analytic in gbuffer-pbr!)
  if (preset == 6u) {
    let speck = pNoise(uv, vec2f(72.0), seed + 2.0);
    let fissure = smoothstep(0.81, 0.95, pFbm(uv * vec2f(1.0, 1.8), vec2f(28.0, 42.0), seed + 6.0, 2));
    let pinhole = smoothstep(0.88, 0.97, pNoise(uv, vec2f(64.0), seed + 14.0));
    let warmTone = pFbm(uv, vec2f(3.0), seed + 12.0, 3);

    var panelCol = baseCol * (0.96 + 0.07 * speck) * (0.96 + 0.06 * warmTone);
    panelCol *= 1.0 - max(fissure * 0.24, pinhole * 0.28);
    let h = clamp(0.55 + speck * 0.08 - fissure * 0.20 - pinhole * 0.24, 0.0, 1.0);
    let rough = clamp(baseRough + (1.0 - speck) * 0.04, 0.78, 0.97);
    let ao = clamp((0.94 + 0.06 * speck) * (1.0 - fissure * 0.22) * (1.0 - pinhole * 0.26), 0.48, 1.0);
    return Sample(panelCol, rough, h, ao, 0.0, 0.0, 0.0, 0.0, vec2f(0.0));
  }
  // 7: wood_trim
  if (preset == 7u) {
    let warp = pFbm(uv, vec2f(4.0, 16.0), seed, 3) * 0.20;
    let grain = sin((uv.y * 20.0 + warp * 6.0) * 6.2831853) * 0.5 + 0.5;
    let fine = pNoise(uv, vec2f(8.0, 64.0), seed + 5.0);
    let col = baseCol * (0.85 + 0.24 * grain) * (0.93 + 0.14 * fine);
    let h = 0.5 + grain * 0.10 + fine * 0.06;
    return Sample(col, clamp(baseRough + (1.0 - grain) * 0.10, 0.32, 0.80), h, 0.92 + 0.08 * grain, 0.0, m.pbr.z, 0.0, 0.0, vec2f(0.0));
  }
  // 8: concrete_raw (authentic rough poured board-formed architectural concrete — fine natural mineral aggregate!)
  if (preset == 8u) {
    let macroN = pFbm(uv, vec2f(3.0), seed, 4);
    let boardGrain = pFbm(uv, vec2f(4.0, 24.0), seed + 3.0, 3);
    let grit = pFbm(uv, vec2f(36.0), seed + 7.0, 3);
    let microPores = smoothstep(0.86, 0.98, pNoise(uv, vec2f(96.0), seed + 13.0));
    let efflor = smoothstep(0.68, 0.88, pFbm(uv, vec2f(4.0), seed + 19.0, 3));

    var col = baseCol * (0.85 + 0.26 * macroN) * (0.93 + 0.14 * boardGrain) * (0.94 + 0.12 * grit);
    col = mix(col, col * vec3f(1.10, 1.09, 1.05), efflor * 0.24);
    col *= 1.0 - microPores * 0.14;
    let h = clamp(0.54 + (grit - 0.5) * 0.24 + (boardGrain - 0.5) * 0.12 - microPores * 0.14, 0.0, 1.0);
    let rough = clamp(baseRough + (grit - 0.5) * 0.12, 0.62, 0.98);
    let ao = (1.0 - microPores * 0.14) * (0.90 + 0.10 * grit);
    return Sample(col, rough, h, ao, 0.0, 0.0, 0.0, m.extra.y, vec2f(0.0));
  }
  // 9: concrete_floor (gritty rough troweled parking slab aggregate; puddles, cracks & worn yellow stripes analytic in gbuffer-pbr!)
  if (preset == 9u) {
    let macroN = pFbm(uv, vec2f(3.0), seed, 4);
    let trowel = pFbm(uv, vec2f(10.0), seed + 3.0, 4);
    let grit = pFbm(uv, vec2f(48.0), seed + 7.0, 3);
    let microPits = smoothstep(0.87, 0.98, pNoise(uv, vec2f(104.0), seed + 15.0));

    var col = baseCol * (0.80 + 0.32 * macroN) * (0.90 + 0.18 * trowel) * (0.93 + 0.14 * grit);
    col *= 1.0 - microPits * 0.14;
    let h = clamp(0.52 + (grit - 0.5) * 0.28 + (trowel - 0.5) * 0.14 - microPits * 0.14, 0.0, 1.0);
    let rough = clamp(baseRough + (grit - 0.5) * 0.12, 0.74, 0.98);
    let ao = (0.88 + 0.12 * grit) * (1.0 - microPits * 0.12);
    return Sample(col, rough, h, ao, 0.0, 0.02, 0.0, m.extra.y, vec2f(0.0));
  }
  // 10: concrete_painted (weathered chalky off-white painted concrete columns with scuffs & subtle mineral texture)
  if (preset == 10u) {
    let n1 = pFbm(uv, vec2f(4.0), seed, 4);
    let grit = pFbm(uv, vec2f(32.0), seed + 3.0, 3);
    let scuff = smoothstep(0.62, 0.86, pFbm(uv, vec2f(10.0), seed + 6.0, 3));
    let microPits = smoothstep(0.88, 0.98, pNoise(uv, vec2f(96.0), seed + 11.0));
    var col = mix(baseCol * (0.91 + 0.15 * n1) * (0.95 + 0.10 * grit), baseCol * 0.74, scuff * 0.42);
    col *= 1.0 - microPits * 0.12;
    let h = clamp(0.54 + (grit - 0.5) * 0.18 - scuff * 0.08 - microPits * 0.12, 0.0, 1.0);
    return Sample(col, clamp(baseRough + scuff * 0.15, 0.58, 0.96), h, (0.91 + 0.09 * grit) * (1.0 - microPits * 0.10), 0.0, m.pbr.z, 0.0, 0.0, vec2f(0.0));
  }
  // 11: stainless_steel & 12: dark_metal
  if (preset == 11u || preset == 12u) {
    let brush = pFbm(uv, vec2f(4.0, 64.0), seed, 3);
    let fine = pNoise(uv, vec2f(16.0, 64.0), seed + 4.0);
    let col = baseCol * (0.92 + 0.14 * brush);
    let h = 0.5 + (brush - 0.5) * 0.06 + (fine - 0.5) * 0.04;
    let rough = clamp(baseRough + (brush - 0.5) * 0.08, 0.08, 0.65);
    return Sample(col, rough, h, 0.96 + 0.04 * brush, m.pbr.y, 0.0, 0.0, 0.0, vec2f(0.0));
  }
  // 13: fluorescent_panel (prismatic acrylic troffer diffuser with dual tube glow)
  if (preset == 13u) {
    let edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    let frame = 1.0 - smoothstep(0.025, 0.045, edge);
    // Prismatic micro-diamond lens grid
    let px = abs(fract(uv.x * 48.0) - 0.5) * 2.0;
    let py = abs(fract(uv.y * 24.0) - 0.5) * 2.0;
    let prism = 0.85 + 0.15 * (1.0 - max(px, py));
    // Two internal fluorescent tubes along X, slightly dimmer at ballast ends
    let tube1 = exp(-pow((uv.y - 0.30) / 0.18, 2.0));
    let tube2 = exp(-pow((uv.y - 0.70) / 0.18, 2.0));
    let ends = smoothstep(0.02, 0.14, uv.x) * smoothstep(0.02, 0.14, 1.0 - uv.x);
    let dust = 1.0 - 0.10 * pFbm(uv, vec2f(6.0), seed, 3);
    let glow = (0.48 + 0.55 * max(tube1, tube2)) * (0.65 + 0.35 * ends) * prism * dust * (1.0 - frame);
    let col = mix(baseCol * prism * dust, vec3f(0.18, 0.19, 0.19), frame);
    let h = mix(0.45 + prism * 0.25, 0.90, frame);
    return Sample(col, mix(baseRough, 0.35, frame), h, 1.0 - frame * 0.2, frame * 0.7, (1.0 - frame) * 0.5, clamp(glow, 0.0, 1.0), 0.0, vec2f(0.0));
  }
  // 14: exit_sign (backlit emergency EXIT sign with procedural SDF typography)
  if (preset == 14u) {
    let edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    let border = 1.0 - smoothstep(0.04, 0.065, edge);
    let letter = exitLetters(uv);
    let faceGlow = (0.14 + 0.86 * letter) * (1.0 - border);
    let col = mix(mix(vec3f(0.05, 0.09, 0.06), vec3f(0.95, 1.0, 0.96), letter), vec3f(0.10, 0.11, 0.11), border);
    return Sample(col, mix(0.20, 0.45, border), mix(0.45, 0.90, border), 1.0, border * 0.8, (1.0 - border) * 0.5, faceGlow, 0.0, vec2f(0.0));
  }
  // 17: frosted_window (backlit frosted milk-glass pool window / porthole)
  if (preset == 17u) {
    let frost = pFbm(uv, vec2f(8.0), seed, 3);
    let edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    let softRim = smoothstep(0.0, 0.10, edge);
    let glow = (0.72 + 0.28 * softRim) * (0.94 + 0.08 * frost);
    let col = baseCol * (0.95 + 0.05 * frost);
    return Sample(col, baseRough, 0.5 + (frost - 0.5) * 0.04, 1.0, 0.0, m.pbr.z, glow, 0.0, vec2f(0.0));
  }
  // 18: fiberglass_slide (smooth molded aqua-teal natatorium fiberglass slide gelcoat)
  if (preset == 18u) {
    let grain = pFbm(uv, vec2f(6.0, 2.0), seed, 3);
    let col = baseCol * (0.95 + 0.10 * grain);
    let h = 0.52 + (grain - 0.5) * 0.025;
    let rough = clamp(baseRough + (grain - 0.5) * 0.035, 0.08, 0.40);
    return Sample(col, rough, h, 0.98, 0.0, m.pbr.z, 0.0, m.extra.y, vec2f(0.0));
  }
  // 19: corrugated_metal (vertical galvanized steel ribs — Aquila Sector right partition wall!)
  if (preset == 19u) {
    let ribPhase = uv.x * 8.0 * 6.2831853; // 8 vertical ribs per meter (12.5 cm corrugation pitch!)
    let wave = 0.5 + 0.5 * sin(ribPhase);
    let zinc = pFbm(uv, vec2f(10.0, 6.0), seed, 3);
    let grime = pFbm(uv, vec2f(4.0, 12.0), seed + 5.0, 3);
    let col = baseCol * (0.86 + 0.22 * wave) * (0.91 + 0.16 * zinc) * (0.92 + 0.12 * grime);
    let h = clamp(0.18 + 0.64 * wave + (zinc - 0.5) * 0.06, 0.0, 1.0);
    let slopeX = -cos(ribPhase) * 0.52;
    let ao = 0.72 + 0.28 * wave;
    let rough = clamp(baseRough + (1.0 - wave) * 0.14 + (grime - 0.5) * 0.12, 0.18, 0.75);
    return Sample(col, rough, h, ao, m.pbr.y, m.pbr.z, 0.0, m.extra.y, vec2f(slopeX, 0.0));
  }
  // 20: moss_floor (lush swirling emerald courtyard moss & dense ivy leaves)
  if (preset == 20u) {
    let blades = pNoise(uv, vec2f(96.0, 96.0), seed) * 0.55 + pNoise(uv, vec2f(48.0, 64.0), seed + 4.0) * 0.45;
    let clump = pFbm(uv, vec2f(12.0), seed + 8.0, 4);
    let leafTip = smoothstep(0.55, 0.88, blades * 0.6 + clump * 0.4);
    var col = mix(baseCol * vec3f(0.58, 0.64, 0.48), baseCol * vec3f(1.55, 1.62, 0.92), leafTip);
    col *= 0.80 + 0.36 * clump;
    let h = clamp(0.18 + blades * 0.46 + clump * 0.32, 0.0, 1.0);
    let ao = 0.58 + 0.42 * (blades * 0.5 + clump * 0.5);
    return Sample(col, clamp(baseRough - leafTip * 0.18, 0.58, 0.98), h, ao, 0.0, leafTip * 0.08, 0.0, m.extra.y, vec2f(0.0));
  }
  // 21: foliage_vine (sunlit layered courtyard ivy & fern leaves)
  if (preset == 21u) {
    let leaf = pFbm(uv, vec2f(16.0, 20.0), seed, 3);
    let fine = pNoise(uv, vec2f(72.0, 72.0), seed + 7.0);
    let sunlit = smoothstep(0.45, 0.85, leaf * 0.65 + fine * 0.35);
    let col = mix(baseCol * vec3f(0.48, 0.55, 0.40), baseCol * vec3f(1.65, 1.75, 0.90), sunlit);
    let h = clamp(0.25 + leaf * 0.45 + fine * 0.25, 0.0, 1.0);
    return Sample(col, clamp(baseRough - sunlit * 0.16, 0.38, 0.88), h, 0.68 + 0.32 * sunlit, 0.0, m.pbr.z, 0.0, m.extra.y, vec2f(0.0));
  }
  // 22: plaster_mud (rural aged mud-plaster wall base; damp flaking stucco added analytically in world space)
  if (preset == 22u) {
    let trowel = pFbm(uv, vec2f(4.0), seed, 4);
    let grit = pFbm(uv, vec2f(20.0), seed + 5.7, 3);
    let h = 0.52 + (trowel - 0.5) * 0.22 + (grit - 0.5) * 0.12;
    let col = baseCol * (0.88 + 0.22 * trowel) * (0.94 + 0.12 * grit);
    return Sample(col, clamp(baseRough + (grit - 0.5) * 0.10, 0.72, 0.98), h, 0.90 + 0.10 * trowel, 0.0, m.pbr.z, 0.0, m.extra.y, vec2f(0.0));
  }
  // 23: stone_damp (dark gritty uneven stone floor base; glossy wet puddles added analytically in world space)
  if (preset == 23u) {
    let broad = pFbm(uv, vec2f(4.0), seed, 4);
    let grit = pFbm(uv, vec2f(18.0), seed + 3.1, 3);
    let micro = pFbm(uv, vec2f(48.0), seed + 9.4, 2);
    let pit = smoothstep(0.68, 0.90, pFbm(uv, vec2f(12.0), seed + 15.2, 3));
    let h = clamp(0.55 + (broad - 0.5) * 0.24 + (grit - 0.5) * 0.22 + (micro - 0.5) * 0.12 - pit * 0.24, 0.0, 1.0);
    let col = baseCol * (0.76 + 0.44 * broad) * (0.86 + 0.26 * grit) * (1.0 - pit * 0.30);
    let rough = clamp(baseRough + (grit - 0.5) * 0.18 + pit * 0.16, 0.30, 0.96);
    return Sample(col, rough, h, clamp(0.84 + 0.16 * broad - pit * 0.28, 0.35, 1.0), 0.0, m.pbr.z, 0.0, m.extra.y, vec2f(0.0));
  }
  // 24: wood_plank_aged (aged charcoal-timber vertical double-door planks with grain & plank joints)
  if (preset == 24u) {
    let grain = pFbm(uv, vec2f(28.0, 3.0), seed, 4);
    let fine = pFbm(uv, vec2f(72.0, 8.0), seed + 6.3, 3);
    let plankPhase = fract(uv.x * 7.8);
    let edgeD = min(plankPhase, 1.0 - plankPhase);
    let seam = 1.0 - smoothstep(0.0, 0.048, edgeD);
    let plankId = hash21(vec2f(floor(uv.x * 7.8), seed));
    let col = baseCol * (0.72 + 0.52 * grain) * (0.90 + 0.20 * fine) * (0.88 + 0.24 * plankId) * (1.0 - seam * 0.80);
    let h = clamp(0.56 + (grain - 0.5) * 0.18 + (fine - 0.5) * 0.08 - seam * 0.46, 0.0, 1.0);
    let rough = clamp(baseRough + (grain - 0.5) * 0.12 + seam * 0.18, 0.45, 0.96);
    return Sample(col, rough, h, clamp(0.92 + 0.08 * grain - seam * 0.45, 0.28, 1.0), 0.0, m.pbr.z * (1.0 - seam), 0.0, m.extra.y, vec2f(0.0));
  }
  // 25: couplet_paper (aged Chinese Spring Festival couplets with ornate fretwork border, auspicious floral/cloud brocade & gold flecks)
  // Variant selected by seed: 1=left(富贵由天), 2=right(平安是福), 3=horizontal scroll, 4=left talisman, 5=right talisman.
  if (preset == 25u) {
    let age = pFbm(uv, vec2f(4.0, 8.0), seed + 3.1, 4);
    let fade = pFbm(uv, vec2f(12.0, 18.0), seed + 7.4, 3);
    let isScroll = seed > 2.5 && seed < 3.5;
    let isTalisman = seed > 3.5;
    let aspectScale = select(select(vec2f(0.30, 1.54), vec2f(0.21, 0.48), isTalisman), vec2f(1.00, 0.35), isScroll);
    let pM = uv * aspectScale;
    let edgeX = min(uv.x, 1.0 - uv.x) * aspectScale.x;
    let edgeY = min(uv.y, 1.0 - uv.y) * aspectScale.y;
    let edgeM = min(edgeX, edgeY);
    let frayed = smoothstep(0.0, 0.015, edgeM + (age - 0.5) * 0.010);

    // Sun-faded crimson/magenta Xuan paper base with weathered whitewashed edge fade
    var paper = mix(vec3f(0.34, 0.038, 0.065), vec3f(0.62, 0.10, 0.14), age * 0.65 + 0.16);
    let bleach = smoothstep(0.42, 0.80, fade) * 0.52 + (1.0 - smoothstep(0.0, 0.065, edgeM)) * 0.24;
    paper = mix(paper, vec3f(0.76, 0.50, 0.54), clamp(bleach, 0.0, 0.72));

    // Traditional patterned background: diamond brocade lattice + auspicious cloud/floral motif + scattered gold flecks (暗纹洒金春联纸)
    let dia1 = abs(fract((pM.x + pM.y) * 18.0) - 0.5);
    let dia2 = abs(fract((pM.x - pM.y) * 18.0) - 0.5);
    let brocade = 1.0 - smoothstep(0.025, 0.065, min(dia1, dia2));
    let cloudWave = sin(pM.x * 42.0 + sin(pM.y * 28.0) * 1.6) * cos(pM.y * 34.0 - cos(pM.x * 24.0) * 1.4);
    let cloudMotif = smoothstep(0.45, 0.85, abs(cloudWave));
    let goldFleck = smoothstep(0.83, 0.92, pNoise(uv, vec2f(20.0, 88.0), seed + 41.0));

    let motifTint = mix(vec3f(0.82, 0.58, 0.54), vec3f(0.76, 0.58, 0.28), 0.45 + 0.35 * fade);
    paper = mix(paper, motifTint, brocade * 0.24 * (0.65 + 0.35 * age));
    paper = mix(paper, vec3f(0.84, 0.62, 0.58), cloudMotif * 0.22 * (0.5 + 0.5 * fade));
    paper = mix(paper, vec3f(0.88, 0.72, 0.36), goldFleck * 0.55);

    // Ornate double border + traditional Chinese key-fret meander (回纹花边边框)
    let outerRule = 1.0 - smoothstep(0.0015, 0.0045, abs(edgeM - 0.010));
    let innerRule = 1.0 - smoothstep(0.0015, 0.0045, abs(edgeM - 0.025));
    let inFretBand = smoothstep(0.011, 0.013, edgeM) * (1.0 - smoothstep(0.022, 0.024, edgeM));
    let perim = select(pM.y, pM.x, edgeX > edgeY);
    let fretU = fract(perim * 36.0);
    let fretV = clamp((edgeM - 0.012) / 0.011, 0.0, 1.0);
    let fretBar = max(
      (1.0 - smoothstep(0.06, 0.14, abs(fretU - 0.5))) * step(0.22, fretV),
      (1.0 - smoothstep(0.08, 0.16, abs(fretV - 0.5))) * step(0.20, fretU) * step(fretU, 0.80),
    );
    let borderInk = max(max(outerRule, innerRule), inFretBand * fretBar * 0.85);
    let borderCol = mix(vec3f(0.82, 0.66, 0.36), vec3f(0.88, 0.74, 0.68), fade * 0.55);
    paper = mix(paper, borderCol, borderInk * 0.62);

    // Subtle aged horizontal paper fold creases between characters
    let foldY = abs(fract(uv.y * 4.0) - 0.0);
    let crease = (1.0 - smoothstep(0.0, 0.022, min(foldY, 1.0 - foldY))) * select(1.0, 0.0, isScroll);
    paper = mix(paper, paper * 1.18 + vec3f(0.05, 0.03, 0.03), crease * 0.28);

    // Frayed dark damp border trim
    paper = mix(vec3f(0.18, 0.055, 0.065), paper, frayed);

    var d = 10.0;
    let handWarp = vec2f(
      pFbm(uv, vec2f(7.0, 14.0), seed + 17.3, 2) - 0.5,
      pFbm(uv, vec2f(7.0, 14.0), seed + 29.1, 2) - 0.5,
    ) * 0.036;
    if (!isScroll && !isTalisman) {
      // Generous top/bottom margins and wide inter-character spacing matching the reference couplets.
      let vNorm = (1.0 - uv.y - 0.055) / 0.89;
      if (vNorm >= 0.0 && vNorm <= 1.0) {
        let row = clamp(floor(vNorm * 4.0), 0.0, 3.0);
        let cell = vec2f((uv.x - 0.09) / 0.82, fract(vNorm * 4.0));
        if (all(cell >= vec2f(0.0)) && all(cell <= vec2f(1.0))) {
          // Circular floral/cloud auspicious medallion (团花暗纹) behind each couplet character!
          let mc = cell - vec2f(0.5);
          let mr = length(mc);
          let ma = atan2(mc.y, mc.x);
          let petalR = 0.35 + 0.038 * sin(ma * 8.0) + 0.016 * cos(ma * 16.0);
          let ring1 = 1.0 - smoothstep(0.012, 0.036, abs(mr - petalR));
          let ring2 = 1.0 - smoothstep(0.012, 0.034, abs(mr - (0.21 + 0.025 * cos(ma * 6.0))));
          let medal = clamp(ring1 * 0.85 + ring2 * 0.55, 0.0, 1.0);
          paper = mix(paper, vec3f(0.86, 0.68, 0.54), medal * 0.34);

          // Smaller centered glyph with bold, heavy ink brush strokes and wide red brocade spacing.
          let g = (vec2f(cell.x, 1.0 - cell.y) - vec2f(0.5)) * vec2f(1.42, 1.56) + vec2f(0.5);
          if (all(g >= vec2f(-0.10)) && all(g <= vec2f(1.10))) {
            let baseId = select(4u, 0u, seed < 1.5);
            d = (coupletGlyphDist(g + handWarp, baseId + u32(row)) - 0.018) / 1.16;
          }
        }
      }
    } else if (isScroll) {
      paper *= 0.54;
      let uNorm = (uv.x - 0.07) / 0.86;
      if (uNorm >= 0.0 && uNorm <= 1.0) {
        let colIdx = clamp(floor(uNorm * 4.0), 0.0, 3.0);
        let cell = vec2f(fract(uNorm * 4.0), (uv.y - 0.12) / 0.76);
        if (all(cell >= vec2f(0.0)) && all(cell <= vec2f(1.0))) {
          let mc = cell - vec2f(0.5);
          let mr = length(mc);
          let ma = atan2(mc.y, mc.x);
          let ring = 1.0 - smoothstep(0.014, 0.038, abs(mr - (0.34 + 0.036 * sin(ma * 8.0))));
          paper = mix(paper, vec3f(0.54, 0.38, 0.24), ring * 0.30);
          let g = (cell - vec2f(0.5)) * vec2f(1.46, 1.40) + vec2f(0.5);
          if (all(g >= vec2f(-0.10)) && all(g <= vec2f(1.10))) {
            d = (coupletGlyphDist(g + handWarp, (u32(colIdx) * 2u + 1u) % 8u) - 0.018) / 1.16;
          }
        }
      }
    } else {
      // Ornate yellow-gold inner frame & seal medallion on the two small door talismans
      let innerB = 1.0 - smoothstep(0.002, 0.006, abs(edgeM - 0.028));
      paper = mix(paper, vec3f(0.76, 0.58, 0.28), innerB * 0.62);
      d = talismanCursiveDist(uv + handWarp * 0.45, seed);
    }
    let bristle = (pFbm(uv, vec2f(28.0, 56.0), seed + 13.7, 2) - 0.5) * 0.018;
    let ink = 1.0 - smoothstep(0.000, 0.022, d + bristle);
    let dryBrush = mix(0.84, 1.0, smoothstep(-0.022, -0.002, -d + bristle * 0.5));
    let inkCol = vec3f(0.014, 0.012, 0.014) * (0.80 + 0.40 * fade);
    let col = mix(paper, inkCol, ink * dryBrush * 0.97);
    let h = 0.52 + (age - 0.5) * 0.10 - ink * 0.04 + crease * 0.05;
    let rough = clamp(baseRough + (age - 0.5) * 0.08 - goldFleck * 0.32, 0.48, 0.96);
    return Sample(col, rough, h, 0.94 + 0.06 * frayed, goldFleck * 0.35, m.pbr.z + goldFleck * 0.25, 0.0, 0.0, vec2f(0.0));
  }
  // 26: candle_wax (warm paraffin wax cylinder & melted drip base)
  if (preset == 26u) {
    let drip = pFbm(uv, vec2f(6.0, 3.0), seed, 3);
    let col = baseCol * (0.94 + 0.12 * drip);
    return Sample(col, clamp(baseRough + (drip - 0.5) * 0.08, 0.25, 0.70), 0.52 + (drip - 0.5) * 0.12, 0.96, 0.0, m.pbr.z, 1.0, 0.0, vec2f(0.0));
  }
  // 27: candle_flame (incandescent candle flame & smoldering vigil ember)
  if (preset == 27u) {
    let pulse = pFbm(uv, vec2f(6.0), seed, 2);
    return Sample(baseCol, 0.95, 0.5, 1.0, 0.0, 0.0, 0.88 + 0.12 * pulse, 0.0, vec2f(0.0));
  }
  // 15: vent_grate (metallic louvered HVAC register)
  let edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  let frame = 1.0 - smoothstep(0.05, 0.075, edge);
  let slatPhase = fract(uv.y * 16.0);
  let slat = smoothstep(0.15, 0.32, slatPhase) * (1.0 - smoothstep(0.72, 0.88, slatPhase));
  let openMask = (1.0 - frame) * (1.0 - slat);
  let col = mix(baseCol * (0.85 + 0.15 * slatPhase), vec3f(0.02, 0.025, 0.025), openMask);
  let h = mix(mix(0.15, 0.78 * slatPhase, slat), 0.92, frame);
  let ao = mix(mix(0.18, 0.92, slat), 1.0, frame);
  return Sample(col, mix(0.42, 0.90, openMask), h, ao, mix(m.pbr.y, 0.0, openMask), 0.0, 0.0, 0.0, vec2f(0.0));
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let size = info.x;
  if (gid.x >= size || gid.y >= size || gid.z >= info.y) { return; }
  let layer = gid.z;
  let m = materials[layer];
  let uv = (vec2f(gid.xy) + 0.5) / f32(size);
  let eps = 1.0 / f32(size);

  let c = evalMaterial(uv, m);
  var dhdu = 0.0;
  var dhdv = 0.0;
  if (m.pbr.w > 0.0001) {
    let hx0 = evalMaterial(fract(uv - vec2f(eps, 0.0)), m).height;
    let hx1 = evalMaterial(fract(uv + vec2f(eps, 0.0)), m).height;
    let hy0 = evalMaterial(fract(uv - vec2f(0.0, eps)), m).height;
    let hy1 = evalMaterial(fract(uv + vec2f(0.0, eps)), m).height;
    // Height-to-slope strength scales cleanly with material relief depth.
    let reliefScale = max(0.35, m.pbr.w * 260.0);
    dhdu = (hx1 - hx0) * 0.5 * reliefScale;
    dhdv = (hy1 - hy0) * 0.5 * reliefScale;
  }
  let n = normalize(vec3f(-dhdu + c.slopeBias.x, -dhdv + c.slopeBias.y, 1.0));

  textureStore(outAlbedoRough, vec2i(gid.xy), i32(layer), vec4f(clamp(c.albedo, vec3f(0.0), vec3f(1.0)), clamp(c.roughness, 0.04, 1.0)));
  textureStore(outNormalHeight, vec2i(gid.xy), i32(layer), vec4f(n.xy * 0.5 + 0.5, clamp(c.height, 0.0, 1.0), clamp(c.ao, 0.0, 1.0)));
  textureStore(outMeta, vec2i(gid.xy), i32(layer), vec4f(clamp(c.metallic, 0.0, 1.0), clamp(c.coat, 0.0, 1.0), clamp(c.emissiveMask, 0.0, 1.0), clamp(c.wetness, 0.0, 1.0)));
}
