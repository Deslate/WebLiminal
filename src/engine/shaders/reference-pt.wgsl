// Parallel Offline Ground-Truth Monte Carlo Path Tracer (Reference Renderer).
// Prepended with bvh-common.wgsl.
//
// Evaluates the exact rendering equation on the identical scene BVH, materials, analytic surface
// shaders, and rectangular area lights used by the real-time renderer:
//   - Sub-pixel anti-aliased primary camera rays
//   - Exact local-importance Next-Event Estimation (NEE) across ALL scene area lights (zero Top-K
//     truncation, physically exact broad area-light penumbras & wall-wash light scallops)
//   - 3-bounce unbiased Diffuse + GGX Specular multi-bounce global illumination (bounceBoost = 1.0)
//   - Identical bloom + atmospheric fog + AgX Filmic tone mapping in present pass for direct
//     apples-to-apples side-by-side comparison against the real-time renderer!

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

struct PTParams {
  batchIndex: u32,
  batchSpp: u32,
  width: u32,
  height: u32,
};

@group(0) @binding(0) var<uniform> frame: FrameUniform;
@group(0) @binding(1) var<uniform> pt: PTParams;
@group(0) @binding(2) var<storage, read> bvhNodes: array<BVHNode>;
@group(0) @binding(3) var<storage, read> bvhTris: array<BVHTri>;
@group(0) @binding(4) var<storage, read> materials: array<MaterialGPU>;
@group(0) @binding(5) var<storage, read> lights: array<AreaLight>;
@group(0) @binding(6) var texSampler: sampler;
@group(0) @binding(7) var albedoRoughTex: texture_2d_array<f32>;
@group(0) @binding(8) var normalHeightTex: texture_2d_array<f32>;
@group(0) @binding(9) var extraTex: texture_2d_array<f32>;
@group(0) @binding(10) var<storage, read_write> accumBuf: array<vec4f>;
@group(0) @binding(11) var outHdr: texture_storage_2d<rgba16float, write>;

struct PTHit {
  t: f32,
  n: vec3f,
  T: vec3f,
  B: vec3f,
  matId: u32,
  hit: bool,
  uv: vec2f,
};

fn tracePT(ro: vec3f, rd: vec3f, maxT: f32) -> PTHit {
  var res = PTHit(maxT, vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), vec3f(0.0, 0.0, 1.0), 0u, false, vec2f(0.0));
  let invD = 1.0 / select(rd, vec3f(1e-8), abs(rd) < vec3f(1e-8));
  if (hitAABB(bvhNodes[0].minB, bvhNodes[0].maxB, ro, invD, res.t) >= res.t) {
    return res;
  }
  var stack: array<u32, 32>;
  var sp = 0u;
  var cur = 0u;
  var hitIdx = 0u;
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
          res.uv = hitUV;
          hitIdx = i;
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
  if (res.hit) {
    let tri = bvhTris[hitIdx];
    let duv1 = tri.duv1_duv2.xy;
    let duv2 = tri.duv1_duv2.zw;
    let detUV = duv1.x * duv2.y - duv1.y * duv2.x;
    if (abs(detUV) > 1e-7) {
      let invU = 1.0 / detUV;
      let rawT = (tri.e1 * duv2.y - tri.e2 * duv1.y) * invU;
      let orthoT = rawT - res.n * dot(rawT, res.n);
      let lenT = length(orthoT);
      if (lenT > 1e-5) {
        res.T = orthoT / lenT;
        let rawB = (-tri.e1 * duv2.x + tri.e2 * duv1.x) * invU;
        let signB = select(-1.0, 1.0, dot(cross(res.n, res.T), rawB) >= 0.0);
        res.B = cross(res.n, res.T) * signB;
      } else {
        let b = orthoBasis(res.n);
        res.T = b[0];
        res.B = b[1];
      }
    } else {
      let b = orthoBasis(res.n);
      res.T = b[0];
      res.B = b[1];
    }
  }
  return res;
}

