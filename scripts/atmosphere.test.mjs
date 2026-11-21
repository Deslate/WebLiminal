import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { airGrid, airCamera, airBakeSource } from '../src/render/atmosphere.js';
import { validateScene } from '../src/render/scene.js';
import { buildRegion } from '../levels/poolrooms-regions.js';

const camera = readFileSync(new URL('../src/render/camera.wgsl', import.meta.url), 'utf8');
const scene = () => ({ ...buildRegion('rotunda', { apertureWidth: 23.8, apertureDepth: 21 }),
  air: { scattering: .004, anisotropy: .6 } });

test('windows without air preserve the complete camera shader', () => {
  assert.equal(airGrid({}), null);
  assert.equal(airCamera(camera, {}), camera);
});

test('air coefficients cannot exceed the extinction or produce an invalid grid', () => {
  validateScene(scene());
  for (const patch of [{ scattering: .02 }, { scattering: -1 }, { scattering: NaN },
    { anisotropy: 1 }, { anisotropy: -1 }, { cell: Infinity }, { cell: NaN }, { cell: 0 }]) {
    assert.throws(() => validateScene({ ...scene(), air: { ...scene().air, ...patch } }), /invalid air scattering/);
  }
  assert.throws(() => validateScene({ ...scene(), air: null }), /invalid air scattering/);
});

test('air grid covers an offset resident window without assuming the world origin', () => {
  const s = scene();
  s.bounds = { ...s.bounds, minX: 17, maxX: 19, minZ: -11, maxZ: -8, ceiling: 1.1 };
  s.air.cell = .4;
  const g = airGrid(s);
  assert.deepEqual(g.lo, [17, 0, -11]);
  assert.deepEqual(g.hi, [19, 1.1, -8]);
  assert.deepEqual(g.n, [5, 3, 8]);
  assert.equal(g.count, 120);
  for (let k = 0; k < 3; k++) assert((g.hi[k] - g.lo[k]) / g.n[k] <= .4);
});

test('air shader integration removes the legacy haze and fails on a missing hook', () => {
  const source = airCamera(camera, scene());
  assert(!source.includes('vec3f(.065,.085,.09)*(1.-tr)'));
  assert(source.includes('layers.base+=airScatter(ro,rd)'));
  assert(!airBakeSource(scene()).includes('WALL_APERTURES'));
  assert.throws(() => airCamera(camera.replace('fn radiance(', 'fn renamedRadiance('), scene()), /Missing air scattering shader hook/);
});
