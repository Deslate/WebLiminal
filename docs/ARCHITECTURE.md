# WebLiminal v2 Engine Architecture

The v2 framework (`v2.html`, `src/engine/`) implements a **runtime-synthesis hybrid WebGPU architecture** alongside the untouched v1 physical Poolrooms renderer (`index.html`, `src/render/`): procedural material bases and multi-bounce indirect GI are baked once on the GPU when a level loads, while real-time frames combine hardware rasterization with analytic ceramic optics, per-pixel BVH shadows, full-scene BVH glossy reflections, and physical BVH water with live GPU photon caustics.

## 1. Map Compilation (`src/engine/map-builder.js`, `uv-atlas.js`, `bvh.js`)

When a v2 level loads, its `build(m)` function emits declarative architectural geometry into a `MapBuilder`. `compile()` outputs one universal scene package:

- **Indexed Triangle Mesh** (64 bytes/vertex): `position`, `materialId`, `normal`, `tangent` (with handedness), metric tiling `uv`, and packed `uv2`.
- **Automatic Lightmap UV2 Atlas (`uv-atlas.js`)**: Shelf-packs all surface charts into a single square atlas (`1024²` on hardware GPUs, `384²` on software fallback) with a 2-texel gutter and texel-center alignment.
- **Flat Binned-SAH BVH (`bvh.js`)**: Compiles all scene triangles into 32-byte nodes and 112-byte Möller-Trumbore records carrying interpolated surface `uv` and lightmap `uv2`, allowing any runtime reflection or refraction ray to evaluate analytic materials and baked multi-bounce GI in O(1).
- **Analytical Light & Skylight List**: Arbitrary area light quads (fluorescent panels, tubes, frosted backlit windows, glowing signs, skylight portals) with precomputed power CDFs.
- **Collision Structure (`collision.js`)**: Walkable room bounds, 2D solid boxes/circles, and elevation zones (ramps, stairs, raised decks).

## 2. Startup GPU Synthesis (`bake-textures.wgsl`, `mipmap.wgsl`)

Only materials referenced by the active level are baked:

1. `bake-textures.wgsl` synthesizes `512×512` (or `256×256` on software fallback) seamless periodic textures into three `rgba8unorm` `texture_2d_array` resources (`albedoRoughTex`, `normalHeightTex`, `metaTex`). For ceramic porcelain presets, organic glaze mottling is baked here while millimeter grout joints, glazed bevels, and per-tile 3D micro-tilt are evaluated analytically at infinite resolution in the shading passes.
2. `mipmap.wgsl` builds the complete mipmap chain using **Toksvig normal-variance folding** to suppress distant specular aliasing.

## 3. Startup & Progressive Indirect GI Baker (`bake-gbuffer.wgsl`, `bake-lightmap.wgsl`, `denoise-lightmap.wgsl`)

1. **UV2 G-Buffer Rasterization**: Renders the mesh in UV2 space for exact world positions and geometric normals (`rgba32float` / `rgba16float`) with 2-texel gutter dilation.
2. **Split Direct/Indirect Lightmap**:
   - Direct sunlight is **excluded** from primary lightmap texels and evaluated per-pixel via BVH soft shadows at runtime, eliminating lightmap-texel shadow blur.
   - Primary texels accumulate smooth area lights, backlit frosted windows, skylight portals, dominant incoming light direction, and short-range baked AO.
   - **3-Bounce Indirect GI with Physical Water Filtering**: Indirect bounces include direct sun and attenuate underwater paths by exact Beer-Lambert water absorption, naturally bouncing turquoise-mint GI from sunlit pools onto overhead ceilings.
3. **Bilateral Denoise & Gutter Dilation**: A 2-pass geometry-aware À-trous filter smooths indirect GI without bleeding across corners, followed by gutter dilation into `rgba16float` textures.

## 4. Real-Time Frame Graph (`renderer.js`)

Per frame, the renderer executes six passes:

1. **Sky Backdrop + Opaque PBR + Analytic Ceramic + Soft BVH Sun Shadows (`gbuffer-pbr.wgsl`)**: Hardware-rasterized PBR with exact box-filtered analytical porcelain grout (alias-free at all distances), per-tile 3D mounting micro-tilt & bevel normals, 6-sample Vogel-disk BVH soft sun shadows, early-culled BVH-shadowed area-light GGX specular, and directional indirect GI.
2. **Full-Scene BVH Glossy Reflections + Edge-Stopping Bilateral Filter (`ssr.wgsl`)**: Full-resolution GGX reflection rays trace against the scene BVH (sampling baked GI, analytic ceramic tiles, direct sun, HDR emissive windows/skylights, and sky — zero SSR holes), filtered with a normal/depth-guided bilateral kernel that preserves individual tilted tile facets.
3. **Optional Physical BVH Water & Live GPU Photon Caustics (`water.js`, `water-sim.wgsl`, `water-caustics.wgsl`, `water-render.wgsl`)**: Zero cost on dry levels. On flooded levels:
   - Advances an isotropic 9-point wave field with Neumann solid wall/column boundaries, viscous short-wave dissipation, smooth ambient swell, and wading wakes.
   - Emits real live sunlight photons through the Catmull-Rom bicubic water surface with spectral RGB dispersion (IOR 1.325 / 1.333 / 1.342) into an atomic world-space caustic irradiance grid (zero fake procedural caustic patterns).
   - Renders the water plane via exact unpolarized dielectric Fresnel (IOR 1.333), true BVH Snell refraction of submerged analytic tiles & live photon caustics with RGB Beer-Lambert absorption, and full-scene BVH mirror reflections.
4. **BVH-Occluded Volumetric Atmosphere (`volumetric.wgsl`)**: Half-res raymarch with BVH-occluded sunlight shafts (Henyey-Greenstein phase) and stochastic BVH-occluded skylight/window humid mist, followed by spatial smoothing.
5. **HDR Bloom Halation (`postprocess.wgsl`)**: Half-res soft-knee bright-pass extraction and wide separable Gaussian blur.
6. **Composite & AgX Present (`postprocess.wgsl`)**: Exponential extinction fog, volumetric mist, optical bloom halation, Troy Sobotka **AgX Filmic Tone Mapping**, vignette, subtle film grain, and optional Found-Footage camcorder mode.
