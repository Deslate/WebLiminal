import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateScene, packScene, sceneShaderPrelude } from '../src/render/scene.js';
import { sceneCommon, pointLightPhotons, pointLightCamera } from '../src/render/point-lights.js';
import { airBakeSource, airCamera } from '../src/render/atmosphere.js';
import { curvedShader } from '../src/render/curved-shapes.js';
import { conductorShader, conductorCommon } from '../src/render/conductor-shaders.js';
import { buildChineseHorrorScene, CHINESE_HORROR_BOOKMARKS } from '../levels/chinese-horror-scene.js';
import { poolroomsScene } from './geometry-fixture.mjs';
import { canStand } from '../src/collision.js';

const common = readFileSync(new URL('../src/render/common.wgsl', import.meta.url), 'utf8');
const photons = readFileSync(new URL('../src/render/photons.wgsl', import.meta.url), 'utf8');
const camera = readFileSync(new URL('../src/render/camera.wgsl', import.meta.url), 'utf8');

test('Poolrooms retains byte-identical shaders through dry and point-light specializations', () => {
  const pool = poolroomsScene();
  assert.equal(sceneCommon(common, pool), common);
  assert.equal(pointLightPhotons(photons, pool), photons);
  assert.equal(pointLightCamera(camera, pool), camera);
});

test('dry scene validation accepts water: null and point lights, and rejects invalid entries', () => {
  const horror = buildChineseHorrorScene();
  assert.doesNotThrow(() => validateScene(horror));
  assert.doesNotThrow(() => packScene(horror));
  assert(sceneShaderPrelude(horror).includes('dry level'));
  assert.throws(() => validateScene({ ...horror, pointLights: [{ pos: [0, 1], color: [1, 1, 1] }] }), /point light position/);
  assert.throws(() => validateScene({ ...horror, pointLights: [{ pos: [0, 1, 0], color: [-1, 1, 1] }] }), /point light color/);
  assert.throws(() => validateScene({ ...horror, pointLights: [{ pos: [0, 1, 0], color: [1, 1, 1], flicker: [0.9, 1, 0] }] }), /flicker/);
  assert.throws(() => validateScene({ ...horror, tileRelief: 'no' }), /tileRelief/);
  assert.throws(() => validateScene({ ...horror, hasEmission: 1 }), /hasEmission/);
  assert.throws(() => validateScene({ ...horror, illumination: { ...horror.illumination, haze: [-0.1, 0, 0] } }), /haze/);
});

test('dry and point-light shader specializations inject expected hooks and guard missing ones', () => {
  const horror = buildChineseHorrorScene();
  const c = sceneCommon(conductorCommon(curvedShader(common, horror), horror), horror);
  assert(c.includes('fn traceWater(ro:vec3f,rd:vec3f,maxT:f32)->Hit { return emptyHit(); }'));
  assert(c.includes('fn reliefHit(ro:vec3f,rd:vec3f,h:Hit)->Hit { return h; }'));
  const p = pointLightPhotons(conductorShader('photons', photons, horror), horror);
  assert(p.includes('Dry scene: skip water surface intersection.'));
  assert(p.includes('4.*PI'));
  const cam = pointLightCamera(airCamera(conductorShader('camera', camera, horror), horror), horror);
  assert(cam.includes('fn pointLightDirect('));
  assert(cam.includes('c+=materialEmission(h);'));
  assert(!cam.includes('(U.state.y-ro.y)/rd.y'));
  assert(airBakeSource(horror).includes('traceSolidAny(p,l'));
  assert.throws(() => sceneCommon('', horror), /Missing traceWater/);
  assert.throws(() => pointLightCamera('', horror), /Shader hook expected/);
});

test('Chinese horror corridor stays within shape budget and keeps a walkable path to the door', () => {
  const horror = buildChineseHorrorScene();
  assert(horror.shapes.length <= 80, `shape count ${horror.shapes.length} exceeds 80`);
  for (const b of CHINESE_HORROR_BOOKMARKS) {
    assert(canStand(b.spawn.x, b.spawn.z, horror.bounds, horror.solids), `${b.name} spawn blocked`);
  }
  // Verify a continuous walkable corridor lane from antechamber past the candle to the door.
  for (let z = 3.6; z >= -1.6; z -= 0.25) {
    const x = z > 1.0 ? -0.35 : 0.35;
    assert(canStand(x, z, horror.bounds, horror.solids), `corridor blocked at (${x}, ${z})`);
  }
});
