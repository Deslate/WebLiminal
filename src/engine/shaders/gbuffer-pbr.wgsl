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
    // Level 0 iconic vintage yellow wallpaper: crisp vertical 0.60 m roll seams + organic lower-wall
    // capillary damp wicking above the baseboard + non-repeating architectural aging.
    let seamGrid = vec2f(i.uv.x / 0.60, 0.25);
    let fwSeam = vec2f(fwUV2.x / 0.60, 0.001);
    let rollSeam = filteredGridCoverage(seamGrid, fwSeam, 0.0055);
    let worldAge = vFbm2(vec2f(i.worldPos.x + i.worldPos.z, i.worldPos.y * 1.1) * 0.38);
    let dampRise = smoothstep(0.68, 0.08, i.worldPos.y) * smoothstep(0.36, 0.72, vFbm2(vec2f(i.worldPos.x + i.worldPos.z, 1.7) * 0.65));
    albedo *= (0.91 + 0.16 * worldAge) * (1.0 - rollSeam * 0.16) * (1.0 - dampRise * 0.24);
    rough = clamp(rough - dampRise * 0.16, 0.42, 0.96);
    texAO *= 1.0 - rollSeam * 0.22;
  } else if (preset == 5u) {
    // Level 0 damp commercial woven loop carpet: sweeping non-repeating world-space moisture stains
    // & traffic wear paths so large lobbies never show tiled square repetition.
    let macroWear = vFbm2(i.worldPos.xz * 0.26 + vec2f(3.1, 7.4));
    let dampPatch = smoothstep(0.50, 0.76, vFbm2(i.worldPos.xz * 0.34 + vec2f(19.2, -5.8)));
    let rollSeam = filteredGridCoverage(vec2f(i.worldPos.x / 3.60, 0.25), vec2f(fwUV2.x / 3.60, 0.001), 0.0025);
    albedo *= (0.86 + 0.24 * macroWear) * (1.0 - dampPatch * 0.28) * (1.0 - rollSeam * 0.14);
    rough = clamp(rough - dampPatch * 0.22, 0.56, 0.99);
    coat = mix(coat, 0.09, dampPatch * 0.5);
  } else if (preset == 6u) {
    // Level 0 commercial suspended drop ceiling: exact box-filtered 1.20 x 0.60 m enameled metal T-bar
    // grid locked 1:1 to world metric coordinates so recessed 1.20 x 0.60 m troffers sit flush in grid bays!
    let g = vec2f(i.uv.x / 1.20, i.uv.y / 0.60);
    let fwG = vec2f(fwUV2.x / 1.20, fwUV2.y / 0.60);
    let barX = filteredGridCoverage(vec2f(g.x, 0.25), vec2f(fwG.x, 0.001), 0.026 / 1.20);
    let barY = filteredGridCoverage(vec2f(0.25, g.y), vec2f(0.001, fwG.y), 0.026 / 0.60);
    let tBar = clamp(barX + barY - barX * barY, 0.0, 1.0);
    let shadowLip = clamp(
      filteredGridCoverage(vec2f(g.x, 0.25), vec2f(fwG.x, 0.001), 0.044 / 1.20)
      + filteredGridCoverage(vec2f(0.25, g.y), vec2f(0.001, fwG.y), 0.044 / 0.60),
      0.0, 1.0,
    ) * (1.0 - tBar);
    let cellId = vHash2(floor(g) + vec2f(7.3, 19.1));
    let waterRing = smoothstep(0.58, 0.80, vFbm2(i.worldPos.xz * 0.42 + vec2f(5.4, 2.8)));
    var tileCol = albedo * (0.93 + 0.12 * cellId);
    tileCol = mix(tileCol, tileCol * vec3f(0.78, 0.69, 0.46), waterRing * 0.55);
    tileCol *= 1.0 - shadowLip * 0.26;
    let barCol = vec3f(0.84, 0.83, 0.78);
    albedo = mix(tileCol, barCol, tBar);
    rough = mix(clamp(rough - waterRing * 0.08, 0.65, 0.96), 0.28, tBar);
    coat = mix(0.0, 0.22, tBar);
    texAO = mix(texAO * (1.0 - shadowLip * 0.35), 1.0, tBar);
    nXY *= 1.0 - tBar * 0.92;
  } else if (preset == 8u) {
    // Level 1 brutalist board-formed concrete walls & columns: exact 1.20 x 1.20 m formwork panel
    // seams + realistic non-repeating vertical seepage & rising floor dampness.
    let g = i.uv / 1.20;
    let fwG = fwUV2 / 1.20;
    let seam = filteredGridCoverage(g, fwG, 0.008 / 1.20);
    let panelId = vHash2(floor(g) + vec2f(3.7, 11.3));
    let worldMottle = vFbm2(vec2f(i.worldPos.x + i.worldPos.z, i.worldPos.y * 0.85) * 0.35);
    let streak = smoothstep(0.54, 0.80, vFbm2(vec2f((i.worldPos.x + i.worldPos.z) * 1.4, i.worldPos.y * 0.22))) * smoothstep(1.2, 4.2, i.worldPos.y);
    let floorDamp = smoothstep(0.85, 0.04, i.worldPos.y) * (0.45 + 0.55 * vFbm2(vec2f(i.worldPos.x + i.worldPos.z, 2.3) * 0.55));
    let dampTotal = clamp((floorDamp * 0.75 + streak * 0.55) * max(m.extra.y, 0.22), 0.0, 1.0);
    albedo *= (0.90 + 0.16 * panelId) * (0.88 + 0.22 * worldMottle);
    albedo = mix(albedo, albedo * 0.52, seam * 0.78);
    albedo = mix(albedo, albedo * vec3f(0.64, 0.68, 0.70), dampTotal * 0.62);
    rough = clamp(rough - dampTotal * 0.44, 0.16, 0.96);
    coat = max(coat, dampTotal * 0.38);
    texAO *= 1.0 - seam * 0.45;
  } else if (preset == 9u) {
    // Level 1 subterranean concrete parking deck: exact 2.40 m structural saw-cut expansion joints
    // + sweeping non-repeating world-space mirror-glossy wet concrete puddles!
    let g = i.worldPos.xz / 2.40;
    let fwG = fwUV2 / 2.40;
    let sawJoint = filteredGridCoverage(g, fwG, 0.009 / 2.40);
    let macroSlab = vFbm2(i.worldPos.xz * 0.20 + vec2f(4.2, 9.1));
    let pLow = vFbm2(i.worldPos.xz * 0.21 + vec2f(-6.4, 13.7));
    let pMed = vFbm2(i.worldPos.xz * 0.56 + vec2f(11.3, -4.2));
    // Natural drainage troughs gently collect slightly more water along central & left drive aisles
    let aisleBias = 0.06 * exp(-pow((i.worldPos.x + 0.6) / 3.6, 2.0));
    let puddleField = pLow * 0.72 + pMed * 0.28 + aisleBias;
    let wetLvl = clamp(m.extra.y, 0.0, 1.0);
    let thresh = 0.56 - wetLvl * 0.14;
    let dampMargin = smoothstep(thresh - 0.11, thresh + 0.02, puddleField) * smoothstep(0.05, 0.30, wetLvl);
    let puddle = smoothstep(thresh, thresh + 0.065, puddleField) * smoothstep(0.15, 0.45, wetLvl);

    albedo *= 0.84 + 0.30 * macroSlab;
    albedo = mix(albedo, albedo * 0.38, sawJoint * 0.85);
    albedo = mix(albedo, albedo * vec3f(0.62, 0.66, 0.69), dampMargin * 0.55);
    albedo = mix(albedo, albedo * vec3f(0.42, 0.48, 0.52), puddle * 0.82);

    // Capillary damp rim lowers roughness; standing puddle water becomes mirror-flat (rough = 0.032, coat = 1.0)!
    let dryR = clamp(rough + 0.14, 0.48, 0.92);
    rough = mix(mix(dryR, 0.26, dampMargin), 0.032, puddle);
    coat = mix(mix(0.05, 0.42, dampMargin), 1.0, puddle);
    nXY *= 1.0 - puddle * 0.96;
    texAO *= 1.0 - sawJoint * 0.52;
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

  // 3. Analytic Area-Light GGX Specular with early-culled BVH shadow check!
  let lightCount = min(u32(frame.skyHorizon.w + 0.5), 24u);
  let shadowOrigin = i.worldPos + Ngeom * 0.018;
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
