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
    // while sunlit/skylit air glows purely via BVH-occluded volumetric scattering!
    fogColor: [0.006, 0.010, 0.009],
    fogDensity: 0.015,
    heightFogFalloff: 0.16,
    skyTop: [0.32, 0.52, 0.72],
    skyHorizon: [0.92, 0.90, 0.80],
    sun: {
      direction: [-0.62, 0.72, 0.31],
      color: [1.0, 0.94, 0.80],
      intensity: 24.0,
      angularRadius: 0.008, // crisp ~0.5° solar disc for photographic shadow boundaries
    },
    exposure: 0.96,
    bloomStrength: 0.26,
    volumetricStrength: 0.92,
    ambientFloor: 0.0005,
    bounceBoost: 1.45,
    aoRadius: 1.8,
  },

  build(m) {
    // Clean neutral photographic ceramic porcelain variants (water hue arises from Beer-Lambert optics).
    const whiteTile = m.material({ base: "tile_white", tint: [1.0, 0.99, 0.95], roughness: 0.10, coat: 0.95, tileScale: 1.35 });
    const ringTile = m.material({ base: "tile_white", tint: [0.99, 1.0, 0.96], roughness: 0.11, coat: 0.93, tileScale: 1.35 });
    const poolFloor = m.material({ base: "tile_pool", tint: [0.96, 1.0, 0.97], roughness: 0.13, coat: 0.88, tileScale: 1.35 });
    const plasterMat = m.material({ base: "plaster_warm", tint: [0.94, 0.93, 0.86], roughness: 0.84, coat: 0.02 });
    const dadoGreen = m.material({ base: "tile_dado_green", roughness: 0.07, coat: 0.98, tileScale: 1.35 });
    const frostedWin = m.material({ base: "frosted_window", emissive: [1.0, 0.95, 0.80], emissiveStrength: 22.0 });
    const slideMat = m.material({ base: "fiberglass_slide", roughness: 0.11, coat: 0.96 });
    const steel = m.material({ base: "stainless_steel", roughness: 0.13 });

    // Shared submerged pool floor spanning all four connected halls.
    m.addQuad([-20.0, 0, 13.0], [22.0, 0, 13.0], [22.0, 0, -17.0], [-20.0, 0, -17.0], poolFloor, {
      u0: -20, v0: -13, u1: 22, v1: 17, priority: 1.25,
    });
    m.walkBounds = { minX: -19.5, maxX: 21.5, minZ: -16.0, maxZ: 12.2 };

    // =========================================================================
    // CHAMBER 1: RING PASSAGE (x: -5.5..5.5, z: -17..12.5, H: 4.6)
    // Receding circular arches into pitch-black abyss + hidden side-left skylight + sunlit steps.
    // =========================================================================
    const H1 = 4.6;
    m.box([-5.5, 0, 12.4], [5.5, H1, 13.0], whiteTile);
    m.box([-5.5, 0, -17.0], [5.5, H1, -16.4], whiteTile);

    // West divider wall between Ring Passage (x=-5.5) and Chambers 3 & 4
    m.wallWithDoorway([-5.8, 0, -16.4], [-5.2, H1, 12.4], {
      material: whiteTile,
      openings: [
        { pos: -4.8, width: 2.2, top: 3.1 }, // passage to Slide & Porthole Hall
        { pos: 8.6, width: 3.0, top: 3.4 },  // passage to Spiral Column Basin
      ],
    });
    // East divider wall between Ring Passage (x=5.5) and Chamber 2 Misty Lightwell
    m.wallWithDoorway([5.2, 0, -16.4], [5.8, H1, 12.4], {
      material: whiteTile,
      openings: [{ pos: 7.9, width: 3.2, top: 3.6 }],
    });

    // Ring Passage ceiling: hidden side-left skylight (x=-5.2..-2.1, z=2.2..6.1) tucked behind Ring 1
    // so diagonal sunlight illuminates the left steps & refracted submerged floor tiles while
    // casting a razor-sharp diagonal shadow across the bottom-right foreground water!
    m.addQuad([-5.2, H1, -16.4], [5.2, H1, -16.4], [5.2, H1, 2.2], [-5.2, H1, 2.2], whiteTile, { u0: -5.2, v0: -16.4, u1: 5.2, v1: 2.2 });
    m.addQuad([-5.2, H1, 6.1], [5.2, H1, 6.1], [5.2, H1, 12.4], [-5.2, H1, 12.4], whiteTile, { u0: -5.2, v0: 6.1, u1: 5.2, v1: 12.4 });
    m.addQuad([-2.1, H1, 2.2], [5.2, H1, 2.2], [5.2, H1, 6.1], [-2.1, H1, 6.1], whiteTile, { u0: -2.1, v0: 2.2, u1: 5.2, v1: 6.1 });
    m.box([-5.5, H1, 1.9], [-5.2, H1 + 1.8, 6.4], whiteTile, { solid: false, priority: 0.4 });
    m.box([-2.1, H1, 1.9], [-1.8, H1 + 1.8, 6.4], whiteTile, { solid: false, priority: 0.4 });
    m.box([-5.2, H1, 1.9], [-2.1, H1 + 1.8, 2.2], whiteTile, { solid: false, priority: 0.4 });
    m.box([-5.2, H1, 6.1], [-2.1, H1 + 1.8, 6.4], whiteTile, { solid: false, priority: 0.4 });
    m.skylight(-5.2, 2.2, -2.1, 6.1, H1 + 1.8, { color: [0.90, 0.96, 1.0], intensity: 2.2 });

    const rings = [
      { z: 6.2, r: 2.65, cy: 1.56 },
      { z: 1.8, r: 2.55, cy: 1.50 },
      { z: -2.6, r: 2.42, cy: 1.46 },
      { z: -7.0, r: 2.32, cy: 1.42 },
      { z: -11.4, r: 2.20, cy: 1.38 },
    ];
    for (const rg of rings) {
      m.ringWall([-5.2, 0, rg.z], [5.2, H1, rg.z + 0.52], {
        material: ringTile,
        center: 0.0,
        centerY: rg.cy,
        radius: rg.r,
        segments: 36,
      });
    }

    // Crisp white-tiled submerged steps tucked cleanly against the left inside rim of Ring 1
    m.stairs([-2.85, 0, 2.6], [-1.55, 1.02, 5.4], "-x", 4, whiteTile);

    // =========================================================================
    // CHAMBER 2: MISTY LIGHTWELL CORRIDOR (x: 5.5..22.0, z: 4.0..12.5)
    // Dark shadowed narrow tiled corridor opening into warm humid volumetric mist & handrail!
    // =========================================================================
    const H2 = 3.9;
    const H2Well = 9.2;
    m.box([5.8, 0, 5.8], [13.5, H2, 6.2], whiteTile);
    m.box([5.8, 0, 9.6], [13.5, H2, 10.0], whiteTile);
    m.addQuad([5.8, H2, 6.2], [13.5, H2, 6.2], [13.5, H2, 9.6], [5.8, H2, 9.6], whiteTile, { u0: 5.8, v0: 6.2, u1: 13.5, v1: 9.6 });
    // Narrow vertical tiled portal piers framing the bright humid lightwell (1.45 m slot!)
    m.box([12.2, 0, 6.2], [13.5, H2, 7.18], whiteTile);
    m.box([12.2, 0, 8.62], [13.5, H2, 9.6], whiteTile);

    // Tall sunlit misty lightwell atrium (warm diffused daylight + volumetric mist veiling the rail!)
    m.box([13.2, H2, 4.0], [13.5, H2Well, 12.5], whiteTile, { solid: false, priority: 0.6 });
    m.box([21.6, 0, 4.0], [22.0, H2Well, 12.5], whiteTile);
    m.box([13.5, 0, 3.8], [22.0, H2Well, 4.2], whiteTile);
    m.box([13.5, 0, 12.2], [22.0, H2Well, 12.6], whiteTile);
    m.skylight(13.8, 4.4, 21.4, 12.0, H2Well - 0.1, { color: [1.0, 0.96, 0.84], intensity: 5.8 });
    // Raised far white tiled terrace + stainless steel handrail standing inside the warm mist!
    m.box([17.0, 0, 4.2], [21.6, 0.96, 7.75], whiteTile, { walkable: true });
    m.handrail([17.15, 7.62], [21.3, 7.62], 0.96, 0.90, { material: steel, postSpacing: 1.15 });

    // =========================================================================
    // CHAMBER 3: SPIRAL COLUMN BASIN (x: -19.5..-5.5, z: 1.5..12.5, H: 4.6)
    // Sunlit tiled cylindrical column, cantilevered spiral stairs, turquoise tiled ceiling, dark arch!
    // =========================================================================
    const H3 = 4.6;
    m.box([-19.8, 0, 1.5], [-19.4, H3, 12.8], whiteTile);
    m.box([-19.8, 0, 12.4], [-5.5, H3, 13.0], whiteTile);
    m.wallWithArch([-19.4, 0, 1.5], [-5.8, H3, 2.05], {
      material: whiteTile,
      arches: [{ pos: -10.5, radius: 1.55, spring: 0.62 }],
    });
    // Pitch-black sealed chamber behind the low semicircular arch
    m.box([-14.5, 0, -2.8], [-7.2, H3, -2.4], whiteTile);
    m.box([-14.5, 0, -2.4], [-14.1, H3, 1.5], whiteTile);
    m.box([-7.6, 0, -2.4], [-7.2, H3, 1.5], whiteTile);
    m.addQuad([-14.1, H3, -2.4], [-7.6, H3, -2.4], [-7.6, H3, 1.5], [-14.1, H3, 1.5], whiteTile, { u0: -14.1, v0: -2.4, u1: -7.6, v1: 1.5 });

    // Tiled ceiling receiving turquoise water-bounced GI + side-left skylight beaming onto column!
    m.addQuad([-16.2, H3, 2.05], [-5.8, H3, 2.05], [-5.8, H3, 12.4], [-16.2, H3, 12.4], whiteTile, { u0: -16.2, v0: 2.05, u1: -5.8, v1: 12.4 });
    m.addQuad([-19.4, H3, 2.05], [-16.2, H3, 2.05], [-16.2, H3, 3.6], [-19.4, H3, 3.6], whiteTile, { u0: -19.4, v0: 2.05, u1: -16.2, v1: 3.6 });
    m.addQuad([-19.4, H3, 11.2], [-16.2, H3, 11.2], [-16.2, H3, 12.4], [-19.4, H3, 12.4], whiteTile, { u0: -19.4, v0: 11.2, u1: -16.2, v1: 12.4 });
    m.box([-19.8, H3, 3.3], [-19.4, H3 + 1.8, 11.5], whiteTile, { solid: false, priority: 0.4 });
    m.box([-16.2, H3, 3.3], [-15.9, H3 + 1.8, 11.5], whiteTile, { solid: false, priority: 0.4 });
    m.skylight(-19.4, 3.6, -16.2, 11.2, H3 + 1.8, { color: [0.92, 0.97, 1.0], intensity: 2.6 });

    // Wide cylindrical white-tiled column + cantilevered spiral stairs curving cleanly behind-left & over top!
    m.cylinder(-13.4, 6.2, 0, H3, 1.22, whiteTile, { segments: 32 });
    m.spiralStairs(-13.4, 6.2, 0.48, H3 - 0.04, 1.18, 2.72, Math.PI * 0.96, Math.PI * 1.42, 20, whiteTile, { slabThickness: 0.28 });

    // =========================================================================
    // CHAMBER 4: SLIDE & PORTHOLE HALL (x: -19.5..-5.5, z: -16.5..-3.5, H: 5.8)
    // Wet white deck + emerald dado + sparkling columns + backlit pill windows & curved water slide!
    // =========================================================================
    const H4 = 5.8;
    // Warm matte plaster ceiling (no ceiling tile glare, keeping stark dark/bright water mirror contrast!)
    m.addQuad([-19.4, H4, -16.0], [-5.8, H4, -16.0], [-5.8, H4, -3.5], [-19.4, H4, -3.5], plasterMat, { u0: -19.4, v0: -16, u1: -5.8, v1: -3.5 });
    m.box([-19.8, 0, -3.5], [-5.8, H4, -3.0], whiteTile);
    m.box([-5.8, H1, -16.5], [-5.2, H4, -3.0], whiteTile, { solid: false });
    m.wallWithArch([-19.8, 0, -16.0], [-19.3, H4, -3.5], {
      material: whiteTile,
      arches: [{ pos: -8.6, radius: 1.05, spring: 2.05 }],
    });
    // Real hollow dark alcove behind left arch
    m.box([-22.0, 0, -10.2], [-21.6, 3.6, -7.0], whiteTile);
    m.box([-21.6, 0, -10.2], [-19.8, 3.6, -9.8], whiteTile);
    m.box([-21.6, 0, -7.4], [-19.8, 3.6, -7.0], whiteTile);
    m.addQuad([-21.6, 3.6, -9.8], [-19.8, 3.6, -9.8], [-19.8, 3.6, -7.4], [-21.6, 3.6, -7.4], plasterMat, { u0: 0, v0: 0, u1: 1.8, v1: 2.4 });
    m.addQuad([-21.6, 0.64, -7.4], [-19.8, 0.64, -7.4], [-19.8, 0.64, -9.8], [-21.6, 0.64, -9.8], whiteTile, { u0: 0, v0: 0, u1: 1.8, v1: 2.4 });

    // Raised wet white-tiled walkway deck along left side + deep glossy emerald green ceramic dado
    m.box([-19.4, 0, -16.0], [-15.1, 0.64, -3.5], whiteTile, { walkable: true });
    m.box([-19.32, 0.64, -15.9], [-19.24, 1.44, -9.65], dadoGreen, { solid: false, priority: 0.9 });
    m.box([-19.32, 0.64, -7.55], [-19.24, 1.44, -3.55], dadoGreen, { solid: false, priority: 0.9 });

    // Row of sparkling micro-tilted white-tiled square columns along the wet deck edge
    for (const pz of [-6.4, -9.2, -12.0, -14.4]) {
      m.box([-15.72, 0.64, pz - 0.27], [-15.18, H4, pz + 0.27], whiteTile);
    }

    // Far backlit window wall (z = -16.5..-15.9): blazing emissive glass with restrained GI diffuse
    // so the hall stays moody & dark while water and tiles blaze with stark white liquid reflections!
    const winX = [-14.8, -12.4, -10.0, -7.6];
    m.box([-19.4, 0, -16.5], [-15.9, H4, -15.9], whiteTile);
    m.box([-6.4, 0, -16.5], [-5.8, H4, -15.9], whiteTile);
    for (const wx of winX) {
      m.pillWindowBay([wx - 1.2, 0, -16.5], [wx + 1.2, 3.6, -15.9], {
        material: whiteTile,
        glassMaterial: frostedWin,
        windowWidth: 0.86,
        sillY: 0.72,
        headY: 3.15,
        facing: "+",
        lightColor: [1.0, 0.95, 0.82],
        lightIntensity: 6.5,
      });
      m.ringWall([wx - 1.2, 3.6, -16.5], [wx + 1.2, H4, -15.9], {
        material: whiteTile,
        center: wx,
        centerY: 4.70,
        radius: 0.48,
        segments: 24,
        glassMaterial: frostedWin,
        glassFacing: "+",
        lightColor: [1.0, 0.95, 0.82],
        lightIntensity: 5.0,
      });
    }

    // Curved dark glossy fiberglass water slide tube sweeping down from ceiling into plunge basin!
    m.curvedTube(
      [
        [-12.6, 5.85, -8.4],
        [-11.2, 4.95, -9.6],
        [-9.8, 3.75, -10.6],
        [-9.5, 2.20, -11.4],
        [-9.5, 0.45, -11.7],
      ],
      0.62,
      slideMat,
      { stepsPerSegment: 9, radialSegments: 18, flanges: true },
    );
    m.box([-11.6, 0, -13.2], [-7.4, 0.96, -12.95], whiteTile);
    m.box([-11.6, 0, -10.2], [-7.4, 0.96, -9.95], whiteTile);
    m.handrail([-11.4, -10.08], [-7.6, -10.08], 0.96, 0.78, { material: steel, postSpacing: 1.2 });

    // =========================================================================
    // SINGLE CONTINUOUS PHYSICAL WATER BODY COVERING ALL FOUR HALLS
    // Finite-depth dispersive background ripples + live Neumann wading wakes + GPU photon caustics!
    // =========================================================================
    m.water(-19.6, -16.2, 21.8, 12.6, 0.50, {
      absorption: [0.46, 0.105, 0.056],
      waveAmp: 0.038,
      causticStrength: 1.20,
      cellSize: 0.11,
    });

    // Four curated camera bookmarks matching each iconic Poolrooms composition:
    m.bookmark("1 · Ring Passage", { x: 0.92, y: 1.58, z: 8.85, yaw: 0.14, pitch: -0.06 });
    m.bookmark("2 · Misty Lightwell", { x: 9.0, y: 1.52, z: 7.9, yaw: -1.57, pitch: 0.01 });
    m.bookmark("3 · Spiral Column", { x: -11.3, y: 1.62, z: 11.3, yaw: 0.25, pitch: 0.03 });
    m.bookmark("4 · Slide & Portholes", { x: -16.0, y: 1.38, z: -4.2, yaw: -0.24, pitch: 0.01 });
  },
};
