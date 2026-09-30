# Wading wake: restore the continuous forward bow wake (cone / V)

Base: main `40c7c18`. The user preferred the earlier cone/V-shaped wading ripples over the v1.36–v1.37 fragmented footstep splashes. `.flops/` user data and BRIEF.md are preserved; no push.

## Change: restored previous values, no new amplitude

This restores the v1.36 state exactly (`1738234`, see [ACCEPTANCE-forward.md](ACCEPTANCE-forward.md)). No new gains or radii are introduced:

- `body-waves.wgsl`: restores the broad zero-integral fore/aft body pressure deleted in v1.36. Radius is `R=.23m+depth`, which is .65m here; the head is 3×U²/2g, faded between .8 and 1.2m/s. Every constant is the `1738234` value verbatim.
- `wake-trail.js`: foot contact amplitude .006→.012. This is the pre-v1.36 value; v1.36 had halved it.
- `body-waves.js`: ballistic kick impulses (`kick-impacts.js`) are off by default. Setting `kickImpacts: true` in the config re-enables them. The module and its unit test remain.

The pressure still forces only the shared stateful finite-depth wave ODE. Surface intersection, reflection, refraction and photons all read the same height. There is no prescribed V, ring, normal layer, texture or separate caustic. The V opening is the dispersive response, not a hardcoded Kelvin angle. The v1.37 background/footprint frequency changes and the rest of the renderer are unchanged.

## Raw wave field (reset replay, ambient forcing off, depth .42m, 30Hz)

The actor stands 2s, walks 6s along +x at .8m/s, then stops. Metrics come from the GPU height field, not from images. Script: `node scripts/cone-simulation.mjs`, `python scripts/analyze-cone.py`.

| t=6s / t=8s | HEAD (fragmented kicks) | restored bow (shipped) |
|---|---:|---:|
| front normal RMS (1.2–3m ahead, ±1.5m) | 6.35° / 10.50° | 4.65° / 3.43° |
| front height RMS | 9.1 / 15.6mm | 24.7 / 18.1mm |
| wake energy inside ±30° behind body* | **0.34 / 0.33** | **0.60 / 0.51** |
| apparent arm half-angle (steepest-crest fit) | ~30° / ~29° (diffuse) | ~23° / ~22° |

*Fraction of squared-slope energy within 3.4m behind the body that lies inside a ±30° wedge.

The front metrics match the recorded `1738234` numbers exactly (4.650° / 24.674mm at t=6s), which confirms the restoration. `fields-0.8.png` shows the fields side by side. HEAD has isotropic ring-shaped splash patches. The restored version has a crescent bow ridge ahead and nested arcs opening backward in a cone. The apparent half-angle is an estimate for this depth and speed only; it is not a claim about Kelvin 19.47°.

Stress test sampled every 0.1s: .4–1.6m/s, Shift switching and reversal. The peak is 302mm on reversal, below the 340mm surface bracket. This is the same value recorded for `1738234`. There were no NaN or GPU errors.

Integration refinement uses identical deterministic footsteps at 30Hz and 60Hz. The relative height L2 difference is 0.045% 1s after stopping (0.0033mm RMS). A keyboard-sampled trigger test differs by 10% because step trigger times differ. That is event sampling, not integration error, and is reported as such.

## Rendered evidence

Evidence lives in `../workroom-cone-evidence/`:

- `observer-{head,after,bowR.30}/high-angle-{slow,fast}.webm` and per-second PNGs. A fixed high-angle observer keeps the player in frame; input is real W key and Shift. `observer-slow-compare.jpg` is a crop comparison.
- `keyboard-{head,after}/first-person-keyboard.webm`: default first-person view at fixed 100% internal resolution. `contact-sheet.jpg` shows key frames.

In the rendered high-angle view, HEAD shows bright scattered splash cells. The restored bow shows a smooth disturbance around the body with backward-opening arcs in the sunlit patch. **The cone is much subtler in the render than in the height field.** The bow waves are long, several metres, so their slopes are small. In the default first-person camera the cone arms are mostly beside or behind the player; walking shows broad smooth tile-line bending rather than a visible V.

