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
  // 4: wallpaper_yellow (iconic Backrooms Level 0 vintage patterned wallpaper)
  if (preset == 4u) {
    // Crisp repeating vertical damask stripe + iconic arrow/chevron motif (6 stripes / 1.20 m = 3 per 0.60 m roll)
    let rep = vec2f(6.0, 4.0);
    let cell = fract(uv * rep);
    let dx = abs(cell.x - 0.5);
    let stripe = 1.0 - smoothstep(0.09, 0.14, dx);
    let cx = dx * 2.0;
    let cy = cell.y;
    // Crisp arrow/chevron & diamond ornament inside each stripe column
    let chev1 = abs((cy - 0.24) - cx * 0.36);
    let chev2 = abs((cy - 0.68) - cx * 0.36);
    let motif = (1.0 - smoothstep(0.026, 0.056, min(chev1, chev2))) * (1.0 - smoothstep(0.50, 0.68, cx));
    let dotMotif = 1.0 - smoothstep(0.048, 0.088, length(vec2f(cell.x - 0.5, fract(cell.y * 2.0) - 0.5) * vec2f(1.0, 0.72)));
    let pattern = clamp(motif * 0.82 + dotMotif * 0.48 + stripe * 0.30, 0.0, 1.0);

    // Subtle matte-paper micro-fiber & organic vintage mottling (macro dampness is world-space in gbuffer-pbr)
    let blotch = pFbm(uv, vec2f(2.0), seed + 2.0, 3);
    let fiber = pFbm(uv, vec2f(32.0, 8.0), seed + 11.0, 3);

    var col = baseCol * mix(vec3f(1.03, 1.01, 0.96), vec3f(0.80, 0.74, 0.56), pattern);
    col *= 0.92 + 0.14 * blotch;
    col *= 0.96 + 0.08 * fiber;

    let h = 0.54 + pattern * 0.08 + (fiber - 0.5) * 0.08;
    // Subtle satin-ink vs matte-paper roughness contrast across the printed motif!
    let rough = clamp(baseRough - pattern * 0.12 + (fiber - 0.5) * 0.06, 0.52, 0.95);
    let ao = 0.94 + 0.06 * fiber;
    return Sample(col, rough, clamp(h, 0.0, 1.0), ao, 0.0, pattern * 0.08, 0.0, 0.05, vec2f(0.0));
  }
  // 5: carpet_damp (iconic Backrooms damp woven commercial loop carpet — no repeating fake square seams!)
  if (preset == 5u) {
    let rib = sin(uv.x * 6.2831853 * 48.0) * 0.5 + 0.5;
    let loopPile = pNoise(uv, vec2f(48.0, 64.0), seed) * 0.58 + rib * pNoise(uv, vec2f(24.0, 48.0), seed + 2.0) * 0.42;
    let wear = pFbm(uv, vec2f(4.0), seed + 3.0, 4);
    let speck = pNoise(uv, vec2f(96.0, 96.0), seed + 11.0);

    var col = baseCol * (0.82 + 0.30 * loopPile) * (0.90 + 0.18 * wear) * (0.95 + 0.10 * speck);
    let h = clamp(0.28 + loopPile * 0.52 + wear * 0.14, 0.0, 1.0);
    let rough = clamp(baseRough + (1.0 - loopPile) * 0.06, 0.65, 0.99);
    let ao = 0.78 + 0.22 * loopPile;
    return Sample(col, rough, h, ao, 0.0, 0.0, 0.0, 0.18, vec2f(0.0));
  }
  // 6: ceiling_grid (fissured mineral acoustic ceiling panel base — razor-sharp 1.2x0.6m T-bar grid evaluated analytically!)
  if (preset == 6u) {
    let speck = pNoise(uv, vec2f(64.0), seed + 2.0);
    // Authentic commercial acoustic ceiling wormhole fissures + fine pinholes
    let fissure = smoothstep(0.76, 0.92, pFbm(uv * vec2f(1.0, 1.6), vec2f(24.0, 36.0), seed + 6.0, 2));
    let pinhole = smoothstep(0.85, 0.95, pNoise(uv, vec2f(56.0), seed + 14.0));
    let warmAge = pFbm(uv, vec2f(3.0), seed + 12.0, 3);

    var panelCol = baseCol * (0.94 + 0.10 * speck) * (0.95 + 0.08 * warmAge);
    panelCol *= 1.0 - max(fissure * 0.36, pinhole * 0.42);
    let h = clamp(0.54 + speck * 0.10 - fissure * 0.24 - pinhole * 0.28, 0.0, 1.0);
    let rough = clamp(baseRough + (1.0 - speck) * 0.05, 0.72, 0.97);
    let ao = clamp((0.92 + 0.08 * speck) * (1.0 - fissure * 0.30) * (1.0 - pinhole * 0.35), 0.35, 1.0);
    return Sample(panelCol, rough, h, ao, 0.0, 0.0, 0.0, 0.0, vec2f(0.0));
  }
  // 7: wood_trim
  if (preset == 7u) {
    let warp = pFbm(uv, vec2f(4.0, 16.0), seed, 3) * 0.25;
    let grain = sin((uv.y * 24.0 + warp * 8.0) * 6.2831853) * 0.5 + 0.5;
    let fine = pNoise(uv, vec2f(8.0, 64.0), seed + 5.0);
    let col = baseCol * (0.78 + 0.34 * grain) * (0.90 + 0.20 * fine);
    let h = 0.5 + grain * 0.15 + fine * 0.08;
    return Sample(col, clamp(baseRough + (1.0 - grain) * 0.12, 0.22, 0.78), h, 0.9 + 0.1 * grain, 0.0, m.pbr.z, 0.0, 0.0, vec2f(0.0));
  }
  // 8: concrete_raw (architectural poured concrete grain & subtle tie-cone recesses; crisp 1.2 m panel seams evaluated analytically!)
  if (preset == 8u) {
    let f = fract(uv * 1.0);
    let tie1 = 1.0 - smoothstep(0.015, 0.024, length(f - vec2f(0.25, 0.50)));
    let tie2 = 1.0 - smoothstep(0.015, 0.024, length(f - vec2f(0.75, 0.50)));
    let holes = max(tie1, tie2);

    let macroN = pFbm(uv, vec2f(3.0), seed, 4);
    let grit = pFbm(uv, vec2f(24.0), seed + 5.0, 3);
    let pores = smoothstep(0.80, 0.94, pNoise(uv, vec2f(48.0), seed + 13.0));

    var col = baseCol * (0.86 + 0.24 * macroN) * (0.92 + 0.16 * grit);
    col = mix(col, col * 0.50, max(holes * 0.85, pores * 0.35));
    let h = clamp(0.58 + (grit - 0.5) * 0.22 + (macroN - 0.5) * 0.10 - holes * 0.42 - pores * 0.18, 0.0, 1.0);
    let rough = clamp(baseRough + (grit - 0.5) * 0.14, 0.45, 0.97);
    let ao = (1.0 - holes * 0.55) * (1.0 - pores * 0.25) * (0.88 + 0.12 * grit);
    return Sample(col, rough, h, ao, 0.0, 0.0, 0.0, m.extra.y, vec2f(0.0));
  }
  // 9: concrete_floor (troweled concrete aggregate base; non-repeating world-space wet mirror puddles & 2.4 m saw-cuts evaluated analytically!)
  if (preset == 9u) {
    let macroN = pFbm(uv, vec2f(2.0), seed, 4);
    let trowel = pFbm(uv, vec2f(8.0), seed + 3.0, 4);
    let grit = pFbm(uv, vec2f(32.0), seed + 7.0, 3);

    let col = baseCol * (0.84 + 0.26 * macroN) * (0.90 + 0.18 * trowel) * (0.94 + 0.12 * grit);
    let h = clamp(0.54 + (grit - 0.5) * 0.20 + (trowel - 0.5) * 0.12, 0.0, 1.0);
    let rough = clamp(baseRough + 0.14 + (grit - 0.5) * 0.16, 0.45, 0.95);
    let ao = 0.88 + 0.12 * grit;
    return Sample(col, rough, h, ao, 0.0, 0.04, 0.0, m.extra.y, vec2f(0.0));
  }
  // 10: concrete_painted
  if (preset == 10u) {
    let n1 = pFbm(uv, vec2f(4.0), seed, 4);
    let scuff = smoothstep(0.62, 0.84, pFbm(uv, vec2f(12.0), seed + 6.0, 3));
    let col = mix(baseCol * (0.90 + 0.18 * n1), baseCol * 0.72, scuff * 0.45);
    let h = 0.5 + (n1 - 0.5) * 0.16 - scuff * 0.08;
    return Sample(col, clamp(baseRough + scuff * 0.22, 0.35, 0.95), h, 0.92 + 0.08 * n1, 0.0, m.pbr.z, 0.0, 0.0, vec2f(0.0));
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
  // 18: fiberglass_slide (molded dark glossy fiberglass pool water slide)
  if (preset == 18u) {
    let grain = pFbm(uv, vec2f(6.0, 2.0), seed, 3);
    let seam = 1.0 - smoothstep(0.015, 0.032, abs(fract(uv.y * 0.45) - 0.5));
    let col = baseCol * (0.92 + 0.16 * grain) * (1.0 - seam * 0.28);
    let h = 0.55 + (grain - 0.5) * 0.04 + seam * 0.14;
    let rough = clamp(baseRough + (grain - 0.5) * 0.05 + seam * 0.10, 0.06, 0.55);
    return Sample(col, rough, h, 1.0 - seam * 0.2, 0.0, m.pbr.z, 0.0, m.extra.y, vec2f(0.0));
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
  let hx0 = evalMaterial(fract(uv - vec2f(eps, 0.0)), m).height;
  let hx1 = evalMaterial(fract(uv + vec2f(eps, 0.0)), m).height;
  let hy0 = evalMaterial(fract(uv - vec2f(0.0, eps)), m).height;
  let hy1 = evalMaterial(fract(uv + vec2f(0.0, eps)), m).height;

  // Height-to-slope strength scales cleanly with material relief depth.
  let reliefScale = max(0.35, m.pbr.w * 260.0);
  let dhdu = (hx1 - hx0) * 0.5 * reliefScale;
  let dhdv = (hy1 - hy0) * 0.5 * reliefScale;
  let n = normalize(vec3f(-dhdu + c.slopeBias.x, -dhdv + c.slopeBias.y, 1.0));

  textureStore(outAlbedoRough, vec2i(gid.xy), i32(layer), vec4f(clamp(c.albedo, vec3f(0.0), vec3f(1.0)), clamp(c.roughness, 0.04, 1.0)));
  textureStore(outNormalHeight, vec2i(gid.xy), i32(layer), vec4f(n.xy * 0.5 + 0.5, clamp(c.height, 0.0, 1.0), clamp(c.ao, 0.0, 1.0)));
  textureStore(outMeta, vec2i(gid.xy), i32(layer), vec4f(clamp(c.metallic, 0.0, 1.0), clamp(c.coat, 0.0, 1.0), clamp(c.emissiveMask, 0.0, 1.0), clamp(c.wetness, 0.0, 1.0)));
}
