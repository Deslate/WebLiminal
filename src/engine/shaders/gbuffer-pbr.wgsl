// Real-time Hardware-Rasterized PBR G-Buffer + Directional Lightmap + POM Pass,
// plus full-screen Sky Backdrop pass for open skylights and courtyards.

const PI: f32 = 3.14159265359;

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

struct MaterialGPU {
  albedoScale: vec4f,
  pbr: vec4f,
  emissive: vec4f,
  extra: vec4f,
};

struct AreaLight {
  originArea: vec4f,
  edgeUPower: vec4f,
  edgeVKind: vec4f,
  radianceCdf: vec4f,
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
  let up = clamp(rd.y, 0.0, 1.0);
  var col = mix(frame.skyHorizon.rgb, frame.skyTop.rgb, pow(up, 0.55));
  if (frame.sunColorInt.w > 0.5) {
    let cosA = max(dot(rd, frame.sunDirRad.xyz), 0.0);
    col += frame.sunColorInt.rgb * (0.08 * pow(cosA, 32.0) + 0.018 * pow(cosA, 4.0));
    let disc = smoothstep(cos(frame.sunDirRad.w * 1.4), cos(frame.sunDirRad.w * 0.7), cosA);
    col += frame.sunColorInt.rgb * disc * 1.8;
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
  let a = max(rough * rough, 0.015);
  let D = ggxD(ndh, a);
  let G = smithG(ndv, ndl, rough);
  let F = fresnelSchlick(vdh, f0);
  return (D * G * F) / max(4.0 * ndl * ndv, 1e-4) * ndl;
}

fn fluorescentFlicker(time: f32, seed: f32, strength: f32) -> f32 {
  if (strength <= 0.001) { return 1.0; }
  // Realistic 60Hz fluorescent ballast instability with occasional dips.
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

  let Ngeom = normalize(i.worldNorm);
  let T = normalize(i.worldTan.xyz - Ngeom * dot(i.worldTan.xyz, Ngeom));
  let B = cross(Ngeom, T) * i.worldTan.w;

  let toCam = frame.cameraPos.xyz - i.worldPos;
  let camDist = length(toCam);
  let V = toCam / max(camDist, 1e-4);

  var uv = i.uv * m.albedoScale.w;

  // Parallax Occlusion Mapping (POM) for close-up grout/relief depth.
  let pomDepth = m.pbr.w;
  if (pomDepth > 0.002 && camDist < 8.5) {
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
  var rough = clamp(ar.a, 0.04, 1.0);
  let texAO = nh.a;
  let metallic = mt.r;
  let coat = mt.g;
  let emissiveMask = mt.b;

  // Tangent-space normal -> world space.
  let nXY = nh.rg * 2.0 - 1.0;
  let nZ = sqrt(max(0.01, 1.0 - dot(nXY, nXY)));
  let N = normalize(T * nXY.x + B * nXY.y + Ngeom * nZ);

  // Subtle waterline darkening & damp sheen right near water surface (when level has water).
  if (frame.waterInfo.y > 0.5) {
    let hAbove = i.worldPos.y - frame.waterInfo.x;
    let waterline = exp(-abs(hAbove - 0.03) / 0.09);
    let wetZone = smoothstep(0.18, -0.05, hAbove);
    albedo *= 1.0 - waterline * 0.14 - wetZone * 0.08;
    rough = mix(rough, min(rough, 0.14), wetZone * 0.55);
  }

  // Sample baked Directional Lightmap (E / PI, dominant incoming direction, baked AO).
  let lmI = textureSample(lmIrradTex, lmSampler, i.uv2);
  let lmD = textureSample(lmDirTex, lmSampler, i.uv2);
  let irrad = lmI.rgb + vec3f(frame.fogParams.w);
  let bakedAO = clamp(lmD.a, 0.0, 1.0);
  let ao = mix(0.32, 1.0, bakedAO) * mix(0.45, 1.0, texAO);

  // Directional normal modulation: lets tile bevels, grout, wallpaper, and concrete
  // catch directional bounce & direct light from the baked lightmap!
  let irradLuma = max(0.005, dot(irrad, vec3f(0.2126, 0.7152, 0.0722)));
  let dirLen = length(lmD.rgb);
  let dirStrength = clamp(dirLen / irradLuma, 0.0, 1.0);
  let domDir = select(Ngeom, lmD.rgb / max(dirLen, 1e-4), dirLen > 1e-4);
  let ndlBump = max(dot(N, domDir), 0.0);
  let ndlGeom = max(dot(Ngeom, domDir), 0.25);
  let dirRatio = clamp(ndlBump / ndlGeom, 0.30, 1.65);
  let directionalFactor = mix(1.0, dirRatio, dirStrength * 0.72);

  // PBR diffuse + indirect specular from directional lightmap.
  let ndv = max(dot(N, V), 0.001);
  let f0 = mix(vec3f(0.04), albedo, metallic);
  let Fv = fresnelSchlick(ndv, f0);
  let kD = (vec3f(1.0) - Fv) * (1.0 - metallic);

  let diffuse = kD * albedo * irrad * directionalFactor * ao;

  // Specular from dominant lightmap direction (smoothly broadened for indirect light).
  let specRough = clamp(mix(rough, max(rough, 0.24), 1.0 - dirStrength * 0.65), 0.06, 0.96);
  var specular = evalGGXSpec(N, V, domDir, specRough, f0) * irrad * dirStrength * ao * 1.45;

  // Dielectric clearcoat specular highlight (glazed ceramic tiles & wet puddles).
  if (coat > 0.02) {
    let coatRough = max(rough * 0.65, 0.05);
    specular += evalGGXSpec(N, V, domDir, coatRough, vec3f(0.04)) * irrad * dirStrength * coat * ao * 1.6;
  }

  // Representative-point analytic GGX specular from nearby area lights (makes fluorescent panels
  // & EXIT signs gleam sharply across wet floors, stainless steel, and glazed ceramic!).
  let lightCount = min(u32(frame.skyHorizon.w + 0.5), 24u);
  for (var li = 0u; li < lightCount; li++) {
    let l = lights[li];
    let lCenter = l.originArea.xyz + 0.5 * (l.edgeUPower.xyz + l.edgeVKind.xyz);
    let toL = lCenter - i.worldPos;
    let dist2 = dot(toL, toL);
    if (dist2 > 225.0 || dist2 < 0.04) { continue; }
    let lNorm = normalize(cross(l.edgeUPower.xyz, l.edgeVKind.xyz));
    let dist = sqrt(dist2);
    let dirL = toL / dist;
    let cosL = dot(lNorm, -dirL);
    if (cosL <= 0.02 || dot(N, dirL) <= 0.0) { continue; }
    // Gate by lightmap brightness so occluded surfaces behind walls never get false highlights!
    let visGate = smoothstep(0.02, 0.28, irradLuma) * mix(0.25, 1.0, bakedAO);
    let atten = (cosL * l.originArea.w) / max(dist2, 0.35);
    let areaSpecRough = clamp(rough + sqrt(l.originArea.w) * 0.08 / max(dist, 0.5), 0.06, 0.92);
    let sCol = evalGGXSpec(N, V, dirL, areaSpecRough, f0) * l.radianceCdf.rgb * atten * visGate * 0.42;
    let cCol = evalGGXSpec(N, V, dirL, max(areaSpecRough * 0.7, 0.05), vec3f(0.04)) * l.radianceCdf.rgb * atten * coat * visGate * 0.48;
    specular += sCol + cCol;
  }

  // Subtle ambient metallic/glaze environment floor so metals don't go black before SSR.
  let envSpec = Fv * irrad * mix(0.22, 0.72, metallic) * ao * (1.0 - rough * 0.65);

  // Emissive contribution (with optional fluorescent flicker).
  let flk = fluorescentFlicker(frame.cameraPos.w, m.extra.z, m.extra.w);
  let emissive = m.emissive.rgb * m.emissive.w * emissiveMask * flk;

  var color = diffuse + specular + envSpec + emissive;

  // Debug inspection views (selectable from Inspector menu).
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

  // Encode reflection tint (white for dielectrics/wet puddles, albedo for conductors) and reflection strength.
  let reflTint = mix(vec3f(1.0), albedo, metallic);
  let reflStrength = clamp(max(metallic, max(coat * 0.92, (1.0 - rough) * 0.55)), 0.0, 1.0);

  var o: GBufferOut;
  o.hdrColor = vec4f(color, 1.0);
  o.gNormalRough = vec4f(N, rough);
  o.gAlbedoMetal = vec4f(reflTint, reflStrength * select(1.0, 0.0, dbg != 0u));
  return o;
}
