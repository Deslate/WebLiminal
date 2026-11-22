// Pure mathematical Chebyshev polynomial fit for the finite-depth gravity-capillary
// dispersion operator G(s)/s = tanh(H*sqrt(s))/sqrt(s) over s in [0, 16/(3*dx^2)].
// Applying the Neumann graph Laplacian L*h before the polynomial keeps the constant mode null.

export function dispersionPolynomial(depth, degree = 20, dx = 0.0625) {
  const limit = 16 / (3 * dx * dx);
  const n = degree + 1;
  const A = Array.from({ length: n }, () => new Float64Array(n + 1));
  for (let sample = 0; sample < 4096; sample++) {
    const j = sample % 2048;
    const s =
      sample < 2048
        ? 0.001 * Math.pow(limit / 0.001, j / 2047)
        : ((1 + Math.cos((Math.PI * (j + 0.5)) / 2048)) * limit) / 2;
    const target = Math.tanh(depth * Math.sqrt(s)) / Math.sqrt(s);
    const x = (2 * s) / limit - 1;
    const t = new Float64Array(n);
    t[0] = 1;
    if (n > 1) t[1] = x;
    for (let k = 2; k < n; k++) t[k] = 2 * x * t[k - 1] - t[k - 2];
    for (let a = 0; a < n; a++) {
      const u = t[a] / target;
      A[a][n] += u;
      for (let b = 0; b < n; b++) A[a][b] += (u * t[b]) / target;
    }
  }
  for (let k = 0; k < n; k++) {
    let pivot = k;
    for (let j = k + 1; j < n; j++) {
      if (Math.abs(A[j][k]) > Math.abs(A[pivot][k])) pivot = j;
    }
    [A[k], A[pivot]] = [A[pivot], A[k]];
    const d = A[k][k];
    for (let j = k; j <= n; j++) A[k][j] /= d;
    for (let i = 0; i < n; i++) {
      if (i === k) continue;
      const v = A[i][k];
      for (let j = k; j <= n; j++) A[i][j] -= v * A[k][j];
    }
  }
  return { limit, coefficients: A.map((r) => r[n]), degree, depth, dx };
}

// Pure local simulation window planner (unit-tested to guarantee zero spurious resets near map edges).
// Compares player movement delta for teleports and desired clamped window origin vs current origin
// for smooth walking shifts — never compares player position against a clamped window center!
export function computeWaterWindowUpdate({
  focusX,
  focusZ,
  lastFocusX,
  lastFocusZ,
  winMinX,
  winMinZ,
  winSizeX,
  winSizeZ,
  mapMinX,
  mapMinZ,
  mapSizeX,
  mapSizeZ,
  dx,
  windowReady,
}) {
  const clampMin = (targetMin, mMin, mSize, wSize) => {
    if (wSize >= mSize) return mMin;
    return Math.max(mMin, Math.min(mMin + mSize - wSize, targetMin));
  };
  const snap = (cx, cz) => {
    const rawX = clampMin(cx - winSizeX * 0.5, mapMinX, mapSizeX, winSizeX);
    const rawZ = clampMin(cz - winSizeZ * 0.5, mapMinZ, mapSizeZ, winSizeZ);
    return [
      mapMinX + Math.round((rawX - mapMinX) / dx) * dx,
      mapMinZ + Math.round((rawZ - mapMinZ) / dx) * dx,
    ];
  };

  const [newMinX, newMinZ] = snap(focusX, focusZ);
  if (!windowReady) {
    return { action: "init", minX: newMinX, minZ: newMinZ, shiftX: 0, shiftZ: 0 };
  }

  const jumpDist = Math.hypot(focusX - lastFocusX, focusZ - lastFocusZ);
  if (jumpDist > 5.0) {
    // True teleport / bookmark switch across chambers.
    return { action: "init", minX: newMinX, minZ: newMinZ, shiftX: 0, shiftZ: 0 };
  }

  const winDelta = Math.hypot(newMinX - winMinX, newMinZ - winMinZ);
  if (winDelta >= 2.5) {
    const shiftX = Math.round((newMinX - winMinX) / dx);
    const shiftZ = Math.round((newMinZ - winMinZ) / dx);
    if (shiftX !== 0 || shiftZ !== 0) {
      return { action: "shift", minX: newMinX, minZ: newMinZ, shiftX, shiftZ };
    }
  }
  return { action: "keep", minX: winMinX, minZ: winMinZ, shiftX: 0, shiftZ: 0 };
}
