# Poolrooms v1.1 — contributor instructions

Read the final **v1.1** section in `BRIEF.md` first. Moving without visible sampling noise takes priority over v1 photorealism. Do not configure or push remotes. Preserve unrelated `.flops/` user data.

## Rendering rules

- Zero bitmap source/deployment assets. Save verification PNGs outside this repository, under `../workroom-v1.1-evidence/`.
- Camera motion must not reset world lighting or select a noisier shading mode. No stochastic camera branches, jitter, animated film grain or history blending in the interactive path.
- Do not hide noise by blurring the final image. Lighting-density filtering happens in world metres before full-resolution material evaluation. Subpixel material filtering must preserve area coverage of visible grout lines.
- Water caustics must still originate from actual photon transport. No projected wave pictures, emissive sine patterns or screen-space caustic substitutes.
- Photon and camera rays intersect the same, fixed-phase, six-wave surface. Water level, amplitude and skylight changes invalidate the cache; camera changes do not.
- Preserve Fresnel/Snell/absorption weights, normalization by photon count and physical receiving area. Photon flux has no radiance eta-squared multiplier; camera transmission does.
- `surfaceMaterial(Hit) -> Material` remains the material slot. `U.sampling.y` distinguishes camera pixel-footprint filtering from photon material evaluation.
- Keep swept collision geometry consistent with render geometry.

## Checks

`npm test`, `npm run build`, `npm run verify`, `npm run verify:motion`, `npm run verify:frames`, `npm run proof`.

Measure GPU-completed frames, not empty RAF callbacks. Do not change renderer code or run another GPU benchmark during performance capture. Never mix screenshot/screencast overhead with normal fps. Inspect all captured moving frames, including dark regions, and compare stopping frames with +1s. Numerical hot-pixel tests are only heuristics, not proof of perceptual quality.

`node scripts/static-server.mjs` serves the build at `/poolrooms/` on port 4174. Set `VERIFY_URL` for that static deployment test. Keep the development server on localhost:4173 in the background on delivery.

Read `docs/PHYSICS.md` for current approximations and `docs/ACCEPTANCE.md` for measured results and untested cases. Historical `*-v1.md` documents are not current rendering requirements. Do not claim full photorealism, arbitrary-device performance or universal zero aliasing based on a bounded local test.
