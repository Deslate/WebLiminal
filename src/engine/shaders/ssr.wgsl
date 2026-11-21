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
        if (u < -1e-5 || u > 1.00001) { continue; }
        let qvec = cross(tvec, tri.e1);
        let v = dot(rd, qvec) * invDet;
        if (v < -1e-5 || u + v > 1.00001) { continue; }
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
        if (u < -1e-5 || u > 1.00001) { continue; }
        let qvec = cross(tvec, tri.e1);
        let v = dot(rd, qvec) * invDet;
        if (v < -1e-5 || u + v > 1.00001) { continue; }
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

fn ignSSR(p: vec2f) -> f32 {
  return fract(52.9829189 * fract(dot(p, vec2f(0.06711056, 0.00583715))));
}

fn r2Noise(p: vec2f) -> vec2f {
  // Blue-noise-like Interleaved Gradient Noise eliminates low-frequency diagonal clumping on glossy walls.
  return vec2f(ignSSR(p), ignSSR(p + vec2f(17.0, 41.0)));
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

fn smithG1Refl(nv: f32, a: f32) -> f32 {
  return 2.0 * nv / max(nv + sqrt(a * a + (1.0 - a * a) * nv * nv), 1e-5);
}

@compute @workgroup_size(8, 8)
fn traceSSR(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(outSSR);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }

  let flags = u32(frame.waterInfo.w + 0.5);
  if ((flags & 2u) != 0u) {
    textureStore(outSSR, vec2i(gid.xy), vec4f(0.0));
    return;
  }

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

  // Skip truly matte surfaces quickly (carpet, rough wallpaper, plaster, recessed grout).
  if (reflMask < 0.08 || rough > 0.54) {
    textureStore(outSSR, vec2i(gid.xy), vec4f(0.0));
    return;
  }

  let wp = reconstructWorldPos(uv, depth);
  let N = normalize(nr.xyz);
  let V = normalize(frame.cameraPos.xyz - wp);
  let nv = max(dot(N, V), 0.02);

  // Exact physical Fresnel: glazed porcelain dielectric (IOR = 1.52 -> F0 ~ 0.043) vs conductor metal.
  let isMetal = step(0.85, reflMask) * step(0.02, length(ar.rgb - vec3f(1.0)));
  let alpha = max(rough * rough, 0.004);
  let frameN = orthoBasis(N);
  let ro = wp + N * 0.026;
  let baseXi = r2Noise(vec2f(gid.xy));

  // 2-ray antithetic stratified deterministic GGX quadrature at half-resolution (8x fewer BVH rays
  // than full-res 4-ray), reconstructed cleanly by the full-res bilateral edge-stopping composite.
  let rays = 2u;
  var accumCol = vec3f(0.0);
  var accumW = 0.0;

  for (var ri = 0u; ri < rays; ri++) {
    let u = ((f32(ri) + baseXi.x) / f32(rays)) * 0.84;
    let phi = 2.0 * PI * fract(baseXi.y + f32(ri) * 0.5 + 0.25);
    let rad = alpha * sqrt(u / max(1.0 - u, 0.04));
    let H = normalize(frameN * vec3f(rad * cos(phi), rad * sin(phi), 1.0));
    let vh = max(dot(V, H), 0.0);
    let nh = max(dot(N, H), 1e-4);
    let R = reflect(-V, H);
    let nl = dot(N, R);
    if (nl <= 0.015 || vh <= 0.0) { continue; }

    let hit = traceClosestRefl(ro, R, 90.0);
    var sCol: vec3f;
    if (hit.hit) {
      let hitPos = ro + R * hit.t;
      sCol = shadeReflHit(hit, hitPos, R);
      if (frame.waterInfo.y > 0.5 && wp.y > frame.waterInfo.x && hitPos.y < frame.waterInfo.x) {
        let subDepth = max(0.0, frame.waterInfo.x - hitPos.y);
        sCol *= exp(-vec3f(0.62, 0.12, 0.14) * subDepth * 1.4);
      }
    } else {
      sCol = evalSkyRadiance(R, frame.skyTop.rgb, frame.skyHorizon.rgb, frame.sunDirRad.xyz, frame.sunColorInt.rgb, frame.sunColorInt.w > 0.5);
    }

    // Clamp extreme single-ray emissive fireflies so bright backlit windows reflect softly without polka dots.
    sCol = min(sCol, vec3f(14.0));

    let gWeight = clamp(smithG1Refl(nv, alpha) * smithG1Refl(nl, alpha) * vh / max(nv * nh, 1e-4), 0.0, 2.0);
    let dielecF = exactDielectricFresnel(vh, 1.52);
    let metalF = 0.72 + 0.28 * pow(1.0 - vh, 5.0);
    let F = mix(dielecF, metalF, isMetal);

    accumCol += sCol * F * gWeight;
    accumW += 1.0;
  }

  let roughFade = 1.0 - smoothstep(0.24, 0.54, rough);
  let invN = 1.0 / f32(rays);
  let reflRad = accumCol * invN * reflMask * roughFade;
  let valid = select(0.0, 1.0, accumW > 0.0);

  textureStore(outSSR, vec2i(gid.xy), vec4f(reflRad, valid * reflMask * roughFade));
}

fn linearDepthSSR(d: f32) -> f32 {
  // Exact inverse of buildViewProj (near = 0.06, far = 140.0)
  return (0.06 * 140.0) / max(140.0 - d * (140.0 - 0.06), 1e-4);
}

