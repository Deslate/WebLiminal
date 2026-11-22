// Toksvig-aware hardware mipmap generator for baked procedural PBR texture arrays.
// Folds sub-texel normal variance into roughness at coarser mip levels so distant
// tiles, grout joints, and wet concrete never alias or sparkle.

@group(0) @binding(0) var<uniform> mipInfo: vec4u; // x = dstSize, y = layerCount
@group(0) @binding(1) var srcAlbedoRough: texture_2d_array<f32>;
@group(0) @binding(2) var srcNormalHeight: texture_2d_array<f32>;
@group(0) @binding(3) var srcMeta: texture_2d_array<f32>;
@group(0) @binding(4) var dstAlbedoRough: texture_storage_2d_array<rgba8unorm, write>;
@group(0) @binding(5) var dstNormalHeight: texture_storage_2d_array<rgba8unorm, write>;
@group(0) @binding(6) var dstMeta: texture_storage_2d_array<rgba8unorm, write>;

fn decodeNormal(rg: vec2f) -> vec3f {
  let xy = rg * 2.0 - 1.0;
  let z = sqrt(max(0.001, 1.0 - dot(xy, xy)));
  return vec3f(xy, z);
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dstSize = mipInfo.x;
  if (gid.x >= dstSize || gid.y >= dstSize || gid.z >= mipInfo.y) { return; }
  let layer = i32(gid.z);
  let base = vec2i(gid.xy) * 2;

  var albedo = vec3f(0.0);
  var roughSq = 0.0;
  var avgN = vec3f(0.0);
  var height = 0.0;
  var ao = 0.0;
  var metaVal = vec4f(0.0);

  for (var dy = 0; dy < 2; dy++) {
    for (var dx = 0; dx < 2; dx++) {
      let c = base + vec2i(dx, dy);
      let ar = textureLoad(srcAlbedoRough, c, layer, 0);
      let nh = textureLoad(srcNormalHeight, c, layer, 0);
      let mt = textureLoad(srcMeta, c, layer, 0);
      albedo += ar.rgb;
      roughSq += ar.a * ar.a;
      avgN += decodeNormal(nh.rg);
      height += nh.b;
      ao += nh.a;
      metaVal += mt;
    }
  }

  albedo *= 0.25;
  roughSq *= 0.25;
  avgN *= 0.25;
  height *= 0.25;
  ao *= 0.25;
  metaVal *= 0.25;

  // Toksvig variance folding: shorter average normal means higher micro-slope variance.
  let nLen = length(avgN);
  let toksvig = clamp((1.0 - min(nLen, 1.0)) * 1.4, 0.0, 0.75);
  let outRough = sqrt(clamp(roughSq + toksvig, 0.0016, 1.0));
  let normN = select(vec3f(0.0, 0.0, 1.0), avgN / nLen, nLen > 1e-4);

  textureStore(dstAlbedoRough, vec2i(gid.xy), layer, vec4f(albedo, outRough));
  textureStore(dstNormalHeight, vec2i(gid.xy), layer, vec4f(normN.xy * 0.5 + 0.5, height, ao));
  textureStore(dstMeta, vec2i(gid.xy), layer, metaVal);
}
