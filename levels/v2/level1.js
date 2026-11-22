// Level 1 · Habitable Zone (Subterranean Concrete Parking Deck & Deep Service Hall).
// Reference-calibrated directly against real underground concrete parking & concrete hall photography:
//   - Oppressive low 3.20 m concrete parking deck with weathered chalky-white columns & monumental
//     flared truncated-pyramid mushroom column capitals (m.flaredCapital) carrying concrete drop-panels
//   - Gritty dark oil-stained rough concrete floor, hairline cracks, weathered yellow painted parking
//     lane lines, and sharp-edged mirror-glossy rainwater puddles (with per-pixel 4-point quad shadows!)
//   - Harsh authentic 4500K pale greenish-white surface-mounted industrial fluorescent battens (zero
//     cartoon neon-green/cyan game flood lighting!), localized EXIT sign, sloped ramp & steel double doors.

export default {
  id: "level1",
  title: "Level 1 · Habitable Zone",
  subtitle: "SUBTERRANEAN CONCRETE",
  audio: "parking",
  spawn: { x: -2.35, y: 1.54, z: 11.40, yaw: -0.15, pitch: -0.04 },
  atmosphere: {
    fogColor: [0.058, 0.060, 0.054], // authentic dusty subterranean air (NOT cartoon cyan fog soup!)
    fogDensity: 0.0072,
    heightFogFalloff: 0.24,
    skyTop: [0.006, 0.007, 0.006],
    skyHorizon: [0.010, 0.011, 0.010],
    sun: null,
    exposure: 1.44,
    bloomStrength: 0.24,
    volumetricStrength: 0.12,
    ambientFloor: 0.004,
    bounceBoost: 1.82,
    aoRadius: 1.75,
  },

  build(m) {
    // Real underground concrete parking garage proportions: oppressive low 3.20 m deck!
    const H = 3.20;
    const DROP_BOT = 2.94; // 0.26 m reinforced concrete drop-panel around each column capital
    const CAP_BOT = 2.26;  // flared truncated-pyramid mushroom capital spans y = 2.26..2.94 m
    const H_SUB = 2.90;    // low concrete service corridor beyond EXIT portal
    const DECK_Y = 0.96;   // raised concrete loading dock (6 exact 0.16 m steps)

    // Authentic dirty concrete & weathered chalky off-white column materials
    const wallConcrete = m.material({ base: "concrete_raw", tint: [1.06, 1.06, 1.00], wetness: 0.24 });
    const hallConcrete = m.material({ base: "concrete_painted", albedo: [0.78, 0.79, 0.76], roughness: 0.82, wetness: 0.16 });
    const ceilingConcrete = m.material({ base: "concrete_raw", tint: [0.84, 0.83, 0.77], roughness: 0.90, wetness: 0.10 });
    const columnWhite = m.material({ base: "concrete_painted", albedo: [0.80, 0.81, 0.76], roughness: 0.76, wetness: 0.20 });
    const wetFloor = m.material({ base: "concrete_floor", wetness: 0.84 });
    const curbYellow = m.material({ base: "concrete_painted", albedo: [0.66, 0.52, 0.15], roughness: 0.66 });
    const steel = m.material({ base: "stainless_steel", roughness: 0.26 });
    const darkSteel = m.material({ base: "dark_metal", albedo: [0.15, 0.16, 0.16], roughness: 0.42 });

    // Authentic harsh 4500K industrial T8 fluorescent battens (0.25 m^2 area -> 52-74 radiance = real 6000 lm dual-T8 output!)
    const col4500 = [0.94, 1.00, 0.89];
    const colSodium = [1.00, 0.78, 0.42];
    const tubeBright = m.material({ base: "fluorescent_panel", emissive: col4500, emissiveStrength: 28.0 });
    const tubeDim = m.material({ base: "fluorescent_panel", emissive: [0.90, 0.96, 0.85], emissiveStrength: 16.0, flicker: 0.42 });
    const tubeSodium = m.material({ base: "fluorescent_panel", emissive: colSodium, emissiveStrength: 24.0 });
    const tubeOff = m.material({ base: "fluorescent_panel", albedo: [0.48, 0.49, 0.46], emissive: [0, 0, 0], emissiveStrength: 0 });

    // Unified walkable bounds spanning BOTH main parking deck and deep concrete service hall
    m.setWalkBounds(-12.0, -20.40, 12.0, 14.40, 0);

    // =========================================================================
    // 1. MAIN SUBTERRANEAN CONCRETE PARKING DECK ([-12..12] x [0..3.20] x [-9.60..14.40])
    // =========================================================================
    m.room([-12.0, 0, -9.60], [12.0, H, 14.40], {
      floor: wetFloor,
      ceiling: ceilingConcrete,
      walls: wallConcrete,
      skipWalls: ["nz"],
      setBounds: false,
    });

    // Twin rows of monumental weathered chalky-white columns with FLARED MUSHROOM CAPITALS
    // (directly matching real subterranean concrete parking photography!)
    const colZs = [9.60, 4.80, 0.00, -4.80];
    for (const px of [-4.40, 4.40]) {
      for (const pz of colZs) {
        const r = 0.34;
        // Chalky off-white painted concrete shaft (0.68 x 0.68 m, y = 0 .. 2.26 m)
        m.box([px - r, 0, pz - r], [px + r, CAP_BOT, pz + r], columnWhite, { skipFaces: ["ny", "py"] });
        // Flared 4-sided truncated-pyramid mushroom capital (0.68 -> 1.56 m across y = 2.26 .. 2.94 m!)
        m.flaredCapital(px, pz, CAP_BOT, DROP_BOT, r, 0.78, columnWhite);
        // Flat concrete slab drop-panel (1.96 x 1.96 m, y = 2.94 .. 3.20 m) meeting ceiling cleanly!
        m.box([px - 0.98, DROP_BOT, pz - 0.98], [px + 0.98, H, pz + 0.98], ceilingConcrete, {
          solid: false,
          skipFaces: ["py"],
          priority: 0.6,
        });
      }
    }

    // Subtle concrete spine beam strips connecting drop-panels along X=-4.40 and X=+4.40
    for (const px of [-4.40, 4.40]) {
      m.box([px - 0.24, DROP_BOT + 0.08, -9.60], [px + 0.24, H, 14.40], ceilingConcrete, {
        solid: false,
        skipFaces: ["py", "nz", "pz"],
        priority: 0.4,
      });
    }

    // =========================================================================
    // 2. EXIT PORTAL WALL (z = -10.20 .. -9.60) & DEEP CONCRETE SERVICE HALL
    // =========================================================================
    m.wallWithDoorway([-12.0, 0, -10.20], [12.0, H, -9.60], {
      material: wallConcrete,
      openings: [
        { pos: 0.0, width: 3.40, top: 2.52 },  // wide central drive-through service portal
        { pos: -8.20, width: 2.10, top: 2.38 }, // left access passage
      ],
    });
    // Heavy dark steel doorway lintel & realistic localized industrial EXIT sign (NOT neon floodlight!)
    m.box([-1.76, 2.48, -10.22], [1.76, 2.56, -9.58], darkSteel, { solid: false, priority: 0.3 });
    m.signLight([-0.34, 2.66, -9.60], [0.34, 2.94, -9.50], "+z", {
      color: [0.12, 0.92, 0.36],
      intensity: 8.5, // realistic localized green sign glow on concrete lintel!
    });

    // Seamless concrete floor spanning right through the 0.60 m portal wall threshold
    m.floor(-12.0, -10.20, 12.0, -9.60, 0, wetFloor, { padOuter: false });

    // Connected Deep Concrete Service Corridor (chalky white-painted board-formed walls like real concrete hall ref!)
    m.room([-12.0, 0, -20.40], [12.0, H_SUB, -10.20], {
      floor: wetFloor,
      ceiling: hallConcrete,
      walls: hallConcrete,
      skipWalls: ["pz"],
      setBounds: false,
    });
    // Concrete ceiling structural ribs across the deep service hall
    for (const z of [-13.00, -16.60]) {
      m.box([-12.0, H_SUB - 0.28, z - 0.16], [12.0, H_SUB, z + 0.16], hallConcrete, { solid: false, skipFaces: ["py", "nx", "px"] });
    }
    // Concrete dividing baffle creating authentic basement corridor depth & side alcove
    m.box([2.20, 0, -16.00], [7.80, H_SUB, -15.40], hallConcrete, { skipFaces: ["ny", "py"] });
    m.box([2.20, 0, -15.40], [7.80, 0.14, -15.20], wallConcrete, { skipFaces: ["ny", "nz"], priority: 0.3 });
    // Heavy matte-dark double steel industrial utility doors centered cleanly on the far north wall (z = -20.40)
    m.box([-7.92, 0, -20.40], [-7.80, 2.34, -20.26], darkSteel, { solid: false, skipFaces: ["nz", "ny"], priority: 0.3 });
    m.box([-5.60, 0, -20.40], [-5.48, 2.34, -20.26], darkSteel, { solid: false, skipFaces: ["nz", "ny"], priority: 0.3 });
    m.box([-7.80, 2.22, -20.40], [-5.60, 2.34, -20.26], darkSteel, { solid: false, skipFaces: ["nz", "nx", "px"], priority: 0.3 });
    m.box([-7.80, 0, -20.40], [-6.71, 2.22, -20.33], darkSteel, { solid: false, skipFaces: ["nz", "ny", "py", "nx"], priority: 0.45 });
    m.box([-6.69, 0, -20.40], [-5.60, 2.22, -20.33], darkSteel, { solid: false, skipFaces: ["nz", "ny", "py", "px"], priority: 0.45 });
    // Twin vertical stainless push-handles on double steel doors
    m.pipe([-6.78, 0.92, -20.28], [-6.78, 1.24, -20.28], 0.014, steel);
    m.pipe([-6.62, 0.92, -20.28], [-6.62, 1.24, -20.28], 0.014, steel);

    // =========================================================================
    // 3. RAISED CONCRETE LOADING MEZZANINE & STAIRS (Right Side, x = 7.40..12.0)
    // =========================================================================
    m.box([7.56, 0, -9.60], [12.0, DECK_Y, 1.20], wallConcrete, { walkable: true, skipFaces: ["ny", "nx", "px", "nz"] });
    m.box([7.40, 0, -9.60], [7.56, DECK_Y - 0.12, 1.20], wallConcrete, { skipFaces: ["ny", "py", "px", "nz"] });
    m.box([7.40, DECK_Y - 0.12, -9.60], [7.56, DECK_Y, 1.20], curbYellow, { walkable: true, skipFaces: ["ny", "px", "nz"], priority: 0.4 });
    m.stairs([7.40, 0, 1.20], [10.00, DECK_Y, 4.80], "-z", 6, wallConcrete);

    // Anchored steel industrial guardrail along loading mezzanine edge
    for (const pz of [-9.30, -6.70, -4.10, -1.50, 1.05]) {
      m.pipe([7.56, DECK_Y, pz], [7.56, DECK_Y + 0.98, pz], 0.024, steel);
    }
    m.pipe([7.56, DECK_Y + 0.96, -9.35], [7.56, DECK_Y + 0.96, 1.10], 0.026, steel);
    m.pipe([7.56, DECK_Y + 0.50, -9.35], [7.56, DECK_Y + 0.50, 1.10], 0.020, steel);

    // Recessed steel loading-bay fire door on east mezzanine wall
    m.box([11.86, DECK_Y, -5.50], [12.0, DECK_Y + 2.16, -5.38], darkSteel, { solid: false, skipFaces: ["px", "ny"], priority: 0.3 });
    m.box([11.86, DECK_Y, -3.72], [12.0, DECK_Y + 2.16, -3.60], darkSteel, { solid: false, skipFaces: ["px", "ny"], priority: 0.3 });
    m.box([11.86, DECK_Y + 2.04, -5.38], [12.0, DECK_Y + 2.16, -3.72], darkSteel, { solid: false, skipFaces: ["px", "nz", "pz"], priority: 0.3 });
    m.box([11.93, DECK_Y, -5.38], [12.0, DECK_Y + 2.04, -3.72], darkSteel, { solid: false, skipFaces: ["px", "ny", "py", "nz", "pz"], priority: 0.45 });

    // =========================================================================
    // 4. PARKING BAY WHEEL-STOPS, WALL VENTS & ANCHORED CEILING CONDUITS
    // =========================================================================
    for (const pz of [7.20, 2.40, -2.40]) {
      m.box([-10.60, 0, pz - 0.14], [-8.20, 0.15, pz + 0.14], ceilingConcrete, { skipFaces: ["ny"], priority: 0.35 });
    }
    m.box([-12.0, 2.18, 1.60], [-11.94, 2.78, 3.00], "vent_grate", { solid: false, skipFaces: ["nx"], priority: 0.3 });
    m.box([-12.0, 2.18, -5.60], [-11.94, 2.78, -4.20], "vent_grate", { solid: false, skipFaces: ["nx"], priority: 0.3 });
    m.box([-12.0, 1.18, 6.80], [-11.84, 1.86, 7.45], darkSteel, { solid: false, skipFaces: ["nx"], priority: 0.3 });

    // Tight ceiling-hugged galvanized steel utility conduits + steel clamp brackets (zero floating pipes!)
    for (const x of [-1.72, -1.46, 1.64]) {
      m.pipe([x, H - 0.16, -9.60], [x, H - 0.16, 14.40], 0.048, steel);
    }
    for (const z of colZs) {
      m.box([-1.86, H - 0.23, z - 0.025], [-1.32, H - 0.20, z + 0.025], darkSteel, { solid: false, priority: 0.12 });
      m.box([-1.83, H - 0.20, z - 0.012], [-1.80, H, z + 0.012], darkSteel, { solid: false, skipFaces: ["ny", "py"], priority: 0.1 });
      m.box([-1.38, H - 0.20, z - 0.012], [-1.35, H, z + 0.012], darkSteel, { solid: false, skipFaces: ["ny", "py"], priority: 0.1 });
      m.box([1.50, H - 0.23, z - 0.025], [1.78, H - 0.20, z + 0.025], darkSteel, { solid: false, priority: 0.12 });
      m.box([1.53, H - 0.20, z - 0.012], [1.56, H, z + 0.012], darkSteel, { solid: false, skipFaces: ["ny", "py"], priority: 0.1 });
      m.box([1.72, H - 0.20, z - 0.012], [1.75, H, z + 0.012], darkSteel, { solid: false, skipFaces: ["ny", "py"], priority: 0.1 });
    }
    // Sub-tunnel ceiling steel conduit run anchored cleanly to H_SUB ceiling
    m.pipe([-1.25, H_SUB - 0.14, -20.40], [-1.25, H_SUB - 0.14, -10.20], 0.042, steel);
    for (const z of [-13.00, -16.60]) {
      m.box([-1.34, H_SUB - 0.20, z - 0.02], [-1.16, H_SUB - 0.18, z + 0.02], darkSteel, { solid: false, priority: 0.1 });
    }

    // =========================================================================
    // 5. HARSH INDUSTRIAL SURFACE-MOUNTED FLUORESCENT BATTENS (real dual-T8 luminous flux!)
    // =========================================================================
    // Central drive aisle: realistic bright highlights on flared white capitals + dramatic dark shadow bays!
    m.tubeLight(0.0, H - 0.14, 11.40, 1.80, "x", { color: col4500, intensity: 58.0, material: tubeBright, hangY: H });
    m.tubeLight(0.0, H - 0.14, 6.20, 1.80, "x", { off: true, material: tubeOff, hangY: H }); // realistic dead fixture!
    m.tubeLight(0.0, H - 0.14, 1.20, 1.80, "x", { color: col4500, intensity: 72.0, material: tubeBright, hangY: H });
    m.tubeLight(0.0, H - 0.14, -4.80, 1.80, "x", { color: [0.90, 0.96, 0.85], intensity: 46.0, material: tubeDim, flicker: 0.42, hangY: H });

    // Left shadowed parking bay: harsh fluorescent light grazing across wet puddles & yellow parking stripes!
    m.tubeLight(-8.20, H - 0.14, 7.20, 1.60, "z", { color: col4500, intensity: 54.0, material: tubeBright, hangY: H });
    m.tubeLight(-8.20, H - 0.14, -4.80, 1.60, "z", { off: true, material: tubeOff, hangY: H });

    // Right loading mezzanine: warm sodium industrial work lamps contrasting against cool 4500K parking aisle
    m.tubeLight(9.40, H - 0.14, -4.20, 1.80, "z", { color: colSodium, intensity: 56.0, material: tubeSodium, hangY: H });
    m.tubeLight(9.40, H - 0.14, 4.80, 1.60, "z", { color: colSodium, intensity: 44.0, material: tubeSodium, hangY: H });

    // Deep Concrete Service Hall: receding cool ceiling battens brightly illuminating the chalky walls & dark steel doors!
    m.tubeLight(-6.70, H_SUB - 0.12, -12.60, 1.50, "x", { color: col4500, intensity: 48.0, material: tubeBright, hangY: H_SUB });
    m.tubeLight(-6.70, H_SUB - 0.12, -15.80, 1.50, "x", { color: col4500, intensity: 52.0, material: tubeBright, hangY: H_SUB });
    m.tubeLight(-6.70, H_SUB - 0.12, -18.90, 1.80, "x", { color: col4500, intensity: 76.0, material: tubeBright, hangY: H_SUB });
    m.tubeLight(0.00, H_SUB - 0.12, -13.60, 1.60, "z", { color: col4500, intensity: 44.0, material: tubeBright, hangY: H_SUB });
    m.tubeLight(5.20, H_SUB - 0.12, -18.20, 1.60, "x", { color: colSodium, intensity: 42.0, material: tubeSodium, hangY: H_SUB });

    // 4 Curated Reference-Matched Photographic Bookmarks
    m.bookmark("1 · Main Drive Aisle", { x: -2.35, y: 1.54, z: 11.40, yaw: -0.15, pitch: -0.04 });
    m.bookmark("2 · Exit Portal & Tunnel", { x: -0.45, y: 1.54, z: -2.40, yaw: -0.05, pitch: -0.02 });
    m.bookmark("3 · Loading Mezzanine", { x: 9.20, y: 2.52, z: -1.80, yaw: 0.85, pitch: -0.12 });
    m.bookmark("4 · Deep Concrete Hall", { x: -6.70, y: 1.54, z: -11.40, yaw: 0.02, pitch: -0.04 });
  },
};
