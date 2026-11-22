// Player collision against 2D solids (boxes & circles) plus walkable elevation
// zones (ramps, stairs, sunken pool floors, elevated landings).

export const PLAYER_RADIUS = 0.28;
export const PLAYER_EYE_HEIGHT = 1.65;
export const MAX_STEP_HEIGHT = 0.42;

export function sampleFloorHeight(x, z, collision) {
  let y = collision.baseFloor ?? 0;
  for (const zf of collision.floors ?? []) {
    if (x < zf.minX || x > zf.maxX || z < zf.minZ || z > zf.maxZ) continue;
    let h = zf.y ?? 0;
    if (zf.kind === "ramp") {
      const t =
        zf.axis === "x"
          ? (x - zf.minX) / Math.max(1e-5, zf.maxX - zf.minX)
          : (z - zf.minZ) / Math.max(1e-5, zf.maxZ - zf.minZ);
      const clamped = Math.max(0, Math.min(1, t));
      h = zf.y0 + (zf.y1 - zf.y0) * clamped;
    }
    if (zf.override) {
      y = h;
    } else if (h > y) {
      y = h;
    }
  }
  return y;
}

export function canStand(x, z, collision, currentFootY = 0, radius = PLAYER_RADIUS) {
  const { bounds, solids } = collision;
  if (
    x < bounds.minX + radius ||
    x > bounds.maxX - radius ||
    z < bounds.minZ + radius ||
    z > bounds.maxZ - radius
  ) {
    return false;
  }

  const nextFloor = sampleFloorHeight(x, z, collision);
  if (nextFloor - currentFootY > MAX_STEP_HEIGHT) {
    return false;
  }

  for (const s of solids) {
    // Allow stepping over low obstacles or walking under elevated blocks.
    if (s.maxY !== undefined && s.maxY <= nextFloor + 0.05) continue;
    if (s.minY !== undefined && s.minY >= nextFloor + PLAYER_EYE_HEIGHT + 0.15) continue;

    if (s.kind === "circle") {
      const dx = x - s.x;
      const dz = z - s.z;
      if (dx * dx + dz * dz < (s.radius + radius) ** 2) return false;
      continue;
    }
    const nx = Math.max(s.minX, Math.min(x, s.maxX));
    const nz = Math.max(s.minZ, Math.min(z, s.maxZ));
    const dx = x - nx;
    const dz = z - nz;
    if (dx * dx + dz * dz < radius * radius) return false;
  }
  return true;
}

export function movePlayer(pose, dx, dz, collision, dt = 0.016) {
  const footY = pose.footY ?? pose.y - PLAYER_EYE_HEIGHT;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (PLAYER_RADIUS * 0.45)));
  const sx = dx / steps;
  const sz = dz / steps;
  let curFoot = footY;

  for (let i = 0; i < steps; i++) {
    if (canStand(pose.x + sx, pose.z, collision, curFoot)) {
      pose.x += sx;
      curFoot = sampleFloorHeight(pose.x, pose.z, collision);
    }
    if (canStand(pose.x, pose.z + sz, collision, curFoot)) {
      pose.z += sz;
      curFoot = sampleFloorHeight(pose.x, pose.z, collision);
    }
  }

  const targetFoot = sampleFloorHeight(pose.x, pose.z, collision);
  const blend = 1 - Math.exp(-14 * Math.min(dt, 0.05));
  pose.footY = footY + (targetFoot - footY) * blend;
  pose.y = pose.footY + PLAYER_EYE_HEIGHT;
  return pose;
}
