// Interactive 2D Pool Wave Simulation (instantiated only by levels with water).
// Smooth isotropic 9-point wave propagation with Neumann no-flux reflections off solid
// walls/columns/stairs, smooth multi-band non-looping ambient swell (no spiky high-freq static),
// and calibrated player wading pressure dipole + footstep impulses.

struct WaterSimUniform {
  grid: vec4u,            // x = nx, y = nz, z = stepCount, w = wakeCount
  domain: vec4f,          // x = minX, y = minZ, z = dx, w = dt
  waveParams: vec4f,      // x = waveSpeed, y = damping, z = ambientAmp, w = time
  wakes: array<vec4f, 8>, // xyz = (worldX, worldZ, radius), w = strength
};

@group(0) @binding(0) var<uniform> sim: WaterSimUniform;
@group(0) @binding(1) var<storage, read> solidMask: array<u32>;
@group(0) @binding(2) var<storage, read> stateIn: array<vec2f>;  // x = height, y = velocity
@group(0) @binding(3) var<storage, read_write> stateOut: array<vec2f>;

fn readHeight(x: i32, z: i32, nx: i32, nz: i32, fallback: f32) -> f32 {
  if (x < 0 || x >= nx || z < 0 || z >= nz) { return fallback; }
  let idx = u32(z * nx + x);
  // Neumann zero-flux reflection at solid walls, columns, and steps!
  if (solidMask[idx] != 0u) { return fallback; }
  return stateIn[idx].x;
}

fn readVel(x: i32, z: i32, nx: i32, nz: i32, fallback: f32) -> f32 {
  if (x < 0 || x >= nx || z < 0 || z >= nz) { return fallback; }
  let idx = u32(z * nx + x);
  if (solidMask[idx] != 0u) { return fallback; }
  return stateIn[idx].y;
}

@compute @workgroup_size(8, 8)
fn stepWaves(@builtin(global_invocation_id) gid: vec3u) {
  let nx = i32(sim.grid.x);
  let nz = i32(sim.grid.y);
  let ix = i32(gid.x);
  let iz = i32(gid.y);
  if (ix >= nx || iz >= nz) { return; }

  let idx = u32(iz * nx + ix);
  if (solidMask[idx] != 0u) {
    stateOut[idx] = vec2f(0.0, 0.0);
    return;
  }

  let cur = stateIn[idx];
  let h = cur.x;
  var v = cur.y;

  // 9-point isotropic Laplacian for circularly symmetric wave propagation.
  let hL = readHeight(ix - 1, iz, nx, nz, h);
  let hR = readHeight(ix + 1, iz, nx, nz, h);
  let hD = readHeight(ix, iz - 1, nx, nz, h);
  let hU = readHeight(ix, iz + 1, nx, nz, h);
  let hDL = readHeight(ix - 1, iz - 1, nx, nz, h);
  let hDR = readHeight(ix + 1, iz - 1, nx, nz, h);
  let hUL = readHeight(ix - 1, iz + 1, nx, nz, h);
  let hUR = readHeight(ix + 1, iz + 1, nx, nz, h);

  let invDx2 = 1.0 / (sim.domain.z * sim.domain.z);
  let lapH = (0.68 * (hL + hR + hD + hU - 4.0 * h) + 0.16 * (hDL + hDR + hUL + hUR - 4.0 * h)) * invDx2;

  // Gentle velocity diffusion (viscous short-wave dissipation) keeps ripples smooth & liquid-glassy!
  let vL = readVel(ix - 1, iz, nx, nz, v);
  let vR = readVel(ix + 1, iz, nx, nz, v);
  let vD = readVel(ix, iz - 1, nx, nz, v);
  let vU = readVel(ix, iz + 1, nx, nz, v);
  let lapV = (vL + vR + vD + vU - 4.0 * v) * invDx2;

  let c2 = sim.waveParams.x * sim.waveParams.x;
  let dt = sim.domain.w;
  var accel = c2 * lapH + 0.0045 * lapV;

  // Organic, non-looping multi-directional ambient indoor pool swell (smooth medium wavelengths
  // matching photographic indoor pool ripples — visibly bending refracted tiles & window reflections!).
  let wx = sim.domain.x + (f32(ix) + 0.5) * sim.domain.z;
  let wz = sim.domain.y + (f32(iz) + 0.5) * sim.domain.z;
  let t = sim.waveParams.w;
  let amp = sim.waveParams.z;
  let drv =
    sin(wx * 2.15 + wz * 1.35 - t * 2.10) * 0.30 +
    sin(wx * -1.75 + wz * 2.65 + t * 1.85) * 0.26 +
    sin(wx * 3.85 + wz * -3.10 + t * 2.95) * 0.20 +
    sin(wx * -4.60 + wz * -3.45 - t * 3.40) * 0.14 +
    sin(wx * 6.20 + wz * 4.80 - t * 4.25) * 0.10;
  accel += drv * amp * 26.0;

  // Live player wading wakes & footstep impulses.
  let wc = min(sim.grid.w, 8u);
  for (var i = 0u; i < wc; i++) {
    let w = sim.wakes[i];
    let ddx = wx - w.x;
    let ddz = wz - w.y;
    let r2 = (ddx * ddx + ddz * ddz) / max(w.z * w.z, 0.01);
    if (r2 < 9.0) {
      accel += w.w * exp(-r2) * 16.0;
    }
  }

  // Semi-implicit Euler update with gentle viscous damping.
  v = (v + accel * dt) * exp(-sim.waveParams.y * dt);
  let nextH = clamp(h + v * dt, -0.10, 0.10);
  stateOut[idx] = vec2f(nextH, clamp(v, -1.2, 1.2));
}
