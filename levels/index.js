// Level registry. The app selects a level here; the renderer only ever sees
// the level module it is given.
import poolrooms from "./poolrooms.js";
import chineseHorror from "./chinese-horror.js";

export const LEVELS = {
  [poolrooms.id]: poolrooms,
  [chineseHorror.id]: chineseHorror,
};
export const DEFAULT_LEVEL = poolrooms.id;
export function selectLevel(id) {
  const level = LEVELS[id || DEFAULT_LEVEL];
  if (!level) throw new Error(`Unknown level "${id}". Available: ${Object.keys(LEVELS).join(", ")}.`);
  return level;
}
