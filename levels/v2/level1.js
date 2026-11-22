// Level 1 · Habitable Zone (Subterranean Concrete Parking Deck & Deep Service Tunnel).
// Zero water simulation — showcases non-repeating mirror-glossy wet concrete puddles with
// deterministic BVH reflections, 1.20 m/2.40 m architectural concrete formwork & structural
// column capitals, anchored pipe racks & suspended cages, glowing EXIT portal, and deep cross-tunnel.

export default {
  id: "level1",
  title: "Level 1 · Habitable Zone",
  subtitle: "SUBTERRANEAN CONCRETE",
  audio: "parking",
  spawn: { x: 0.25, y: 1.65, z: 12.20, yaw: 0.04, pitch: -0.05 },
  atmosphere: {
    fogColor: [0.034, 0.044, 0.048],
    fogDensity: 0.015,
    heightFogFalloff: 0.26,
    skyTop: [0.006, 0.008, 0.010],
    skyHorizon: [0.012, 0.015, 0.018],
    sun: null,
    exposure: 1.24,
    bloomStrength: 0.34,
    volumetricStrength: 0.28,
    ambientFloor: 0.004,
    bounceBoost: 1.38,
    aoRadius: 1.9,
  },

  build(m) {
    const H = 4.40;
    const H_SUB = 3.30;
    const BEAM_BOT = 3.92;
    const CAP_BOT = 3.68;
    const DECK_Y = 1.08; // exact 6 x 0.18 m concrete stair risers

    const wallConcrete = m.material({ base: "concrete_raw", tint: [0.94, 0.97, 0.96], wetness: 0.30 });
    const wetFloor = m.material({ base: "concrete_floor", tint: [0.92, 0.96, 0.98], wetness: 0.88, roughness: 0.54 });
    const ceilingConcrete = m.material({ base: "concrete_raw", tint: [0.76, 0.80, 0.80], roughness: 0.88, wetness: 0.14 });
    const paintedDado = m.material({ base: "concrete_painted", tint: [0.72, 0.78, 0.70], roughness: 0.62 });
    const hazardStripe = m.material({ base: "concrete_painted", albedo: [0.68, 0.54, 0.16], roughness: 0.54 });
    const steel = m.material({ base: "stainless_steel", roughness: 0.18 });
    const darkSteel = m.material({ base: "dark_metal", albedo: [0.16, 0.17, 0.18], roughness: 0.36 });

    const tubeCool = m.material({ base: "fluorescent_panel", emissive: [0.80, 0.94, 1.0], emissiveStrength: 25.0 });
    const tubeFlicker = m.material({ base: "fluorescent_panel", emissive: [0.78, 0.92, 1.0], emissiveStrength: 17.0, flicker: 0.45 });
    const tubeSodium = m.material({ base: "fluorescent_panel", emissive: [1.0, 0.74, 0.34], emissiveStrength: 21.0 });

    // Unified walk bounds covering BOTH Main Concrete Hall (z = -9.60..14.40) and Deep Sub-Tunnel (z = -20.40..-10.20)
    m.setWalkBounds(-12.0, -20.40, 12.0, 14.40, 0);

    // =========================================================================
    // 1. MAIN CONCRETE PARKING HALL ([-12..12] x [0..4.40] x [-9.60..14.40])
    // =========================================================================
    m.room([-12.0, 0, -9.60], [12.0, H, 14.40], {
      floor: wetFloor,
      ceiling: ceilingConcrete,
      walls: wallConcrete,
      skipWalls: ["nz"],
      setBounds: false,
    });

    // Concrete structural cross-beams every 4.80 m (aligned cleanly to 2.40 m floor slab joints!)
    const beamZs = [9.60, 4.80, 0.00, -4.80];
    for (const z of beamZs) {
      m.box([-12.0, BEAM_BOT, z - 0.24], [12.0, H, z + 0.24], ceilingConcrete, {
        solid: false,
        skipFaces: ["py", "nx", "px"],
      });
    }
    // Longitudinal concrete spine girders carrying the cross-beams along the column lines (x = +-4.80)
    for (const px of [-4.80, 4.80]) {
      m.box([px - 0.24, BEAM_BOT + 0.06, -9.60], [px + 0.24, H, 14.40], ceilingConcrete, {
        solid: false,
        skipFaces: ["py", "nz", "pz"],
      });
    }

    // Twin rows of brutalist concrete columns (0.84 x 0.84 m) with FLUSH painted dado, crisp hazard
    // band (zero bloated collars or Z-fighting!), and stepped drop-panel capitals meeting cross-beams!
    for (const px of [-4.80, 4.80]) {
      for (const pz of beamZs) {
        const r = 0.42;
        // Lower painted industrial concrete dado (0.00 .. 1.08 m)
        m.box([px - r, 0, pz - r], [px + r, 1.08, pz + r], paintedDado, { skipFaces: ["ny", "py"] });
        // Crisp flush safety-ochre hazard stripe (1.08 .. 1.20 m)
        m.box([px - r, 1.08, pz - r], [px + r, 1.20, pz + r], hazardStripe, { solid: false, skipFaces: ["ny", "py"], priority: 0.4 });
        // Raw board-formed concrete shaft (1.20 .. 3.68 m)
        m.box([px - r, 1.20, pz - r], [px + r, CAP_BOT, pz + r], wallConcrete, { solid: false, skipFaces: ["ny", "py"] });
        // Stepped drop-panel concrete capital (1.20 x 1.20 m, 3.68 .. 3.92 m) carrying the cross-beam
        m.box([px - 0.60, CAP_BOT, pz - 0.60], [px + 0.60, BEAM_BOT, pz + 0.60], ceilingConcrete, { solid: false, skipFaces: ["py"], priority: 0.5 });
      }
    }

    // =========================================================================
    // 2. REINFORCED EXIT PORTAL WALL (z = -10.20 .. -9.60) & DEEP SUB-TUNNEL
    // =========================================================================
    m.wallWithDoorway([-12.0, 0, -10.20], [12.0, H, -9.60], {
      material: wallConcrete,
      openings: [
        { pos: 0.0, width: 3.60, top: 3.12 },  // monumental central EXIT portal
        { pos: -8.40, width: 2.20, top: 2.76 }, // left maintenance doorway
      ],
    });
    // Heavy dark-steel lintel & jamb casing around central EXIT portal
    m.box([-1.86, 3.06, -10.22], [1.86, 3.16, -9.58], darkSteel, { solid: false, priority: 0.35 });
    // Glowing emerald EXIT sign cleanly centered over portal
    m.signLight([-0.72, 3.28, -9.60], [0.72, 3.74, -9.46], "+z", {
      color: [0.08, 1.0, 0.36],
      intensity: 20.0,
    });

    // Connected Deep Subterranean Utility Cross-Tunnel ([-12..12] x [0..3.30] x [-20.40..-10.20])
    // Plus seamless threshold floor slab spanning z = -10.20..-9.60 right through the portal doorways!
    m.floor(-12.0, -10.20, 12.0, -9.60, 0, wetFloor, { padOuter: false });
    m.room([-12.0, 0, -20.40], [12.0, H_SUB, -10.20], {
      floor: wetFloor,
      ceiling: ceilingConcrete,
      walls: wallConcrete,
      skipWalls: ["pz"],
      setBounds: false,
    });
    // Sub-tunnel ceiling structural ribs (z = -13.20, -16.80)
    for (const z of [-13.20, -16.80]) {
      m.box([-12.0, H_SUB - 0.36, z - 0.18], [12.0, H_SUB, z + 0.18], ceilingConcrete, { solid: false, skipFaces: ["py", "nx", "px"] });
    }
    // Central concrete service baffle dividing the deep cross-tunnel into left/right turning alleys
    m.box([-2.40, 0, -15.90], [4.80, 1.08, -15.30], paintedDado, { skipFaces: ["ny", "py"] });
    m.box([-2.40, 1.08, -15.90], [4.80, 1.20, -15.30], hazardStripe, { solid: false, skipFaces: ["ny", "py"], priority: 0.4 });
    m.box([-2.40, 1.20, -15.90], [4.80, H_SUB, -15.30], wallConcrete, { solid: false, skipFaces: ["ny", "py"] });
    m.box([-2.40, 0.00, -15.30], [4.80, 0.16, -15.06], ceilingConcrete, { skipFaces: ["ny", "nz"], priority: 0.35 }); // base curb along baffle
    // Heavy recessed industrial steel bulkhead door on far north tunnel wall (frame + recessed door leaf, zero overlap)
    m.box([-8.48, 0, -20.40], [-8.34, 2.52, -20.24], darkSteel, { solid: false, skipFaces: ["nz", "ny"], priority: 0.3 });
    m.box([-6.66, 0, -20.40], [-6.52, 2.52, -20.24], darkSteel, { solid: false, skipFaces: ["nz", "ny"], priority: 0.3 });
    m.box([-8.34, 2.38, -20.40], [-6.66, 2.52, -20.24], darkSteel, { solid: false, skipFaces: ["nz", "nx", "px"], priority: 0.3 });
    m.box([-8.34, 0, -20.40], [-6.66, 2.38, -20.32], steel, { solid: false, skipFaces: ["nz", "ny", "py", "nx", "px"], priority: 0.45 });
    // East utility alcove partition in sub-tunnel
    m.box([6.60, 0, -18.00], [7.20, H_SUB, -10.20], wallConcrete, { skipFaces: ["ny", "py", "pz"] });

    // =========================================================================
    // 3. RAISED CONCRETE LOADING MEZZANINE & STAIRS (Right Side, x = 7.20..12.0)
    // =========================================================================
    // Flush non-overlapping loading dock slab + safety-striped drop-off nose along x = 7.20..7.36
    m.box([7.36, 0, -9.60], [12.0, DECK_Y, 1.20], wallConcrete, { walkable: true, skipFaces: ["ny", "nx", "px", "nz"] });
    m.box([7.20, 0, -9.60], [7.36, DECK_Y - 0.12, 1.20], wallConcrete, { skipFaces: ["ny", "py", "px", "nz"] });
    m.box([7.20, DECK_Y - 0.12, -9.60], [7.36, DECK_Y, 1.20], hazardStripe, { walkable: true, skipFaces: ["ny", "px", "nz"], priority: 0.4 });
    // 6 exact 0.18 m concrete stairs climbing smoothly onto the loading mezzanine (z = 1.20..4.80)
    m.stairs([7.20, 0, 1.20], [10.00, DECK_Y, 4.80], "-z", 6, wallConcrete);

    // Anchored stainless steel industrial safety guardrail along mezzanine edge (x = 7.36)
    for (const pz of [-9.30, -6.70, -4.10, -1.50, 1.05]) {
      m.pipe([7.36, DECK_Y, pz], [7.36, DECK_Y + 1.00, pz], 0.026, steel);
    }
    m.pipe([7.36, DECK_Y + 0.98, -9.35], [7.36, DECK_Y + 0.98, 1.10], 0.028, steel);
    m.pipe([7.36, DECK_Y + 0.52, -9.35], [7.36, DECK_Y + 0.52, 1.10], 0.022, steel);

    // Recessed industrial steel loading-bay fire door on the east mezzanine wall (frame + recessed leaf)
    m.box([11.84, DECK_Y, -5.60], [12.0, DECK_Y + 2.38, -5.46], darkSteel, { solid: false, skipFaces: ["px", "ny"], priority: 0.3 });
    m.box([11.84, DECK_Y, -3.74], [12.0, DECK_Y + 2.38, -3.60], darkSteel, { solid: false, skipFaces: ["px", "ny"], priority: 0.3 });
    m.box([11.84, DECK_Y + 2.24, -5.46], [12.0, DECK_Y + 2.38, -3.74], darkSteel, { solid: false, skipFaces: ["px", "nz", "pz"], priority: 0.3 });
    m.box([11.92, DECK_Y, -5.46], [12.0, DECK_Y + 2.24, -3.74], steel, { solid: false, skipFaces: ["px", "ny", "py", "nz", "pz"], priority: 0.45 });

    // =========================================================================
    // 4. PARKING BAY CURBS, FLOOR DRAIN, WALL VENTS & ANCHORED PIPE RACKS
    // =========================================================================
    // Concrete wheel-stop curbs along the shadowed left parking bays
    for (const pz of [7.20, 2.40, -2.40]) {
      m.box([-10.60, 0, pz - 0.14], [-8.20, 0.16, pz + 0.14], ceilingConcrete, { skipFaces: ["ny"], priority: 0.35 });
      m.box([-10.52, 0.14, pz - 0.12], [-8.28, 0.165, pz + 0.12], hazardStripe, { solid: false, skipFaces: ["ny"], priority: 0.25 });
    }

    // Wall-mounted flush louvered HVAC return vents & industrial steel conduit junction boxes
    m.box([-12.0, 2.52, 1.60], [-11.94, 3.24, 3.20], "vent_grate", { solid: false, skipFaces: ["nx"], priority: 0.3 });
    m.box([-12.0, 2.52, -5.60], [-11.94, 3.24, -4.00], "vent_grate", { solid: false, skipFaces: ["nx"], priority: 0.3 });
    m.box([-12.0, 1.25, 6.80], [-11.82, 1.95, 7.50], darkSteel, { solid: false, skipFaces: ["nx"], priority: 0.3 }); // electrical panel box

    // Overhead stainless chilled-water & utility pipe runs (z = -9.60..14.40 at y = 3.68)
    for (const x of [-2.28, -1.92, 2.10]) {
      m.pipe([x, 3.68, -9.60], [x, 3.68, 14.40], 0.072, steel);
    }
    // Anchored steel trapeze hangers clamping the pipe rack solidly up into EVERY concrete cross-beam (zero floating pipes!)
    for (const z of beamZs) {
      // West twin-pipe trapeze (x = -2.48..-1.72)
      m.box([-2.48, 3.57, z - 0.03], [-1.72, 3.61, z + 0.03], darkSteel, { solid: false, priority: 0.15 });
      m.box([-2.44, 3.61, z - 0.015], [-2.40, BEAM_BOT, z + 0.015], darkSteel, { solid: false, skipFaces: ["ny", "py"], priority: 0.12 });
      m.box([-1.76, 3.61, z - 0.015], [-1.72, BEAM_BOT, z + 0.015], darkSteel, { solid: false, skipFaces: ["ny", "py"], priority: 0.12 });
      // East single-pipe trapeze (x = 1.92..2.28)
      m.box([1.92, 3.57, z - 0.03], [2.28, 3.61, z + 0.03], darkSteel, { solid: false, priority: 0.15 });
      m.box([1.95, 3.61, z - 0.015], [1.99, BEAM_BOT, z + 0.015], darkSteel, { solid: false, skipFaces: ["ny", "py"], priority: 0.12 });
      m.box([2.21, 3.61, z - 0.015], [2.25, BEAM_BOT, z + 0.015], darkSteel, { solid: false, skipFaces: ["ny", "py"], priority: 0.12 });
    }
    // Sub-tunnel overhead pipe bundle anchored to H_SUB ceiling ribs
    for (const x of [-1.45, -1.15]) {
      m.pipe([x, H_SUB - 0.50, -20.40], [x, H_SUB - 0.50, -10.20], 0.062, steel);
    }
    for (const z of [-13.20, -16.80]) {
      m.box([-1.60, H_SUB - 0.59, z - 0.025], [-1.00, H_SUB - 0.56, z + 0.025], darkSteel, { solid: false, priority: 0.12 });
      m.box([-1.56, H_SUB - 0.56, z - 0.012], [-1.53, H_SUB - 0.36, z + 0.012], darkSteel, { solid: false, skipFaces: ["ny", "py"], priority: 0.1 });
      m.box([-1.07, H_SUB - 0.56, z - 0.012], [-1.04, H_SUB - 0.36, z + 0.012], darkSteel, { solid: false, skipFaces: ["ny", "py"], priority: 0.1 });
    }

    // =========================================================================
    // 5. SUSPENDED INDUSTRIAL LUMINAIRES (anchored to ceiling via twin steel rods!)
    // =========================================================================
    // Central drive aisle: crisp cool industrial cyan-white fluorescent strips
    m.tubeLight(0.0, 3.72, 12.00, 2.40, "x", { color: [0.80, 0.94, 1.0], intensity: 24.0, material: tubeCool, hangY: H });
    m.tubeLight(0.0, 3.72, 7.20, 2.40, "x", { color: [0.80, 0.94, 1.0], intensity: 25.0, material: tubeCool, hangY: H });
    m.tubeLight(0.0, 3.72, 2.40, 2.40, "x", { color: [0.80, 0.94, 1.0], intensity: 25.0, material: tubeCool, hangY: H });
    m.tubeLight(0.0, 3.72, -2.40, 2.40, "x", { color: [0.78, 0.92, 1.0], intensity: 17.0, material: tubeFlicker, flicker: 0.45, hangY: H });
    m.tubeLight(0.0, 3.72, -7.20, 2.20, "x", { color: [0.78, 0.93, 1.0], intensity: 18.0, material: tubeCool, hangY: H });

    // Side aisles & loading mezzanine: warm amber sodium-vapor industrial lamps (vivid cool/warm puddle reflections!)
    m.tubeLight(-8.40, 3.72, 4.80, 2.00, "z", { color: [1.0, 0.74, 0.34], intensity: 21.0, material: tubeSodium, hangY: H });
    m.tubeLight(-8.40, 3.72, -4.80, 2.00, "z", { color: [0.78, 0.92, 1.0], intensity: 13.0, material: tubeFlicker, flicker: 0.35, hangY: H });
    m.tubeLight(9.40, 3.72, -4.20, 2.20, "z", { color: [1.0, 0.74, 0.34], intensity: 22.0, material: tubeSodium, hangY: H });
    m.tubeLight(9.40, 3.72, 6.00, 2.00, "z", { color: [1.0, 0.74, 0.34], intensity: 18.0, material: tubeSodium, hangY: H });

    // Deep subterranean cross-tunnel: cool entry strip + dramatic warm amber sodium glow around the far turn!
    m.tubeLight(0.0, H_SUB - 0.34, -12.10, 2.00, "x", { color: [0.78, 0.92, 1.0], intensity: 16.0, material: tubeCool, hangY: H_SUB });
    m.tubeLight(-6.60, H_SUB - 0.42, -18.40, 2.00, "z", { color: [1.0, 0.74, 0.34], intensity: 22.0, material: tubeSodium, hangY: H_SUB });
    m.tubeLight(4.20, H_SUB - 0.34, -18.40, 2.00, "x", { color: [1.0, 0.74, 0.34], intensity: 16.0, material: tubeSodium, hangY: H_SUB });

    // 4 Curated Photographic Bookmarks
    m.bookmark("1 · Main Drive Aisle", { x: 0.25, y: 1.65, z: 12.20, yaw: 0.04, pitch: -0.05 });
    m.bookmark("2 · Exit Portal & Tunnel", { x: -0.50, y: 1.65, z: -2.40, yaw: -0.06, pitch: -0.02 });
    m.bookmark("3 · Loading Mezzanine", { x: 9.20, y: 2.73, z: -1.80, yaw: 0.82, pitch: -0.15 });
    m.bookmark("4 · Deep Service Tunnel", { x: -3.20, y: 1.65, z: -12.20, yaw: 0.25, pitch: -0.04 });
  },
};
