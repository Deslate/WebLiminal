# Map Authoring Guide (`levels/`)

Adding a new Backrooms or liminal space level requires **zero shader code and zero external assets**. Create a new module under `levels/` and register it in `levels/index.js`.

## Minimal level module

```js
export default {
  id: "my-corridor",
  title: "Level 4 · Abandoned Office",
  subtitle: "EMPTY CUBICLES",
  audio: "backrooms", // "poolrooms" | "backrooms" | "parking"
  spawn: { x: 0, y: 1.65, z: 6, yaw: 0, pitch: 0 },
  atmosphere: {
    fogColor: [0.12, 0.13, 0.12],
    fogDensity: 0.015,
    heightFogFalloff: 0.25,
    skyTop: [0.02, 0.02, 0.02],
    skyHorizon: [0.04, 0.04, 0.04],
    sun: null, // or { direction: [x,y,z], color: [r,g,b], intensity: 14, angularRadius: 0.028 }
    exposure: 1.1,
    bloomStrength: 0.22,
    volumetricStrength: 0.25,
    ambientFloor: 0.006,
    bounceBoost: 1.3,
    aoRadius: 1.6,
  },
  build(m, opts = {}) {
    m.room([-8, 0, -10], [8, 3.2, 8], {
      floor: "carpet_damp",
      ceiling: "ceiling_grid",
      walls: "wallpaper_yellow",
      trim: "wood_trim",
    });
    m.panelLight([0, 3.19, 2], 1.2, 0.6, { color: [1.0, 0.94, 0.72], intensity: 14 });
    m.panelLight([0, 3.19, -5], 1.2, 0.6, { color: [1.0, 0.94, 0.72], intensity: 14 });
  },
};
```

## Built-in procedural PBR material presets

Pass any preset name string directly to geometry methods, or create a customized variant via `m.material({ base, tint, roughness, metallic, coat, tileScale, wetness, emissive, emissiveStrength, flicker, seed })`:

| Preset | Description |
| --- | --- |
| `tile_white` | Glazed off-white 250 mm ceramic pool tiles with bevelled shoulders, recessed grout, and subtle per-tile tilt |
| `tile_pool` | Submerged turquoise-mint ceramic pool tiles |
| `tile_mosaic` | Fine glazed square mosaic tiles for columns and basins |
| `plaster_warm` | Matte architectural stucco/plaster |
| `wallpaper_yellow` | Vintage mono-yellow damask/chevron Backrooms wallpaper with paper seams and damp blotches |
| `carpet_damp` | Commercial woven loop-pile office carpet with damp moisture patches |
| `ceiling_grid` | Suspended acoustic drop-ceiling panels with metallic T-bar grid and pinhole speckles |
| `wood_trim` | Satin varnished baseboard and doorframe wood |
| `concrete_raw` | Board-formed poured concrete with panel seams and circular tie-rod dimples |
| `concrete_floor` | Subterranean troweled concrete slab with expansion joints and glossy wet puddles |
| `concrete_painted` | Weathered painted dado/safety concrete |
| `stainless_steel` | Anisotropic brushed stainless conductor metal |
| `dark_metal` | Matte dark anodized industrial steel |
| `fluorescent_panel` | Prismatic acrylic light diffuser with internal dual-tube glow |
| `exit_sign` | Backlit emergency `EXIT` light box with procedural SDF lettering |
| `vent_grate` | Metallic louvered HVAC ventilation register |

Tip: When placing many lights with identical color/intensity, create shared material handles with `m.material(...)` and pass `{ material }` to `panelLight` / `tubeLight` so only one procedural texture layer is baked per lamp type.

## `MapBuilder` API reference

All coordinates are meters, right-handed Y-up (`+X` right, `+Y` up, `-Z` forward at `yaw = 0`).

- `m.room(lo, hi, opts)` — Hollow interior shell (`floor`, `ceiling`, `walls`, optional `trim`, `trimHeight`, `ceilingHoles`, `floorHoles`, `skipWalls`). Automatically sets walkable room bounds unless `setBounds: false`.
- `m.box(lo, hi, mat, opts)` — Solid axis-aligned volume. Options: `solid` (default `true`), `walkable` (adds elevated floor surface), `faces`, `skipFaces`, `priority`.
- `m.floor(minX, minZ, maxX, maxZ, y, mat, opts)` / `m.ceiling(...)` — Horizontal slabs with optional `holes: [[x0, z0, x1, z1], ...]`.
- `m.wallWithDoorway(lo, hi, opts)` — Wall pierced by rectangular openings (`openings: [{ pos, width, bottom, top }]`, optional `trim`).
- `m.wallWithArch(lo, hi, opts)` — Wall pierced by smooth semicircular arches (`arches: [{ pos, radius, spring }]`, `segments`), with distortion-free planar spandrel UVs and smooth curved intrados.
- `m.cylinder(x, z, y0, y1, radius, mat, opts)` — Smooth vertical column (or inward drum with `inside: true`) with exact circular collision.
- `m.dome(cx, cy, cz, radius, mat, opts)` — Smooth inward upper hemispherical dome with optional `oculusRadius`.
- `m.stairs(lo, hi, dir, steps, mat, opts)` — Straight staircase (`dir`: `"+x"`, `"-x"`, `"+z"`, `"-z"`) with automatic walkable ramp collision.
- `m.pipe(p0, p1, radius, mat, opts)` — 3D cylindrical conduit, rail, or bar between two points.
- `m.poolLadder(x, z, yBottom, yTop, opts)` — Complete stainless steel pool ladder with curved deck grips and rungs.
- `m.panelLight(pos, width, depth, opts)` — Recessed ceiling fluorescent troffer (bezel + prismatic diffuser + area light).
- `m.tubeLight(cx, y, cz, length, axis, opts)` — Suspended industrial fluorescent tube fixture + area light.
- `m.signLight(lo, hi, face, opts)` — Wall-mounted glowing sign box (`face`: `"+z"`, `"-z"`, `"+x"`, `"-x"`) + area light.
- `m.skylight(minX, minZ, maxX, maxZ, y, opts)` — Registers a sky portal opening for importance-sampled daylight GI.
- `m.water(minX, minZ, maxX, maxZ, level, opts)` — Optional interactive pool water volume (`absorption`, `waveAmp`, `causticStrength`, `cellSize`). Omit for zero-cost dry maps.
- `m.bookmark(name, { x, y, z, yaw, pitch })` — Registers a viewpoint bookmark accessible via key `B` or the Inspector.
