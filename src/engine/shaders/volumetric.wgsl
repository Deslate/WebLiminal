// Half-resolution Volumetric Sunbeams & Atmospheric Area-Light Haze Pass.
// Prepended with bvh-common.wgsl so volumetric shafts trace exact BVH shadows!

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

@group(0) @binding(0) var<uniform> frame: FrameUniform;
@group(0) @binding(1) var<storage, read> bvhNodes: array<BVHNode>;
@group(0) @binding(2) var<storage, read> bvhTris: array<BVHTri>;
@group(0) @binding(3) var<storage, read> lights: array<AreaLight>;
@group(0) @binding(4) var depthTex: texture_depth_2d;
@group(0) @binding(5) var outVol: texture_storage_2d<rgba16float, write>;

fn traceShadowVol(ro: vec3f, rd: vec3f, maxT: f32) -> bool {
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

fn hgPhase(cosTheta: f32, g: f32) -> f32 {
  let g2 = g * g;
  return (1.0 - g2) / (4.0 * PI * pow(max(0.05, 1.0 + g2 - 2.0 * g * cosTheta), 1.5));
}

fn ign(p: vec2f) -> f32 {
  return fract(52.9829189 * fract(dot(p, vec2f(0.06711056, 0.00583715))));
}

@compute @workgroup_size(8, 8)
fn marchVolumetric(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(outVol);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }

  let volStrength = frame.fogParams.y;
  if (volStrength <= 0.001 || frame.waterInfo.z > 0.5) {
    textureStore(outVol, vec2i(gid.xy), vec4f(0.0));
    return;
  }

  let uv = (vec2f(gid.xy) + 0.5) / vec2f(dims);
  let fullDims = vec2i(textureDimensions(depthTex));
  let px = clamp(vec2i(uv * vec2f(fullDims)), vec2i(0), fullDims - vec2i(1));
  let depth = textureLoad(depthTex, px, 0);

  let ndc = vec4f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, min(depth, 0.9999), 1.0);
  let wpFar = frame.invViewProj * ndc;
  let targetPos = wpFar.xyz / wpFar.w;
  let toTarget = targetPos - frame.cameraPos.xyz;
  let maxDist = min(length(toTarget), 30.0);
  let rd = toTarget / max(length(toTarget), 1e-4);

  let steps = 18;
  let dt = maxDist / f32(steps);
  let jitter = ign(vec2f(gid.xy));

  let hasSun = frame.sunColorInt.w > 0.5;
  let sunPhase = select(0.0, hgPhase(dot(rd, frame.sunDirRad.xyz), 0.62), hasSun);
  let lightCount = min(u32(frame.skyHorizon.w + 0.5), 16u);
  let fogDens = max(frame.fogColorDens.w, 0.012);

  var scatter = vec3f(0.0);
  var transmittance = 1.0;

  for (var s = 0; s < steps; s++) {
    let t = (f32(s) + jitter) * dt;
    let p = frame.cameraPos.xyz + rd * t;
    var inLight = vec3f(0.0);

    // 1. Real BVH-occluded volumetric sunbeams (Poolrooms skylights & arches)
    if (hasSun) {
      if (!traceShadowVol(p, frame.sunDirRad.xyz, 120.0)) {
        inLight += frame.sunColorInt.rgb * sunPhase * 0.55;
      }
    }

    // 2. Soft proximity haze around indoor fluorescent fixtures & glowing signs
    for (var li = 0u; li < lightCount; li++) {
      let l = lights[li];
      let lCenter = l.originArea.xyz + 0.5 * (l.edgeUPower.xyz + l.edgeVKind.xyz);
      let d = p - lCenter;
      let dist2 = dot(d, d);
      if (dist2 > 36.0) { continue; }
      let lNorm = normalize(cross(l.edgeUPower.xyz, l.edgeVKind.xyz));
      let cone = max(0.0, dot(lNorm, d / max(sqrt(dist2), 0.1)));
      if (cone > 0.05) {
        inLight += l.radianceCdf.rgb * (l.originArea.w * cone / (dist2 + 1.8)) * 0.032;
      }
    }

    let stepExt = fogDens * dt;
    scatter += transmittance * inLight * volStrength * stepExt;
    transmittance *= exp(-stepExt);
  }

  textureStore(outVol, vec2i(gid.xy), vec4f(min(scatter, vec3f(3.0)), 1.0));
}

// Separable/3x3 smooth blur removes interleaved-gradient noise from half-res volumetrics.
@group(1) @binding(0) var srcVol: texture_2d<f32>;

@compute @workgroup_size(8, 8)
fn blurVolumetric(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(outVol);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let c = vec2i(gid.xy);
  let maxC = vec2i(dims) - vec2i(1);
  var sum = vec3f(0.0);
  var wSum = 0.0;
  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) {
      let w = select(select(1.0, 2.0, dx == 0 || dy == 0), 4.0, dx == 0 && dy == 0);
      let q = clamp(c + vec2i(dx, dy), vec2i(0), maxC);
      sum += textureLoad(srcVol, q, 0).rgb * w;
      wSum += w;
    }
  }
  textureStore(outVol, c, vec4f(sum / wSum, 1.0));
}
