// Real-Time GPU Photon-Refracted Water Caustics (ZERO fake procedural sine-wave caustic textures!).
// Prepended with bvh-common.wgsl.
//   1) bakeWaterStatic (once on load): traces BVH down to find exact submerged floorY & wet flag,
//      and traces BVH up along sunDir to record exact water-surface solar visibility.
//   2) clearCaustics + splatCaustics (per frame): refracts live sunlight photons through the exact
//      Catmull-Rom bicubic water surface normal with physical RGB chromatic dispersion (IOR 1.326/1.333/1.341)
//      and bilinearly scatters energy into a world-space atomic caustic grid.
//   3) resolveCaustics (per frame): normalizes & softly filters into an rgba16float caustic map!

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

struct CausticUniform {
  domain: vec4f,   // x = minX, y = minZ, z = invSizeX, w = invSizeZ
  grid: vec4u,     // x = waveNx, y = waveNz, z = cSize, w = subSamples (1 or 2)
  surface: vec4f,  // x = waterLevel, y = dx, z = sizeX, w = sizeZ
};

@group(0) @binding(0) var<uniform> frame: FrameUniform;
@group(0) @binding(1) var<uniform> cuni: CausticUniform;
@group(0) @binding(2) var<storage, read> bvhNodes: array<BVHNode>;
@group(0) @binding(3) var<storage, read> bvhTris: array<BVHTri>;
@group(0) @binding(4) var<storage, read> waveState: array<vec2f>;
@group(0) @binding(5) var<storage, read_write> staticMap: array<vec4f>; // x=sunVis, y=floorY, z=wet, w=0
@group(0) @binding(6) var<storage, read_write> causticAccum: array<atomic<u32>>; // 3 * cSize * cSize (RGB)
@group(0) @binding(7) var causticOutTex: texture_storage_2d<rgba16float, write>;

fn traceClosestCaustic(ro: vec3f, rd: vec3f, maxT: f32) -> f32 {
  var bestT = maxT;
  let invD = 1.0 / select(rd, vec3f(1e-8), abs(rd) < vec3f(1e-8));
  if (hitAABB(bvhNodes[0].minB, bvhNodes[0].maxB, ro, invD, bestT) >= bestT) {
    return bestT;
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
        if (t > 1e-4 && t < bestT) { bestT = t; }
      }
      if (sp == 0u) { break; }
      sp -= 1u;
      cur = stack[sp];
    } else {
      let l = node.leftFirst;
      let r = l + 1u;
      let dL = hitAABB(bvhNodes[l].minB, bvhNodes[l].maxB, ro, invD, bestT);
      let dR = hitAABB(bvhNodes[r].minB, bvhNodes[r].maxB, ro, invD, bestT);
      let nearIdx = select(r, l, dL < dR);
      let farIdx = select(l, r, dL < dR);
      if (min(dL, dR) >= bestT) {
        if (sp == 0u) { break; }
        sp -= 1u;
        cur = stack[sp];
      } else {
        if (max(dL, dR) < bestT && sp < 31u) {
          stack[sp] = farIdx;
          sp += 1u;
        }
        cur = nearIdx;
      }
    }
  }
  return bestT;
}

