// Full-Scene Deterministic BVH Glossy Reflections + Separable Roughness Cone Filter +
// Edge-Only World-Locked Soft Sun Penumbra & Smooth Bilinear Bilateral Composite.
// Prepended with bvh-common.wgsl.
//
// Zero screen-space random jitter (no IGN / no Bayer stipple):
//   - traceSSR: half-res 1-ray deterministic specular reflection using non-grout 2x2 quad selection
//   - filterSSRH / filterSSRV: separable half-res roughness- & hit-distance-adaptive bilateral cone filter
//   - compositeSSR: edge-only 12-tap deterministic solar disk penumbra + smooth bilinear reflection upsample

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
@group(0) @binding(11) var<storage, read> lights: array<AreaLight>;

@group(1) @binding(0) var ssrTex: texture_2d<f32>;
@group(1) @binding(1) var outHdr: texture_storage_2d<rgba16float, write>;
@group(1) @binding(2) var sunDirectTex: texture_2d<f32>;

fn reconstructWorldPos(uv: vec2f, depth: f32) -> vec3f {
  let ndc = vec4f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, depth, 1.0);
  let wp = frame.invViewProj * ndc;
  return wp.xyz / wp.w;
}

fn linearDepthSSR(d: f32) -> f32 {
  // Exact inverse of buildViewProj (near = 0.06, far = 140.0)
  return (0.06 * 140.0) / max(140.0 - d * (140.0 - 0.06), 1e-4);
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
        if (t > 1e-4 && t < res.t) {
          let hitUV = tri.dlm2_uv0.zw + u * tri.duv1_duv2.xy + v * tri.duv1_duv2.zw;
          if (u32(materials[tri.matId].extra.x + 0.5) == 21u && evalFoliageShadowAlpha(hitUV) < 0.5) { continue; }
          res.t = t;
          res.n = select(tri.gn, -tri.gn, det < 0.0);
          res.matId = tri.matId;
          res.hit = true;
          res.lmUV = tri.lm0_dlm1.xy + u * tri.lm0_dlm1.zw + v * tri.dlm2_uv0.xy;
          res.uv = hitUV;
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
        if (t > 1e-4 && t < maxT) {
          if (u32(materials[tri.matId].extra.x + 0.5) == 21u) {
            let hitUV = tri.dlm2_uv0.zw + u * tri.duv1_duv2.xy + v * tri.duv1_duv2.zw;
            if (evalFoliageShadowAlpha(hitUV) < 0.5) { continue; }
          }
          return true;
        }
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

  // Direct sunlight (Poolrooms / Level 1 Overgrown Courtyard) AND/OR per-pixel indoor area lights
  // (Level 0 & Level 1 Aquila/Warehouse/Vaults) at reflected hit point so wet puddles mirror lit columns & tubes!
  if (frame.sunColorInt.w > 0.5) {
    let sunDir = frame.sunDirRad.xyz;
    let ndl = dot(hit.n, sunDir);
    if (ndl > 0.0 && !traceShadowRefl(hitPos + hit.n * 0.015, sunDir, 150.0)) {
      col += albedo * kD * frame.sunColorInt.rgb * ndl * INV_PI;
    }
  }
  let perPixelLights = (u32(frame.waterInfo.w + 0.5) & 4u) != 0u;
  if (perPixelLights) {
    let lc = min(u32(frame.skyHorizon.w + 0.5), 64u);
    let roS = hitPos + hit.n * 0.015;
    var bestIdx = array<u32, 3>(0u, 0u, 0u);
    var bestSc = array<f32, 3>(0.0, 0.0, 0.0);
    for (var li = 0u; li < lc; li++) {
      let l = lights[li];
      let isPoint = l.edgeVKind.w > 1.5;
      let lCenter = select(l.originArea.xyz + 0.5 * (l.edgeUPower.xyz + l.edgeVKind.xyz), l.originArea.xyz, isPoint);
      let toL = lCenter - hitPos;
      let d2 = dot(toL, toL);
      if (d2 > 160.0 || d2 < select(0.04, 0.001, isPoint)) { continue; }
      let invD = inverseSqrt(d2);
      let wi = toL * invD;
      let cosS = dot(hit.n, wi);
      if (cosS <= 0.01) { continue; }
      var cosL = 1.0;
      if (!isPoint) {
        let lNorm = normalize(cross(l.edgeUPower.xyz, l.edgeVKind.xyz));
        cosL = dot(lNorm, -wi);
        if (cosL <= 0.02) { continue; }
      }
      let sc = (l.edgeUPower.w * cosS * cosL) / max(d2, select(0.25, 0.02, isPoint));
      if (sc <= bestSc[2]) { continue; }
      var pos = 2u;
      loop {
        if (pos == 0u || sc <= bestSc[pos - 1u]) { break; }
        bestSc[pos] = bestSc[pos - 1u];
        bestIdx[pos] = bestIdx[pos - 1u];
        pos -= 1u;
      }
      bestSc[pos] = sc;
      bestIdx[pos] = li;
    }
    for (var k = 0u; k < 3u; k++) {
      if (bestSc[k] < 0.004) { break; }
      let l = lights[bestIdx[k]];
      let isPoint = l.edgeVKind.w > 1.5;
      let lCenter = select(l.originArea.xyz + 0.5 * (l.edgeUPower.xyz + l.edgeVKind.xyz), l.originArea.xyz, isPoint);
      let toL = lCenter - hitPos;
      let d2 = max(dot(toL, toL), select(0.04, 0.002, isPoint));
      let rFade = smoothstep(160.0, 64.0, d2) * smoothstep(0.004, 0.025, bestSc[k]);
      if (rFade <= 0.0) { continue; }
      let dist = sqrt(d2);
      let wi = toL / dist;
      let cosS = max(dot(hit.n, wi), 0.0);
      if (isPoint) {
        let shadowOff = max(l.edgeUPower.x, 0.03);
        if (!traceShadowRefl(roS, wi, max(0.01, dist - shadowOff))) {
          col += albedo * kD * l.radianceCdf.rgb * ((cosS * rFade) / max(d2, 0.012) * INV_PI);
        }
      } else {
        let lNorm = normalize(cross(l.edgeUPower.xyz, l.edgeVKind.xyz));
        let cosL = max(dot(lNorm, -wi), 0.0);
        if (!traceShadowRefl(roS, wi, max(0.02, dist - 0.06))) {
          col += albedo * kD * l.radianceCdf.rgb * ((cosS * cosL * l.originArea.w * rFade) / max(d2, 0.18) * INV_PI);
        }
      }
    }
  }

  // Full HDR emissive (glowing frosted pill windows, portholes, fluorescent panels, EXIT signs)
  col += m.emissive.rgb * m.emissive.w;

  // Subtle atmospheric haze along reflection ray
  let fogF = 1.0 - exp(-hit.t * frame.fogColorDens.w * 0.85);
  col = mix(col, frame.fogColorDens.rgb, clamp(fogF, 0.0, 0.80));
  return col;
}

// Pick the most glossy (non-grout) full-res pixel in the 2x2 footprint for a half-res texel.
// Prevents 4 mm grout seams from causing half-res reflection blocks to blink on/off while panning!
fn pickHalfResPixel(hc: vec2i, fullDims: vec2i) -> vec2i {
  let maxP = fullDims - vec2i(1);
  let base = hc * 2;
  var bestPx = clamp(base, vec2i(0), maxP);
  var bestScore = -1.0;
  for (var oy = 0; oy < 2; oy++) {
    for (var ox = 0; ox < 2; ox++) {
      let p = clamp(base + vec2i(ox, oy), vec2i(0), maxP);
      let d = textureLoad(depthTex, p, 0);
      if (d >= 0.9999) { continue; }
      let nr = textureLoad(normalRoughTex, p, 0);
      let ar = textureLoad(albedoReflTex, p, 0);
      let score = ar.a * (1.15 - nr.w);
      if (score > bestScore) {
        bestScore = score;
        bestPx = p;
      }
    }
  }
  return bestPx;
}

// Pass 2a: Half-Res 1-Ray Deterministic Specular BVH Reflection (ZERO screen-space noise!).
@compute @workgroup_size(8, 8)
fn traceSSR(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(outSSR);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }

  let flags = u32(frame.waterInfo.w + 0.5);
  if ((flags & 2u) != 0u) {
    textureStore(outSSR, vec2i(gid.xy), vec4f(0.0));
    return;
  }

  let fullDims = vec2i(textureDimensions(depthTex));
  let px = pickHalfResPixel(vec2i(gid.xy), fullDims);

  let depth = textureLoad(depthTex, px, 0);
  if (depth >= 0.9999) {
    textureStore(outSSR, vec2i(gid.xy), vec4f(0.0));
    return;
  }

  let nr = textureLoad(normalRoughTex, px, 0);
  let ar = textureLoad(albedoReflTex, px, 0);
  let rough = nr.w;
  let reflMask = ar.a;

  // Skip truly matte surfaces quickly (carpet, rough wallpaper, plaster, dry concrete).
  if (reflMask < 0.08 || rough > 0.56) {
    textureStore(outSSR, vec2i(gid.xy), vec4f(0.0));
    return;
  }

  let uv = (vec2f(px) + 0.5) / vec2f(fullDims);
  let wp = reconstructWorldPos(uv, depth);
  let N = normalize(nr.xyz);
  let V = normalize(frame.cameraPos.xyz - wp);
  let nv = max(dot(N, V), 0.02);

  // Exact deterministic mirror reflection direction (zero screen-space IGN or stochastic boiling!).
  var R = reflect(-V, N);
  let rn = dot(R, N);
  if (rn < 0.02) {
    R = normalize(R + N * (0.02 - rn));
  }

  let ro = wp + N * 0.026;
  let hit = traceClosestRefl(ro, R, 90.0);
  var sCol: vec3f;
  var hitDist = 55.0;
  if (hit.hit) {
    hitDist = hit.t;
    let hitPos = ro + R * hit.t;
    sCol = shadeReflHit(hit, hitPos, R);
    if (frame.waterInfo.y > 0.5 && wp.y > frame.waterInfo.x && hitPos.y < frame.waterInfo.x) {
      let subDepth = max(0.0, frame.waterInfo.x - hitPos.y);
      sCol *= exp(-vec3f(0.62, 0.12, 0.14) * subDepth * 1.4);
    }
  } else {
    sCol = evalSkyRadiance(R, frame.skyTop.rgb, frame.skyHorizon.rgb, frame.sunDirRad.xyz, frame.sunColorInt.rgb, frame.sunColorInt.w > 0.5);
  }

  // Soft highlight knee keeps bright fluorescent tubes & windows luminous without single-pixel fireflies.
  sCol = min(sCol, vec3f(18.0));

  // Physical Fresnel with GGX rough-surface grazing attenuation:
  // Smooth glossy materials keep full Fresnel; satin-glazed ceramic (rough ~0.24..0.34) disperses
  // grazing reflections across a wide microfacet cone instead of mirroring corridors like glass!
  let isMetal = step(0.85, reflMask) * step(0.02, length(ar.rgb - vec3f(1.0)));
  let rawDielecF = exactDielectricFresnel(nv, 1.52);
  let roughDielecF = mix(rawDielecF, min(rawDielecF, 0.056), smoothstep(0.10, 0.26, rough));
  let metalF = 0.74 + 0.26 * pow(1.0 - nv, 5.0);
  let F = mix(roughDielecF, metalF, isMetal);

  // Energy-conserving GGX single-ray specular peak roll-off (strong on glossy glass/steel, subtle satin sheen on tile).
  let roughFade = pow(1.0 - smoothstep(0.08, 0.44, rough), 1.65);
  let reflRad = sCol * F * reflMask * roughFade;

  // Store hit distance in .a for physical roughness cone projection in filterSSRH/V!
  textureStore(outSSR, vec2i(gid.xy), vec4f(reflRad, hitDist));
}

