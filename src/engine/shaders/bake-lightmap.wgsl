// Progressive GPU BVH Path-Traced Directional Lightmap Baker.
// Evaluates direct NEE (sun + arbitrary area lights + skylights), multi-bounce
// indirect GI with material color bleeding, dominant incoming light direction
// (for normal-map shading at runtime), and short-range baked Ambient Occlusion.

@group(0) @binding(0) var<uniform> env: EnvUniform;
@group(0) @binding(1) var<storage, read> bvhNodes: array<BVHNode>;
@group(0) @binding(2) var<storage, read> bvhTris: array<BVHTri>;
@group(0) @binding(3) var<storage, read> materials: array<MaterialGPU>;
@group(0) @binding(4) var<storage, read> lights: array<AreaLight>;
@group(0) @binding(5) var<storage, read> lmPos: array<vec4f>;
@group(0) @binding(6) var<storage, read> lmNorm: array<vec4f>;
@group(0) @binding(7) var<storage, read_write> accumIrrad: array<vec4f>;
@group(0) @binding(8) var<storage, read_write> accumDir: array<vec4f>;

fn traceClosest(ro: vec3f, rd: vec3f, maxT: f32) -> RayHit {
  var res = RayHit(maxT, vec3f(0.0, 1.0, 0.0), 0u, false);
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
        if (t > 1e-4 && t < res.t) {
          res.t = t;
          res.n = select(tri.gn, -tri.gn, det < 0.0);
          res.matId = tri.matId;
          res.hit = true;
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
      let nearD = min(dL, dR);
      let farD = max(dL, dR);
      if (nearD >= res.t) {
        if (sp == 0u) { break; }
        sp -= 1u;
        cur = stack[sp];
      } else {
        if (farD < res.t && sp < 31u) {
          stack[sp] = farIdx;
          sp += 1u;
        }
        cur = nearIdx;
      }
    }
  }
  return res;
}

fn traceShadow(ro: vec3f, rd: vec3f, maxT: f32) -> bool {
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
        if (t > 1e-4 && t < maxT) {
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
      let nearD = min(dL, dR);
      let farD = max(dL, dR);
      if (nearD >= maxT) {
        if (sp == 0u) { break; }
        sp -= 1u;
        cur = stack[sp];
      } else {
        if (farD < maxT && sp < 31u) {
          stack[sp] = farIdx;
          sp += 1u;
        }
        cur = nearIdx;
      }
    }
  }
  return false;
}

fn evalAreaLight(p: vec3f, n: vec3f, l: AreaLight, u1: f32, u2: f32, outDir: ptr<function, vec3f>) -> vec3f {
  let lp = l.originArea.xyz + l.edgeUPower.xyz * u1 + l.edgeVKind.xyz * u2;
  let toL = lp - p;
  let dist2 = dot(toL, toL);
  if (dist2 < 1e-4) { return vec3f(0.0); }
  let dist = sqrt(dist2);
  let wi = toL / dist;
  let cosSurf = dot(n, wi);
  if (cosSurf <= 0.0) { return vec3f(0.0); }
  let lightN = normalize(cross(l.edgeUPower.xyz, l.edgeVKind.xyz));
  let cosLight = dot(lightN, -wi);
  if (cosLight <= 0.0) { return vec3f(0.0); }
  if (traceShadow(p, wi, max(0.01, dist - 0.03))) { return vec3f(0.0); }
  *outDir = wi;
  // Soft distance regularization prevents firefly spikes at light fixture rims.
  let g = (cosSurf * cosLight * l.originArea.w) / max(dist2, 0.08);
  return l.radianceCdf.rgb * g;
}

