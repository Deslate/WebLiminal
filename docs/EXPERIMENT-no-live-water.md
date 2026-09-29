# Experimental removal of realtime water-light transport

Candidate only, based on bfb1dbc. The main worktree remains unchanged. This is the requested subtraction experiment, not a claim of physically complete lighting or a production recommendation.

Removed: the water-caustics shader, its emission/receiver/reconstruction pipelines and buffers, the flat-water reference, transfer-link baking, and four runtime diffuse iterations. Composition now selects only the existing coarse/fine static photon cache. No light intensity, exposure, material, water geometry, wave simulation, footsteps or camera reflection/refraction changes. The original cached-photon path exclusion is intentionally unchanged; it does NOT fill the removed first-water receiver paths. Direct sky/sun camera lighting remains.

The unused diffuse-transfer source remains in the repository but is neither imported, compiled nor dispatched. Pipeline array holes preserve unrelated camera indices. Diagnostic receiver reads expose the remaining composed static cache, labelled as such; no realtime water packets are submitted.

Evidence: `/Users/steven/Projects/workroom-v1.54-evidence/`.

- `before/`, `after/`: 960×624, seed7819301, exposure0.85, focal24, identical actor and waves. Walk at0.8m/s from z4 to z−3.25 looking up, then look nearly vertically at the inner central arch. 22s/660frames each. Videos are deterministic30Hz replays, NOT realtime FPS.
- `walk-up-before-after.mp4`: before left/after right.
- `floor-comparison.png`, `wall-comparison.png`, `ceiling-comparison.png`, `second-015-comparison.png`: same-time/same-camera images; no auto exposure or contrast normalization.
- `comparison.json`: fixed screen-region brightness (display units, NOT radiometric flux).
- `benchmark/`: existing76s route, current/repeat/no-glaze/rotated controls. Removed-light/transfer controls have no channel to ablate and are omitted. Static-light reference is absent in this branch run; analyzer strength fallback is not a water-path isolation. Cross-version metrics instead use a fixed original static reference in `benchmark-comparison.json`.

Observed losses: sunlit floor ROI mean0.87282→0.41331 (−52.65%); wall ROI0.45585→0.40335 (−11.52%). The floor's strong transmitted solar illumination disappears, while water reflection/refraction still moves. Dark ceiling ROI0.16076→0.15725 (−2.18%): broad static pattern remains. Inner arch hold100ms difference p99 drops4/255→1/255; its dark-side region drops3/255→1/255 while mean changes only0.28927→0.28838. Residual includes camera reflection of moving water and retained film grain, so do not call all wall motion zero. Dynamic water-to-receiver illumination is absent by construction.

`npm test`:24/24. `npm run build`:passed. No bitmap source assets, replacement caustics, blur, darkness mask or gain compensation.

Preview the candidate at http://127.0.0.1:4175/ (Tab pauses). Original main remains http://127.0.0.1:4173/. Do not merge until the user selects keep/revert.

## Performance and final checks

Fresh sequential comparison on the same machine, **fixed internal1280×832**, GPU-completed frames,76s route, no video encoding during timing:

| Metric | bfb1dbc | Candidate |
|---|---:|---:|
| Entire route completed-frame average |31.81fps|48.13fps|
| Segment-average range |19.29–39.04|28.30–59.56|
| Door turn |19.29|28.30|
| Door hold |24.03|36.02|
| Upward ceiling hold |31.65|53.48|
| Maximum segment p95 frame time |56.60ms|43.70ms|
| Initial first frame |806.1ms|825.0ms|

Fixed-resolution candidate door turn is still below30; do NOT claim every fixed-resolution segment passes. Initial cache construction is retained, so startup is not meaningfully improved.

Separate candidate run with **normal production adaptive resolution**: segment averages36.81–58.88fps; minimum complete one-second window32.75fps; door turn36.81fps. This passes the Benchmark's performance rule for the sampled route, not a native-resolution or arbitrary-machine guarantee. Candidate per-segment endpoints range1016×664–1280×832; exact samples and full environment records are retained. Own duplicate project page paused; serial test browsers; other user apps not forcibly closed.

Final Benchmark four cases completed: exact repeat error0. Opaque doorway/ceiling holds no longer trigger the temporal triage alert; water-body motion still does, so run remains REVIEW, not an unconditional visual pass. Same original fixed dark mask: ceiling p99.30980→.29412; contrast1.83721→1.74419. Static patches are reduced, not erased.

Final `npm test`24/24 and build pass. Runtime smoke checks zero live packets, zero diffuse iterations, no GPU errors, and readable remaining static-cache receiver data. A COPY_SRC diagnostic flag correction was followed by identical660-frame recapture and a fresh final-source Benchmark; intermediate evidence retained.

The candidate is deliberately not merged. Keep/revert decision belongs to the user after viewing the paired evidence. No push.
