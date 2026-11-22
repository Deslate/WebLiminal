# WebLiminal v2 Engine Architecture

The v2 framework (`v2.html`, `src/engine/`) implements a **runtime-synthesis hybrid WebGPU architecture** alongside the untouched v1 physical Poolrooms renderer (`index.html`, `src/render/`): procedural material bases and multi-bounce indirect GI are baked once on the GPU when a level loads, while real-time frames combine hardware rasterization with analytic ceramic optics, per-pixel BVH shadows, full-scene BVH glossy reflections, and physical BVH water with live GPU photon caustics.

## 1. Map Compilation (`src/engine/map-builder.js`, `uv-atlas.js`, `bvh.js`)

When a v2 level loads, its `build(m)` function emits declarative architectural geometry into a `MapBuilder`. `compile()` outputs one universal scene package:

- **Indexed Triangle Mesh** (64 bytes/vertex): `position`, `materialId`, `normal`, `tangent` (with handedness), metric tiling `uv` with symmetric crown-aligned arch/ring setting-out and seamless integer-module cylinders, and non-overlapping packed `uv2`.
- **Automatic Lightmap UV2 Atlas (`uv-atlas.js`)**: Shelf-packs all surface charts into a single square atlas (`768²` on hardware GPUs, `384²` on software fallback) with a 2-texel gutter and texel-center alignment.
- **Flat Binned-SAH BVH (`bvh.js`)**: Compiles all scene triangles into 32-byte nodes and 112-byte Möller-Trumbore records carrying interpolated surface `uv` and lightmap `uv2`, allowing any runtime reflection or refraction ray to evaluate analytic materials and baked multi-bounce GI in O(1).
- **Analytical Light & Skylight List**: Arbitrary area light quads (fluorescent panels, tubes, frosted backlit windows, glowing signs, skylight portals) with precomputed power CDFs.
- **Collision Structure (`collision.js`)**: Walkable room bounds, 2D solid boxes/circles (including lower spiral stair steps and curved tubes), and elevation zones (ramps, stairs, raised decks).

## 2. Startup GPU Synthesis (`bake-textures.wgsl`, `mipmap.wgsl`)

Only materials referenced by the active level are baked:

1. `bake-textures.wgsl` synthesizes `512×512` (or `256×256` on software fallback) seamless periodic textures into three `rgba8unorm` `texture_2d_array` resources (`albedoRoughTex`, `normalHeightTex`, `metaTex`). For ceramic porcelain presets, organic glaze base tone is baked here while flat architectural tile faces, millimeter grout joints, narrow ~1.8 mm edge shoulders, subtle kiln-fired glaze waviness, and weathering are evaluated analytically at infinite resolution in the shading passes.
2. `mipmap.wgsl` builds the complete mipmap chain using **Toksvig normal-variance folding** to suppress distant specular aliasing.

## 3. Startup & Progressive Indirect GI Baker (`bake-gbuffer.wgsl`, `bake-lightmap.wgsl`, `denoise-lightmap.wgsl`)

1. **UV2 G-Buffer Rasterization**: Renders the mesh in UV2 space for exact world positions and geometric normals (`rgba32float` / `rgba16float`) with 2-texel gutter dilation.
2. **Split Direct/Indirect Lightmap**:
   - Direct sunlight is **excluded** from primary lightmap texels and evaluated per-pixel via world-locked BVH soft shadows at runtime, eliminating lightmap-texel shadow blur.
   - Primary texels use low-discrepancy R2 quasi-random hemisphere sampling with Cranley-Patterson per-texel shifts to accumulate smooth area lights, backlit frosted windows, skylight portals, dominant incoming light direction, and short-range baked AO.
   - **3-Bounce Indirect GI with Physical Water Filtering**: Indirect bounces include direct sun and attenuate underwater paths by exact Beer-Lambert water absorption, naturally bouncing turquoise-emerald GI from sunlit pools onto overhead ceilings.
3. **Plane-Aware Bilateral Denoise & Gutter Dilation**: A 4-pass plane-coplanar geometry-aware À-trous filter (`step = 1, 2, 4, 8`) eliminates low-frequency shadow mottling without bleeding across stairs or corners, followed by gutter dilation into `rgba16float` textures.

## 4. Real-Time Frame Graph (`renderer.js`)

Per frame, the renderer executes six passes (internal resolution capped at `<= 1920×1080` on high-DPI displays):

