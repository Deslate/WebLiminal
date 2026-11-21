// Photographic Physical Water Surface Shader:
// Prepended with bvh-common.wgsl.
//   - Smooth Catmull-Rom bicubic surface normal directly from live simulated wave field
//     (zero synthetic cosine capillary grids!)
//   - True BVH-traced Snell refraction intersecting actual submerged tiles, steps & pillars
//     with exact analytic ceramic tile rendering (crisp refracted underwater tile lines!)
//   - Live GPU photon-traced water caustics sampled at the exact submerged world position
//   - Exact unpolarized dielectric Fresnel (IOR = 1.333) + RGB Beer-Lambert absorption
//   - Full-scene BVH mirror reflections (zero SSR holes, reflecting off-screen skylights,
//     glowing pill windows, misty corridors, arches & spiral columns!)

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

struct WaterRenderUniform {
  domain: vec4f,      // x = minX, y = minZ, z = invSizeX, w = invSizeZ
  grid: vec4u,        // x = nx, y = nz, z = 0, w = 0
  optics: vec4f,      // rgb = Beer-Lambert absorption coeffs, w = causticStrength
  surface: vec4f,     // x = waterLevel, y = dx, z = sizeX, w = sizeZ
};

@group(0) @binding(0) var<uniform> frame: FrameUniform;
@group(0) @binding(1) var<uniform> water: WaterRenderUniform;
@group(0) @binding(2) var<storage, read> waveState: array<vec2f>;
@group(0) @binding(3) var sceneDepthTex: texture_depth_2d;
@group(0) @binding(4) var linSampler: sampler;
@group(0) @binding(5) var<storage, read> bvhNodes: array<BVHNode>;
@group(0) @binding(6) var<storage, read> bvhTris: array<BVHTri>;
@group(0) @binding(7) var<storage, read> materials: array<MaterialGPU>;
@group(0) @binding(8) var lmIrradTex: texture_2d<f32>;
@group(0) @binding(9) var causticTex: texture_2d<f32>;

struct VSOut {
  @builtin(position) clipPos: vec4f,
  @location(0) worldPos: vec3f,
};

@vertex
fn vsWater(@location(0) xz: vec2f) -> VSOut {
  let wx = water.domain.x + xz.x * water.surface.z;
  let wz = water.domain.y + xz.y * water.surface.w;
  let wp = vec3f(wx, water.surface.x, wz);
  var o: VSOut;
  o.worldPos = wp;
  o.clipPos = frame.viewProj * vec4f(wp, 1.0);
  return o;
}

fn catmullRomW(t: f32) -> vec4f {
  let t2 = t * t;
  let t3 = t2 * t;
  return vec4f(
    -0.5 * t3 + t2 - 0.5 * t,
    1.5 * t3 - 2.5 * t2 + 1.0,
    -1.5 * t3 + 2.0 * t2 + 0.5 * t,
    0.5 * t3 - 0.5 * t2,
  );
}

fn catmullRomDW(t: f32) -> vec4f {
  let t2 = t * t;
  return vec4f(
    -1.5 * t2 + 2.0 * t - 0.5,
    4.5 * t2 - 5.0 * t,
    -4.5 * t2 + 4.0 * t + 0.5,
    1.5 * t2 - t,
  );
}

fn waveCellH(ix: i32, iz: i32, nx: i32, nz: i32) -> f32 {
  let cx = clamp(ix, 0, nx - 1);
  let cz = clamp(iz, 0, nz - 1);
  return waveState[u32(cz * nx + cx)].x;
}

