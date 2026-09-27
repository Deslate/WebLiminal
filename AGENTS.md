# Poolrooms v1.16 — contributor instructions

Read the requested version in BRIEF.md. This delivery adds a stateful finite-depth dispersive body wake and high-angle observer view, preserving current-time lighting and single-image reflections. Do not configure or push remotes. Preserve unrelated `.flops/` user data.

- Zero bitmap source/deployment assets. Evidence goes outside this repository under `../workroom-v1.16-evidence/`.
- Preserve the stateful GPU wave equation and real locomotion pressure sources, transported caustics, deterministic camera branches and subtle film grain. Never freeze water to stabilize lighting.
- Camera frames remain independent; the physical simulation deliberately has memory. Replay the simulation from reset for comparisons: do not seek analytically to an arbitrary time, or expect a foot disturbance to vanish exactly when its source turns off. Do not blur image history or introduce random camera sampling.
- Grout uses actual primary-ray height-field intersections and local visibility. Do not replace the relief with painted seams. Secondary/photon area-average approximations are documented in docs/PHYSICS.md.
- Caustics must result from photon transport, with Fresnel/Snell/absorption and receiver-area normalization. Keep CSG holes out of receiving-area denominators.
- Never reintroduce light keyframes or temporal image blending. Verify stop refinement within one second at both 60Hz and 30Hz time steps.
- `surfaceMaterial(Hit) -> Material` is the near material slot. `filteredMaterial` is for secondary footprints; photon-porcelain is the area-average transport BRDF.

Checks: `npm test`, `npm run build`, `npm run verify`, `npm run verify:near`, `npm run verify:floor`, `npm run verify:layout`, `npm run verify:joint`, `npm run verify:seams`, `npm run verify:record`, `npm run verify:wakes`, `npm run verify:wake-coupling`, `node scripts/nonloop-v113.mjs`, `npm run verify:wake-performance`, `npm run verify:motion`, `npm run verify:reference`, `npm run verify:analyze`, `npm run proof`. Use EVIDENCE_DIR to keep independent rounds and versions apart; REFERENCE_PATH selects a matching material/version reference for analysis.

Measure GPU-completed frames, not RAF counts. Run performance without another GPU task, capture, or edits. Report internal resolution, first frame, p95 and minimum one-second fps. Real-time browser video includes recording overhead and is separate from the performance benchmark. A stepped PNG sequence is not a real-time benchmark. Inspect close grout, reflections, bright column edges, dark regions and stop/start transitions; pixel heuristics cannot prove all visual quality. Inspect coherent rapid shimmer as well as isolated noise. Compare raw wave temporal/spatial spectra; floor tile images cannot measure simulation anisotropy.

`node scripts/static-server.mjs` serves dist at `/poolrooms/` on port 4174; VERIFY_URL selects it. Keep the dev server at localhost:4173 running in the background. Read docs/PHYSICS.md and docs/ACCEPTANCE.md for approximations, measurements and untested cases. Do not claim full photorealism or arbitrary-device guarantees.

Player displacement is a soft forcing potential, not an exact moving impermeable boundary. Keep that approximation explicit. Player and observer positions are independent. Wading speed is capped at 1.6m/s after a failed 2.4m/s near-critical-wave stress test; do not silently restore faster water movement. Body is visible to camera/refraction/reflection and blocks current water photons, but uses approximate shading and does not receive a full indirect-light solve.

v1.15 checks: `node scripts/simulation-v115.mjs`, `node scripts/coupling-v115.mjs`, `node scripts/record-v115.mjs`, `node scripts/stop-v115.mjs`, `node scripts/motion-v115.mjs`; inspect decoded recording and stop frames. The isolated floor-optics fixture intentionally uses `body:false`; body coupling is independently tested with the same cylinder/shadows/footsteps in both variants. Common shader uniforms now occupy 416 bytes.


v1.16 replaces radial shallow-water body forcing with a stateful finite-depth spectral body response. Read current PHYSICS.md for important linear-superposition, internal-wall and missing-vorticity limitations. Do not claim exact 19.5 degree wakes at arbitrary finite depth. The body pressure has a calibrated leading footprint, not a prescribed V-shaped pattern. New primary body checks: `node scripts/simulation-v116.mjs`, `node scripts/record-v116.mjs`, `node scripts/performance-v116.mjs`; v1.15 simulation exact-30/60 and old meniscus numbers are historical, not unchanged invariants. Wading now has .8m/s slow and Shift1.6m/s fast, never2.4m/s. Evidence cameras must include the player for the whole path.
