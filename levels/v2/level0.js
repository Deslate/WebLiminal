// Level 0 · The Lobby (Backrooms).
// Reference-calibrated to the original 2002 HobbyTown Oshkosh Backrooms photograph:
//   - Authentic 2.76 m (9 ft) commercial office ceiling height with 1.20 x 0.60 m T-bar drop-ceiling grid
//   - Three period-accurate pale cream-yellow wallpaper patterns (fine 12 cm chevron damask, micro-dot, pinstripe)
//   - Warm camel-tan broadloom commercial carpet, low tan cove base rails & subtle cream plastic wall outlets
//   - Dense receding straight rows of 4100K fluorescent troffers rendered with per-pixel 4-point quad BVH
//     soft shadows + multi-bounce indirect GI (zero murky fog soup, zero blurry Unity lightmap flatness!)

export default {
  id: "level0",
  title: "Level 0 · The Lobby",
  subtitle: "MONO-YELLOW",
  audio: "backrooms",
  spawn: { x: -0.72, y: 1.56, z: 10.60, yaw: 0.05, pitch: -0.02 },
  atmosphere: {
    fogColor: [0.34, 0.31, 0.19],
    fogDensity: 0.0042, // crystal-clear indoor air; depth comes from real light falloff & layered rooms!
    heightFogFalloff: 0.18,
    skyTop: [0.015, 0.014, 0.009],
    skyHorizon: [0.022, 0.020, 0.012],
    sun: null,
    exposure: 1.18,
    bloomStrength: 0.22,
    volumetricStrength: 0.06,
    ambientFloor: 0.003,
    bounceBoost: 1.48,
    aoRadius: 1.35,
  },

  build(m) {
    // Authentic American commercial interior dimensions: H = 2.76 m (~9 ft), 1.20 x 0.60 m ceiling bays
    const H = 2.76;
    const SOFFIT_Y = 2.28;
    const W = 0.18; // realistic commercial stud drywall partition thickness
    const TH = 0.10;
    const TD = 0.018;

    // Three distinct authentic vintage wallpaper patterns (just like the original 2002 photograph!)
    const wpChevron = m.material({ base: "wallpaper_yellow", seed: 5.0 });                                      // Variant A: fine 12 cm chevron damask
    const wpDots = m.material({ base: "wallpaper_yellow", tint: [0.98, 0.99, 0.96], seed: 20.0 });              // Variant B: fine vertical micro-dots
    const wpStripe = m.material({ base: "wallpaper_yellow", tint: [1.01, 1.00, 0.95], seed: 36.0 });            // Variant C: fine vertical pinstripes
    const carpet = m.material({ base: "carpet_damp" });
    const ceiling = m.material({ base: "ceiling_grid" });
    const soffitDrywall = m.material({ base: "plaster_warm", albedo: [0.85, 0.83, 0.66], roughness: 0.86 });
    const trim = m.material({ base: "wood_trim" });
    const outletCream = m.material({ base: "plaster_warm", albedo: [0.80, 0.77, 0.59], roughness: 0.36, coat: 0.24 });
    const outletSlot = m.material({ base: "plaster_warm", albedo: [0.46, 0.43, 0.33], roughness: 0.65 });

    // Authentic 4100K commercial office fluorescent tubes (pale crisp white with subtle sickly green-yellow cast)
    const col4100 = [0.98, 1.00, 0.82];
    const colWarm = [1.00, 0.95, 0.72];
    const lampMain = m.material({ base: "fluorescent_panel", emissive: col4100, emissiveStrength: 24.0 });
    const lampDim = m.material({ base: "fluorescent_panel", emissive: colWarm, emissiveStrength: 15.0 });
    const lampFlicker = m.material({ base: "fluorescent_panel", emissive: colWarm, emissiveStrength: 8.5, flicker: 0.55 });
    const lampOff = m.material({ base: "fluorescent_panel", albedo: [0.58, 0.57, 0.50], emissive: [0, 0, 0], emissiveStrength: 0 });

    // Snap recessed 1.20 x 0.60 m fluorescent troffer 100% flush inside drop-ceiling T-bar grid cell (ix, iz)
    const troffer = (ix, iz, y, opts = {}) => {
      const cx = ix * 1.20 + 0.60;
      const cz = iz * 0.60 + 0.30;
      m.panelLight([cx, y, cz], 1.20, 0.60, opts);
    };

    // Subtle cream-beige plastic duplex electrical wall outlet (matches original 2002 photo!)
    const wallOutlet = (x, z, face) => {
      const y0 = 0.28, y1 = 0.40;
      if (face === "+z") {
        m.box([x - 0.038, y0, z], [x + 0.038, y1, z + 0.010], outletCream, { solid: false, skipFaces: ["nz"], priority: 0.15 });
        m.box([x - 0.013, y0 + 0.022, z + 0.010], [x + 0.013, y0 + 0.052, z + 0.012], outletSlot, { solid: false, skipFaces: ["nz"], priority: 0.1 });
        m.box([x - 0.013, y0 + 0.068, z + 0.010], [x + 0.013, y0 + 0.098, z + 0.012], outletSlot, { solid: false, skipFaces: ["nz"], priority: 0.1 });
      } else if (face === "-z") {
        m.box([x - 0.038, y0, z - 0.010], [x + 0.038, y1, z], outletCream, { solid: false, skipFaces: ["pz"], priority: 0.15 });
      } else if (face === "+x") {
        m.box([x, y0, z - 0.038], [x + 0.010, y1, z + 0.038], outletCream, { solid: false, skipFaces: ["nx"], priority: 0.15 });
      } else {
        m.box([x - 0.010, y0, z - 0.038], [x, y1, z + 0.038], outletCream, { solid: false, skipFaces: ["px"], priority: 0.15 });
      }
    };

    // Outer architectural shell: exact 24 x 48 commercial drop-ceiling tiles ([-14.40..14.40]^2)
    m.room([-14.40, 0, -14.40], [14.40, H, 14.40], {
      floor: carpet,
      ceiling,
      walls: wpChevron,
      trim,
      trimHeight: TH,
      trimDepth: TD,
    });

    // =========================================================================
    // 1. ICONIC FOREGROUND & MIDGROUND PARTITIONS (matched to original 2002 photo!)
    // =========================================================================

    // Iconic foreground asymmetric framing wall (z = 7.40 .. 7.58):
    // Left wing = micro-dot wallpaper; Right wing = fine 12 cm chevron wallpaper with cream wall outlet!
    m.box([-14.40, 0, 7.40], [-2.88, H, 7.40 + W], wpDots, { skipFaces: ["ny", "py", "nx"] });
    m.box([-14.40, 0, 7.40 - TD], [-2.88, TH, 7.40], trim, { solid: false, skipFaces: ["ny", "pz", "nx"], priority: 0.2 });
    m.box([-14.40, 0, 7.40 + W], [-2.88, TH, 7.40 + W + TD], trim, { solid: false, skipFaces: ["ny", "nz", "nx"], priority: 0.2 });

    m.wallWithDoorway([0.96, 0, 7.40], [7.20, H, 7.40 + W], {
      material: wpChevron,
      trim,
      trimHeight: TH,
      trimDepth: TD,
      openings: [{ pos: 5.20, width: 2.28, top: 2.38 }],
    });
    wallOutlet(1.74, 7.40 + W, "+z"); // iconic foreground cream electrical outlet!

    // Iconic open-ended freestanding midground partition wall (x = -3.72 .. -0.36, z = -0.10 .. 0.08)
    // Positioned cleanly behind Panel 3 so ceiling light washes evenly across its pinstripe wallpaper!
    m.box([-3.72, 0, -0.10], [-0.36, 2.42, -0.10 + W], wpStripe, { skipFaces: ["ny"] });
    m.box([-3.72 - TD, 0, -0.10 - TD], [-0.36 + TD, TH, -0.10 + W + TD], trim, { solid: false, skipFaces: ["ny"], priority: 0.2 });

    // Staggered rear partition walls (z = -4.20 .. -4.02 and z = -9.60 .. -9.42)
    m.wallWithDoorway([-5.40 + W, 0, -4.20], [14.40, H, -4.20 + W], {
      material: wpDots,
      trim,
      trimHeight: TH,
      trimDepth: TD,
      openings: [
        { pos: -0.96, width: 3.12, top: 2.40 },
        { pos: 4.56, width: 2.40, top: 2.40 },
        { pos: 10.20, width: 2.40, top: 2.40 },
      ],
    });
    m.wallWithDoorway([-14.40, 0, -9.60], [7.20, H, -9.60 + W], {
      material: wpChevron,
      trim,
      trimHeight: TH,
      trimDepth: TD,
      openings: [
        { pos: -9.60, width: 2.40, top: 2.40 },
        { pos: -2.16, width: 2.88, top: 2.40 },
        { pos: 3.84, width: 2.40, top: 2.40 },
      ],
    });

    // West corridor dividing wall (x = -5.40 .. -5.22): frames the left room + interior pass-through cutout!
    m.wallWithDoorway([-5.40, 0, 7.58], [-5.40 + W, H, 14.40], {
      material: wpDots,
      trim,
      trimHeight: TH,
      trimDepth: TD,
      openings: [{ pos: 10.80, width: 2.40, top: 2.40 }],
    });
    m.wallWithDoorway([-5.40, 0, -9.42], [-5.40 + W, H, 7.40], {
      material: wpChevron,
      trim,
      trimHeight: TH,
      trimDepth: TD,
      openings: [
        { pos: 4.32, width: 2.40, top: 2.40 },
        { pos: -1.80, width: 2.16, bottom: 1.04, top: 2.06 }, // interior pass-through window cutout
        { pos: -6.60, width: 2.40, top: 2.40 },
      ],
    });
    m.box([-5.43, 1.00, -2.88], [-5.19, 1.04, -0.72], trim, { solid: false, priority: 0.3 }); // window sill

    // East wing dividing wall (x = 7.20 .. 7.38): separates the eerie unlit wing
    m.wallWithDoorway([7.20, 0, 7.58], [7.20 + W, H, 14.40], {
      material: wpStripe,
      trim,
      trimHeight: TH,
      trimDepth: TD,
      openings: [{ pos: 10.80, width: 2.40, top: 2.40 }],
    });
    m.wallWithDoorway([7.20, 0, -4.02], [7.20 + W, H, 7.40], {
      material: wpChevron,
      trim,
      trimHeight: TH,
      trimDepth: TD,
      openings: [
        { pos: 3.60, width: 2.40, top: 2.40 },
        { pos: -1.20, width: 2.40, top: 2.40 },
      ],
    });
    m.wallWithDoorway([7.20, 0, -14.40], [7.20 + W, H, -4.20], {
      material: wpDots,
      trim,
      trimHeight: TH,
      trimDepth: TD,
      openings: [{ pos: -9.60, width: 2.40, top: 2.40 }],
    });

    // Waist-high office partition half-wall in central-east bay (x = 1.44 .. 4.56, z = 0.60 .. 0.78)
    m.box([1.44, 0, 0.60], [4.56, 1.12, 0.60 + W], wpChevron, { skipFaces: ["ny", "py"] });
    m.box([1.42, 1.12, 0.57], [4.58, 1.17, 0.60 + W + 0.03], trim, { solid: false, priority: 0.35 });
    m.box([1.44 - TD, 0, 0.60 - TD], [4.56 + TD, TH, 0.60 + W + TD], trim, { solid: false, skipFaces: ["ny"], priority: 0.2 });
    wallOutlet(2.88, 0.60 + W, "+z");

    // =========================================================================
    // 2. LOWERED DRYWALL SOFFIT BULKHEAD (Wall-to-wall across West Corridor, zero floating ends!)
    // =========================================================================
    m.box([-14.40, SOFFIT_Y, -3.60], [-5.40, H, 3.00], soffitDrywall, { solid: false, skipFaces: ["py", "ny", "nx", "px"], priority: 0.65 });
    m.ceiling(-14.40, -3.60, -5.40, 3.00, SOFFIT_Y, ceiling, { padOuter: false, priority: 0.85 });

    // =========================================================================
    // 3. SQUARE STRUCTURAL COLUMNS (0.56 x 0.56 m with flush tan base rails)
    // =========================================================================
    const pillars = [
      [3.36, 4.20],
      [-2.88, -6.60],
      [3.60, -6.60],
      [10.80, 3.00],
      [10.80, -7.20],
      [-9.60, -6.60],
    ];
    for (const [px, pz] of pillars) {
      const r = 0.28;
      m.box([px - r, 0, pz - r], [px + r, H, pz + r], wpChevron, { skipFaces: ["ny", "py"] });
      m.box([px - r - TD, 0, pz - r - TD], [px + r + TD, TH, pz + r + TD], trim, { solid: false, skipFaces: ["ny"], priority: 0.2 });
    }

    // Flush louvered HVAC wall return grates & extra cream outlets
    m.box([-14.40, 2.24, 9.00], [-14.35, 2.58, 9.75], "vent_grate", { solid: false, skipFaces: ["nx"], priority: 0.25 });
    m.box([7.15, 2.24, 5.20], [7.20, 2.58, 5.95], "vent_grate", { solid: false, skipFaces: ["px"], priority: 0.25 });
    wallOutlet(-5.22, 2.20, "+x");
    wallOutlet(7.20, 1.20, "-x");

    // =========================================================================
    // 4. DENSE RECEDING ROWS OF GRID-LOCKED 4100K FLUORESCENT TROFFERS
    //    (100% aligned to 1.20 x 0.60 m T-bar grid; rendered per-pixel with adaptive soft shadows!)
    // =========================================================================
    // Iconic foreground & main central sightline row (4 bright white panels receding straight down the bay!)
    troffer(-2, 16, H, { color: col4100, intensity: 17.0, material: lampMain }); // overhead left-front bay
    troffer(1, 14, H, { color: col4100, intensity: 17.5, material: lampMain });  // washes foreground right chevron wall!
    troffer(-2, 9, H, { color: col4100, intensity: 19.0, material: lampMain });  // Panel 1 in main bay
    troffer(-2, 5, H, { color: col4100, intensity: 19.0, material: lampMain });  // Panel 2 in main bay
    troffer(-2, 1, H, { color: col4100, intensity: 19.0, material: lampMain });  // Panel 3 ahead of midground partition
    troffer(-2, -3, H, { color: col4100, intensity: 19.0, material: lampMain }); // Panel 4 receding into far bay!
    troffer(-2, -10, H, { color: col4100, intensity: 18.0, material: lampMain });
    troffer(-2, -19, H, { color: colWarm, intensity: 16.0, material: lampDim });

    // Parallel east-side lobby row (creates rich asymmetric light pools & highlights across half-wall & columns)
    troffer(2, 9, H, { off: true, material: lampOff }); // eerie burnt-out fixture in foreground grid
    troffer(2, 5, H, { color: col4100, intensity: 17.5, material: lampMain });
    troffer(2, -3, H, { color: col4100, intensity: 17.0, material: lampMain });
    troffer(2, -11, H, { color: colWarm, intensity: 15.0, material: lampDim });
    troffer(2, -19, H, { color: colWarm, intensity: 14.0, material: lampDim });

    // West Lowered-Soffit Hall (flush troffers mounted right into lowered soffit at SOFFIT_Y = 2.28 m!)
    troffer(-9, 15, H, { color: colWarm, intensity: 15.0, material: lampDim });
    troffer(-9, 9, H, { color: col4100, intensity: 16.5, material: lampMain });
    troffer(-9, 3, SOFFIT_Y, { color: col4100, intensity: 16.0, material: lampMain });
    troffer(-9, -2, SOFFIT_Y, { color: colWarm, intensity: 10.0, material: lampFlicker, flicker: 0.55 });
    troffer(-9, -11, H, { color: colWarm, intensity: 15.0, material: lampDim });
    troffer(-9, -19, H, { color: colWarm, intensity: 11.0, material: lampFlicker, flicker: 0.40 });

    // East Unlit Shadow Wing: deliberately dead dark ceiling panels illuminated purely by indirect GI spill!
    troffer(8, 15, H, { off: true, material: lampOff });
    troffer(8, 5, H, { off: true, material: lampOff });
    troffer(8, -5, H, { off: true, material: lampOff });
    troffer(8, -17, H, { color: colWarm, intensity: 9.0, material: lampFlicker, flicker: 0.35 });

    // 4 Curated Reference-Matched Photographic Bookmarks
    m.bookmark("1 · The Original Room", { x: -0.72, y: 1.56, z: 10.60, yaw: 0.05, pitch: -0.02 });
    m.bookmark("2 · Lowered Soffit Hall", { x: -9.60, y: 1.56, z: 6.20, yaw: -0.02, pitch: -0.02 });
    m.bookmark("3 · Half-Wall & Pillars", { x: 4.80, y: 1.56, z: 4.60, yaw: 0.58, pitch: -0.03 });
    m.bookmark("4 · The Unlit Wing", { x: 10.60, y: 1.56, z: 0.60, yaw: 1.32, pitch: -0.02 });
  },
};
