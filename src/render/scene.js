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
  if (scene.tileSize !== undefined && !(Number.isFinite(scene.tileSize)&&scene.tileSize>.04&&scene.tileSize<1)) fail('invalid tile module');
  if (scene.illumination && (!(Number.isFinite(scene.illumination.skyScale)&&scene.illumination.skyScale>0)||!Array.isArray(scene.illumination.sun)||scene.illumination.sun.length!==3||!scene.illumination.sun.every(v=>Number.isFinite(v)&&v>=0))) fail('invalid illumination');
  if (scene.wallApertures !== undefined && !(Array.isArray(scene.wallApertures) && scene.wallApertures.length <= 8 && scene.wallApertures.every(a =>
    [0, 2].includes(a.axis) && Number.isFinite(a.at) && [1, -1].includes(a.outward) && a.from?.length === 2 && a.to?.length === 2
    && [...a.from, ...a.to].every(Number.isFinite) && a.from[0] < a.to[0] && a.from[1] < a.to[1]))) fail('invalid wall aperture');
  if (scene.air !== undefined && !(Number.isFinite(scene.air.scattering) && scene.air.scattering >= 0 && scene.air.scattering < 1
    && Number.isFinite(scene.air.anisotropy) && Math.abs(scene.air.anisotropy) < 1 && (scene.air.cell === undefined || scene.air.cell >= .1))) fail('invalid air scattering');
  if (scene.illumination?.sunDirection && !(Array.isArray(scene.illumination.sunDirection)&&scene.illumination.sunDirection.length===3&&scene.illumination.sunDirection.every(Number.isFinite)&&scene.illumination.sunDirection[1]>.05)) fail('invalid sun direction');
  if (!(bounds.minX < bounds.maxX && bounds.minZ < bounds.maxZ && bounds.ceiling > 0)) fail("empty bounds");
  if (!shapes.length) fail("no shapes");
  shapes.forEach((s, i) => {
    if (![0, 1, 2].every((k) => s.lo[k] < s.hi[k])) fail(`shape ${i} has lo >= hi`);
    if (!Number.isInteger(s.material) || s.material < 0 || RESERVED_MATERIALS.includes(s.material)) fail(`shape ${i} uses material ${s.material}`);
    if (s.kind === 1 && !(s.radius > 0 && 2 * s.radius < s.hi[0] - s.lo[0])) fail(`arch ${i} radius does not fit its box`);
    if (![0, 1, 2, 3, 4, 5, 6, 7, 9, 10].includes(s.kind)) fail(`shape ${i} has unsupported kind`);
    // Arcade openings are equal, evenly spaced and may not overlap at the inner face.
    if (s.kind === 10 && !(Number.isInteger(s.openings) && s.openings >= 3 && s.openings <= 32 && s.radius > 0 && s.outerRadius > s.radius
      && s.openingRadius > 0 && s.openingRadius < s.radius * Math.sin(Math.PI / s.openings) && s.spring >= s.lo[1] && s.spring + s.openingRadius <= s.hi[1])) fail(`arcade ${i} is invalid`);
    if (s.kind === 9 && !(s.radius > 0 && s.outerRadius > s.radius && Number.isFinite(s.spring))) fail(`ring ${i} is invalid`);
    if (s.center !== undefined && !([3, 4, 10].includes(s.kind) && Array.isArray(s.center) && s.center.length === 2 && s.center.every(Number.isFinite))) fail(`shape ${i} has an invalid centre`);
    if (s.kind >= 2 && s.kind <= 4 && !s.center && !(s.radius > 0 && 2 * s.radius <= Math.min(s.hi[0] - s.lo[0], s.hi[2] - s.lo[2]) + 1e-9)) fail(`curved shape ${i} radius does not fit`);
    // A clipped dome keeps its full x extent; cutouts and drums may be clipped on any side.
    if (s.center && s.kind === 3 && !(s.radius > 0 && s.center[0] - s.radius >= s.lo[0] - 1e-9 && s.center[0] + s.radius <= s.hi[0] + 1e-9)) fail(`curved shape ${i} must contain its x extent`);
    if (s.kind === 5 && !(s.radius > 0 && s.tubeRadius > 0 && s.tubeRadius < s.radius && s.spring > s.lo[1])) fail(`tube ${i} has invalid sweep`);
    if (s.kind === 6 && !([0, 2].includes(s.axis) && s.radius > 0 && [0, 1, 2].filter(k=>k!==s.axis).every(k=>s.hi[k]-s.lo[k]>=2*s.radius-1e-9))) fail(`rail ${i} has invalid cylinder`);
    if (s.kind === 7 && !(s.radius > s.tubeRadius && s.tubeRadius > 0 && [0, 2].every(k=>s.hi[k]-s.lo[k]>=2*(s.radius+s.tubeRadius)-1e-9) && s.hi[1]-s.lo[1]>=2*s.tubeRadius-1e-9)) fail(`rail ${i} has invalid torus`);
    if ((s.kind === 6 || s.kind === 7) && !scene.conductorMaterials?.includes(s.material)) fail(`rail ${i} needs conductor transport`);
    if (s.tilePhase !== undefined && !([2, 4].includes(s.kind) && Number.isFinite(s.tilePhase))) fail(`shape ${i} has an invalid tile phase`);
    if (s.kind === 3 && !(s.lo[1] === s.spring && s.hi[1] >= s.spring + s.radius)) fail(`dome ${i} must contain its upper hemisphere`);
    if (s.kind === 3 && s.center && !(s.center[1] + s.radius <= s.hi[2] + 1e-9)) fail(`dome ${i} may only be clipped on its near side`);
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
    f.set([...s.lo, s.center?.[0] ?? 0, ...s.hi, s.center?.[1] ?? 0], i * SHAPE_WORDS);
    u.set([s.material, s.kind, i * FACES, (s.center ? 1 : 0) | (s.openings ?? 0) << 8], i * SHAPE_WORDS + 8);
    f.set([s.radius, s.spring, s.oculus ?? s.tubeRadius ?? s.outerRadius ?? 0, s.axis ?? s.openingRadius ?? s.tilePhase ?? 0], i * SHAPE_WORDS + 12);
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
