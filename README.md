# WebLiminal

A lightweight, zero-asset WebGPU 3D game framework built specifically for **Backrooms and liminal spaces**.

Author a new level in ~100 lines of declarative JavaScript (`rooms`, `arches`, `doorways`, `columns`, `domes`, `stairs`, `pipes`, `lights`, `skylights`, optional `water`) — and the engine automatically synthesizes seamless PBR textures, builds a flat SAH BVH, bakes multi-bounce directional global illumination at startup, and renders at real-time frame rates with hardware rasterization, parallax occlusion, screen-space reflections, volumetric sunbeams, and optional interactive caustic water.

- **Zero runtime dependencies.** Vanilla JavaScript + WebGPU + WGSL, bundled to ~50 KB gzip.
- **Zero external bitmap or mesh assets.** All 16 procedural liminal PBR materials and mipmaps are synthesized on the GPU on load.
- **Strict framework / map separation.** `src/engine/` knows no level by name; maps live cleanly under `levels/` with zero custom shaders.

## Included showcase levels

1. **Level 37 · The Poolrooms** (`?level=poolrooms`) — Sunlit ceramic arch colonnade, skylight shafts with BVH-occluded volumetric sunbeams, mosaic columns, stainless steel pool ladder, and optional live 2D wave simulation with Snell refraction, Beer-Lambert depth absorption, and live wave caustics.
2. **Level 0 · The Lobby** (`?level=level0`) — Mono-yellow damp-carpet Backrooms labyrinth with chevron-damask wallpaper, acoustic drop-ceiling T-grid, wood baseboards, and 11 recessed fluorescent troffers (including flickering ballasts). Zero water overhead.
3. **Level 1 · Habitable Zone** (`?level=level1`) — Brutalist subterranean concrete hall with board-formed structural pillars, overhead beams, wet concrete floor puddles catching SSR reflections, walkable concrete stairs and mezzanine, stainless conduits, and a procedural backlit `EXIT` sign casting real green GI bounce.

## Quick start

```sh
npm install
npm run dev
```

Open `http://127.0.0.1:4173/` in a WebGPU-capable desktop browser.

### Controls

- `WASD` / Arrow keys — Walk (`Shift` to move faster; climbs stairs and wades through pools automatically)
- Drag mouse or double-click canvas — Look (Pointer Lock supported)
- `1` / `2` / `3` — Switch between Poolrooms, Level 0, and Level 1
- `B` — Cycle viewpoint bookmarks within the active level
- `V` — Toggle Clean Architectural vs. Found Footage VHS camcorder lens
- `G` — Open Scene & Renderer Inspector (debug views, exposure, SSR/volumetrics/bloom, live telemetry)
- `M` — Toggle procedural spatial audio
- `Tab` — Pause / resume

## Scripts

```sh
npm test       # Unit tests (MapBuilder, BVH, UV2 atlas, collision, levels)
npm run build  # Validate invariants & build production bundle into dist/
npm run preview
npm run capture # Headless Chromium WebGPU screenshot capture (writes to /tmp/webliminal-captures)
```

## Documentation

- [Engine architecture](docs/ARCHITECTURE.md)
- [Map authoring guide (`MapBuilder` API)](docs/LEVELS.md)

Licensed under Apache-2.0.