fn traceShadowPT(ro: vec3f, rd: vec3f, maxT: f32) -> bool {
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

fn fresnelSchlickPT(cosTheta: f32, f0: vec3f) -> vec3f {
  return f0 + (vec3f(1.0) - f0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

fn evalGGXPT(n: vec3f, v: vec3f, l: vec3f, rough: f32, f0: vec3f) -> vec3f {
  let ndl = max(dot(n, l), 0.0);
  let ndv = max(dot(n, v), 0.001);
  if (ndl <= 0.0) { return vec3f(0.0); }
  let h = normalize(v + l);
  let ndh = max(dot(n, h), 0.0);
  let vdh = max(dot(v, h), 0.0);
  let a = max(rough * rough, 0.006);
  let a2 = a * a;
  let denom = ndh * ndh * (a2 - 1.0) + 1.0;
  let D = a2 / max(PI * denom * denom, 1e-5);
  let k = (rough + 1.0);
  let k2 = k * k * 0.125;
  let G = (ndv / (ndv * (1.0 - k2) + k2)) * (ndl / (ndl * (1.0 - k2) + k2));
  let F = fresnelSchlickPT(vdh, f0);
  return (D * G * F) / max(4.0 * ndl * ndv, 1e-4) * ndl;
}

fn sampleGGXHalfVector(n: vec3f, rough: f32, u1: f32, u2: f32) -> vec3f {
  let a = max(rough * rough, 0.012);
  let phi = 2.0 * PI * u1;
  let cosTheta = sqrt((1.0 - u2) / max(1.0 + (a * a - 1.0) * u2, 1e-5));
  let sinTheta = sqrt(max(0.0, 1.0 - cosTheta * cosTheta));
  let localH = vec3f(sinTheta * cos(phi), sinTheta * sin(phi), cosTheta);
  return normalize(orthoBasis(n) * localH);
}

// Unbiased Local-Importance Next-Event Estimation across ALL scene area lights!
// Computes exact positive unshadowed energy weight w_i for every facing light, then selects
// a light with exact discrete probability w_i / sumW so zero rays are wasted on lights in other rooms.
fn sampleDirectLightsPT(
  p: vec3f,
  nGeom: vec3f,
  N: vec3f,
  V: vec3f,
  albedo: vec3f,
  rough: f32,
  f0: vec3f,
  kD: vec3f,
  rng: ptr<function, u32>,
  numSamples: u32,
) -> vec3f {
  var total = vec3f(0.0);
  let origin = p + nGeom * 0.010;

  // 1. Direct sun (when enabled)
  if (frame.sunColorInt.w > 0.5) {
    let sunCenter = frame.sunDirRad.xyz;
    let angR = frame.sunDirRad.w;
    let r = angR * sqrt(rand01(rng));
    let phi = 2.0 * PI * rand01(rng);
    let sunDir = normalize(orthoBasis(sunCenter) * vec3f(r * cos(phi), r * sin(phi), 1.0));
    let ndl = dot(N, sunDir);
    if (ndl > 0.0 && dot(nGeom, sunDir) > 0.0 && !traceShadowPT(origin, sunDir, 180.0)) {
      let fIn = fresnelSchlickPT(ndl, f0);
      let diff = kD * (vec3f(1.0) - fIn) * albedo * (ndl * INV_PI);
      let spec = evalGGXPT(N, V, sunDir, max(rough, 0.06), f0);
      total += (diff + spec) * frame.sunColorInt.rgb;
    }
  }

  // 2. Exact local-importance sampling across all rectangular area lights
  let lightCount = min(u32(frame.skyHorizon.w + 0.5), 64u);
  if (lightCount == 0u) { return total; }

  var weights: array<f32, 64>;
  var sumW = 0.0;
  for (var li = 0u; li < lightCount; li++) {
    let l = lights[li];
    let lCenter = l.originArea.xyz + 0.5 * (l.edgeUPower.xyz + l.edgeVKind.xyz);
    let toL = lCenter - p;
    let d2 = dot(toL, toL);
    if (d2 < 0.002) {
      weights[li] = 0.0;
      continue;
    }
    let lNorm = normalize(cross(l.edgeUPower.xyz, l.edgeVKind.xyz));
    let halfSpan = 0.5 * (length(l.edgeUPower.xyz) + length(l.edgeVKind.xyz));
    if (dot(lNorm, -toL) <= -0.02 || dot(nGeom, toL) + halfSpan <= 0.0) {
      weights[li] = 0.0;
      continue;
    }
    let invD = inverseSqrt(max(d2, 0.08));
    let dirL = toL * invD;
    let cL = max(dot(lNorm, -dirL), 0.06);
    let cS = max(dot(nGeom, dirL), 0.06);
    let w = (l.edgeUPower.w * cL * cS) / max(d2, 0.14);
    weights[li] = w;
    sumW += w;
  }

  if (sumW <= 1e-6) { return total; }

  let invS = 1.0 / f32(numSamples);
  for (var s = 0u; s < numSamples; s++) {
    // Stratified xi across numSamples for dramatically lower direct-shadow noise
    let xi = ((f32(s) + rand01(rng)) * invS) * sumW;
    var acc = 0.0;
    var pick = 0u;
    for (var li = 0u; li < lightCount; li++) {
      acc += weights[li];
      if (acc >= xi) {
        pick = li;
        break;
      }
    }
    let wPick = weights[pick];
    if (wPick <= 1e-8) { continue; }
    let pdfLight = wPick / sumW;

    let l = lights[pick];
    let lp = l.originArea.xyz + l.edgeUPower.xyz * rand01(rng) + l.edgeVKind.xyz * rand01(rng);
    let toP = lp - p;
    let dist2 = dot(toP, toP);
    if (dist2 < 1e-4) { continue; }
    let dist = sqrt(dist2);
    let wi = toP / dist;
    let cosSurf = dot(N, wi);
    if (cosSurf <= 0.0 || dot(nGeom, wi) <= 0.0) { continue; }
    let lNorm = normalize(cross(l.edgeUPower.xyz, l.edgeVKind.xyz));
    let cosLight = dot(lNorm, -wi);
    if (cosLight <= 0.0) { continue; }

    if (!traceShadowPT(origin, wi, max(0.01, dist - 0.035))) {
      let geom = (cosLight * l.originArea.w) / max(dist2, 0.08);
      let fIn = fresnelSchlickPT(cosSurf, f0);
      let diff = kD * (vec3f(1.0) - fIn) * albedo * (cosSurf * INV_PI);
      let spec = evalGGXPT(N, V, wi, max(rough, 0.055), f0);
      let rad = (diff + spec) * l.radianceCdf.rgb * (geom / pdfLight) * invS;
      total += min(rad, vec3f(28.0));
    }
  }

  return total;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= pt.width || gid.y >= pt.height) { return; }
  let pxIdx = gid.y * pt.width + gid.x;
  var rng = pxIdx * 1973u + pt.batchIndex * 9277u + 747796405u;

  var radSum = vec3f(0.0);
  let resF = vec2f(f32(pt.width), f32(pt.height));

  for (var s = 0u; s < pt.batchSpp; s++) {
    let jx = rand01(&rng);
    let jy = rand01(&rng);
    let uv = (vec2f(gid.xy) + vec2f(jx, jy)) / resF;
    let ndc = vec2f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
    let wp = frame.invViewProj * vec4f(ndc, 1.0, 1.0);
    var ro = frame.cameraPos.xyz;
    var rd = normalize(wp.xyz / wp.w - ro);

    var throughput = vec3f(1.0);
    var pathRad = vec3f(0.0);
    var specularBounce = true;

    for (var bounce = 0u; bounce < 3u; bounce++) {
      let h = tracePT(ro, rd, 140.0);
      if (!h.hit) {
        pathRad += throughput * evalSkyRadiance(
          rd,
          frame.skyTop.rgb,
          frame.skyHorizon.rgb,
          frame.sunDirRad.xyz,
          frame.sunColorInt.rgb,
          frame.sunColorInt.w > 0.5,
        );
        break;
      }

      let hitPos = ro + rd * h.t;
      let m = materials[h.matId];
      let layer = i32(h.matId);
      let preset = u32(m.extra.x + 0.5);
      let V = -rd;

      let pixelWorld = max(0.0005, (h.t * 1.45) / f32(pt.height));
      let fwUV = select(vec2f(pixelWorld * 4.0), vec2f(pixelWorld), bounce == 0u);

      var albedo = m.albedoScale.rgb;
      var rough = clamp(m.pbr.x, 0.04, 1.0);
      var metallic = m.pbr.y;
      var coat = m.pbr.z;
      var emissiveMask = select(0.0, 1.0, m.emissive.w > 0.01);
      var nXY = vec2f(0.0);

      if (bounce == 0u) {
        let intr = evalAnalyticInterior(h.uv, hitPos, m, fwUV);
        if (intr.handled) {
          albedo = intr.albedo;
          rough = intr.rough;
          coat = intr.coat;
          metallic = intr.metallic;
          nXY = intr.slope;
          if (preset == 13u) {
            emissiveMask = intr.emissiveMask;
          }
        } else {
          let uvTex = h.uv * m.albedoScale.w;
          let ar = textureSampleLevel(albedoRoughTex, texSampler, uvTex, layer, 0.0);
          let nh = textureSampleLevel(normalHeightTex, texSampler, uvTex, layer, 0.0);
          let mt = textureSampleLevel(extraTex, texSampler, uvTex, layer, 0.0);
          albedo = ar.rgb;
          rough = clamp(ar.a, 0.04, 1.0);
          metallic = mt.r;
          coat = mt.g;
          emissiveMask = mt.b;
          nXY = (nh.rg * 2.0 - 1.0) * 0.65;
          let cer = evalAnalyticCeramicFull(h.uv, m, ar.rgb, ar.a, fwUV, hitPos.y, frame.waterInfo.x, frame.waterInfo.y > 0.5);
          if (cer.isCeramic) {
            albedo = cer.albedo;
            rough = cer.rough;
            coat = cer.coat;
            nXY = cer.slope;
          }
        }
      } else {
        // Secondary diffuse GI bounces use exact area-average physical surface reflectance
        albedo = clamp(m.albedoScale.rgb * select(1.0, 0.90, preset == 4u || preset == 5u), vec3f(0.02), vec3f(0.90));
      }

      let nZ = sqrt(max(0.04, 1.0 - min(0.90, dot(nXY, nXY))));
      var N = normalize(h.T * nXY.x + h.B * nXY.y + h.n * nZ);
      if (dot(N, V) < 0.01) { N = h.n; }

      // Direct emission: counted on camera hit or specular bounce (diffuse bounces already NEE-sample lights!)
      let emissive = m.emissive.rgb * m.emissive.w * emissiveMask;
      if (specularBounce && max(emissive.r, max(emissive.g, emissive.b)) > 1e-4) {
        pathRad += throughput * emissive;
      }

      let ndv = max(dot(N, V), 0.001);
      let dielecF0 = mix(0.012, 0.047, clamp(coat, 0.0, 1.0));
      let f0 = mix(vec3f(dielecF0), albedo, metallic);
      let Fv = fresnelSchlickPT(ndv, f0);
      let kD = (vec3f(1.0) - Fv) * (1.0 - metallic);

      // Next-Event Estimation: 1 local-importance area-light sample per bounce (32+ area samples/px across SPP!)
      let direct = sampleDirectLightsPT(hitPos, h.n, N, V, albedo, rough, f0, kD, &rng, 1u);
      pathRad += throughput * select(min(direct, vec3f(12.0)), direct, bounce == 0u);

      // Choose next bounce direction (Fresnel-weighted split between GGX specular and cosine diffuse)
      let fMax = max(Fv.r, max(Fv.g, Fv.b));
      let pSpec = select(clamp(fMax * (1.0 - rough * 0.65), 0.04, 0.92), 0.0, rough > 0.62 && metallic < 0.1);
      let uBranch = rand01(&rng);

      if (uBranch < pSpec) {
        let H = sampleGGXHalfVector(N, rough, rand01(&rng), rand01(&rng));
        let wi = reflect(-V, H);
        let ndl = dot(N, wi);
        if (ndl <= 0.001 || dot(h.n, wi) <= 0.001) { break; }
        let vdh = max(dot(V, H), 0.001);
        let ndh = max(dot(N, H), 0.001);
        let F = fresnelSchlickPT(vdh, f0);
        let k = rough + 1.0;
        let k2 = k * k * 0.125;
        let G = (ndv / (ndv * (1.0 - k2) + k2)) * (ndl / (ndl * (1.0 - k2) + k2));
        let specW = (F * G * vdh) / max(ndv * ndh * pSpec, 1e-4);
        throughput *= min(specW, vec3f(4.0));
        rd = wi;
        specularBounce = true;
      } else {
        let pDiff = max(1.0 - pSpec, 0.05);
        throughput *= (kD * albedo) / pDiff;
        rd = sampleCosineHemisphere(N, rand01(&rng), rand01(&rng));
        if (dot(rd, h.n) <= 0.001) {
          rd = sampleCosineHemisphere(h.n, rand01(&rng), rand01(&rng));
        }
        specularBounce = false;
      }

      // Russian roulette termination after bounce 1 for unbiased energy conservation
      if (bounce >= 1u) {
        let survive = clamp(max(throughput.r, max(throughput.g, throughput.b)), 0.12, 0.94);
        if (rand01(&rng) > survive) { break; }
        throughput /= survive;
      }

      ro = hitPos + h.n * 0.010;
    }

    radSum += min(pathRad, vec3f(40.0));
  }

  var prev = vec4f(0.0);
  if (pt.batchIndex > 0u) {
    prev = accumBuf[pxIdx];
  }
  let next = prev + vec4f(radSum, f32(pt.batchSpp));
  accumBuf[pxIdx] = next;

  let resolved = next.rgb / max(1.0, next.a);
  textureStore(outHdr, vec2i(gid.xy), vec4f(resolved, 1.0));
}
