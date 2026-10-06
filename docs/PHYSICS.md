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
- The pressure field receives eight spatial diffusion passes before forcing
  and initialization. Together with short-wave dissipation and the grid,
  this limits the resolved slope spectrum. Bicubic reconstruction derives
  height and both slopes from the same evolved field; there is no independent
  ripple normal layer. Changing the forcing bandwidth changes water dynamics,
  not just its specular appearance.

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

Optional shared water previews are selected with `?waterPreview=fine`,
`dense`, or `detail`. The default and unknown values keep production behaviour.
The selection survives location changes and applies equally to all windows.

- `fine` reduces pressure diffusion from eight passes to four; `dense` uses
  two. These are intentional visual choices of excitation bandwidth, not
  measured environmental forcing. They add resolved short-wave energy to the
  actual evolved height field, affecting refraction, reflection and photons
  together. There is no cosmetic normal layer. Gravity, surface tension,
  dissipation, absorption and refractive index are unchanged.
- `detail` keeps production waves, refines submerged solid hits with the
  existing tile-relief intersection and near material, and bypasses reflected
  radiance reconstruction. It does not change absorption, tile dimensions or
  illumination. Near material filtering still uses the camera-to-hit footprint
  approximation rather than refracted ray differentials; finite camera samples
  can expose aliasing when reflection filtering is bypassed.

These previews are alternatives, not an automatically selected new default.

1. The body is a linear equivalent-pressure source, not fluid-structure interaction with an impermeable moving boundary. No horizontal velocity field, vorticity, turbulent wake, spray or breaking.
2. The body component is added linearly to the background field; it does not change the background's propagation.
3. The spectral body solver does not see interior walls or columns. Dry cells hide the water, but the response can pass through interior walls non-locally. Only the background field has true no-flux boundaries.
4. The body grid resolves roughly 0.5 m detail; capillary waves are unresolved. Wake angles depend on speed and depth; there is no hard-coded Kelvin angle.

## Light transport

### Sources

- Sun: a finite disc (angular radius 0.00465 rad), sampled symmetrically.
- Sky: an area light through the ceiling aperture, integrated with 32 x 32 fixed samples and binary visibility per sample (lab-configurable). This uses four times the sample evaluations of 16 x 16 during cache construction; receiver cache allocation and the four-cell bilinear lookup during rendering are unchanged. Finer sampling reduces broad visibility steps but does not guarantee convergence at every opening.

### Air (`atmosphere.js`)

Air paths use 0.004/m extinction. Windows without `scene.air` retain the
legacy light-independent haze colour in surface shading. A window declaring
air replaces that colour with single scattering from the actual sun and sky.
Still Rotunda uses 0.004/m scattering and Henyey-Greenstein anisotropy 0.6.
Scattering may not exceed extinction; these are model coefficients, not a
measurement of the atmosphere in a reference image.

- A fixed world grid (1/3 m cells by default) is baked with the light caches.
  Four sub-voxel visibility rays estimate solar transmittance, and a 4 x 4
  aperture quadrature estimates incoming sky radiance. Both incoming paths
  include extinction and solid occlusion through the actual roof geometry.
- Primary camera rays integrate 24 deterministic midpoint steps to the first
  solid or mean water plane. The sun uses the anisotropic phase function;
  the sky uses an isotropic approximation. The viewer path includes extinction.
- No screen-space shaft, surface brightening or temporal image history is
  used. Unlit air adds no source-independent glow in this path. Secondary
  reflection rays retain extinction but do not integrate in-scattering.
- The grid requires a ninth camera storage buffer. Devices without that
  binding capacity retain the legacy haze path; `audit().air` reports it.

Limitations: finite grid and ray quadrature, no multiple scattering, no
scattering of bounced light, a mean-plane water cutoff, and no underwater
volume scattering. Water absorption and refraction remain separate. This
approximation does not establish exact conservation for the full renderer.

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
- Primary water rays split into traced reflection and transmission using exact
  dielectric Fresnel and Snell refraction (index 1.333). Transmission includes
  RGB Beer absorption with coefficients `(0.34, 0.075, 0.037)` per metre and
  the radiance index factor. Water colour therefore also depends on submerged
  material, lighting and path length; it is not a surface tint.
- Solids seen through water use `filteredMaterial` and geometric intersections,
  without the opaque primary ray's tile-relief intersection. Fine submerged
  grout relief is consequently approximate even when the water is resolved.
- A separable, surface/depth-guided spatial filter reconstructs only reflected
  radiance, with a water footprint capped at 0.8 internal pixels. It leaves
  transmitted floor detail and the simulation untouched. `reflectionFilter: 0`
  bypasses it for diagnostics. This is a bounded image-space approximation,
  not additional physical water roughness or a wave-spectrum model.
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
