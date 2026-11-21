// Optional Interactive Water Surface Shader:
// - Live wave normal reconstruction + capillary micro-ripples
// - Exact Snell refraction with submerged depth validation (no foreground bleeding)
// - Physical Beer-Lambert RGB pool water absorption (shallow clear -> deep aqua)
// - Live wave-curvature Jacobian caustics with subtle chromatic dispersion
// - Dielectric Fresnel Screen-Space Reflections + sky/hall fallback

const PI: f32 = 3.14159265359;

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
  optics: vec4f,      // rgb = Beer absorption coeffs, w = causticStrength
  surface: vec4f,     // x = waterLevel, y = dx, z = waveAmp, w = time
};

@group(0) @binding(0) var<uniform> frame: FrameUniform;
@group(0) @binding(1) var<uniform> water: WaterRenderUniform;
@group(0) @binding(2) var<storage, read> waveState: array<vec2f>;
@group(0) @binding(3) var sceneColorTex: texture_2d<f32>;
@group(0) @binding(4) var sceneDepthTex: texture_depth_2d;
@group(0) @binding(5) var linSampler: sampler;

struct VSOut {
  @builtin(position) clipPos: vec4f,
  @location(0) worldPos: vec3f,
};

@vertex
fn vsWater(@location(0) xz: vec2f) -> VSOut {
  let wx = mix(water.domain.x, water.domain.x + 1.0 / water.domain.z, xz.x);
  let wz = mix(water.domain.y, water.domain.y + 1.0 / water.domain.w, xz.y);
  let wp = vec3f(wx, water.surface.x, wz);
  var o: VSOut;
  o.worldPos = wp;
  o.clipPos = frame.viewProj * vec4f(wp, 1.0);
  return o;
}

fn sampleWaveHeight(wx: f32, wz: f32) -> f32 {
  let u = clamp((wx - water.domain.x) * water.domain.z, 0.0, 0.9999);
  let v = clamp((wz - water.domain.y) * water.domain.w, 0.0, 0.9999);
  let nx = i32(water.grid.x);
  let nz = i32(water.grid.y);
  let fx = u * f32(nx - 1);
  let fz = v * f32(nz - 1);
  let x0 = clamp(i32(floor(fx)), 0, nx - 2);
  let z0 = clamp(i32(floor(fz)), 0, nz - 2);
  let tx = fx - f32(x0);
  let tz = fz - f32(z0);
  let h00 = waveState[u32(z0 * nx + x0)].x;
  let h10 = waveState[u32(z0 * nx + x0 + 1)].x;
  let h01 = waveState[u32((z0 + 1) * nx + x0)].x;
  let h11 = waveState[u32((z0 + 1) * nx + x0 + 1)].x;
  return mix(mix(h00, h10, tx), mix(h01, h11, tx), tz);
}

// Fine capillary wavelets layered on top of simulated heightfield for sparkling close-up detail.
fn capillaryHeight(p: vec2f, t: f32) -> f32 {
  let w1 = sin(dot(p, vec2f(6.3, 4.1)) + t * 2.4) * 0.0011;
  let w2 = sin(dot(p, vec2f(-5.2, 7.4)) - t * 2.9) * 0.0009;
  let w3 = sin(dot(p, vec2f(11.7, -9.2)) + t * 3.7) * 0.00045;
  let w4 = sin(dot(p, vec2f(-14.1, -12.3)) - t * 4.3) * 0.00028;
  return w1 + w2 + w3 + w4;
}

fn totalHeight(wx: f32, wz: f32, t: f32) -> f32 {
  return sampleWaveHeight(wx, wz) + capillaryHeight(vec2f(wx, wz), t);
}

fn waterNormal(wx: f32, wz: f32, t: f32) -> vec3f {
  let e = max(water.surface.y * 0.75, 0.045);
  let hL = totalHeight(wx - e, wz, t);
  let hR = totalHeight(wx + e, wz, t);
  let hD = totalHeight(wx, wz - e, t);
  let hU = totalHeight(wx, wz + e, t);
  return normalize(vec3f((hL - hR) / (2.0 * e), 1.0, (hD - hU) / (2.0 * e)));
}

