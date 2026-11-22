# v2 Map Authoring Guide (`levels/v2/`)

Adding a new v2 Backrooms or liminal space level requires **zero shader code and zero external assets**. Create a new module under `levels/v2/` and register it in `levels/v2/index.js`.

## Minimal level module

```js
export default {
  id: "my-corridor",
  title: "Level 4 · Abandoned Office",
  subtitle: "EMPTY CUBICLES",
  audio: "backrooms", // "poolrooms" | "backrooms" | "parking" | "horror"
  spawn: { x: 0, y: 1.65, z: 6, yaw: 0, pitch: 0 },
  atmosphere: {
    fogColor: [0.02, 0.022, 0.02],
    fogDensity: 0.015,
    heightFogFalloff: 0.25,
    skyTop: [0.02, 0.02, 0.02],
    skyHorizon: [0.04, 0.04, 0.04],
    sun: null, // or { direction: [x,y,z], color: [r,g,b], intensity: 22, angularRadius: 0.0085 }
    exposure: 1.1,
    fov: 68, // optional per-level vertical FOV in degrees
    bloomStrength: 0.25,
    volumetricStrength: 0.35,
    ambientFloor: 0.002,
    bounceBoost: 1.4,
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
| `tile_white` | Analytical glazed off-white porcelain tiles with exact box-filtered millimeter grout, bevel lips, and per-tile 3D micro-tilt |
| `tile_pool` | Neutral light glazed ceramic pool tiles (water color emerges physically from Beer-Lambert optics) |
| `tile_mosaic` | Fine glazed square mosaic tiles for columns and basins |
| `tile_dado_green` | Deep glossy emerald-green glazed ceramic wainscoting tile |
| `frosted_window` | Backlit frosted milk-glass pool window / porthole diffuser |
| `fiberglass_slide` | Dark glossy molded fiberglass water slide surface |
| `plaster_warm` | Matte architectural stucco/plaster |
| `plaster_mud` | Rural aged mud-plaster with damp lower flaking stucco relief, ceiling soot, and optional vertical edge fissure |
| `stone_damp` | Dark gritty uneven stone floor with patchy glossy wet reflections and micro-grit normal breakup |
| `wood_plank_aged` | Aged charcoal-timber vertical planks with plank grooves and pale dry lower weathering |
| `couplet_paper` | Weathered crimson/magenta Chinese Spring Festival couplet, horizontal scroll, or door talisman with procedural SDF brush calligraphy (`seed` 1–5) |
| `candle_wax` | Warm translucent paraffin wax with height-graded subsurface wick glow |
| `candle_flame` | Incandescent flickering candle flame or smoldering vigil ember |
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

- `m.room(lo, hi, opts)` — Hollow interior shell (`floor`, `ceiling`, `walls`, optional `trim`, `trimHeight`, `ceilingHoles`, `floorHoles`, `skipWalls`).
- `m.box(lo, hi, mat, opts)` — Solid axis-aligned volume (`solid`, `walkable`, `faces`, `skipFaces`, `priority`).
- `m.floor(minX, minZ, maxX, maxZ, y, mat, opts)` / `m.ceiling(...)` — Horizontal slabs with optional `holes`.
- `m.wallWithDoorway(lo, hi, opts)` — Wall pierced by rectangular openings (`openings: [{ pos, width, bottom, top }]`, optional `trim`).
- `m.wallWithArch(lo, hi, opts)` — Wall pierced by smooth semicircular arches (`arches: [{ pos, radius, spring }]`, `segments`).
- `m.ringWall(lo, hi, opts)` — Wall pierced by a full circular tunnel ring (cleanly floor-clipped) or a backlit circular porthole (`center`, `centerY`, `radius`, `glassMaterial`, `lightColor`, `lightIntensity`).
- `m.pillWindowBay(lo, hi, opts)` — Wall bay with a tall rounded pill-shaped backlit frosted window + automatic area light (`windowWidth`, `sillY`, `headY`, `facing`).
- `m.cylinder(x, z, y0, y1, radius, mat, opts)` — Smooth vertical column (or inward drum with `inside: true`) with exact circular collision.
- `m.dome(cx, cy, cz, radius, mat, opts)` — Smooth inward upper hemispherical dome with optional `oculusRadius`.
- `m.stairs(lo, hi, dir, steps, mat, opts)` — Straight staircase with automatic walkable ramp collision.
- `m.spiralStairs(cx, cz, y0, y1, innerR, outerR, startAngle, sweepAngle, steps, mat, opts)` — Cantilevered spiral staircase wrapping a cylindrical column.
- `m.pipe(p0, p1, radius, mat, opts)` — 3D cylindrical conduit or rail between two points.
- `m.curvedTube(controlPoints, radius, mat, opts)` — Smooth Catmull-Rom 3D swept tubular geometry (fiberglass water slides, curved conduits, optional `flanges`).
- `m.handrail(p0, p1, yBase, height, opts)` — Sleek stainless-steel poolside railing with posts and mid-rail.
- `m.poolLadder(x, z, yBottom, yTop, opts)` — Complete stainless-steel pool ladder with curved deck grips and rungs.
- `m.panelLight(pos, width, depth, opts)` / `m.tubeLight(...)` / `m.signLight(...)` — Recessed troffers, industrial tubes, and backlit signs with automatic analytical area lights.
- `m.pointLight(pos, opts)` — Omnidirectional spherical emitter (`color`, `intensity`, `radius`, `shadowOffset`, `flickerAmp`, `flickerFreq`, `flickerPhase`) with adaptive soft shadows, GGX specular, baked indirect GI, glossy reflections, and volumetric mist.
- `m.skylight(minX, minZ, maxX, maxZ, y, opts)` — Sky portal opening for importance-sampled daylight GI and occluded volumetric mist.
- `m.water(minX, minZ, maxX, maxZ, level, opts)` — Optional physical BVH water volume with live GPU photon caustics (`absorption`, `waveAmp`, `causticStrength`, `cellSize`). Omit for zero-cost dry maps.
- `m.bookmark(name, { x, y, z, yaw, pitch })` — Registers a viewpoint bookmark accessible via key `B` or the Inspector.
