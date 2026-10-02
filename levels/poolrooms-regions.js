// Authored landmarks in one world. The resolver accepts spatial addresses;
// bookmarks are navigation data, never a level registry or generator index.
import { buildPoolroomsScene } from './poolrooms-scene.js';

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

export function createPoolroomsWorld(data, materials) {
  return { bookmarks, generate(address) {
    if (!Number.isSafeInteger(address.x) || !Number.isSafeInteger(address.z)) throw Error('Invalid world address');
    const recipe = authoredCells.get(`${address.x},${address.z}`);
    if (recipe === 'origin') return { spawn: { ...data.spawn }, optics: { ...data.optics }, scene: options => buildPoolroomsScene(data, options) };
    // Unknown cells are intentionally absent until the seeded generator exists.
    if (!recipe) throw Error(`Unloaded Poolrooms address: ${address.x},${address.z}`);
    const optics = { ...data.optics, apertureWidth: 4, apertureDepth: 4, exposure: 1.35 };
    const spawn = { x: 0, y: 1.62, z: 7, yaw: 0, pitch: -.12 };
    if (recipe === 'columns') { spawn.x = -2.4; spawn.yaw = -.32; spawn.pitch = -.04; optics.waterLevel = .58; optics.apertureWidth = 3.2; optics.apertureDepth = 5.6; optics.exposure = 1.15; optics.focalLength = 26; }
    if (recipe === 'rings') { optics.apertureWidth = 5; optics.apertureDepth = 9; }
    if (recipe === 'rotunda') { spawn.z = -8.2; spawn.y = 2.24; spawn.yaw = Math.PI; spawn.pitch = .02; optics.waterLevel = .55; optics.apertureWidth = 7.8; optics.apertureDepth = 9; optics.exposure = 2.3; optics.focalLength = 24; optics.waveAmplitude = .012; }
    if (recipe === 'threshold') { spawn.x = -1.2; optics.apertureWidth = 6; optics.apertureDepth = 6; }
    return { spawn, optics, materials: materials[recipe] ?? materials, scene: options => buildRegion(recipe, options) };
  } };
}

