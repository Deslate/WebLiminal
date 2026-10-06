# Light transport lab (G)

Press **G** to open the lab panel. Close it with the button, G or Esc. Tab still pauses and resumes; M and V keep their bindings while the panel is closed. While the panel is open, arrow keys navigate the controls and WASD does not move the player.

## Controls

| Control | Options (default in bold) | What it changes |
|---|---|---|
| Live water light | **Full** / Transmission only / Off | Full: live sun/sky Fresnel reflection and transmission. Transmission only: keeps `1 - F`, does not compensate for removed reflection energy. Off: no live emission or reception; only the static cache is composed. |
| Extra reflection continuation | **0** / 1 | Level 1 adds a four-direction GGX continuation at secondary solid hits with real intersections. Level 0 still keeps the primary specular path. |
| Diffuse directions | 32 / 64 / **128** / 256 | Compiles the actual number of integration directions and resizes link buffers and normalisation. |
| Cached photons per batch | 49152 / 98304 / **196608** | Real emission count per batch (128 batches); normalised by the actual count, not a brightness multiplier. |
| Sky area samples | 64 / 256 / **1024** | 8 x 8, 16 x 16 or 32 x 32 fixed aperture integration with matching PDF normalisation. Changes cache construction work, not its size or per-frame lookup count. |
| Internal resolution | **Auto** / 100% / 75% / 50% | Rebuilds camera buffers and changes the ray count. Fixed options are not overridden by the adaptive scaler. |
| Irradiance grid density | 0.5x / **1x** / 1.5x | Changes the shared receiver atlas cell count (pool floor about 4.17 / 2.08 / 1.39 cm). |
| Photon reconstruction radius | 0.5x / **1x** / 1.5x | Changes the normalised reconstruction support of cached and live photons in the light domain. No screen-space blur. |

Code: `src/lab-settings.js` (whitelist, defaults, persistence), `src/lab-menu.js` (UI and readouts), `src/main.js` (input, pause, lab state), `src/render/lab-shaders.js` (shader specialisation), `src/render/renderer.js` and the atlas builder.

## Applying settings

Changing a setting stops submission, waits for in-flight GPU work, rebuilds pipelines, receiver buffers and the static cache, and resets the wave field and lab time with the same seed. The camera position is kept. If the scene was paused, one frame is rendered with the new parameters and the scene stays paused.

Each row shows the average fps/ms of the last 60 GPU-completed frames for the whole current configuration, updated every 500 ms. It is not an RAF count and not a per-option cost attribution.

Settings persist in `localStorage` under `poolrooms-light-lab-main-v3`, per origin. Existing v2 settings retain their other controls and upgrade the old 256-point sky default to 1024; an explicit 64-point setting remains 64. Selecting 256 in v3 retains that choice. Invalid or stale values fall back to defaults. "Off" still contains the flat-water indirect paths baked into the static cache.

## Automation

```js
await __POOLROOMS_V1__.setLab({ waterMode: "off" });
__POOLROOMS_V1__.configure({ lab: { diffuseDirections: 64 } });
__POOLROOMS_V1__.snapshot().lab;
```

Unspecified keys use defaults; automation does not write `localStorage`. The benchmark accepts the same object through `LAB_CONFIG`:

```sh
LAB_CONFIG='{"diffuseDirections":64,"resolution":0.75}' npm run benchmark
```

High-cost options are not guaranteed to hold 30 fps. Extra reflection continuation is especially expensive and is off by default.

## Development preview selector

Vite development and explicit `vite build --mode preview` builds show a
collapsible selector at the top right. Ordinary production builds omit it.
The four water choices are the unchanged stable default (empty URL value,
eight pressure diffusion passes with detail off), `detail`, `fine` and `dense`.
Selecting a preset rebuilds the single resident renderer in place, resets
water and light caches, and preserves the current camera, pause and lab settings.
The URL updates automatically; selecting default removes `waterPreview`.
Existing URL-only previews retain their behavior in production.
The location dropdown uses the same bookmark navigation as keys 1–5, including
spawn placement and pause preservation. Keyboard navigation updates the dropdown.
Click the panel title to collapse or reopen it. Evidence mode hides the panel.
No water or optical parameters are edited by these controls.

Loading and rebuilds have no tracking-band overlay or introductory horizontal
image displacement. While replacing the renderer or rebuilding lab resources,
the UI holds an unmodified copy of the last complete canvas until the new
GPU frame finishes. This temporary canvas is then released; it is not used by
water, lighting, temporal filtering or the simulation. Existing tape labels,
caption, timecode, grain and lens treatment are unchanged.
