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
  let metallic = mt.r;
  var coat = mt.g;
  let emissiveMask = mt.b;

  var nXY = nh.rg * 2.0 - 1.0;

  // Flat architectural glazed porcelain evaluation with 4-tap footprint slope-moment roughness compensation.
  let hasWater = frame.waterInfo.y > 0.5;
  let cer = evalAnalyticCeramicFull(i.uv, m, ar.rgb, ar.a, fwUV2, i.worldPos.y, frame.waterInfo.x, hasWater);
  if (cer.isCeramic) {
    albedo = cer.albedo;
    rough = cer.rough;
    coat = cer.coat;
    texAO *= cer.ao;
    // Use pure world-metric ceramic slope (flat face + tiny tilt + delicate glaze waviness),
    // never superimposing coarse 256px baked texture bump!
    nXY = cer.slope;
  } else if (preset == 4u) {
    // Level 0 vintage wallpaper: subtle 0.60 m roll seams + organic plaster-backing aging + floor-level dust/damp
    let rollSeam = filteredGridCoverage(vec2f(i.uv.x / 0.60, 0.25), vec2f(fwUV2.x / 0.60, 0.001), 0.0042);
    let worldAge = vFbm2(vec2f(i.worldPos.x + i.worldPos.z, i.worldPos.y * 1.15) * 0.36);
    let dampRise = smoothstep(0.55, 0.06, i.worldPos.y) * smoothstep(0.42, 0.76, vFbm2(vec2f(i.worldPos.x + i.worldPos.z, 1.7) * 0.65));
    albedo *= (0.94 + 0.11 * worldAge) * (1.0 - rollSeam * 0.11) * (1.0 - dampRise * 0.18);
    rough = clamp(rough - dampRise * 0.12, 0.50, 0.95);
    texAO *= 1.0 - rollSeam * 0.16;
  } else if (preset == 5u) {
    // Level 0 commercial broadloom carpet: non-repeating organic traffic paths & subtle damp patches (matte, zero plastic!)
    let macroWear = vFbm2(i.worldPos.xz * 0.24 + vec2f(3.1, 7.4));
    let traffic = vFbm2(i.worldPos.xz * 0.55 + vec2f(-8.2, 4.1));
    let dampPatch = smoothstep(0.54, 0.80, vFbm2(i.worldPos.xz * 0.32 + vec2f(19.2, -5.8)));
    albedo *= (0.86 + 0.22 * macroWear) * (0.92 + 0.14 * traffic) * (1.0 - dampPatch * 0.22);
    rough = clamp(rough - dampPatch * 0.10, 0.78, 0.99);
    coat = 0.0;
  } else if (preset == 6u) {
    // Level 0 bright ivory commercial suspended drop ceiling: exact 1.20 x 0.60 m thin enameled T-bar grid
    let g = vec2f(i.uv.x / 1.20, i.uv.y / 0.60);
    let fwG = vec2f(fwUV2.x / 1.20, fwUV2.y / 0.60);
    let barX = filteredGridCoverage(vec2f(g.x, 0.25), vec2f(fwG.x, 0.001), 0.022 / 1.20);
    let barY = filteredGridCoverage(vec2f(0.25, g.y), vec2f(0.001, fwG.y), 0.022 / 0.60);
    let tBar = clamp(barX + barY - barX * barY, 0.0, 1.0);
    let shadowLip = clamp(
      filteredGridCoverage(vec2f(g.x, 0.25), vec2f(fwG.x, 0.001), 0.038 / 1.20)
      + filteredGridCoverage(vec2f(0.25, g.y), vec2f(0.001, fwG.y), 0.038 / 0.60),
      0.0, 1.0,
    ) * (1.0 - tBar);
    let cellId = vHash2(floor(g) + vec2f(7.3, 19.1));
    let waterRing = smoothstep(0.66, 0.86, vFbm2(i.worldPos.xz * 0.38 + vec2f(5.4, 2.8)));
    var tileCol = albedo * (0.96 + 0.07 * cellId);
    tileCol = mix(tileCol, tileCol * vec3f(0.84, 0.78, 0.58), waterRing * 0.42);
    tileCol *= 1.0 - shadowLip * 0.22;
    let barCol = vec3f(0.88, 0.87, 0.82);
    albedo = mix(tileCol, barCol, tBar);
    rough = mix(rough, 0.30, tBar);
    coat = mix(0.0, 0.18, tBar);
    texAO = mix(texAO * (1.0 - shadowLip * 0.30), 1.0, tBar);
    nXY *= 1.0 - tBar * 0.92;
  } else if (preset == 8u || preset == 10u) {
    // Level 1 authentic poured concrete & chalky painted concrete columns (matches real parking garage photography!):
    // Horizontal formwork lift lines (0.80 m pours), floor splash grime, rain seepage & non-repeating tonal weathering.
    let liftSeam = filteredGridCoverage(vec2f(0.25, i.worldPos.y / 0.80), vec2f(0.001, fwUV2.y / 0.80), 0.006 / 0.80);
    let vertJoint = filteredGridCoverage(vec2f(i.uv.x / 2.40, 0.25), vec2f(fwUV2.x / 2.40, 0.001), 0.007 / 2.40);
    let seam = clamp(liftSeam * 0.65 + vertJoint * 0.85, 0.0, 1.0);
    let worldMottle = vFbm2(vec2f(i.worldPos.x + i.worldPos.z, i.worldPos.y * 0.9) * 0.36);
    let streak = smoothstep(0.56, 0.82, vFbm2(vec2f((i.worldPos.x + i.worldPos.z) * 1.6, i.worldPos.y * 0.24))) * smoothstep(1.0, 3.0, i.worldPos.y);
    let baseGrime = smoothstep(0.45, 0.02, i.worldPos.y) * (0.55 + 0.45 * vFbm2(vec2f(i.worldPos.x + i.worldPos.z, 2.3) * 0.75));
    let dampTotal = clamp((baseGrime * 0.75 + streak * 0.50) * max(m.extra.y, 0.18), 0.0, 1.0);
    albedo *= 0.85 + 0.26 * worldMottle;
    albedo = mix(albedo, albedo * 0.56, seam * 0.68);
    albedo = mix(albedo, albedo * vec3f(0.54, 0.52, 0.47), baseGrime * 0.58);
    albedo = mix(albedo, albedo * vec3f(0.68, 0.70, 0.67), streak * 0.36);
    rough = clamp(rough - dampTotal * 0.26, 0.36, 0.97);
    coat = max(coat, dampTotal * 0.18);
    texAO *= (1.0 - seam * 0.36) * (1.0 - baseGrime * 0.28);
  } else if (preset == 9u) {
    // Level 1 gritty dirty concrete parking deck (matched directly to real underground parking photography!):
    // - Rough matte oil-stained dry concrete (rough 0.80-0.94, ZERO cheap smooth grey plastic!)
    // - Fine organic hairline slab cracks + 2.40 m saw-cut joints
    // - Weathered, tire-worn yellow painted parking lane stripes (flaking naturally & darkening under water!)
    // - Sharp-edged dark mirror-glossy standing rainwater puddles reflecting overhead tubes & white columns!
    let pXZ = i.worldPos.xz;
    let sawJoint = filteredGridCoverage(pXZ / 2.40, fwUV2 / 2.40, 0.008 / 2.40);
    let macroSlab = vFbm2(pXZ * 0.22 + vec2f(4.2, 9.1));
    let oilPatch = smoothstep(0.56, 0.82, vFbm2(pXZ * 0.46 + vec2f(-9.3, 4.7)));
    let tireWear = vFbm2(vec2f(pXZ.x * 1.4, pXZ.y * 0.16) + vec2f(2.1, -3.4));
    // Sparse realistic linear jagged concrete slab stress fractures (matching real warehouse/basement slabs!)
    let cWarp1 = (vFbm2(vec2f(pXZ.y * 0.65, 3.7)) - 0.5) * 0.85 + (vFbm2(vec2f(pXZ.y * 3.1, 11.2)) - 0.5) * 0.16;
    let cLine1 = abs((pXZ.x + 1.85) + cWarp1);
    let cMask1 = smoothstep(2.0, 5.5, pXZ.y) * smoothstep(12.0, 9.0, pXZ.y);
    let cWarp2 = (vFbm2(vec2f(pXZ.y * 0.72, 19.4)) - 0.5) * 0.65 + (vFbm2(vec2f(pXZ.y * 3.6, 5.1)) - 0.5) * 0.12;
    let cLine2 = abs((pXZ.x + 6.95) + cWarp2);
    let cMask2 = smoothstep(-19.5, -17.5, pXZ.y) * smoothstep(-10.5, -12.5, pXZ.y);
    let crackW = 0.0045 + max(fwUV2.x, fwUV2.y) * 0.35;
    let crack = max(
      (1.0 - smoothstep(0.001, crackW, cLine1)) * cMask1,
      (1.0 - smoothstep(0.001, crackW, cLine2)) * cMask2,
    );

    // Distressed weathered traffic-yellow painted parking lane lines (zero Z-fighting!)
    let inDeck = step(-9.4, pXZ.y) * step(pXZ.y, 12.2);
    // Double edge drive-aisle lines along x = +-3.65 m + horizontal parking stall dividers along z = 7.2, 2.4, -2.4, -7.2
    let laneL = 1.0 - smoothstep(0.045, 0.068, abs(abs(pXZ.x) - 3.65));
    let laneInner = 1.0 - smoothstep(0.032, 0.052, abs(abs(pXZ.x) - 3.40));
    let stallZ = abs(fract((pXZ.y + 0.0) / 4.80 + 0.5) - 0.5) * 4.80;
    let stallBand = (1.0 - smoothstep(0.045, 0.068, stallZ)) * step(4.0, abs(pXZ.x)) * step(abs(pXZ.x), 10.8);
    let paintWear = smoothstep(0.30, 0.66, vFbm2(pXZ * 2.6 + vec2f(7.1, -2.3)));
    let yellowStripe = clamp(max(max(laneL, laneInner * 0.85), stallBand), 0.0, 1.0) * inDeck * (0.45 + 0.55 * paintWear);

    // Sharp-edged dark mirror rainwater puddles collected naturally in slab depressions
    let pLow = vFbm2(pXZ * 0.24 + vec2f(-5.8, 12.1));
    let pMed = vFbm2(pXZ * 0.68 + vec2f(11.3, -4.2));
    let aislePool = 0.09 * exp(-pow((pXZ.x + 1.1) / 2.8, 2.0)) * exp(-pow((pXZ.y - 3.2) / 5.5, 2.0))
                  + 0.08 * exp(-pow((pXZ.x - 0.8) / 2.6, 2.0)) * exp(-pow((pXZ.y + 4.5) / 4.8, 2.0))
                  + 0.07 * exp(-pow((pXZ.x + 2.4) / 3.2, 2.0)) * exp(-pow((pXZ.y + 14.5) / 3.8, 2.0));
    let puddleField = pLow * 0.70 + pMed * 0.30 + aislePool;
    let wetLvl = clamp(m.extra.y, 0.0, 1.0);
    let thresh = 0.61 - wetLvl * 0.09;
    // Crisp physical puddle shoreline (narrow 0.024 transition) surrounded by dark damp concrete soak rim!
    let dampMargin = smoothstep(thresh - 0.095, thresh + 0.005, puddleField) * smoothstep(0.05, 0.30, wetLvl);
    let puddle = smoothstep(thresh, thresh + 0.024, puddleField) * smoothstep(0.15, 0.45, wetLvl);

    albedo *= (0.76 + 0.36 * macroSlab) * (0.86 + 0.24 * tireWear);
    albedo = mix(albedo, albedo * vec3f(0.46, 0.44, 0.40), oilPatch * 0.65);
    albedo = mix(albedo, vec3f(0.68, 0.54, 0.14) * (0.82 + 0.25 * macroSlab), yellowStripe * 0.82);
    albedo = mix(albedo, albedo * 0.34, max(sawJoint * 0.85, crack * 0.75));
    albedo = mix(albedo, albedo * vec3f(0.55, 0.54, 0.51), dampMargin * 0.60);
    // Deep mirror puddle darkens porous concrete cleanly like real standing rainwater on grey asphalt/concrete
    albedo = mix(albedo, albedo * vec3f(0.32, 0.33, 0.33), puddle * 0.88);

    // Dry concrete stays authentically gritty/matte (0.82-0.94); puddles drop sharply to mirror-flat 0.036!
    let dryR = clamp(rough + (1.0 - oilPatch * 0.14) * 0.06, 0.76, 0.96);
    rough = mix(mix(dryR, 0.34, dampMargin), 0.036, puddle);
    coat = mix(mix(0.02, 0.32, dampMargin), 1.0, puddle);
    nXY *= 1.0 - puddle * 0.98;
    texAO *= (1.0 - sawJoint * 0.55) * (1.0 - crack * 0.45);
  } else if (preset == 19u) {
    // Rural aged mud-plaster wall: smooth upper plaster, damp lower flaking stucco, ceiling soot, and optional vertical edge fissure.
    let wUV = select(i.worldPos.xy, i.worldPos.zy, abs(Ngeom.x) > 0.7);
    let broad = vFbm2(wUV * 0.92 + vec2f(2.3, 1.1));
    let stain = vFbm2(vec2f(wUV.x * 2.2, wUV.y * 0.60) + vec2f(8.1, 4.7));
    let fine = vFbm2(wUV * 11.5 - vec2f(3.7, 6.2));
    albedo *= (0.76 + 0.42 * broad) * (1.0 - smoothstep(0.52, 0.82, stain) * 0.34);

    let dampAmt = clamp(m.extra.y, 0.0, 1.0);
    let lowMask = (1.0 - smoothstep(0.04, 0.54, i.worldPos.y + (broad - 0.5) * 0.16)) * dampAmt;
    var peel = 0.0;
    var peelSlope = vec2f(0.0);
    if (lowMask > 0.005) {
      let peelField = vFbm2(wUV * 6.8 + vec2f(11.4, 2.8)) + 0.32 * vFbm2(wUV * 22.0);
      peel = smoothstep(0.47, 0.60, peelField) * lowMask;
      let peelEdge = smoothstep(0.41, 0.49, peelField) * (1.0 - smoothstep(0.55, 0.65, peelField)) * lowMask;
      let underCol = albedo * 0.48 * (0.72 + 0.52 * fine);
      albedo = mix(albedo, underCol, peel * 0.82);
      albedo = mix(albedo, albedo * 1.42 + vec3f(0.04, 0.03, 0.02), peelEdge * 0.45);
      let e = 0.012;
      let px = wUV + vec2f(e, 0.0);
      let py = wUV + vec2f(0.0, e);
      let peelX = smoothstep(0.47, 0.60, vFbm2(px * 6.8 + vec2f(11.4, 2.8)) + 0.32 * vFbm2(px * 22.0)) * lowMask;
      let peelY = smoothstep(0.47, 0.60, vFbm2(py * 6.8 + vec2f(11.4, 2.8)) + 0.32 * vFbm2(py * 22.0)) * lowMask;
      peelSlope = vec2f((peel - peelX) / e, (peel - peelY) / e) * 0.018;
    }

    // Optional weathered vertical plaster fissure (activated when seed > 100 encodes local U position + 200).
    var crackBump = 0.0;
    if (m.extra.z > 100.0) {
      let uCrack = m.extra.z - 200.0;
      let edgeCrack = exp(-abs(i.uv.x - uCrack) / 0.085)
        * smoothstep(0.35, 0.72, i.worldPos.y)
        * smoothstep(2.45, 1.85, i.worldPos.y);
      if (edgeCrack > 0.01) {
        let crackTex = smoothstep(0.24, 0.66, vFbm2(wUV * 12.0 + vec2f(0.0, 3.5)));
        crackBump = edgeCrack * crackTex;
        albedo *= 1.0 - crackBump * 0.62;
      }
    }

    // Subtle upper ceiling soot patina.
    let ceilSoot = smoothstep(1.90, 2.90, i.worldPos.y) * 0.68 * max(dampAmt, 0.5);
    albedo *= 1.0 - ceilSoot;

    nXY = clamp(nXY * 0.42 + peelSlope + vec2f(crackBump * 0.46, 0.0), vec2f(-0.78), vec2f(0.78));
    rough = clamp(mix(rough, 0.96, peel), 0.78, 0.98);
    texAO *= (1.0 - peel * 0.24) * (1.0 - crackBump * 0.45);
  } else if (preset == 20u) {
    // Dark gritty damp stone floor: broken rough-grit specular sparkles across dark damp stone (zero smooth plastic stripe!).
    let pXZ = i.worldPos.xz;
    let broad = vFbm2(pXZ * 1.25 + vec2f(4.2, 9.1));
    let grit = vFbm2(pXZ * 10.5 - vec2f(1.9, 5.3));
    let micro = vFbm2(pXZ * 34.0 + vec2f(6.7, 2.4));
    let wetLvl = clamp(m.extra.y, 0.0, 1.0);
    let wetRaw = vFbm2(pXZ * 2.15 + vec2f(7.3, -2.4)) + 0.34 * vFbm2(pXZ * 7.8);
    let wet = smoothstep(0.44 - wetLvl * 0.05, 0.72 - wetLvl * 0.03, wetRaw) * wetLvl;
    let ash = smoothstep(0.60, 0.85, micro) * (0.45 + 0.55 * broad);

    albedo *= (0.72 + 0.56 * (broad * 0.55 + grit * 0.45));
    albedo = mix(albedo, albedo * vec3f(0.50, 0.50, 0.50), wet * 0.72);
    albedo = mix(albedo, vec3f(0.14, 0.11, 0.082), ash * 0.36 * (1.0 - wet * 0.45));

    // Strong gritty micro-stone normal breakup so candlelight breaks into authentic sparkling grit!
    let e = 0.008;
    let amp = mix(0.024, 0.011, wet);
    let h0 = vFbm2(pXZ * 20.0 + vec2f(2.1, 7.3)) * amp + vFbm2(pXZ * 52.0) * amp * 0.45;
    let hx = vFbm2((pXZ + vec2f(e, 0.0)) * 20.0 + vec2f(2.1, 7.3)) * amp + vFbm2((pXZ + vec2f(e, 0.0)) * 52.0) * amp * 0.45;
    let hy = vFbm2((pXZ + vec2f(0.0, e)) * 20.0 + vec2f(2.1, 7.3)) * amp + vFbm2((pXZ + vec2f(0.0, e)) * 52.0) * amp * 0.45;
    nXY = clamp(nXY * mix(0.62, 0.32, wet) + vec2f((h0 - hx) / e, (h0 - hy) / e) * 0.34, vec2f(-0.72), vec2f(0.72));
    rough = clamp(mix(0.60 + grit * 0.16, 0.16 + grit * 0.10, wet), 0.14, 0.92);
    coat = mix(0.14, 0.82, wet);
  } else if (preset == 21u) {
    // Aged dark Chinese timber planks: dry pale ash weathering on lower/mid boards, deep soot near top.
    let wUV = select(i.worldPos.xy, i.worldPos.zy, abs(Ngeom.x) > 0.7);
    let wear = vFbm2(wUV * 3.6 + vec2f(9.1, 2.3));
    let lowWear = smoothstep(0.40, 0.74, wear) * (1.0 - smoothstep(1.25, 2.05, i.worldPos.y));
    albedo = mix(albedo, vec3f(0.21, 0.205, 0.195), lowWear * 0.54);
    albedo *= 1.0 - smoothstep(1.30, 2.18, i.worldPos.y) * 0.74;
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
    rough = mix(rough, min(rough, 0.075), wetZone * 0.60 * (1.0 - cer.inGrout * 0.8));
    coat = mix(coat, max(coat, 0.94), wetZone * 0.55 * (1.0 - cer.inGrout * 0.8));
  }

  // Sample baked Directional Indirect GI + Area-Light Lightmap.
  let lmI = textureSample(lmIrradTex, lmSampler, i.uv2);
  let lmD = textureSample(lmDirTex, lmSampler, i.uv2);
  let irrad = lmI.rgb + vec3f(frame.fogParams.w);
  let bakedAO = clamp(lmD.a, 0.0, 1.0);
  let ao = mix(0.28, 1.0, bakedAO) * mix(0.55, 1.0, texAO);

  // Directional normal modulation from lightmap dominant incoming light vector.
  let irradLuma = max(0.002, dot(irrad, vec3f(0.2126, 0.7152, 0.0722)));
  let dirLen = length(lmD.rgb);
  let dirStrength = clamp(dirLen / irradLuma, 0.0, 1.0);
  let domDir = select(Ngeom, lmD.rgb / max(dirLen, 1e-4), dirLen > 1e-4);
  let ndlBump = max(dot(N, domDir), 0.0);
  let ndlGeom = max(dot(Ngeom, domDir), 0.25);
  let dirRatio = clamp(ndlBump / ndlGeom, 0.35, 1.55);
  let directionalFactor = mix(1.0, dirRatio, dirStrength * 0.72);

  let ndv = max(dot(N, V), 0.001);
  // Physical Fresnel F0: glazed porcelain ~0.046 (v1 coat=0.047), matte mortar/plaster ~0.014, metals use albedo.
  let dielecF0 = mix(0.012, 0.047, clamp(coat, 0.0, 1.0));
  let f0 = mix(vec3f(dielecF0), albedo, metallic);
  let Fv = fresnelSchlick(ndv, f0);
  let kD = (vec3f(1.0) - Fv) * (1.0 - metallic);

  // 1. Indirect GI + Baked Area Lights Diffuse & Energy-Conserving Dominant Specular
  var diffuse = kD * albedo * irrad * directionalFactor * ao;
  let specRough = clamp(mix(rough, max(rough, 0.24), 1.0 - dirStrength * 0.65), 0.06, 0.96);
  var specular = evalGGXSpec(N, V, domDir, specRough, f0) * irrad * dirStrength * ao * 0.75;

  // 2. Per-Pixel Direct Sunlight (1-ray deterministic center visibility -> edge-only 8-tap penumbra in compositeSSR)
  var sunDirectRGB = vec3f(0.0);
  var sunVis = 0.0;
  if (frame.sunColorInt.w > 0.5) {
    let sunDir = frame.sunDirRad.xyz;
    let ndlSun = max(dot(N, sunDir), 0.0);
    if (ndlSun > 0.0 && dot(Ngeom, sunDir) > 0.0) {
      let sunRad = frame.sunColorInt.rgb;
      let fIn = fresnelSchlick(ndlSun, f0);
      let sunDiff = kD * (vec3f(1.0) - fIn) * albedo * sunRad * ndlSun * INV_PI * mix(0.74, 1.0, texAO);
      let sunSpec = evalGGXSpec(N, V, sunDir, max(rough, 0.065), f0) * sunRad;
      sunDirectRGB = sunDiff + sunSpec;
      sunVis = evalSunVisibility1(i.worldPos, Ngeom);
    }
  }

  // 3. Per-Pixel Rectangular Area-Light & Omnidirectional Point-Light Illumination with Adaptive Soft Shadows
  //    - On indoor artificial-light levels (sun disabled: Level 0, Level 1, Chinese Horror): ranks all facing lights
  //      by unshadowed direct energy (zero rays), then evaluates the top 6 lights per pixel. The top 2
  //      dominant fixtures trace 2 opposite taps and adaptively refine to 8 stratified taps ONLY on true penumbra edges.
  //    - On sunlit levels (Poolrooms): evaluates early-culled BVH-shadowed area-light GGX specular.
  let lightCount = min(u32(frame.skyHorizon.w + 0.5), 32u);
  let shadowOrigin = i.worldPos + Ngeom * 0.014;
  let ptShadowOrigin = i.worldPos + Ngeom * 0.006;
  let indoorDirect = frame.sunColorInt.w < 0.5;

  if (indoorDirect) {
    var topIdx = array<u32, 6>(0u, 0u, 0u, 0u, 0u, 0u);
    var topScore = array<f32, 6>(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);

    // Zero-ray ranking pass: select up to 6 strongest facing area/point lights at this surface point.
    for (var li = 0u; li < lightCount; li++) {
      let l = lights[li];
      let isPoint = l.edgeVKind.w > 1.5;
      let lCenter = select(l.originArea.xyz + 0.5 * (l.edgeUPower.xyz + l.edgeVKind.xyz), l.originArea.xyz, isPoint);
      let toC = lCenter - i.worldPos;
      let cDist2 = dot(toC, toC);
      if (cDist2 > 324.0 || cDist2 < select(0.01, 0.0004, isPoint)) { continue; }
      var cL = 1.0;
      if (!isPoint) {
        let lNorm = normalize(cross(l.edgeUPower.xyz, l.edgeVKind.xyz));
        let halfSpan = 0.5 * (length(l.edgeUPower.xyz) + length(l.edgeVKind.xyz));
        if (dot(lNorm, -toC) <= -0.02 || dot(Ngeom, toC) + halfSpan <= 0.0) { continue; }
        let invD = inverseSqrt(max(cDist2, 0.25));
        cL = max(dot(lNorm, -(toC * invD)), 0.10);
      } else {
        if (dot(Ngeom, toC) + l.originArea.w <= 0.0) { continue; }
      }
      let invD = inverseSqrt(max(cDist2, select(0.25, 0.01, isPoint)));
      let dirC = toC * invD;
      let cS = max(dot(Ngeom, dirC), 0.10);
      let sc = (l.edgeUPower.w * cL * cS) / max(cDist2, select(0.25, 0.015, isPoint));
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

    // Smooth 6-point interior complement (paired with diagonal probe pair -> 8-point stratified penumbra!)
    var penumbraU = array<f32, 6>(0.76, 0.24, 0.50, 0.14, 0.86, 0.50);
    var penumbraV = array<f32, 6>(0.28, 0.72, 0.16, 0.50, 0.50, 0.84);
    var diskOffX = array<f32, 6>(0.866, -0.866, 0.0, 0.5, -0.5, 0.0);
    var diskOffY = array<f32, 6>(0.5, 0.5, 1.0, -0.866, -0.866, 0.0);

    for (var k = 0u; k < 6u; k++) {
      if (topScore[k] < 0.0004) { break; }
      let l = lights[topIdx[k]];
      let isPoint = l.edgeVKind.w > 1.5;
      let lCenter = select(l.originArea.xyz + 0.5 * (l.edgeUPower.xyz + l.edgeVKind.xyz), l.originArea.xyz, isPoint);
      let cDist2 = dot(lCenter - i.worldPos, lCenter - i.worldPos);
      let lFade = smoothstep(324.0, 144.0, cDist2) * smoothstep(0.0004, 0.0035, topScore[k]);
      if (lFade <= 0.0) { continue; }

      if (isPoint) {
        // Omnidirectional spherical candle/ember point light with smooth organic flicker & adaptive disk penumbra.
        let radius = max(l.originArea.w, 0.006);
        let shadowOff = max(l.edgeUPower.x, radius * 1.6);
        let flAmp = l.edgeUPower.y;
        let flFreq = l.edgeUPower.z;
        let flPh = l.edgeVKind.x;
        let tNow = frame.cameraPos.w;
        let flMul = 1.0 + flAmp * (
          0.58 * sin(tNow * flFreq + flPh) +
          0.28 * sin(tNow * flFreq * 2.17 + flPh * 1.7) +
          0.14 * cos(tNow * flFreq * 4.09 + flPh * 0.6)
        );
        let lightCol = l.radianceCdf.rgb * flMul;
        let toC = lCenter - i.worldPos;
        let dist2 = max(dot(toC, toC), 0.002);
        let dist = sqrt(dist2);
        let wiC = toC / dist;
        let cosS = max(dot(N, wiC), 0.0);
        if (cosS <= 0.0 && dot(Ngeom, wiC) <= 0.0) { continue; }

        var vis = 0.0;
        if (k < 2u && dist < 8.0) {
          let basis = orthoBasis(wiC);
          let p0 = lCenter + basis[0] * radius;
          let p1 = lCenter - basis[0] * radius;
          let d0 = length(p0 - i.worldPos);
          let w0 = (p0 - i.worldPos) / max(d0, 1e-4);
          let d1 = length(p1 - i.worldPos);
          let w1 = (p1 - i.worldPos) / max(d1, 1e-4);
          let vis0 = (dot(Ngeom, w0) > 0.0) && !traceShadowPBR(ptShadowOrigin, w0, max(0.01, d0 - shadowOff));
          let vis1 = (dot(Ngeom, w1) > 0.0) && !traceShadowPBR(ptShadowOrigin, w1, max(0.01, d1 - shadowOff));
          if (vis0 != vis1) {
            var hits = select(0.0, 1.0, vis0) + select(0.0, 1.0, vis1);
            for (var pi = 0u; pi < 6u; pi++) {
              let lp = lCenter + (basis[0] * diskOffX[pi] + basis[1] * diskOffY[pi]) * radius;
              let toP = lp - i.worldPos;
              let dP = length(toP);
              let wiP = toP / max(dP, 1e-4);
              if (dot(Ngeom, wiP) > 0.0 && !traceShadowPBR(ptShadowOrigin, wiP, max(0.01, dP - shadowOff))) {
                hits += 1.0;
              }
            }
            vis = hits * 0.125;
          } else if (vis0) {
            vis = 1.0;
          }
        } else {
          if (dot(Ngeom, wiC) > 0.0 && !traceShadowPBR(ptShadowOrigin, wiC, max(0.01, dist - shadowOff))) {
            vis = 1.0;
          }
        }

        if (vis > 0.0 && cosS > 0.0) {
          let atten = (vis * lFade) / max(dist2, 0.008);
          let fIn = fresnelSchlick(cosS, f0);
          diffuse += kD * (vec3f(1.0) - fIn) * albedo * lightCol * (cosS * atten * INV_PI) * mix(0.72, 1.0, texAO);
          let ptSpecR = clamp(rough + radius * 0.55 / max(dist, 0.12), 0.045, 0.94);
          specular += evalGGXSpec(N, V, wiC, ptSpecR, f0) * lightCol * (atten * 0.85);
        }
        continue;
      }

      let lNorm = normalize(cross(l.edgeUPower.xyz, l.edgeVKind.xyz));
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
    for (var li = 0u; li < lightCount; li++) {
      let l = lights[li];
      let lCenter = l.originArea.xyz + 0.5 * (l.edgeUPower.xyz + l.edgeVKind.xyz);
      let toL = lCenter - i.worldPos;
      let dist2 = dot(toL, toL);
      if (dist2 > 220.0 || dist2 < 0.04) { continue; }
      let lNorm = normalize(cross(l.edgeUPower.xyz, l.edgeVKind.xyz));
      let dist = sqrt(dist2);
      let dirL = toL / dist;
      let cosL = dot(lNorm, -dirL);
      if (cosL <= 0.02 || dot(Ngeom, dirL) <= 0.0 || dot(N, dirL) <= 0.0) { continue; }
      let atten = (cosL * l.originArea.w) / max(dist2, 0.35);
      let areaSpecRough = clamp(rough + sqrt(l.originArea.w) * 0.075 / max(dist, 0.5), 0.065, 0.92);
      let cand = evalGGXSpec(N, V, dirL, areaSpecRough, f0) * l.radianceCdf.rgb * atten * 0.45;
      if (dot(cand, vec3f(0.2126, 0.7152, 0.0722)) < 0.028) { continue; }
      if (!traceShadowPBR(shadowOrigin, dirL, max(0.02, dist - 0.08))) {
        specular += cand;
      }
    }
  }

  // Subtle fallback ambient specular only for matte/non-SSR surfaces (reflective ones get true BVH GGX!).
  let isReflCandidate = max(metallic, coat) > 0.12 && rough <= 0.52;
  let envSpec = select(Fv * irrad * 0.12 * ao * (1.0 - rough * 0.65), vec3f(0.0), isReflCandidate);

  // Emissive contribution (smooth organic flame/wax glow for presets 23-24; ballast flicker for fluorescent).
  var emissive = vec3f(0.0);
  if (preset == 23u) {
    // Subsurface glow inside translucent paraffin wax right under the wick.
    let fl = 1.0 + 0.055 * (0.58 * sin(frame.cameraPos.w * 7.3 + 0.4) + 0.28 * sin(frame.cameraPos.w * 15.84 + 0.69) + 0.14 * cos(frame.cameraPos.w * 29.85 + 0.24));
    let glow = smoothstep(0.04, 0.155, i.worldPos.y);
    emissive = m.emissive.rgb * m.emissive.w * (glow * glow) * fl;
  } else if (preset == 24u) {
    let fl = 1.0 + m.extra.w * (0.58 * sin(frame.cameraPos.w * 7.3 + m.extra.z) + 0.28 * sin(frame.cameraPos.w * 15.84 + m.extra.z * 1.7) + 0.14 * cos(frame.cameraPos.w * 29.85 + m.extra.z * 0.6));
    let tFlame = clamp((i.worldPos.y - 0.158) / 0.058, 0.0, 1.0);
    let coreBoost = 1.0 + 0.45 * exp(-pow((tFlame - 0.30) / 0.24, 2.0));
    let tipTint = mix(vec3f(1.25, 1.05, 0.85), vec3f(0.95, 0.42, 0.16), pow(tFlame, 0.85));
    emissive = m.emissive.rgb * m.emissive.w * emissiveMask * fl * select(1.0, coreBoost, m.emissive.w > 12.0) * select(vec3f(1.0), tipTint, m.emissive.w > 12.0);
  } else {
    let flk = fluorescentFlicker(frame.cameraPos.w, m.extra.z, m.extra.w);
    emissive = m.emissive.rgb * m.emissive.w * emissiveMask * flk;
  }

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
