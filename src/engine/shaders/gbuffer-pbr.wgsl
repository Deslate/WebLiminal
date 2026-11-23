// Real-time Hardware-Rasterized PBR G-Buffer + Analytic Ceramic Porcelain +
// Per-Pixel BVH Soft Sun Shadows + Directional Indirect GI Lightmap Pass,
// plus full-screen Sky Backdrop pass.
// Prepended with bvh-common.wgsl.

struct FrameUniform {
  viewProj: mat4x4f,
  invViewProj: mat4x4f,
  cameraPos: vec4f,    // xyz = world camera pos, w = elapsed time
  resolution: vec4f,   // xy = render w/h, zw = inv w/h
  sunDirRad: vec4f,    // xyz = normalized sun dir, w = angular radius
  sunColorInt: vec4f,  // rgb = sun color * intensity, w = enabled
  skyTop: vec4f,       // rgb = sky zenith, w = exposure
  skyHorizon: vec4f,   // rgb = sky horizon, w = lightCount
  fogColorDens: vec4f, // rgb = fog color, w = fog density
  fogParams: vec4f,    // x = heightFalloff, y = volumetricStrength, z = bloomStrength, w = ambientFloor
  waterInfo: vec4f,    // x = waterLevel, y = hasWater, z = debugView, w = flags (bit0=vhsMode, bit1=ssrDisabled)
};

@group(0) @binding(0) var<uniform> frame: FrameUniform;
@group(0) @binding(1) var<storage, read> materials: array<MaterialGPU>;
@group(0) @binding(2) var<storage, read> lights: array<AreaLight>;
@group(0) @binding(3) var texSampler: sampler;
@group(0) @binding(4) var lmSampler: sampler;
@group(0) @binding(5) var albedoRoughTex: texture_2d_array<f32>;
@group(0) @binding(6) var normalHeightTex: texture_2d_array<f32>;
@group(0) @binding(7) var extraTex: texture_2d_array<f32>;
@group(0) @binding(8) var lmIrradTex: texture_2d<f32>;
@group(0) @binding(9) var lmDirTex: texture_2d<f32>;
@group(0) @binding(10) var<storage, read> bvhNodes: array<BVHNode>;
@group(0) @binding(11) var<storage, read> bvhTris: array<BVHTri>;

fn traceShadowPBR(ro: vec3f, rd: vec3f, maxT: f32) -> bool {
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

// Deterministic 1-ray world-locked sun center visibility.
// Zero screen-space Bayer/IGN dithering prevents any shadow stipple crawling when moving the camera.
// Soft distance-dependent penumbras are resolved deterministically on detected shadow edges in compositeSSR.
fn evalSunVisibility1(p: vec3f, nGeom: vec3f) -> f32 {
  let sunDir = frame.sunDirRad.xyz;
  if (dot(nGeom, sunDir) <= 0.0) { return 0.0; }
  let origin = p + nGeom * 0.015;
  return select(0.0, 1.0, !traceShadowPBR(origin, sunDir, 160.0));
}

// --- Sky Backdrop Pass ---
struct SkyVSOut {
  @builtin(position) clipPos: vec4f,
  @location(0) ndc: vec2f,
};

@vertex
fn vsSky(@builtin(vertex_index) vid: u32) -> SkyVSOut {
  let pts = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: SkyVSOut;
  o.ndc = pts[vid];
  o.clipPos = vec4f(pts[vid], 0.999999, 1.0);
  return o;
}

struct GBufferOut {
  @location(0) hdrColor: vec4f,
  @location(1) gNormalRough: vec4f,
  @location(2) gAlbedoMetal: vec4f,
  @location(3) sunDirect: vec4f,
};

@fragment
fn fsSky(i: SkyVSOut) -> GBufferOut {
  let wp = frame.invViewProj * vec4f(i.ndc, 1.0, 1.0);
  let rd = normalize(wp.xyz / wp.w - frame.cameraPos.xyz);
  var col = evalSkyRadiance(rd, frame.skyTop.rgb, frame.skyHorizon.rgb, frame.sunDirRad.xyz, frame.sunColorInt.rgb, frame.sunColorInt.w > 0.5);
  if (frame.sunColorInt.w > 0.5) {
    let cosA = max(dot(rd, frame.sunDirRad.xyz), 0.0);
    let disc = smoothstep(cos(frame.sunDirRad.w * 1.4), cos(frame.sunDirRad.w * 0.7), cosA);
    col += frame.sunColorInt.rgb * disc * 2.2;
  }
  var o: GBufferOut;
  o.hdrColor = vec4f(col, 1.0);
  o.gNormalRough = vec4f(0.0, 0.0, 0.0, 1.0);
  o.gAlbedoMetal = vec4f(0.0);
  o.sunDirect = vec4f(0.0);
  return o;
}

// --- Opaque PBR Scene Pass ---
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
  @location(2) worldTan: vec4f,
  @location(3) uv: vec2f,
  @location(4) uv2: vec2f,
  @location(5) @interpolate(flat) matId: u32,
};

@vertex
fn vsMain(v: VertexIn) -> VSOut {
  var o: VSOut;
  o.clipPos = frame.viewProj * vec4f(v.pos, 1.0);
  o.worldPos = v.pos;
  o.worldNorm = v.normal;
  o.worldTan = v.tangent;
  o.uv = v.uv;
  o.uv2 = v.uv2;
  o.matId = v.matId;
  return o;
}

