import assert from "node:assert/strict";
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const norm = (a) => {
  let n = Math.hypot(...a);
  return a.map((x) => x / n);
};
function wave(p, c) {
  const dirs = [
    [0.91, 0.41],
    [-0.38, 0.925],
    [0.71, -0.704],
    [-0.97, -0.24],
    [0.18, 0.984],
    [0.839, 0.544],
    [-0.61, 0.792],
    [0.994, -0.108],
    [0.39, -0.921],
    [-0.84, -0.542],
  ];
  const k=[1.17,2.03,3.19,5.37,8.71,13.43,19.7,27.1,35.3,43.7],
    a=[.28,.25,.12,.07,.043,.023,.07,.05,.034,.024],
    rates=[.19,.23,.17,.26,.31,.28,.4,.43,.37,.46];
  let h = c.waterLevel,
    g = [0, 0];
  for (let i = 0; i < 10; i++) {
    let ph =
        dot(p, dirs[i]) * k[i] +
        Math.sqrt(9.81 * k[i]) * rates[i] * c.waveTime +
        i * i * 1.719,
      amp = a[i] * c.waveAmplitude;
    h += amp * Math.sin(ph);
    g = g.map((v, j) => v + amp * k[i] * Math.cos(ph) * dirs[i][j]);
  }
  return { h, n: norm([-g[0], 1, -g[1]]) };
}
function fresnel(ci, ni, nt) {
  const st = (ni / nt) * Math.sqrt(Math.max(0, 1 - ci * ci));
  if (st >= 1) return 1;
  const ct = Math.sqrt(1 - st * st);
  return (
    0.5 *
    (((nt * ci - ni * ct) / (nt * ci + ni * ct)) ** 2 +
      ((ni * ci - nt * ct) / (ni * ci + nt * ct)) ** 2)
  );
}
export function auditOptics(audit) {
  let reflections = 0,
    refractions = 0,
    aboveWaterReceivers = 0;
  const max = {
    snell: 0,
    reflection: 0,
    fresnel: 0,
    fluxWeight: 0,
    heightMetres: 0,
    normal: 0,
  };
  const records = [];
  for (let i = 0; i < 512; i++) {
    const a = audit.paths.slice(i * 32, i * 32 + 32);
    if (a[31] < 0.5) continue;
    const incident = a.slice(4, 7),
      normal = a.slice(12, 15),
      out = a.slice(16, 19),
      point = a.slice(8, 11),
      ni = a[7],
      nt = a[11],
      refl = a[19] > 0.5;
    const ci = -dot(incident, normal),
      f = fresnel(ci, ni, nt);
    max.fresnel = Math.max(max.fresnel, Math.abs(f - a[15]));
    if (refl) {
      reflections++;
      const expected = incident.map((x, j) => x + 2 * ci * normal[j]);
      max.reflection = Math.max(
        max.reflection,
        ...expected.map((x, j) => Math.abs(x - out[j])),
      );
    } else {
      refractions++;
      const co = -dot(out, normal);
      max.snell = Math.max(
        max.snell,
        Math.abs(
          ni * Math.sqrt(Math.max(0, 1 - ci * ci)) -
            nt * Math.sqrt(Math.max(0, 1 - co * co)),
        ),
      );
    }
    const expectedWeight = a[27] < 0 ? (refl ? f : 1-f) : (refl ? f / a[27] : (1 - f) / (1 - a[27]));
    for (let j = 0; j < 3; j++)
      if (a[24 + j] > 1e-8)
        max.fluxWeight = Math.max(
          max.fluxWeight,
          Math.abs(a[28 + j] / a[24 + j] - expectedWeight),
        );
    const w = wave([point[0], point[2]], {
      ...audit.config,
      waveTime: audit.waveTime,
    });
    max.heightMetres = Math.max(max.heightMetres, Math.abs(w.h - point[1]));
    const sign = normal[1] > 0 ? 1 : -1;
    max.normal = Math.max(
      max.normal,
      ...w.n.map((x, j) => Math.abs(x * sign - normal[j])),
    );
    const receiver = a.slice(20, 23);
    if (receiver[1] > audit.config.waterLevel + 0.1) aboveWaterReceivers++;
    records.push({
      source: a.slice(0, 3),
      incident,
      waterPoint: point,
      normal,
      ni,
      nt,
      fresnel: a[15],
      branch: refl ? "reflection" : "refraction",
      outgoing: out,
      receiver,
      receiverSurface: a[23],
      fluxBefore: a.slice(24, 27),
      branchProbability: a[27] < 0 ? 1 : (refl ? a[27] : 1 - a[27]),
      fluxAfter: a.slice(28, 31),
    });
  }
  assert(
    reflections > 20 && refractions > 20,
    "Both dielectric branches must be present in real GPU records",
  );
  for (const [name, limit] of Object.entries({
    snell: 0.0001,
    reflection: 0.0001,
    fresnel: 0.0001,
    fluxWeight: 0.0001,
    heightMetres: 0.002,
    normal: 0.001,
  }))
    assert(max[name] < limit, `${name} error ${max[name]}`);
  return {
    reflections,
    refractions,
    aboveWaterReceivers,
    maxResidual: max,
    records,
  };
}
