// Combines the Neumann-masked finite-depth background wave field with the
// 256x256 spectral FFT body-wake & footstep field into one shared physical heightfield.
// Both live GPU photon caustics and BVH water rendering sample this exact combined field.

struct ReconstructParams {
  win: vec4f,        // x = winMinX, y = winMinZ, z = dx, w = extrapRemainderDt
  bodyAnchor: vec4f, // x = bodyMinX, y = bodyMinZ, z = invBodyDx, w = bodyActive (0 or 1)
  grid: vec4u,       // x = nx, y = nz, z = count, w = 0
};

@group(0) @binding(0) var<uniform> R: ReconstructParams;
@group(0) @binding(1) var<storage, read> fdState: array<vec2f>;
@group(0) @binding(2) var<storage, read> links: array<u32>;
@group(0) @binding(3) var<storage, read> bodyField: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> combined: array<vec2f>;

fn cubic2(a: vec2f, b: vec2f, c: vec2f, d: vec2f, t: f32) -> vec2f {
  return b + 0.5 * t * (c - a + t * (2.0 * a - 5.0 * b + 4.0 * c - d + t * (3.0 * (b - c) + d - a)));
}

fn sampleBodyWake(world: vec2f) -> vec2f {
  if (R.bodyAnchor.w < 0.5) { return vec2f(0.0); }
  let uv = (world - R.bodyAnchor.xy) * R.bodyAnchor.z;
  if (uv.x < 1.5 || uv.x > 253.5 || uv.y < 1.5 || uv.y > 253.5) {
    return vec2f(0.0);
  }
  let p = vec2i(floor(uv));
  let f = fract(uv);
  var rows: array<vec2f, 4>;
  for (var j = 0; j < 4; j++) {
    let rowBase = (p.y + j - 1) * 256 + p.x;
    rows[j] = cubic2(
      bodyField[u32(rowBase - 1)].xz,
      bodyField[u32(rowBase)].xz,
      bodyField[u32(rowBase + 1)].xz,
      bodyField[u32(rowBase + 2)].xz,
      f.x,
    );
  }
  return cubic2(rows[0], rows[1], rows[2], rows[3], f.y);
}

@compute @workgroup_size(128)
fn reconstruct(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= R.grid.z) { return; }
  let wet = (links[i] & 0x80000000u) != 0u;
  if (!wet) {
    combined[i] = vec2f(0.0);
    return;
  }
  let ix = i % R.grid.x;
  let iz = i / R.grid.x;
  let world = R.win.xy + (vec2f(f32(ix), f32(iz)) + 0.5) * R.win.z;
  let q = fdState[i];
  let wake = sampleBodyWake(world);
  // First-order sub-step extrapolation eliminates display stair-stepping without temporal blur.
  let h = clamp(q.x + q.y * R.win.w + wake.x, -0.14, 0.14);
  let v = q.y + wake.y;
  combined[i] = vec2f(h, v);
}
