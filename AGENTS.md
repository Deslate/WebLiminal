# Poolrooms v1.8 — contributor instructions

Read the requested version in BRIEF.md. This delivery implements v1.8 continuous spring-line tile layout and preserves current-time lighting and single-image reflections. Do not configure or push remotes. Preserve unrelated `.flops/` user data.

- Zero bitmap source/deployment assets. Evidence goes outside this repository under `../workroom-v1.8-evidence/`.
- Preserve continuous ten-wave water, transported caustics, deterministic camera branches and subtle film grain. Never freeze water to stabilize lighting.
- Camera frames remain independent. Do not blur image history or introduce random camera sampling.
- Grout uses actual primary-ray height-field intersections and local visibility. Do not replace the relief with painted seams. Secondary/photon area-average approximations are documented in docs/PHYSICS.md.
- Caustics must result from photon transport, with Fresnel/Snell/absorption and receiver-area normalization. Keep CSG holes out of receiving-area denominators.
- Never reintroduce light keyframes or temporal image blending. Verify stop refinement within one second at both 60Hz and 30Hz time steps.
- `surfaceMaterial(Hit) -> Material` is the near material slot. `filteredMaterial` is for secondary footprints; photon-porcelain is the area-average transport BRDF.

Checks: `npm test`, `npm run build`, `npm run verify`, `npm run verify:near`, `npm run verify:layout`, `npm run verify:seams`, `npm run verify:record`, `npm run verify:motion`, `npm run verify:reference`, `npm run verify:analyze`, `npm run proof`. Use EVIDENCE_DIR to keep independent rounds and versions apart; REFERENCE_PATH selects a matching material/version reference for analysis.

Measure GPU-completed frames, not RAF counts. Run performance without another GPU task, capture, or edits. Report internal resolution, first frame, p95 and minimum one-second fps. Real-time browser video includes recording overhead and is separate from the performance benchmark. A stepped PNG sequence is not a real-time benchmark. Inspect close grout, reflections, bright column edges, dark regions and stop/start transitions; pixel heuristics cannot prove all visual quality.

`node scripts/static-server.mjs` serves dist at `/poolrooms/` on port 4174; VERIFY_URL selects it. Keep the dev server at localhost:4173 running in the background. Read docs/PHYSICS.md and docs/ACCEPTANCE.md for approximations, measurements and untested cases. Do not claim full photorealism or arbitrary-device guarantees.
