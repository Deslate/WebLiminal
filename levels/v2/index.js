// Experimental v2 startup-baked framework level registry.
// Coexists alongside the preserved v1 physical Poolrooms renderer (levels/index.js).

import poolroomsV2 from "./poolrooms-v2.js";
import level0 from "./level0.js";
import chineseHorror from "./chinese-horror.js";

export const LEVEL_LIST = [level0, poolroomsV2, chineseHorror];
export const LEVELS = Object.fromEntries(LEVEL_LIST.map((l) => [l.id, l]));
export const DEFAULT_LEVEL = level0.id;

export function selectLevel(id) {
  const key = id || DEFAULT_LEVEL;
  const level = LEVELS[key];
  if (!level) {
    throw new Error(`Unknown v2 level "${key}". Available: ${Object.keys(LEVELS).join(", ")}.`);
  }
  return level;
}
