// World addresses are independent of the finite set of navigation bookmarks.
// Geometry and simulations use window-local metres to preserve GPU precision.
export const CHUNK_SIZE = 64;
// A window may be rotated about the vertical axis in the world; local poses
// rotate with it (x' = c x + s z, z' = -s x + c z, yaw' = yaw + orientation).
export function worldPosition(address, local, orientation = 0) {
  const c = Math.cos(orientation), s = Math.sin(orientation);
  return { ...local, x: address.x * CHUNK_SIZE + c * local.x + s * local.z, z: address.z * CHUNK_SIZE - s * local.x + c * local.z,
    ...(local.yaw === undefined ? {} : { yaw: local.yaw + orientation }) };
}
export function regionIndex(code, current, count) {
  if (code === 'ArrowLeft') return (current + count - 1) % count;
  if (code === 'ArrowRight') return (current + 1) % count;
  const match = /^(?:Digit|Numpad)([1-5])$/.exec(code);
  return match && Number(match[1]) <= count ? Number(match[1]) - 1 : null;
}
export function loadWindow(level, address) {
  if (!level.world) return { ...level, address: { x: 0, z: 0 } };
  const region = level.world.generate(address);
  return { ...level, ...region, id: level.id, materials: region.materials ?? level.materials, address: { ...address } };
}
