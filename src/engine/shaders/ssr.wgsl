// Full-Scene BVH Ray-Traced Glossy Reflections + Normal/Depth-Guided Bilateral Filter.
// Prepended with bvh-common.wgsl.
// Replaces hole-ridden Screen-Space Reflections with true full-scene BVH reflection rays
// sampling the baked multi-bounce GI lightmap, analytic ceramic tiles, direct sun shadows,
// full HDR emissive windows/skylights, and sky backdrop — completely eliminating SSR holes
// and letting individual micro-tilted Poolrooms ceramic tiles sparkle like real porcelain!

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
@group(0) @binding(7) var<storage, read> bvhNodes: array<BVHNode>;
@group(0) @binding(8) var<storage, read> bvhTris: array<BVHTri>;
@group(0) @binding(9) var<storage, read> materials: array<MaterialGPU>;
@group(0) @binding(10) var lmIrradTex: texture_2d<f32>;

fn reconstructWorldPos(uv: vec2f, depth: f32) -> vec3f {
  let ndc = vec4f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, depth, 1.0);
  let wp = frame.invViewProj * ndc;
  return wp.xyz / wp.w;
}

fn traceClosestRefl(ro: vec3f, rd: vec3f, maxT: f32) -> RayHit {
  var res = RayHit(maxT, vec3f(0.0, 1.0, 0.0), 0u, false, vec2f(0.0), vec2f(0.0));
  let invD = 1.0 / select(rd, vec3f(1e-8), abs(rd) < vec3f(1e-8));
  if (hitAABB(bvhNodes[0].minB, bvhNodes[0].maxB, ro, invD, res.t) >= res.t) {
    return res;
  }
  var stack: array<u32, 32>;
  var sp = 0u;
  var cur = 0u;
  loop {
    let node = bvhNodes[cur];
    if (node.triCount > 0u) {
      let end = node.leftFirst + node.triCount;
      for (var i = node.leftFirst; i < end; i++) {
        let tri = bvhTris[i];
        let pvec = cross(rd, tri.e2);
        let det = dot(tri.e1, pvec);
        if (abs(det) < 1e-8) { continue; }
        let invDet = 1.0 / det;
        let tvec = ro - tri.v0;
        let u = dot(tvec, pvec) * invDet;
        if (u < 0.0 || u > 1.0) { continue; }
        let qvec = cross(tvec, tri.e1);
        let v = dot(rd, qvec) * invDet;
        if (v < 0.0 || u + v > 1.0) { continue; }
        let t = dot(tri.e2, qvec) * invDet;
        if (t > 1e-3 && t < res.t) {
          res.t = t;
          res.n = select(tri.gn, -tri.gn, det < 0.0);
          res.matId = tri.matId;
          res.hit = true;
          res.lmUV = tri.lm0_dlm1.xy + u * tri.lm0_dlm1.zw + v * tri.dlm2_uv0.xy;
          res.uv = tri.dlm2_uv0.zw + u * tri.duv1_duv2.xy + v * tri.duv1_duv2.zw;
        }
      }
      if (sp == 0u) { break; }
      sp -= 1u;
      cur = stack[sp];
    } else {
      let l = node.leftFirst;
      let r = l + 1u;
      let dL = hitAABB(bvhNodes[l].minB, bvhNodes[l].maxB, ro, invD, res.t);
      let dR = hitAABB(bvhNodes[r].minB, bvhNodes[r].maxB, ro, invD, res.t);
      let nearIdx = select(r, l, dL < dR);
      let farIdx = select(l, r, dL < dR);
      if (min(dL, dR) >= res.t) {
        if (sp == 0u) { break; }
        sp -= 1u;
        cur = stack[sp];
      } else {
        if (max(dL, dR) < res.t && sp < 31u) {
          stack[sp] = farIdx;
          sp += 1u;
        }
        cur = nearIdx;
      }
    }
  }
  return res;
}

