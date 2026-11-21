// Optional interactive 2D pool wave simulation (only instantiated by maps with water).
// Implements a damped 2D wave PDE with Neumann solid wall/column reflections,
// organic continuous ambient pool micro-waves, and player wading wake forcing.

struct WaterSimUniform {
  grid: vec4u,      // x = nx, y = nz, z = stepCount, w = wakeCount
  domain: vec4f,    // x = minX, y = minZ, z = dx, w = dt
  waveParams: vec4f,// x = waveSpeed, y = damping, z = ambientAmp, w = time
  wakes: array<vec4f, 8>, // xyz = (worldX, worldZ, radius), w = strength
};

@group(0) @binding(0) var<uniform> sim: WaterSimUniform;
@group(0) @binding(1) var<storage, read> solidMask: array<u32>;
@group(0) @binding(2) var<storage, read> stateIn: array<vec2f>;  // x = height, y = velocity
@group(0) @binding(3) var<storage, read_write> stateOut: array<vec2f>;

fn readHeight(x: i32, z: i32, nx: i32, nz: i32, fallback: f32) -> f32 {
  if (x < 0 || x >= nx || z < 0 || z >= nz) { return fallback; }
  let idx = u32(z * nx + x);
  // Neumann zero-flux reflection at solid walls and columns!
  if (solidMask[idx] != 0u) { return fallback; }
  return stateIn[idx].x;
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

  // 9-point isotropic Laplacian reduces grid-aligned anisotropy on circular ripples.
  let hL = readHeight(ix - 1, iz, nx, nz, h);
  let hR = readHeight(ix + 1, iz, nx, nz, h);
  let hD = readHeight(ix, iz - 1, nx, nz, h);
  let hU = readHeight(ix, iz + 1, nx, nz, h);
  let hDL = readHeight(ix - 1, iz - 1, nx, nz, h);
  let hDR = readHeight(ix + 1, iz - 1, nx, nz, h);
  let hUL = readHeight(ix - 1, iz + 1, nx, nz, h);
  let hUR = readHeight(ix + 1, iz + 1, nx, nz, h);

  let lap = (0.68 * (hL + hR + hD + hU - 4.0 * h) + 0.16 * (hDL + hDR + hUL + hUR - 4.0 * h)) / (sim.domain.z * sim.domain.z);

  let c2 = sim.waveParams.x * sim.waveParams.x;
  let dt = sim.domain.w;
  var accel = c2 * lap;

  // Gentle organic ambient excitation (non-looping irrational frequencies) keeps the pool alive.
  let wx = sim.domain.x + (f32(ix) + 0.5) * sim.domain.z;
  let wz = sim.domain.y + (f32(iz) + 0.5) * sim.domain.z;
  let t = sim.waveParams.w;
  let amp = sim.waveParams.z;
  let drv =
    sin(wx * 2.1 + wz * 1.4 - t * 2.3) * 0.45 +
    sin(wx * -1.7 + wz * 2.6 + t * 1.9) * 0.35 +
    sin(wx * 3.8 + wz * -3.1 + t * 3.1) * 0.20;
  accel += drv * amp * 1.8;

  // Live player wading wakes & footstep impulses.
  let wc = min(sim.grid.w, 8u);
  for (var i = 0u; i < wc; i++) {
    let w = sim.wakes[i];
    let dx = wx - w.x;
    let dz = wz - w.y;
    let r2 = (dx * dx + dz * dz) / max(w.z * w.z, 0.01);
    if (r2 < 9.0) {
      accel += w.w * exp(-r2) * 14.0;
    }
  }

  // Semi-implicit Euler update with gentle viscous damping.
  v = (v + accel * dt) * exp(-sim.waveParams.y * dt);
  let nextH = clamp(h + v * dt, -0.14, 0.14);
  stateOut[idx] = vec2f(nextH, clamp(v, -1.5, 1.5));
}
