# Poolrooms v1.3 — contributor instructions

Read the final v1.3 section in BRIEF.md first. Moving must remain clean; stopping must improve physical illumination within one second. Do not configure or push remotes. Preserve unrelated `.flops/` user data.

- Zero bitmap source/deployment assets. Evidence goes outside this repository under `../workroom-v1.3-evidence/`.
- Preserve continuous ten-wave water, moving photon caustics, deterministic camera branches and subtle film grain. Never freeze water to stabilize lighting.
- Camera frames remain independent. Refine world lighting without screen-history blur or water/reflection ghosting. Materials and grout remain evaluated after irradiance interpolation.
- Caustics must result from actual photon transport; no projected or emissive wave patterns. Preserve Fresnel/Snell/absorption weights and receiving-area normalization.
- Irradiance cells pack surface id in the low 16 bits and quarter-cell receiving coverage in the high 16 bits. Exclude CSG holes from kernel normalization. Do not turn a void into a black receiver.
- Never expose a partially built future light cache. Test both 60Hz and 30Hz time steps for cache deadlines and stop refinement.
- `surfaceMaterial(Hit) -> Material` remains the material slot. Keep collision geometry consistent with rendered geometry.

Checks: `npm test`, `npm run build`, `npm run verify`, `npm run verify:motion`, `npm run verify:reference`, `npm run verify:analyze`, `npm run proof`. `verify:frames` aliases the same v1.3 capture script; it need not be run twice. Old v1.1 motion scripts are historical, not current acceptance.

Measure GPU-completed frames, not RAF counts. Run performance without another GPU task, capture, or renderer edits. Report internal resolution, first frame, p95 and minimum one-second fps. A time-stepped evidence movie is not a real-time fps benchmark. Numerical isolated-pixel checks are heuristics, not proof of all perceptual quality; inspect moving/stopping frames and dark regions.

`node scripts/static-server.mjs` serves the build at `/poolrooms/` on port 4174; set `VERIFY_URL` to test that deployment. Leave the dev server at localhost:4173 running in the background on delivery. Read docs/PHYSICS.md for approximations and docs/ACCEPTANCE.md for measurements and untested cases. Do not claim full photorealism or arbitrary-device guarantees.