// Smooth Catmull-Rom bicubic surface normal directly from the simulated heightfield!
fn waterBicubicNormal(wx: f32, wz: f32) -> vec3f {
  let nx = i32(water.grid.x);
  let nz = i32(water.grid.y);
  let u = clamp((wx - water.domain.x) * water.domain.z, 0.0, 0.9999);
  let v = clamp((wz - water.domain.y) * water.domain.w, 0.0, 0.9999);
  let fx = u * f32(nx - 1);
  let fz = v * f32(nz - 1);
  let ix = i32(floor(fx));
  let iz = i32(floor(fz));
  let tx = fx - f32(ix);
  let tz = fz - f32(iz);

  let wxW = catmullRomW(tx);
  let wxD = catmullRomDW(tx);
  let wzW = catmullRomW(tz);
  let wzD = catmullRomDW(tz);

  var dhdu = 0.0;
  var dhdv = 0.0;
  for (var j = -1; j <= 2; j++) {
    let rW = wzW[j + 1];
    let rD = wzD[j + 1];
    var rowVal = 0.0;
    var rowDerivX = 0.0;
    for (var i = -1; i <= 2; i++) {
      let h = waveCellH(ix + i, iz + j, nx, nz);
      rowVal += h * wxW[i + 1];
      rowDerivX += h * wxD[i + 1];
    }
    dhdu += rowDerivX * rW;
    dhdv += rowVal * rD;
  }

  let cellX = water.surface.z / f32(nx - 1);
  let cellZ = water.surface.w / f32(nz - 1);
  let dhdx = dhdu / max(cellX, 1e-4);
  let dhdz = dhdv / max(cellZ, 1e-4);
  let bgSlope = evalDispersiveWaveSlope(vec2f(wx, wz), frame.cameraPos.w, max(water.surface.x, 0.35), water.surface.y);
  return normalize(vec3f(-(dhdx + bgSlope.x), 1.0, -(dhdz + bgSlope.y)));
}

