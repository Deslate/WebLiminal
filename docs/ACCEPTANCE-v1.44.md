# v1.44 — finite-depth background propagation and sustained short-wave forcing

This follows the user's post-v1.43 instruction. BRIEF.md and `.flops/` already had user changes; they are excluded from this implementation. Baseline is commit `2709918`, including the finite solar disk fix. No light-transport shader, material, exposure, receiver filter or body/footstep dynamics was changed.

## Mechanism and implementation

The old background restored height with a shallow-water operator, approximately `H(gL + (sigma/rho)L²)`. This approaches the correct relation only at `kH << 1`. Keeping the scene clock at 0.21 does not repair its wavelength-dependent error.

The replacement is a stateful, linear finite-depth gravity-capillary equation:

```
L = positive symmetric nine-point Laplacian on wet cells
G(L) = sqrt(L) tanh(H sqrt(L))
h_tt = -G(L)[g h + (sigma/rho)L h + p/rho]
       - 0.055 h_t - 0.00008 L h_t
```

The scalar relation is `omega²=(gk+(sigma/rho)k³)tanh(kH)`, consistent with [MIT's water-wave derivation](https://ocw.mit.edu/courses/8-03sc-physics-iii-vibrations-and-waves-fall-2016/ef731c1b91d77a6db003f6c27e300d25_MIT8_03SCF16_Textbook.pdf). This reference supports the physical relation, not our numerical implementation or its measured performance.

`finite-depth.js/.wgsl` applies this matrix function on the existing 448×864 wet-domain graph. Solid boundaries have no links; diagonal edges cannot cross dry corners. This avoids periodic wraparound and waves passing through the pillars. We fit `G(s)/s` with Chebyshev polynomials and apply it to `L potential`, making the constant-height restoring force exactly zero. Degree is 32 at H=0.42m and adapts from 12 to 80 across the supported depths. Fixed physical step is 1/120s instead of 1/360s; background clock multiplier remains 0.21. The camera, water photons and reflections use the same reconstructed height field.

Dissipation was retained. The former long pressure pulses barely excited short oscillators; continuing to remove their energy without supplying it could not produce a stationary short-wave spectrum. External pressure now has:

- Random centers, orientation, aspect, signs and the existing multiscale radius distribution.
- A localized balanced profile `(1-r²)exp(-r²)` and a signed, zero-time-integral pulse. There is no prescribed animated surface or caustic pattern.
- Duration `pi/omega(2/radius)`, using the finite-depth response.
- A pressure-strength envelope proportional to `1/radius`, plus more frequent independent events, calibrated against the measured dissipative short-wave budget.

The pressure is an **assumed stochastic environmental input**, not a solved ventilation/circulation system or a measurement of a particular pool. A truly unforced pool should lose its fine waves; the unforced control still does. Long-wave drift is controlled by zero-DC forcing and retained damping, not by deleting long wavelengths from the rendered surface.

Also removed the unused shallow-water GPU pipelines/buffer and stopped needlessly rebuilding all pressure footprints on display frames with no physical substep.

## 120-second persistence

`mechanism-v144.mjs` replays identical initial conditions and seed at 60Hz, with body disabled. For continuity with the prior 18.65% finding, the primary calibration uses the same rectangular wet domain and the same x=[-5,5], z=[-12,5] spectral window. Short power means Hann-windowed height power at 2–6 cycles/m (wavelengths 17–50cm); it is **not** a rendered-image metric or proof of centimeter-scale splashes. Time is scene time: 120 seconds advances the retained 0.21 background clock by 25.2 physical-model seconds.

| Measurement | v1.43 baseline | Finite depth + sustained pressure |
|---|---:|---:|
| Short power at 6s | 1529.50 | 1877.59 |
| Short power at 30s | 1202.92 | 2596.75 |
| Short power at 60s | 696.07 | 2417.67 |
| Short power at 90s | 465.78 | 2330.79 |
| Short power at 120s | 285.26 | 2059.26 |
| 120s / 6s | 18.65% | 109.68% |
| Normal RMS, 6s → 120s | 1.147° → 0.588° | 1.219° → 1.393° |
| Height RMS, 6s → 120s | 2.437 → 2.325mm | 2.564 → 2.302mm |
| Long power <1 cycle/m, 6s → 120s | 7662 → 11006 | 8693 → 5846 |

With the new operator but forcing disabled, short power at 120s is 286.90: switching dispersion alone does not sustain it. The first weak-pressure trial also failed (333.60 at 120s); that rejected trial remains in `weak-pressure/`. New sustained pressure keeps fine structure without increasing total height or accumulating long-wave power in this interval. Local random forcing produces fluctuations; “sustained” does not mean constant power at every instant.

## Numerical limits

`dispersion.json` separately reports continuum, grid, polynomial and time-integration frequencies. At default depth, the polynomial approximation alone has maximum frequency error 2.97% across the discrete spectrum. Across the supported depths, adaptive order keeps this below 3.1% in the automated test.

| Wavelength | Old discrete omega | New stepped omega | Correct continuum omega | New total error |
|---|---:|---:|---:|---:|
| 8cm | 123.96 | 24.55 | 28.39 | −13.51% |
| 13cm | 89.68 | 20.96 | 21.96 | −4.56% |
| 20cm | 61.45 | 17.43 | 17.62 | −1.06% |
| 30cm | 41.82 | 14.05 | 14.36 | −2.11% |
| 50cm | 25.36 | 10.98 | 11.11 | −1.16% |

Omega is radians per physical-model second; actual animation retains the 0.21 clock multiplier. The 3.125cm spatial grid remains the main accuracy limit at 8cm. This is a uniform-depth, small-amplitude potential-wave model on the wet domain; it does not solve variable-depth flow over submerged steps, vorticity, breaking, air entrainment or individual droplets. The wet mask respects obstacles, but the submerged side step still uses the common H in dispersion.

## Evidence and checks

Evidence root: `/Users/steven/Projects/workroom-v1.44-evidence/`.

- `mechanism/`: 0/6/30/60/90/120s raw height fields, metadata, measurements; `water-persistence.png` plots band power and slope persistence.
- `dispersion.json`: numerical frequency error breakdown.
- `performance/`: same-machine baseline → new → baseline tests, GPU-completed frames, 1280×832 internal resolution, one browser instance at a time, other project pages paused. Baseline 38.60 / 39.02fps; new 38.12fps, p95 27.80ms, minimum complete one-second window 37.46fps. Recording is measured separately and is not used as a performance benchmark.
- `wall-before/`, `wall-after/`: same receiving-plane ROI at scene time 6–14s, 30Hz; no material or surface-reflection contamination.
- `stationary-before/`, `stationary-after/`: real-time stationary recordings and 6/30/60/70s screenshots. The unrelated pre-existing 34.6–43s scripted light fade is disabled only by the evidence route in both versions; production code is unchanged.

`npm test`: 23 passed. `npm run build`: passed, zero bitmap resources. Legacy acceptance commands tied to unrelated historical visual versions were not treated as current numerical invariants.

The final same-condition rerun and recording provenance below supersede the early benchmark as the primary performance result.

## Actual pool and wall results

The second 120s run uses `makeGeometry()` with the real pillars, walls and submerged step. To avoid dry-cell edges contaminating the spectrum, its fixed window is x=[-5,5], z=[-2,8], wholly in the front pool; this is a different window from the historical rectangular calibration above.

| Actual-pool metric | Baseline 6s → 120s | New 6s → 120s |
|---|---:|---:|
| Short-band power | 627.73 → 88.86 (14.16%) | 480.75 → 992.49 (206.45%) |
| Normal RMS | 1.177° → 0.593° | 1.243° → 1.424° |
| Height RMS | 2.490 → 2.211mm | 2.618 → 2.297mm |
| Long-band power | 4086 → 4168 | 4695 → 2320 |

At 60/90/120s the new short-band powers are 899/1075/992. This is sustained, fluctuating fine structure, not a wave field whose height simply grows. Files: `real-domain/metrics.json`, `water-height-6-120.png` (same physical 4×4m patch and ±6mm display scale).

Wall metrics use 241 exact-time samples at 30Hz over 6–14s, sid18, x=7m, z=[−3.0417,0.5], y=[0.9959,5.8095]. They read the transported irradiance, not screenshot brightness.

| Wall metric | Baseline | New |
|---|---:|---:|
| RMS frame difference / mean | 17.5035% | 6.5975% (−62.31%) |
| Temporal power centroid | 0.97735Hz | 0.41435Hz |
| Temporal power above 4Hz | 2.2513% | 0.07639% |
| Temporal power above 8Hz | 0.20191% | 0.01077% |
| Mean irradiance | 0.21362 | 0.21110 (−1.18%) |
| Mean spatial CV | 0.89407 | 0.87810 (−1.79%) |
| Peak irradiance in interval | 1.45666 | 1.54359 |

The time series changes from narrow, rapidly varying excursions to wider moving peaks. Focusing remains strong: its mean/contrast scarcely changes and the peak is not clamped. These measurements do not promise that every receiver is constant or that real focusing can never produce a rapid local change.

Files: `wall-view-000.png` (same scene time and camera), `wall-linear-log.png` (fixed display range), `wall-temporal.png`, `wall-metrics.json`, `wall-irradiance-replay.mp4`. The last is an exact 30Hz **buffer replay**, clearly labeled; it is not a real-time FPS measurement.

## Recording provenance

The first Playwright page-video pair (`stationary-*`) is not the primary acceptance video. It had costly capture and a severe dynamic-resolution drop; the baseline's 81.6s file only advanced 57.82s of scene time. The first native-canvas new-version attempt (`canvas-after-contaminated`) also suffered GPU contention: a source hot update had resumed the separate Flops project page after it had been paused. These failed recordings were retained rather than silently overwritten.

Final recording uses the normal default 24mm / −0.32rad view, a 960×600 viewport and `canvas.captureStream(30)` / MediaRecorder. The other project page was re-paused and checked to stay paused; no source edits were made while recording or final performance testing. The original script disables the unrelated narrative light fade equally in both versions, solely in the evidence route. No simulation time scaling or lighting smoothing is introduced for capture.

Primary files: `canvas-before/stationary.webm`, `canvas-after/stationary.webm`, corresponding `states.json`, screenshots at 6/30/60/70 scene seconds, and `snapshot.json`. Both versions retain 960×600 internal resolution. The separate default-camera benchmark, not the recording, is used to substantiate ≥30fps.


The final files decode to 70.982s / 70.968s, containing 2114 / 2122 frames. Scene clocks reach 70.345s / 70.630s, with no WebGPU errors and no resolution changes. Decoded 60–61.8s frame strips show the wall's bright areas drifting and changing shape over successive frames; the late water reflection keeps small irregular breaks. They support a substantial improvement, not a claim of zero local light variation. See `canvas-video-inspection.json`, each video's `decoded-contact.png` / `wall-continuous-frames.png`, and `normal-view-60s.png`.

## Final performance and GPU numerical regression

After all source edits and recordings, baseline → new → baseline was rerun serially, with the other project page verified paused. Existing adaptive resolution selected **1192×776 in all three runs**:

| Version | Completed-frame fps | p95 frame time | Minimum complete 1s fps |
|---|---:|---:|---:|
| Baseline | 37.532 | 28.70ms | 35.139 |
| New | 37.125 | 28.50ms | 36.246 |
| Baseline repeated | 37.518 | 28.40ms | 36.419 |

New versus the surrounding baseline average costs approximately 1.06%. Files: `performance-final/*.json`. This does not claim exclusive control over other applications' GPU use; the paired baseline controls for the conditions during the test. The early 1280×832 test is retained separately. Near-wall inspection also passed at **39.804fps**, minimum 39.418fps, using the existing adaptive **744×480** internal resolution (`performance-wall/after.json`). It is not a full-resolution near-wall guarantee.

`modal-v144.mjs` replaces only the diagnostic initial condition with three small Neumann modes plus constant height, then runs the real GPU operator for 10 physical seconds. Measured frequencies at 2m / 0.5m / 0.125m are **5.318947 / 10.979063 / 21.123959 rad/s**, within **+2.943% / −0.852% / −0.500%** of the exact discrete finite-depth frequencies. Constant-height drift is at most **0.0000101mm**. Replaying at 30Hz versus 60Hz produces **identical sampled heights** at common times. No GPU validation errors. Files: `modal.json`, `modal-metrics.json`.

Remaining limitations: the documented uniform-depth linear model, effective rather than molecular damping, assumed environmental pressure budget, and limited accuracy near the grid's shortest wavelengths. No zero-flash guarantee at every wall point or arbitrary-device performance claim is made. The measured scene retains physical focusing, sustained fine structure and >=30fps without a fabricated caustic layer.
