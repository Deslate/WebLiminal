# Workroom — agent and contributor guide

## Vision

Workroom is a real-time, physically based renderer for the Backrooms, growing from one hand-built scene into a set of explorable levels:

1. **Multiple levels.** Poolrooms is the first. Each further level (offices, corridors, parking structures, ...) reuses the same rendering base with its own geometry, materials, water or no water, and lighting.
2. **Endless maps.** Levels are generated procedurally and streamed around the player from a seed, so a level has no edge and the same seed produces the same world.
3. **Online exploration.** Several players explore the same seeded world together, see each other, and disturb the same water.

The renderer that exists today is the **foundation**, not the product. Work should move the project toward the three goals above. Do not spend open-ended effort tuning the look of the current scene; change the rendering base only when a feature needs it or it blocks one of the goals.

## Current state

- One level, Poolrooms, with five authored locations addressed in one world. The original 14 x 27 m location remains the 15-shape scene in `levels/poolrooms-scene.js`; four additional recipes live in `levels/poolrooms-regions.js`. One local window is resident at a time. The renderer consumes a scene description and knows no level by name; see `docs/LEVELS.md`.
- WebGPU + vanilla JavaScript + Vite. No runtime dependencies, no bitmap assets; all materials are procedural WGSL.
- Stateful GPU water (finite-depth background field plus a spectral body wake), photon-traced caustics, finite-volume diffuse transfer, deterministic path-traced camera with GGX reflections, and an in-app light transport lab (G). See `docs/PHYSICS.md` and `docs/LIGHTING-LAB.md`.
- Performance is the main constraint for scaling up. At a fixed 100% internal resolution the scene runs at roughly 10–12 fps on an Apple M3 Max, and about 18 fps at 70%; by default an adaptive internal resolution keeps it interactive. About 86% of frame time is the camera pass, and most of that is secondary GGX reflection rays. Larger and streamed worlds need a new performance budget; plan for it rather than assuming the current cost scales.
- The git tag `stable-1` marks the last render baseline accepted before the world sun was lowered; the original location no longer reproduces it (see Decisions).

## Architecture

### Today

```
index.html, src/style.css   page shell and overlay UI
src/main.js                 input, player, camera, clock, pause, lab, automation API
src/collision.js            player vs. 2D solid footprints
src/audio.js                procedural spatial audio
src/wake-trail.js, src/kick-impacts.js   body/footstep sources for the water
src/lab-settings.js, src/lab-menu.js     light transport lab settings and UI
src/render/
  renderer.js               WebGPU device, buffers, pipelines, per-frame pass order
  scene.js                  scene description: validation, GPU packing, WGSL constants
  light-atlas.js            shared world-space receiver grids for photon flux
  wave-simulation.*         background water field + composition
  finite-depth.*            finite-depth dispersion operator on the wet domain
  body-waves.*              spectral body wake (FFT)
  common.wgsl               shared scene intersection, water, shading helpers
  photons.wgsl, water-caustics.wgsl, resolve.wgsl, sky.wgsl,
  diffuse-transfer.wgsl, compose-light.wgsl         light transport passes
  camera.wgsl, reflection-filter.wgsl, present.wgsl  camera and display
  lab-shaders.js            shader specialisation for lab settings
materials/                  procedural WGSL materials (near + photon BRDF)
levels/                     level registry and level modules (data, scene builder, materials)
scripts/                    content validation, unit tests, visual benchmark
docs/                       physical model, level format and lab reference
```

Per frame: advance water to real elapsed time, emit live photons through the current surface, resolve irradiance, propagate diffuse transfer, compose light, trace the camera, filter reflections, present.

Coupling still to remove before large or streamed worlds: shaders test one static shape list with no acceleration structure; water rectangle, aperture plane and floor receiver are compile-time constants for a loaded level; the body-wake FFT window is fixed around the world origin; a level has exactly one water body and one roof aperture (wall apertures are specialised per window, and the live water caustics use them only through their projected footprint).

### Target (proposed, not implemented)

- **Chunked world.** The world is divided into chunks. `generate(seed, level, chunkCoord) -> chunk` is deterministic and pure. A chunk manager loads chunks around the observer, uploads their geometry, builds or reuses their light caches, and evicts distant ones. Intersection moves to an acceleration structure once shape count grows beyond a handful.
- **Local simulation windows.** Water and light caches are computed in windows that follow the player instead of covering a whole level.
- **Networking.** A small authoritative Node server owns sessions, seeds and player state. Clients share seed, level edits and player poses; the world is regenerated locally from the seed. Water and light stay local visual simulation; remote players are injected as body sources so everyone sees each other's wakes.

These are directions, not decisions. Record the decision in this file when a piece is actually designed.

### Decisions

