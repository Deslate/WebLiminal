// Authored landmarks in one world. The resolver accepts spatial addresses;
// bookmarks are navigation data, never a level registry or generator index.
import { buildPoolroomsScene } from './poolrooms-scene.js';
export const thresholdTileSize=.18;

export const bookmarks = [
  { name: 'No Deep Water Here', address: { x: 0, z: 0 } },
  { name: 'Column Reservoir', address: { x: 1, z: 0 } },
  { name: 'Ring Passage', address: { x: 0, z: -1 } },
  { name: 'Still Rotunda', address: { x: -1, z: 0 } },
  { name: 'Lightwell Threshold', address: { x: 0, z: 1 } },
];

// Authored content is resolved spatially, independently of bookmark order.
// A seeded fallback belongs here when un-authored cells become available.
const authoredCells = new Map([
  ['0,0', 'origin'], ['1,0', 'columns'], ['0,-1', 'rings'],
  ['-1,0', 'rotunda'], ['0,1', 'threshold'],
]);

// Apertures sit over courts and lightwells; they may not grow past them.
const limits = {
  columns: { apertureWidth: [.5, 9.5], apertureDepth: [.5, 8.9] },
  rings: { apertureWidth: [.5, 2.05], apertureDepth: [.5, 13] },
  rotunda: { apertureWidth: [.5, 23.8], apertureDepth: [.5, 21] },
  threshold: { apertureWidth: [.5, 8.9], apertureDepth: [.5, 11.7] },
};

export function createPoolroomsWorld(data, materials) {
  return { bookmarks, generate(address) {
    if (!Number.isSafeInteger(address.x) || !Number.isSafeInteger(address.z)) throw Error('Invalid world address');
    const recipe = authoredCells.get(`${address.x},${address.z}`);
    if (recipe === 'origin') return { spawn: { ...data.spawn }, optics: { ...data.optics }, scene: options => buildPoolroomsScene(data, options) };
    // Unknown cells are intentionally absent until the seeded generator exists.
    if (!recipe) throw Error(`Unloaded Poolrooms address: ${address.x},${address.z}`);
    const optics = { ...data.optics, apertureWidth: 4, apertureDepth: 4, exposure: 1.35 };
    const spawn = { x: 0, y: 1.62, z: 7, yaw: 0, pitch: -.12 };
    if (recipe === 'columns') { spawn.x = -1; spawn.z = 8.5; spawn.yaw = -.3; spawn.pitch = .02; optics.waterLevel = .58; optics.apertureWidth = 9.5; optics.apertureDepth = 8.9; optics.exposure = 1.15; optics.focalLength = 20; }
    if (recipe === 'rings') { spawn.x = 1.3; spawn.z = 5.8; spawn.yaw = .17; spawn.pitch = -.02; optics.apertureWidth = 2.05; optics.apertureDepth = 13; optics.focalLength = 12; }
    if (recipe === 'rotunda') { spawn.z = -10.85; spawn.y = 2.22; spawn.yaw = Math.PI; spawn.pitch = -.14; optics.waterLevel = .55; optics.apertureWidth = 23.8; optics.apertureDepth = 21; optics.exposure = 2.3; optics.focalLength = 14; optics.waveAmplitude = .012; }
    if (recipe === 'threshold') { spawn.x = -1.8; spawn.z = 8.4; spawn.pitch = 0; optics.apertureWidth = 8.9; optics.apertureDepth = 11.7; optics.focalLength = 18; }
    return { spawn, optics, materials: materials[recipe] ?? materials, scene: options => buildRegion(recipe, options),
      ...(limits[recipe] ? {limits:limits[recipe]} : {}) };
  } };
}

