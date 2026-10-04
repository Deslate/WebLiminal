# Physical model and approximations

This document describes what the current renderer and water simulation compute, and where they approximate. It is a description of the present code, not a changelog. Constants live in the source; when this file and the code disagree, the code wins and this file should be corrected.

All units are metres, seconds and radians.

## Local geometry and receiver charts

World locations are rendered in a resident local window (see `LEVELS.md`).
Besides boxes and arch cutouts, new windows can use capped cylinders and an
upper hemispherical cavity. Their intersections are analytic for camera,
photon and visibility rays. `curved-shapes.js` specializes these paths only
when required; the original window keeps its original shader source.
Curved receiver charts use azimuth times radius and world height: both cylinder
and sphere have area element `R d(phi) dy`, so each chart cell has equal physical
area. Cylinder cap coverage excludes the surrounding square; dome planar
coverage excludes the spherical void. Water depth uses circular column
footprints. Circular deck edges use a cylindrical cutout in one slab. Arcade
opening reveals share one chart, unfolded across each opening and stacked by
depth so no two openings share a cell; ring charts run around the ring's
horizontal axis. Chart cells outside the clipping box are not receivers. The hemisphere's
longitude tile chart compresses courses toward the pole; it is an approximate
tile layout rather than a construction-grade spherical tiling.

## Water

The visible water surface is the linear sum of two independent solvers. Both are stateful: they integrate real elapsed time from a reset and are never seeked analytically to an arbitrary time.

### Background field (`src/render/wave-simulation.*`, `src/render/finite-depth.*`)

- A grid over the level's water rectangle at the level's cell size, integrated at 60 Hz (Poolrooms: 448 x 864 at 1/32 m).
- Propagation uses the finite-depth operator `sqrt(L) tanh(H sqrt(L))` on the wet-domain graph Laplacian `L` with no-flux (Neumann) boundaries at the real pool geometry. `G(s)/s` is fitted by a Chebyshev polynomial so that the constant mode is exactly null.
- Explicit dissipation removes short waves; a band-limited random pressure over the whole wet domain replenishes them. The forcing is not a looping animation and has no fixed phase.
- Approximation: uniform depth in the operator, grid resolution limits, and a polynomial fit of the dispersion relation.

### Body wake and footsteps (`src/render/body-waves.*`, `src/kick-impacts.js`)

Each wavenumber carries complex height and vertical velocity:

```
omega^2(k) = (9.81 k + 0.000073 k^3) tanh(k D)
eta_tt + omega^2 eta = omega^2 b
```

- 256 x 512 FFT grid at 12.5 cm over a 32 x 64 m domain; a 5 m absorbing band outside the pool keeps periodic wrap-around away from visible water.
- `b` is a soft pressure potential: a local occupancy term plus fore/aft pressure that grows with walking speed. It is a calibrated leading footprint, not a prescribed V shape. Bow ridge, diverging arms and the trough behind the body emerge from forced dispersive evolution.
- Footstep pressure packets are triggered by real step contacts. Ballistic splash impulses (`kickImpacts`) exist but are off unless `config.kickImpacts` is set.
- Sources are sampled at sub-step midpoints (internal step <= 1/240 s); oscillators use an exact constant-force update. Re-rendering the same physical time does not mutate state.
- Walking speed in water: 0.8 m/s, Shift 1.6 m/s. Do not raise the in-water cap without re-testing near-critical waves.

### Known limitations

1. The body is a linear equivalent-pressure source, not fluid-structure interaction with an impermeable moving boundary. No horizontal velocity field, vorticity, turbulent wake, spray or breaking.
2. The body component is added linearly to the background field; it does not change the background's propagation.
3. The spectral body solver does not see interior walls or columns. Dry cells hide the water, but the response can pass through interior walls non-locally. Only the background field has true no-flux boundaries.
4. The body grid resolves roughly 0.5 m detail; capillary waves are unresolved. Wake angles depend on speed and depth; there is no hard-coded Kelvin angle.

## Light transport

### Sources

