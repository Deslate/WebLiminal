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
  waterInfo: vec4f,    // x = waterLevel, y = hasWater, z = debugView, w = vhsMode
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
        if (u < 0.0 || u > 1.0) { continue; }
        let qvec = cross(tvec, tri.e1);
        let v = dot(rd, qvec) * invDet;
        if (v < 0.0 || u + v > 1.0) { continue; }
        let t = dot(tri.e2, qvec) * invDet;
        if (t > 1e-3 && t < maxT) {
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

fn ignPBR(p: vec2f) -> f32 {
  return fract(52.9829189 * fract(dot(p, vec2f(0.06711056, 0.00583715))));
}

// 6-sample Vogel-disk soft shadow over finite solar disc for crisp shadow lines + smooth penumbra.
fn evalSunVisibility(p: vec3f, nGeom: vec3f, pixelCoord: vec2f) -> f32 {
  let sunDir = frame.sunDirRad.xyz;
  if (dot(nGeom, sunDir) <= 0.0) { return 0.0; }
  let origin = p + nGeom * 0.015;
  let angR = clamp(frame.sunDirRad.w, 0.004, 0.016);
  let basis = orthoBasis(sunDir);
  let rot = ignPBR(pixelCoord) * 2.0 * PI;
  var vis = 0.0;
  for (var s = 0; s < 6; s++) {
    let r = angR * sqrt((f32(s) + 0.5) / 6.0);
    let theta = f32(s) * 2.3999632 + rot;
    let d = normalize(basis * vec3f(r * cos(theta), r * sin(theta), 1.0));
    if (!traceShadowPBR(origin, d, 160.0)) {
      vis += 1.0 / 6.0;
    }
  }
  return vis;
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

  // Analytic razor-sharp glazed ceramic tile evaluation (infinite-resolution grout, bevels & per-tile 3D tilt!).
  let cer = evalAnalyticCeramic(i.uv, m, ar.rgb, ar.a, fwUV2);
  if (cer.isCeramic) {
    albedo = cer.albedo;
    rough = cer.rough;
    coat = cer.coat;
    texAO *= cer.ao;
    nXY = nXY * 0.25 + cer.slope;
  }

  let nZ = sqrt(max(0.02, 1.0 - min(0.95, dot(nXY, nXY))));
  let N = normalize(T * nXY.x + B * nXY.y + Ngeom * nZ);

  // Authentic waterline darkening & wet glossy film right above water surface.
  if (frame.waterInfo.y > 0.5) {
    let hAbove = i.worldPos.y - frame.waterInfo.x;
    let waterline = exp(-abs(hAbove - 0.025) / 0.075);
    let wetZone = smoothstep(0.24, -0.02, hAbove);
    albedo *= 1.0 - waterline * 0.16 - wetZone * 0.06;
    rough = mix(rough, min(rough, 0.048), wetZone * 0.78);
    coat = mix(coat, max(coat, 0.98), wetZone * 0.80 * (1.0 - cer.inGrout * 0.6));
  }

  // Sample baked Directional Indirect GI + Area-Light Lightmap.
  let lmI = textureSample(lmIrradTex, lmSampler, i.uv2);
  let lmD = textureSample(lmDirTex, lmSampler, i.uv2);
  let irrad = lmI.rgb + vec3f(frame.fogParams.w);
  let bakedAO = clamp(lmD.a, 0.0, 1.0);
  let ao = mix(0.28, 1.0, bakedAO) * mix(0.45, 1.0, texAO);

  // Directional normal modulation from lightmap dominant incoming light vector.
  let irradLuma = max(0.002, dot(irrad, vec3f(0.2126, 0.7152, 0.0722)));
  let dirLen = length(lmD.rgb);
  let dirStrength = clamp(dirLen / irradLuma, 0.0, 1.0);
  let domDir = select(Ngeom, lmD.rgb / max(dirLen, 1e-4), dirLen > 1e-4);
  let ndlBump = max(dot(N, domDir), 0.0);
  let ndlGeom = max(dot(Ngeom, domDir), 0.25);
  let dirRatio = clamp(ndlBump / ndlGeom, 0.25, 1.75);
  let directionalFactor = mix(1.0, dirRatio, dirStrength * 0.78);

  let ndv = max(dot(N, V), 0.001);
  let f0 = mix(vec3f(0.048), albedo, metallic);
  let Fv = fresnelSchlick(ndv, f0);
  let kD = (vec3f(1.0) - Fv) * (1.0 - metallic);

  // 1. Indirect GI + Baked Area Lights Diffuse & Directional Lobe Specular
  var diffuse = kD * albedo * irrad * directionalFactor * ao;
  let specRough = clamp(mix(rough, max(rough, 0.20), 1.0 - dirStrength * 0.72), 0.045, 0.96);
  var specular = evalGGXSpec(N, V, domDir, specRough, f0) * irrad * dirStrength * ao * 1.15;
  if (coat > 0.02) {
    let coatRough = max(rough * 0.55, 0.038);
    specular += evalGGXSpec(N, V, domDir, coatRough, vec3f(0.052)) * irrad * dirStrength * coat * ao * 1.35;
  }

  // 2. Per-Pixel Razor-Sharp Direct Sunlight with 6-Sample Soft BVH Shadows!
  if (frame.sunColorInt.w > 0.5) {
    let sunDir = frame.sunDirRad.xyz;
    let ndlSun = max(dot(N, sunDir), 0.0);
    if (ndlSun > 0.0 && dot(Ngeom, sunDir) > 0.0) {
      let sunVis = evalSunVisibility(i.worldPos, Ngeom, i.clipPos.xy);
      if (sunVis > 0.0) {
        let sunRad = frame.sunColorInt.rgb * sunVis;
        diffuse += kD * albedo * sunRad * ndlSun * INV_PI * mix(0.68, 1.0, texAO);
        specular += evalGGXSpec(N, V, sunDir, max(rough, 0.045), f0) * sunRad * 0.95;
        if (coat > 0.02) {
          specular += evalGGXSpec(N, V, sunDir, max(rough * 0.50, 0.032), vec3f(0.052)) * sunRad * coat * 1.25;
        }
      }
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
    if (dist2 > 360.0 || dist2 < 0.04) { continue; }
    let lNorm = normalize(cross(l.edgeUPower.xyz, l.edgeVKind.xyz));
    let dist = sqrt(dist2);
    let dirL = toL / dist;
    let cosL = dot(lNorm, -dirL);
    if (cosL <= 0.02 || dot(Ngeom, dirL) <= 0.0 || dot(N, dirL) <= 0.0) { continue; }
    let atten = (cosL * l.originArea.w) / max(dist2, 0.35);
    let areaSpecRough = clamp(rough + sqrt(l.originArea.w) * 0.05 / max(dist, 0.5), 0.04, 0.90);
    let sCol = evalGGXSpec(N, V, dirL, areaSpecRough, f0) * l.radianceCdf.rgb * atten * 0.52;
    let cCol = evalGGXSpec(N, V, dirL, max(areaSpecRough * 0.58, 0.032), vec3f(0.055)) * l.radianceCdf.rgb * atten * coat * 0.68;
    let cand = sCol + cCol;
    // Early-cull shadow ray if candidate specular is negligible (skips >90% of shadow rays!).
    if (dot(cand, vec3f(0.2126, 0.7152, 0.0722)) < 0.018) { continue; }
    if (!traceShadowPBR(shadowOrigin, dirL, max(0.02, dist - 0.08))) {
      specular += cand;
    }
  }

  // Subtle metallic/glaze indirect floor (kept modest since full BVH reflections provide real room mirror!).
  let envSpec = Fv * irrad * mix(0.08, 0.38, metallic) * ao * (1.0 - rough * 0.65);

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

  // Encode reflection tint (white for dielectric glaze/puddles, albedo for stainless steel/metal)
  // and reflection mask for the Full-Scene BVH Glossy Reflection pass.
  let reflTint = mix(vec3f(1.0), albedo, metallic);
  let isDielectricGlaze = coat > 0.15 && metallic < 0.5;
  let reflStrength = clamp(max(metallic, max(coat * 0.96, select(0.0, 0.65, isDielectricGlaze))), 0.0, 1.0);

  var o: GBufferOut;
  o.hdrColor = vec4f(color, 1.0);
  o.gNormalRough = vec4f(N, rough);
  o.gAlbedoMetal = vec4f(reflTint, reflStrength * select(1.0, 0.0, dbg != 0u));
  return o;
}