// Combined Full-Resolution Bilateral Composite:
//   1) 5x5 normal- & linear-depth-guided bilateral filter on 1-ray Bayer-stratified direct sun
//      visibility (produces silky, grain-free soft penumbras with razor-sharp corner stops!)
//   2) Normal-, roughness- & linear-depth-guided bilateral upsampling of half-res 2-ray BVH
//      glossy reflections (preserves architectural corners and tile joints without bleeding).
@group(1) @binding(0) var ssrTex: texture_2d<f32>;
@group(1) @binding(1) var outHdr: texture_storage_2d<rgba16float, write>;
@group(1) @binding(2) var sunDirectTex: texture_2d<f32>;

@compute @workgroup_size(8, 8)
fn compositeSSR(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(outHdr);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let px = vec2i(gid.xy);
  let fullMax = vec2i(dims) - vec2i(1);

  var finalCol = textureLoad(hdrIn, px, 0).rgb;
  let cD = textureLoad(depthTex, px, 0);
  if (cD >= 0.9999) {
    textureStore(outHdr, px, vec4f(finalCol, 1.0));
    return;
  }

  let nr = textureLoad(normalRoughTex, px, 0);
  let ar = textureLoad(albedoReflTex, px, 0);
  let sunD = textureLoad(sunDirectTex, px, 0);
  let cN = normalize(nr.xyz);
  let cLinD = linearDepthSSR(cD);
  let rough = nr.w;

  // 1. 5x5 Normal- & Linear-Depth-Guided Bilateral Soft Sun Shadow Filter
  if (max(sunD.r, max(sunD.g, sunD.b)) > 1e-4) {
    let invDepthScale = 1.0 / max(cLinD * 0.035, 0.045);
    var visSum = 0.0;
    var visWSum = 0.0;
    for (var dy = -2; dy <= 2; dy++) {
      for (var dx = -2; dx <= 2; dx++) {
        let spx = clamp(px + vec2i(dx, dy), vec2i(0), fullMax);
        let sD = textureLoad(depthTex, spx, 0);
        if (sD >= 0.9999) { continue; }
        let sNR = textureLoad(normalRoughTex, spx, 0);
        let sN = normalize(sNR.xyz);
        let sLinD = linearDepthSSR(sD);
        let relD = abs(sLinD - cLinD) * invDepthScale;
        let wNorm = pow(max(dot(cN, sN), 0.0), 32.0);
        let wDepth = exp(-relD * relD * 2.5);
        let wSpatial = exp(-f32(dx * dx + dy * dy) * 0.14);
        let w = wNorm * wDepth * wSpatial;
        let sVis = textureLoad(sunDirectTex, spx, 0).a;
        visSum += sVis * w;
        visWSum += w;
      }
    }
    let smoothVis = select(sunD.a, visSum / visWSum, visWSum > 1e-4);
    finalCol += sunD.rgb * smoothVis;
  }

  // 2. Bilateral Upsample of Half-Res 2-Ray BVH Glossy Reflections
  let flags = u32(frame.waterInfo.w + 0.5);
  let ssrDisabled = (flags & 2u) != 0u;
  if (!ssrDisabled && ar.a >= 0.08 && rough <= 0.54) {
    let ssrDims = vec2i(textureDimensions(ssrTex));
    let uv = (vec2f(gid.xy) + 0.5) / vec2f(dims);
    let centerC = clamp(vec2i(uv * vec2f(ssrDims)), vec2i(0), ssrDims - vec2i(1));

    let radius = select(1, 2, rough > 0.09);
    let ssrMax = ssrDims - vec2i(1);
    let invDepthScale = 1.0 / max(cLinD * 0.04, 0.05);

    var colSum = vec3f(0.0);
    var wSum = 0.0;

    for (var dy = -radius; dy <= radius; dy++) {
      for (var dx = -radius; dx <= radius; dx++) {
        let sc = clamp(centerC + vec2i(dx, dy), vec2i(0), ssrMax);
        let sUv = (vec2f(sc) + 0.5) / vec2f(ssrDims);
        let fpx = clamp(vec2i(sUv * vec2f(dims)), vec2i(0), fullMax);

        let sD = textureLoad(depthTex, fpx, 0);
        if (sD >= 0.9999) { continue; }
        let sNR = textureLoad(normalRoughTex, fpx, 0);
        let sN = normalize(sNR.xyz);
        let sLinD = linearDepthSSR(sD);
        let relD = abs(sLinD - cLinD) * invDepthScale;

        // Edge-stopping weights preserve tile joints & architectural corners cleanly.
        let wNorm = pow(max(dot(cN, sN), 0.0), 36.0);
        let wDepth = exp(-relD * relD * 3.0);
        let wRough = exp(-abs(sNR.w - rough) * 14.0);
        let wSpatial = exp(-f32(dx * dx + dy * dy) / max(1.0, 1.6 + rough * 6.5));
        let w = wNorm * wDepth * wRough * wSpatial;

        let samp = textureLoad(ssrTex, sc, 0);
        colSum += samp.rgb * w;
        wSum += w;
      }
    }

    let refl = select(vec3f(0.0), colSum / max(wSum, 1e-4), wSum > 1e-4);
    // Energy-conserving glaze/metal reflection addition (diffuse already scaled by 1 - Fv in gbuffer-pbr).
    finalCol += refl * ar.rgb;
  }

  textureStore(outHdr, px, vec4f(finalCol, 1.0));
}
