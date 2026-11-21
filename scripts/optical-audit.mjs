import assert from "node:assert/strict";
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const norm = (a) => {
  let n = Math.hypot(...a);
  return a.map((x) => x / n);
};
// Independent CPU reconstruction of the GPU's *read-back physical state*.
// No analytic wave surrogate: the simulated heights are the source of truth.
export function wave(p,c){
 const s=c.simulation;if(!s?.values)throw Error('Optical audit requires simulation readback');
 const {nx,nz,dx}=s.grid,values=s.values;
 const q=p.map((x,i)=>Math.max(0,Math.min((i?nz:nx)-1,(x-(i?-17:-7))/dx-.5)));
 const base=q.map(Math.floor),t=q.map((v,i)=>v-base[i]);
 const weights=t=>[-.5*t+t*t-.5*t*t*t,1-2.5*t*t+1.5*t*t*t,.5*t+2*t*t-1.5*t*t*t,-.5*t*t+.5*t*t*t];
 const derivatives=t=>[-.5+2*t-1.5*t*t,-5*t+4.5*t*t,.5+4*t-4.5*t*t,-t+1.5*t*t];
 const wx=weights(t[0]),wz=weights(t[1]),gx=derivatives(t[0]),gz=derivatives(t[1]);let h=0,x=0,z=0;
 for(let j=0;j<4;j++)for(let i=0;i<4;i++){const ix=Math.max(0,Math.min(nx-1,base[0]+i-1)),iz=Math.max(0,Math.min(nz-1,base[1]+j-1));const v=values[(iz*nx+ix)*4];h+=v*wx[i]*wz[j];x+=v*gx[i]*wz[j]/dx;z+=v*wx[i]*gz[j]/dx;}
 return {h:c.waterLevel+h,n:norm([-x,1,-z])};
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
      simulation:audit.simulation, waveTime: audit.waveTime,
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