// Shared separable 1D roughness- & hit-distance-adaptive bilateral filter (half-res).
// Projects the GGX angular lobe radius into half-res pixels so glazed ceramic tiles receive soft,
// satin-diffused porcelain sheen while glossy fiberglass/steel keep crisp window reflections!
fn filterSSR1D(gid: vec3u, axis: vec2i) {
  let dims = textureDimensions(outSSR);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let c = vec2i(gid.xy);
  let maxC = vec2i(dims) - vec2i(1);
  let center = textureLoad(ssrTex, c, 0);

  if (center.a <= 0.0001) {
    textureStore(outSSR, c, vec4f(0.0));
    return;
  }

  let fullDims = vec2i(textureDimensions(depthTex));
  let cpx = pickHalfResPixel(c, fullDims);
  let cD = textureLoad(depthTex, cpx, 0);
  if (cD >= 0.9999) {
    textureStore(outSSR, c, vec4f(0.0));
    return;
  }
  let cNR = textureLoad(normalRoughTex, cpx, 0);
  let cN = normalize(cNR.xyz);
  let cRough = cNR.w;
  let cLinD = linearDepthSSR(cD);

  // Physical GGX cone blur sigma in half-res pixels: tight crisp reflections on glossy fiberglass/steel (~0.14),
  // broad soft satin blur on glazed ceramic tiles (~0.26) so walls never look like sharp flat mirrors!
  let alpha = cRough * cRough;
  let focalHalfPx = f32(dims.y) * 0.74;
  let coneFrac = min(center.a, 35.0) / max(cLinD + min(center.a, 35.0), 0.25);
  let glossyScale = mix(0.42, 1.65, smoothstep(0.15, 0.24, cRough));
  let sigma = clamp(alpha * focalHalfPx * coneFrac * glossyScale, 0.35, 7.5);
  if (sigma < 0.50) {
    textureStore(outSSR, c, center);
    return;
  }

  let radius = min(7, i32(ceil(sigma * 2.0)));
  let inv2Sig2 = 0.5 / (sigma * sigma);
  let invDepthScale = 1.0 / max(cLinD * 0.06, 0.08);

  var colSum = center.rgb;
  var distSum = center.a;
  var wSum = 1.0;

  for (var k = -radius; k <= radius; k++) {
    if (k == 0) { continue; }
    let sc = clamp(c + axis * k, vec2i(0), maxC);
    let samp = textureLoad(ssrTex, sc, 0);
    if (samp.a <= 0.0001) { continue; }

    let spx = pickHalfResPixel(sc, fullDims);
    let sD = textureLoad(depthTex, spx, 0);
    if (sD >= 0.9999) { continue; }
    let sNR = textureLoad(normalRoughTex, spx, 0);
    let sN = normalize(sNR.xyz);
    let nDot = dot(cN, sN);
    if (nDot < 0.80) { continue; }
    let relD = abs(linearDepthSSR(sD) - cLinD) * invDepthScale;
    let wDepth = exp(-relD * relD * 2.2);
    let wNorm = pow(nDot, 14.0);
    let wRough = exp(-abs(sNR.w - cRough) * 10.0);
    let wSpatial = exp(-f32(k * k) * inv2Sig2);
    let w = wDepth * wNorm * wRough * wSpatial;

    colSum += samp.rgb * w;
    distSum += samp.a * w;
    wSum += w;
  }

  textureStore(outSSR, c, vec4f(colSum / wSum, distSum / wSum));
}