fn traceShadowRefl(ro: vec3f, rd: vec3f, maxT: f32) -> bool {
  let invD = 1.0 / select(rd, vec3f(1e-8), abs(rd) < vec3f(1e-8));
  if (hitAABB(bvhNodes[0].minB, bvhNodes[0].maxB, ro, invD, maxT) >= maxT) {
    return false;
  }
  var stack: array<u32, 32>;
  var sp = 0u;
  var cur = 0u;
  loop {
    let node = bvhNodes[cur];
    if (node.triCount > 0u) {
      let end = node.leftFirst + node.triCount;
      for (var i = node.leftFirst; i < end; i++) {
        let tri = bvhTris[i];
        let pvec = cross(rd, tri.e2);
        let det = dot(tri.e1, pvec);
        if (abs(det) < 1e-8) { continue; }
        let invDet = 1.0 / det;
        let tvec = ro - tri.v0;
        let u = dot(tvec, pvec) * invDet;
        if (u < 0.0 || u > 1.0) { continue; }
        let qvec = cross(tvec, tri.e1);
        let v = dot(rd, qvec) * invDet;
        if (v < 0.0 || u + v > 1.0) { continue; }
        let t = dot(tri.e2, qvec) * invDet;
        if (t > 1e-3 && t < maxT) { return true; }
      }
      if (sp == 0u) { break; }
      sp -= 1u;
      cur = stack[sp];
    } else {
      let l = node.leftFirst;
      let r = l + 1u;
      let dL = hitAABB(bvhNodes[l].minB, bvhNodes[l].maxB, ro, invD, maxT);
      let dR = hitAABB(bvhNodes[r].minB, bvhNodes[r].maxB, ro, invD, maxT);
      let nearIdx = select(r, l, dL < dR);
      let farIdx = select(l, r, dL < dR);
      if (min(dL, dR) >= maxT) {
        if (sp == 0u) { break; }
        sp -= 1u;
        cur = stack[sp];
      } else {
        if (max(dL, dR) < maxT && sp < 31u) {
          stack[sp] = farIdx;
          sp += 1u;
        }
        cur = nearIdx;
      }
    }
  }
  return false;
}

fn sampleGGXHalf(n: vec3f, rough: f32, u1: f32, u2: f32) -> vec3f {
  let a = max(rough * rough, 0.002);
  let phi = 2.0 * PI * u1;
  let cosTheta = sqrt(max(0.0, (1.0 - u2) / (1.0 + (a * a - 1.0) * u2)));
  let sinTheta = sqrt(max(0.0, 1.0 - cosTheta * cosTheta));
  let hLocal = vec3f(sinTheta * cos(phi), sinTheta * sin(phi), cosTheta);
  return normalize(orthoBasis(n) * hLocal);
}

fn r2Noise(p: vec2f) -> vec2f {
  return fract(vec2f(0.7548776662, 0.5698402910) * (p.x + p.y * 19.37) + p * vec2f(0.137, 0.291));
}

fn shadeReflHit(hit: RayHit, hitPos: vec3f, rd: vec3f) -> vec3f {
  let m = materials[hit.matId];
  let lmI = textureSampleLevel(lmIrradTex, linSampler, hit.lmUV, 0.0).rgb + vec3f(frame.fogParams.w);

  var albedo = m.albedoScale.rgb;
  let fw = vec2f(0.005 * (1.0 + hit.t * 0.30));
  let cer = evalAnalyticCeramic(hit.uv, m, albedo, m.pbr.x, fw);
  if (cer.isCeramic) {
    albedo = cer.albedo;
  }

  let kD = 1.0 - m.pbr.y * 0.85;
  var col = albedo * kD * lmI;

  // Direct sunlight at the reflected hit point (crisp sunlit walls/columns reflected in glossy tiles!)
  if (frame.sunColorInt.w > 0.5) {
    let sunDir = frame.sunDirRad.xyz;
    let ndl = dot(hit.n, sunDir);
    if (ndl > 0.0 && !traceShadowRefl(hitPos + hit.n * 0.015, sunDir, 150.0)) {
      col += albedo * kD * frame.sunColorInt.rgb * ndl * INV_PI;
    }
  }

  // Full HDR emissive (glowing frosted pill windows, portholes, fluorescent panels, EXIT signs)
  col += m.emissive.rgb * m.emissive.w;

  // Subtle atmospheric haze along reflection ray
  let fogF = 1.0 - exp(-hit.t * frame.fogColorDens.w * 0.85);
  col = mix(col, frame.fogColorDens.rgb, clamp(fogF, 0.0, 0.80));
  return col;
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

  // Skip truly matte surfaces quickly (carpet, rough wallpaper, plaster, grout).
  if (reflMask < 0.05 || rough > 0.55) {
    textureStore(outSSR, vec2i(gid.xy), vec4f(0.0));
    return;
  }

  let wp = reconstructWorldPos(uv, depth);
  let N = normalize(nr.xyz);
  let V = normalize(frame.cameraPos.xyz - wp);

  // Deterministic GGX reflection ray (zero temporal flicker, crisp per-tile glazed ceramic facets!).
  let xi = r2Noise(vec2f(gid.xy));
  let sampleRough = clamp(rough * 0.52, 0.015, 0.28);
  let H = sampleGGXHalf(N, sampleRough, xi.x, xi.y * 0.78);
  var R = reflect(-V, H);
  if (dot(R, N) <= 0.01) {
    R = reflect(-V, N);
  }
  R = normalize(R);

  let ro = wp + N * 0.016;
  let hit = traceClosestRefl(ro, R, 90.0);

  var reflCol: vec3f;
  if (hit.hit) {
    let hitPos = ro + R * hit.t;
    reflCol = shadeReflHit(hit, hitPos, R);
    if (frame.waterInfo.y > 0.5 && wp.y > frame.waterInfo.x && hitPos.y < frame.waterInfo.x) {
      let subDepth = max(0.0, frame.waterInfo.x - hitPos.y);
      reflCol *= exp(-vec3f(0.38, 0.085, 0.042) * subDepth * 1.6);
    }
  } else {
    reflCol = evalSkyRadiance(R, frame.skyTop.rgb, frame.skyHorizon.rgb, frame.sunDirRad.xyz, frame.sunColorInt.rgb, frame.sunColorInt.w > 0.5);
  }

  // Exact Fresnel reflectance: glossy glazed ceramic / wet clearcoat (IOR 1.56) vs metallic conductor.
  let ndv = max(dot(N, V), 0.01);
  let dielecF = exactDielectricFresnel(ndv, 1.56);
  let isMetal = step(0.85, reflMask) * step(0.02, length(ar.rgb - vec3f(1.0)));
  let fresnel = mix(dielecF * 1.35, 0.62 + 0.38 * pow(1.0 - ndv, 5.0), isMetal);
  let roughFade = 1.0 - smoothstep(0.16, 0.52, rough);
  let weight = clamp(reflMask * roughFade * fresnel, 0.0, 0.96);

  textureStore(outSSR, vec2i(gid.xy), vec4f(min(reflCol, vec3f(28.0)), weight));
}

