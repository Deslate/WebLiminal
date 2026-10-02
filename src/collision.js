export const PLAYER_RADIUS = 0.24;
export function canStand(x, z, bounds, solids, radius = PLAYER_RADIUS) {
  if (
    x < bounds.minX + radius ||
    x > bounds.maxX - radius ||
    z < bounds.minZ + radius ||
    z > bounds.maxZ - radius
  )
    return false;
  for (const b of solids) {
    if (b.kind === 'circle') {
      if ((x - b.x) ** 2 + (z - b.z) ** 2 < (b.radius + radius) ** 2) return false;
      continue;
    }
    const nearestX = Math.max(b.minX, Math.min(x, b.maxX));
    const nearestZ = Math.max(b.minZ, Math.min(z, b.maxZ));
    if ((x - nearestX) ** 2 + (z - nearestZ) ** 2 < radius ** 2) return false;
  }
  return true;
}
export function movePlayer(position, dx, dz, bounds, solids) {
  const steps = Math.max(
    1,
    Math.ceil(Math.hypot(dx, dz) / (PLAYER_RADIUS * 0.5)),
  );
  for (let i = 0; i < steps; i++) {
    if (canStand(position.x + dx / steps, position.z, bounds, solids))
      position.x += dx / steps;
    if (canStand(position.x, position.z + dz / steps, bounds, solids))
      position.z += dz / steps;
  }
  return position;
}