@compute @workgroup_size(8, 8)
fn filterSSRH(@builtin(global_invocation_id) gid: vec3u) {
  filterSSR1D(gid, vec2i(1, 0));
}

@compute @workgroup_size(8, 8)
fn filterSSRV(@builtin(global_invocation_id) gid: vec3u) {
  filterSSR1D(gid, vec2i(0, 1));
}

// Pass 2d: Full-Resolution Composite:
//   1) Edge-only 12-tap world-locked deterministic solar disk penumbra (ZERO Bayer/screen-space crawl!)
//   2) Sub-texel bilinear + depth/normal bilateral upsampling of filtered half-res BVH reflections.
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
  let uv = (vec2f(gid.xy) + 0.5) / vec2f(dims);

  // 1. Edge-Only Deterministic Soft Solar Penumbra
  // Interior sunlit/shadow pixels (~92-95%) take 0 extra rays and are 100% locked to world space.
  // Only pixels near a detected sun-shadow boundary evaluate a fixed 12-sample Vogel solar disk!
  if (max(sunD.r, max(sunD.g, sunD.b)) > 1e-4) {
    let cVis = sunD.a;
    var minV = cVis;
    var maxV = cVis;
    let depthTol = max(cLinD * 0.055, 0.09);

    // 16 fast L1-cached probes across +-11 px detect even wide skylight penumbras reliably.
    let probes = array<vec2i, 16>(
      vec2i(1, 0), vec2i(-1, 0), vec2i(0, 1), vec2i(0, -1),
      vec2i(3, 0), vec2i(-3, 0), vec2i(0, 3), vec2i(0, -3),
      vec2i(3, 3), vec2i(-3, 3), vec2i(3, -3), vec2i(-3, -3),
      vec2i(8, 0), vec2i(-8, 0), vec2i(0, 8), vec2i(0, -8),
    );
    for (var pi = 0u; pi < 16u; pi++) {
      let spx = clamp(px + probes[pi], vec2i(0), fullMax);
      let sD = textureLoad(depthTex, spx, 0);
      if (sD >= 0.9999) { continue; }
      if (abs(linearDepthSSR(sD) - cLinD) > depthTol) { continue; }
      let sv = textureLoad(sunDirectTex, spx, 0).a;
      minV = min(minV, sv);
      maxV = max(maxV, sv);
    }

    var smoothVis = cVis;
    if (minV < 0.5 && maxV > 0.5) {
      let wp = reconstructWorldPos(uv, cD);
      let sunDir = frame.sunDirRad.xyz;
      let angR = clamp(frame.sunDirRad.w, 0.004, 0.011);
      let basis = orthoBasis(sunDir);
      let origin = wp + cN * 0.012;
      var visSum = cVis;
      // Fixed deterministic 12-ray Vogel disk (zero screen-space pixelCoord dependency!).
      for (var si = 0u; si < 12u; si++) {
        let r = angR * sqrt((f32(si) + 0.5) / 12.0);
        let theta = f32(si) * 2.3999632;
        let d = normalize(basis * vec3f(r * cos(theta), r * sin(theta), 1.0));
        visSum += select(0.0, 1.0, !traceShadowRefl(origin, d, 160.0));
      }
      smoothVis = visSum / 13.0;
    }
    finalCol += sunD.rgb * smoothVis;
  }

  // 2. Sub-Texel Bilinear Bilateral Upsample of Filtered Half-Res BVH Glossy Reflections
  let flags = u32(frame.waterInfo.w + 0.5);
  let ssrDisabled = (flags & 2u) != 0u;
  if (!ssrDisabled && ar.a >= 0.08 && rough <= 0.56) {
    let ssrDims = vec2i(textureDimensions(ssrTex));
    let ssrMax = ssrDims - vec2i(1);
    let fCoord = uv * vec2f(ssrDims) - vec2f(0.5);
    let baseC = vec2i(floor(fCoord));
    let frac = clamp(fCoord - vec2f(baseC), vec2f(0.0), vec2f(1.0));
    let invDepthScale = 1.0 / max(cLinD * 0.055, 0.075);

    var colSum = vec3f(0.0);
    var wSum = 0.0;

    for (var oy = 0; oy <= 1; oy++) {
      let wy = select(1.0 - frac.y, frac.y, oy == 1);
      for (var ox = 0; ox <= 1; ox++) {
        let wx = select(1.0 - frac.x, frac.x, ox == 1);
        let sc = clamp(baseC + vec2i(ox, oy), vec2i(0), ssrMax);
        let samp = textureLoad(ssrTex, sc, 0);
        if (samp.a <= 0.0001) { continue; }

        let fpx = pickHalfResPixel(sc, vec2i(dims));
        let sD = textureLoad(depthTex, fpx, 0);
        if (sD >= 0.9999) { continue; }
        let sNR = textureLoad(normalRoughTex, fpx, 0);
        let sN = normalize(sNR.xyz);
        let relD = abs(linearDepthSSR(sD) - cLinD) * invDepthScale;

        let wNorm = pow(max(dot(cN, sN), 0.0), 10.0);
        let wDepth = exp(-relD * relD * 2.6);
        let wRough = exp(-abs(sNR.w - rough) * 8.0);
        let w = (wx * wy) * wNorm * wDepth * wRough;

        colSum += samp.rgb * w;
        wSum += w;
      }
    }

    // Safe fallback if all 4 bilinear corners were rejected on a grazing seam
    if (wSum <= 1e-4) {
      let nearC = clamp(vec2i(uv * vec2f(ssrDims)), vec2i(0), ssrMax);
      let samp = textureLoad(ssrTex, nearC, 0);
      if (samp.a > 0.0001) {
        colSum = samp.rgb;
        wSum = 1.0;
      }
    }

    let refl = select(vec3f(0.0), colSum / max(wSum, 1e-4), wSum > 1e-4);
    // Multiply by full-res ar.a (1 - inGrout) so reflections stop dead on every matte mortar seam!
    finalCol += refl * ar.rgb * ar.a;
  }

  // 3. Deterministic Zero-Noise World-Space Contact GTAO (6 fixed directions x 3 radial steps, 0.42 m radius)
  //    Grounds baseboards, wall-to-ceiling junctions, doorway jambs, fallen ceiling tiles & Pitfalls rims
  //    to match unbiased Ground-Truth Path Tracing with ZERO screen-space crawl or camera-pan shimmer!
  let wpCenter = reconstructWorldPos(uv, cD);
  let pxRadius = clamp((0.42 * f32(dims.y) * 0.74) / max(cLinD, 0.25), 3.0, 26.0);
  let aoDirs = array<vec2f, 6>(
    vec2f( 0.9659,  0.2588),
    vec2f( 0.2588,  0.9659),
    vec2f(-0.7071,  0.7071),
    vec2f(-0.9659, -0.2588),
    vec2f(-0.2588, -0.9659),
    vec2f( 0.7071, -0.7071),
  );
  let stepFracs = array<f32, 3>(0.30, 0.62, 1.00);
  var occSum = 0.0;
  for (var di = 0u; di < 6u; di++) {
    var dirOcc = 0.0;
    let dvec = aoDirs[di];
    for (var si = 0u; si < 3u; si++) {
      let spx = clamp(px + vec2i(round(dvec * (pxRadius * stepFracs[si]))), vec2i(0), fullMax);
      let sD = textureLoad(depthTex, spx, 0);
      if (sD >= 0.9999) { continue; }
      let suv = (vec2f(spx) + 0.5) / vec2f(dims);
      let swp = reconstructWorldPos(suv, sD);
      let delta = swp - wpCenter;
      let dist = length(delta);
      if (dist > 0.014 && dist < 0.48) {
        let h = dot(delta / dist, cN);
        if (h > 0.14) {
          let falloff = 1.0 - smoothstep(0.10, 0.48, dist);
          dirOcc = max(dirOcc, ((h - 0.14) / 0.86) * falloff);
        }
      }
    }
    occSum += dirOcc;
  }
  let rawContactAO = clamp(1.0 - (occSum / 6.0) * 0.78, 0.36, 1.0);
  // Protect HDR emissive panels & keep dry-interior contact shading subtle (overhead troffers illuminate floors
  // right up to baseboards, so strong GTAO creates unnatural black floor creases compared to unbiased GTPT).
  let cLuma = dot(finalCol, vec3f(0.2126, 0.7152, 0.0722));
  let emissiveKeep = smoothstep(2.2, 6.0, cLuma);
  let aoStrength = select(0.12, 0.24, frame.waterInfo.y > 0.5) * (1.0 - emissiveKeep);
  finalCol *= mix(1.0, rawContactAO, aoStrength);

  textureStore(outHdr, px, vec4f(finalCol, 1.0));
}
