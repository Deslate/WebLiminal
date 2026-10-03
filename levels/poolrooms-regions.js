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
  columns: { apertureWidth: [.5, 3.6], apertureDepth: [.5, 8.9] },
  rings: { apertureWidth: [.5, 2.05], apertureDepth: [.5, 13] },
  rotunda: { apertureWidth: [.5, 13.8], apertureDepth: [.5, 11.9] },
  threshold: { apertureWidth: [.5, 8.9], apertureDepth: [.5, 17.1] },
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
    if (recipe === 'columns') { spawn.x = -1; spawn.z = 8.5; spawn.yaw = -.3; spawn.pitch = .02; optics.waterLevel = .58; optics.apertureWidth = 3.6; optics.apertureDepth = 8.9; optics.exposure = 1.15; optics.focalLength = 20; }
    if (recipe === 'rings') { spawn.x = 1.3; spawn.z = 5.8; spawn.yaw = .085; spawn.pitch = -.02; optics.apertureWidth = 2.05; optics.apertureDepth = 13; optics.focalLength = 12; }
    if (recipe === 'rotunda') { spawn.z = -5.25; spawn.y = 2.24; spawn.yaw = Math.PI; spawn.pitch = .02; optics.waterLevel = .55; optics.apertureWidth = 13.8; optics.apertureDepth = 11.9; optics.exposure = 2.3; optics.focalLength = 12; optics.waveAmplitude = .012; }
    if (recipe === 'threshold') { spawn.x = -1.8; spawn.z = 8.4; spawn.pitch = 0; optics.apertureWidth = 8.9; optics.apertureDepth = 17.1; optics.focalLength = 18; }
    return { spawn, optics, materials: materials[recipe] ?? materials, scene: options => buildRegion(recipe, options),
      ...(limits[recipe] ? {limits:limits[recipe]} : {}) };
  } };
}

