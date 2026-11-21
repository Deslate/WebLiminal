// Level 37 · The Poolrooms (v2 Photographic Multi-Chamber Showcase).
// Four seamlessly connected, explorable Poolrooms halls built purely with declarative MapBuilder
// primitives (zero custom shaders, zero bitmap assets):
//   1. Ring Passage       — receding white-tiled circular arches, diagonal sun, pitch-black tunnel
//   2. Misty Lightwell    — dark tiled corridor opening into warm volumetric mist & steel rail
//   3. Spiral Column      — sunlit tiled cylinder, cantilevered spiral stairs, turquoise ceiling GI
//   4. Slide & Portholes  — wet deck, emerald tile dado, backlit pill windows & curved water slide

export default {
  id: "poolrooms-v2",
  title: "Poolrooms · 4-Hall Showcase (v2)",
  subtitle: "BVH PHOTON CAUSTICS · ANALYTIC PORCELAIN · MULTI-BOUNCE GI",
  audio: "poolrooms",
  spawn: { x: 0.92, y: 1.58, z: 8.85, yaw: 0.14, pitch: -0.06 },
  atmosphere: {
    // Near-black fog extinction color: unlit tunnels drop naturally into true abyssal darkness,
    // while sunlit/skylit air glows purely via BVH-occluded volumetric scattering.
    fogColor: [0.005, 0.009, 0.007],
    fogDensity: 0.014,
    heightFogFalloff: 0.16,
    skyTop: [0.30, 0.48, 0.64],
    skyHorizon: [0.95, 0.91, 0.78],
    sun: {
      // Upper-left-behind diagonal sun: pours cleanly through Ring 1 onto foreground steps & emerald
      // floor in Chamber 1 (with skylight hidden behind camera!), illuminates the lightwell mist in
      // Chamber 2, and lights the front-left curved belly of the cylindrical column in Chamber 3!
      direction: [-0.52, 0.68, 0.52],
      color: [1.0, 0.94, 0.80],
      intensity: 6.8,
      angularRadius: 0.008, // crisp ~0.5° solar disc for photographic shadow boundaries
    },
    exposure: 1.04,
    bloomStrength: 0.24,
    volumetricStrength: 0.88,
    ambientFloor: 0.0005,
    bounceBoost: 1.45,
    aoRadius: 1.8,
  },

  build(m) {
    // Authentic warm architectural alabaster porcelain (matches v1 porcelain.wgsl & photo refs).
    const whiteTile = m.material({ base: "tile_white", tint: [1.0, 1.0, 0.97], roughness: 0.145, coat: 0.88, tileScale: 1.25 });
    const ringTile = m.material({ base: "tile_white", tint: [0.99, 1.0, 0.96], roughness: 0.15, coat: 0.86, tileScale: 1.25 });
    const poolFloor = m.material({ base: "tile_pool", tint: [0.98, 1.0, 0.97], roughness: 0.16, coat: 0.84, tileScale: 1.25 });
    const plasterMat = m.material({ base: "plaster_warm", tint: [0.94, 0.92, 0.84], roughness: 0.84, coat: 0.02 });
    const dadoGreen = m.material({ base: "tile_dado_green", roughness: 0.09, coat: 0.94, tileScale: 1.25 });
    const frostedWin = m.material({ base: "frosted_window", emissive: [1.0, 0.95, 0.80], emissiveStrength: 16.5 });
    const slideMat = m.material({ base: "fiberglass_slide", roughness: 0.12, coat: 0.94 });
    const steel = m.material({ base: "stainless_steel", roughness: 0.14 });

    // Shared submerged pool floor spanning all four connected halls.
    m.addQuad([-20.2, 0, 13.2], [22.2, 0, 13.2], [22.2, 0, -17.2], [-20.2, 0, -17.2], poolFloor, {
      u0: -20.2, v0: -13.2, u1: 22.2, v1: 17.2, priority: 1.25,
    });
    m.walkBounds = { minX: -19.5, maxX: 21.5, minZ: -16.0, maxZ: 12.2 };

    // =========================================================================
    // CHAMBER 1: RING PASSAGE (x: -5.5..5.5, z: -17..12.5, H: 4.6)
    // Receding circular arches into pitch-black abyss + hidden behind-camera skylight + sunlit steps.
    // =========================================================================
    const H1 = 4.6;
    m.box([-5.5, -0.05, 12.4], [5.5, H1 + 0.12, 13.0], whiteTile);
    m.box([-5.5, -0.05, -17.0], [5.5, H1 + 0.12, -16.4], whiteTile);

    // West divider wall between Ring Passage (x=-5.5) and Chambers 3 & 4
    m.wallWithDoorway([-5.8, -0.05, -16.4], [-5.2, H1 + 0.12, 12.4], {
      material: whiteTile,
      openings: [
        { pos: -4.8, width: 2.2, top: 3.1 }, // passage to Slide & Porthole Hall
        { pos: 8.6, width: 3.0, top: 3.4 },  // passage to Spiral Column Basin
      ],
    });
    // East divider wall between Ring Passage (x=5.5) and Chamber 2 Misty Lightwell
    m.wallWithDoorway([5.2, -0.05, -16.4], [5.8, H1 + 0.12, 12.4], {
      material: whiteTile,
      openings: [{ pos: 7.9, width: 3.2, top: 3.6 }],
    });

    // Ring Passage ceiling (overlapped by 0.08 m over wall tops for watertight corners):
    // Hidden skylight (x=-5.2..-0.4, z=6.75..11.2) sits BEHIND Ring 1 above the camera (invisible in
    // the spawn view, matching image_4.png!) so diagonal sunlight pours straight through Ring 1 onto
    // the left steps & wide emerald foreground water while Ring 1 casts a sharp diagonal shadow right!
    m.addQuad([-5.28, H1, -16.48], [5.28, H1, -16.48], [5.28, H1, 6.75], [-5.28, H1, 6.75], whiteTile, { u0: -5.28, v0: -16.48, u1: 5.28, v1: 6.75 });
    m.addQuad([-5.28, H1, 11.2], [5.28, H1, 11.2], [5.28, H1, 12.48], [-5.28, H1, 12.48], whiteTile, { u0: -5.28, v0: 11.2, u1: 5.28, v1: 12.48 });
    m.addQuad([-0.4, H1, 6.72], [5.28, H1, 6.72], [5.28, H1, 11.24], [-0.4, H1, 11.24], whiteTile, { u0: -0.4, v0: 6.72, u1: 5.28, v1: 11.24 });
    m.box([-5.5, H1, 6.45], [-5.2, H1 + 1.9, 11.5], whiteTile, { solid: false, priority: 0.4 });
    m.box([-0.4, H1, 6.45], [-0.1, H1 + 1.9, 11.5], whiteTile, { solid: false, priority: 0.4 });
    m.box([-5.2, H1, 6.45], [-0.4, H1 + 1.9, 6.75], whiteTile, { solid: false, priority: 0.4 });
    m.box([-5.2, H1, 11.2], [-0.4, H1 + 1.9, 11.5], whiteTile, { solid: false, priority: 0.4 });
    m.skylight(-5.2, 6.75, -0.4, 11.2, H1 + 1.85, { color: [0.94, 0.96, 0.94], intensity: 2.2 });

    const rings = [
      { z: 6.2, r: 2.65, cy: 1.62 },
      { z: 1.8, r: 2.55, cy: 1.56 },
      { z: -2.6, r: 2.42, cy: 1.50 },
      { z: -7.0, r: 2.32, cy: 1.46 },
      { z: -11.4, r: 2.20, cy: 1.42 },
    ];
    for (const rg of rings) {
      m.ringWall([-5.26, -0.05, rg.z], [5.26, H1 + 0.08, rg.z + 0.52], {
        material: ringTile,
        center: 0.0,
        centerY: rg.cy,
        radius: rg.r,
        segments: 44,
      });
    }

    // Crisp white-tiled submerged steps tucked cleanly against the left inside rim of Ring 1
    m.stairs([-2.62, 0, 2.55], [-1.52, 1.08, 5.45], "-x", 4, whiteTile);

    // =========================================================================
    // CHAMBER 2: MISTY LIGHTWELL CORRIDOR (x: 5.5..22.0, z: 4.0..12.5)
    // Dark shadowed narrow tiled corridor opening into warm humid volumetric mist & right-side rail!
    // =========================================================================
    const H2 = 3.9;
    const H2Well = 9.2;
    m.box([5.75, -0.05, 5.75], [13.55, H2 + 0.14, 6.2], whiteTile);
    m.box([5.75, -0.05, 9.6], [13.55, H2 + 0.14, 10.05], whiteTile);
    m.addQuad([5.72, H2, 6.12], [13.58, H2, 6.12], [13.58, H2, 9.68], [5.72, H2, 9.68], whiteTile, { u0: 5.72, v0: 6.12, u1: 13.58, v1: 9.68 });
    // Narrow vertical tiled portal piers framing the bright humid lightwell (1.44 m slot!)
    m.box([12.2, -0.05, 6.15], [13.5, H2 + 0.1, 7.18], whiteTile);
    m.box([12.2, -0.05, 8.62], [13.5, H2 + 0.1, 9.65], whiteTile);

    // Tall sunlit misty lightwell atrium (warm diffused daylight + volumetric mist veiling the rail!)
    m.box([13.2, H2, 4.0], [13.5, H2Well, 12.5], whiteTile, { solid: false, priority: 0.6 });
    m.box([21.6, -0.05, 4.0], [22.0, H2Well, 12.5], whiteTile);
    m.box([13.5, -0.05, 3.8], [22.0, H2Well, 4.2], whiteTile);
    m.box([13.5, -0.05, 12.2], [22.0, H2Well, 12.6], whiteTile);
    m.skylight(13.8, 4.4, 21.4, 12.0, H2Well - 0.1, { color: [1.0, 0.95, 0.80], intensity: 4.6 });
    // Raised far white tiled terrace + stainless steel handrail on the right edge of the mist opening (matching image.png!)
    m.box([16.9, -0.05, 8.15], [21.6, 1.06, 12.2], whiteTile, { walkable: true });
    m.handrail([17.05, 8.26], [21.3, 8.26], 1.06, 0.90, { material: steel, postSpacing: 1.15 });

    // =========================================================================
    // CHAMBER 3: SPIRAL COLUMN BASIN (x: -19.5..-5.5, z: 1.5..12.5, H: 4.6)
    // Sunlit tiled cylindrical column, cantilevered spiral stairs, turquoise tiled ceiling, dark arch!
    // =========================================================================
    const H3 = 4.6;
    m.box([-19.8, -0.05, 1.5], [-19.4, H3 + 0.14, 12.8], whiteTile);
    m.box([-19.8, -0.05, 12.4], [-5.5, H3 + 0.14, 13.0], whiteTile);
    m.wallWithArch([-19.45, -0.05, 1.5], [-5.75, H3 + 0.14, 2.05], {
      material: whiteTile,
      arches: [{ pos: -10.5, radius: 1.55, spring: 0.70 }],
    });
    // Pitch-black sealed chamber behind the low semicircular arch
    m.box([-14.5, -0.05, -2.8], [-7.2, H3 + 0.14, -2.4], whiteTile);
    m.box([-14.5, -0.05, -2.4], [-14.1, H3 + 0.14, 1.5], whiteTile);
    m.box([-7.6, -0.05, -2.4], [-7.2, H3 + 0.14, 1.5], whiteTile);
    m.addQuad([-14.18, H3, -2.48], [-7.52, H3, -2.48], [-7.52, H3, 1.58], [-14.18, H3, 1.58], whiteTile, { u0: -14.18, v0: -2.48, u1: -7.52, v1: 1.58 });

    // Tiled ceiling receiving emerald-turquoise water-bounced GI + side-left skylight beaming onto column!
    m.addQuad([-16.2, H3, 1.98], [-5.72, H3, 1.98], [-5.72, H3, 12.48], [-16.2, H3, 12.48], whiteTile, { u0: -16.2, v0: 1.98, u1: -5.72, v1: 12.48 });
    m.addQuad([-19.48, H3, 1.98], [-16.16, H3, 1.98], [-16.16, H3, 4.2], [-19.48, H3, 4.2], whiteTile, { u0: -19.48, v0: 1.98, u1: -16.16, v1: 4.2 });
    m.addQuad([-19.48, H3, 11.8], [-16.16, H3, 11.8], [-16.16, H3, 12.48], [-19.48, H3, 12.48], whiteTile, { u0: -19.48, v0: 11.8, u1: -16.16, v1: 12.48 });
    m.box([-19.8, H3, 3.9], [-19.4, H3 + 1.9, 12.1], whiteTile, { solid: false, priority: 0.4 });
    m.box([-16.2, H3, 3.9], [-15.9, H3 + 1.9, 12.1], whiteTile, { solid: false, priority: 0.4 });
    m.skylight(-19.4, 4.2, -16.2, 11.8, H3 + 1.85, { color: [0.92, 0.96, 0.98], intensity: 2.3 });

    // Silky 48-segment cylindrical white-tiled column + cantilevered spiral stairs
    m.cylinder(-13.4, 6.2, -0.05, H3 + 0.05, 1.22, whiteTile, { segments: 48 });
    m.spiralStairs(-13.4, 6.2, 0.56, H3 - 0.04, 1.18, 2.72, Math.PI * 0.96, Math.PI * 1.42, 20, whiteTile, { slabThickness: 0.28 });

    // =========================================================================
    // CHAMBER 4: SLIDE & PORTHOLE HALL (x: -19.5..-5.5, z: -16.5..-3.5, H: 5.8)
    // Wet white deck + emerald dado + flat porcelain columns + backlit pill windows & curved water slide!
    // =========================================================================
    const H4 = 5.8;
    const deckY = 0.74;
    // Warm matte plaster ceiling overlapped cleanly over walls
    m.addQuad([-19.48, H4, -16.08], [-5.72, H4, -16.08], [-5.72, H4, -3.42], [-19.48, H4, -3.42], plasterMat, { u0: -19.48, v0: -16.08, u1: -5.72, v1: -3.42 });
    m.box([-19.8, -0.05, -3.5], [-5.75, H4 + 0.14, -3.0], whiteTile);
    m.box([-5.8, H1, -16.5], [-5.2, H4 + 0.14, -3.0], whiteTile, { solid: false });
    m.wallWithArch([-19.8, -0.05, -16.0], [-19.3, H4 + 0.14, -3.5], {
      material: whiteTile,
      arches: [{ pos: -8.6, radius: 1.05, spring: 2.15 }],
    });
    // Real hollow dark alcove behind left arch
    m.box([-22.0, -0.05, -10.2], [-21.6, 3.65, -7.0], whiteTile);
    m.box([-21.6, -0.05, -10.2], [-19.8, 3.65, -9.8], whiteTile);
    m.box([-21.6, -0.05, -7.4], [-19.8, 3.65, -7.0], whiteTile);
    m.addQuad([-21.65, 3.6, -9.85], [-19.75, 3.6, -9.85], [-19.75, 3.6, -7.35], [-21.65, 3.6, -7.35], plasterMat, { u0: 0, v0: 0, u1: 1.9, v1: 2.5 });
    m.addQuad([-21.65, deckY, -7.35], [-19.75, deckY, -7.35], [-19.75, deckY, -9.85], [-21.65, deckY, -9.85], whiteTile, { u0: 0, v0: 0, u1: 1.9, v1: 2.5 });

    // Raised wet white-tiled walkway deck along left side + deep glossy emerald green ceramic dado
    m.box([-19.4, -0.05, -16.0], [-15.1, deckY, -3.5], whiteTile, { walkable: true });
    m.box([-19.30, deckY, -15.9], [-19.24, deckY + 0.80, -9.66], dadoGreen, { solid: false, skipFaces: ["nx"], priority: 0.9 });
    m.box([-19.30, deckY, -7.54], [-19.24, deckY + 0.80, -3.55], dadoGreen, { solid: false, skipFaces: ["nx"], priority: 0.9 });

    // Row of architectural white-tiled square columns along the wet deck edge
    for (const pz of [-6.4, -9.2, -12.0, -14.4]) {
      m.box([-15.72, deckY, pz - 0.27], [-15.18, H4 + 0.05, pz + 0.27], whiteTile);
    }

    // Far backlit window wall (z = -16.5..-15.9): bright warm frosted glass with dark moody room contrast
    const winX = [-14.8, -12.4, -10.0, -7.6];
    m.box([-19.4, -0.05, -16.5], [-15.9, H4 + 0.14, -15.9], whiteTile);
    m.box([-6.4, -0.05, -16.5], [-5.75, H4 + 0.14, -15.9], whiteTile);
    for (const wx of winX) {
      m.pillWindowBay([wx - 1.2, 0, -16.5], [wx + 1.2, 3.6, -15.9], {
        material: whiteTile,
        glassMaterial: frostedWin,
        windowWidth: 0.86,
        sillY: 0.80,
        headY: 3.15,
        facing: "+",
        lightColor: [1.0, 0.95, 0.82],
        lightIntensity: 5.8,
      });
      m.ringWall([wx - 1.2, 3.6, -16.5], [wx + 1.2, H4 + 0.14, -15.9], {
        material: whiteTile,
        center: wx,
        centerY: 4.70,
        radius: 0.48,
        segments: 24,
        glassMaterial: frostedWin,
        glassFacing: "+",
        lightColor: [1.0, 0.95, 0.82],
        lightIntensity: 4.4,
      });
    }

    // Smooth curved dark glossy fiberglass water slide tube sweeping down from ceiling into plunge basin
    m.curvedTube(
      [
        [-12.6, 5.88, -8.4],
        [-11.2, 4.95, -9.6],
        [-9.8, 3.75, -10.6],
        [-9.5, 2.20, -11.4],
        [-9.5, 0.42, -11.7],
      ],
      0.62,
      slideMat,
      { stepsPerSegment: 12, radialSegments: 24, flanges: true },
    );
    m.box([-11.6, -0.05, -13.2], [-7.4, 1.06, -12.95], whiteTile);
    m.box([-11.6, -0.05, -10.2], [-7.4, 1.06, -9.95], whiteTile);
    m.handrail([-11.4, -10.08], [-7.6, -10.08], 1.06, 0.78, { material: steel, postSpacing: 1.2 });

    // =========================================================================
    // SINGLE CONTINUOUS PHYSICAL WATER BODY COVERING ALL FOUR HALLS
    // Two-solver GPU water: Chebyshev finite-depth Neumann ripples + 256x256 FFT wading wake!
    // =========================================================================
    m.water(-19.6, -16.2, 21.8, 12.6, 0.62, {
      // Rich Poolrooms emerald-jade Beer-Lambert absorption:
      // sunlit shallow floors glow vivid emerald-jade, shadowed corridors drop to deep dark emerald!
      absorption: [1.05, 0.16, 0.28],
      waveAmp: 0.020,
      causticStrength: 1.22,
    });

    // Four curated camera bookmarks matching each iconic Poolrooms composition:
    m.bookmark("1 · Ring Passage", { x: 0.92, y: 1.66, z: 8.85, yaw: 0.14, pitch: -0.07 });
    m.bookmark("2 · Misty Lightwell", { x: 9.0, y: 1.62, z: 7.9, yaw: -1.57, pitch: 0.01 });
    m.bookmark("3 · Spiral Column", { x: -11.3, y: 1.68, z: 11.3, yaw: 0.25, pitch: 0.02 });
    m.bookmark("4 · Slide & Portholes", { x: -16.0, y: 1.50, z: -4.2, yaw: -0.24, pitch: 0.01 });
  },
};
