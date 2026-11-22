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
  spawn: { x: 0.90, y: 1.66, z: 8.20, yaw: 0.14, pitch: -0.07 },
  atmosphere: {
    // Near-black fog extinction color: unlit tunnels drop naturally into true abyssal darkness,
    // while sunlit/skylit air glows cleanly via subtle BVH-occluded volumetric scattering.
    fogColor: [0.004, 0.006, 0.006],
    fogDensity: 0.011,
    heightFogFalloff: 0.16,
    skyTop: [0.32, 0.52, 0.86],
    skyHorizon: [0.76, 0.84, 0.94],
    sun: {
      // Crisp warm-white upper-left diagonal sun (matching v1 sunDirection/sunIrradiance!):
      // Slashes across the right arch walls & casts receding bright caustic squares down the emerald pool,
      // while keeping the foreground arch surround in dramatic obsidian shadow!
      direction: [-0.58, 0.72, 0.38],
      color: [1.0, 0.95, 0.82],
      intensity: 9.6,
      angularRadius: 0.0065, // crisp ~0.4° solar disc for razor-clean photographic shadows
    },
    exposure: 1.04,
    bloomStrength: 0.22,
    volumetricStrength: 0.28,
    ambientFloor: 0.0003,
    bounceBoost: 1.32,
    aoRadius: 1.8,
  },

  build(m) {
    // Authentic warm architectural travertine-ivory porcelain (exact v1 porcelain.wgsl warmth!)
    // on a shared 200 mm (0.20 m) masonry module (baseFreq 4.0 * tileScale 1.25 = 5 tiles/m).
    const whiteTile = m.material({ base: "tile_white", tint: [0.98, 0.97, 0.87], roughness: 0.12, coat: 0.94, tileScale: 1.25 });
    const ringTile = m.material({ base: "tile_white", tint: [0.98, 0.97, 0.87], roughness: 0.12, coat: 0.94, tileScale: 1.25 });
    const poolFloor = m.material({ base: "tile_pool", tint: [0.98, 0.99, 0.91], roughness: 0.14, coat: 0.88, tileScale: 1.25 });
    const plasterMat = m.material({ base: "plaster_warm", tint: [0.94, 0.92, 0.84], roughness: 0.84, coat: 0.02 });
    const dadoGreen = m.material({ base: "tile_dado_green", roughness: 0.09, coat: 0.94, tileScale: 1.25 });
    const frostedWin = m.material({ base: "frosted_window", emissive: [1.0, 0.95, 0.80], emissiveStrength: 16.5 });
    const slideMat = m.material({ base: "fiberglass_slide", roughness: 0.12, coat: 0.94 });
    const steel = m.material({ base: "stainless_steel", roughness: 0.14 });

    // Shared submerged pool floor spanning all four connected halls (aligned to exact 0.20 m grid).
    m.floor(-20.20, -17.20, 22.20, 13.20, 0, poolFloor, { priority: 1.25 });
    m.walkBounds = { minX: -19.40, maxX: 21.50, minZ: -15.90, maxZ: 12.20 };

    // =========================================================================
    // CHAMBER 1: RING PASSAGE (x: -5.20..5.20, z: -16.40..12.40, H1: 4.60 = 23 tiles)
    // Dramatic obsidian-shadowed foreground arch opening onto sunlit warm-ivory arches,
    // receding skylight caustic pools on crystal jade-aquamarine water, and pitch-black abyss ahead!
    // =========================================================================
    const H1 = 4.60;
    m.box([-5.80, 0, 12.40], [5.80, H1, 13.00], whiteTile, { skipFaces: ["ny"] });
    m.box([-5.80, 0, -17.00], [5.80, H1, -16.40], whiteTile, { skipFaces: ["ny"] });

    // West divider wall between Ring Passage (x=-5.20) and Chambers 3 & 4 (flush, zero overlap!)
    m.wallWithDoorway([-5.80, 0, -16.40], [-5.20, H1, 12.40], {
      material: whiteTile,
      openings: [
        { pos: -5.00, width: 2.40, top: 3.20 }, // z: -6.20..-3.80 -> Slide & Porthole Hall
        { pos: 8.60, width: 3.20, top: 3.40 },  // z: 7.00..10.20 -> Spiral Column Basin
      ],
    });
    // East divider wall between Ring Passage (x=5.20) and Chamber 2 Misty Lightwell
    // Opening z=6.20..9.60 aligns flush with Chamber 2 corridor inner walls and clears Ring 1 (z=5.40..6.00)!
    m.wallWithDoorway([5.20, 0, -16.40], [5.80, H1, 12.40], {
      material: whiteTile,
      openings: [{ pos: 7.90, width: 3.40, top: 3.60 }],
    });

    // Watertight ceiling with THREE hidden recessed skylight slots tucked behind the left arch piers (x=-5.20..-2.20)!
    // Keeps the visible central ceiling solid white tile while casting 3 receding bright caustic squares
    // straight down the center of the water & slashing warm diagonal sun across the receding right arches!
    const c1Holes = [
      [-5.20, 2.20, -2.20, 4.80],   // Bay 1 (Rings 1-2): foreground centered caustic pool + right wall sun slash
      [-5.20, -2.00, -2.20, 0.60],  // Bay 2 (Rings 2-3): middle receding centered caustic pool
      [-5.20, -6.20, -2.20, -3.60], // Bay 3 (Rings 3-4): far receding centered caustic pool
    ];
    m.ceiling(-5.20, -16.40, 5.20, 12.40, H1, whiteTile, { holes: c1Holes });
    for (const [hx0, hz0, hx1, hz1] of c1Holes) {
      m.box([hx0 - 0.40, H1, hz0], [hx0, H1 + 0.70, hz1], whiteTile, { solid: false, priority: 0.35 });
      m.box([hx1, H1, hz0], [hx1 + 0.40, H1 + 0.70, hz1], whiteTile, { solid: false, priority: 0.35 });
      m.box([hx0 - 0.40, H1, hz0 - 0.40], [hx1 + 0.40, H1 + 0.70, hz0], whiteTile, { solid: false, priority: 0.35 });
      m.box([hx0 - 0.40, H1, hz1], [hx1 + 0.40, H1 + 0.70, hz1 + 0.40], whiteTile, { solid: false, priority: 0.35 });
      m.skylight(hx0, hz0, hx1, hz1, H1 + 0.65, { color: [0.86, 0.92, 0.97], intensity: 2.8 });
    }

    // Five receding circular tunnel rings (0.60 m = 3 exact full tiles deep, symmetric crown joints,
    // flush between x=-5.20..5.20 and y=0..4.60 with zero wall/ceiling interpenetration!).
    const rings = [
      { z: 5.40, r: 2.60, cy: 1.60 },
      { z: 1.20, r: 2.50, cy: 1.60 },
      { z: -3.00, r: 2.40, cy: 1.40 },
      { z: -7.20, r: 2.30, cy: 1.40 },
      { z: -11.40, r: 2.20, cy: 1.40 },
    ];
    for (const rg of rings) {
      m.ringWall([-5.20, 0, rg.z], [5.20, H1, rg.z + 0.60], {
        material: ringTile,
        center: 0.0,
        centerY: rg.cy,
        radius: rg.r,
        segments: 44,
        tileModule: 0.20,
      });
    }

    // Sunlit white-tiled steps anchored flush against the west wall (-5.20) and Ring 1/Ring 2 piers:
    // 4 exact 0.20 m risers x 0.40 m treads (1 tile tall x 2 tiles deep each, zero floating slabs!).
    m.box([-5.20, 0, 1.80], [-3.00, 0.80, 5.40], whiteTile, { walkable: true, skipFaces: ["nx", "ny", "nz", "pz"] });
    m.stairs([-3.00, 0, 1.80], [-1.40, 0.80, 5.40], "-x", 4, whiteTile);

    // =========================================================================
    // CHAMBER 2: MISTY LIGHTWELL CORRIDOR (x: 5.80..22.00, z: 4.00..12.60, H2: 4.00 = 20 tiles)
    // Dark shadowed narrow tiled corridor opening into warm humid volumetric mist & right-side rail!
    // =========================================================================
    const H2 = 4.00;
    const H2Well = 9.20;
    m.box([5.80, 0, 5.80], [13.40, H2, 6.20], whiteTile, { skipFaces: ["ny", "nx"] });
    m.box([5.80, 0, 9.60], [13.40, H2, 10.00], whiteTile, { skipFaces: ["ny", "nx"] });
    m.ceiling(5.80, 6.20, 13.40, 9.60, H2, whiteTile);
    // Narrow vertical tiled portal piers flush inside corridor (exact 1.40 m = 7 tiles wide slot, zero Z-fighting!)
    m.box([12.20, 0, 6.20], [13.40, H2, 7.20], whiteTile, { skipFaces: ["ny", "nz", "py"] });
    m.box([12.20, 0, 8.60], [13.40, H2, 9.60], whiteTile, { skipFaces: ["ny", "pz", "py"] });

    // Fully enclosed misty lightwell atrium (sealed lower west wings behind corridor + full upper shaft!)
    m.box([13.40, 0, 4.20], [13.80, H2, 6.20], whiteTile, { skipFaces: ["ny", "py"] });
    m.box([13.40, 0, 9.60], [13.80, H2, 12.20], whiteTile, { skipFaces: ["ny", "py"] });
    m.box([13.40, H2, 4.20], [13.80, H2Well, 12.20], whiteTile, { solid: false, priority: 0.6 });
    m.box([21.60, 0, 4.20], [22.00, H2Well, 12.20], whiteTile, { skipFaces: ["ny"] });
    m.box([13.40, 0, 3.80], [22.00, H2Well, 4.20], whiteTile, { skipFaces: ["ny"] });
    m.box([13.40, 0, 12.20], [22.00, H2Well, 12.60], whiteTile, { skipFaces: ["ny"] });
    m.skylight(13.80, 4.20, 21.60, 12.20, H2Well - 0.05, { color: [1.0, 0.95, 0.80], intensity: 4.6 });
    // Raised far white tiled terrace (exact 1.00 m = 5 tiles tall) + stainless steel handrail
    m.box([17.00, 0, 8.20], [21.60, 1.00, 12.20], whiteTile, { walkable: true, skipFaces: ["ny", "px", "pz"] });
    m.handrail([17.12, 8.32], [21.40, 8.32], 1.00, 0.90, { material: steel, postSpacing: 1.15 });

    // =========================================================================
    // CHAMBER 3: SPIRAL COLUMN BASIN (x: -19.40..-5.80, z: 2.00..12.40, H3: 4.60 = 23 tiles)
    // Sunlit tiled cylindrical column, cantilevered spiral stairs, turquoise tiled ceiling, dark arch!
    // =========================================================================
    const H3 = 4.60;
    m.box([-19.80, 0, 1.40], [-19.40, H3, 12.40], whiteTile, { skipFaces: ["ny"] });
    m.box([-19.80, 0, 12.40], [-5.80, H3, 13.00], whiteTile, { skipFaces: ["ny"] });
    // Semicircular dark arch on exact 0.20 m masonry datum (spring=0.80, radius=1.60, thick=0.60)
    m.wallWithArch([-19.40, 0, 1.40], [-5.80, H3, 2.00], {
      material: whiteTile,
      tileModule: 0.20,
      arches: [{ pos: -10.40, radius: 1.60, spring: 0.80 }],
    });
    // Pitch-black sealed chamber behind the low semicircular arch
    m.box([-14.60, 0, -2.80], [-7.00, H3, -2.40], whiteTile, { skipFaces: ["ny"] });
    m.box([-14.60, 0, -2.40], [-14.20, H3, 1.40], whiteTile, { skipFaces: ["ny"] });
    m.box([-7.40, 0, -2.40], [-7.00, H3, 1.40], whiteTile, { skipFaces: ["ny"] });
    m.ceiling(-14.20, -2.40, -7.40, 1.40, H3, whiteTile);

    // Single flush tiled ceiling around a 4-wall enclosed skylight shaft (zero paper-thin floating edges!)
    m.ceiling(-19.40, 2.00, -5.80, 12.40, H3, whiteTile, {
      holes: [[-19.40, 4.20, -16.20, 11.80]],
    });
    m.box([-19.80, H3, 4.20], [-19.40, H3 + 2.00, 11.80], whiteTile, { solid: false, priority: 0.4 });
    m.box([-16.20, H3, 4.20], [-15.80, H3 + 2.00, 11.80], whiteTile, { solid: false, priority: 0.4 });
    m.box([-19.80, H3, 3.80], [-15.80, H3 + 2.00, 4.20], whiteTile, { solid: false, priority: 0.4 });
    m.box([-19.80, H3, 11.80], [-15.80, H3 + 2.00, 12.20], whiteTile, { solid: false, priority: 0.4 });
    m.skylight(-19.40, 4.20, -16.20, 11.80, H3 + 1.95, { color: [0.92, 0.96, 0.98], intensity: 2.3 });

    // Seamless 48-segment cylindrical tiled column + non-overlapping 200 mm-course spiral stairs
    m.cylinder(-13.40, 6.20, 0, H3, 1.20, whiteTile, { segments: 48, tileModule: 0.20 });
    m.spiralStairs(-13.40, 6.20, 0.60, H3, 1.18, 2.78, Math.PI * 0.96, Math.PI * 1.42, 20, whiteTile, {
      slabThickness: 0.20,
      tileModule: 0.20,
    });

    // =========================================================================
    // CHAMBER 4: SLIDE & PORTHOLE HALL (x: -19.40..-5.80, z: -16.00..-3.60, H4: 5.80 = 29 tiles)
    // Wet white deck + emerald dado + exact 3x3-tile columns + backlit pill windows & curved water slide!
    // =========================================================================
    const H4 = 5.80;
    const deckY = 0.80; // exact 4 full tiles tall!
    m.ceiling(-19.40, -16.00, -5.80, -3.60, H4, plasterMat);
    m.box([-19.80, 0, -3.60], [-5.80, H4, -3.00], whiteTile, { skipFaces: ["ny"] });
    m.box([-5.80, H1, -16.60], [-5.20, H4, -3.00], whiteTile, { solid: false, skipFaces: ["ny"] });
    m.wallWithArch([-19.80, 0, -16.00], [-19.40, H4, -3.60], {
      material: whiteTile,
      tileModule: 0.20,
      arches: [{ pos: -8.60, radius: 1.00, spring: 2.20 }],
    });
    // Real hollow dark alcove behind left arch (floor extends flush into arch reveal to x=-19.40!)
    m.box([-22.00, 0, -10.20], [-21.60, 3.60, -7.00], whiteTile, { skipFaces: ["ny"] });
    m.box([-21.60, 0, -10.20], [-19.80, 3.60, -9.80], whiteTile, { skipFaces: ["ny"] });
    m.box([-21.60, 0, -7.40], [-19.80, 3.60, -7.00], whiteTile, { skipFaces: ["ny"] });
    m.ceiling(-21.60, -9.80, -19.80, -7.40, 3.60, plasterMat);
    m.floor(-21.60, -9.80, -19.40, -7.40, deckY, whiteTile, { walkable: true });

    // Raised wet white-tiled walkway deck (exact 21 tiles wide) + flush pool-to-deck access stairs (out of bookmark FOV)
    m.box([-19.40, 0, -16.00], [-15.20, deckY, -3.60], whiteTile, { walkable: true, skipFaces: ["nx", "ny", "nz", "pz"] });
    m.stairs([-15.20, 0, -4.40], [-13.60, deckY, -3.60], "-x", 4, whiteTile);
    m.box([-19.40, deckY, -16.00], [-19.36, deckY + 0.80, -9.60], dadoGreen, { solid: false, skipFaces: ["nx", "ny"], priority: 0.9 });
    m.box([-19.40, deckY, -7.60], [-19.36, deckY + 0.80, -3.60], dadoGreen, { solid: false, skipFaces: ["nx", "ny"], priority: 0.9 });

    // Row of architectural square columns: exact 0.60 x 0.60 m (3x3 full tiles on every face, flush with deck edge!)
    for (const pz of [-6.30, -9.10, -11.90, -14.30]) {
      m.box([-15.80, deckY, pz - 0.30], [-15.20, H4, pz + 0.30], whiteTile, { skipFaces: ["ny", "py"] });
    }

    // Far backlit window wall (z = -16.60..-16.00 = 3 exact tiles deep, flush flanking piers with zero overlap!)
    const winX = [-14.80, -12.40, -10.00, -7.60];
    m.box([-19.40, 0, -16.60], [-16.00, H4, -16.00], whiteTile, { skipFaces: ["ny", "py"] });
    m.box([-6.40, 0, -16.60], [-5.80, H4, -16.00], whiteTile, { skipFaces: ["ny", "py"] });
    for (const wx of winX) {
      m.pillWindowBay([wx - 1.20, 0, -16.60], [wx + 1.20, 3.60, -16.00], {
        material: whiteTile,
        glassMaterial: frostedWin,
        windowWidth: 0.80,
        sillY: 0.80,
        headY: 3.20,
        facing: "+",
        tileModule: 0.20,
        lightColor: [1.0, 0.95, 0.82],
        lightIntensity: 5.8,
      });
      m.ringWall([wx - 1.20, 3.60, -16.60], [wx + 1.20, H4, -16.00], {
        material: whiteTile,
        center: wx,
        centerY: 4.60,
        radius: 0.50,
        segments: 24,
        tileModule: 0.20,
        glassMaterial: frostedWin,
        glassFacing: "+",
        lightColor: [1.0, 0.95, 0.82],
        lightIntensity: 4.4,
      });
    }

    // Smooth curved dark glossy fiberglass water slide tube anchored into ceiling and plunge floor with collision
    m.curvedTube(
      [
        [-12.6, 5.88, -8.4],
        [-11.2, 4.95, -9.6],
        [-9.8, 3.70, -10.6],
        [-9.4, 2.10, -11.4],
        [-9.4, 0.00, -11.6],
      ],
      0.62,
      slideMat,
      { stepsPerSegment: 12, radialSegments: 24, flanges: true, solid: true },
    );
    // Grounded plunge catch basin walls (1.00 m = 5 tiles tall, 0.20 m = 1 tile thick, anchored to east wall!)
    m.box([-11.60, 0, -13.20], [-5.80, 1.00, -13.00], whiteTile, { skipFaces: ["ny", "px"] });
    m.box([-11.60, 0, -10.20], [-5.80, 1.00, -10.00], whiteTile, { skipFaces: ["ny", "px"] });
    m.box([-11.60, 0, -13.00], [-11.40, 1.00, -10.20], whiteTile, { skipFaces: ["ny", "nz", "pz"] });
    m.handrail([-11.50, -10.10], [-6.00, -10.10], 1.00, 0.80, { material: steel, postSpacing: 1.10 });

    // =========================================================================
    // SINGLE CONTINUOUS PHYSICAL WATER BODY COVERING ALL FOUR HALLS
    // Two-solver GPU water: Chebyshev finite-depth Neumann ripples + 256x256 FFT wading wake!
    // =========================================================================
    m.water(-19.60, -16.20, 21.80, 12.60, 0.60, {
      // Exact v1-calibrated crystal jade-emerald Beer-Lambert absorption (NOT swamp green!):
      // deep shadowed pools read as crystal dark teal-jade glass where arch reflections pop cleanly!
      absorption: [0.49, 0.068, 0.088],
      waveAmp: 0.0072,
      causticStrength: 1.40,
    });

    // Four curated camera bookmarks matching each iconic Poolrooms composition:
    m.bookmark("1 · Ring Passage", { x: 0.85, y: 1.66, z: 8.35, yaw: 0.12, pitch: -0.07 });
    m.bookmark("2 · Misty Lightwell", { x: 9.00, y: 1.62, z: 7.90, yaw: -1.57, pitch: 0.01 });
    m.bookmark("3 · Spiral Column", { x: -11.30, y: 1.68, z: 11.30, yaw: 0.25, pitch: 0.02 });
    m.bookmark("4 · Slide & Portholes", { x: -16.00, y: 1.56, z: -4.20, yaw: -0.24, pitch: 0.01 });
  },
};