fn fresnelSchlick(cosTheta: f32, f0: vec3f) -> vec3f {
  return f0 + (vec3f(1.0) - f0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

fn ggxD(ndh: f32, a: f32) -> f32 {
  let a2 = a * a;
  let d = ndh * ndh * (a2 - 1.0) + 1.0;
  return a2 / max(PI * d * d, 1e-5);
}

fn smithG(ndv: f32, ndl: f32, a: f32) -> f32 {
  let k = (a + 1.0);
  let k2 = (k * k) * 0.125;
  let gv = ndv / (ndv * (1.0 - k2) + k2);
  let gl = ndl / (ndl * (1.0 - k2) + k2);
  return gv * gl;
}

fn evalGGXSpec(n: vec3f, v: vec3f, l: vec3f, rough: f32, f0: vec3f) -> vec3f {
  let ndl = max(dot(n, l), 0.0);
  let ndv = max(dot(n, v), 0.001);
  if (ndl <= 0.0) { return vec3f(0.0); }
  let h = normalize(v + l);
  let ndh = max(dot(n, h), 0.0);
  let vdh = max(dot(v, h), 0.0);
  let a = max(rough * rough, 0.006);
  let D = ggxD(ndh, a);
  let G = smithG(ndv, ndl, rough);
  let F = fresnelSchlick(vdh, f0);
  return (D * G * F) / max(4.0 * ndl * ndv, 1e-4) * ndl;
}

fn fluorescentFlicker(time: f32, seed: f32, strength: f32) -> f32 {
  if (strength <= 0.001) { return 1.0; }
  let t = time * 17.3 + seed * 31.7;
  let w = sin(t * 2.1) * sin(t * 5.7) * sin(t * 13.1);
  let dip = smoothstep(0.62, 0.92, w);
  let buzz = 0.98 + 0.02 * sin(time * 377.0 + seed * 9.0);
  return mix(1.0, buzz * (1.0 - dip * 0.55), clamp(strength, 0.0, 1.0));
}

@fragment
fn fsMain(i: VSOut) -> GBufferOut {
  let m = materials[i.matId];
  let layer = i32(i.matId);
  let preset = u32(m.extra.x + 0.5);

  let Ngeom = normalize(i.worldNorm);
  let T = normalize(i.worldTan.xyz - Ngeom * dot(i.worldTan.xyz, Ngeom));
  let B = cross(Ngeom, T) * i.worldTan.w;

  let toCam = frame.cameraPos.xyz - i.worldPos;
  let camDist = length(toCam);
  let V = toCam / max(camDist, 1e-4);

  var uv = i.uv * m.albedoScale.w;

  // Compute anisotropic 2D screen-space UV filter width BEFORE any non-uniform control flow (required by WGSL!).
  let fwUV2 = vec2f(length(vec2f(dpdx(i.uv.x), dpdy(i.uv.x))), length(vec2f(dpdx(i.uv.y), dpdy(i.uv.y))));

  // Parallax Occlusion Mapping (POM) for non-ceramic textured relief (brick, ceiling grid, carpet).
  let pomDepth = m.pbr.w;
  if (!isCeramicPreset(preset) && pomDepth > 0.002 && camDist < 8.5) {
    let viewTan = vec3f(dot(V, T), dot(V, B), max(abs(dot(V, Ngeom)), 0.25));
    let pomFade = 1.0 - smoothstep(4.5, 8.5, camDist);
    let maxShift = (viewTan.xy / viewTan.z) * (pomDepth * m.albedoScale.w * pomFade);
    let steps = 6;
    let stepUV = maxShift / f32(steps);
    var curUV = uv;
    var curLayer = 1.0;
    let dLayer = 1.0 / f32(steps);
    var h = textureSampleLevel(normalHeightTex, texSampler, curUV, layer, 0.0).b;
    var prevH = h;
    for (var s = 0; s < steps; s++) {
      if (curLayer <= h) { break; }
      prevH = h;
      curUV -= stepUV;
      curLayer -= dLayer;
      h = textureSampleLevel(normalHeightTex, texSampler, curUV, layer, 0.0).b;
    }
    let afterD = h - curLayer;
    let beforeD = prevH - (curLayer + dLayer);
    let w = clamp(afterD / max(afterD - beforeD, 1e-4), 0.0, 1.0);
    uv = curUV + stepUV * w;
  }

  let ar = textureSample(albedoRoughTex, texSampler, uv, layer);
  let nh = textureSample(normalHeightTex, texSampler, uv, layer);
  let mt = textureSample(extraTex, texSampler, uv, layer);

  var albedo = ar.rgb;
  var rough = clamp(ar.a, 0.035, 1.0);
  var texAO = nh.a;
  var metallic = mt.r;
  var coat = mt.g;
  var emissiveMask = mt.b;

  var nXY = nh.rg * 2.0 - 1.0;

  // Primary-ray 3D ceramic height-field relief intersection + 4-tap footprint slope-moment evaluation.
  let hasWater = frame.waterInfo.y > 0.5;
  var cerUV = i.uv;
  if (isCeramicPreset(preset) && camDist < 11.0) {
    let cerTileSize = 1.0 / max(ceramicGridFreq(preset, m.albedoScale.w), 0.25);
    cerUV = ceramicReliefUV(i.uv, cerTileSize, preset, m.extra.z, V, T, B, Ngeom, fwUV2, camDist);
  }
  let cer = evalAnalyticCeramicFull(cerUV, m, ar.rgb, ar.a, fwUV2, i.worldPos.y, frame.waterInfo.x, hasWater);
  let intr = evalAnalyticInterior(i.uv, i.worldPos, m, fwUV2);
  if (cer.isCeramic) {
    albedo = cer.albedo;
    rough = cer.rough;
    coat = cer.coat;
    texAO *= cer.ao;
    // Use pure world-metric ceramic slope (flat/tilted face + rounded convex bevel lip + kiln waviness),
    // never superimposing coarse 256px baked texture bump!
    nXY = cer.slope;
  } else if (intr.handled) {
    albedo = intr.albedo;
    rough = intr.rough;
    coat = intr.coat;
    metallic = intr.metallic;
    texAO = intr.ao;
    nXY = intr.slope;
    if (preset == 13u) {
      emissiveMask = intr.emissiveMask;
    }
  } else if (preset == 8u || preset == 10u) {
    // Level 1 authentic poured concrete & weathered chalky concrete columns:
    // Horizontal formwork lift seams (0.80 m), floor splash grime, damp seepage & non-repeating tonal mottle.
    let liftSeam = filteredGridCoverage(vec2f(0.25, i.worldPos.y / 0.80), vec2f(0.001, fwUV2.y / 0.80), 0.006 / 0.80);
    let vertJoint = filteredGridCoverage(vec2f(i.uv.x / 2.40, 0.25), vec2f(fwUV2.x / 2.40, 0.001), 0.007 / 2.40);
    let seam = clamp(liftSeam * 0.65 + vertJoint * 0.85, 0.0, 1.0);
    let worldMottle = vFbm2(vec2f(i.worldPos.x + i.worldPos.z, i.worldPos.y * 0.9) * 0.36);
    let streak = smoothstep(0.54, 0.82, vFbm2(vec2f((i.worldPos.x + i.worldPos.z) * 1.6, i.worldPos.y * 0.24))) * smoothstep(0.8, 2.9, i.worldPos.y);
    let baseGrime = smoothstep(0.55, 0.02, i.worldPos.y) * (0.55 + 0.45 * vFbm2(vec2f(i.worldPos.x + i.worldPos.z, 2.3) * 0.75));
    let dampTotal = clamp((baseGrime * 0.75 + streak * 0.50) * max(m.extra.y, 0.16), 0.0, 1.0);
    albedo *= 0.84 + 0.28 * worldMottle;
    albedo = mix(albedo, albedo * 0.56, seam * 0.68);
    albedo = mix(albedo, albedo * vec3f(0.50, 0.48, 0.43), baseGrime * 0.62);
    albedo = mix(albedo, albedo * vec3f(0.66, 0.68, 0.65), streak * 0.38);
    rough = clamp(rough - dampTotal * 0.26, 0.36, 0.97);
    coat = max(coat, dampTotal * 0.18);
    texAO *= (1.0 - seam * 0.36) * (1.0 - baseGrime * 0.30);
  } else if (preset == 9u) {
    // Level 1 multi-sector concrete floor (selected cleanly by material seed m.extra.z!):
    //   seed < 15 : Aquila Sector wet concrete (long tire-track mirror puddles & pillar pools, NO yellow stripes!)
    //   15..30    : High-Bay Warehouse dusty troweled concrete (warm sandy/cool grey slab pour transition!)
    //   >= 30     : Vaulted Mushroom Garage dusty concrete with crisp white painted parking bay lines!
    let pXZ = i.worldPos.xz;
    let floorMode = m.extra.z;
    let sawJoint = filteredGridCoverage(pXZ / 2.40, fwUV2 / 2.40, 0.008 / 2.40);
    let macroSlab = vFbm2(pXZ * 0.22 + vec2f(4.2, 9.1));
    let oilPatch = smoothstep(0.54, 0.82, vFbm2(pXZ * 0.46 + vec2f(-9.3, 4.7)));
    let tireWear = vFbm2(vec2f(pXZ.x * 1.3, pXZ.y * 0.16) + vec2f(2.1, -3.4));
    let cWarp1 = (vFbm2(vec2f(pXZ.y * 0.65, 3.7)) - 0.5) * 0.85 + (vFbm2(vec2f(pXZ.y * 3.1, 11.2)) - 0.5) * 0.16;
    let cLine1 = abs((pXZ.x + 1.85) + cWarp1);
    let crackW = 0.0045 + max(fwUV2.x, fwUV2.y) * 0.35;
    let crack = (1.0 - smoothstep(0.001, crackW, cLine1)) * smoothstep(2.0, 5.5, pXZ.y) * smoothstep(13.0, 9.5, pXZ.y) * select(0.0, 1.0, floorMode < 15.0);

    albedo *= (0.78 + 0.34 * macroSlab) * (0.87 + 0.22 * tireWear);
    albedo = mix(albedo, albedo * vec3f(0.48, 0.46, 0.42), oilPatch * 0.55);

    if (floorMode >= 15.0 && floorMode < 30.0) {
      // High-Bay Warehouse: authentic warm dusty tan slab meeting a cooler grey poured concrete repair section
      let pourEdge = smoothstep(-0.35, 0.35, (pXZ.x - 2.0) * 0.55 + (pXZ.y + 11.0) * 0.35 + (macroSlab - 0.5) * 1.4);
      let warmDust = albedo * vec3f(1.16, 1.07, 0.92);
      let coolPour = albedo * vec3f(0.96, 1.00, 1.03);
      albedo = mix(warmDust, coolPour, pourEdge);
    } else if (floorMode >= 30.0) {
      // Vaulted Mushroom Garage: crisp slightly weathered WHITE painted parking stall divider lines!
      let stallZ = abs(fract((pXZ.y + 2.40) / 4.80) - 0.5) * 4.80;
      let laneLine = (1.0 - smoothstep(0.042, 0.068, stallZ)) * step(0.65, abs(fract((pXZ.x + 2.40) / 4.80) - 0.5) * 4.80);
      let paintWear = smoothstep(0.24, 0.62, vFbm2(pXZ * 2.4 + vec2f(3.1, 8.7)));
      albedo = mix(albedo, vec3f(0.86, 0.85, 0.78), laneLine * (0.58 + 0.42 * paintWear));
    }

    albedo = mix(albedo, albedo * 0.36, max(sawJoint * 0.78, crack * 0.75));

    // Puddles: Aquila Sector gets long mirror-wet tire-track streams + pillar pools (reflecting vertical column tubes!)
    let wetLvl = clamp(m.extra.y, 0.0, 1.0);
    let pLow = vFbm2(pXZ * 0.24 + vec2f(-5.8, 12.1));
    let pMed = vFbm2(pXZ * 0.68 + vec2f(11.3, -4.2));
    var trackBoost = 0.0;
    if (floorMode < 15.0) {
      let trkW = (vFbm2(vec2f(pXZ.y * 0.18, 2.4)) - 0.5) * 0.75;
      // Twin longitudinal wet tire tracks + foreground pool by huge pillar F (matches Aquila Sector photo!)
      let trk1 = exp(-pow((pXZ.x - 0.75 + trkW) / 0.58, 2.0));
      let trk2 = exp(-pow((pXZ.x + 0.95 + trkW * 0.8) / 0.65, 2.0));
      let pillarPool = exp(-pow((pXZ.x + 2.15) / 2.2, 2.0)) * exp(-pow((pXZ.y - 7.8) / 3.4, 2.0));
      let midPool = exp(-pow((pXZ.x - 0.35) / 2.4, 2.0)) * exp(-pow((pXZ.y + 0.5) / 5.2, 2.0));
      let wallPool = exp(-pow((pXZ.x - 4.4) / 1.1, 2.0)) * (0.5 + 0.5 * sin(pXZ.y * 0.65));
      trackBoost = 0.24 * max(trk1, trk2) + 0.22 * pillarPool + 0.16 * midPool + 0.14 * wallPool;
    }
    let puddleField = pLow * 0.68 + pMed * 0.32 + trackBoost;
    let thresh = 0.64 - wetLvl * 0.11;
    let dampMargin = smoothstep(thresh - 0.095, thresh + 0.005, puddleField) * smoothstep(0.05, 0.28, wetLvl);
    let puddle = smoothstep(thresh, thresh + 0.022, puddleField) * smoothstep(0.18, 0.45, wetLvl);

    albedo = mix(albedo, albedo * vec3f(0.56, 0.55, 0.53), dampMargin * 0.62);
    albedo = mix(albedo, albedo * vec3f(0.32, 0.33, 0.34), puddle * 0.88);

    let dryR = clamp(rough + (1.0 - oilPatch * 0.12) * 0.06, 0.78, 0.96);
    rough = mix(mix(dryR, 0.32, dampMargin), 0.028, puddle);
    coat = mix(mix(0.02, 0.35, dampMargin), 1.0, puddle);
    nXY *= 1.0 - puddle * 0.985;
    texAO *= (1.0 - sawJoint * 0.50) * (1.0 - crack * 0.45);
  } else if (preset == 19u) {
    // Aquila Sector vertical galvanized corrugated sheet-metal wall: crisp vertical ribs + lower splash grime!
    let ribPhase = i.uv.x * 8.0 * 6.2831853;
    let wave = 0.5 + 0.5 * sin(ribPhase);
    let nyq = clamp(1.0 - smoothstep(0.04, 0.11, fwUV2.x), 0.0, 1.0);
    nXY.x = -cos(ribPhase) * 0.58 * nyq;
    nXY.y *= 0.35;
    let baseSplash = smoothstep(0.45, 0.02, i.worldPos.y) * (0.5 + 0.5 * vFbm2(vec2f(i.worldPos.z, 1.4) * 1.2));
    albedo *= (0.88 + 0.22 * wave) * (1.0 - baseSplash * 0.38);
    texAO *= (0.76 + 0.24 * wave) * (1.0 - baseSplash * 0.25);
  } else if (preset == 20u) {
    // Overgrown Courtyard swirling emerald moss & dense ground-cover ivy carpet (matches image_4.png!)
    let pXZ = i.worldPos.xz;
    let swirl = vFbm2(pXZ * 0.32 + vec2f(2.4, -3.1)) * 2.2;
    let ridge = 0.5 + 0.5 * sin((pXZ.x * 1.15 + pXZ.y * 0.85 + swirl) * 3.14159);
    let contour = smoothstep(0.58, 0.88, ridge);
    let microLeaf = vFbm2(pXZ * 4.5 + vec2f(7.1, 3.8));
    let sunPatch = vFbm2(pXZ * 0.55 + vec2f(-4.3, 8.2));
    albedo = mix(albedo * vec3f(0.68, 0.74, 0.55), albedo * vec3f(1.38, 1.48, 0.82), contour * 0.55 + sunPatch * 0.35);
    albedo *= 0.84 + 0.32 * microLeaf;
    texAO *= 0.78 + 0.22 * contour;
    rough = clamp(rough - contour * 0.12, 0.68, 0.98);
  }
  var vineDiscard = false;
  if (preset == 21u) {
    // Hanging & climbing courtyard ivy vines: procedural botanical alpha-cutout + woody stem vs veined chlorophyll leaves!
    let vine = evalFoliageVine(i.uv);
    if (vine.x < 0.5) {
      vineDiscard = true;
    } else {
      let leafVar = vFbm2(vec2f(i.worldPos.x + i.worldPos.z * 1.3, i.worldPos.y * 1.8) * 1.4);
      let isStem = vine.y < 0.42;
      let leafCol = albedo * mix(vec3f(0.58, 0.72, 0.44), vec3f(1.38, 1.56, 0.76), leafVar) * vine.y;
      let stemCol = vec3f(0.14, 0.12, 0.07) * (0.75 + 0.5 * leafVar);
      albedo = select(leafCol, stemCol, isStem);
      rough = select(0.52, 0.86, isStem);
      texAO *= mix(0.65, 1.0, clamp(vine.y, 0.0, 1.0));
    }
  }

  let nZ = sqrt(max(0.04, 1.0 - min(0.92, dot(nXY, nXY))));
  let N = normalize(T * nXY.x + B * nXY.y + Ngeom * nZ);

  // Subtle physical damp zone right above waterline (waterline stain already applied inside ceramic).
  if (hasWater) {
    let hAbove = i.worldPos.y - frame.waterInfo.x;
    let wetZone = smoothstep(0.20, -0.02, hAbove);
    if (!cer.isCeramic) {
      let waterline = exp(-abs(hAbove - 0.045) / 0.08);
      albedo *= 1.0 - waterline * 0.16 - wetZone * 0.06;
    } else {
      albedo *= 1.0 - wetZone * 0.05;
    }
    rough = mix(rough, min(rough, 0.16), wetZone * 0.45 * (1.0 - cer.inGrout * 0.85));
    coat = mix(coat, max(coat, 0.88), wetZone * 0.45 * (1.0 - cer.inGrout * 0.85));
  }

  // Sample baked Directional Indirect GI + Area-Light Lightmap (last implicit-derivative textureSample calls!).
  let lmI = textureSample(lmIrradTex, lmSampler, i.uv2);
  let lmD = textureSample(lmDirTex, lmSampler, i.uv2);
  if (vineDiscard) { discard; }
  let irrad = lmI.rgb + vec3f(frame.fogParams.w);
  let bakedAO = clamp(lmD.a, 0.0, 1.0);
  let indoorDirect = (u32(frame.waterInfo.w + 0.5) & 4u) != 0u;
  // On dry baked-area-light interiors (Level 0), lightmap irradiance already integrates physical occlusion;
  // on Poolrooms, balance baked AO (0.44..1.0) so corners anchor cleanly without muddying sunlit walls.
  let aoFloor = select(0.44, 0.66, !hasWater && !indoorDirect);
  let ao = mix(aoFloor, 1.0, bakedAO) * mix(0.68, 1.0, texAO);

  // Directional normal modulation from lightmap dominant incoming light vector.
  // Preserves strong raking-light relief across 3D ceramic tile bevels, kiln tilts & recessed mortar grooves!
  let irradLuma = max(0.002, dot(irrad, vec3f(0.2126, 0.7152, 0.0722)));
  let dirLen = length(lmD.rgb);
  let dirStrength = clamp(dirLen / irradLuma, 0.0, 1.0);
  let domDir = select(Ngeom, lmD.rgb / max(dirLen, 1e-4), dirLen > 1e-4);
  let ndlBump = max(dot(N, domDir), 0.0);
  let ndlGeom = max(dot(Ngeom, domDir), 0.16);
  let dirRatio = clamp(ndlBump / ndlGeom, 0.18, 2.35);
  let directionalFactor = mix(1.0, dirRatio, dirStrength * 0.90);
  let grooveOcc = mix(1.0, 0.34 + 0.66 * clamp(dot(Ngeom, domDir) * 1.8, 0.0, 1.0), cer.inGrout);

  let ndv = max(dot(N, V), 0.001);
  // Physical Fresnel F0: glazed porcelain ~0.046 (v1 coat=0.047), matte mortar/plaster ~0.014, metals use albedo.
  let dielecF0 = mix(0.012, 0.047, clamp(coat, 0.0, 1.0));
  let f0 = mix(vec3f(dielecF0), albedo, metallic);
  let Fv = fresnelSchlick(ndv, f0);
  let kD = (vec3f(1.0) - Fv) * (1.0 - metallic);

  // 1. Indirect GI + Baked Area Lights Diffuse & Broad Satin Specular (extended-aperture lobe, zero plastic spotlight!)
  var diffuse = kD * albedo * irrad * directionalFactor * ao * grooveOcc;
  let specRough = clamp(mix(max(rough, 0.28), max(rough, 0.42), 1.0 - dirStrength * 0.65), 0.14, 0.96);
  var specular = evalGGXSpec(N, V, domDir, specRough, f0) * irrad * dirStrength * ao * (1.0 - cer.inGrout * 0.88) * 0.88;

  // 2. Per-Pixel Direct Sunlight (1-ray deterministic center visibility -> edge-only 12-tap Vogel penumbra in compositeSSR)
  var sunDirectRGB = vec3f(0.0);
  var sunVis = 0.0;
  if (frame.sunColorInt.w > 0.5) {
    let sunDir = frame.sunDirRad.xyz;
    let ndlSun = max(dot(N, sunDir), 0.0);
    let isFoliage = preset == 21u;
    let backWrap = select(0.0, max(dot(-N, sunDir), 0.0) * 0.52, isFoliage);
    if ((ndlSun > 0.0 && dot(Ngeom, sunDir) > 0.0) || backWrap > 0.01) {
      let sunRad = frame.sunColorInt.rgb;
      let fIn = fresnelSchlick(max(ndlSun, 0.1), f0);
      let sunDiff = kD * (vec3f(1.0) - fIn) * albedo * sunRad * (ndlSun + backWrap * 0.85) * INV_PI * mix(0.74, 1.0, texAO);
      let transGlow = select(vec3f(0.0), albedo * vec3f(1.4, 1.6, 0.6) * sunRad * backWrap * INV_PI * 0.55, isFoliage);
      let sunSpec = select(vec3f(0.0), evalGGXSpec(N, V, sunDir, max(rough, 0.065), f0) * sunRad, ndlSun > 0.0 && dot(Ngeom, sunDir) > 0.0);
      sunDirectRGB = sunDiff + transGlow + sunSpec;
      sunVis = evalSunVisibility1(i.worldPos, select(Ngeom, sunDir, isFoliage && dot(Ngeom, sunDir) <= 0.0));
    }
  }

  // 3. Per-Pixel Rectangular Area-Light Illumination & Adaptive 2->8 Quad Soft Shadows
  //    - Enabled via perPixelLights flag (bit 4 of waterInfo.w: Level 0 & Level 1, including hybrid sunlit+underground!):
  //      Ranks up to 64 facing fixtures by unshadowed energy (zero rays), then evaluates Top 6 with smooth roll-off
  //      and adaptive 2->8 stratified penumbra refinement exclusively on shadow edges (~5% of pixels).
  //    - Poolrooms (perPixelLights == false): evaluates early-culled BVH-shadowed area-light GGX specular.
  let lightCount = min(u32(frame.skyHorizon.w + 0.5), 64u);
  let shadowOrigin = i.worldPos + Ngeom * 0.014;

  if (indoorDirect) {
    var topIdx = array<u32, 6>(0u, 0u, 0u, 0u, 0u, 0u);
    var topScore = array<f32, 6>(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);

    // Zero-ray ranking pass: select up to 6 strongest facing area lights at this surface point.
    for (var li = 0u; li < lightCount; li++) {
      let l = lights[li];
      let lCenter = l.originArea.xyz + 0.5 * (l.edgeUPower.xyz + l.edgeVKind.xyz);
      let toC = lCenter - i.worldPos;
      let cDist2 = dot(toC, toC);
      if (cDist2 > 324.0 || cDist2 < 0.01) { continue; }
      let lNorm = normalize(cross(l.edgeUPower.xyz, l.edgeVKind.xyz));
      let halfSpan = 0.5 * (length(l.edgeUPower.xyz) + length(l.edgeVKind.xyz));
      if (dot(lNorm, -toC) <= -0.02 || dot(Ngeom, toC) + halfSpan <= 0.0) { continue; }
      let invD = inverseSqrt(max(cDist2, 0.25));
      let dirC = toC * invD;
      let cL = max(dot(lNorm, -dirC), 0.10);
      let cS = max(dot(Ngeom, dirC), 0.10);
      let sc = (l.edgeUPower.w * cL * cS) / max(cDist2, 0.25);
      if (sc <= topScore[5]) { continue; }

      // Insert into 6-element descending list
      var pos = 5u;
      loop {
        if (pos == 0u || sc <= topScore[pos - 1u]) { break; }
        topScore[pos] = topScore[pos - 1u];
        topIdx[pos] = topIdx[pos - 1u];
        pos -= 1u;
      }
      topScore[pos] = sc;
      topIdx[pos] = li;
    }

    // Smooth 6-point interior complement (paired with diagonal probe pair -> 8-point stratified quad penumbra!)
    var penumbraU = array<f32, 6>(0.76, 0.24, 0.50, 0.14, 0.86, 0.50);
    var penumbraV = array<f32, 6>(0.28, 0.72, 0.16, 0.50, 0.50, 0.84);

    for (var k = 0u; k < 6u; k++) {
      if (topScore[k] < 0.0004) { break; }
      let l = lights[topIdx[k]];
      let lNorm = normalize(cross(l.edgeUPower.xyz, l.edgeVKind.xyz));
      let lCenter = l.originArea.xyz + 0.5 * (l.edgeUPower.xyz + l.edgeVKind.xyz);
      let cDist2 = dot(lCenter - i.worldPos, lCenter - i.worldPos);
      // Smooth physical distance + score roll-off guarantees ZERO circular culling arcs on walls!
      let lFade = smoothstep(324.0, 144.0, cDist2) * smoothstep(0.0004, 0.0035, topScore[k]);
      if (lFade <= 0.0) { continue; }
      let sqrtArea = sqrt(l.originArea.w);

      if (k < 2u && cDist2 < 160.0) {
        // Diagonal probe pair A: (0.24, 0.28) & (0.76, 0.72) — spans both rectangle axes in 2 rays
        let lp0 = l.originArea.xyz + l.edgeUPower.xyz * 0.24 + l.edgeVKind.xyz * 0.28;
        let to0 = lp0 - i.worldPos;
        let d20 = max(dot(to0, to0), 0.01);
        let d0 = sqrt(d20);
        let wi0 = to0 / d0;
        let cL0 = dot(lNorm, -wi0);
        let cS0 = max(dot(N, wi0), 0.0);
        let vis0 = (cL0 > 0.01 && dot(Ngeom, wi0) > 0.0 && cS0 > 0.0)
          && !traceShadowPBR(shadowOrigin, wi0, max(0.02, d0 - 0.05));

        let lp1 = l.originArea.xyz + l.edgeUPower.xyz * 0.76 + l.edgeVKind.xyz * 0.72;
        let to1 = lp1 - i.worldPos;
        let d21 = max(dot(to1, to1), 0.01);
        let d1 = sqrt(d21);
        let wi1 = to1 / d1;
        let cL1 = dot(lNorm, -wi1);
        let cS1 = max(dot(N, wi1), 0.0);
        let vis1 = (cL1 > 0.01 && dot(Ngeom, wi1) > 0.0 && cS1 > 0.0)
          && !traceShadowPBR(shadowOrigin, wi1, max(0.02, d1 - 0.05));

        if (vis0 != vis1) {
          // Penumbra edge (~5% of pixels)! Refine with 6 extra stratified points -> silky 8-point soft shadow!
          let subA = l.originArea.w * 0.125 * lFade;
          if (vis0) {
            let gf = (cL0 * subA) / max(d20, 0.14);
            let fIn = fresnelSchlick(cS0, f0);
            diffuse += kD * (vec3f(1.0) - fIn) * albedo * l.radianceCdf.rgb * (cS0 * gf * INV_PI) * mix(0.68, 1.0, texAO);
            specular += evalGGXSpec(N, V, wi0, clamp(rough + sqrtArea * 0.065 / max(d0, 0.45), 0.055, 0.94), f0) * l.radianceCdf.rgb * (gf * 0.62);
          }
          if (vis1) {
            let gf = (cL1 * subA) / max(d21, 0.14);
            let fIn = fresnelSchlick(cS1, f0);
            diffuse += kD * (vec3f(1.0) - fIn) * albedo * l.radianceCdf.rgb * (cS1 * gf * INV_PI) * mix(0.68, 1.0, texAO);
            specular += evalGGXSpec(N, V, wi1, clamp(rough + sqrtArea * 0.065 / max(d1, 0.45), 0.055, 0.94), f0) * l.radianceCdf.rgb * (gf * 0.62);
          }
          for (var pi = 0u; pi < 6u; pi++) {
            let lp = l.originArea.xyz + l.edgeUPower.xyz * penumbraU[pi] + l.edgeVKind.xyz * penumbraV[pi];
            let toP = lp - i.worldPos;
            let d2P = max(dot(toP, toP), 0.01);
            let dP = sqrt(d2P);
            let wiP = toP / dP;
            let cLP = dot(lNorm, -wiP);
            let cSP = max(dot(N, wiP), 0.0);
            if (cLP > 0.01 && dot(Ngeom, wiP) > 0.0 && cSP > 0.0 && !traceShadowPBR(shadowOrigin, wiP, max(0.02, dP - 0.05))) {
              let gf = (cLP * subA) / max(d2P, 0.14);
              let fIn = fresnelSchlick(cSP, f0);
              diffuse += kD * (vec3f(1.0) - fIn) * albedo * l.radianceCdf.rgb * (cSP * gf * INV_PI) * mix(0.68, 1.0, texAO);
              specular += evalGGXSpec(N, V, wiP, clamp(rough + sqrtArea * 0.065 / max(dP, 0.45), 0.055, 0.94), f0) * l.radianceCdf.rgb * (gf * 0.62);
            }
          }
        } else if (vis0) {
          // Both diagonal points visible (95% of lit pixels): exact 2-point area integration!
          let subA = l.originArea.w * 0.5 * lFade;
          let gf0 = (cL0 * subA) / max(d20, 0.14);
          let fIn0 = fresnelSchlick(cS0, f0);
          diffuse += kD * (vec3f(1.0) - fIn0) * albedo * l.radianceCdf.rgb * (cS0 * gf0 * INV_PI) * mix(0.68, 1.0, texAO);
          specular += evalGGXSpec(N, V, wi0, clamp(rough + sqrtArea * 0.065 / max(d0, 0.45), 0.055, 0.94), f0) * l.radianceCdf.rgb * (gf0 * 0.62);

          let gf1 = (cL1 * subA) / max(d21, 0.14);
          let fIn1 = fresnelSchlick(cS1, f0);
          diffuse += kD * (vec3f(1.0) - fIn1) * albedo * l.radianceCdf.rgb * (cS1 * gf1 * INV_PI) * mix(0.68, 1.0, texAO);
          specular += evalGGXSpec(N, V, wi1, clamp(rough + sqrtArea * 0.065 / max(d1, 0.45), 0.055, 0.94), f0) * l.radianceCdf.rgb * (gf1 * 0.62);
        }
      } else {
        // Secondary lights (ranks 2..5 or distant): single center shadow ray with smooth fade
        let toP = lCenter - i.worldPos;
        let dist2 = max(dot(toP, toP), 0.01);
        let dist = sqrt(dist2);
        let wi = toP / dist;
        let cosL = dot(lNorm, -wi);
        let cosS = max(dot(N, wi), 0.0);
        if (cosL > 0.01 && dot(Ngeom, wi) > 0.0 && cosS > 0.0 && !traceShadowPBR(shadowOrigin, wi, max(0.02, dist - 0.05))) {
          let gf = (cosL * l.originArea.w * lFade) / max(dist2, 0.14);
          let fIn = fresnelSchlick(cosS, f0);
          diffuse += kD * (vec3f(1.0) - fIn) * albedo * l.radianceCdf.rgb * (cosS * gf * INV_PI) * mix(0.68, 1.0, texAO);
          specular += evalGGXSpec(N, V, wi, clamp(rough + sqrtArea * 0.065 / max(dist, 0.45), 0.055, 0.94), f0) * l.radianceCdf.rgb * (gf * 0.62);
        }
      }
    }
  } else {
    let Rvec = reflect(-V, N);
    for (var li = 0u; li < lightCount; li++) {
      let l = lights[li];
      // Skip virtual sky/bounce portals (kind == 1): their reflections belong to full-scene BVH SSR
      // and baked directional GI, not single-ray-shadowed MRP lamp cutouts!
      if (l.edgeVKind.w > 0.5) { continue; }
      let lCenter = l.originArea.xyz + 0.5 * (l.edgeUPower.xyz + l.edgeVKind.xyz);
      let toC = lCenter - i.worldPos;
      let cDist2 = dot(toC, toC);
      if (cDist2 > 196.0 || cDist2 < 0.04) { continue; }
      let lNorm = normalize(cross(l.edgeUPower.xyz, l.edgeVKind.xyz));
      if (dot(lNorm, -toC) <= 0.01) { continue; }

      // Most Representative Point (MRP): intersect reflection ray with panel plane & clamp onto [0..1]^2!
      let denom = dot(Rvec, lNorm);
      var mrp = lCenter;
      if (abs(denom) > 1e-4) {
        let tPlane = dot(l.originArea.xyz - i.worldPos, lNorm) / denom;
        if (tPlane > 0.01) {
          let hitP = i.worldPos + Rvec * min(tPlane, 24.0) - l.originArea.xyz;
          let lenU2 = max(dot(l.edgeUPower.xyz, l.edgeUPower.xyz), 1e-4);
          let lenV2 = max(dot(l.edgeVKind.xyz, l.edgeVKind.xyz), 1e-4);
          let uCl = clamp(dot(hitP, l.edgeUPower.xyz) / lenU2, 0.0, 1.0);
          let vCl = clamp(dot(hitP, l.edgeVKind.xyz) / lenV2, 0.0, 1.0);
          mrp = l.originArea.xyz + l.edgeUPower.xyz * uCl + l.edgeVKind.xyz * vCl;
        }
      }
      let toL = mrp - i.worldPos;
      let dist2 = max(dot(toL, toL), 0.04);
      let dist = sqrt(dist2);
      let dirL = toL / dist;
      let cosL = dot(lNorm, -dirL);
      if (cosL <= 0.02 || dot(Ngeom, dirL) <= 0.0 || dot(N, dirL) <= 0.0) { continue; }
      let atten = (cosL * l.originArea.w) / max(dist2, 0.25);
      let areaSpecRough = clamp(rough + sqrt(l.originArea.w) * 0.075 / max(dist, 0.45), 0.065, 0.92);
      let cand = evalGGXSpec(N, V, dirL, areaSpecRough, f0) * l.radianceCdf.rgb * atten * 0.52;
      if (dot(cand, vec3f(0.2126, 0.7152, 0.0722)) < 0.016) { continue; }
      if (!traceShadowPBR(shadowOrigin, dirL, max(0.02, dist - 0.06))) {
        specular += cand;
      }
    }
  }

  // Subtle fallback ambient specular only for matte/non-SSR surfaces (reflective ones get true BVH GGX!).
  let isReflCandidate = max(metallic, coat) > 0.12 && rough <= 0.52;
  let envSpec = select(Fv * irrad * 0.12 * ao * (1.0 - rough * 0.65), vec3f(0.0), isReflCandidate);

  // Emissive contribution (with optional fluorescent ballast flicker).
  let flk = fluorescentFlicker(frame.cameraPos.w, m.extra.z, m.extra.w);
  let emissive = m.emissive.rgb * m.emissive.w * emissiveMask * flk;

  var color = diffuse + specular + envSpec + emissive;

  let dbg = u32(frame.waterInfo.z + 0.5);
  if (dbg == 1u) {
    color = irrad * ao;
  } else if (dbg == 2u) {
    color = albedo;
  } else if (dbg == 3u) {
    color = N * 0.5 + 0.5;
  } else if (dbg == 4u) {
    color = vec3f(rough, bakedAO, coat);
  }

  // Encode reflection tint (white for dielectric glaze, albedo for stainless steel/metal)
  // and reflection mask for the Half-Res BVH GGX Reflection pass.
  let reflTint = mix(vec3f(1.0), albedo, metallic);
  let reflStrength = clamp(max(metallic, coat * (1.0 - cer.inGrout)), 0.0, 1.0);

  var o: GBufferOut;
  o.hdrColor = vec4f(color, 1.0);
  o.gNormalRough = vec4f(N, rough);
  o.gAlbedoMetal = vec4f(reflTint, reflStrength * select(1.0, 0.0, dbg != 0u));
  o.sunDirect = select(vec4f(sunDirectRGB, sunVis), vec4f(0.0), dbg != 0u);
  return o;
}
