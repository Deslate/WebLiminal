// Diagnostic whole-simulation slow motion, not a physical wave-speed setting.
export function playbackRate(value) {
  if (String(value) === '0.5') return 0.5;
  if (String(value) === '0.33') return 1 / 3;
  return 1;
}

export function playbackStep(wallSeconds, rate = 1) {
  // Preserve the production stall cap; it can lose time, never accelerate it.
  return Math.min(Math.max(0, wallSeconds), 0.05) * rate;
}
