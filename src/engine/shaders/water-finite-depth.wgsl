// Linear finite-depth gravity-capillary surface dynamics on a Neumann wet-domain graph:
//   h_tt = -G(L)[g*h + (sigma/rho)*L*h + pressure/rho] - damping*h_t
// where G(L) = sqrt(L)*tanh(H*sqrt(L)) is evaluated via Chebyshev polynomial recurrence
// over the symmetric positive 9-point isotropic Neumann graph Laplacian L.
// Generalized for dynamic local simulation windows (works on any dx and shifts seamlessly).

struct FDParams {
  clock: vec4f,    // x = simTime, y = dt, z = 0, w = 0
  settings: vec4f, // x = amplitude, y = 0, z = seed, w = forcing (0 or 1)
  gridU: vec4u,    // x = nx, y = nz, z = count, w = 0
  gridF: vec4f,    // x = dx, y = invDx2, z = shiftX (cells), w = shiftZ (cells)
};

struct Control {
  coefficient: f32,
  limit: f32,
  order: u32,
  pad: u32,
};

@group(0) @binding(0) var<uniform> P: FDParams;
@group(0) @binding(1) var<storage, read> state: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> next: array<vec2f>;
@group(0) @binding(3) var<storage, read> excitation: array<vec2f>;
@group(0) @binding(4) var<storage, read_write> potential: array<f32>;
@group(0) @binding(5) var<storage, read_write> rhs: array<f32>;
@group(0) @binding(6) var<storage, read> previous: array<vec2f>;
@group(0) @binding(7) var<storage, read_write> output: array<vec2f>;
@group(0) @binding(8) var<storage, read> links: array<u32>;
@group(0) @binding(9) var<uniform> C: Control;

fn neighborOffset(j: u32, w: i32) -> i32 {
  switch (j) {
    case 0u: { return -1; }
    case 1u: { return 1; }
    case 2u: { return -w; }
    case 3u: { return w; }
    case 4u: { return -w - 1; }
    case 5u: { return -w + 1; }
    case 6u: { return w - 1; }
    default: { return w + 1; }
  }
}

fn weight(j: u32) -> f32 {
  return select(2.0 / 3.0, 1.0 / 6.0, j >= 4u) * P.gridF.y;
}

fn lapState(i: u32) -> vec2f {
  let w = i32(P.gridU.x);
  let mask = links[i];
  var r = vec2f(0.0);
  let center = state[i];
  for (var j = 0u; j < 8u; j++) {
    if ((mask & (1u << j)) != 0u) {
      r += weight(j) * (center - state[u32(i32(i) + neighborOffset(j, w))]);
    }
  }
  return r;
}

fn lapPotential(i: u32) -> f32 {
  let w = i32(P.gridU.x);
  let mask = links[i];
  var r = 0.0;
  let center = potential[i];
  for (var j = 0u; j < 8u; j++) {
    if ((mask & (1u << j)) != 0u) {
      r += weight(j) * (center - potential[u32(i32(i) + neighborOffset(j, w))]);
    }
  }
  return r;
}

fn shiftedLaplacian(i: u32) -> f32 {
  let w = i32(P.gridU.x);
  let mask = links[i];
  var r = 0.0;
  let center = previous[i].x;
  for (var j = 0u; j < 8u; j++) {
    if ((mask & (1u << j)) != 0u) {
      r += weight(j) * (center - previous[u32(i32(i) + neighborOffset(j, w))].x);
    }
  }
  return 2.0 * r / C.limit - center;
}

fn hashNoise(v: u32) -> u32 {
  var x = v;
  x = ((x >> 16u) ^ x) * 0x7feb352du;
  x = ((x >> 15u) ^ x) * 0x846ca68bu;
  return (x >> 16u) ^ x;
}

fn randomUnit(v: u32) -> f32 {
  return f32(hashNoise(v)) * (2.0 / 4294967296.0) - 1.0;
}

fn randomGaussianApprox(v: u32) -> f32 {
  return 0.86602540378 * (
    randomUnit(v) +
    randomUnit(v + 7919u) +
    randomUnit(v + 104729u) +
    randomUnit(v + 15485863u)
  );
}