1. **Sky Backdrop + Opaque PBR + Analytic Architectural Materials + Deterministic Sun Ray (`gbuffer-pbr.wgsl`)**: Hardware-rasterized PBR with genuinely flat fired porcelain faces (ported from v1 `porcelain.wgsl` optics), mathematically exact box-filtered grout and commercial architectural grids (`1.20×0.60 m` drop-ceiling T-bars, `0.60 m` wallpaper roll seams, `1.20 m` concrete formwork, `2.40 m` floor saw-cut joints), Nyquist-attenuated micro-glaze slopes with 4-tap footprint slope-moment GGX roughness broadening (`pow(r^4 + varX + varY, 0.25)`), non-repeating world-space weathering and mirror-smooth wet concrete puddles, a 1-ray world-locked sun-center visibility ray written to `sunDirect` (zero screen-space Bayer/IGN dithering), early-culled BVH-shadowed area-light GGX specular, and directional indirect GI.
2. **Half-Res Deterministic BVH Reflections + Separable Roughness Cone Filter + Edge-Only Soft Sun Penumbra (`ssr.wgsl`)**: `traceSSR` selects the glossiest non-grout pixel per 2×2 quad and traces 1 deterministic specular BVH ray (zero screen-space IGN boiling), recording physical hit distance. Separable horizontal/vertical bilateral passes (`filterSSRH`, `filterSSRV`) project the GGX angular lobe radius into screen space so wet concrete puddles remain mirror-sharp while glazed porcelain reflects smoothly. Full-res `compositeSSR` resolves a fixed 12-tap deterministic Vogel solar disk exclusively on detected shadow boundaries (zero screen-space crawling on camera motion) and upsamples filtered reflections with sub-texel bilinear bilateral weights.
3. **Optional Two-Solver Physical Water & Live GPU Photon Caustics (`water.js`, `water-finite-depth.*`, `water-body-waves.*`, `wake-trail.js`, `water-reconstruct.wgsl`, `water-caustics.wgsl`, `water-render.wgsl`)**: Zero cost on dry levels. On flooded levels, a **player-tracking local simulation window** (`20.48×20.48 m` at `8 cm` cells on desktop GPU, shifting seamlessly without edge-reset artifacts as the player explores):
   - **Background Solver (`water-finite-depth`)**: Solves the linear finite-depth gravity-capillary equation with exact Chebyshev polynomial $G(L) = \sqrt{L}\tanh(H\sqrt{L})$ over the 9-point Neumann wet-domain graph Laplacian (respecting walls, columns, stairs, and raised pool decks), driven by band-limited stochastic pressure forcing for fine organic multi-scale pool ripples.
   - **Wading Wake Solver (`water-body-waves` + `wake-trail.js`)**: A `256×256` GPU 2D spectral FFT initial-value solver integrating $\omega^2(k) = (9.81 k + 0.000073 k^3)\tanh(k H)$ driven by smoothed moving body displacement (emerging bow crest and diverging Kelvin V-wake arms), collision-resolved alternating left/right footstep pressure pulses, and ballistic kick-splash impacts.
   - **Shared Composition & Live Photon Caustics (`water-reconstruct.wgsl`, `water-caustics.wgsl`)**: Composes both physical fields with radius-2 Neumann ghost-cell extrapolation across dry boundaries ($\partial h/\partial n = 0$) so Catmull-Rom bicubic slopes stay smooth right up to walls; refracts live sunlight photons through the surface with RGB chromatic dispersion (IOR 1.325 / 1.333 / 1.342) into an atomic world-space caustic irradiance grid that deforms live with every wading step.
   - **Ray-Heightfield BVH Water Surface (`water-render.wgsl`)**: Renders a raised wave-crest bounding envelope with hardware Early-Z culling (`depthCompare: "less"`), 4-step damped Newton ray-heightfield intersection against `sceneDepthTex` for an organically undulating water-wall contact line, subtle capillary meniscus curl, camera-facing normal clamping, wet-side BVH Snell refraction of submerged analytic tiles illuminated by live caustics with RGB Beer-Lambert absorption, and full-scene BVH mirror reflections.
4. **BVH-Occluded Volumetric Atmosphere (`volumetric.wgsl`)**: 12-step half-res raymarch with deterministic 2×2 ordered step phase, BVH-occluded sunlight shafts (Henyey-Greenstein phase), and deterministic top-2 strongest in-range skylight/area-light mist scattering smoothed by a 5×5 Gaussian filter (zero light-picking speckle on camera movement).
5. **HDR Bloom Halation (`postprocess.wgsl`)**: Half-res high-threshold (`2.35`) soft-knee bright-pass extraction and wide separable Gaussian blur preserving crisp sunlit tiles while haloing emissive fixtures and lightwells.
6. **Composite & AgX Present (`postprocess.wgsl`)**: Exponential extinction fog, volumetric mist, optical bloom halation, Troy Sobotka **AgX Filmic Tone Mapping**, vignette, clean static 8-bit de-banding dither (zero animated grain in clean mode), and optional Found-Footage camcorder mode.

## 5. Procedural Spatial Audio (`src/engine/audio.js`)

Zero audio files: synthesizes a frequency-damped stereo convolution reverb (tiled early reflections + warm air-damped tail), stereo LFO-modulated Poolrooms ambient water lapping, physical Minnaert rising-pitch water droplets (Poolrooms halls and Level 1 subterranean concrete), subtle ankle-flow background drag, dry-forward 4-beat step-by-step wading footsteps (foot lift -> swept hydraulic shin plow -> submerged tile plant & splash spray -> settling calf drips, panned alternating L/R and synced 1:1 with `wakeTrail` and subtle wading head-bob), plus damp commercial carpet and echoing wet-concrete footsteps.
