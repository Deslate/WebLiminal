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
  mapDomain: vec4f,   // x = mapMinX, y = mapMinZ, z = mapSizeX, w = mapSizeZ
  simDomain: vec4f,   // x = winMinX, y = winMinZ, z = invWinSizeX, w = invWinSizeZ
  grid: vec4u,        // x = nx, y = nz, z = 0, w = 0
  optics: vec4f,      // rgb = Beer-Lambert absorption coeffs, w = causticStrength
  surface: vec4f,     // x = waterLevel, y = dx, z = winSizeX, w = winSizeZ
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

const WATER_ENV_MARGIN: f32 = 0.085;

struct VSOut {
  @builtin(position) clipPos: vec4f,
  @location(0) worldPos: vec3f,
};

@vertex
fn vsWater(@location(0) xz: vec2f) -> VSOut {
  let wx = water.mapDomain.x + xz.x * water.mapDomain.z;
  let wz = water.mapDomain.y + xz.y * water.mapDomain.w;
  // Tight upper bounding envelope above maximum wave crest: hardware Early-Z culls walls
  // cleanly while fsWater resolves exact undulating wave-wall contact below!
  let wp = vec3f(wx, water.surface.x + WATER_ENV_MARGIN, wz);
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

// Returns vec3f(height, dhdx, dhdz) directly from the combined finite-depth Neumann +
// spectral FFT body-wake field inside the active local simulation window, fading smoothly
// into a fine-scale capillary tail only for far distant tunnel water (>9 m away).
fn waterBicubicSample(wx: f32, wz: f32) -> vec3f {
  let nx = i32(water.grid.x);
  let nz = i32(water.grid.y);
  let dx = max(water.surface.y, 1e-4);

  let u = (wx - water.simDomain.x) * water.simDomain.z;
  let v = (wz - water.simDomain.y) * water.simDomain.w;
  let margin = min(min(u, 1.0 - u), min(v, 1.0 - v));
  let winMask = smoothstep(0.0, 0.08, margin);

  var hVal = 0.0;
  var dhdx = 0.0;
  var dhdz = 0.0;

  if (winMask > 0.001) {
    let fx = clamp((wx - water.simDomain.x) / dx - 0.5, 0.0, f32(nx - 1) - 1e-4);
    let fz = clamp((wz - water.simDomain.y) / dx - 0.5, 0.0, f32(nz - 1) - 1e-4);
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
      hVal += rowVal * rW;
      dhdu += rowDerivX * rW;
      dhdv += rowVal * rD;
    }
    dhdx = dhdu / dx;
    dhdz = dhdv / dx;
  }

  if (winMask < 0.999) {
    let farSlope = evalFarCapillarySlope(vec2f(wx, wz), frame.cameraPos.w, max(water.surface.x, 0.35), 0.038);
    dhdx = mix(farSlope.x, dhdx, winMask);
    dhdz = mix(farSlope.y, dhdz, winMask);
    hVal *= winMask;
  }

  return vec3f(hVal, dhdx, dhdz);
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
      if (isSubmerged) {
        let subDepth = max(0.0, water.surface.x - hitPos.y);
        let inTransmit = exp(-water.optics.rgb * (subDepth / max(sunDir.y, 0.25)));
        let cUV = (hitPos.xz - water.simDomain.xy) * water.simDomain.zw;
        let cMargin = min(min(cUV.x, 1.0 - cUV.x), min(cUV.y, 1.0 - cUV.y));
        let cMask = smoothstep(0.0, 0.05, cMargin);
        var sunFactor = vec3f(0.0);
        if (cMask > 0.5) {
          // Inside local physics window: causticTex already carries exact water-surface solar
          // visibility + live Snell-refracted photon focusing (eliminates shadow-edge mismatch!).
          let causticRaw = max(textureSampleLevel(causticTex, linSampler, clamp(cUV, vec2f(0.002), vec2f(0.998)), 0.0).rgb, vec3f(0.0));
          let cPow = clamp(water.optics.w, 0.5, 1.6);
          sunFactor = pow(causticRaw, vec3f(cPow));
        } else {
          // Far receding pool beyond local caustic window: 4-tap soft solar penumbra + subtle ripple focus
          let shadowPos = hitPos + hit.n * 0.015;
          let sBasis = orthoBasis(sunDir);
          var softVis = 0.0;
          for (var si = 0; si < 4; si++) {
            let ang = f32(si) * (PI * 0.5) + 0.4;
            let sd = normalize(sBasis * vec3f(0.032 * cos(ang), 0.032 * sin(ang), 1.0));
            if (!traceShadowWater(shadowPos, sd, 150.0)) { softVis += 0.25; }
          }
          let farRip = 0.86 + 0.14 * sin(hitPos.x * 7.5 + frame.cameraPos.w * 2.1) * cos(hitPos.z * 6.8 - frame.cameraPos.w * 1.7);
          sunFactor = vec3f(softVis * farRip);
        }
        col += albedo * kD * frame.sunColorInt.rgb * ndl * INV_PI * inTransmit * sunFactor;
      } else {
        let shadowPos = hitPos + hit.n * 0.015;
        if (!traceShadowWater(shadowPos, sunDir, 150.0)) {
          col += albedo * kD * frame.sunColorInt.rgb * ndl * INV_PI;
        }
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
  let ro = frame.cameraPos.xyz;
  let toEnv = i.worldPos - ro;
  let envDist = length(toEnv);
  let rd = toEnv / max(envDist, 1e-4);
  if (rd.y >= -1e-4) { discard; }

  let fullDims = vec2i(textureDimensions(sceneDepthTex));
  let px = clamp(vec2i(i.clipPos.xy), vec2i(0), fullDims - vec2i(1));
  let sceneDepth = textureLoad(sceneDepthTex, px, 0);

  var tScene = 140.0;
  var scenePos = ro + rd * tScene;
  if (sceneDepth < 0.9999) {
    let uv = (vec2f(px) + 0.5) / vec2f(fullDims);
    let ndc = vec4f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, sceneDepth, 1.0);
    let sp4 = frame.invViewProj * ndc;
    scenePos = sp4.xyz / sp4.w;
    tScene = length(scenePos - ro);
  }

  let wl = water.surface.x;
  let tSlabTop = max(0.05, (wl + WATER_ENV_MARGIN - ro.y) / rd.y);
  let tSlabBot = max(tSlabTop + 0.002, (wl - WATER_ENV_MARGIN - ro.y) / rd.y);
  if (tSlabTop >= tScene) { discard; }

  // Exact 4-step damped Newton ray-heightfield intersection solving ro.y + rd.y * t = wl + h(x, z).
  // Produces an organically undulating wave-wall contact line (zero straight-line ruler seams!)
  // and guarantees wp always lies strictly on the wet camera-facing side of walls & steps.
  let tMaxEval = min(tSlabBot, tScene + 0.03);
  let maxStep = max(0.04, (tSlabBot - tSlabTop) * 0.28);
  var tW = clamp((wl - ro.y) / rd.y, tSlabTop, tMaxEval);
  var w = vec3f(0.0);
  for (var iter = 0; iter < 4; iter++) {
    let p = ro + rd * tW;
    w = waterBicubicSample(p.x, p.z);
    let fVal = p.y - (wl + w.x);
    let dfdt = min(rd.y - w.y * rd.x - w.z * rd.z, rd.y * 0.45 - 0.04);
    let delta = clamp(fVal / dfdt, -maxStep, maxStep);
    tW = clamp(tW - delta, tSlabTop, tMaxEval + 0.04);
  }

  // Re-evaluate final wave height & gradient at converged hit; discard if behind wall/deck/step!
  let hitCheck = ro + rd * tW;
  w = waterBicubicSample(hitCheck.x, hitCheck.z);
  let clearRay = tScene - tW;
  if (clearRay <= 0.002) { discard; }

  let wp = vec3f(hitCheck.x, wl + w.x, hitCheck.z);
  let V = -rd;
  let camDist = tW;

  // Gentle Neumann slope relaxation near wall/step contact (zero artificial dark meniscus rim!).
  let contactCalm = mix(0.28, 1.0, smoothstep(0.0, 0.075, clearRay));
  let clampedSlope = clamp(vec2f(w.y, w.z) * contactCalm, vec2f(-0.62), vec2f(0.62));
  var N = normalize(vec3f(-clampedSlope.x, 1.0, -clampedSlope.y));

  // Guarantee camera-facing normal hemisphere: prevents Snell refraction inversion and
  // bogus 99% dark grazing mirrors on steep wading bow waves and wall-hugging ripples!
  let rawNdv = dot(N, V);
  if (rawNdv < 0.08) {
    N = normalize(N + V * (0.08 - rawNdv));
  }

  // 1. Exact unpolarized dielectric Fresnel (air -> water, IOR = 1.333)
  let ndv = max(dot(N, V), 0.08);
  let fresnel = exactDielectricFresnel(ndv, 1.333);

  // Safe wet-side ray origin backed slightly along +V so rays NEVER start inside solid walls/steps!
  let safeBack = min(0.014, clearRay * 0.45);
  let safeP = ro + rd * max(0.05, tW - safeBack);

  // 2. TRUE Snell-Refracted BVH Transmission Ray!
  var T = refract(-V, N, 1.0 / 1.333);
  if (dot(T, T) < 1e-4 || T.y > -0.02) { T = -V; }
  T = normalize(T);

  let refrOrigin = safeP;
  let subHit = traceClosestWater(refrOrigin, T, 24.0);
  var underwater = vec3f(0.004, 0.014, 0.012);
  if (subHit.hit) {
    let subLen = subHit.t;
    let subPos = refrOrigin + T * subHit.t;
    let subCol = shadeSurfaceHit(subHit, subPos, T, camDist + subHit.t, true);
    // Exact Beer-Lambert RGB water absorption + Snell solid-angle radiance factor (n1/n2)^2 = 1/1.333^2
    // matching v1 camera.wgsl physical water clarity (crystal aquamarine-emerald tiles beneath glass water!).
    let transmit = exp(-water.optics.rgb * subLen);
    underwater = (subCol * transmit) * (1.0 / (1.333 * 1.333));
  }

  // 3. TRUE Full-Scene BVH Mirror Reflection Ray!
  var R = reflect(-V, N);
  if (R.y < 0.025) {
    R = normalize(vec3f(R.x, 0.025, R.z));
  }
  let reflOrigin = safeP + vec3f(0.0, 0.008, 0.0);
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

  // Match v1 camera.wgsl gentle atmospheric transmittance along primary air path
  let airTr = exp(-0.004 * camDist);
  let finalCol = (underwater * (1.0 - fresnel) + reflCol * fresnel) * airTr;
  return vec4f(finalCol, 1.0);
}
