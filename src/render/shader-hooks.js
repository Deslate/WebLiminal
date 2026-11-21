// Specialization hooks must fail loudly when a source refactor breaks wiring.
// This runs while building shaders, never in the per-frame render loop.
export function replaceShaderHook(source, target, replacement, count = 1) {
  const parts = source.split(target);
  if (parts.length - 1 !== count)
    throw new Error(`Shader hook expected ${count} occurrence(s), found ${parts.length - 1}: ${target}`);
  return parts.join(replacement);
}