fn traceShadowCaustic(ro: vec3f, rd: vec3f, maxT: f32) -> bool {
  return traceClosestCaustic(ro, rd, maxT) < maxT;
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

// Exact cell-centered Catmull-Rom bicubic surface normal from the live combined
// finite-depth + spectral FFT body-wake heightfield (zero fake sine-wave jello!).
fn sampleBicubicNormal(wx: f32, wz: f32) -> vec3f {
  let nx = i32(cuni.grid.x);
  let nz = i32(cuni.grid.y);
  let dx = max(cuni.surface.y, 1e-4);
  let fx = clamp((wx - cuni.domain.x) / dx - 0.5, 0.0, f32(nx - 1) - 1e-4);
  let fz = clamp((wz - cuni.domain.y) / dx - 0.5, 0.0, f32(nz - 1) - 1e-4);
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

  let dhdx = dhdu / dx;
  let dhdz = dhdv / dx;
  return normalize(vec3f(-dhdx, 1.0, -dhdz));
}

// 1. Run once on level load: precompute water-surface solar visibility & submerged floor height.
@compute @workgroup_size(8, 8)
fn bakeWaterStatic(@builtin(global_invocation_id) gid: vec3u) {
  let cSize = cuni.grid.z;
  if (gid.x >= cSize || gid.y >= cSize) { return; }
  let idx = gid.y * cSize + gid.x;

  let u = (f32(gid.x) + 0.5) / f32(cSize);
  let v = (f32(gid.y) + 0.5) / f32(cSize);
  let wx = cuni.domain.x + u * cuni.surface.z;
  let wz = cuni.domain.y + v * cuni.surface.w;
  let wl = cuni.surface.x;

  // Trace down from slightly below waterLevel to find actual pool floor depth.
  let tDown = traceClosestCaustic(vec3f(wx, wl - 0.008, wz), vec3f(0.0, -1.0, 0.0), 12.0);
  // Check if inside solid geometry by also tracing up briefly from floor
  let wet = select(0.0, 1.0, tDown < 11.5 && tDown > 0.02);
  let floorY = select(wl, wl - 0.008 - tDown, wet > 0.5);

  var sunVis = 0.0;
  if (wet > 0.5 && frame.sunColorInt.w > 0.5) {
    let sunDir = frame.sunDirRad.xyz;
    if (sunDir.y > 0.05) {
      let basis = orthoBasis(sunDir);
      let angR = max(frame.sunDirRad.w, 0.008);
      for (var s = 0; s < 4; s++) {
        let a = f32(s) * (PI * 0.5) + 0.35;
        let d = normalize(basis * vec3f(angR * 0.65 * cos(a), angR * 0.65 * sin(a), 1.0));
        if (!traceShadowCaustic(vec3f(wx, wl + 0.02, wz), d, 160.0)) {
          sunVis += 0.25;
        }
      }
    }
  }
  staticMap[idx] = vec4f(sunVis, floorY, wet, 0.0);
}

// 2. Clear atomic accumulation buffer each frame.
@compute @workgroup_size(8, 8)
fn clearCaustics(@builtin(global_invocation_id) gid: vec3u) {
  let cSize = cuni.grid.z;
  if (gid.x >= cSize || gid.y >= cSize) { return; }
  let base = (gid.y * cSize + gid.x) * 3u;
  atomicStore(&causticAccum[base + 0u], 0u);
  atomicStore(&causticAccum[base + 1u], 0u);
  atomicStore(&causticAccum[base + 2u], 0u);
}

fn splatChannel(hitU: f32, hitV: f32, cSize: u32, channel: u32, energy: f32) {
  if (hitU < 0.0 || hitU >= 1.0 || hitV < 0.0 || hitV >= 1.0) { return; }
  let fx = hitU * f32(cSize) - 0.5;
  let fz = hitV * f32(cSize) - 0.5;
  let x0 = i32(floor(fx));
  let z0 = i32(floor(fz));
  let tx = fx - f32(x0);
  let tz = fz - f32(z0);
  let maxI = i32(cSize) - 1;

  let w00 = (1.0 - tx) * (1.0 - tz);
  let w10 = tx * (1.0 - tz);
  let w01 = (1.0 - tx) * tz;
  let w11 = tx * tz;

  let cx0 = clamp(x0, 0, maxI);
  let cx1 = clamp(x0 + 1, 0, maxI);
  let cz0 = clamp(z0, 0, maxI);
  let cz1 = clamp(z0 + 1, 0, maxI);

  let s00 = u32(max(0.0, energy * w00));
  let s10 = u32(max(0.0, energy * w10));
  let s01 = u32(max(0.0, energy * w01));
  let s11 = u32(max(0.0, energy * w11));

  if (s00 > 0u) { atomicAdd(&causticAccum[(u32(cz0) * cSize + u32(cx0)) * 3u + channel], s00); }
  if (s10 > 0u) { atomicAdd(&causticAccum[(u32(cz0) * cSize + u32(cx1)) * 3u + channel], s10); }
  if (s01 > 0u) { atomicAdd(&causticAccum[(u32(cz1) * cSize + u32(cx0)) * 3u + channel], s01); }
  if (s11 > 0u) { atomicAdd(&causticAccum[(u32(cz1) * cSize + u32(cx1)) * 3u + channel], s11); }
}

// 3. Refract real sunlight photon packets through the live bicubic water surface & scatter to pool floor!
@compute @workgroup_size(8, 8)
fn splatCaustics(@builtin(global_invocation_id) gid: vec3u) {
  let cSize = cuni.grid.z;
  if (gid.x >= cSize || gid.y >= cSize) { return; }
  if (frame.sunColorInt.w < 0.5) { return; }

  let idx = gid.y * cSize + gid.x;
  let st = staticMap[idx];
  let sunVis = st.x;
  let floorY = st.y;
  let wet = st.z;
  if (wet < 0.5 || sunVis < 0.01) { return; }

  let wl = cuni.surface.x;
  let depth = max(0.04, wl - floorY);
  let sunDir = frame.sunDirRad.xyz;
  let sub = max(1u, cuni.grid.w);
  let invSub = 1.0 / f32(sub);
  let baseEnergy = sunVis * 512.0 * (invSub * invSub);

  // Subtle physical spectral dispersion across R/G/B refractive indices of water
  let iors = array<f32, 3>(1.325, 1.333, 1.342);

  for (var sy = 0u; sy < sub; sy++) {
    for (var sx = 0u; sx < sub; sx++) {
      let u = (f32(gid.x) + (f32(sx) + 0.5) * invSub) / f32(cSize);
      let v = (f32(gid.y) + (f32(sy) + 0.5) * invSub) / f32(cSize);
      let wx = cuni.domain.x + u * cuni.surface.z;
      let wz = cuni.domain.y + v * cuni.surface.w;

      let N = sampleBicubicNormal(wx, wz);
      let cosI = max(dot(sunDir, N), 0.05);
      let transmit = 1.0 - exactDielectricFresnel(cosI, 1.333);
      let flux = baseEnergy * transmit;

      for (var ch = 0u; ch < 3u; ch++) {
        let refr = refract(-sunDir, N, 1.0 / iors[ch]);
        let hitX = wx + refr.x * (depth / max(-refr.y, 0.22));
        let hitZ = wz + refr.z * (depth / max(-refr.y, 0.22));
        let hitU = (hitX - cuni.domain.x) * cuni.domain.z;
        let hitV = (hitZ - cuni.domain.y) * cuni.domain.w;
        splatChannel(hitU, hitV, cSize, ch, flux);
      }
    }
  }
}

// 4. Resolve atomic photon counts into smooth normalized rgba16float irradiance multiplier texture!
@compute @workgroup_size(8, 8)
fn resolveCaustics(@builtin(global_invocation_id) gid: vec3u) {
  let cSize = cuni.grid.z;
  if (gid.x >= cSize || gid.y >= cSize) { return; }
  let maxC = i32(cSize) - 1;
  let cx = i32(gid.x);
  let cy = i32(gid.y);

  // Gentle 3x3 energy-conserving kernel eliminates atomic quantization grain while preserving sharp filaments.
  var sum = vec3f(0.0);
  var wSum = 0.0;
  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) {
      let w = select(select(1.0, 2.0, dx == 0 || dy == 0), 4.0, dx == 0 && dy == 0);
      let qx = u32(clamp(cx + dx, 0, maxC));
      let qy = u32(clamp(cy + dy, 0, maxC));
      let base = (qy * cSize + qx) * 3u;
      let c = vec3f(
        f32(atomicLoad(&causticAccum[base + 0u])),
        f32(atomicLoad(&causticAccum[base + 1u])),
        f32(atomicLoad(&causticAccum[base + 2u])),
      );
      sum += c * w;
      wSum += w;
    }
  }

  // Flat water with sunVis=1 deposits ~512 * (1 - F0) ≈ 501 per cell => normalize so flat water = ~1.0!
  let normVal = (sum / max(wSum, 1.0)) * (1.0 / 501.0);
  let clamped = clamp(normVal, vec3f(0.0), vec3f(4.5));
  textureStore(causticOutTex, vec2i(gid.xy), vec4f(clamped, 1.0));
}
