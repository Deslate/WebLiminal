# Levels and the scene description

The renderer draws whatever level module it is given. It imports no level and
no material; `scripts/validate-content.mjs` fails the build if a file in
`src/render/` imports from `levels/` or `materials/`.

## Selecting a level

`levels/index.js` is the registry. `src/main.js` picks a level from the
`?level=<id>` query parameter (default `poolrooms-v1`) and passes the module to
`createRenderer(canvas, level)`. An unknown id stops with a message that lists
the available ids.

## Level module

A level module is a plain object:

| Field | Meaning |
| --- | --- |
| `id` | Registry key. |
| `spawn` | Player start: `x, y, z, yaw, pitch` (m, rad). |
| `optics` | Initial renderer config: `waterLevel`, `waveAmplitude`, `waveSpeed`, `bodyWakeBoost`, `apertureWidth`, `apertureDepth`, `exposure`, `focalLength`. |
| `limits` | Allowed `[min, max]` for runtime-adjustable geometry: `apertureWidth`, `apertureDepth`. |
| `materials` | WGSL source: `near` defines `surfaceMaterial` / `filteredMaterial` for the camera, `photon` the area-average transport BRDF. |
| `scene(options)` | Returns the scene description for the current config (`options` carries at least `apertureWidth`, `apertureDepth`). Must be pure. |

Poolrooms is split so that Node can run the geometry: `levels/poolrooms.json`
(data), `levels/poolrooms-scene.js` (pure builder, no imports) and
`levels/poolrooms.js` (the module that wires data, builder and materials).

## Scene description

All lengths are metres, `y` up.

```js
{
  bounds:   { minX, maxX, minZ, maxZ, ceiling },     // walkable region
  shapes:   [{ lo, hi, material, kind, radius, spring, density?, probeStride? }],
  solids:   [{ minX, maxX, minZ, maxZ }],            // player collision footprints
  water:    { minX, maxX, minZ, maxZ, cell },        // one rectangular water body
  aperture: { minX, maxX, minZ, maxZ, y },           // sky opening in the plane y
  floor:    { shape, face },                         // primary caustic receiver
}
```

- **Shapes** are axis-aligned boxes (`kind: 0`) or boxes with a semicircular
  arch cut through them along `z` (`kind: 1`, `radius`, `spring` height).
  `material` is an id interpreted by the level's material WGSL; ids 9 (water)
  and 10 (player body) are reserved. Each shape has 9 faces: `-x, +x, -y, +y,
  -z, +z`, then arch intrados and the two jambs; surface id = `shape * 9 + face`.
- **`density`** (cells per metre) and **`probeStride`** (receiver cells per
  diffuse probe) are optional 9-entry per-face arrays; unset entries use 12 and
  4. Faces that merge into one receiver atlas take the largest value.
- **Water.** `cell` must tile the rectangle exactly; the background solver runs
  on that grid. The water height is `optics.waterLevel`; depth comes from the
  shapes below it.
- **Aperture.** The only light source today: sun and sky enter through this
  rectangle. Its size may change at runtime (the renderer rebuilds geometry and
  light caches); its plane `y` may not.

`src/render/scene.js` validates the description, packs shapes for the GPU,
builds the receiver atlases (`light-atlas.js`) and emits a WGSL prelude of
compile-time constants (`WATER_MIN`, `WATER_MAX`, `WATER_NX`, `WATER_NZ`,
`WATER_DX`, `OPENING_Y`, `FLOOR_SID`). Water rectangle, aperture plane and
floor receiver are therefore fixed for a loaded level; the renderer throws if a
rebuild changes them.

## Current limits

- One water body per level, and water is required.
- One rectangular sky aperture is the only light source.
- The spectral body-wake window is a fixed 32 x 64 m domain centred on the
  world origin; the level's water rectangle must lie well inside it.
- Shapes are a flat list tested one by one in every ray; there is no
  acceleration structure yet.
