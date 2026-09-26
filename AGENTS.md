# Poolrooms v1 — contributor instructions

Read the **v1 section at the end of BRIEF.md first**. It supersedes the old v0 rendering shortcuts. Do not configure or push a Git remote. Keep unrelated `.flops/` user data untouched.

## Non-negotiable rendering rules

- No bitmap resources in the source tree or deployment: no textures, normal maps, HDRIs, LUTs, baked photos, or screenshot placeholders. Evidence images belong in the sibling `../workroom-v1-evidence/` directory, not this repository.
- Water highlights on walls/ceilings must come from optical transport. Do not add emissive sine patterns, projected caustic textures, SSR caustics, camera-space brightening masks, or hand-painted fixes.
- The photon pass and camera pass must intersect the same water height field and use its analytic derivative. Changing water level or aperture must change ray paths and flux normalization.
- Retain the energy weights: Fresnel branch sampling divides by the branch probability; photon flux does not get a radiance eta-squared factor; camera transmission does. The photon estimate divides by emitted photon count and the receiving cell's physical area.
- The material slot is `surfaceMaterial(Hit) -> Material` in `materials/porcelain.wgsl`. Preserve the signature and generate all surface details from world coordinates and deterministic hashes.
- Keep collision extents consistent with `src/render/geometry.js`. Camera height is fixed above the floor. The scene uses metres.

## Working commands

- `npm ci && npm run dev` — localhost:4173.
- `npm run build` — content/zero-bitmap validation, then a static `dist/` with relative URLs.
- `npm test` — swept collision tests.
- `npm run verify` — hardware-WebGPU Chrome timing, movement, sound, errors and network checks. `HEADLESS=0 npm run verify` runs headed. Measurements count completed GPU submissions, not an empty RAF callback.
- `npm run proof` — one browser, one renderer, locked camera/seed/exposure. Exports original / water-level / aperture comparisons, an additional flat-wave control, an exact restored-state control, and a full-size frame. Each image accumulates 1024 batches. CPU code independently checks GPU-returned photon paths against the height field, normals, Snell's law, reflection, Fresnel and flux weights.
- `EVIDENCE_DIR=/absolute/path/outside/repo` overrides the evidence destination.
- `node scripts/static-server.mjs` serves the build at `http://127.0.0.1:4174/poolrooms/` for static subpath verification.

Do not edit source or run another browser benchmark during measurements: HMR and GPU contention invalidate them. Inspect every comparison image and the full-size image. A passing numerical test does not prove photorealism.

## Runtime tradeoffs to preserve or explicitly revise

WebGPU is required; there is no fake WebGL fallback. When the camera is idle, the simulation time settles and the exact static scene progressively converges. Moving resumes wave evolution and short-history sampling. The controlled proof API explicitly freezes time and can stop at an exact sample count; it is not visible UI. New browsers may require an input before Web Audio can run. Never report suspended audio as successful playback.

`docs/PHYSICS.md` describes the estimator and its limits. `docs/ACCEPTANCE.md` records actual evidence and remaining shortcomings. Do not describe the finite-grid, finite-bounce estimator as an unbiased, exact solution of all light transport.
