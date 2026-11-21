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
