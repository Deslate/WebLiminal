// Level 37 · The Poolrooms (v2 Photorealistic Multi-Chamber Showcase).
// Four seamlessly connected, explorable Poolrooms halls built purely with declarative MapBuilder
// primitives (zero custom shaders, zero bitmap assets):
//   1. Ring Passage       — v1-matched continuous tiled ceiling, hidden right-side roofless sky court,
//                           smooth 64-segment circular arches, obsidian foreground framing, crisp white
//                           daylight sunbeam, 3 receding luminous caustic pools & velvety dark tunnel
//   2. Misty Lightwell    — dark tiled corridor opening into bright sunlit volumetric atrium & steel rail
//   3. Spiral Column      — sunlit tiled cylinder, grounded cantilevered spiral stairs, dark arch
//   4. Slide & Portholes  — wet deck, emerald tile dado, backlit pill windows & curved water slide

export default {
  id: "poolrooms-v2",
  title: "Poolrooms · 4-Hall Showcase (v2)",
  subtitle: "BVH PHOTON CAUSTICS · ANALYTIC PORCELAIN · MULTI-BOUNCE GI",
  audio: "poolrooms",
  spawn: { x: 1.02, y: 1.56, z: 6.42, yaw: 0.14, pitch: -0.02 },
  atmosphere: {
    // Near-black fog extinction color: unlit tunnels drop naturally into true velvety darkness,
    // while sunlit/skylit air glows cleanly via subtle BVH-occluded volumetric scattering.
    fogColor: [0.002, 0.004, 0.004],
    fogDensity: 0.0085,
    heightFogFalloff: 0.14,
    skyTop: [0.31, 0.52, 0.88],
    skyHorizon: [0.68, 0.80, 0.97],
    sun: {
      // Exact v1 Ring Passage sun direction (+X right sky court -> slashing diagonally into passage!)
      // Clean crisp neutral daylight (zero heavy yellow cast!).
      direction: [0.75, 0.60, 0.25],
      color: [1.0, 0.975, 0.93],
      intensity: 17.5,
      angularRadius: 0.0060,
    },
    exposure: 0.88,
    bloomStrength: 0.16,
    volumetricStrength: 0.18,
    ambientFloor: 0.00005,
    bounceBoost: 0.94,
    aoRadius: 1.05,
  },

  build(m) {
    // Clean neutral architectural glazed white porcelain on crisp 180 mm (0.18 m) tile module.
    // Satin-glazed porcelain roughness (0.26, matching v1 cleanPorcelain) avoids mirror-wall reflections!
    const whiteTile = m.material({ base: "tile_white", tint: [0.97, 0.98, 0.97], roughness: 0.26, coat: 0.78, tileScale: 1.3889 });
    const ringTile = m.material({ base: "tile_white", tint: [0.97, 0.98, 0.97], roughness: 0.26, coat: 0.78, tileScale: 1.3889 });
    const poolFloor = m.material({ base: "tile_pool", tint: [0.85, 0.96, 0.90], roughness: 0.22, coat: 0.78, tileScale: 1.3889 });
    const plasterMat = m.material({ base: "plaster_warm", tint: [0.93, 0.94, 0.92], roughness: 0.84, coat: 0.02 });
    const dadoGreen = m.material({ base: "tile_dado_green", roughness: 0.20, coat: 0.82, tileScale: 1.25 });
    const frostedWin = m.material({ base: "frosted_window", emissive: [0.96, 0.98, 1.00], emissiveStrength: 16.5 });
    const slideMat = m.material({ base: "fiberglass_slide", roughness: 0.14, coat: 0.92 });
    const steel = m.material({ base: "stainless_steel", roughness: 0.14 });

    // Shared submerged pool floor spanning all four connected halls.
    m.floor(-20.20, -17.20, 22.40, 13.20, 0, poolFloor, { priority: 1.45 });
    m.walkBounds = { minX: -19.40, maxX: 21.60, minZ: -15.80, maxZ: 12.00 };

    // =========================================================================
    // CHAMBER 1: RING PASSAGE (x: -5.40..4.60, z: -16.40..10.20, H1: 4.40 m)
    // Exact v1 architectural lightwell: continuous solid tiled ceiling (sky NEVER visible!),
    // hidden right-side roofless sky court (x: 4.90..7.00, z: -7.20..3.00) with 3 full-height
    // hidden openings behind the right ring piers -> dramatic obsidian foreground framing,
    // crisp white daylight sunbeam across the right wall/rings, 3 receding glowing caustic squares,
    // solid walkable tiled steps against Ring 3, and a velvety dark circular terminal tunnel!
    // =========================================================================
    const H1 = 4.40;
    const courtWallTop = 4.55;
    // South & north end walls of Ring Passage
    m.box([-5.80, 0, 10.20], [5.00, H1, 10.80], whiteTile, { skipFaces: ["ny"] });
    m.box([-5.80, 0, -17.00], [5.00, H1, -16.40], whiteTile, { skipFaces: ["ny"] });

    // Continuous 100% solid tiled ceiling across the entire Ring Passage (zero visible ceiling holes!)
    m.ceiling(-5.40, -16.40, 4.60, 10.20, H1, whiteTile, { priority: 1.25 });

    // West divider wall (x = -5.80..-5.40) between Ring Passage and Chambers 3 & 4
    // Rear doorway to Spiral Column sits further south (z: 6.80..9.80) so Ring 1's front stays obsidian dark!
    m.wallWithDoorway([-5.80, 0, -16.40], [-5.40, H1, 10.20], {
      material: whiteTile,
      openings: [
        { pos: -5.00, width: 2.40, top: 3.20 }, // z: -6.20..-3.80 -> Slide & Porthole Hall
        { pos: 8.30, width: 3.00, top: 3.10 },  // z: 6.80..9.80 -> Spiral Column Basin
      ],
    });

    // East wall (x = 4.60..4.90) with:
    //   - 3 hidden full-height bay openings into the roofless sky court (z = [-6.6..-4.0], [-3.2..-0.6], [0.2..2.8])
    //   - Solid dark pier z = 2.80..6.60 keeping foreground Ring 1 face in dramatic velvety obsidian shadow
    //   - Corridor doorway z = 6.60..9.80 leading east into Chamber 2 (Misty Lightwell)
    m.box([4.60, 0, -16.40], [4.90, H1, -6.60], whiteTile, { skipFaces: ["ny"] });
    m.box([4.60, 0, -4.00], [4.90, H1, -3.20], whiteTile, { skipFaces: ["ny"] });
    m.box([4.60, 0, -0.60], [4.90, H1, 0.20], whiteTile, { skipFaces: ["ny"] });
    m.box([4.60, 0, 2.80], [4.90, H1, 6.60], whiteTile, { skipFaces: ["ny"] });
    m.box([4.60, 3.20, 6.60], [4.90, H1, 9.80], whiteTile, { solid: false, skipFaces: ["py"] });
    m.box([4.60, 0, 9.80], [4.90, H1, 10.20], whiteTile, { skipFaces: ["ny"] });
    // Keep player inside the Ring Passage (prevent wandering out into the narrow sky court)
    m.solids.push({ minX: 4.55, maxX: 4.95, minZ: -7.20, maxZ: 3.00, minY: 0, maxY: H1 });

    // Hidden roofless right-side sky court (x = 4.90..7.00, z = -7.20..3.00)
    m.box([7.00, 0, -7.20], [7.40, courtWallTop, 3.00], whiteTile, { skipFaces: ["ny"], priority: 0.45 });
    m.box([4.90, 0, -7.50], [7.40, courtWallTop, -7.20], whiteTile, { skipFaces: ["ny"], priority: 0.35 });
    m.box([4.90, 0, 3.00], [7.40, courtWallTop, 3.30], whiteTile, { skipFaces: ["ny"], priority: 0.35 });
    m.skylight(4.90, -7.20, 7.00, 3.00, courtWallTop - 0.04, { color: [0.90, 0.95, 1.00], intensity: 2.9 });

    // Invisible vertical daylight portals flush inside the 3 hidden side openings (facing -X into each bay)
    // carrying crisp neutral daylight bounce so shadowed left walls read clean neutral porcelain!
    for (const [oz0, oz1] of [[0.20, 2.80], [-3.20, -0.60], [-6.60, -4.00]]) {
      m.addAreaLight([4.84, 0.44, oz0], [4.84, 0.44, oz1], [4.84, H1 - 0.06, oz0], [0.95, 0.98, 1.00], 1.25, { kind: 1 });
    }

    // Four smooth 64-segment circular rings (exact v1 radius=2.60, axisY=1.35, 0.40 m thick)
    // + one deep smooth dark circular terminal tunnel (z = -16.40..-10.20, radius=2.30)!
    for (const z of [3.00, -0.40, -3.80, -7.20]) {
      m.ringWall([-5.40, 0, z], [4.60, H1, z + 0.40], {
        material: ringTile,
        center: 0.0,
        centerY: 1.35,
        radius: 2.60,
        segments: 64,
        tileModule: 0.18,
        priority: 1.30,
      });
    }
    m.ringWall([-5.40, 0, -16.40], [4.60, H1, -10.20], {
      material: ringTile,
      center: 0.0,
      centerY: 1.35,
      radius: 2.30,
      segments: 64,
      tileModule: 0.18,
      priority: 0.70,
    });

    // Solid walkable tiled staircase tucked flush against Ring 3 on the left (visible through Ring 2):
    // Matches v1's 3 chunky visible architectural steps above water (y=1.08, 0.90, 0.60, ending at x=-2.60)
    // plus a submerged underwater entry step (y=0.30) and smooth walkable ramp from the pool floor!
    m.box([-5.40, 0, -3.40], [-3.24, 1.08, -2.50], whiteTile, { walkable: true, skipFaces: ["nx", "ny", "nz"] });
    m.stairs([-3.24, 0, -3.40], [-2.28, 0.90, -2.50], "-x", 3, whiteTile);

    // =========================================================================
    // CHAMBER 2: MISTY LIGHTWELL CORRIDOR (x: 4.90..22.00, z: 3.80..12.60, H2: 4.00 m)
    // Dark shadowed narrow tiled corridor opening into bright sunlit volumetric atrium & steel rail!
    // =========================================================================
    const H2 = 4.00;
    const H2Well = 9.20;
    m.box([4.90, 0, 6.20], [13.40, H2, 6.60], whiteTile, { skipFaces: ["ny", "nx"] });
    m.box([4.90, 0, 9.80], [13.40, H2, 10.20], whiteTile, { skipFaces: ["ny", "nx"] });
    m.ceiling(4.90, 6.60, 13.40, 9.80, H2, whiteTile);
    // Narrow vertical tiled portal piers flush inside corridor (1.40 m wide slot, zero Z-fighting!)
    m.box([12.20, 0, 6.60], [13.40, H2, 7.50], whiteTile, { skipFaces: ["ny", "nz", "py"] });
    m.box([12.20, 0, 8.90], [13.40, H2, 9.80], whiteTile, { skipFaces: ["ny", "pz", "py"] });

    // Fully enclosed misty lightwell atrium (sealed lower west wings behind corridor + full upper shaft!)
    m.box([13.40, 0, 4.00], [13.80, H2, 6.60], whiteTile, { skipFaces: ["ny", "py"] });
    m.box([13.40, 0, 9.80], [13.80, H2, 12.20], whiteTile, { skipFaces: ["ny", "py"] });
    m.box([13.40, H2, 4.00], [13.80, H2Well, 12.20], whiteTile, { solid: false, priority: 0.6 });
    m.box([21.60, 0, 4.00], [22.00, H2Well, 12.20], whiteTile, { skipFaces: ["ny"] });
    m.box([13.40, 0, 3.60], [22.00, H2Well, 4.00], whiteTile, { skipFaces: ["ny"] });
    m.box([13.40, 0, 12.20], [22.00, H2Well, 12.60], whiteTile, { skipFaces: ["ny"] });
    m.skylight(13.80, 4.00, 21.60, 12.20, H2Well - 0.05, { color: [0.95, 0.98, 1.00], intensity: 4.6 });
    // Raised far white tiled terrace + stainless steel handrail
    m.box([17.00, 0, 8.40], [21.60, 1.00, 12.20], whiteTile, { walkable: true, skipFaces: ["ny", "px", "pz"] });
    m.handrail([17.12, 8.52], [21.40, 8.52], 1.00, 0.90, { material: steel, postSpacing: 1.15 });

    // =========================================================================
    // CHAMBER 3: SPIRAL COLUMN BASIN (x: -19.40..-5.80, z: 2.00..12.40, H3: 4.60 m)
    // Sunlit tiled cylindrical column, grounded cantilevered spiral stairs, dark arch!
    // =========================================================================
    const H3 = 4.60;
    m.box([-19.80, 0, 1.40], [-19.40, H3, 12.40], whiteTile, { skipFaces: ["ny"] });
    m.box([-19.80, 0, 12.40], [-5.80, H3, 13.00], whiteTile, { skipFaces: ["ny"] });
    // Close small north/south transition above Ring Passage height
    m.box([-5.80, H1, 2.00], [-5.40, H3, 12.40], whiteTile, { solid: false, skipFaces: ["ny"] });
    // Semicircular dark arch
    m.wallWithArch([-19.40, 0, 1.40], [-5.80, H3, 2.00], {
      material: whiteTile,
      tileModule: 0.18,
      arches: [{ pos: -10.40, radius: 1.60, spring: 0.80 }],
    });
    // Pitch-black sealed chamber behind the low semicircular arch
    m.box([-14.60, 0, -2.80], [-7.00, H3, -2.40], whiteTile, { skipFaces: ["ny"] });
    m.box([-14.60, 0, -2.40], [-14.20, H3, 1.40], whiteTile, { skipFaces: ["ny"] });
    m.box([-7.40, 0, -2.40], [-7.00, H3, 1.40], whiteTile, { skipFaces: ["ny"] });
    m.ceiling(-14.20, -2.40, -7.40, 1.40, H3, whiteTile);

    // Enclosed skylight shaft on the east side so +X sun slashes cleanly across the spiral column & basin!
    m.ceiling(-19.40, 2.00, -5.80, 12.40, H3, whiteTile, {
      holes: [[-9.80, 4.00, -6.20, 11.40]],
    });
    m.box([-10.20, H3, 4.00], [-9.80, H3 + 1.80, 11.40], whiteTile, { solid: false, priority: 0.4 });
    m.box([-6.20, H3, 4.00], [-5.80, H3 + 1.80, 11.40], whiteTile, { solid: false, priority: 0.4 });
    m.box([-10.20, H3, 3.60], [-5.80, H3 + 1.80, 4.00], whiteTile, { solid: false, priority: 0.4 });
    m.box([-10.20, H3, 11.40], [-5.80, H3 + 1.80, 11.80], whiteTile, { solid: false, priority: 0.4 });
    m.skylight(-9.80, 4.00, -6.20, 11.40, H3 + 1.75, { color: [0.94, 0.97, 1.00], intensity: 3.4 });

    // Seamless 48-segment cylindrical tiled column + grounded spiral stairs emerging cleanly from pool floor (y0=0.18 -> ZERO floating steps!)
    m.cylinder(-13.40, 6.20, 0, H3, 1.20, whiteTile, { segments: 48, tileModule: 0.18 });
    m.spiralStairs(-13.40, 6.20, 0.18, H3, 1.18, 2.78, Math.PI * 0.90, Math.PI * 1.48, 24, whiteTile, {
      slabThickness: 0.18,
      tileModule: 0.18,
    });

    // =========================================================================
    // CHAMBER 4: SLIDE & PORTHOLE HALL (x: -19.40..-5.80, z: -16.00..-3.60, H4: 5.80 m)
    // Wet white deck + emerald dado + columns + backlit pill windows & curved water slide!
    // =========================================================================
    const H4 = 5.80;
    const deckY = 0.80;
    m.ceiling(-19.40, -16.00, -5.80, -3.60, H4, plasterMat);
    m.box([-19.80, 0, -3.60], [-5.80, H4, -3.00], whiteTile, { skipFaces: ["ny"] });
    m.box([-5.80, H1, -16.60], [-5.40, H4, -3.00], whiteTile, { solid: false, skipFaces: ["ny"] });
    m.wallWithArch([-19.80, 0, -16.00], [-19.40, H4, -3.60], {
      material: whiteTile,
      tileModule: 0.18,
      arches: [{ pos: -8.60, radius: 1.00, spring: 2.20 }],
    });
    // Real hollow dark alcove behind left arch
    m.box([-22.00, 0, -10.20], [-21.60, 3.60, -7.00], whiteTile, { skipFaces: ["ny"] });
    m.box([-21.60, 0, -10.20], [-19.80, 3.60, -9.80], whiteTile, { skipFaces: ["ny"] });
    m.box([-21.60, 0, -7.40], [-19.80, 3.60, -7.00], whiteTile, { skipFaces: ["ny"] });
    m.ceiling(-21.60, -9.80, -19.80, -7.40, 3.60, plasterMat);
    m.floor(-21.60, -9.80, -19.40, -7.40, deckY, whiteTile, { walkable: true });

    // Raised wet white-tiled walkway deck + flush pool-to-deck access stairs
    m.box([-19.40, 0, -16.00], [-15.20, deckY, -3.60], whiteTile, { walkable: true, skipFaces: ["nx", "ny", "nz", "pz"] });
    m.stairs([-15.20, 0, -4.40], [-13.60, deckY, -3.60], "-x", 4, whiteTile);
    m.box([-19.40, deckY, -16.00], [-19.36, deckY + 0.80, -9.60], dadoGreen, { solid: false, skipFaces: ["nx", "ny"], priority: 0.9 });
    m.box([-19.40, deckY, -7.60], [-19.36, deckY + 0.80, -3.60], dadoGreen, { solid: false, skipFaces: ["nx", "ny"], priority: 0.9 });

    // Row of architectural square columns
    for (const pz of [-6.30, -9.10, -11.90, -14.30]) {
      m.box([-15.80, deckY, pz - 0.30], [-15.20, H4, pz + 0.30], whiteTile, { skipFaces: ["ny", "py"] });
    }

    // Far backlit window wall (clean neutral milk-glass daylight, zero yellow cast)
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
        tileModule: 0.18,
        lightColor: [0.96, 0.98, 1.00],
        lightIntensity: 6.2,
      });
      m.ringWall([wx - 1.20, 3.60, -16.60], [wx + 1.20, H4, -16.00], {
        material: whiteTile,
        center: wx,
        centerY: 4.60,
        radius: 0.50,
        segments: 24,
        tileModule: 0.18,
        glassMaterial: frostedWin,
        glassFacing: "+",
        lightColor: [0.96, 0.98, 1.00],
        lightIntensity: 4.6,
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
    // Grounded plunge catch basin walls
    m.box([-11.60, 0, -13.20], [-5.80, 1.00, -13.00], whiteTile, { skipFaces: ["ny", "px"] });
    m.box([-11.60, 0, -10.20], [-5.80, 1.00, -10.00], whiteTile, { skipFaces: ["ny", "px"] });
    m.box([-11.60, 0, -13.00], [-11.40, 1.00, -10.20], whiteTile, { skipFaces: ["ny", "nz", "pz"] });
    m.handrail([-11.50, -10.10], [-6.00, -10.10], 1.00, 0.80, { material: steel, postSpacing: 1.10 });

    // =========================================================================
    // SINGLE CONTINUOUS PHYSICAL WATER BODY COVERING ALL FOUR HALLS
    // Exact v1 optics: 44 cm shallow water, crystal aquamarine-emerald Beer-Lambert [0.34, 0.075, 0.040],
    // lively 0.018 m finite-depth Neumann ripples + 256x256 FFT dispersive wading Kelvin V-wakes!
    // =========================================================================
    m.water(-19.60, -16.20, 21.80, 12.40, 0.44, {
      absorption: [0.34, 0.075, 0.040],
      waveAmp: 0.018,
      causticStrength: 1.35,
    });

    // Four curated camera bookmarks matching each iconic Poolrooms composition:
    m.bookmark("1 · Ring Passage", { x: 1.02, y: 1.56, z: 6.42, yaw: 0.14, pitch: -0.02 });
    m.bookmark("2 · Misty Lightwell", { x: 8.80, y: 1.62, z: 8.20, yaw: -1.57, pitch: 0.01 });
    m.bookmark("3 · Spiral Column", { x: -11.30, y: 1.68, z: 11.30, yaw: 0.25, pitch: 0.02 });
    m.bookmark("4 · Slide & Portholes", { x: -16.00, y: 1.56, z: -4.20, yaw: -0.24, pitch: 0.01 });
  },
};
