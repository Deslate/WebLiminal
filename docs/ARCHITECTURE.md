# WebLiminal Engine Architecture

WebLiminal follows the modern **"Web-AAA" runtime-synthesis architecture**: heavy procedural texture generation and path-traced global illumination run once on the GPU when a level loads, allowing real-time gameplay to run on clean hardware rasterization.

## 1. Map Compilation (`src/engine/map-builder.js`, `uv-atlas.js`, `bvh.js`)

When a level loads, its `build(m)` function emits high-level architectural geometry into a `MapBuilder`. `compile()` produces one universal scene package:

- **Indexed Triangle Mesh** (64 bytes/vertex): `position`, `materialId`, `normal`, `tangent` (with handedness), metric tiling `uv`, and packed `uv2`.
- **Automatic Lightmap UV2 Atlas (`uv-atlas.js`)**: Shelf-packs all surface charts into a single square atlas (`1024²` on hardware GPUs, `384²` on software fallback) with a 2-texel gutter and texel-center alignment so hardware bilinear filtering never bleeds across seams.
- **Flat Binned-SAH BVH (`bvh.js`)**: Compiles all scene triangles into 32-byte nodes and 64-byte Möller-Trumbore triangle records for fast stack-based GPU ray tracing regardless of scene complexity.
- **Analytical Light & Skylight List**: Arbitrary area light quads (fluorescent panels, tubes, glowing signs, skylight portals) with precomputed power CDFs for importance sampling.
- **Collision Structure (`collision.js`)**: Walkable room bounds, 2D solid boxes/circles, and walkable elevation zones (ramps, stairs, sunken basins, elevated walkways).

## 2. Startup GPU Synthesis (`bake-textures.wgsl`, `mipmap.wgsl`)

Only materials actually referenced by the active level are baked:

1. `bake-textures.wgsl` synthesizes `512×512` (or `256×256` on software fallback) seamless periodic textures into three `rgba8unorm` `texture_2d_array` resources:
   - `albedoRoughTex`: linear albedo RGB + perceptual roughness A.
   - `normalHeightTex`: tangent-space normal XY + POM height B + micro-AO A.
   - `metaTex`: metallic R + clearcoat G + emissive mask B + wetness A.
2. `mipmap.wgsl` builds the complete mipmap chain using **Toksvig normal-variance folding**: sub-texel normal shortening increases roughness at coarser mip levels, eliminating distant tile/grout specular shimmering with zero per-frame cost.

## 3. Startup & Progressive GPU BVH Lightmapper (`bake-gbuffer.wgsl`, `bake-lightmap.wgsl`, `denoise-lightmap.wgsl`)

1. **UV2 G-Buffer Rasterization**: Renders the compiled mesh directly into clip space using `uv2` to produce exact per-texel world positions and geometric normals (`rgba32float` / `rgba16float`), followed by a 2-texel conservative gutter dilation into storage buffers.
2. **Progressive Directional Path Tracing**: Each dispatch traces path samples against the flat BVH:
   - **Direct Next Event Estimation (NEE)**: Finite-disc directional sun soft shadows plus direct sampling of all area lights and skylight portals (all lights up to 16 directly on the primary hit; 2-sample power-weighted CDF on bounce vertices).
   - **3-Bounce Indirect GI**: Cosine-weighted hemisphere transport with real surface albedo color bleeding.
   - **Directional Encoding & AO**: Stores diffuse irradiance (`E / π`), luminance-weighted dominant incoming light direction (allowing normal maps to react dynamically to baked bounce light!), and short-range baked Ambient Occlusion.
3. **Bilateral Denoise & Gutter Dilation**: A 2-pass geometry-aware À-trous filter (weighted by normal dot product and world-space distance) smooths indirect GI without blurring across walls or shadow creases, followed by final gutter dilation into hardware-filterable `rgba16float` textures.

An initial fast batch runs immediately before the first frame so the player enters a fully lit scene right away; remaining samples converge silently in background batches while playing.

## 4. Real-Time Frame Graph (`renderer.js`)

Per frame, the renderer executes six compact passes:

1. **Sky Backdrop + Opaque PBR Rasterization (`gbuffer-pbr.wgsl`)**: Hardware-rasterized PBR with 6-step Parallax Occlusion Mapping (close range), directional lightmap + normal-map modulation, dielectric clearcoat, analytic GGX specular from nearby area lights, and emissive flicker. Outputs HDR color, world normal + roughness, reflection tint/strength, and `depth32float`.
2. **Screen-Space Reflections (`ssr.wgsl`)**: Half-res raymarch with binary refinement against the depth buffer, roughness-aware spatial filtering, and proper separation of achromatic dielectric reflections (glazed tiles, wet concrete puddles) vs. tinted metallic conductors.
3. **Optional Interactive Water & Live Caustics (`water.js`, `water-sim.wgsl`, `water-render.wgsl`)**: Skipped entirely on dry maps. On flooded maps, advances a 2D wave PDE with Neumann solid boundaries and live player wading wakes, then renders the water plane with depth-validated Snell refraction, Beer-Lambert RGB depth absorption, live wave-curvature chromatic caustics, and dielectric Fresnel SSR.
4. **Volumetric Atmosphere (`volumetric.wgsl`)**: Half-res interleaved-gradient raymarch tracing real BVH sun shadows (Henyey-Greenstein phase function) plus soft area-light proximity haze, smoothed with a spatial filter.
5. **HDR Bloom (`postprocess.wgsl`)**: Half-res soft-knee bright-pass extraction and separable Gaussian blur.
6. **Composite & Tone Mapping (`postprocess.wgsl`)**: Distance + exponential height fog, volumetric shafts, bloom halation, Troy Sobotka **AgX Filmic Tone Mapping** (display-referred sRGB output), optical vignette, fine film grain, and an optional Found Footage camcorder lens mode.
