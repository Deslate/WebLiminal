import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPoolroomsWorld, bookmarks } from '../levels/poolrooms-regions.js';
import { buildPoolroomsScene } from '../levels/poolrooms-scene.js';
import { validateScene, packScene } from '../src/render/scene.js';
import { canStand } from '../src/collision.js';
import { loadWindow, regionIndex, worldPosition } from '../src/world.js';
const data = JSON.parse(readFileSync(new URL('../levels/poolrooms.json', import.meta.url)));
const level = { ...data, materials: {}, world: createPoolroomsWorld(data, {}) };
test('landmarks share a level identity and deterministic spatial addresses', () => {
  for (const b of bookmarks) {
    const w = loadWindow(level, b.address), scene = validateScene(w.scene(w.optics));
    assert.equal(w.id, level.id);
    assert.deepEqual(scene, w.scene(w.optics));
    assert(canStand(w.spawn.x, w.spawn.z, scene.bounds, scene.solids), b.name);
    const world = worldPosition(w.address, w.spawn);
    assert.equal(world.x - w.spawn.x, b.address.x * 64);
    assert(scene.shapes.length <= 80, 'Resident window shape budget');
    const range = w.limits ?? { apertureWidth: [.5, 7.8], apertureDepth: [.5, 9] };
    for (const apertureWidth of range.apertureWidth) for (const apertureDepth of range.apertureDepth)
      validateScene(w.scene({ apertureWidth, apertureDepth }));
  }
  assert.throws(() => loadWindow(level, { x: 123, z: 456 }), /Unloaded/);
});
test('original landmark retains exactly the old scene and GPU packing', () => {
  const scene = loadWindow(level, bookmarks[0].address).scene(data.optics);
  const original = buildPoolroomsScene(data, data.optics);
  assert.deepEqual(scene, original);
  assert.deepEqual(packScene(scene).geometryData, packScene(original).geometryData);
});

test('flooded corridor is walkable without crossing its rails',()=>{
  const w=loadWindow(level,{x:0,z:1}),scene=w.scene(w.optics);
  // Enter past the near column, then follow the corridor through the doorway.
  for(let z=8.4;z>=4;z-=.25)assert(canStand(-1.8,z,scene.bounds,scene.solids),`mouth ${z}`);
  for(let x=-1.8;x>=-2.4;x-=.1)assert(canStand(x,4,scene.bounds,scene.solids),`step ${x}`);
  for(let z=4;z>=-8.5;z-=.25)assert(canStand(-2.4,z,scene.bounds,scene.solids),`corridor ${z}`);
  assert(!canStand(-1.8,-9,scene.bounds,scene.solids),'Hall rail');
  assert(!canStand(-3.4,0,scene.bounds,scene.solids),'Wall rail clearance');
  assert(!canStand(1,1,scene.bounds,scene.solids),'Curved wall');
});
test('changing navigation order cannot relocate authored world content', () => {
  const address={x:1,z:0};
  const before=level.world.generate(address);
  bookmarks.reverse();
  try { assert.deepEqual(level.world.generate(address).scene(before.optics),before.scene(before.optics)); }
  finally { bookmarks.reverse(); }
});
test('location keys wrap and never consume movement or lab keys', () => {
  assert.equal(regionIndex('ArrowLeft', 0, 5), 4);
  assert.equal(regionIndex('ArrowRight', 4, 5), 0);
  for (let i = 1; i <= 5; i++) assert.equal(regionIndex(`Digit${i}`, 0, 5), i - 1);
  for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'KeyG'])
    assert.equal(regionIndex(key, 0, 5), null);
});