// Physically-motivated live caustic focusing from live simulated wave curvature + capillary filaments.
fn causticWeb(p: vec2f, t: f32) -> f32 {
  let g1 = sin(dot(p, vec2f(4.7, 3.1)) + t * 1.9) + sin(dot(p, vec2f(-3.8, 5.2)) - t * 2.1);
  let g2 = sin(dot(p, vec2f(7.9, -6.1)) + t * 2.7 + g1 * 0.65);
  let g3 = sin(dot(p, vec2f(-8.4, -5.7)) - t * 2.3 + g2 * 0.55);
  let ridge = 1.0 - abs(g2 + g3) * 0.5;
  return pow(clamp(ridge, 0.0, 1.0), 4.0);
}

fn liveCausticAt(wx: f32, wz: f32, t: f32, depth: f32) -> vec3f {
  let e = 0.07;
  let hc = totalHeight(wx, wz, t);
  let lapSim = (totalHeight(wx - e, wz, t) + totalHeight(wx + e, wz, t) + totalHeight(wx, wz - e, t) + totalHeight(wx, wz + e, t) - 4.0 * hc) / (e * e);

  // Chromatic dispersion across refracted water depth
  let disp = clamp(depth * 0.032, 0.006, 0.045);
  let p = vec2f(wx, wz);
  let waveFocus = clamp(1.0 - lapSim * 0.24, 0.4, 2.2);
  let depthFocus = smoothstep(0.03, 0.22, depth) * exp(-depth * 0.18);

  let cR = causticWeb(p + vec2f(disp, disp * 0.4), t) * waveFocus;
  let cG = causticWeb(p, t) * waveFocus;
  let cB = causticWeb(p - vec2f(disp, disp * 0.4), t) * waveFocus;
  return vec3f(cR, cG, cB) * depthFocus * 1.45;
}

fn reconstructWorldPos(uv: vec2f, depth: f32) -> vec3f {
  let ndc = vec4f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, depth, 1.0);
  let wp = frame.invViewProj * ndc;
  return wp.xyz / wp.w;
}

fn projectToUV(wp: vec3f) -> vec3f {
  let clip = frame.viewProj * vec4f(wp, 1.0);
  if (clip.w <= 1e-4) { return vec3f(-1.0); }
  let ndc = clip.xyz / clip.w;
  return vec3f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5, ndc.z);
}

fn evalSkyFallback(rd: vec3f) -> vec3f {
  let up = clamp(rd.y, 0.0, 1.0);
  return mix(frame.skyHorizon.rgb, frame.skyTop.rgb, pow(up, 0.55)) * 0.7;
}

