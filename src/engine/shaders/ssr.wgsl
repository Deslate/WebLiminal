// Screen-Space Reflections (SSR) + Roughness-Aware Composite Pass.
// Gives glazed Poolrooms tiles, wet concrete puddles, and stainless steel rails
// crisp, grounded real-time room reflections at ~1 ms cost.

struct FrameUniform {
  viewProj: mat4x4f,
  invViewProj: mat4x4f,
  cameraPos: vec4f,
  resolution: vec4f,
  sunDirRad: vec4f,
  sunColorInt: vec4f,
  skyTop: vec4f,
  skyHorizon: vec4f,
  fogColorDens: vec4f,
  fogParams: vec4f,
  waterInfo: vec4f,
};

@group(0) @binding(0) var<uniform> frame: FrameUniform;
@group(0) @binding(1) var hdrIn: texture_2d<f32>;
@group(0) @binding(2) var normalRoughTex: texture_2d<f32>;
@group(0) @binding(3) var albedoReflTex: texture_2d<f32>;
@group(0) @binding(4) var depthTex: texture_depth_2d;
@group(0) @binding(5) var linSampler: sampler;
@group(0) @binding(6) var outSSR: texture_storage_2d<rgba16float, write>;

fn reconstructWorldPos(uv: vec2f, depth: f32) -> vec3f {
  let ndc = vec4f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, depth, 1.0);
  let wp = frame.invViewProj * ndc;
  return wp.xyz / wp.w;
}

fn projectToUV(wp: vec3f) -> vec3f {
  let clip = frame.viewProj * vec4f(wp, 1.0);
  if (clip.w <= 1e-4) { return vec3f(-1.0); }
  let ndc = clip.xyz / clip.w;
  return vec3f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5, ndc.z);
}

fn ign(p: vec2f) -> f32 {
  return fract(52.9829189 * fract(dot(p, vec2f(0.06711056, 0.00583715))));
}

@compute @workgroup_size(8, 8)
fn traceSSR(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(outSSR);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let uv = (vec2f(gid.xy) + 0.5) / vec2f(dims);
  let fullDims = vec2i(textureDimensions(hdrIn));
  let px = clamp(vec2i(uv * vec2f(fullDims)), vec2i(0), fullDims - vec2i(1));

  let depth = textureLoad(depthTex, px, 0);
  if (depth >= 0.9999) {
    textureStore(outSSR, vec2i(gid.xy), vec4f(0.0));
    return;
  }

  let nr = textureLoad(normalRoughTex, px, 0);
  let ar = textureLoad(albedoReflTex, px, 0);
  let rough = nr.w;
  let reflMask = ar.a;

  // Skip matte surfaces quickly.
  if (reflMask < 0.04 || rough > 0.62) {
    textureStore(outSSR, vec2i(gid.xy), vec4f(0.0));
    return;
  }

  let wp = reconstructWorldPos(uv, depth);
  let N = normalize(nr.xyz);
  let V = normalize(frame.cameraPos.xyz - wp);
  let R = reflect(-V, N);

  let jitter = ign(vec2f(gid.xy));
  var t = 0.08 + jitter * 0.08;
  var hitUV = vec2f(0.0);
  var hitFound = false;
  var prevT = 0.0;

  let maxSteps = 28;
  for (var s = 0; s < maxSteps; s++) {
    let sampleP = wp + R * t;
    let proj = projectToUV(sampleP);
    if (proj.x < 0.0 || proj.x > 1.0 || proj.y < 0.0 || proj.y > 1.0 || proj.z < 0.0 || proj.z > 1.0) {
      break;
    }
    let spx = clamp(vec2i(proj.xy * vec2f(fullDims)), vec2i(0), fullDims - vec2i(1));
    let sceneD = textureLoad(depthTex, spx, 0);
    if (sceneD < 0.9999 && proj.z > sceneD) {
      // Check world-space thickness to prevent foreground silhouette stretching.
      let hitW = reconstructWorldPos(proj.xy, sceneD);
      let thickness = length(hitW - sampleP);
      let maxThick = 0.22 + t * 0.08;
      if (thickness < maxThick) {
        // Binary refine between prevT and t.
        var lo = prevT;
        var hi = t;
        for (var b = 0; b < 4; b++) {
          let mid = (lo + hi) * 0.5;
          let mp = projectToUV(wp + R * mid);
          let mpx = clamp(vec2i(mp.xy * vec2f(fullDims)), vec2i(0), fullDims - vec2i(1));
          let md = textureLoad(depthTex, mpx, 0);
          if (mp.z > md) {
            hi = mid;
            hitUV = mp.xy;
          } else {
            lo = mid;
          }
        }
        hitFound = true;
        break;
      }
    }
    prevT = t;
    t += 0.14 + t * 0.11;
    if (t > 22.0) { break; }
  }

  if (!hitFound) {
    textureStore(outSSR, vec2i(gid.xy), vec4f(0.0));
    return;
  }

  // Smooth fade near screen borders and high roughness.
  let edge = min(min(hitUV.x, 1.0 - hitUV.x), min(hitUV.y, 1.0 - hitUV.y));
  let edgeFade = smoothstep(0.0, 0.09, edge);
  let roughFade = 1.0 - smoothstep(0.14, 0.60, rough);
  let ndv = max(dot(N, V), 0.01);
  let fresnel = 0.05 + 0.95 * pow(1.0 - ndv, 4.5);
  let mirrorBoost = smoothstep(0.12, 0.04, rough) * 0.45;
  let weight = clamp(edgeFade * roughFade * reflMask * (fresnel + mirrorBoost), 0.0, 0.94);

  let reflCol = textureSampleLevel(hdrIn, linSampler, hitUV, 0.0).rgb;
  let safeCol = min(reflCol, vec3f(14.0));
  textureStore(outSSR, vec2i(gid.xy), vec4f(safeCol, weight));
}

// Roughness-aware composite pass: filters half-res SSR and blends onto full-res HDR.
@group(1) @binding(0) var ssrTex: texture_2d<f32>;
@group(1) @binding(1) var outHdr: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8)
fn compositeSSR(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(outHdr);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let px = vec2i(gid.xy);
  let base = textureLoad(hdrIn, px, 0).rgb;
  let nr = textureLoad(normalRoughTex, px, 0);
  let ar = textureLoad(albedoReflTex, px, 0);
  let rough = nr.w;

  if (ar.a < 0.04 || rough > 0.62) {
    textureStore(outHdr, px, vec4f(base, 1.0));
    return;
  }

  let uv = (vec2f(gid.xy) + 0.5) / vec2f(dims);
  let ssrDims = vec2f(textureDimensions(ssrTex));
  let texel = (0.75 + rough * 3.8) / ssrDims;

  var sum = vec4f(0.0);
  sum += textureSampleLevel(ssrTex, linSampler, uv, 0.0) * 0.36;
  sum += textureSampleLevel(ssrTex, linSampler, uv + vec2f(texel.x, 0.0), 0.0) * 0.16;
  sum += textureSampleLevel(ssrTex, linSampler, uv - vec2f(texel.x, 0.0), 0.0) * 0.16;
  sum += textureSampleLevel(ssrTex, linSampler, uv + vec2f(0.0, texel.y), 0.0) * 0.16;
  sum += textureSampleLevel(ssrTex, linSampler, uv - vec2f(0.0, texel.y), 0.0) * 0.16;

  // ar.rgb already carries exact dielectric (white) vs conductor (albedo) reflection tint.
  let finalCol = base + sum.rgb * ar.rgb * sum.a * 0.85;
  textureStore(outHdr, px, vec4f(finalCol, 1.0));
}