export function buildRegion(kind, { apertureWidth = 4, apertureDepth = 4 } = {}) {
  const shapes = [], solids = [];
  const roof = kind === 'rotunda' ? 9.5 : kind === 'columns' ? 5.2 : kind === 'threshold' ? 6.2 : 4.4;
  // The ring passage extends further so its terminal tunnel has depth.
  const minZ = kind === 'rings' ? -16 : -12;
  const bounds = { minX: -7, maxX: 7, minZ, maxZ: 10, ceiling: roof };
  const add = (lo, hi, material = 0, arch = null, solid = false) => {
    shapes.push({ lo, hi, material, kind: arch ? 1 : 0, radius: arch?.radius ?? 0, spring: arch?.spring ?? 0,
      density: Array(9).fill(8), probeStride: Array(9).fill(4) });
    if (solid) solids.push({ minX: lo[0], maxX: hi[0], minZ: lo[2], maxZ: hi[2] });
  };
  add([-7, -.3, minZ], [7, 0, 10], 2);
  shapes[0].density[3] = 24;
  add([-7.3, 0, minZ], [-7, roof + .3, 10]);
  add([7, 0, minZ], [7.3, roof + .3, 10]);
  add([-7, 0, minZ - .3], [7, roof + .3, minZ]);
  add([-7, 0, 10], [7, roof + .3, 10.3]);
  const az = kind === 'threshold' ? -3.35 : kind === 'rotunda' ? 3.95 : kind === 'columns' ? 5.45 : -3.6;
  const ax = kind === 'threshold' ? 2.4 : kind === 'rotunda' ? 0 : kind === 'columns' ? -4.3 : 5.925;
  const a = { minX: ax - apertureWidth / 2, maxX: ax + apertureWidth / 2,
    minZ: az - apertureDepth / 2, maxZ: az + apertureDepth / 2, y: roof + .3 };
  const roofMaterial=['threshold','columns','rings'].includes(kind) ? 0 : 1;
  add([-7, roof, minZ], [a.minX, roof + .3, 10], roofMaterial);
  add([a.maxX, roof, minZ], [7, roof + .3, 10], roofMaterial);
  add([a.minX, roof, minZ], [a.maxX, roof + .3, a.minZ], roofMaterial);
  add([a.minX, roof, a.maxZ], [a.maxX, roof + .3, 10], roofMaterial);
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
    // A closed tiled hall around one large convex cylinder. Low sun enters a
    // roofless light court and crosses the hall through tall slit windows
    // behind the viewer, striping the cylinder. The hall ceiling is solid.
    column(5, .5, 4);
    column(1.9, -3.1, 1.2);
    column(-3, -6, 2.5);
    column(1.4, 5.9, .28);
    // Full-height slit windows between the hall and the court.
    let z0 = 1;
    for (const z of [1.9, 3.5, 5.1, 6.7, 8.3]) { add([-2.5, 0, z0], [-2.2, roof, z]); z0 = z + 1; }
    add([-2.5, 0, z0], [-2.2, roof, 10]);
    solids.push({ minX: -2.5, maxX: -2.2, minZ: 1, maxZ: 10 });
    // The court is shallow, so only high rays clear its roof edge.
    add([-7, 0, .7], [-2.2, roof, 1], 0, null, true);
    add([-6.4, 0, 1], [-6.1, roof, 10], 0, null, true);
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
    // Steps against the second wall, left of its hole, run parallel to the
    // wall and descend to the right into the water.
    for (const [x, y] of [[-3.2, 1.02], [-2.9, .82], [-2.6, .62]]) add([-7, 0, 0], [x, y, .9], 0, null, true);
    // Right side wall with one full-height opening into the court per segment.
    let z0 = -10.2;
    for (const [lo, hi] of [[-10, -7.4], [-6.6, -4], [-3.2, -.6], [.2, 2.8]]) { add([4.6, 0, z0], [4.9, roof, lo], 0, null, true); z0 = hi; }
    add([4.6, 0, z0], [4.9, roof, 3], 0, null, true);
  } else if (kind === 'rotunda') {
    // A domed round chamber. Ten equal round-headed openings pierce the drum
    // at even intervals around its full circumference; the viewer stands in
    // one of them, looking across the basin. Daylight fills the well outside
    // the far and side openings.
    const R = 4.2, wall = 1, deck = .62, top = deck + 3.3;
    const curved = (lo, hi, extra) => { add(lo, hi); Object.assign(shapes.at(-1), extra); };
    curved([-R - wall, top, -R - wall], [R + wall, roof, R + wall], { kind: 3, radius: R, spring: top, oculus: 0 });
    // The drum sits slightly into the deck so the floor joint is closed.
    curved([-R - wall, deck - .05, -R - wall], [R + wall, top, R + wall],
      { kind: 10, radius: R, outerRadius: R + wall, spring: deck + 1.9, openingRadius: .75, openings: 10 });
    // Dry deck with an exact circular basin.
    curved([-7, 0, -12], [7, deck, 10], { kind: 4, radius: 3, center: [0, 0] });
    // Walking stays in the entrance opening and the dark well behind it.
    solids.push({ minX: -7, maxX: 7, minZ: -4, maxZ: 10 },
      { minX: -7, maxX: -.75, minZ: -R - wall, maxZ: -4 }, { minX: .75, maxX: 7, minZ: -R - wall, maxZ: -4 });
    for (const x of [-.6, .6]) {
      const radius=.48, tubeRadius=.026, rail=1.18, z=-3.02;
      add([x-tubeRadius, 0, z-radius-tubeRadius], [x+tubeRadius, rail+radius+tubeRadius, z+radius+tubeRadius], 3);
      Object.assign(shapes.at(-1), { kind: 5, radius, tubeRadius, spring: rail });
    }
  } else if (kind === 'threshold') {
    // A narrow flooded corridor between a straight railed wall and one large
    // convex cylinder. The cylinder rises through a wider circular ceiling
    // recess; daylight reaches it down that annular gap. The corridor ends in
    // a taller hall lit from its own roof; the sky itself is never in view.
    const cx=2.4, cz=1, radius=3.3, recess=4.5, lowRoof=3.4, hallZ=-5;
    add([cx-radius,0,cz-radius],[cx+radius,roof,cz+radius]);
    Object.assign(shapes.at(-1),{kind:2,radius});
    solids.push({kind:'circle',x:cx,z:cz,radius});
    add([cx-recess,lowRoof,cz-recess],[cx+recess,roof,cz+recess]);
    Object.assign(shapes.at(-1),{kind:4,radius:recess});
    // Corridor ceiling around the recess; it stops at the hall threshold.
    add([-7,lowRoof,hallZ],[cx-recess,lowRoof+.25,10]);
    add([cx-recess,lowRoof,cz+recess],[7,lowRoof+.25,10]);
    add([cx-recess,lowRoof,hallZ],[7,lowRoof+.25,cz-recess]);
    add([cx+recess,lowRoof,cz-recess],[7,lowRoof+.25,cz+recess]);
    // Straight left wall with a low dark opening at the waterline.
    add([-3.9,.62,hallZ],[-3.6,lowRoof,10]);
    add([-3.9,0,hallZ],[-3.6,.62,1]);add([-3.9,0,2.8],[-3.6,.62,10]);
    solids.push({minX:-3.9,maxX:-3.6,minZ:hallZ,maxZ:10});
    // Near round column at the corridor mouth.
    add([-4.15,0,5.8],[-2.55,lowRoof,7.4]);
    Object.assign(shapes.at(-1),{kind:2,radius:.8});
    solids.push({kind:'circle',x:-3.35,z:6.6,radius:.8});
    // Square pillar and return wall closing the right side at the hall.
    add([-.7,0,-5.6],[0,lowRoof+.25,-4.9]);
    add([0,0,-5.6],[7,lowRoof+.25,-1.4]);
    solids.push({minX:-.7,maxX:7,minZ:-5.6,maxZ:-1.4});
    // Free-standing stainless rails: horizontal tubes on vertical posts that
    // stand in the water, not brackets on the tiles.
    const tube=.024, height=1.02;
    const rail=(axis,lo,hi)=>{add(lo,hi,3);Object.assign(shapes.at(-1),{kind:6,axis,radius:tube});};
    const post=(x,z)=>{add([x-tube,0,z-tube],[x+tube,height,z+tube],3);Object.assign(shapes.at(-1),{kind:2,radius:tube});};
    rail(2,[-3.25-tube,height-tube,-4.6],[-3.25+tube,height+tube,5.4]);
    for(const z of [4.6,2.2,-.2,-2.6]) post(-3.25,z);
    solids.push({minX:-3.6,maxX:-3.25+tube,minZ:-4.6,maxZ:5.4});
    rail(0,[-1.2,height-tube,-5.25-tube],[-.7,height+tube,-5.25+tube]);
    post(-1.2,-5.25);
    solids.push({minX:-1.2,maxX:-.7,minZ:-5.25-tube,maxZ:-5.25+tube});
    rail(0,[-6.6,height-tube,-9-tube],[1.4,height+tube,-9+tube]);
    for(const x of [-5.4,-3.2,-1,1.2]) post(x,-9);
    solids.push({minX:-6.6,maxX:1.4,minZ:-9-tube,maxZ:-9+tube});
  } else throw Error('Unknown region recipe');
  const illumination = kind === 'columns' ? { sun: [6,5.58,4.69], skyScale: 4, sunDirection: [-.791,.5,.353] } : kind === 'rotunda' ? { sun: [5,4.65,3.91], skyScale: 5 } : kind === 'rings' ? { sun: [6,5.58,4.69], skyScale: 4, sunDirection: [.75,.6,.25] } : kind === 'threshold' ? {sun:[0,0,0],skyScale:4} : undefined;
  // The complete 6 m basin fits inside this simulation rectangle. Do not
  // spend finite-depth updates on the surrounding dry deck and entrance hall.
  const waterBounds = kind === 'rotunda' ? {minX:-3.5,maxX:3.5,minZ:-3.5,maxZ:3.5} : bounds;
  return { bounds, shapes, solids, illumination, conductorMaterials: ['rotunda','threshold'].includes(kind) ? [3] : undefined,
    reflectionSamples: kind === 'rotunda' ? {glaze:24,rough:32} : kind === 'threshold' ? {glaze:8,rough:16} : undefined,
    groutHalfWidth: ['columns','rotunda','threshold'].includes(kind) ? .0012 : undefined,
    tileSize: kind === 'threshold' ? thresholdTileSize : undefined,
    water: { ...waterBounds, cell: 1 / 32 }, aperture: a, floor: { shape: 0, face: 3 } };
}