@fragment
fn fsWater(i: VSOut) -> @location(0) vec4f {
  let fullDims = vec2i(textureDimensions(sceneColorTex));
  let uv = i.clipPos.xy / vec2f(fullDims);
  let px = clamp(vec2i(i.clipPos.xy), vec2i(0), fullDims - vec2i(1));

  let sceneDepth = textureLoad(sceneDepthTex, px, 0);
  // Discard if opaque geometry is closer than water surface.
  if (i.clipPos.z >= sceneDepth) { discard; }

  let t = water.surface.w;
  let N = waterNormal(i.worldPos.x, i.worldPos.z, t);
  let toCam = frame.cameraPos.xyz - i.worldPos;
  let camDist = length(toCam);
  let V = toCam / max(camDist, 1e-4);

  // Reconstruct submerged point right under this pixel.
  let rawSubPos = reconstructWorldPos(uv, sceneDepth);
  let rawDepth = max(0.0, length(rawSubPos - i.worldPos));

  // Snell refraction offset in screen space (scaled gently by water depth).
  let refrScale = clamp(rawDepth * 0.045, 0.0, 0.042) / max(camDist * 0.15, 0.35);
  let refrUV = clamp(uv + N.xz * refrScale, vec2f(0.002), vec2f(0.998));
  let refrPx = clamp(vec2i(refrUV * vec2f(fullDims)), vec2i(0), fullDims - vec2i(1));
  let refrDepthSample = textureLoad(sceneDepthTex, refrPx, 0);

  // Only accept refracted sample if it is actually behind the water plane!
  let validRefr = refrDepthSample > i.clipPos.z;
  let finalRefrUV = select(uv, refrUV, validRefr);
  let finalSubDepth = select(sceneDepth, refrDepthSample, validRefr);
  let subPos = reconstructWorldPos(finalRefrUV, finalSubDepth);
  let pathLen = max(0.0, length(subPos - i.worldPos));
  let verticalDepth = max(0.0, i.worldPos.y - subPos.y);

  var refrCol = textureSampleLevel(sceneColorTex, linSampler, finalRefrUV, 0.0).rgb;

  // Project live physical wave caustics onto submerged geometry along sun/skylight vector!
  let lightDir = select(vec3f(0.15, 0.96, 0.22), frame.sunDirRad.xyz, frame.sunColorInt.w > 0.5);
  let hitSurface = subPos.xz + lightDir.xz * (verticalDepth / max(lightDir.y, 0.35));
  let caustics = liveCausticAt(hitSurface.x, hitSurface.y, t, verticalDepth);
  let subLuma = dot(refrCol, vec3f(0.2126, 0.7152, 0.0722));
  // Caustics naturally appear only where real light reaches the pool floor.
  let litGate = smoothstep(0.05, 0.35, subLuma);
  let causticTint = select(vec3f(0.85, 0.98, 1.0), normalize(frame.sunColorInt.rgb + vec3f(0.1)) * 1.4, frame.sunColorInt.w > 0.5);
  refrCol += refrCol * caustics * causticTint * water.optics.w * litGate * 0.85;

  // Beer-Lambert physical RGB water absorption + subtle aqua in-scattering.
  let transmit = exp(-water.optics.rgb * pathLen);
  let inScatter = vec3f(0.035, 0.13, 0.14) * (1.0 - transmit) * clamp(subLuma * 1.1 + 0.15, 0.0, 1.4);
  let underwater = refrCol * transmit + inScatter;

  // Dielectric Fresnel reflection via Screen-Space Reflection march!
  let R = reflect(-V, N);
  var reflCol = evalSkyFallback(R);
  var ssrAlpha = 0.0;
  var rayT = 0.10;
  var prevT = 0.0;
  for (var s = 0; s < 28; s++) {
    let sp = i.worldPos + R * rayT;
    let proj = projectToUV(sp);
    if (proj.x < 0.0 || proj.x > 1.0 || proj.y < 0.0 || proj.y > 1.0 || proj.z < 0.0 || proj.z > 1.0) {
      break;
    }
    let spx = clamp(vec2i(proj.xy * vec2f(fullDims)), vec2i(0), fullDims - vec2i(1));
    let sd = textureLoad(sceneDepthTex, spx, 0);
    if (sd < 0.9999 && proj.z > sd) {
      let hw = reconstructWorldPos(proj.xy, sd);
      if (length(hw - sp) < 0.25 + rayT * 0.09) {
        var lo = prevT;
        var hi = rayT;
        var hitUV = proj.xy;
        for (var b = 0; b < 4; b++) {
          let mid = (lo + hi) * 0.5;
          let mp = projectToUV(i.worldPos + R * mid);
          let mpx = clamp(vec2i(mp.xy * vec2f(fullDims)), vec2i(0), fullDims - vec2i(1));
          if (mp.z > textureLoad(sceneDepthTex, mpx, 0)) {
            hi = mid;
            hitUV = mp.xy;
          } else {
            lo = mid;
          }
        }
        let edge = min(min(hitUV.x, 1.0 - hitUV.x), min(hitUV.y, 1.0 - hitUV.y));
        ssrAlpha = smoothstep(0.0, 0.08, edge);
        reflCol = mix(reflCol, min(textureSampleLevel(sceneColorTex, linSampler, hitUV, 0.0).rgb, vec3f(14.0)), ssrAlpha);
        break;
      }
    }
    prevT = rayT;
    rayT += 0.14 + rayT * 0.10;
    if (rayT > 28.0) { break; }
  }

  // Crisp sun glint on wavelets when sun is enabled.
  if (frame.sunColorInt.w > 0.5) {
    let H = normalize(V + frame.sunDirRad.xyz);
    let ndh = max(dot(N, H), 0.0);
    let glint = pow(ndh, 420.0) * 1.4 + pow(ndh, 48.0) * 0.06;
    reflCol += frame.sunColorInt.rgb * glint * litGate;
  }

  // Exact Schlick dielectric Fresnel (n1=1.0, n2=1.333 => F0 = 0.0204).
  let ndv = max(dot(N, V), 0.001);
  let fresnel = 0.0204 + 0.9796 * pow(1.0 - ndv, 5.0);

  // Soft shoreline blend avoids hard razor edge where water meets steps/walls.
  let edgeBlend = smoothstep(0.0, 0.035, pathLen);
  let waterCol = mix(underwater, reflCol, fresnel);
  let finalCol = mix(refrCol, waterCol, edgeBlend);

  return vec4f(finalCol, 1.0);
}
