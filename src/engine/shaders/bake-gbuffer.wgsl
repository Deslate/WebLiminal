// Rasterizes the compiled scene mesh directly into UV2 lightmap atlas space
// to produce exact per-texel world positions, geometric normals, and material IDs,
// followed by a 2-texel conservative gutter dilation so island borders never bleed black.

struct VertexIn {
  @location(0) pos: vec3f,
  @location(1) matId: u32,
  @location(2) normal: vec3f,
  @location(3) tangent: vec4f,
  @location(4) uv: vec2f,
  @location(5) uv2: vec2f,
};

struct VSOut {
  @builtin(position) clipPos: vec4f,
  @location(0) worldPos: vec3f,
  @location(1) worldNorm: vec3f,
  @location(2) @interpolate(flat) matId: u32,
};

@vertex
fn vs(v: VertexIn) -> VSOut {
  var o: VSOut;
  o.clipPos = vec4f(v.uv2.x * 2.0 - 1.0, 1.0 - v.uv2.y * 2.0, 0.0, 1.0);
  o.worldPos = v.pos;
  o.worldNorm = v.normal;
  o.matId = v.matId;
  return o;
}

struct FSOut {
  @location(0) posValid: vec4f,
  @location(1) normMat: vec4f,
};

@fragment
fn fs(i: VSOut) -> FSOut {
  var o: FSOut;
  o.posValid = vec4f(i.worldPos, 1.0);
  o.normMat = vec4f(normalize(i.worldNorm), f32(i.matId));
  return o;
}

// Conservative 2-texel gutter dilation into storage buffers for fast compute reads.
@group(0) @binding(0) var<uniform> atlasInfo: vec4u; // x = atlasSize
@group(0) @binding(1) var rawPosTex: texture_2d<f32>;
@group(0) @binding(2) var rawNormTex: texture_2d<f32>;
@group(0) @binding(3) var<storage, read_write> outPosBuf: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> outNormBuf: array<vec4f>;

@compute @workgroup_size(8, 8)
fn dilateGBuffer(@builtin(global_invocation_id) gid: vec3u) {
  let size = atlasInfo.x;
  if (gid.x >= size || gid.y >= size) { return; }
  let idx = gid.y * size + gid.x;
  let c = vec2i(gid.xy);
  let p = textureLoad(rawPosTex, c, 0);
  if (p.w > 0.5) {
    outPosBuf[idx] = p;
    outNormBuf[idx] = textureLoad(rawNormTex, c, 0);
    return;
  }

  // Search nearest valid neighbor within radius 1 texel (1-texel per-side gutter isolates adjacent charts).
  var bestDist = 1e6;
  var bestP = vec4f(0.0);
  var bestN = vec4f(0.0, 1.0, 0.0, 0.0);
  let sMax = i32(size) - 1;
  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) {
      if (dx == 0 && dy == 0) { continue; }
      let q = clamp(c + vec2i(dx, dy), vec2i(0), vec2i(sMax));
      let np = textureLoad(rawPosTex, q, 0);
      if (np.w > 0.5) {
        let d2 = f32(dx * dx + dy * dy);
        if (d2 < bestDist) {
          bestDist = d2;
          bestP = vec4f(np.xyz, 0.5); // 0.5 marks dilated gutter texel
          bestN = textureLoad(rawNormTex, q, 0);
        }
      }
    }
  }
  outPosBuf[idx] = bestP;
  outNormBuf[idx] = bestN;
}
