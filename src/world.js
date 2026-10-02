// World addresses are independent of the finite set of navigation bookmarks.
// Geometry and simulations use window-local metres to preserve GPU precision.
export const CHUNK_SIZE = 64;
export function worldPosition(address, local) {
  return { ...local, x: address.x * CHUNK_SIZE + local.x, z: address.z * CHUNK_SIZE + local.z };
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
