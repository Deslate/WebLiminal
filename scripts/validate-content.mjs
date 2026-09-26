import { readFileSync, existsSync } from "node:fs";
import assert from "node:assert/strict";
const level = JSON.parse(
  readFileSync(new URL("../levels/poolrooms.json", import.meta.url)),
);
assert.equal(level.id, "poolrooms-001");
for (const value of Object.values(level.bounds)) assert(Number.isFinite(value));
assert(
  level.bounds.minX < level.bounds.maxX &&
    level.bounds.minZ < level.bounds.maxZ,
);
assert(level.spawn.x > level.bounds.minX && level.spawn.x < level.bounds.maxX);
assert(level.spawn.z > level.bounds.minZ && level.spawn.z < level.bounds.maxZ);
assert(level.moment.start - 2.6 >= 20 && level.moment.start - 2.6 <= 60);
assert(level.moment.duration > 0 && level.waterHeight >= 0);
assert(
  level.portalRows.every((z) => z > level.bounds.minZ && z < level.bounds.maxZ),
);
assert(
  existsSync(new URL(`../materials/${level.material}.js`, import.meta.url)),
);
console.log(
  "Content valid: bounds, spawn, event timing, portals and material slot.",
);
