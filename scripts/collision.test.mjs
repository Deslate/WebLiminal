import test from "node:test";
import assert from "node:assert/strict";
import { movePlayer, canStand } from "../src/collision.js";
const bounds = { minX: -10, maxX: 10, minZ: -35, maxZ: 15 };
const solids = [{ minX: -1, maxX: 1, minZ: -4, maxZ: -3 }];

test("large displacement cannot tunnel through a wall", () => {
  const p = { x: 0, z: 0 };
  movePlayer(p, 0, -40, bounds, solids);
  assert(p.z >= -2.76);
  assert(canStand(p.x, p.z, bounds, solids));
});
test("world boundary is closed on all four sides", () => {
  for (const [x, z] of [
    [100, 0],
    [-100, 0],
    [0, 100],
    [0, -100],
  ]) {
    const p = { x: 5, z: 0 };
    movePlayer(p, x, z, bounds, []);
    assert(canStand(p.x, p.z, bounds, []));
  }
});
test("diagonal collision slides along the wall", () => {
  const p = { x: 0, z: -2.7 };
  movePlayer(p, 2, -1, bounds, solids);
  assert(p.x > 1.5);
  assert(canStand(p.x, p.z, bounds, solids));
});
test("deterministic long random walk remains in the world", () => {
  const p = { x: 4, z: 8 };
  for (let i = 0; i < 20000; i++) {
    movePlayer(
      p,
      Math.sin(i * 1.73) * 0.6,
      Math.cos(i * 0.37) * 0.6,
      bounds,
      solids,
    );
    assert(canStand(p.x, p.z, bounds, solids));
  }
});