fn sampleDirectLighting(p: vec3f, n: vec3f, rng: ptr<function, u32>, dirSum: ptr<function, vec3f>, isBounce: bool) -> vec3f {
  var total = vec3f(0.0);

  // 1. Directional Sun (finite disc soft shadow)
  if (env.sunColorInt.w > 0.5) {
    let sunCenter = env.sunDirRad.xyz;
    let angR = env.sunDirRad.w;
    let r = angR * sqrt(rand01(rng));
    let phi = 2.0 * PI * rand01(rng);
    let sunDir = normalize(orthoBasis(sunCenter) * vec3f(r * cos(phi), r * sin(phi), 1.0));
    let ndl = dot(n, sunDir);
    if (ndl > 0.0 && !traceShadow(p, sunDir, 200.0)) {
      let c = env.sunColorInt.rgb * ndl;
      total += c;
      *dirSum += sunDir * (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b);
    }
  }

  // 2. Area Lights & Skylight Portals.
  // Primary direct pass evaluates all lights (up to 16) for zero selection blotches;
  // indirect bounces use 2-sample power-weighted CDF importance sampling for speed.
  let lightCount = u32(env.skyHorizon.w + 0.5);
  if (lightCount > 0u) {
    if (!isBounce && lightCount <= 16u) {
      for (var li = 0u; li < lightCount; li++) {
        var wi = vec3f(0.0);
        let contrib = evalAreaLight(p, n, lights[li], rand01(rng), rand01(rng), &wi);
        let clamped = min(contrib, vec3f(26.0));
        total += clamped;
        *dirSum += wi * (0.2126 * clamped.r + 0.7152 * clamped.g + 0.0722 * clamped.b);
      }
    } else {
      let pickSamples = min(lightCount, 2u);
      for (var s = 0u; s < pickSamples; s++) {
        var li = 0u;
        var pdf = 1.0;
        if (lightCount <= 2u) {
          li = s;
        } else {
          let xi = rand01(rng);
          for (var k = 0u; k < lightCount; k++) {
            if (xi <= lights[k].radianceCdf.w || k == lightCount - 1u) {
              li = k;
              break;
            }
          }
          pdf = max(0.0001, lights[li].edgeUPower.w / max(env.extra.x, 0.001));
        }
        var wi = vec3f(0.0);
        let scale = f32(select(pickSamples, 1u, lightCount <= 2u));
        let contrib = evalAreaLight(p, n, lights[li], rand01(rng), rand01(rng), &wi) / (pdf * scale);
        // Stronger clamp on indirect bounce samples prevents single-ray firefly spots.
        let clamped = min(contrib, select(vec3f(22.0), vec3f(7.5), isBounce));
        total += clamped;
        *dirSum += wi * (0.2126 * clamped.r + 0.7152 * clamped.g + 0.0722 * clamped.b);
      }
    }
  }

  return total;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let size = env.counts.x;
  if (gid.x >= size || gid.y >= size) { return; }
  let idx = gid.y * size + gid.x;
  let posData = lmPos[idx];
  if (posData.w < 0.25) { return; }

  let normData = lmNorm[idx];
  let n0 = normalize(normData.xyz);
  let p0 = posData.xyz + n0 * 0.008;

  let batch = env.counts.y;
  let spp = env.counts.z;
  var rng = idx * 1973u + batch * 9277u + 26699u;

  var irradSum = vec3f(0.0);
  var dirSum = vec3f(0.0);
  var aoSum = 0.0;

  for (var s = 0u; s < spp; s++) {
    // 1. Direct lighting at texel (stored as E / PI so runtime diffuse = albedo * lmIrrad)
    var directDir = vec3f(0.0);
    irradSum += sampleDirectLighting(p0, n0, &rng, &directDir, false) * INV_PI;
    dirSum += directDir * INV_PI;

    // 2. Short-range Ambient Occlusion ray (for crisp architectural corner crevices)
    let aoDir = sampleCosineHemisphere(n0, rand01(&rng), rand01(&rng));
    let aoHit = traceShadow(p0, aoDir, env.extra.z);
    aoSum += select(1.0, 0.0, aoHit);

    // 3. Multi-bounce indirect GI path (3 bounces with cosine hemisphere sampling)
    var ro = p0;
    var rd = sampleCosineHemisphere(n0, rand01(&rng), rand01(&rng));
    let firstBounceDir = rd;
    var throughput = vec3f(1.0);
    var pathRad = vec3f(0.0);

    for (var bounce = 0u; bounce < 3u; bounce++) {
      let h = traceClosest(ro, rd, 120.0);
      if (!h.hit) {
        if (env.extra.w < 0.5) {
          pathRad += throughput * evalSky(rd, env);
        }
        break;
      }

      let mat = materials[h.matId];
      // Do NOT add mat.emissive here: all emissive panels/signs are already sampled
      // cleanly via NEE in sampleDirectLighting, so adding them here double-counts
      // and injects single-ray firefly spots into indirect GI!
      let hitPos = ro + rd * h.t + h.n * 0.008;
      let diffuseAlbedo = clamp(mat.albedoScale.rgb * (1.0 - mat.pbr.y * 0.85), vec3f(0.02), vec3f(0.86));
      throughput *= diffuseAlbedo;

      var unusedDir = vec3f(0.0);
      let bounceDirect = sampleDirectLighting(hitPos, h.n, &rng, &unusedDir, true);
      pathRad += throughput * bounceDirect * INV_PI * env.extra.y;

      ro = hitPos;
      rd = sampleCosineHemisphere(h.n, rand01(&rng), rand01(&rng));
    }

    // Soft firefly bound on indirect bounce contribution keeps GI smooth without losing color bleed.
    let clampedPath = min(pathRad, vec3f(4.5));
    irradSum += clampedPath;
    dirSum += firstBounceDir * (0.2126 * clampedPath.r + 0.7152 * clampedPath.g + 0.0722 * clampedPath.b);
  }

  if (batch == 0u) {
    accumIrrad[idx] = vec4f(irradSum, f32(spp));
    accumDir[idx] = vec4f(dirSum, aoSum);
  } else {
    accumIrrad[idx] += vec4f(irradSum, f32(spp));
    accumDir[idx] += vec4f(dirSum, aoSum);
  }
}
