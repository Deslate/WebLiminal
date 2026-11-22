// Level 0 · The Lobby (Backrooms).
// Zero water, zero custom shaders: built to exact 1.20 x 0.60 m commercial office ceiling
// & 0.60 m wallpaper roll modules with recessed grid-locked fluorescent troffers, lowered
// drywall soffit bulkheads, pass-through cutouts, half-walls, and eerie unlit side wings.

export default {
  id: "level0",
  title: "Level 0 · The Lobby",
  subtitle: "MONO-YELLOW",
  audio: "backrooms",
  spawn: { x: -0.60, y: 1.62, z: 10.80, yaw: 0.08, pitch: -0.02 },
  atmosphere: {
    fogColor: [0.21, 0.175, 0.072],
    fogDensity: 0.015,
    heightFogFalloff: 0.22,
    skyTop: [0.012, 0.011, 0.006],
    skyHorizon: [0.018, 0.016, 0.008],
    sun: null,
    exposure: 1.26,
    bloomStrength: 0.26,
    volumetricStrength: 0.20,
    ambientFloor: 0.004,
    bounceBoost: 1.58,
    aoRadius: 1.45,
  },

  build(m) {
    // Exact commercial office module: 1.20 m (X) x 0.60 m (Z) drop-ceiling grid, H = 3.00 m
    const H = 3.00;
    const SOFFIT_Y = 2.40;
    const W = 0.24; // clean double-stud partition thickness
    const TH = 0.12;
    const TD = 0.024;

    const wallpaper = m.material({ base: "wallpaper_yellow", tint: [1.04, 0.98, 0.84] });
    const wallpaperAlt = m.material({ base: "wallpaper_yellow", tint: [0.97, 0.92, 0.78], seed: 21.4 });
    const carpet = m.material({ base: "carpet_damp", tint: [1.02, 0.94, 0.78] });
    const ceiling = m.material({ base: "ceiling_grid", tint: [1.02, 0.98, 0.86] });
    const soffitPlaster = m.material({ base: "plaster_warm", tint: [0.96, 0.90, 0.68], roughness: 0.86 });
    const trim = m.material({ base: "wood_trim", tint: [0.84, 0.76, 0.66] });
    const outletMetal = m.material({ base: "dark_metal", albedo: [0.22, 0.21, 0.19], roughness: 0.45 });

    // Shared fluorescent diffuser material layers (fast startup bake, warm authentic 4000K-3500K tones)
    const lampBright = m.material({ base: "fluorescent_panel", emissive: [1.0, 0.94, 0.70], emissiveStrength: 22.0 });
    const lampWarm = m.material({ base: "fluorescent_panel", emissive: [1.0, 0.90, 0.62], emissiveStrength: 16.0 });
    const lampFlicker = m.material({ base: "fluorescent_panel", emissive: [0.98, 0.86, 0.54], emissiveStrength: 9.0, flicker: 0.55 });
    const lampOff = m.material({ base: "fluorescent_panel", albedo: [0.54, 0.52, 0.45], emissive: [0, 0, 0], emissiveStrength: 0 });

    // Helper: snap recessed troffer 100% flush inside commercial 1.20 x 0.60 m drop-ceiling bay (ix, iz)
    const troffer = (ix, iz, y, opts = {}) => {
      const cx = ix * 1.20 + 0.60;
      const cz = iz * 0.60 + 0.30;
      m.panelLight([cx, y, cz], 1.20, 0.60, opts);
    };

    // Helper: flush wall-mounted duplex electrical outlet above baseboard (zero floating or Z-fighting)
    const wallOutlet = (x, z, face) => {
      const y0 = 0.30, y1 = 0.43;
      if (face === "+z") m.box([x - 0.045, y0, z], [x + 0.045, y1, z + 0.015], outletMetal, { solid: false, skipFaces: ["nz"], priority: 0.15 });
      else if (face === "-z") m.box([x - 0.045, y0, z - 0.015], [x + 0.045, y1, z], outletMetal, { solid: false, skipFaces: ["pz"], priority: 0.15 });
      else if (face === "+x") m.box([x, y0, z - 0.045], [x + 0.015, y1, z + 0.045], outletMetal, { solid: false, skipFaces: ["nx"], priority: 0.15 });
      else m.box([x - 0.015, y0, z - 0.045], [x, y1, z + 0.045], outletMetal, { solid: false, skipFaces: ["px"], priority: 0.15 });
    };

    // Outer architectural shell: exact 24 x 48 commercial drop-ceiling tiles ([-14.4..14.4]^2)
    m.room([-14.40, 0, -14.40], [14.40, H, 14.40], {
      floor: carpet,
      ceiling,
      walls: wallpaper,
      trim,
      trimHeight: TH,
      trimDepth: TD,
    });

    // =========================================================================
    // 1. PRIMARY ASYMMETRIC PARTITION WALLS (all T-junctions flush, zero overlap!)
    // =========================================================================

    // Front lobby dividing wall (z = 4.20 .. 4.44): frames the iconic twin-opening entry view
    m.wallWithDoorway([-14.40, 0, 4.20], [7.20, H, 4.20 + W], {
      material: wallpaper,
      trim,
      trimHeight: TH,
      trimDepth: TD,
      openings: [
        { pos: -9.60, width: 2.64, top: 2.52 }, // left corridor passage
        { pos: -1.80, width: 3.12, top: 2.52 }, // iconic wide central opening
        { pos: 4.44, width: 2.40, top: 2.52 },  // right bay entry
      ],
    });

    // Mid-depth staggered partition wall (z = -1.80 .. -1.56): offset openings create layered Backrooms depth
    m.wallWithDoorway([-5.40 + W, 0, -1.80], [14.40, H, -1.80 + W], {
      material: wallpaperAlt,
      trim,
      trimHeight: TH,
      trimDepth: TD,
      openings: [
        { pos: 0.60, width: 3.00, top: 2.52 },  // offset right of foreground opening -> classic depth peek
        { pos: 8.64, width: 2.40, top: 2.52 },  // into unlit east wing
      ],
    });

    // Deep northern maze wall (z = -7.80 .. -7.56)
    m.wallWithDoorway([-14.40, 0, -7.80], [7.20, H, -7.80 + W], {
      material: wallpaper,
      trim,
      trimHeight: TH,
      trimDepth: TD,
      openings: [
        { pos: -9.60, width: 2.40, top: 2.52 },
        { pos: -1.20, width: 2.88, top: 2.52 },
        { pos: 4.56, width: 2.16, top: 2.52 },
      ],
    });

    // West corridor dividing wall (x = -5.40 .. -5.16): clean flush segments + iconic interior pass-through window!
    // South segment (z = 4.44 .. 11.40): creates the foreground left partition wing with open return behind player
    m.wallWithDoorway([-5.40, 0, 4.44], [-5.40 + W, H, 11.40], {
      material: wallpaperAlt,
      trim,
      trimHeight: TH,
      trimDepth: TD,
      openings: [{ pos: 8.40, width: 2.40, top: 2.52 }],
    });
    // Middle segment (z = -7.56 .. 4.20): walkable doorway + pass-through interior cutout window into main bay
    m.wallWithDoorway([-5.40, 0, -7.56], [-5.40 + W, H, 4.20], {
      material: wallpaper,
      trim,
      trimHeight: TH,
      trimDepth: TD,
      openings: [
        { pos: -4.50, width: 2.40, top: 2.52 },                // walkable passage
        { pos: 1.20, width: 2.16, bottom: 1.08, top: 2.16 },   // classic office pass-through cutout
      ],
    });
    // Clean wood sill on the pass-through window cutout (z = 0.12 .. 2.28, y = 1.04 .. 1.08)
    m.box([-5.43, 1.04, 0.12], [-5.13, 1.08, 2.28], trim, { solid: false, priority: 0.3 });

    // East wing dividing wall (x = 7.20 .. 7.44): separates the dimly lit / unlit east wing from the central lobby
    m.wallWithDoorway([7.20, 0, 4.44], [7.20 + W, H, 14.40], {
      material: wallpaperAlt,
      trim,
      trimHeight: TH,
      trimDepth: TD,
      openings: [{ pos: 9.00, width: 2.40, top: 2.52 }],
    });
    m.wallWithDoorway([7.20, 0, -1.56], [7.20 + W, H, 4.20], {
      material: wallpaper,
      trim,
      trimHeight: TH,
      trimDepth: TD,
      openings: [{ pos: 1.20, width: 2.40, top: 2.52 }],
    });
    m.wallWithDoorway([7.20, 0, -14.40], [7.20 + W, H, -1.80], {
      material: wallpaperAlt,
      trim,
      trimHeight: TH,
      trimDepth: TD,
      openings: [
        { pos: -4.80, width: 2.40, top: 2.52 },
        { pos: -10.80, width: 2.40, top: 2.52 },
      ],
    });

    // Iconic foreground asymmetric stub partitions & waist-high office half-wall
    // Right foreground stub creating layered office nook (x = 3.00 .. 3.24, z = 7.80 .. 11.40)
    m.box([3.00, 0, 7.80], [3.00 + W, H, 11.40], wallpaperAlt, { skipFaces: ["ny", "py"] });
    m.box([3.00 - TD, 0, 7.80 - TD], [3.00 + W + TD, TH, 11.40 + TD], trim, { solid: false, skipFaces: ["ny"], priority: 0.2 });

    // Waist-high commercial partition half-wall in central bay (x = 0.00 .. 3.60, z = -4.80 .. -4.56)
    m.box([0.00, 0, -4.80], [3.60, 1.14, -4.56], wallpaper, { skipFaces: ["ny", "py"] });
    m.box([-0.02, 1.14, -4.83], [3.62, 1.19, -4.53], trim, { solid: false, priority: 0.35 }); // wood cap rail
    m.box([-TD, 0, -4.80 - TD], [3.60 + TD, TH, -4.56 + TD], trim, { solid: false, skipFaces: ["ny"], priority: 0.2 });

    // Far-north deep partition spur (x = -4.80 .. -4.56, z = -14.40 .. -10.20)
    m.box([-4.80, 0, -14.40], [-4.80 + W, H, -10.20], wallpaperAlt, { skipFaces: ["ny", "py", "nz"] });
    m.box([-4.80 - TD, 0, -14.40], [-4.80 + W + TD, TH, -10.20 + TD], trim, { solid: false, skipFaces: ["ny", "nz"], priority: 0.2 });

    // =========================================================================
    // 2. LOWERED STRUCTURAL DRYWALL SOFFIT BULKHEADS (classic Backrooms detail!)
    // =========================================================================
    // Midground lowered ceiling beam spanning across central bay (z = 1.80 .. 2.40, y = 2.40 .. 3.00)
    m.box([-5.16, SOFFIT_Y, 1.80], [7.20, H, 2.40], soffitPlaster, { solid: false, skipFaces: ["py", "nx", "px"], priority: 0.65 });
    // Lowered ceiling bulkhead along the west corridor: smooth drywall vertical fascia + acoustic grid underside!
    m.box([-12.00, SOFFIT_Y, -1.80], [-7.20, H, 3.60], soffitPlaster, { solid: false, skipFaces: ["py", "ny"], priority: 0.65 });
    m.ceiling(-12.00, -1.80, -7.20, 3.60, SOFFIT_Y, ceiling, { padOuter: false, priority: 0.85 });

    // =========================================================================
    // 3. SQUARE STRUCTURAL COLUMNS (0.64 x 0.64 m with flush baseboards)
    // =========================================================================
    const pillars = [
      [-3.12, 8.40],
      [-2.40, 1.20],
      [3.60, 0.60],
      [-2.40, -4.80],
      [10.80, 6.00],
      [10.80, -5.40],
      [-9.60, -4.80],
      [0.60, -11.40],
    ];
    for (const [px, pz] of pillars) {
      const r = 0.32;
      m.box([px - r, 0, pz - r], [px + r, H, pz + r], wallpaper, { skipFaces: ["ny", "py"] });
      m.box([px - r - TD, 0, pz - r - TD], [px + r + TD, TH, pz + r + TD], trim, { solid: false, skipFaces: ["ny"], priority: 0.22 });
    }

    // =========================================================================
    // 4. WALL DETAILS (flush HVAC louvered grates & metal electrical outlets)
    // =========================================================================
    m.box([-14.40, 2.38, 6.00], [-14.35, 2.74, 6.80], "vent_grate", { solid: false, skipFaces: ["nx"], priority: 0.25 });
    m.box([7.15, 2.38, 9.60], [7.20, 2.74, 10.40], "vent_grate", { solid: false, skipFaces: ["px"], priority: 0.25 });
    m.box([-5.16, 2.38, -2.80], [-5.11, 2.74, -2.00], "vent_grate", { solid: false, skipFaces: ["nx"], priority: 0.25 });

    wallOutlet(-0.20, 4.44, "+z");
    wallOutlet(2.60, 4.44, "+z");
    wallOutlet(-5.16, 6.00, "+x");
    wallOutlet(3.00, 9.60, "-x");
    wallOutlet(-2.08, 1.20, "+x");
    wallOutlet(0.80, -4.56, "+z");
    wallOutlet(-5.40, 2.40, "-x");

    // =========================================================================
    // 5. GRID-ALIGNED 1.20 x 0.60 m RECESSED FLUORESCENT TROFFER ARRAY
    //    Every single fixture snaps 100% inside a commercial drop-ceiling cell!
    // =========================================================================
    // Foreground Classic Lobby (bright iconic warm fluorescent grid + 1 eerie dead panel!)
    troffer(-2, 19, H, { color: [1.0, 0.94, 0.70], intensity: 22.0, material: lampBright });
    troffer(1, 19, H, { color: [1.0, 0.94, 0.70], intensity: 22.0, material: lampBright });
    troffer(-2, 13, H, { color: [1.0, 0.94, 0.70], intensity: 22.0, material: lampBright });
    troffer(1, 13, H, { off: true, material: lampOff }); // eerie burnt-out fluorescent fixture!
    troffer(4, 15, H, { color: [1.0, 0.90, 0.62], intensity: 16.0, material: lampWarm });

    // Central Twin-Pillar & Half-Wall Expanse
    troffer(-2, 5, H, { color: [1.0, 0.94, 0.70], intensity: 22.0, material: lampBright });
    troffer(1, 5, H, { color: [1.0, 0.94, 0.70], intensity: 22.0, material: lampBright });
    troffer(4, 1, H, { color: [1.0, 0.90, 0.62], intensity: 16.0, material: lampWarm });
    troffer(-2, -6, H, { color: [1.0, 0.94, 0.70], intensity: 22.0, material: lampBright });
    troffer(2, -6, H, { color: [1.0, 0.90, 0.62], intensity: 16.0, material: lampWarm });

    // West Lowered-Soffit Corridor (flush troffers mounted right into lowered soffit at SOFFIT_Y!)
    troffer(-9, 14, H, { color: [1.0, 0.90, 0.62], intensity: 16.0, material: lampWarm });
    troffer(-9, 4, SOFFIT_Y, { color: [1.0, 0.94, 0.70], intensity: 18.0, material: lampBright });
    troffer(-9, -1, SOFFIT_Y, { color: [0.98, 0.86, 0.54], intensity: 9.0, material: lampFlicker, flicker: 0.55 });
    troffer(-9, -9, H, { color: [1.0, 0.90, 0.62], intensity: 15.0, material: lampWarm });

    // Far North Deep Maze Bays
    troffer(-2, -17, H, { color: [1.0, 0.94, 0.70], intensity: 20.0, material: lampBright });
    troffer(3, -17, H, { color: [1.0, 0.90, 0.62], intensity: 15.0, material: lampWarm });
    troffer(-9, -17, H, { color: [0.98, 0.86, 0.54], intensity: 8.5, material: lampFlicker, flicker: 0.40 });

    // East Unlit Shadow Wing: deliberately dead fixtures (illuminated purely by mono-yellow GI spill!)
    troffer(8, 13, H, { off: true, material: lampOff });
    troffer(8, 3, H, { off: true, material: lampOff });
    troffer(8, -7, H, { off: true, material: lampOff });
    troffer(8, -17, H, { color: [0.98, 0.86, 0.54], intensity: 9.0, material: lampFlicker, flicker: 0.35 });

    // 4 Curated Photographic Bookmarks
    m.bookmark("1 · The Classic Lobby", { x: -0.60, y: 1.62, z: 10.80, yaw: 0.08, pitch: -0.02 });
    m.bookmark("2 · Lowered Soffit Hall", { x: -9.60, y: 1.62, z: 6.40, yaw: -0.03, pitch: -0.02 });
    m.bookmark("3 · Pillars & Half-Wall", { x: 2.80, y: 1.62, z: 2.20, yaw: 0.44, pitch: -0.03 });
    m.bookmark("4 · The Unlit Wing", { x: 10.80, y: 1.62, z: -2.60, yaw: 1.18, pitch: -0.02 });
  },
};
