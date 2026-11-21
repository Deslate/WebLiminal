import test from "node:test";
import assert from "node:assert/strict";
import { createMap } from "../src/engine/map-builder.js";
import { intersectBVH } from "../src/engine/bvh.js";
import { canStand, movePlayer, sampleFloorHeight, PLAYER_EYE_HEIGHT } from "../src/engine/collision.js";
import { MATERIAL_PRESETS } from "../src/engine/materials.js";
import { LEVEL_LIST } from "../levels/index.js";

test("MapBuilder compiles room, arch, cylinder, stairs, and area lights into clean mesh + BVH", () => {
  const m = createMap({ atlasSize: 512 });
  m.room([-5, 0, -5], [5, 4, 5], { floor: "tile_pool", ceiling: "plaster_warm", walls: "tile_white" });
  m.wallWithArch([-5, 0, -0.5], [5, 4, 0.5], { arches: [{ pos: 0, radius: 1.5, spring: 2.0 }] });
  m.cylinder(2.5, 2.5, 0, 4, 0.4, "tile_mosaic");
  m.stairs([-4.5, 0, 1], [-2.5, 1.0, 4], "-z", 5, "concrete_raw");
  m.panelLight([0, 3.99, 2.5], 1.2, 0.6, { intensity: 12 });
  const c = m.compile({ atlasSize: 512 });

  assert(c.triCount > 80);
  assert(c.bvh.nodeCount > 10);
  assert.equal(c.lightCount, 1);
  assert.equal(c.water, null);

  // Shoot ray downward from center toward floor at y=0 -> should hit at t=2.0
  const hitDown = intersectBVH(c.bvh, [0, 2, 2], [0, -1, 0]);
  assert(hitDown && Math.abs(hitDown.t - 2.0) < 1e-3, `Expected floor hit at t=2.0, got ${hitDown?.t}`);

  // Shoot ray through the center of the arch opening (x=0, y=1.5, z=3 -> -Z) -> should pass arch and hit back wall at z=-5 (t=8)
  const hitArchOpen = intersectBVH(c.bvh, [0, 1.5, 3], [0, 0, -1]);
  assert(hitArchOpen && Math.abs(hitArchOpen.t - 8.0) < 1e-3, `Expected ray through arch to hit z=-5 (t=8), got ${hitArchOpen?.t}`);

  // Shoot ray at the solid arch pier (x=-3.5, y=1.5, z=3 -> -Z) -> should hit pier at z=0.5 (t=2.5)
  const hitPier = intersectBVH(c.bvh, [-3.5, 1.5, 3], [0, 0, -1]);
  assert(hitPier && Math.abs(hitPier.t - 2.5) < 1e-3, `Expected ray to hit arch pier at t=2.5, got ${hitPier?.t}`);
});

test("Lightmap UV2 packer produces strictly non-overlapping padded chart rectangles inside [0, 1]", () => {
  const m = createMap({ atlasSize: 512 });
  m.room([-8, 0, -8], [8, 3.5, 8], { floor: "carpet_damp", ceiling: "ceiling_grid", walls: "wallpaper_yellow" });
  m.box([-2, 0, -2], [2, 3.5, 2], "wallpaper_yellow");
  const c = m.compile({ atlasSize: 512 });

  const rects = c.atlas.placements;
  assert(rects.length >= 10);
  for (let i = 0; i < rects.length; i++) {
    const a = rects[i];
    assert(a.x >= 2 && a.y >= 2);
    assert(a.x + a.w <= 510 && a.y + a.h <= 510);
    for (let j = i + 1; j < rects.length; j++) {
      const b = rects[j];
      const sepX = a.x + a.w + 2 <= b.x || b.x + b.w + 2 <= a.x;
      const sepY = a.y + a.h + 2 <= b.y || b.y + b.h + 2 <= a.y;
      assert(sepX || sepY, `Charts ${i} and ${j} overlap or violate 2-texel gutter padding`);
    }
  }
});

test("Collision blocks walls & columns while smoothly climbing stairs", () => {
  const m = createMap();
  m.room([-6, 0, -6], [6, 4, 6]);
  m.cylinder(0, 0, 0, 4, 0.8, "concrete_raw");
  m.box([2, 0, -4], [5, 1.0, 0], "concrete_raw", { walkable: true });
  m.stairs([2, 0, 0], [5, 1.0, 3], "-z", 5, "concrete_raw");
  const c = m.compile();

  assert.equal(canStand(0, 0, c.collision), false);
  assert.equal(canStand(0, 2.0, c.collision), true);

  // Walk smoothly up the staircase along -Z
  const pose = { x: 3.5, y: PLAYER_EYE_HEIGHT, z: 3.4, footY: 0 };
  for (let i = 0; i < 40; i++) {
    movePlayer(pose, 0, -0.1, c.collision, 0.03);
  }
  assert(pose.z < 0, `Expected player to climb onto landing, z=${pose.z}`);
  assert(Math.abs(sampleFloorHeight(pose.x, pose.z, c.collision) - 1.0) < 1e-3);
  assert(pose.footY > 0.85, `Expected smooth step-up height near 1.0, got ${pose.footY}`);
});

test("Material presets pack cleanly and dry levels incur zero water allocation", () => {
  assert(Object.keys(MATERIAL_PRESETS).length >= 16);
  const byId = Object.fromEntries(LEVEL_LIST.map((l) => [l.id, l]));

  const m0 = createMap();
  byId.level0.build(m0);
  const c0 = m0.compile();
  assert.equal(c0.water, null);
  assert(c0.lightCount >= 8);

  const m1 = createMap();
  byId.level1.build(m1);
  const c1 = m1.compile();
  assert.equal(c1.water, null);

  const mp = createMap();
  byId.poolrooms.build(mp);
  const cp = mp.compile();
  assert(cp.water !== null && cp.water.level > 0.2);
});
