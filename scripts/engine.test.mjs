import test from "node:test";
import assert from "node:assert/strict";
import { createMap } from "../src/engine/map-builder.js";
import { intersectBVH } from "../src/engine/bvh.js";
import { canStand, movePlayer, sampleFloorHeight, PLAYER_EYE_HEIGHT } from "../src/engine/collision.js";
import { MATERIAL_PRESETS } from "../src/engine/materials.js";
import { LEVEL_LIST } from "../levels/v2/index.js";

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

  const hitDown = intersectBVH(c.bvh, [0, 2, 2], [0, -1, 0]);
  assert(hitDown && Math.abs(hitDown.t - 2.0) < 1e-3, `Expected floor hit at t=2.0, got ${hitDown?.t}`);

  const hitArchOpen = intersectBVH(c.bvh, [0, 1.5, 3], [0, 0, -1]);
  assert(hitArchOpen && Math.abs(hitArchOpen.t - 8.0) < 1e-3, `Expected ray through arch to hit z=-5 (t=8), got ${hitArchOpen?.t}`);

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

  const pose = { x: 3.5, y: PLAYER_EYE_HEIGHT, z: 3.4, footY: 0 };
  for (let i = 0; i < 40; i++) {
    movePlayer(pose, 0, -0.1, c.collision, 0.03);
  }
  assert(pose.z < 0, `Expected player to climb onto landing, z=${pose.z}`);
  assert(Math.abs(sampleFloorHeight(pose.x, pose.z, c.collision) - 1.0) < 1e-3);
  assert(pose.footY > 0.85, `Expected smooth step-up height near 1.0, got ${pose.footY}`);
});

test("Material presets pack cleanly and dry v2 levels incur zero water allocation", () => {
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
  byId["poolrooms-v2"].build(mp);
  const cp = mp.compile();
  assert(cp.water !== null && cp.water.level > 0.2);
  assert(cp.bookmarks.length === 4);
  assert(cp.triCount > 1500);
});

test("MapBuilder ringWall, spiralStairs, pillWindowBay, curvedTube, and handrail compile into watertight BVH", () => {
  const m = createMap({ atlasSize: 512 });
  m.ringWall([-5, 0, -0.3], [5, 4.6, 0.3], { center: 0, centerY: 1.5, radius: 2.2, segments: 24 });
  m.spiralStairs(4, 4, 0.4, 4.4, 1.0, 2.2, 0, -Math.PI, 12, "tile_white");
  m.pillWindowBay([-2, 0, -5.4], [2, 3.6, -5.0], { facing: "+" });
  m.curvedTube([[0, 4, -2], [1, 2.5, -3], [1.5, 0.5, -4]], 0.5, "fiberglass_slide", { flanges: true });
  m.handrail([-3, 2], [3, 2], 0.5, 0.9);
  const c = m.compile({ atlasSize: 512 });

  assert(c.triCount > 400);
  assert(c.lightCount >= 1);
  // Ray straight through circular ring center should pass through unobstructed to the pill window wall
  const hitCenter = intersectBVH(c.bvh, [0, 1.5, 3], [0, 0, -1]);
  assert(hitCenter && hitCenter.t > 7.5, `Expected ray through ring opening to pass z=0, got t=${hitCenter?.t}`);
  // Ray hitting the outer pier of the ring wall should hit at z=0.3 (t=2.7)
  const hitPier = intersectBVH(c.bvh, [3.8, 1.5, 3], [0, 0, -1]);
  assert(hitPier && Math.abs(hitPier.t - 2.7) < 0.05, `Expected ray to hit ring pier at t=2.7, got t=${hitPier?.t}`);
});

import { dispersionPolynomial } from "../src/engine/water-dispersion.js";
import { createWakeTrail, kickImpacts } from "../src/engine/wake-trail.js";

test("v2 finite-depth Chebyshev polynomial fits sqrt(s)*tanh(H*sqrt(s)) accurately across wavenumbers", () => {
  const H = 0.52;
  const dx = 0.0625;
  const fit = dispersionPolynomial(H, 24, dx);
  assert.equal(fit.coefficients.length, 25);
  for (const s of [0.5, 4, 25, 100, 400, 1100]) {
    const x = (2 * s) / fit.limit - 1;
    let t0 = 1, t1 = x;
    let approx = fit.coefficients[0] * t0 + fit.coefficients[1] * t1;
    for (let k = 2; k <= fit.degree; k++) {
      const tk = 2 * x * t1 - t0;
      approx += fit.coefficients[k] * tk;
      t0 = t1;
      t1 = tk;
    }
    const exact = Math.tanh(H * Math.sqrt(s)) / Math.sqrt(s);
    assert(approx > 0, `Operator must stay positive at s=${s}`);
    const freqErr = Math.abs(Math.sqrt(approx / exact) - 1);
    assert(freqErr < 0.025, `Frequency error ${freqErr} too high at s=${s}`);
  }
});

test("v2 wading wake trail fires alternating footsteps in water and generates ballistic kick splashes", () => {
  const trail = createWakeTrail();
  const contacts = [];
  let x = 0, z = 0;
  for (let i = 1; i <= 45; i++) {
    const prev = { x, z, footY: 0 };
    z -= 0.05; // 1.5 m/s at 30 Hz
    const next = { x, z, footY: 0 };
    const c = trail.advance(prev, next, i / 30, 0.52);
    if (c) contacts.push(c);
  }
  assert(contacts.length >= 3, `Expected >= 3 wading footsteps, got ${contacts.length}`);
  assert(Math.sign(contacts[0].x) === -Math.sign(contacts[1].x), "Footsteps should alternate left and right");
  const splashes = kickImpacts(contacts[0]);
  assert.equal(splashes.length, 6);
  for (const sp of splashes) {
    assert(sp.time > contacts[0].time && sp.momentum > 0);
  }
  // Dry floor must never fire wading footsteps
  trail.reset();
  assert.equal(trail.advance({ x: 0, z: 0, footY: 0.64 }, { x: 0, z: -0.2, footY: 0.64 }, 1.0, 0.52), null);
});


