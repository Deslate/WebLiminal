// Metres throughout. Surface grids hold measured photon flux, never material imagery.
import level from "../../levels/poolrooms.json";
export const ROOM = { ...level.bounds, ceiling: level.ceiling };
export function makeGeometry(apertureWidth = 4.8, apertureDepth = 5.8) {
  const shapes = [],
    solids = [];
  const add = (lo, hi, material = 0, kind = 0, radius = 0, spring = 0) => {
    shapes.push({ lo, hi, material, kind, radius, spring });
  };
  add([-7, -0.25, -17], [7, 0, 10], 2);
  add([-7.3, 0, -17], [-7, 6.1, 10]);
  add([7, 0, -17], [7.3, 6.1, 10]);
  add([-7, 0, -17.3], [7, 6.1, -17]);
  add([-7, 0, 10], [7, 6.1, 10.3]);
  const ax = -2.1,
    az = 1.3,
    xmin = ax - apertureWidth / 2,
    xmax = ax + apertureWidth / 2,
    zmin = az - apertureDepth / 2,
    zmax = az + apertureDepth / 2;
  add([-7, 5.8, -17], [xmin, 6.1, 10], 1);
  add([xmax, 5.8, -17], [7, 6.1, 10], 1);
  add([xmin, 5.8, -17], [xmax, 6.1, zmin], 1);
  add([xmin, 5.8, zmax], [xmax, 6.1, 10], 1);
  for (const cx of [-4.67, 0, 4.67]) {
    add([cx - 2.335, 0, -3.65], [cx + 2.335, 5.8, -2.85], 0, 1, 1.78, 2.5);
    for (const sign of [-1, 1]) {
      const a = cx + sign * 1.78,
        b = cx + sign * 2.335;
      solids.push({
        minX: Math.min(a, b),
        maxX: Math.max(a, b),
        minZ: -3.65,
        maxZ: -2.85,
      });
    }
  }
  add([-7, 0, -11.6], [7, 5.8, -10.8], 0, 1, 2.1, 2.5);
  solids.push(
    { minX: -7, maxX: -2.1, minZ: -11.6, maxZ: -10.8 },
    { minX: 2.1, maxX: 7, minZ: -11.6, maxZ: -10.8 },
  );
  add([-7, 0, 0.4], [-6.1, 0.42, 9.7]);
  solids.push({ minX: -7, maxX: -6.1, minZ: 0.4, maxZ: 9.7 });
  add([-6.1, 0, 0.4], [-5.85, 0.18, 9.7], 2);
  solids.push({ minX: -6.1, maxX: -5.85, minZ: 0.4, maxZ: 9.7 });
  const surfaceList = [];
  let totalCells = 0;
  const geometryData = new ArrayBuffer(shapes.length * 64),
    f = new Float32Array(geometryData),
    u = new Uint32Array(geometryData);
  shapes.forEach((s, i) => {
    f.set([...s.lo, 0, ...s.hi, 0], i * 16);
    u.set([s.material, s.kind, surfaceList.length, 0], i * 16 + 8);
    f.set([s.radius, s.spring, 0, 0], i * 16 + 12);
    const d = s.hi.map((x, j) => x - s.lo[j]);
    const sizes = [
      [d[2], d[1]],
      [d[2], d[1]],
      [d[0], d[2]],
      [d[0], d[2]],
      [d[0], d[1]],
      [d[0], d[1]],
      [Math.PI * s.radius, d[2]],
      [d[2], s.spring],
      [d[2], s.spring],
    ];
    for (let face = 0; face < 9; face++) {
      let [w, h] = sizes[face];
      if (face >= 6 && s.kind === 0) {
        w = 0.01;
        h = 0.01;
      }
      let density = 12;
      if (i === 0 && face === 3) density = 24;
      if (
        (i === 1 && face === 1) ||
        (i === 2 && face === 0) ||
        (i === 3 && face === 5) ||
        (i === 4 && face === 4)
      )
        density = 24;
      if (i >= 5 && i <= 8 && face === 2) density = 24;
      if (s.kind === 1 && (face === 4 || face === 5 || face >= 6)) density = 24;
      if (i >= 13) density = 24;
      const nx = Math.max(2, Math.ceil(w * density)),
        ny = Math.max(2, Math.ceil(h * density));
      surfaceList.push({
        offset: totalCells,
        nx,
        ny,
        width: w,
        height: h,
        area: (w * h) / (nx * ny),
      });
      totalCells += nx * ny;
    }
  });
  const surfaces = new ArrayBuffer(surfaceList.length * 32),
    sf = new Float32Array(surfaces),
    su = new Uint32Array(surfaces),
    cellSurfaces = new Uint32Array(totalCells);
  let probeCount=0;const probeSurfaces=[];
  surfaceList.forEach((s, i) => {
    su.set([s.offset, s.nx, s.ny, probeCount], i * 8);
    const probes=Math.ceil(s.nx/4)*Math.ceil(s.ny/4);
    for(let j=0;j<probes;j++){
      const shape=shapes[Math.floor(i/9)],face=i%9;
      const nx=Math.ceil(s.nx/4),ny=Math.ceil(s.ny/4),u=(j%nx+.5)/nx,v=(Math.floor(j/nx)+.5)/ny;
      const d=shape.hi.map((p,k)=>p-shape.lo[k]);
      const px=face<2?shape[face===1?'hi':'lo'][0]:shape.lo[0]+u*d[0];
      const py=face<2||face>=4?shape.lo[1]+v*d[1]:shape[face===3?'hi':'lo'][1];
      const xx=px-(shape.lo[0]+shape.hi[0])/2,yy=py-shape.spring;
      const valid=!(shape.kind===1&&face<6&&Math.abs(xx)<shape.radius&&(yy<0||xx*xx+yy*yy<shape.radius*shape.radius));
      probeSurfaces.push(i|(Number(valid)<<16));
    }
    probeCount+=probes;
    sf.set([s.width, s.height, s.area, 0], i * 8 + 4);
    const shape=shapes[Math.floor(i/9)], face=i%9;
    cellSurfaces.fill(i | (4 << 16), s.offset, s.offset + s.nx * s.ny);
    if(shape.kind===1 && face<6){
      const d=shape.hi.map((v,k)=>v-shape.lo[k]),cx=(shape.lo[0]+shape.hi[0])/2;
      for(let y=0;y<s.ny;y++)for(let x=0;x<s.nx;x++){
        let coverage=0;
        for(let k=0;k<4;k++){
          const u=(x+.25+(k%2)*.5)/s.nx,v=(y+.25+Math.floor(k/2)*.5)/s.ny;
          const px=face<2?shape[face===1?'hi':'lo'][0]:shape.lo[0]+u*d[0];
          const py=face<2||face>=4?shape.lo[1]+v*d[1]:shape[face===3?'hi':'lo'][1];
          const xx=px-cx,yy=py-shape.spring;
          if(!(Math.abs(xx)<shape.radius&&(yy<0||xx*xx+yy*yy<shape.radius*shape.radius)))coverage++;
        }
        cellSurfaces[s.offset+y*s.nx+x]=i|(coverage<<16);
      }
    }
  });
  return {
    shapes,
    solids,
    geometryData,
    surfaces,
    cellSurfaces,
    totalCells,
    probeCount,probeSurfaces:new Uint32Array(probeSurfaces),
    surfaceCount: surfaceList.length,
    aperture: [xmin, xmax, zmin, zmax],
  };
}
