// Level registry. Adding a new Backrooms/Liminal level requires only adding
// a lightweight declarative map module and registering it here.

import poolrooms from "./poolrooms.js";
import level0 from "./level0.js";
import level1 from "./level1.js";

export const LEVEL_LIST = [poolrooms, level0, level1];
export const LEVELS = Object.fromEntries(LEVEL_LIST.map((l) => [l.id, l]));
export const DEFAULT_LEVEL = poolrooms.id;

export function selectLevel(id) {
  const key = id || DEFAULT_LEVEL;
  const level = LEVELS[key];
  if (!level) {
    throw new Error(`Unknown level "${key}". Available: ${Object.keys(LEVELS).join(", ")}.`);
  }
  return level;
}
