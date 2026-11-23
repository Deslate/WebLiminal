// Lightmap resolve, geometry-aware À-trous bilateral denoiser, and UV gutter dilation.
// Ensures smooth, noise-free global illumination with crisp shadow edges and zero seam bleeding.

@group(0) @binding(0) var<uniform> params: vec4u; // x = atlasSize, y = stepSize
@group(0) @binding(1) var<storage, read> lmPos: array<vec4f>;
@group(0) @binding(2) var<storage, read> lmNorm: array<vec4f>;
@group(0) @binding(3) var<storage, read> accumIrrad: array<vec4f>;
@group(0) @binding(4) var<storage, read> accumDir: array<vec4f>;
@group(0) @binding(5) var outIrrad: texture_storage_2d<rgba16float, write>;
@group(0) @binding(6) var outDir: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8)
fn resolveRaw(@builtin(global_invocation_id) gid: vec3u) {
  let size = params.x;
  if (gid.x >= size || gid.y >= size) { return; }
  let idx = gid.y * size + gid.x;
  let valid = lmPos[idx].w;
  if (valid < 0.25) {
    textureStore(outIrrad, vec2i(gid.xy), vec4f(0.0));
    textureStore(outDir, vec2i(gid.xy), vec4f(0.0, 1.0, 0.0, 1.0));
    return;
  }
  let accI = accumIrrad[idx];
  let accD = accumDir[idx];
  let invN = 1.0 / max(1.0, accI.w);
  let irrad = accI.rgb * invN;
  let dir = accD.rgb * invN;
  let ao = clamp(accD.w * invN, 0.0, 1.0);
  textureStore(outIrrad, vec2i(gid.xy), vec4f(irrad, valid));
  textureStore(outDir, vec2i(gid.xy), vec4f(dir, ao));
}

@group(1) @binding(0) var srcIrrad: texture_2d<f32>;
@group(1) @binding(1) var srcDir: texture_2d<f32>;

