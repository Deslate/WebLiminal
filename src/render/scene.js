// Engine side of the scene description. A level supplies plain data (see
// docs/LEVELS.md); this module packs it for the GPU and derives the constants
// that shaders need at compile time. It knows no level by name.
import { buildLightAtlases } from "./light-atlas.js";

export const SHAPE_WORDS = 16;
const FACES = 9;
// Background water time step (s); the simulation advances in whole steps.
export const WATER_DT = 1 / 60;

export function waterGrid(water) {
  const nx = Math.round((water.maxX - water.minX) / water.cell),
    nz = Math.round((water.maxZ - water.minZ) / water.cell);
  if (Math.abs(nx * water.cell - (water.maxX - water.minX)) > 1e-9 || Math.abs(nz * water.cell - (water.maxZ - water.minZ)) > 1e-9)
    throw new Error("The water rectangle must be a whole number of simulation cells.");
  return { nx, nz, dx: water.cell, dt: WATER_DT, minX: water.minX, minZ: water.minZ };
}

// Material ids 9 (water) and 10 (player body) are reserved by the engine.
export const RESERVED_MATERIALS = [9, 10];

export function validateScene(scene) {
  const fail = (message) => {
    throw new Error(`Invalid scene description: ${message}.`);
  };
  const { bounds, shapes, solids, water, aperture, floor } = scene;
  if (scene.reflectionSamples && !['glaze','rough'].every(k=>Number.isInteger(scene.reflectionSamples[k])&&scene.reflectionSamples[k]>=8&&scene.reflectionSamples[k]<=128)) fail('invalid reflection quadrature');
  if (scene.conductorMaterials && (!Array.isArray(scene.conductorMaterials) || new Set(scene.conductorMaterials).size !== scene.conductorMaterials.length || scene.conductorMaterials.some(id=>!Number.isInteger(id)||id<0||RESERVED_MATERIALS.includes(id)))) fail('invalid conductor material slots');
  if (scene.groutHalfWidth !== undefined && !(Number.isFinite(scene.groutHalfWidth)&&scene.groutHalfWidth>0&&scene.groutHalfWidth<.01)) fail('invalid grout width');
  if (scene.illumination && (!(Number.isFinite(scene.illumination.skyScale)&&scene.illumination.skyScale>0)||!Array.isArray(scene.illumination.sun)||scene.illumination.sun.length!==3||!scene.illumination.sun.every(v=>Number.isFinite(v)&&v>=0))) fail('invalid illumination');
  if (!(bounds.minX < bounds.maxX && bounds.minZ < bounds.maxZ && bounds.ceiling > 0)) fail("empty bounds");
  if (!shapes.length) fail("no shapes");
  shapes.forEach((s, i) => {
    if (![0, 1, 2].every((k) => s.lo[k] < s.hi[k])) fail(`shape ${i} has lo >= hi`);
    if (!Number.isInteger(s.material) || s.material < 0 || RESERVED_MATERIALS.includes(s.material)) fail(`shape ${i} uses material ${s.material}`);
    if (s.kind === 1 && !(s.radius > 0 && 2 * s.radius < s.hi[0] - s.lo[0])) fail(`arch ${i} radius does not fit its box`);
    if (![0, 1, 2, 3, 4, 5].includes(s.kind)) fail(`shape ${i} has unsupported kind`);
    if (s.kind >= 2 && s.kind <= 4 && !(s.radius > 0 && 2 * s.radius <= Math.min(s.hi[0] - s.lo[0], s.hi[2] - s.lo[2]) + 1e-9)) fail(`curved shape ${i} radius does not fit`);
    if (s.kind === 5 && !(s.radius > 0 && s.tubeRadius > 0 && s.tubeRadius < s.radius && s.spring > s.lo[1])) fail(`tube ${i} has invalid sweep`);
    if (s.kind === 3 && !(s.lo[1] === s.spring && s.hi[1] >= s.spring + s.radius)) fail(`dome ${i} must contain its upper hemisphere`);
    if (s.oculus !== undefined && !(s.kind === 3 && s.oculus >= 0 && s.oculus < s.radius)) fail(`shape ${i} has invalid oculus`);
    for (const key of ["density", "probeStride"]) if (s[key] && s[key].length !== FACES) fail(`shape ${i} ${key} needs ${FACES} entries`);
  });
  for (const b of solids) {
    if (b.kind === 'circle') {
      if (![b.x, b.z, b.radius].every(Number.isFinite) || b.radius <= 0) fail('invalid circular footprint');
    } else if (!(b.minX < b.maxX && b.minZ < b.maxZ)) fail("empty solid footprint");
  }
  if (!(water.minX < water.maxX && water.minZ < water.maxZ && water.cell > 0)) fail("empty water rectangle");
  waterGrid(water);
  if (!(aperture.minX < aperture.maxX && aperture.minZ < aperture.maxZ)) fail("empty aperture");
  if (!shapes[floor.shape] || !(floor.face >= 0 && floor.face < 6)) fail("floor receiver is not a planar shape face");
  return scene;
}

export function packScene(scene, gridScale = 1) {
  validateScene(scene);
  const { shapes } = scene;
  const geometryData = new ArrayBuffer(shapes.length * SHAPE_WORDS * 4),
    f = new Float32Array(geometryData),
    u = new Uint32Array(geometryData);
  shapes.forEach((s, i) => {
    f.set([...s.lo, 0, ...s.hi, 0], i * SHAPE_WORDS);
    u.set([s.material, s.kind, i * FACES, 0], i * SHAPE_WORDS + 8);
    f.set([s.radius, s.spring, s.oculus ?? s.tubeRadius ?? 0, 0], i * SHAPE_WORDS + 12);
  });
  const a = scene.aperture;
  return {
    shapes,
    solids: scene.solids,
    bounds: scene.bounds,
    geometryData,
    ...buildLightAtlases(shapes, gridScale),
    aperture: [a.minX, a.maxX, a.minZ, a.maxZ],
    floorSid: scene.floor.shape * FACES + scene.floor.face,
  };
}

// WGSL float literal; integers keep a trailing point so they stay floats.
const wgslFloat = (v) => (Number.isInteger(v) ? `${v}.` : String(v));

// Compile-time scene constants. Everything here is fixed for the lifetime of
// a loaded level; values that can change at runtime (the aperture rectangle,
// water height) travel in uniforms instead.
export function sceneShaderPrelude(scene) {
  const w = scene.water,
    grid = waterGrid(w);
  return `// Scene constants derived from the level's scene description.
const WATER_MIN=vec2f(${wgslFloat(w.minX)},${wgslFloat(w.minZ)});
const WATER_MAX=vec2f(${wgslFloat(w.maxX)},${wgslFloat(w.maxZ)});
const WATER_SIZE=WATER_MAX-WATER_MIN;
const WATER_NX:u32=${grid.nx}u;
const WATER_NZ:u32=${grid.nz}u;
const WATER_DX=${wgslFloat(w.cell)};
const WATER_CELLS_PER_METRE=${wgslFloat(1 / w.cell)};
const OPENING_Y=${wgslFloat(scene.aperture.y)};
const FLOOR_SID:u32=${scene.floor.shape * FACES + scene.floor.face}u;
`;
}