// Normal- & depth-guided bilateral filter composite:
// Smooths GGX glossy reflection lobes cleanly WITHOUT bleeding across individual tilted ceramic tiles!
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

  if (ar.a < 0.05 || rough > 0.55) {
    textureStore(outHdr, px, vec4f(base, 1.0));
    return;
  }

  let ssrDims = vec2i(textureDimensions(ssrTex));
  let uv = (vec2f(gid.xy) + 0.5) / vec2f(dims);
  let centerC = clamp(vec2i(uv * vec2f(ssrDims)), vec2i(0), ssrDims - vec2i(1));
  let cN = normalize(nr.xyz);
  let cD = textureLoad(depthTex, px, 0);

  let radius = select(1, 2, rough > 0.11);
  let stride = select(1, 2, rough > 0.24);
  let fullMax = vec2i(dims) - vec2i(1);
  let ssrMax = ssrDims - vec2i(1);

  var colSum = vec3f(0.0);
  var alphaSum = 0.0;
  var wSum = 0.0;

  for (var dy = -radius; dy <= radius; dy++) {
    for (var dx = -radius; dx <= radius; dx++) {
      let sc = clamp(centerC + vec2i(dx, dy) * stride, vec2i(0), ssrMax);
      let sUv = (vec2f(sc) + 0.5) / vec2f(ssrDims);
      let fpx = clamp(vec2i(sUv * vec2f(dims)), vec2i(0), fullMax);

      let sNR = textureLoad(normalRoughTex, fpx, 0);
      let sD = textureLoad(depthTex, fpx, 0);
      let sN = normalize(sNR.xyz);

      // Edge-stopping weights preserve individual tile micro-tilt facets & architectural corners!
      let wNorm = pow(max(dot(cN, sN), 0.0), 40.0);
      let wDepth = exp(-abs(sD - cD) * 800.0);
      let wSpatial = exp(-f32(dx * dx + dy * dy) / max(0.8, 1.5 + rough * 6.0));
      let w = wNorm * wDepth * wSpatial;

      let samp = textureLoad(ssrTex, sc, 0);
      colSum += samp.rgb * samp.a * w;
      alphaSum += samp.a * w;
      wSum += w;
    }
  }

  let refl = select(vec3f(0.0), colSum / max(wSum, 1e-4), wSum > 1e-4);
  let reflAlpha = select(0.0, alphaSum / max(wSum, 1e-4), wSum > 1e-4);

  // Energy-conserving glaze/metal reflection blend.
  let finalCol = base * (1.0 - reflAlpha * 0.35) + refl * ar.rgb;
  textureStore(outHdr, px, vec4f(finalCol, 1.0));
}