fn traceClosestWater(ro: vec3f, rd: vec3f, maxT: f32) -> RayHit {
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

fn traceShadowWater(ro: vec3f, rd: vec3f, maxT: f32) -> bool {
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

fn shadeSurfaceHit(hit: RayHit, hitPos: vec3f, rayDir: vec3f, rayDist: f32, isSubmerged: bool) -> vec3f {
  let m = materials[hit.matId];
  let lmI = textureSampleLevel(lmIrradTex, linSampler, hit.lmUV, 0.0).rgb + vec3f(frame.fogParams.w);

  var albedo = m.albedoScale.rgb;
  let grazing = max(abs(dot(hit.n, rayDir)), 0.16);
  let baseFw = (0.0028 + rayDist * 0.0014);
  let fw = vec2f(baseFw, baseFw / grazing);
  let cer = evalAnalyticCeramic(hit.uv, m, albedo, m.pbr.x, fw);
  if (cer.isCeramic) {
    albedo = cer.albedo;
  }

  // Waterline darkening right near water surface on reflected walls/columns
  if (!isSubmerged) {
    let hAbove = hitPos.y - water.surface.x;
    let waterline = exp(-abs(hAbove - 0.025) / 0.075);
    albedo *= 1.0 - waterline * 0.14;
  }

  let kD = 1.0 - m.pbr.y * 0.85;
  var col = albedo * kD * lmI;

  // Direct sunlight (with LIVE GPU photon-refracted caustics on submerged surfaces!)
  if (frame.sunColorInt.w > 0.5) {
    let sunDir = frame.sunDirRad.xyz;
    let ndl = dot(hit.n, sunDir);
    if (ndl > 0.0) {
      let shadowPos = hitPos + hit.n * 0.015;
      if (!traceShadowWater(shadowPos, sunDir, 150.0)) {
        var sunTerm = frame.sunColorInt.rgb * ndl * INV_PI;
        if (isSubmerged) {
          // Attenuate incoming sun beam through water depth + focus via real live photon caustics!
          let subDepth = max(0.0, water.surface.x - hitPos.y);
          let inTransmit = exp(-water.optics.rgb * (subDepth / max(sunDir.y, 0.25)));
          let cUV = clamp((hitPos.xz - water.domain.xy) * water.domain.zw, vec2f(0.001), vec2f(0.999));
          let causticRaw = textureSampleLevel(causticTex, linSampler, cUV, 0.0).rgb;
          // Blend photon-focused caustics smoothly with flat transmittance (strength controlled by optics.w)
          let causticMul = mix(vec3f(1.0), causticRaw, clamp(water.optics.w, 0.0, 1.35));
          sunTerm *= inTransmit * causticMul;
        }
        col += albedo * kD * sunTerm;
      }
    }
  }

  // Full HDR emissive (glowing frosted pill windows, portholes, fluorescent lights, skylights)
  col += m.emissive.rgb * m.emissive.w;

  if (!isSubmerged) {
    // Atmospheric haze along reflected air path
    let fogF = 1.0 - exp(-hit.t * frame.fogColorDens.w * 0.9);
    col = mix(col, frame.fogColorDens.rgb, clamp(fogF, 0.0, 0.82));
  }

  return col;
}

@fragment
fn fsWater(i: VSOut) -> @location(0) vec4f {
  let fullDims = vec2i(textureDimensions(sceneDepthTex));
  let px = clamp(vec2i(i.clipPos.xy), vec2i(0), fullDims - vec2i(1));

  let sceneDepth = textureLoad(sceneDepthTex, px, 0);
  // Discard where opaque dry geometry (pillars, decks, walls) is closer than water surface.
  if (i.clipPos.z >= sceneDepth) { discard; }

  let wp = i.worldPos;
  let N = waterBicubicNormal(wp.x, wp.z);
  let toCam = frame.cameraPos.xyz - wp;
  let camDist = length(toCam);
  let V = toCam / max(camDist, 1e-4);

  // 1. Exact unpolarized dielectric Fresnel (air -> water, IOR = 1.333)
  let ndv = max(dot(N, V), 0.002);
  let fresnel = exactDielectricFresnel(ndv, 1.333);

  // 2. TRUE Snell-Refracted BVH Transmission Ray!
  // Intersects actual submerged floor tiles, steps & columns with exact geometric refraction!
  var T = refract(-V, N, 1.0 / 1.333);
  if (dot(T, T) < 1e-4) { T = -V; }
  T = normalize(T);

  let refrOrigin = wp + vec3f(0.0, -0.004, 0.0);
  let subHit = traceClosestWater(refrOrigin, T, 24.0);
  var underwater = vec3f(0.0);
  var subLen = 0.0;
  if (subHit.hit) {
    subLen = subHit.t;
    let subPos = refrOrigin + T * subHit.t;
    let subCol = shadeSurfaceHit(subHit, subPos, T, camDist + subHit.t, true);
    // Exact Beer-Lambert physical RGB water absorption
    let transmit = exp(-water.optics.rgb * subLen);
    // Subtle light-proportional volume scattering inside sunlit water (zero glow in dark pools!)
    let subLuma = dot(subCol, vec3f(0.2126, 0.7152, 0.0722));
    let inScatter = vec3f(0.010, 0.048, 0.045) * (1.0 - transmit) * min(subLuma * 0.85, 1.1);
    underwater = subCol * transmit + inScatter;
  }

  // 3. TRUE Full-Scene BVH Mirror Reflection Ray!
  var R = reflect(-V, N);
  if (R.y < 0.005) {
    // Clamp ultra-grazing downward reflections smoothly onto horizontal plane
    R = normalize(vec3f(R.x, 0.008, R.z));
  }
  let reflOrigin = wp + vec3f(0.0, 0.008, 0.0);
  let reflHit = traceClosestWater(reflOrigin, R, 90.0);
  var reflCol: vec3f;
  if (reflHit.hit) {
    let reflPos = reflOrigin + R * reflHit.t;
    reflCol = shadeSurfaceHit(reflHit, reflPos, R, camDist + reflHit.t, false);
  } else {
    reflCol = evalSkyRadiance(R, frame.skyTop.rgb, frame.skyHorizon.rgb, frame.sunDirRad.xyz, frame.sunColorInt.rgb, frame.sunColorInt.w > 0.5);
  }

  // Crisp physical solar specular glint when this water point has line-of-sight to the sun.
  if (frame.sunColorInt.w > 0.5) {
    let sunDir = frame.sunDirRad.xyz;
    let H = normalize(V + sunDir);
    let ndh = max(dot(N, H), 0.0);
    if (ndh > 0.92 && !traceShadowWater(reflOrigin, sunDir, 150.0)) {
      let glint = pow(ndh, 900.0) * 3.5 + pow(ndh, 120.0) * 0.08;
      reflCol += frame.sunColorInt.rgb * glint;
    }
  }

  let finalCol = underwater * (1.0 - fresnel) + reflCol * fresnel;
  return vec4f(finalCol, 1.0);
}