- **World locations (implemented).** A level may expose `world.generate({x,z})` and navigation bookmarks. Integer addresses are 64 m world cells; `src/world.js` maps local poses to world coordinates. Bookmarks are separate from the spatial resolver. The current resolver has five authored cells and rejects unauthored addresses; it is not a seeded or seamless generator. Teleport replaces one resident GPU window, releases the old device, rebases the player and resets local simulations. Left/right cycle bookmarks, 1–5 teleport, WASD and up/down move. Original scene and material paths remain unchanged. This establishes address/content/residency boundaries for future streaming; neighbor seams, corridors, seed generation, acceleration and simulation continuity remain future work. New content uses at most 80 shapes/window, 8 cells/m general receivers and 24/m pool floors; measure GPU-completed frame time rather than assuming a frame budget is met. Format and limitations: `docs/LEVELS.md`.
- **Curved region geometry (implemented).** Capped cylinders, upper hemispherical cavities, cylindrical pool cutouts and continuous round U-tubes extend the analytic scene primitives for the new Poolrooms locations. Equal-area curved receiver charts preserve physical photon normalization; water masks respect columns and basin cutouts. Circular column collision is exact. Stainless steel has zero diffuse albedo, conductor reflectance and geometric tube normals; secondary metal reflections have a bounded traced continuation. Shader specialization leaves original windows' shared WGSL unchanged. The rotunda simulates only the rectangle enclosing its complete circular basin. See `docs/PHYSICS.md`.
- **Wall rails (implemented).** Straight capped horizontal cylinders and continuous horizontal torus rails are available as conductor primitives with no diffuse receiving charts; the threshold uses straight rails on round posts standing in the water. A per-window tile module sets physical ceramic spacing; unset modules preserve historical 250 mm tiles. Threshold daylight enters actual openings: sky through the lightwell, bounced light from the void above the corridor ceiling through a hidden slot behind the viewer, and the low world sun through a wall aperture into that void and through the shaft's arcade openings. A locally widened lower reveal admits sun beneath the corridor ceiling; a tiled channel roof screens overhead sky without a light override. See `docs/LEVELS.md`.
- **Reference-matched layouts (implemented).** Each of the four new Poolrooms locations is laid out after one reference view, judged by a side-by-side comparison of structure (walls, columns, rails, turns, openings, where light comes from), not by a dimension table. Spawn poses are those views. Every light source is a real aperture placed where the reference view cannot see it; reflections in the reference are never modelled as openings. Two analytic primitives support this: arcade drums (a circular wall pierced by equal, evenly spaced radial round-headed openings) and full rings about a horizontal axis (a large outer radius makes a wall with a round hole). Domes, basins and drums may take an explicit centre so their box clips them. A location is oriented in the world (turned about the vertical axis with its camera) and sees the world sun in its own frame; it may restrict its lab aperture range.

- **World sun (implemented).** The whole world has one sun, 14 degrees above the horizon, with the azimuth the original location always used. It was lowered from 43.7 degrees because all four reference views show a low sun (stripes through slits, light grazing under a lightwell rim, light through ring holes and far openings). The original location changed as a result: its sunbeam through the roof aperture no longer reaches the pool, which is now lit by sky; this was accepted. The benchmark's exact-luma gate compares against the run recorded after this change, not against `stable-1`. Locations are oriented in the world instead of being given their own sun direction.
- **Air scattering (implemented).** The four new locations have real single scattering in the air: a fixed world grid of sun visibility and aperture sky radiance, marched by primary camera rays with a Henyey-Greenstein phase. No screen-space shafts or bloom. The scattering coefficient (0.02/m) is deliberately five times the physical value implied by the 0.004/m extinction, fitted to the reference haze. It costs 0.2-1.7 ms per frame at 640 x 416 and needs a ninth camera storage buffer (adapters without it render without air). See `docs/PHYSICS.md`.
- **Engine vs. level (implemented).** A level is a module (`id`, `spawn`, `optics`, `limits`, `materials`, `scene(options)`); `scene()` returns plain data: bounds, shapes with per-face receiver density, solids, one water rectangle, one sky aperture and the floor receiver. `src/render/scene.js` validates and packs it and derives a WGSL constant prelude; `levels/index.js` is the registry and `src/main.js` selects by `?level=`. Nothing under `src/render/` may import `levels/` or `materials/` (enforced by `npm run validate`). Poolrooms was moved over with byte-identical GPU buffers. Format: `docs/LEVELS.md`.

## Roadmap

1. **Level abstraction.** Done: scene description, Poolrooms level module, renderer free of level imports (see Decisions). Multiple water bodies, other light sources and a no-water level wait for step 4.
2. **Scale.** Acceleration structure, chunked light atlases, streaming and eviction, moving water window. Set a frame budget per chunk.
3. **Procedural Poolrooms.** Seeded chunk generator; endless layout with coherent rooms, pools and ceiling apertures.
4. **Second level.** Prove the abstraction with a level that has different geometry, materials and lighting.
5. **Multiplayer.** Server, presence, remote bodies as wake sources, shared seeds.

## Rendering base invariants

Keep these unless a roadmap item explicitly needs to change one; if it does, say so in the change.

