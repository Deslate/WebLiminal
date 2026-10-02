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
    if (recipe === 'columns') { spawn.x = -2; spawn.yaw = -.18; optics.waterLevel = .65; }
    if (recipe === 'rings') { optics.apertureWidth = 5; optics.apertureDepth = 9; }
    if (recipe === 'rotunda') { spawn.z = -5.35; spawn.y = 2.24; spawn.yaw = Math.PI; spawn.pitch = -.12; optics.apertureWidth = 7; optics.apertureDepth = 9; optics.exposure = 2.5; optics.focalLength = 18; optics.waveAmplitude = .006; }
    if (recipe === 'threshold') { spawn.x = -1.2; optics.apertureWidth = 6; optics.apertureDepth = 6; }
    return { spawn, optics, materials, scene: options => buildRegion(recipe, options) };
  } };
}

export function buildRegion(kind, { apertureWidth = 4, apertureDepth = 4 } = {}) {
  const shapes = [], solids = [];
  const roof = kind === 'rotunda' ? 8.5 : 7.5;
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
  const az = kind === 'threshold' ? -4 : kind === 'rotunda' ? 3 : 1;
  const ax = kind === 'rotunda' ? 0 : -2.5;
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
  // Exact analytic columns; collision uses conservative narrow strips.
  const column = (x, z, r) => {
    add([x-r,0,z-r],[x+r,7.5,z+r]);
    Object.assign(shapes.at(-1), { kind: 2, radius: r });
    for (let i = 0; i < 16; i++) {
      const z0 = -r + 2 * r * i / 16, z1 = -r + 2 * r * (i + 1) / 16;
      const near = z0 <= 0 && z1 >= 0 ? 0 : Math.min(Math.abs(z0), Math.abs(z1));
      const w = Math.sqrt(r * r - near ** 2);
      solids.push({ minX: x-w, maxX: x+w, minZ: z+z0, maxZ: z+z1 });
    }
  };
  if (kind === 'columns') {
    column(3.4, -.8, 2.2); column(-4.9, -6.8, 1.8);
    arch(-9.8, 2.2, 2.2);
    for (const z of [a.minZ + .8, a.minZ + 2.1]) add([a.minX, 7.35, z], [a.maxX, 7.8, z + .28], 1);
  } else if (kind === 'rings') {
    for (const z of [4, .5, -3, -6.5, -10]) arch(z, 2.9, .6);
    for (let i = 0; i < 3; i++) add([-6.8, 0, 4.7 + i * .45], [-3.3, .16 + i * .14, 7.7], 0, null, true);
  } else if (kind === 'rotunda') {
    // One analytic hemispherical intrados, with an equal-area light chart.
    add([-7, 2.2, -6], [7, 8.5, 6]);
    Object.assign(shapes.at(-1), { kind: 3, radius: 6, spring: 2.2, oculus: 1.5 });
    for(let i=0;i<8;i++){
      const z0=-6+i*.15,z1=z0+.15;
      const radius=Math.sqrt(Math.max(0,36-z0*z0));
      solids.push({minX:-7,maxX:-Math.max(radius,.01),minZ:z0,maxZ:z1},
        {minX:Math.max(radius,.01),maxX:7,minZ:z0,maxZ:z1});
    }
    // Daylight enters a shared lightwell behind the arcade.
    for (const x of [-4.6, -2.3, 0, 2.3, 4.6]) arch(6.1, .84, 1.5, 2.3, x, 7.5);
    // Dry deck bounds a circular basin; its submerged floor stays a true receiver.
    for (let i = 0; i < 20; i++) {
      const z0 = -6 + i * .6, z1 = z0 + .6;
      const r = Math.sqrt(Math.max(0, 4.7 ** 2 - ((z0 + z1) / 2) ** 2));
      add([-7, 0, z0], [-Math.max(r, .01), .62, z1]);
      add([Math.max(r, .01), 0, z0], [7, .62, z1]);
    }
    // Walking stays on the front deck until vertical locomotion is supported.
    solids.push({ minX: -7, maxX: 7, minZ: -4.85, maxZ: 10 });
    add([-7, 0, 6], [7, .62, 10]);
    add([-7, 0, -12], [7, .62, -6]);
    for (const x of [-.75, .75]) {
      add([x - .035, .62, -5], [x + .035, 1.6, -4.93], 3, null, true);
      add([x - .035, 1.53, -5], [x + .035, 1.6, -3.7], 3);
      add([x - .035, 0, -3.77], [x + .035, 1.6, -3.7], 3, null, true);
    }
  } else if (kind === 'threshold') {
    arch(2.2, 2.4, 2.2); arch(-2, 4.4, 1.8);
    add([-7, 3.8, 2.7], [7, 4.15, 10], 1);
    add([-4.8, 0, 4.3], [-3.6, 3.8, 5.5], 0, null, true);
    add([2.5, 0, 4.3], [3.7, 3.8, 5.5], 0, null, true);
    add([-5.8, 0, -9], [-4.6, 7.5, -7.8], 0, null, true);
  } else throw Error('Unknown region recipe');
  return { bounds, shapes, solids, water: { ...bounds, cell: 1 / 32 }, aperture: a, floor: { shape: 0, face: 3 } };
}
