// Repository & content invariant validator.
// Enforces: zero bitmap assets, strict engine/level isolation, and valid map compilation.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { LEVEL_LIST } from "../levels/index.js";
import { createMap } from "../src/engine/map-builder.js";
import { canStand, sampleFloorHeight } from "../src/engine/collision.js";

const root = fileURLToPath(new URL("../", import.meta.url));

// 1. Forbid any bitmap texture/image assets inside the source tree.
const forbidden = /\.(png|jpe?g|webp|avif|gif|bmp|hdr|exr|ktx2?|dds|tiff?|ico)$/i;
const bitmapHits = [];
function scanDir(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", ".runtime", ".flops", "dist"].includes(item.name)) continue;
    const p = join(dir, item.name);
    if (item.isDirectory()) scanDir(p);
    else if (forbidden.test(item.name)) bitmapHits.push(p);
  }
}
scanDir(root);
assert.deepEqual(bitmapHits, [], `Bitmap assets are forbidden in the repository: ${bitmapHits.join(", ")}`);

// 2. Enforce engine/level decoupling: src/engine/ must never import from levels/.
function checkEngineIsolation(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, item.name);
    if (item.isDirectory()) checkEngineIsolation(p);
    else if (item.name.endsWith(".js")) {
      const src = readFileSync(p, "utf8");
      assert(
        !/from\s*["'][^"']*levels\//.test(src),
        `Engine file ${p} must not import from levels/.`,
      );
    }
  }
}
checkEngineIsolation(join(root, "src/engine"));

// 3. Compile and validate every registered level.
assert(LEVEL_LIST.length >= 3, "Expected at least 3 registered levels.");
for (const lvl of LEVEL_LIST) {
  const m = createMap({ atlasSize: 1024 });
  lvl.build(m);
  const compiled = m.compile({ atlasSize: 1024 });

  assert(compiled.vertexCount > 0 && compiled.triCount > 0, `${lvl.id}: empty mesh`);
  assert(compiled.bvh.nodeCount > 0, `${lvl.id}: empty BVH`);
  assert(compiled.lightCount > 0 || lvl.atmosphere?.sun, `${lvl.id}: no light sources`);
  assert(compiled.atlas.utilization > 0 && compiled.atlas.utilization <= 1.0, `${lvl.id}: invalid atlas utilization`);

  // Verify spawn and every bookmark are standing in valid unobstructed space.
  const spawnFloor = sampleFloorHeight(lvl.spawn.x, lvl.spawn.z, compiled.collision);
  assert(
    canStand(lvl.spawn.x, lvl.spawn.z, compiled.collision, spawnFloor),
    `${lvl.id}: spawn (${lvl.spawn.x}, ${lvl.spawn.z}) is obstructed or out of bounds`,
  );
  for (const bm of compiled.bookmarks) {
    const bmFloor = sampleFloorHeight(bm.spawn.x, bm.spawn.z, compiled.collision);
    assert(
      canStand(bm.spawn.x, bm.spawn.z, compiled.collision, bmFloor),
      `${lvl.id}: bookmark "${bm.name}" is obstructed`,
    );
  }

  // Verify no NaNs in packed vertex buffer.
  const vf = new Float32Array(compiled.vertexData);
  for (let i = 0; i < compiled.vertexCount; i++) {
    const o = i * 16;
    for (const k of [0, 1, 2, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15]) {
      assert(Number.isFinite(vf[o + k]), `${lvl.id}: non-finite vertex attribute at v=${i} k=${k}`);
    }
    assert(vf[o + 14] >= 0 && vf[o + 14] <= 1, `${lvl.id}: uv2.u out of range`);
    assert(vf[o + 15] >= 0 && vf[o + 15] <= 1, `${lvl.id}: uv2.v out of range`);
  }

  console.log(
    `  [OK] ${lvl.id}: ${compiled.stats.triangles} tris, ${compiled.stats.bvhNodes} BVH nodes, ` +
      `${compiled.stats.materials} mats, ${compiled.stats.lights} lights, ` +
      `atlas ${compiled.stats.atlasSize}² (${compiled.stats.texelsPerMeter} tx/m, ${compiled.stats.atlasUtilization}%), ` +
      `water=${compiled.stats.hasWater}`,
  );
}

console.log("WebLiminal content valid: zero bitmaps, strict engine isolation, all levels compiled & verified.");