fn lapNoise(i: u32) -> vec2f {
  let w = i32(P.gridU.x);
  let mask = links[i];
  var r = vec2f(0.0);
  let center = excitation[i];
  for (var j = 0u; j < 8u; j++) {
    if ((mask & (1u << j)) != 0u) {
      r += weight(j) * (center - excitation[u32(i32(i) + neighborOffset(j, w))]);
    }
  }
  return r;
}

@compute @workgroup_size(128)
fn prepare(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= P.gridU.z) { return; }
  if ((links[i] & 0x80000000u) == 0u) {
    potential[i] = 0.0;
    return;
  }
  // Spatially homogeneous band-limited stochastic pressure fluctuations (white in time).
  let dtSafe = max(P.clock.y, 1e-4);
  let invDx2 = max(P.gridF.y, 1.0);
  let p = 0.0030 * (P.settings.x / 0.018) * P.settings.w / sqrt(dtSafe) * (lapNoise(i).x / invDx2);
  potential[i] = 9.81 * state[i].x + 0.000073 * lapState(i).x + p;
}

@compute @workgroup_size(128)
fn beginPolynomial(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= P.gridU.z) { return; }
  let v = lapPotential(i);
  rhs[i] = v;
  output[i] = vec2f(C.coefficient * v, 0.0);
}

@compute @workgroup_size(128)
fn recur(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= P.gridU.z) { return; }
  output[i] = vec2f(2.0 * shiftedLaplacian(i) - previous[i].y + C.coefficient * rhs[i], previous[i].x);
}

@compute @workgroup_size(128)
fn finish(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= P.gridU.z) { return; }
  if ((links[i] & 0x80000000u) == 0u) {
    next[i] = vec2f(0.0);
    return;
  }
  let acceleration = -(shiftedLaplacian(i) - previous[i].y + C.coefficient * rhs[i]) - 0.00022 * lapState(i).y;
  let v = (state[i].y + P.clock.y * acceleration) * exp(-P.clock.y * 0.065);
  next[i] = vec2f(state[i].x + P.clock.y * v, v);
}

@compute @workgroup_size(128)
fn seedPressure(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= P.gridU.z) { return; }
  let seed = hashNoise(i ^ hashNoise(u32(round(P.clock.x * 120.0)) + u32(P.settings.z)));
  let wet = (links[i] & 0x80000000u) != 0u;
  output[i] = select(
    vec2f(0.0),
    vec2f(randomGaussianApprox(seed), randomGaussianApprox(seed ^ 0xa511e9b3u)),
    wet,
  );
}

@compute @workgroup_size(128)
fn diffusePressure(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= P.gridU.z) { return; }
  output[i] = excitation[i] - lapNoise(i) / (C.limit * 1.05);
}

@compute @workgroup_size(128)
fn initializeState(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= P.gridU.z) { return; }
  if ((links[i] & 0x80000000u) == 0u) {
    next[i] = vec2f(0.0);
    return;
  }
  let invDx2 = max(P.gridF.y, 1.0);
  let q = (lapNoise(i) / invDx2) * (0.0115 * P.settings.x / 0.018);
  next[i] = vec2f(q.x, 13.5 * q.y);
}

// Seamlessly translates wave height/velocity state when the local simulation window follows the player.
@compute @workgroup_size(128)
fn shiftState(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= P.gridU.z) { return; }
  if ((links[i] & 0x80000000u) == 0u) {
    next[i] = vec2f(0.0);
    return;
  }
  let nx = i32(P.gridU.x);
  let nz = i32(P.gridU.y);
  let x = i32(i % P.gridU.x);
  let z = i32(i / P.gridU.x);
  let sx = x + i32(round(P.gridF.z));
  let sz = z + i32(round(P.gridF.w));
  if (sx >= 0 && sx < nx && sz >= 0 && sz < nz) {
    // Taper smoothly near the seam so newly uncovered edges never introduce a sharp height cliff.
    let edgeDist = min(min(sx, nx - 1 - sx), min(sz, nz - 1 - sz));
    let fade = clamp(f32(edgeDist) / 4.0, 0.0, 1.0);
    next[i] = state[u32(sz * nx + sx)] * fade;
  } else {
    next[i] = vec2f(0.0);
  }
}
