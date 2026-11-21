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

fn evalWetCell(idx: u32) -> vec2f {
  let ix = idx % R.grid.x;
  let iz = idx / R.grid.x;
  let world = R.win.xy + (vec2f(f32(ix), f32(iz)) + 0.5) * R.win.z;
  let q = fdState[idx];
  let wake = sampleBodyWake(world);
  let h = clamp(q.x + q.y * R.win.w + wake.x, -0.14, 0.14);
  let v = q.y + wake.y;
  return vec2f(h, v);
}

@compute @workgroup_size(128)
fn reconstruct(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= R.grid.z) { return; }
  let wet = (links[i] & 0x80000000u) != 0u;
  if (wet) {
    combined[i] = evalWetCell(i);
    return;
  }

  // Neumann ghost-cell extrapolation (dh/dn = 0 across solid walls, columns, decks & steps):
  // Mirrors adjacent wet wave elevation into the 2-cell dry border so Catmull-Rom bicubic
  // derivatives stay physically smooth right up to every wall (eliminating artificial wall-edge
  // cliffs, black grazing bands, and flat zero-height shoreline clamping!).
  let nx = i32(R.grid.x);
  let nz = i32(R.grid.y);
  let cx = i32(i % R.grid.x);
  let cz = i32(i / R.grid.x);
  var sum = vec2f(0.0);
  var wSum = 0.0;
  for (var dz = -2; dz <= 2; dz++) {
    let qz = cz + dz;
    if (qz < 0 || qz >= nz) { continue; }
    for (var dx = -2; dx <= 2; dx++) {
      let qx = cx + dx;
      if (qx < 0 || qx >= nx) { continue; }
      let qIdx = u32(qz * nx + qx);
      if ((links[qIdx] & 0x80000000u) != 0u) {
        let d2 = f32(dx * dx + dz * dz);
        let w = 1.0 / d2;
        sum += evalWetCell(qIdx) * w;
        wSum += w;
      }
    }
  }
  combined[i] = select(vec2f(0.0), sum / max(wSum, 1e-4), wSum > 0.0);
}
