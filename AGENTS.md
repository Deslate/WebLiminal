# WebLiminal — Agent & Contributor Guide

## Vision

WebLiminal is a lightweight, zero-asset WebGPU 3D framework purpose-built for **Backrooms and liminal spaces**:

1. **Author maps, not renderers.** Defining a new level takes ~80–150 lines of declarative architectural primitives (`src/engine/map-builder.js`) with zero per-level shader code.
2. **Startup synthesis + real-time hardware rasterization.** On load, the GPU synthesizes procedural PBR material arrays with Toksvig mipmaps, builds a flat SAH BVH, and progressively bakes multi-bounce directional lightmaps. Runtime frames use hardware-rasterized PBR, parallax occlusion mapping, screen-space reflections, BVH volumetric shafts, bloom, and AgX filmic tone mapping.
3. **Optional simulation plugins.** Interactive water (2D wave PDE, Snell refraction, Beer-Lambert absorption, live caustics) is allocated only when a map declares `m.water(...)`; dry levels pay zero water cost.

## Architecture

```
index.html, src/style.css   minimal HUD, inspector drawer, viewport shell
src/main.js                 level loader, FPS/drag input, collision loop, automation API
src/engine/                 framework core (must NEVER import from levels/)
  map-builder.js            declarative architectural DSL -> mesh, UV2, BVH, lights, collision
  uv-atlas.js               automatic shelf/skyline lightmap UV2 packer with gutter padding
  bvh.js                    binned-SAH flat BVH builder + CPU reference intersector
  materials.js              16 built-in procedural PBR liminal material presets & GPU table
  collision.js              2D solids (boxes/circles) + walkable elevation/stair zones
  audio.js                  multi-profile procedural Web Audio soundscapes
  water.js                  optional GPU 2D wave simulation & refracted caustic water module
  renderer.js               unified WebGPU pipeline (bake + real-time passes)
  shaders/
    bake-textures.wgsl      periodic procedural PBR texture synthesizer (16 presets)
    mipmap.wgsl             Toksvig-aware albedo/normal/roughness mipmap generator
    bake-gbuffer.wgsl       UV2 lightmap G-buffer rasterizer & conservative gutter dilation
    bvh-common.wgsl         shared BVH structs, sky model, and RNG helpers
    bake-lightmap.wgsl      progressive GPU BVH path-traced directional GI + NEE + AO baker
    denoise-lightmap.wgsl   geometry-aware bilateral denoiser & final gutter dilation
    gbuffer-pbr.wgsl        hardware-rasterized sky + PBR + POM + directional lightmap
    ssr.wgsl                half-res screen-space reflections + roughness-aware composite
    water-sim.wgsl          optional 2D wave PDE with Neumann solid reflections & wakes
    water-render.wgsl       Snell refraction, Beer absorption, live caustics, Fresnel SSR
    volumetric.wgsl         half-res BVH-occluded volumetric sunbeams & area-light haze
    postprocess.wgsl        bloom extract/blur, exponential fog, AgX tonemap, optional VHS lens
levels/                     lightweight declarative maps (zero WGSL)
  index.js                  level registry
  poolrooms.js              Level 37 · Poolrooms
  level0.js                 Level 0 · The Lobby
  level1.js                 Level 1 · Habitable Zone
scripts/
  validate-content.mjs      CI invariant check: zero bitmaps, engine isolation, map compilation
  engine.test.mjs           unit tests for MapBuilder, BVH, UV2 packing, collision, levels
  capture.mjs               headless Chromium WebGPU screenshot capture (writes outside repo)
docs/
  ARCHITECTURE.md           rendering and baking pipeline reference
  LEVELS.md                 declarative map authoring guide & MapBuilder API
```

## Framework invariants

- **Zero bitmap or binary mesh assets** in the repository (enforced by `npm run validate`).
- **Strict engine isolation:** nothing under `src/engine/` may import from `levels/` (enforced by `npm run validate`).
- **Universal geometry pipeline:** all map primitives compile to a unified indexed triangle mesh + UV2 lightmap atlas + flat SAH BVH. Adding new architectural builders must not require modifying renderer shaders.
- **Hardware limits:** stay within default WebGPU core limits (`<= 8` storage buffers per shader stage, core filterable/storage texture formats only) and support software fallback adapters cleanly.
- **Dry levels pay zero water cost.** Water buffers and passes exist only when a level calls `m.water(...)`.

## Commands

```sh
npm install
npm run dev       # Vite dev server on http://127.0.0.1:4173/
npm test          # Unit tests in scripts/*.test.mjs
npm run build     # Content validation + production Vite bundle
npm run capture   # Headless Chromium WebGPU screenshot capture (outputs to /tmp/webliminal-captures)
```

## Repository rules

- **English only** for code, comments, documentation, script output, and commits.
- **No history or captures in the tree.** Write screenshots, benchmarks, and diagnostics outside the repository (e.g., `/tmp/webliminal-captures` or `../workroom-evidence/`).
- Keep `docs/` synchronized with the current architecture.
- Local commits only; do not push remotes. Leave `.flops/` untouched if present.