- No bitmap source or deployment assets. Materials and patterns are procedural.
- Caustics come from photon transport through the live water surface (Fresnel, Snell, absorption, receiver-area normalisation). No painted caustics; CSG holes stay out of receiver-area denominators.
- Camera frames are independent: deterministic branches, no random per-frame camera sampling, no temporal image blending or history blur. Film grain stays subtle.
- Water is stateful. Advance it from a reset with real elapsed time; never seek analytically to an arbitrary time and never freeze water to stabilise lighting.
- The player body is a soft forcing potential, not an exact moving boundary. In-water walking is capped at 1.6 m/s (0.8 m/s default); do not raise it without re-testing near-critical waves.
- Grout and tile relief come from real primary-ray height-field intersections, not painted seams.
- `surfaceMaterial(Hit) -> Material` is the near material slot; `filteredMaterial` is for secondary footprints; `photon-porcelain` is the area-average transport BRDF.
- Do not claim full photorealism or guarantees on arbitrary devices.

## Commands

```sh
npm install
npm run dev          # Vite dev server on http://127.0.0.1:4173/ (WebGPU desktop browser)
npm run build        # validate level content, then build dist/
npm run preview      # serve dist/
npm test             # unit tests in scripts/*.test.mjs
npm run benchmark    # visual benchmark: 76 s scripted walk, controls, analysis, performance
```

`npm run benchmark` needs the dev server running, Google Chrome with WebGPU (Playwright launches it headless), and a Python with numpy, Pillow, PyAV and OpenCV (`PYTHON`, default `python` on Windows and `python3` elsewhere). Output goes outside the repository (default `../workroom-v1.49-evidence/benchmark/`; override with `EVIDENCE_DIR`). `VERIFY_URL` selects the page, `LAB_CONFIG` passes lab settings, `CASES` limits the control cases, `SKIP_PERFORMANCE=1` skips the timing run. It runs on macOS and Windows. Before timing, `scripts/environment-lab-v158.mjs` records competing GPU load (`ioreg` on macOS, GPU Engine performance counters on Windows). Frames are compared as exact luma in each case's `source-luma.npy`. A REVIEW result is not a visual pass, and a 30 Hz replay is not a real-time fps measurement.

Run the benchmark after changes that can affect rendered light, materials, camera, water motion or interaction. For performance, measure GPU-completed frames at a fixed internal resolution with no other GPU load, and report resolution, p95 and minimum one-second fps.

## Iteration workflow

Measured on the round that lowered the world sun (158 min wall clock): 91 min
waiting on full benchmark runs (6 runs of 18-21 min, one voided after 1.3 min
because a file was written under the repository mid-run), 31 min rendering
(38 location captures, about a fifth of them of unchanged scenes, Rotunda and
Threshold spending 50-70 s each on shader compilation), and 34 min of
writing and analysis. Unit tests and validation take 3 s. A single-case gate
(`CASES=current SKIP_PERFORMANCE=1`) takes 2 min and makes the same exact
comparison as the full run. Work in this order:

1. **Tier 0, every edit (seconds).** `npm test` and `npm run validate`. The
   original location's scene and GPU packing are already covered by tests, so
   a change confined to a new location's recipe needs no benchmark.
2. **Tier 1, each candidate (one capture).** Capture only the locations the
   change touches, once per candidate, and judge it with the measurement
   tables. Do not recapture unchanged locations to prove they are unchanged.
   Batch parameter sweeps into one run.
3. **Tier 2, before a commit that touches shared code (2 min).** If
   `src/render/`, `materials/`, `levels/poolrooms.js` or
   `levels/poolrooms-scene.js` changed, run
   `CASES=current SKIP_PERFORMANCE=1 npm run benchmark` and compare the
   `current` luma exactly with the recorded baseline.
4. **Tier 3, once at the end of a round (about 19 min).** The full benchmark,
   only if rendered light, materials, camera or water code changed in the
   round, or to record a new baseline. Produce the before/after and
   reference comparison images in the same closing step, not per iteration.

Rules: write every repository file before starting any benchmark, and keep
experiments outside the repository; the benchmark aborts if the source hash
changes mid-run. Never wait by sleeping in a polling loop: run the 2 min gate
in the foreground, and for a long run do work outside the repository and wait
on its completion once.

## Repository rules

- **English only.** Code, comments, docs, script output and commit messages.
- **No history in the tree.** No requirement logs, acceptance records, metric snapshots or version-numbered one-off scripts. Git history is the history. Measurements and captures go outside the repository (for example `../workroom-evidence/`), never into it.
- Keep `docs/` describing the present system. Update it in the same change as the code.
- Local commits only. Do not configure or push remotes.
- Leave `.flops/` alone; it is user data.

## Known cleanup debt

- Benchmark scripts still carry version suffixes (`*-v149`, `*-v157`, `*-v158`) because the pipeline hash covers their paths; renaming them invalidates cached runs.
- Names such as `poolrooms-v1` (package, level id) and `window.__POOLROOMS_V1__` predate the multi-level plan.
