// Poolrooms scene description. Metres throughout. Pure: no imports, so the
// same builder runs in the browser, in unit tests and in content validation.
const faceValues = (overrides) => Array.from({ length: 9 }, (_, face) => overrides[face]);
export function buildPoolroomsScene(level, { apertureWidth = 4.8, apertureDepth = 5.8 } = {}) {
  const shapes = [],
    solids = [];
  const add = (lo, hi, material = 0, kind = 0, radius = 0, spring = 0, density = {}, probeStride = {}) => {
    shapes.push({ lo, hi, material, kind, radius, spring, density: faceValues(density), probeStride: faceValues(probeStride) });
  };
  // Receiver densities (cells per metre): 48 on the pool floor, 24 on inner
  // room faces, arches and furniture, the engine default of 12 elsewhere.
  add([-7, -0.25, -17], [7, 0, 10], 2, 0, 0, 0, { 3: 48 }, { 3: 8 });
  add([-7.3, 0, -17], [-7, 6.1, 10], 0, 0, 0, 0, { 1: 24 });
  add([7, 0, -17], [7.3, 6.1, 10], 0, 0, 0, 0, { 0: 24 });
  add([-7, 0, -17.3], [7, 6.1, -17], 0, 0, 0, 0, { 5: 24 });
  add([-7, 0, 10], [7, 6.1, 10.3], 0, 0, 0, 0, { 4: 24 });
  const ax = -2.1,
    az = 1.3,
    xmin = ax - apertureWidth / 2,
    xmax = ax + apertureWidth / 2,
    zmin = az - apertureDepth / 2,
    zmax = az + apertureDepth / 2;
  const ceiling = { 2: 24 };
  add([-7, 5.8, -17], [xmin, 6.1, 10], 1, 0, 0, 0, ceiling);
  add([xmax, 5.8, -17], [7, 6.1, 10], 1, 0, 0, 0, ceiling);
  add([xmin, 5.8, -17], [xmax, 6.1, zmin], 1, 0, 0, 0, ceiling);
  add([xmin, 5.8, zmax], [xmax, 6.1, 10], 1, 0, 0, 0, ceiling);
  const arch = { 4: 24, 5: 24, 6: 24, 7: 24, 8: 24 };
  for (const cx of [-4.67, 0, 4.67]) {
    add([cx - 2.335, 0, -3.65], [cx + 2.335, 5.8, -2.85], 0, 1, 1.78, 2.5, arch);
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
  add([-7, 0, -11.6], [7, 5.8, -10.8], 0, 1, 2.1, 2.5, arch);
  solids.push(
    { minX: -7, maxX: -2.1, minZ: -11.6, maxZ: -10.8 },
    { minX: 2.1, maxX: 7, minZ: -11.6, maxZ: -10.8 },
  );
  const all = Object.fromEntries(Array.from({ length: 9 }, (_, face) => [face, 24]));
  add([-7, 0, 0.4], [-6.1, 0.42, 9.7], 0, 0, 0, 0, all);
  solids.push({ minX: -7, maxX: -6.1, minZ: 0.4, maxZ: 9.7 });
  add([-6.1, 0, 0.4], [-5.85, 0.18, 9.7], 2, 0, 0, 0, all);
  solids.push({ minX: -6.1, maxX: -5.85, minZ: 0.4, maxZ: 9.7 });
  return {
    bounds: { ...level.bounds, ceiling: level.ceiling },
    shapes,
    solids,
    water: { ...level.bounds, cell: 1 / 32 },
    aperture: { minX: xmin, maxX: xmax, minZ: zmin, maxZ: zmax, y: 6.1 },
    floor: { shape: 0, face: 3 },
  };
}
