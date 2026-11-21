// Collision-resolved wading footstep trail & sub-grid splash momentum closure.
// Ported from v1 wake-trail.js and kick-impacts.js into the reusable v2 engine so
// every level with a water body automatically gets physical wading footsteps and splashes.

export function createWakeTrail() {
  let distance = 0;
  let lastTime = -Infinity;
  let foot = 0;

  return {
    reset() {
      distance = 0;
      lastTime = -Infinity;
      foot = 0;
    },
    advance(from, to, time, waterLevel) {
      const dx = to.x - from.x;
      const dz = to.z - from.z;
      const d = Math.hypot(dx, dz);
      const footY = to.footY ?? (to.y ?? 1.62) - 1.62;
      // Ignore dry floors, standstill, or teleports (> 0.4 m in a single tick).
      if (waterLevel <= footY + 0.04 || d < 1e-5 || d > 0.4) return null;
      distance += d;
      if (distance < 0.46 || time - lastTime < 0.36) return null;
      distance = 0;
      lastTime = time;
      foot++;
      const side = foot % 2 ? 1 : -1;
      const dirX = dx / d;
      const dirZ = dz / d;
      // Planted foot leads the torso slightly and alternates left/right.
      return {
        x: to.x + dirX * 0.28 - dirZ * 0.11 * side,
        z: to.z + dirZ * 0.28 + dirX * 0.11 * side,
        time,
        amplitude: 0.014,
        direction: [dirX, dirZ],
        step: foot,
      };
    },
  };
}

// Deterministic ballistic water-parcel landing impacts driven by a wading foot sweep.
export function kickImpacts(contact) {
  if (!contact?.direction) return [];
  const [dx, dz] = contact.direction;
  const events = [];
  let seed = ((contact.step ?? 1) * 2654435761) >>> 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 6; i++) {
    const angle = (random() - 0.5) * 1.1;
    const forward = 2.6 + random() * 1.7;
    const up = 1.7 + random() * 0.85;
    const vx = forward * (dx * Math.cos(angle) - dz * Math.sin(angle));
    const vz = forward * (dz * Math.cos(angle) + dx * Math.sin(angle));
    const flight = (2 * up) / 9.81;
    events.push({
      x: contact.x + vx * flight,
      z: contact.z + vz * flight,
      time: contact.time + flight,
      momentum: 0.0026 * up,
    });
  }
  return events;
}