export function buildRegion(kind, { apertureWidth = 4, apertureDepth = 4 } = {}) {
  const shapes = [], solids = [];
  const roof = kind === 'rotunda' ? 15.2 : kind === 'columns' ? 4.4 : kind === 'threshold' ? 6.2 : 4.4;
  // The ring passage extends further so its terminal tunnel has depth.
  const minZ = kind === 'rings' || kind === 'rotunda' ? -16 : -12;
  // The rotunda's pool floor lies below the shared slab level.
  const base = kind === 'rotunda' ? -1.2 : 0;
  // The rotunda needs a wider window for its drum and ambulatory.
  const W = kind === 'rotunda' || kind === 'columns' ? 12 : 7, maxZ = kind === 'rotunda' ? 12 : 10;
  const bounds = { minX: -W, maxX: W, minZ, maxZ, ceiling: roof };
  const add = (lo, hi, material = 0, arch = null, solid = false) => {
    shapes.push({ lo, hi, material, kind: arch ? 1 : 0, radius: arch?.radius ?? 0, spring: arch?.spring ?? 0,
      density: Array(9).fill(8), probeStride: Array(9).fill(4) });
    if (solid) solids.push({ minX: lo[0], maxX: hi[0], minZ: lo[2], maxZ: hi[2] });
  };
  add([-W, base - .3, minZ], [W, base, maxZ], 2);
  shapes[0].density[3] = 24;
  add([-W - .3, base, minZ], [-W, roof + .3, maxZ]);
  add([W, base, minZ], [W + .3, roof + .3, maxZ]);
  add([-W, base, minZ - .3], [W, roof + .3, minZ]);
  add([-W, base, maxZ], [W, roof + .3, maxZ + .3]);
  const az = kind === 'threshold' ? 1.7 : kind === 'rotunda' ? 1.4 : kind === 'columns' ? 5.45 : -3.6;
  const ax = kind === 'threshold' ? 2.4 : kind === 'rotunda' ? 0 : kind === 'columns' ? -7.24 : 5.925;
  const a = { minX: ax - apertureWidth / 2, maxX: ax + apertureWidth / 2,
    minZ: az - apertureDepth / 2, maxZ: az + apertureDepth / 2, y: roof + .3 };
  const roofMaterial=['threshold','columns','rings'].includes(kind) ? 0 : 1;
  add([-W, roof, minZ], [a.minX, roof + .3, maxZ], roofMaterial);
  add([a.maxX, roof, minZ], [W, roof + .3, maxZ], roofMaterial);
  add([a.minX, roof, minZ], [a.maxX, roof + .3, a.minZ], roofMaterial);
  add([a.minX, roof, a.maxZ], [a.maxX, roof + .3, maxZ], roofMaterial);
  const arch = (z, radius, spring, width = 14, x = 0, top = 7.5) => {
    add([x - width / 2, 0, z], [x + width / 2, top, z + .5], 0, { radius, spring });
    solids.push({ minX: x - width / 2, maxX: x - radius, minZ: z, maxZ: z + .5 },
      { minX: x + radius, maxX: x + width / 2, minZ: z, maxZ: z + .5 });
  };
  // The visible cylinder and player collision share the exact disk footprint.
  const column = (x, z, r) => {
    add([x-r,0,z-r],[x+r,roof,z+r]);
    Object.assign(shapes.at(-1), { kind: 2, radius: r });
    solids.push({ kind: 'circle', x, z, radius: r });
  };
  if (kind === 'columns') {
    // A closed tiled hall. Its right side is one serpentine wall: a convex
    // nose turning away into the far passage, a long concave bay, and a convex
    // lobe near the viewer. Low sun enters a roofless court and crosses the
    // hall through tall slit windows behind the viewer, striping the bay.
    // The hall ceiling is solid.
    const bay = { x: -1.17, z: 3.02, r: 3.83 }, rad = Math.PI / 180;
    const onBay = (deg, d) => [bay.x + d * Math.cos(deg * rad), bay.z + d * Math.sin(deg * rad)];
    // Inflections at -45 and about 56 degrees; the box edges pass through both,
    // so the concave arc stops exactly where the tangent nose and lobe take over.
    // The bay arc between them is a whole number of tiles, and each surface's
    // tile phase puts a grout joint on both shared tangent lines.
    const tile = .25, lobeDeg = -45 + 27 * tile / bay.r / rad;
    const [lobeX, lobeZ] = onBay(lobeDeg, bay.r), [noseX, noseZ] = onBay(-45, bay.r);
    const lobe = onBay(lobeDeg, bay.r + .6), nose = onBay(-45, bay.r + .7);
    const phase = arc => -(arc - Math.floor(arc / tile) * tile);
    const angle = deg => Math.atan2(Math.sin(deg * rad), Math.cos(deg * rad));
    add([lobeX, 0, noseZ], [7, roof, lobe[1]]);
    Object.assign(shapes.at(-1), { kind: 4, radius: bay.r, center: [bay.x, bay.z], tilePhase: phase(angle(-45) * bay.r) });
    for (let z = noseZ; z < lobe[1]; z += .2) {
      const zc = Math.min(z + .2, lobe[1]), near = Math.max(Math.abs(z - bay.z), Math.abs(zc - bay.z)) <= bay.r
        ? bay.x + Math.sqrt(bay.r ** 2 - Math.min((z - bay.z) ** 2, (zc - bay.z) ** 2)) : lobeX;
      solids.push({ minX: Math.max(lobeX, near), maxX: 7, minZ: z, maxZ: zc });
    }
    column(lobe[0], lobe[1], .6);
    shapes.at(-1).tilePhase = phase(angle(lobeDeg + 180) * .6);
    column(nose[0], nose[1], .7);
    shapes.at(-1).tilePhase = phase(angle(135) * .7);
    column(1.55, -5, 1.2);
    column(-3, -6, 2.5);
    // Full-height slit windows between the hall and the court.
    let z0 = 1;
    for (const z of [1.9, 3.5, 5.1, 6.7, 8.3]) { add([-2.5, 0, z0], [-2.2, roof, z]); z0 = z + 1; }
    add([-2.5, 0, z0], [-2.2, roof, 10]);
    solids.push({ minX: -2.5, maxX: -2.2, minZ: 1, maxZ: 10 });
    // A wide court lets the low sun reach the slits down to the waterline.
    add([-W, 0, .7], [-2.2, roof, 1], 0, null, true);
  } else if (kind === 'rings') {
    // A row of thick transverse walls, each pierced by one equal round hole
    // on a common axis; seen through the nearest, the holes stack into a
    // chain of rings that ends in a dark round tunnel. Daylight enters each
    // segment from a side court through an opening the holes keep out of view.
    const axisY = 1.35, hole = 2.6;
    const wall = (z0, z1, radius) => {
      add([-7, 0, z0], [7, roof, z1]); Object.assign(shapes.at(-1), { kind: 9, radius, outerRadius: 20, spring: axisY });
      const gap = Math.sqrt(radius * radius - axisY * axisY);
      solids.push({ minX: -7, maxX: -gap, minZ: z0, maxZ: z1 }, { minX: gap, maxX: 7, minZ: z0, maxZ: z1 });
    };
    for (const z of [3, -.4, -3.8, -7.2]) wall(z, z + .4, hole);
    wall(minZ, -10.2, 2.3);
    // Steps against the third wall, seen through the second hole: left of
    // the third hole, parallel to the wall, descending to the right.
    for (const [x, y] of [[-3.2, 1.02], [-2.9, .82], [-2.6, .62]]) add([-7, 0, -3.4], [x, y, -2.5], 0, null, true);
    // Right side wall with one full-height opening into the court per segment,
    // except the last, so the terminal tunnel stays dark.
    let z0 = -10.2;
    for (const [lo, hi] of [[-6.6, -4], [-3.2, -.6], [.2, 2.8]]) { add([4.6, 0, z0], [4.9, roof, lo], 0, null, true); z0 = hi; }
    add([4.6, 0, z0], [4.9, roof, 3], 0, null, true);
  } else if (kind === 'rotunda') {
    // Seen from a dark antechamber through a narrow doorway in a thin, flat
    // front wall that cuts the round hall as a chord. The hall's tiled wall
    // rises without a ledge into a dome with a 3 m oculus at its crown.
    // Twelve equal round-headed openings pierce the base of the wall around
    // its full circumference. Shallow water covers the hall floor and runs
    // under the openings; a deep pit fills its centre, and the ladder stands
    // on the shallow floor at the pit's near rim. Behind the openings a dry
    // tiled ambulatory is open to daylight above.
    const R = 9.5, wall = .8, water = .55, shallow = .3, top = 5.35, open = 1.5, front = -9.2, outer = R + wall + 2.5, pit = 7.85;
    const curved = (lo, hi, extra) => { add(lo, hi); Object.assign(shapes.at(-1), extra); };
    curved([-R - wall, top, front], [R + wall, roof, R + wall], { kind: 3, radius: R, spring: top, oculus: 1.5, center: [0, 0] });
    curved([-R - wall, shallow, front], [R + wall, top, R + wall],
      { kind: 10, radius: R, outerRadius: R + wall, spring: water + 3.6 - open, openingRadius: open, openings: 12, center: [0, 0] });
    // Thin plaster front wall; the viewer stands 1.4 m behind its doorway.
    const arch = { radius: .85, spring: 2.22 };
    add([-W, base, front - .25], [W, roof, front], 1, arch);
    solids.push({ minX: -W, maxX: -arch.radius, minZ: front - .25, maxZ: front }, { minX: arch.radius, maxX: W, minZ: front - .25, maxZ: front });
    // Outer ambulatory wall, concentric with the drum.
    curved([-W, shallow, front], [W, top, maxZ], { kind: 4, radius: outer, center: [0, 0] });
    // Shallow floor everywhere except the deep central pit; a dry deck outside
    // the drum's outer face, including the antechamber.
    curved([-W, base, minZ], [W, shallow, maxZ], { kind: 4, radius: pit, center: [0, 0] });
    curved([-W, shallow, minZ], [W, .6, maxZ], { kind: 4, radius: R + wall, center: [0, 0] });
    // Walking stays in the antechamber.
    solids.push({ minX: -W, maxX: W, minZ: front - .5, maxZ });
    // The ladder stands on the shallow floor and reaches down into the pit.
    for (const x of [-.38, .38]) {
      const radius=.48, tubeRadius=.026, rail=1.18, z=-pit;
      add([x-tubeRadius, base, z-radius-tubeRadius], [x+tubeRadius, rail+radius+tubeRadius, z+radius+tubeRadius], 3);
      Object.assign(shapes.at(-1), { kind: 5, radius, tubeRadius, spring: rail });
    }
  } else if (kind === 'threshold') {
    // A narrow flooded corridor between a straight railed wall and one large
    // convex cylinder. The cylinder rises through a wider circular ceiling
    // recess; daylight reaches it down that annular gap. The corridor ends in
    // a taller hall lit from its own roof; the sky itself is never in view.
    // L is the corridor's left wall face; the far doorway is narrow and tall
    // under a lintel, and the recess edge lands just over its pillar.
    const cx=2.4, cz=1, radius=3.3, recess=3.9, lowRoof=4.2, hallZ=-5, L=-3.2, door=-1.4;
    add([cx-radius,0,cz-radius],[cx+radius,roof,cz+radius]);
    Object.assign(shapes.at(-1),{kind:2,radius});
    solids.push({kind:'circle',x:cx,z:cz,radius});
    add([cx-recess,lowRoof,cz-recess],[cx+recess,roof,cz+recess]);
    Object.assign(shapes.at(-1),{kind:4,radius:recess});
    // Corridor ceiling around the recess; it stops at the hall threshold.
    // Daylight also falls into the void above the corridor ceiling; its
    // bounced light reaches the corridor through a slot behind the viewer,
    // lighting the near column and the cylinder's camera-facing side.
    add([-7,lowRoof,hallZ],[cx-recess,lowRoof+.25,9.2]);
    add([cx-recess,lowRoof,cz+recess],[7,lowRoof+.25,9.2]);
    add([cx-recess,lowRoof,hallZ],[7,lowRoof+.25,cz-recess]);
    add([cx+recess,lowRoof,cz-recess],[7,lowRoof+.25,cz+recess]);
    // Straight left wall with a low dark opening at the waterline.
    add([L-.3,.62,hallZ],[L,lowRoof,10]);
    add([L-.3,0,hallZ],[L,.62,1]);add([L-.3,0,2.8],[L,.62,10]);
    solids.push({minX:L-.3,maxX:L,minZ:hallZ,maxZ:10});
    // Near round column at the corridor mouth.
    add([L-.5,0,6.05],[L+.6,lowRoof,7.15]);
    Object.assign(shapes.at(-1),{kind:2,radius:.55});
    solids.push({kind:'circle',x:L+.05,z:6.6,radius:.55});
    // Square pillar, lintel and return wall framing the doorway to the hall.
    add([door,0,-5.6],[0,lowRoof+.25,-4.9]);
    add([L,lowRoof-.35,-5.6],[door,lowRoof+.25,-4.9]);
    add([0,0,-5.6],[7,lowRoof+.25,-1.4]);
    solids.push({minX:door,maxX:7,minZ:-5.6,maxZ:-1.4});
    // Free-standing stainless rails: horizontal tubes on vertical posts that
    // stand in the water, not brackets on the tiles.
    const tube=.024, height=1.02;
    const rail=(axis,lo,hi)=>{add(lo,hi,3);Object.assign(shapes.at(-1),{kind:6,axis,radius:tube});};
    const post=(x,z)=>{add([x-tube,0,z-tube],[x+tube,height,z+tube],3);Object.assign(shapes.at(-1),{kind:2,radius:tube});};
    const rx=L+.35;
    rail(2,[rx-tube,height-tube,-4.6],[rx+tube,height+tube,5.4]);
    for(const z of [4.6,2.2,-.2,-2.6]) post(rx,z);
    solids.push({minX:L,maxX:rx+tube,minZ:-4.6,maxZ:5.4});
    rail(0,[door-.5,height-tube,-5.25-tube],[door,height+tube,-5.25+tube]);
    post(door-.5,-5.25);
    solids.push({minX:door-.5,maxX:door,minZ:-5.25-tube,maxZ:-5.25+tube});
    rail(0,[-6.6,height-tube,-9-tube],[1.4,height+tube,-9+tube]);
    for(const x of [-5.4,-3.2,-1,1.2]) post(x,-9);
    solids.push({minX:-6.6,maxX:1.4,minZ:-9-tube,maxZ:-9+tube});
  } else throw Error('Unknown region recipe');
  // The rotunda spawn faces +z, with screen-right along -x. Sun from +x
  // projects the crown oculus onto the right half of the basin.
  const illumination = kind === 'columns' ? { sun: [6,5.58,4.69], skyScale: 4, sunDirection: [-.882,.259,.394] } : kind === 'rotunda' ? { sun: [5,4.65,3.91], skyScale: 16, sunDirection: [.17,.95,.18] } : kind === 'rings' ? { sun: [6,5.58,4.69], skyScale: 36, sunDirection: [.75,.6,.25] } : kind === 'threshold' ? {sun:[1.5,1.4,1.18],skyScale:32,sunDirection:[-.102,.978,.181]} : undefined;
  // The complete flooded hall fits inside this simulation rectangle. Do not
  // spend finite-depth updates on the surrounding dry deck and entrance hall.
  const waterBounds = kind === 'rotunda' ? {minX:-10.5,maxX:10.5,minZ:-10.5,maxZ:10.5}
    : kind === 'columns' ? {minX:-2.5,maxX:7,minZ:-12,maxZ:10} : bounds;
  return { bounds, shapes, solids, illumination, conductorMaterials: ['rotunda','threshold'].includes(kind) ? [3] : undefined,
    reflectionSamples: kind === 'rotunda' ? {glaze:24,rough:32} : kind === 'threshold' ? {glaze:8,rough:16} : undefined,
    groutHalfWidth: ['columns','rotunda','threshold'].includes(kind) ? .0012 : undefined,
    tileSize: kind === 'threshold' ? thresholdTileSize : undefined,
    water: { ...waterBounds, cell: 1 / 32 }, aperture: a, floor: { shape: 0, face: 3 } };
}