At 1.6m/s the bow is faded by design in both versions. The restored fast walk is therefore quieter than HEAD's splashes.

## Rejected candidate: narrower bow radius (bowR.30)

`VARIANTS=bowR.30` narrows the bow radius to .30m. The side arms become somewhat more visible in the raw field and the render. However, front slopes drop (1.10° vs 4.65°), and stress peaks rise to 317mm at 1.0m/s and 315mm on Shift, leaving about 23mm to the 340mm bracket. It is also a new calibration, not the earlier look the user asked for. It was **not adopted**; the evidence is kept.

## Performance (this machine, baseline only, not a target)

RTX 4090, Chrome/WebGPU, fixed internal 1280×832, GPU-completed frames, no recording (`node scripts/cone-performance.mjs`):

| mode | HEAD fps / p95 ms / min 1s | restored fps / p95 ms / min 1s |
|---|---|---|
| static | 19.80 / 53.6 / 19.56 | 19.86 / 53.8 / 19.52 |
| slow | 20.36 / 52.7 / 19.94 | 20.25 / 53.2 / 19.79 |
| fast | 20.25 / 54.1 / 19.85 | 20.40 / 52.9 / 20.22 |

First frame: 4528ms (HEAD) and 4050ms (restored), which is over the 3s gate. **These numbers are contaminated.** The GPU was already at a steady 33–34% utilization from other processes (FlopsResourceNode and others) before the test, which the performance rules forbid. The processes belong to the user and were not stopped. The measurement shows no relative regression; it is not a valid absolute benchmark.

## Visual benchmark (`npm run benchmark`, 30Hz replay, not an fps measurement)

Restored run: `../workroom-v1.49-evidence/benchmark/runs/7286cced7e56-b6dc28c7-948ca6a0-ca630f13/` has all 9 cases, masks, analysis and attribution. **Result: REVIEW, not a visual pass.** The matched HEAD control ran the same pipeline with only the three wake source files at HEAD (`CASES=current`): `runs/1b146652de5c-.../`.

| hold (current case) | HEAD p99 / cluster / flagged | restored p99 / cluster / flagged |
|---|---|---|
| water-body | 0.01973 / 97 / 87 REVIEW | 0.01973 / 97 / 87 REVIEW |
| door-interior | 0.01023 / 284 / 22 REVIEW | 0.00263 / 15 / 1 no alert |
| dark-wall-ceiling | 0.00760 / 6 / 0 | 0.00833 / 8 / 0 |
| others | no alert | no alert |

- `water-body` is identical at HEAD and in every restored control case (no-glaze, no-diffuse, static-light, transfer variants). The actor is stationary in that hold, so no bow or footstep source acts. The flagged clip is a rectangular patch of fast glints on dark water beside the body; the same patch appears in both variants' observer frames. It was not caused by this change, was not diagnosed here, and is not clamped or blurred away.
- The HEAD `door-interior` alert does not occur with the restored bow. Plausibly this is the kick splashes, but only this one control supports that.
- `static-light` clears the door and dark-wall residuals, so those follow light dynamics.
- The pipeline's final performance stage calls macOS `ioreg` and fails on Windows (exit 1 after the visual stages completed). The first attempt also died at the end of the `current` capture with a transient `rg` 0xC0000142 process-launch failure. Its partial capture and log are preserved in `../workroom-cone-evidence/benchmark-interrupted-*`. The benchmark needs `rg` on PATH.

## Other checks

- `npm test`: 28/28 pass. `vite build`: pass.
- `npm run build` fails on Windows before and after this change. `validate-content.mjs` builds the path from `URL.pathname`, producing `D:\D:\...`. This is pre-existing and not fixed here.
- Tab pause while walking (`node scripts/cone-pause.mjs`): 0 GPU submissions during pause, and the first frame after resume is pixel-identical. The `verify-v135.mjs` Tab check is macOS-only (`ioreg`).