@compute @workgroup_size(8, 8)
fn bilateralPass(@builtin(global_invocation_id) gid: vec3u) {
  let size = params.x;
  if (gid.x >= size || gid.y >= size) { return; }
  let c = vec2i(gid.xy);
  let idx = gid.y * size + gid.x;
  let p0 = lmPos[idx];
  let n0 = normalize(lmNorm[idx].xyz);
  let cI = textureLoad(srcIrrad, c, 0);
  let cD = textureLoad(srcDir, c, 0);

  if (p0.w < 0.25) {
    textureStore(outIrrad, c, cI);
    textureStore(outDir, c, cD);
    return;
  }

  let step = i32(params.y);
  let isSunlitIndirect = params.z > 0u;
  let sMax = i32(size) - 1;
  let kernel = array<f32, 3>(1.0, 0.66, 0.25);

  var sumI = vec3f(0.0);
  var sumD = vec3f(0.0);
  var sumAO = 0.0;
  var wSum = 0.0;
  var wAOSum = 0.0;

  let cLuma = dot(cI.rgb, vec3f(0.2126, 0.7152, 0.0722));
  // On sunlit/water levels (Poolrooms), adapt bilateral radius & edge-stopping to local illumination:
  //   - Low-luma multi-bounce indirect walls/tunnels (Chambers 1-3) get a wide smooth kernel (zero mottle!)
  //   - Bright direct-area-light zones & shadow edges (Chamber 4 columns/ceiling/floor) stop sharply!
  let cBright = smoothstep(0.14, 0.40, cLuma);
  let sunMaxDist2 = mix(select(2.4, 0.85, step <= 2), select(0.52, 0.24, step <= 2), cBright);
  let sunDistDecay = mix(0.95, 2.8, cBright);
  let maxDist2 = select(select(0.46, 0.24, step <= 2), sunMaxDist2, isSunlitIndirect);
  let normMin = select(0.92, 0.88, isSunlitIndirect);
  let planeTol = select(0.035, mix(0.10, 0.045, cBright), isSunlitIndirect);
  let distDecay = select(3.2, sunDistDecay, isSunlitIndirect);
  let aoStepMax = select(2, select(4, 2, cBright > 0.35), isSunlitIndirect);

  for (var dy = -2; dy <= 2; dy++) {
    for (var dx = -2; dx <= 2; dx++) {
      let q = clamp(c + vec2i(dx * step, dy * step), vec2i(0), vec2i(sMax));
      let qIdx = u32(q.y) * size + u32(q.x);
      let pq = lmPos[qIdx];
      if (pq.w < 0.25) { continue; }
      let nq = normalize(lmNorm[qIdx].xyz);
      if (dot(n0, nq) < normMin) { continue; }
      let dp = pq.xyz - p0.xyz;
      if (abs(dot(dp, n0)) > planeTol) { continue; }
      let dist2 = dot(dp, dp);
      if (dist2 > maxDist2) { continue; }

      let qI = textureLoad(srcIrrad, q, 0);
      let qD = textureLoad(srcDir, q, 0);
      let qLuma = dot(qI.rgb, vec3f(0.2126, 0.7152, 0.0722));
      let directEdge = smoothstep(0.16, 0.42, max(cLuma, qLuma));
      let sunLumaDenom = mix(0.42, 0.16, directEdge);
      let sunLumaDecay = mix(0.65, 3.0, directEdge);
      let lumaDenom = select(0.28, sunLumaDenom, isSunlitIndirect);
      let lumaDecay = select(2.1, sunLumaDecay, isSunlitIndirect);
      let lumaDiff = abs(qLuma - cLuma) / max(lumaDenom, cLuma + qLuma);

      let kw = kernel[abs(dx)] * kernel[abs(dy)];
      let pw = exp(-dist2 * distDecay);
      let lw = exp(-lumaDiff * lumaDecay);
      let w = kw * pw * lw;

      sumI += qI.rgb * w;
      sumD += qD.rgb * w;
      wSum += w;

      if (step <= aoStepMax && dist2 < select(0.14, mix(0.55, 0.20, cBright), isSunlitIndirect)) {
        let aoDiff = abs(qD.a - cD.a);
        let wAO = kw * exp(-dist2 * select(10.0, mix(2.8, 7.0, cBright), isSunlitIndirect)) * exp(-aoDiff * select(3.5, mix(1.9, 3.0, cBright), isSunlitIndirect));
        sumAO += qD.a * wAO;
        wAOSum += wAO;
      }
    }
  }

  let finalI = select(cI.rgb, sumI / wSum, wSum > 1e-5);
  let finalD = select(cD.rgb, sumD / wSum, wSum > 1e-5);
  let finalAO = select(cD.a, sumAO / wAOSum, step <= aoStepMax && wAOSum > 1e-5);
  textureStore(outIrrad, c, vec4f(finalI, p0.w));
  textureStore(outDir, c, vec4f(finalD, finalAO));
}

// Final gutter fill: copies nearest valid texel into unused atlas cells.
@compute @workgroup_size(8, 8)
fn dilateFinal(@builtin(global_invocation_id) gid: vec3u) {
  let size = params.x;
  if (gid.x >= size || gid.y >= size) { return; }
  let c = vec2i(gid.xy);
  let cI = textureLoad(srcIrrad, c, 0);
  if (cI.w > 0.25) {
    textureStore(outIrrad, c, cI);
    textureStore(outDir, c, textureLoad(srcDir, c, 0));
    return;
  }
  let sMax = i32(size) - 1;
  var bestD = 1e6;
  var bestI = vec4f(0.0);
  var bestDir = vec4f(0.0, 1.0, 0.0, 1.0);
  for (var dy = -2; dy <= 2; dy++) {
    for (var dx = -2; dx <= 2; dx++) {
      if (dx == 0 && dy == 0) { continue; }
      let q = clamp(c + vec2i(dx, dy), vec2i(0), vec2i(sMax));
      let qI = textureLoad(srcIrrad, q, 0);
      if (qI.w > 0.25) {
        let d = f32(dx * dx + dy * dy);
        if (d < bestD) {
          bestD = d;
          bestI = qI;
          bestDir = textureLoad(srcDir, q, 0);
        }
      }
    }
  }
  textureStore(outIrrad, c, bestI);
  textureStore(outDir, c, bestDir);
}
