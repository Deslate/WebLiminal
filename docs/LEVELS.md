# Levels and the scene description

The renderer draws whatever level module it is given. It imports no level and
no material; `scripts/validate-content.mjs` fails the build if a file in
`src/render/` imports from `levels/` or `materials/`.

## Selecting a level

`levels/index.js` is the registry. `src/main.js` picks a level from the
`?level=<id>` query parameter (default `poolrooms-v1`) and passes the module to
`loadWindow(level, address)` and `createRenderer(canvas, window)`. An unknown id stops with a message that lists
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

## Regions within a level

Poolrooms has one registry entry and five navigation bookmarks. A bookmark is
`{name, address: {x, z}}`, where the integer address selects a 64 m world cell.
`level.world.generate(address)` resolves a local scene builder, spawn and optics.
The authored origin uses the original scene and materials without changes.
The four other authored cells contain a column reservoir, ring passage, vaulted
rotunda and dark threshold. Unauthored addresses report an error; this is not
yet an endless generator. The bookmark list does not define the world's extent.

`src/world.js` maps the resident window's local coordinates into world metres:
`world = address * 64 + local`. Renderer, collision and water operate in local
metres. `snapshot().worldView` exposes the world pose, while `view` remains local
for existing diagnostics. The level identity is preserved through teleportation.

Only one window is resident. Teleport pauses submissions, waits for GPU work,
destroys the old device and all its resources, creates the destination window,
resets local water/body sources and places the player at its spawn. Water then
evolves with elapsed time; unloaded water is not retained or analytically sought.
The session, level and lab preferences survive. Teleport preserves pause state.
Compilation causes a loading pause; this is not seamless streaming.

This separates world addressing, content generation, navigation and GPU residency.
A future seeded generator can resolve other addresses through the same boundary;
an adjacent-window streamer can replace the single-window residency policy.
The missing pieces are neighboring geometry, seam contracts, acceleration,
simulation continuity, deterministic seed inputs and cache eviction beyond one
window. The five authored cells have no walkable connecting corridors yet.

Left/right cycle bookmarks; top-row or numpad 1–5 teleport directly. WASD and
up/down retain movement, so left/right no longer strafe. Auto-repeat is ignored
for teleport, movement keys clear on transitions, and lab/editable controls own
their input. Other controls retain their meaning.

New regions use boxes, analytic arch cuts, capped cylinders and a hemispherical
intrados. The circular deck outline uses twenty bands and remains a visible
approximation. Cylinder collision uses conservative strips. Curved primitive
shader code is specialized only into windows that need it; original box/arch
windows retain exactly the original shared WGSL. Cylinder and hemisphere light
charts use arc length at the radius by height, giving equal physical cell areas
(`dA = R d(phi) dy`). Planar coverage excludes the disk/sphere cutouts.
The rotunda player stays on the front deck because vertical locomotion is not
implemented. Its basin remains dynamically simulated. Material slot 3 supplies
reflective metal on the handrails only in the new windows.

The initial resident-window content budget is at most 80 shapes, 8 receiver
cells/m on general new surfaces and 24/m on new pool floors. This bounds content
and memory, not frame time: flat ray traversal still scales with shape count.
`node scripts/regions.mjs` captures the four new regions outside the repository,
checks navigation and times GPU-completed frames at fixed 640 x 416 resolution
after a five-second warmup. It records p95 milliseconds, minimum full-second
frame count, adapter and competing GPU load. `EVIDENCE_DIR` selects the output.

## Scene data

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
  `kind: 2` is a capped vertical cylinder centered in its bounding box's x/z
  footprint. `kind: 3` is a box with an upper hemisphere removed, centered at
  the x/z midpoint and `spring` in y; its lower y must equal `spring`.
  Curved kinds require `radius` to fit the x/z box; the dome must also fit in y.
  Cylinders use faces 2/3 for their caps and 6 for their exterior; domes use
  face 6 for the inner hemisphere. An optional `oculus` radius cuts a vertical
  opening at its crown; face 7 is the inward shaft wall. Polar area and the
  opening in the top plane are excluded from receiver coverage. Unused face
  slots have zero coverage.
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
floor receiver are therefore fixed for a resident window; the renderer throws if a
rebuild changes them.

## Current limits

- One water body per resident window, and water is required.
- One rectangular sky aperture is the only light source.
- The spectral body-wake window is a fixed 32 x 64 m domain centred on the
  local window origin; the window's water rectangle must lie well inside it.
- Shapes are a flat list tested one by one in every ray; there is no
  acceleration structure yet.