- Sun: a finite disc (angular radius 0.00465 rad), sampled symmetrically. There is one
  world sun, 14 degrees above the horizon, toward (-0.886, 0.242, 0.396). A location
  rotated in the world sees it in its own frame; its strength is set per location.
- Sky: an area light through the ceiling aperture, integrated with 16 x 16 samples (lab-configurable).

### Photons and caustics (`photons.wgsl`, `water-caustics.wgsl`, `resolve.wgsl`)

- Caustics come only from photon transport through the live water surface: Fresnel split, Snell refraction, absorption, and receiver-area normalisation. No painted or animated caustic textures exist.
- A static cache stores mean-water transport (196608 photons per batch, 128 batches by default). Live sun and sky packets through the current wave surface are added each frame.
- The cache excludes the first solid deposition after water; the live term `W` supplies it, and the diffuse solver propagates only the difference `W - W_flat`. The composition is `C + W + delta`, so no path class is counted twice.
- Photon flux is recorded into shared world-space receiver grids (`light-atlas.js`). Coplanar touching surfaces share one grid; CSG holes are masked out of receiving-area denominators.

### Diffuse transfer (`diffuse-transfer.wgsl`, `compose-light.wgsl`, `sky.wgsl`)

- Finite-volume diffuse transfer with 128 integration directions by default and 4 propagation rounds. Receiver cells are integrated with their physical covered area.
- Ceiling sky reflection integrates 64 directions per water point; transmission uses 4.

### Camera (`camera.wgsl`, `reflection-filter.wgsl`, `present.wgsl`)

- Deterministic camera branches: no random per-frame sampling and no temporal image blending. Each frame is independent; only the simulation has memory.
- Grout and tile relief use real primary-ray height-field intersections with local visibility. Near material is `surfaceMaterial(Hit) -> Material` in `materials/porcelain.wgsl`; secondary footprints use `filteredMaterial`; `materials/photon-porcelain.wgsl` is the area-average BRDF for photon transport.
- Opaque primary reflections trace deterministic GGX directions weighted by Fresnel, Smith and the NDF. Pixel-footprint normal moments widen roughness instead of a distance cut-off.
- Secondary rough reflection and the terminal `photons * coat * .08` term are approximations used only where no traced continuation exists.
- Output includes subtle, deterministic film grain.

### Stainless steel and curved handrails

`materials/stainless-steel.wgsl` is an achromatic conductor approximation:
diffuse albedo is zero, normal-incidence reflectance is 0.568, and perceptual
GGX roughness is 0.16 (alpha = roughness squared). The reflectance follows
the conductor formula with eta = 2.5 and k = 3.3; these are representative
parameters, not measured spectral data for a particular alloy. Reflection is
not a dielectric coat over colored diffuse porcelain. Normals come from the
round tube geometry, without tile/grout relief or glaze slope overlays.

Conductor photons sample only specular transport, absorb the remaining energy
and do not deposit a diffuse receiver flux on the rail. Primary camera rays use
the existing traced GGX integral. Secondary metal hits add four deterministic
GGX directions, including live-water Fresnel/refraction branches. A subsequent
metal hit is terminal; this is finite quadrature and bounce truncation, not
complete spectral transport. The old cached-irradiance reflection approximation
is disabled for metal. Water reflections trace the actual round rail; there is
no separate reflected object or painted highlight.

The circular deck's inner cylinder has the physical chart area
`2 * pi * radius * height`. Planar chart coverage excludes its disk; geometry,
water masks and photon denominators agree on the basin boundary. New curved
queries first reject rays outside the primitive bounding box. All extensions
are optional: the original Poolrooms shared and material shader text is retained.

### The body

The player body is visible to the camera, refraction and reflection, and blocks live water photons. It uses approximate shading and does not receive a full indirect-light solve.

## What is not claimed

- Not full photorealism, and no guarantee for arbitrary devices or GPUs.
- Finite sampling, bounce truncation and grid reconstruction mean energy agreement is a consistency check, not proof of exact conservation at every point.
- Bright sun caustics are real focusing from the wave surface; they are not softened by extra scattering.