export function buildRegion(kind, { apertureWidth = 4, apertureDepth = 4 } = {}) {
  const shapes = [], solids = [];
  const roof = kind === 'rotunda' ? 9.5 : kind === 'columns' ? 5.4 : 7.5;
  const bounds = { minX: -7, maxX: 7, minZ: -12, maxZ: 10, ceiling: roof };
  const add = (lo, hi, material = 0, arch = null, solid = false) => {
    shapes.push({ lo, hi, material, kind: arch ? 1 : 0, radius: arch?.radius ?? 0, spring: arch?.spring ?? 0,
      density: Array(9).fill(8), probeStride: Array(9).fill(4) });
    if (solid) solids.push({ minX: lo[0], maxX: hi[0], minZ: lo[2], maxZ: hi[2] });
  };
  add([-7, -.3, -12], [7, 0, 10], 2);
  shapes[0].density[3] = 24;
  add([-7.3, 0, -12], [-7, roof + .3, 10]);
  add([7, 0, -12], [7.3, roof + .3, 10]);
  add([-7, 0, -12.3], [7, roof + .3, -12]);
  add([-7, 0, 10], [7, roof + .3, 10.3]);
  const az = kind === 'threshold' ? -4 : kind === 'rotunda' ? 5.25 : kind === 'columns' ? 2 : 1;
  const ax = kind === 'rotunda' ? 0 : kind === 'columns' ? .2 : -2.5;
  const a = { minX: ax - apertureWidth / 2, maxX: ax + apertureWidth / 2,
    minZ: az - apertureDepth / 2, maxZ: az + apertureDepth / 2, y: roof + .3 };
  add([-7, roof, -12], [a.minX, roof + .3, 10], 1);
  add([a.maxX, roof, -12], [7, roof + .3, 10], 1);
  add([a.minX, roof, -12], [a.maxX, roof + .3, a.minZ], 1);
  add([a.minX, roof, a.maxZ], [a.maxX, roof + .3, 10], 1);
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
    column(5.7, -.8, 3.2); column(-2.5, -6.8, 1.65);
    column(9.5, 6.5, 4.5);
    arch(-10.6, 2.2, 1.7, 14, 0, roof);
    // Narrow structural slots project several hard-edged sun bands.
    for (const z of [a.minZ + 1.35, a.minZ + 3.15]) add([a.minX, roof-.15, z], [a.maxX, roof+.3, z + .3], 1);
  } else if (kind === 'rings') {
    for (const z of [4, .5, -3, -6.5, -10]) arch(z, 2.9, .6);
    for (let i = 0; i < 3; i++) add([-6.8, 0, 4.7 + i * .45], [-3.3, .16 + i * .14, 7.7], 0, null, true);
  } else if (kind === 'rotunda') {
    // One analytic hemispherical intrados, with an equal-area light chart.
    add([-7, 3.2, -6], [7, 9.5, 6]);
    Object.assign(shapes.at(-1), { kind: 3, radius: 6, spring: 3.2, oculus: 0 });
    for(let i=0;i<8;i++){
      const z0=-6+i*.15,z1=z0+.15;
      const radius=Math.sqrt(Math.max(0,36-z0*z0));
      solids.push({minX:-7,maxX:-Math.max(radius,.01),minZ:z0,maxZ:z1},
        {minX:Math.max(radius,.01),maxX:7,minZ:z0,maxZ:z1});
    }
    // Daylight enters a shared lightwell behind the arcade.
    for (const x of [-4.6, -2.3, 0, 2.3, 4.6]) arch(4.65, .86, 2.05, 2.3, x, 3.2);
    // Dry deck bounds a circular basin; its submerged floor stays a true receiver.
    add([-7, 0, -6], [7, .62, 6]);
    Object.assign(shapes.at(-1), { kind: 4, radius: 4.7 });
    // Walking stays on the front deck until vertical locomotion is supported.
    solids.push({ minX: -7, maxX: 7, minZ: -4.85, maxZ: 10 });
    add([-7, 0, 6], [7, .62, 10]);
    add([-7, 0, -12], [7, .62, -6]);
    arch(-6.7, 3.15, 1.6, 14, 0, roof);
    for (const x of [-.65, .65]) {
      const radius=.48, tubeRadius=.026, spring=1.18, z=-4.72;
      add([x-tubeRadius, 0, z-radius-tubeRadius], [x+tubeRadius, spring+radius+tubeRadius, z+radius+tubeRadius], 3);
      Object.assign(shapes.at(-1), { kind: 5, radius, tubeRadius, spring });
      solids.push({ kind: 'circle', x, z: z-radius, radius: tubeRadius });
    }
  } else if (kind === 'threshold') {
    arch(2.2, 2.4, 2.2); arch(-2, 4.4, 1.8);
    add([-7, 3.8, 2.7], [7, 4.15, 10], 1);
    add([-4.8, 0, 4.3], [-3.6, 3.8, 5.5], 0, null, true);
    add([2.5, 0, 4.3], [3.7, 3.8, 5.5], 0, null, true);
    add([-5.8, 0, -9], [-4.6, 7.5, -7.8], 0, null, true);
  } else throw Error('Unknown region recipe');
  const illumination = kind === 'columns' ? { sun: [6,5.58,4.69], skyScale: 4 } : kind === 'rotunda' ? { sun: [5,4.65,3.91], skyScale: 5 } : undefined;
  // The complete 9.4 m basin fits inside this simulation rectangle. Do not
  // spend finite-depth updates on the surrounding dry deck and entrance hall.
  const waterBounds = kind === 'rotunda' ? {minX:-5,maxX:5,minZ:-5,maxZ:5} : bounds;
  return { bounds, shapes, solids, illumination, conductorMaterials: kind === 'rotunda' ? [3] : undefined,
    reflectionSamples: kind === 'rotunda' ? {glaze:24,rough:32} : undefined,
    groutHalfWidth: ['columns','rotunda'].includes(kind) ? .0012 : undefined,
    water: { ...waterBounds, cell: 1 / 32 }, aperture: a, floor: { shape: 0, face: 3 } };
}
