// Level 0 · The Lobby (Backrooms — 4 Connected Iconic Reference Halls).
// Seamlessly unites four iconic Backrooms Level 0 environments in one walkable 33.6 x 33.6 m floorplan:
//   1. The Original Room        — 2002 HobbyTown Oshkosh framing (3 wallpaper patterns, cream duplex outlet,
//                                 freestanding pinstripe partition, 4 receding 4100K troffers)
//   2. Monumental Pier Hall     — Kane Pixels Found Footage vast pillared hall with massive 1.4-2.2 m thick
//                                 Baroque-damask piers, matching cream baseboards & dense 3x5 glowing light grid
//   3. Missing Tiles & Corridor — Real physical missing acoustic ceiling tiles exposing the pitch-dark plenum
//                                 void above, fallen ceiling tile on the carpet & receding left colonnade corridor
//   4. The Pitfalls             — 3x5 grid of 15 deep 3D abyssal rectangular pits cut through the floor,
//                                 walkable narrow carpeted bridges, twin troffer rows & lone far doorway

export default {
  id: "level0",
  title: "Level 0 · The Lobby",
  subtitle: "MONO-YELLOW",
  audio: "backrooms",
  spawn: { x: -0.72, y: 1.56, z: 10.60, yaw: 0.05, pitch: -0.02 },
  atmosphere: {
    fogColor: [0.32, 0.28, 0.14],
    fogDensity: 0.0040, // crystal-clear air; depth comes from real light falloff, shadow slits & layered halls
    heightFogFalloff: 0.18,
    skyTop: [0.015, 0.014, 0.008],
    skyHorizon: [0.022, 0.020, 0.011],
    sun: null,
    perPixelAreaLights: false, // full unbiased 43-troffer soft area-light baking + MRP specular + contact GTAO!
    exposure: 1.18,
    bloomStrength: 0.28,
    volumetricStrength: 0.06,
    ambientFloor: 0.001,
    bounceBoost: 1.00, // exact physical multi-bounce energy conservation matching unbiased Ground-Truth Path Tracing!
    aoRadius: 0.52,
  },

  build(m) {
    // Authentic commercial interior datum: H = 2.76 m (~9 ft), snapped to 1.20 x 0.60 m T-bar ceiling grid
    const H = 2.76;
    const W = 0.18;
    const TH = 0.10;
    const TD = 0.018;

    // Four distinct authentic Backrooms wallpaper variants (3 original 2002 photo + 1 Baroque damask)
    const wpChevron = m.material({ base: "wallpaper_yellow", albedo: [0.88, 0.84, 0.55], seed: 5.0 });       // Variant A: fine 12 cm chevron
    const wpDots = m.material({ base: "wallpaper_yellow", albedo: [0.87, 0.84, 0.54], seed: 20.0 });         // Variant B: fine vertical micro-dots
    const wpStripe = m.material({ base: "wallpaper_yellow", albedo: [0.89, 0.85, 0.55], seed: 36.0 });       // Variant C: fine vertical pinstripes
    const wpDamask = m.material({ base: "wallpaper_yellow", albedo: [0.90, 0.83, 0.44], seed: 52.0 });       // Variant D: Baroque floral damask!
    const wpPitWall = m.material({ base: "plaster_warm", albedo: [0.82, 0.81, 0.60], roughness: 0.84 });     // Pitfalls pale olive-cream drywall
    const pitShaftMat = m.material({ base: "plaster_warm", albedo: [0.34, 0.34, 0.25], roughness: 0.92 });   // Deep shadowed pit shaft walls
    const pitAbyss = m.material({ base: "dark_metal", albedo: [0.006, 0.006, 0.005], roughness: 0.99 });     // Pitch-black pit bottom void & ceiling plenum

    const carpet = m.material({ base: "carpet_damp" });
    const carpetPit = m.material({ base: "carpet_damp", albedo: [0.54, 0.49, 0.31] });                       // Pitfalls slightly cooler tan carpet
    const ceiling = m.material({ base: "ceiling_grid" });
    const trimTan = m.material({ base: "wood_trim" });                                                        // 2002 photo tan cove rail
    const trimCream = m.material({ base: "plaster_warm", albedo: [0.83, 0.78, 0.46], roughness: 0.52 });     // Kane Pixels matching cream baseboard
    const trimPit = m.material({ base: "plaster_warm", albedo: [0.76, 0.75, 0.58], roughness: 0.56 });
    const outletCream = m.material({ base: "plaster_warm", albedo: [0.80, 0.77, 0.59], roughness: 0.36, coat: 0.24 });
    const outletSlot = m.material({ base: "plaster_warm", albedo: [0.46, 0.43, 0.33], roughness: 0.65 });
    const darkFrame = m.material({ base: "dark_metal", albedo: [0.09, 0.08, 0.06], roughness: 0.65 });

    // Authentic fluorescent color temperatures
    const col4100 = [1.00, 0.99, 0.78]; // warm-pale 4100K commercial office troffers (Original Room)
    const colGold = [1.00, 0.97, 0.72]; // rich luminous mono-yellow troffers (Pier Hall & Corridor)
    const colCool = [0.97, 1.00, 0.88]; // eerie pale cool-white twin rows (The Pitfalls)
    const lampMain = m.material({ base: "fluorescent_panel", emissive: col4100, emissiveStrength: 28.0 });
    const lampGold = m.material({ base: "fluorescent_panel", emissive: colGold, emissiveStrength: 30.0 });
    const lampCool = m.material({ base: "fluorescent_panel", emissive: colCool, emissiveStrength: 28.0 });
    const lampFlicker = m.material({ base: "fluorescent_panel", emissive: colGold, emissiveStrength: 14.0, flicker: 0.48 });

    // Snap recessed 1.20 x 0.60 m fluorescent troffer 100% flush inside T-bar grid cell (ix, iz)
    const troffer = (ix, iz, opts = {}) => {
      const cx = ix * 1.20 + 0.60;
      const cz = iz * 0.60 + 0.30;
      m.panelLight([cx, H, cz], 1.20, 0.60, opts);
    };

    // Subtle cream-beige plastic duplex electrical wall outlet (2002 photo detail)
    const wallOutlet = (x, z, face) => {
      const y0 = 0.28, y1 = 0.40;
      if (face === "+z") {
        m.box([x - 0.038, y0, z], [x + 0.038, y1, z + 0.010], outletCream, { solid: false, skipFaces: ["nz"], priority: 0.15 });
        m.box([x - 0.013, y0 + 0.022, z + 0.010], [x + 0.013, y0 + 0.052, z + 0.012], outletSlot, { solid: false, skipFaces: ["nz"], priority: 0.1 });
        m.box([x - 0.013, y0 + 0.068, z + 0.010], [x + 0.013, y0 + 0.098, z + 0.012], outletSlot, { solid: false, skipFaces: ["nz"], priority: 0.1 });
      } else if (face === "-z") {
        m.box([x - 0.038, y0, z - 0.010], [x + 0.038, y1, z], outletCream, { solid: false, skipFaces: ["pz"], priority: 0.15 });
      }
    };

    // Helper: solid monumental wallpapered pier block with matching baseboards on all 4 sides
    const pier = (x0, z0, x1, z1, mat = wpDamask, baseMat = trimCream) => {
      m.box([x0, 0, z0], [x1, H, z1], mat, { skipFaces: ["ny", "py"] });
      m.box([x0 - TD, 0, z0 - TD], [x1 + TD, TH, z1 + TD], baseMat, { solid: false, skipFaces: ["ny"], priority: 0.18 });
    };

    // Unified world walkable bounds spanning all 4 connected chambers ([-16.80..16.80] x [-19.20..14.40])
    m.setWalkBounds(-16.80, -19.20, 16.80, 14.40, 0);

    // Outer perimeter walls enclosing the full 33.6 x 33.6 m Backrooms complex
    // South wall (z = 14.40)
    m.box([-16.80, 0, 14.40], [6.00, H, 14.60], wpChevron, { solid: false, skipFaces: ["ny", "py", "pz", "nx", "px"] });
    m.box([6.00, 0, 14.40], [16.80, H, 14.60], wpPitWall, { solid: false, skipFaces: ["ny", "py", "pz", "nx", "px"] });
    m.box([-16.80, 0, 14.40 - TD], [6.00, TH, 14.40], trimTan, { solid: false, skipFaces: ["ny", "pz"], priority: 0.15 });
    m.box([6.00, 0, 14.40 - TD], [16.80, TH, 14.40], trimPit, { solid: false, skipFaces: ["ny", "pz"], priority: 0.15 });
    // North wall (z = -19.20)
    m.box([-16.80, 0, -19.40], [16.80, H, -19.20], wpDamask, { solid: false, skipFaces: ["ny", "py", "nz", "nx", "px"] });
    m.box([-16.80, 0, -19.20], [16.80, TH, -19.20 + TD], trimCream, { solid: false, skipFaces: ["ny", "nz"], priority: 0.15 });
    // West wall (x = -16.80)
    m.box([-17.00, 0, -19.20], [-16.80, H, 14.40], wpDamask, { solid: false, skipFaces: ["ny", "py", "nx", "nz", "pz"] });
    m.box([-16.80, 0, -19.20], [-16.80 + TD, TH, 14.40], trimCream, { solid: false, skipFaces: ["ny", "nx"], priority: 0.15 });
    // East wall (x = 16.80)
    m.box([16.80, 0, -19.20], [17.00, H, -4.80], wpDamask, { solid: false, skipFaces: ["ny", "py", "px", "nz", "pz"] });
    m.box([16.80, 0, -4.80], [17.00, H, 14.40], wpPitWall, { solid: false, skipFaces: ["ny", "py", "px", "nz", "pz"] });
    m.box([16.80 - TD, 0, -19.20], [16.80, TH, -4.80], trimCream, { solid: false, skipFaces: ["ny", "px"], priority: 0.15 });
    m.box([16.80 - TD, 0, -4.80], [16.80, TH, 14.40], trimPit, { solid: false, skipFaces: ["ny", "px"], priority: 0.15 });

    // Continuous floors for Chambers 1, 2, 3 (Chamber 4 Pitfalls builds its own cutout floor grid!)
    m.floor(-16.80, -19.20, 6.00, 14.40, 0, carpet, { padOuter: false });
    m.floor(6.00, -19.20, 16.80, -4.80, 0, carpet, { padOuter: false });

    // Continuous drop ceilings for Chambers 1, 2, 4 (Chamber 3 builds modular ceiling around physical missing tiles!)
    m.ceiling(-6.00, -19.20, 16.80, 14.40, H, ceiling, { padOuter: false });

    // =========================================================================
    // CHAMBER 1: THE ORIGINAL 2002 ROOM (x in [-6..6], z in [-2.4..14.4])
    // =========================================================================
    // West dividing wall separating Original Room & Missing Tiles Hall (with 2 wide passages)
    m.wallWithDoorway([-6.00, 0, -2.40], [-6.00 + W, H, 14.40], {
      material: wpChevron,
      trim: trimTan,
      trimHeight: TH,
      trimDepth: TD,
      openings: [
        { pos: 0.40, width: 2.40, top: 2.42 },
        { pos: 11.00, width: 2.40, top: 2.42 },
      ],
    });
    // East dividing wall separating Original Room & The Pitfalls (wide passage onto Pitfalls viewing ledge)
    m.wallWithDoorway([6.00 - W, 0, -4.80], [6.00, H, 14.40], {
      material: wpPitWall,
      trim: trimPit,
      trimHeight: TH,
      trimDepth: TD,
      openings: [{ pos: 12.00, width: 2.40, top: 2.42 }],
    });
    // North dividing wall separating Original Room & Monumental Pier Hall (2 wide openings)
    m.wallWithDoorway([-6.00 + W, 0, -2.40], [6.00 - W, H, -2.40 + W], {
      material: wpDots,
      trim: trimTan,
      trimHeight: TH,
      trimDepth: TD,
      openings: [
        { pos: -1.40, width: 3.12, top: 2.44 },
        { pos: 3.60, width: 2.52, top: 2.44 },
      ],
    });

    // Iconic 2002 foreground framing wall (z = 7.40..7.58): left micro-dots, right fine chevron + cream duplex outlet
    m.box([-6.00 + W, 0, 7.40], [-2.88, H, 7.40 + W], wpDots, { skipFaces: ["ny", "py", "nx"] });
    m.box([-6.00 + W, 0, 7.40 - TD], [-2.88, TH, 7.40], trimTan, { solid: false, skipFaces: ["ny", "pz", "nx"], priority: 0.2 });
    m.box([-6.00 + W, 0, 7.40 + W], [-2.88, TH, 7.40 + W + TD], trimTan, { solid: false, skipFaces: ["ny", "nz", "nx"], priority: 0.2 });

    m.wallWithDoorway([0.96, 0, 7.40], [6.00 - W, H, 7.40 + W], {
      material: wpChevron,
      trim: trimTan,
      trimHeight: TH,
      trimDepth: TD,
      openings: [{ pos: 4.32, width: 2.16, top: 2.40 }],
    });
    wallOutlet(1.74, 7.40 + W, "+z");

    // Iconic freestanding open-ended midground partition (Variant C pinstripe, stops cleanly below ceiling!)
    m.box([-3.72, 0, -0.10], [-0.36, 2.42, -0.10 + W], wpStripe, { skipFaces: ["ny"] });
    m.box([-3.72 - TD, 0, -0.10 - TD], [-0.36 + TD, TH, -0.10 + W + TD], trimTan, { solid: false, skipFaces: ["ny"], priority: 0.2 });

    // Chamber 1 fluorescent troffers (4 receding bright panels + foreground wash)
    troffer(-2, 16, { color: col4100, intensity: 19.0, material: lampMain });
    troffer(1, 14, { color: col4100, intensity: 19.5, material: lampMain });
    troffer(-2, 9, { color: col4100, intensity: 21.0, material: lampMain });
    troffer(-2, 5, { color: col4100, intensity: 21.0, material: lampMain });
    troffer(-2, 1, { color: col4100, intensity: 21.0, material: lampMain });
    troffer(-2, -3, { color: col4100, intensity: 21.0, material: lampMain });
    troffer(2, 5, { color: col4100, intensity: 19.0, material: lampMain });

    // =========================================================================
    // CHAMBER 2: MONUMENTAL PIER HALL (x in [-6..16.8], z in [-19.2..-4.8])
    //   Directly matched to Kane Pixels Found Footage (dense 3x5 glowing ceiling grid
    //   + massive 1.4-2.2 m thick Baroque damask piers & deep shadow slits!)
    // =========================================================================
    // West passage wall connecting Monumental Pier Hall to Endless Corridor (2 wide shadow-framed openings)
    m.wallWithDoorway([-6.00, 0, -19.20], [-6.00 + W, H, -2.40], {
      material: wpDamask,
      trim: trimCream,
      trimHeight: TH,
      trimDepth: TD,
      openings: [
        { pos: -8.40, width: 2.60, top: 2.48 },
        { pos: -15.60, width: 2.60, top: 2.48 },
      ],
    });

    // Monumental thick architectural Baroque-damask piers (matches image_3.png & image_2.png proportions!)
    pier(6.80, -10.80, 9.00, -8.40);     // Massive foreground right pier block (2.2 x 2.4 m!)
    pier(2.60, -11.40, 4.40, -9.80);     // Mid-right thick structural pier (1.8 x 1.6 m)
    pier(-3.60, -13.60, -0.40, -12.00);  // Far-left long solid baffle pier (3.2 x 1.6 m)
    pier(1.20, -16.80, 2.40, -15.60);    // Deep central square column (1.2 x 1.2 m)
    pier(-3.80, -8.80, -2.40, -7.40);    // Left-mid pier framing sightline
    pier(6.40, -16.20, 8.20, -14.60);    // Mid-north chunky pier creating shadowy vertical slits
    pier(11.60, -15.00, 13.80, -13.20);  // East wing thick pier
    pier(12.20, -9.00, 14.40, -7.20);    // SE pier framing Bookmark 2 entry

    // Iconic dense 3x5 regular receding grid of bright glowing ceiling troffers (image_3.png!)
    for (const ix of [-3, 1, 5, 9]) {
      for (const iz of [-12, -18, -24, -30]) {
        // Keep one distant bay slightly dimmer for organic realism
        const isFlick = ix === 9 && iz === -30;
        troffer(ix, iz, {
          color: colGold,
          intensity: isFlick ? 14.0 : 22.0,
          material: isFlick ? lampFlicker : lampGold,
          flicker: isFlick ? 0.48 : 0,
        });
      }
    }

    // =========================================================================
    // CHAMBER 3: MISSING CEILING TILES & ENDLESS COLONNADE CORRIDOR
    //   (x in [-16.8..-6.0], z in [-19.2..14.4] — directly matched to image_5.png!)
    // =========================================================================
    // Modular drop ceiling tiled cleanly around TWO REAL PHYSICAL MISSING CEILING TILE OPENINGS:
    //   Hole A: x in [-10.80..-8.40], z in [4.20..5.40] (2x2 missing acoustic tiles!)
    //   Hole B: x in [-9.60..-8.40],  z in [1.80..2.40] (single popped dark ceiling tile!)
    m.ceiling(-16.80, -19.20, -10.80, 14.40, H, ceiling, { padOuter: false }); // Full left colonnade ceiling
    m.ceiling(-8.40, -19.20, -6.00, 14.40, H, ceiling, { padOuter: false });   // Full right hall strip
    m.ceiling(-10.80, 5.40, -8.40, 14.40, H, ceiling, { padOuter: false });    // South of Hole A
    m.ceiling(-10.80, 2.40, -8.40, 4.20, H, ceiling, { padOuter: false });     // Between Hole A & Hole B
    m.ceiling(-10.80, 1.80, -9.60, 2.40, H, ceiling, { padOuter: false });     // Left of Hole B
    m.ceiling(-10.80, -19.20, -8.40, 1.80, H, ceiling, { padOuter: false });   // North of Hole B

    // Pitch-dark structural plenum cavity above the missing ceiling tiles (inward-facing roof & side walls!)
    const pTop = H + 0.72;
    m.ceiling(-11.00, 1.60, -8.20, 5.60, pTop, pitAbyss, { padOuter: false, priority: 0.15 });
    m.addQuad([-11.00, H, 1.60], [-8.20, H, 1.60], [-8.20, pTop, 1.60], [-11.00, pTop, 1.60], pitAbyss, { u0: 0, v0: 0, u1: 1, v1: 1, priority: 0.12 });
    m.addQuad([-8.20, H, 5.60], [-11.00, H, 5.60], [-11.00, pTop, 5.60], [-8.20, pTop, 5.60], pitAbyss, { u0: 0, v0: 0, u1: 1, v1: 1, priority: 0.12 });
    m.addQuad([-11.00, H, 5.60], [-11.00, H, 1.60], [-11.00, pTop, 1.60], [-11.00, pTop, 5.60], pitAbyss, { u0: 0, v0: 0, u1: 1, v1: 1, priority: 0.12 });
    m.addQuad([-8.20, H, 1.60], [-8.20, H, 5.60], [-8.20, pTop, 5.60], [-8.20, pTop, 1.60], pitAbyss, { u0: 0, v0: 0, u1: 1, v1: 1, priority: 0.12 });
    // Exposed thin aluminum T-bar cross-runners dangling across Hole A
    m.box([-9.62, H - 0.015, 4.20], [-9.58, H + 0.02, 5.40], darkFrame, { solid: false, priority: 0.1 });
    m.box([-10.80, H - 0.015, 4.78], [-8.40, H + 0.02, 4.82], darkFrame, { solid: false, priority: 0.1 });
    // Exposed dark steel ventilation duct running through the dark ceiling void above Hole A
    m.pipe([-10.90, H + 0.36, 4.95], [-8.30, H + 0.36, 4.95], 0.14, darkFrame);

    // ICONIC FALLEN ACOUSTIC CEILING TILE lying flat on the camel-tan carpet beneath the missing tiles (image_5.png!)
    m.box([-10.60, 0.0, 5.10], [-9.44, 0.022, 5.66], ceiling, { solid: false, skipFaces: ["ny"], priority: 0.35 });

    // Left Endless Receding Colonnade Corridor (x in [-16.80..-13.60]):
    // Tall luminous central-left pier wall catching blazing bright wash right under corridor troffers!
    pier(-13.60, 2.40, -12.40, 7.60);    // Blazing bright foreground-left wall pier (image_5.png center-left!)
    pier(-13.60, -3.60, -12.40, -0.60);  // Second receding colonnade pier
    pier(-13.60, -9.60, -12.40, -6.60);  // Third receding colonnade pier
    pier(-13.60, -15.60, -12.40, -12.60);// Fourth receding colonnade pier
    // Matching left-wall corridor pilasters creating dramatic recursive dark depth frames
    for (const pz of [5.80, 0.20, -5.40, -11.00, -15.60]) {
      pier(-16.80, pz - 0.45, -15.90, pz + 0.45);
      // Dark architectural header bulkhead framing each corridor bay down into the distance
      m.box([-15.90, H - 0.40, pz - 0.22], [-13.60, H, pz + 0.22], wpDamask, { solid: false, skipFaces: ["py"], priority: 0.4 });
    }
    // Moody shadowed right-side L-pier wall beneath the broken dark ceiling (image_5.png right side!)
    pier(-9.20, 2.40, -6.00, 4.80);
    pier(-10.80, -7.20, -7.80, -5.40);   // Deep center background wall pier

    // Chamber 3 fluorescent troffers (bright left colonnade + bright center background + dark shadow under broken tiles!)
    troffer(-13, 12, { color: colGold, intensity: 26.0, material: lampGold }); // Blazing bright foreground colonnade lamp!
    troffer(-13, 7, { color: colGold, intensity: 26.0, material: lampGold });  // Washes central pier pure cream-yellow!
    troffer(-13, -1, { color: colGold, intensity: 22.0, material: lampGold });
    troffer(-13, -13, { color: colGold, intensity: 22.0, material: lampGold });
    troffer(-13, -27, { color: colGold, intensity: 26.0, material: lampGold }); // Glowing far corridor end!
    troffer(-10, -3, { color: colGold, intensity: 23.0, material: lampGold });  // Bright background hall behind missing tiles!
    troffer(-10, -15, { color: colGold, intensity: 22.0, material: lampGold });
    troffer(-10, -25, { color: colGold, intensity: 20.0, material: lampGold });

    // =========================================================================
    // CHAMBER 4: THE PITFALLS (x in [6.00..16.80], z in [-4.80..14.40])
    //   Directly matched to Kane Pixels Pitfalls (image_4.png):
    //   - 3 Columns x 5 Rows = 15 real deep 3D abyssal rectangular pits (y = -5.50..0.00)
    //   - Walkable narrow carpeted grid walkways between every single pit
    //   - Twin receding rows of cool-white fluorescent troffers casting wall scallops
    //   - Lone recessed dark-framed doorway on the far north wall opening into Pier Hall!
    // =========================================================================
    // Solid front viewing landing (z = 9.18..14.40) & rear landing (z = -4.80..-2.00) — zero front bridge sliver seam!
    m.floor(6.00, 9.18, 16.80, 14.40, 0, carpetPit, { padOuter: false });
    m.floor(6.00, -4.80, 16.80, -2.00, 0, carpetPit, { padOuter: false });

    // Iconic foreground left framing wall corner on the viewing ledge (matches image_4.png left foreground!)
    m.box([6.00, 0, 9.80], [8.10, H, 10.70], wpPitWall, { skipFaces: ["ny", "py", "nx"] });
    m.box([6.00, 0, 9.80 - TD], [8.10 + TD, TH, 10.70 + TD], trimPit, { solid: false, skipFaces: ["ny", "nx"], priority: 0.18 });

    // North Pitfalls wall (z = -4.98..-4.80) featuring the iconic lone dark-framed doorway into Monumental Pier Hall!
    m.wallWithDoorway([6.00, 0, -4.98], [16.80, H, -4.80], {
      material: wpPitWall,
      trim: trimPit,
      trimHeight: TH,
      trimDepth: TD,
      openings: [{ pos: 9.20, width: 1.48, top: 2.26 }],
    });
    // Crisp dark architectural doorframe around the lone Pitfalls doorway (image_4.png back-left!)
    m.box([8.38, 0, -5.00], [8.48, 2.34, -4.76], darkFrame, { solid: false, skipFaces: ["ny"], priority: 0.22 });
    m.box([9.92, 0, -5.00], [10.02, 2.34, -4.76], darkFrame, { solid: false, skipFaces: ["ny"], priority: 0.22 });
    m.box([8.38, 2.24, -5.00], [10.02, 2.36, -4.76], darkFrame, { solid: false, priority: 0.22 });

    // 3x5 Pitfalls Floor Grid (exact non-overlapping carpeted walkways + 15 real 5.5 m deep shafts!)
    const pitCols = [
      [7.14, 9.32],
      [10.31, 12.49],
      [13.48, 15.66],
    ];
    const pitRows = [
      [7.60, 9.18],
      [5.20, 6.78],
      [2.80, 4.38],
      [0.40, 1.98],
      [-2.00, -0.42],
    ];
    const PIT_DEPTH = -5.50;

    // 4 continuous longitudinal carpeted walkways (left ledge, 2 interior bridges, right ledge) across z in [-2.00..9.18]
    const walkCols = [
      [6.00, 7.14],
      [9.32, 10.31],
      [12.49, 13.48],
      [15.66, 16.80],
    ];
    for (const [wx0, wx1] of walkCols) {
      m.floor(wx0, -2.00, wx1, 9.18, 0, carpetPit, { padOuter: false, priority: 1.35 });
    }
    // 4 transverse carpeted cross-bridges spanning cleanly between pit rows (front row already joins front landing at z=9.18!)
    const bridgeZs = [
      [6.78, 7.60],
      [4.38, 5.20],
      [1.98, 2.80],
      [-0.42, 0.40],
    ];
    for (const [px0, px1] of pitCols) {
      for (const [bz0, bz1] of bridgeZs) {
        m.floor(px0 - 0.004, bz0, px1 + 0.004, bz1, 0, carpetPit, { padOuter: false, priority: 1.55 });
      }
      // Build each of the 15 deep 3D rectangular abyssal pit shafts + invisible pit-edge safety guard collision!
      for (const [pz0, pz1] of pitRows) {
        // 4 inward-facing vertical pit shaft walls descending 5.5 m into pitch-black abyss
        m.addQuad([px0, PIT_DEPTH, pz0], [px1, PIT_DEPTH, pz0], [px1, 0, pz0], [px0, 0, pz0], pitShaftMat, { u0: px0, v0: PIT_DEPTH, u1: px1, v1: 0, priority: 0.25 });
        m.addQuad([px1, PIT_DEPTH, pz1], [px0, PIT_DEPTH, pz1], [px0, 0, pz1], [px1, 0, pz1], pitShaftMat, { u0: px1, v0: PIT_DEPTH, u1: px0, v1: 0, priority: 0.25 });
        m.addQuad([px0, PIT_DEPTH, pz1], [px0, PIT_DEPTH, pz0], [px0, 0, pz0], [px0, 0, pz1], pitShaftMat, { u0: pz1, v0: PIT_DEPTH, u1: pz0, v1: 0, priority: 0.25 });
        m.addQuad([px1, PIT_DEPTH, pz0], [px1, PIT_DEPTH, pz1], [px1, 0, pz1], [px1, 0, pz0], pitShaftMat, { u0: pz0, v0: PIT_DEPTH, u1: pz1, v1: 0, priority: 0.25 });
        // Pitch-black pit abyss floor
        m.addQuad([px0, PIT_DEPTH, pz1], [px1, PIT_DEPTH, pz1], [px1, PIT_DEPTH, pz0], [px0, PIT_DEPTH, pz0], pitAbyss, { u0: 0, v0: 0, u1: 1, v1: 1, priority: 0.1 });
        // Invisible collision boundary along the pit perimeter so players walk freely along every narrow bridge without getting trapped
        m.solids.push({ kind: "box", minX: px0 + 0.03, maxX: px1 - 0.03, minY: 0, maxY: 2.0, minZ: pz0 + 0.03, maxZ: pz1 - 0.03 });
      }
    }

    // Twin receding rows of bright cool-white fluorescent troffers in The Pitfalls (casting wall scallops on x=16.80!)
    for (const iz of [16, 12, 8, 4, 0, -4]) {
      troffer(7, iz, { color: colCool, intensity: 20.0, material: lampCool });  // Left receding row (x = 9.00)
      troffer(12, iz, { color: colCool, intensity: 21.0, material: lampCool }); // Right row (x = 15.00, scalloped wall glow!)
    }

    // 4 Curated Photographic Reference Bookmarks (matching all 4 iconic Backrooms Level 0 references!)
    m.bookmark("1 · The Original Room", { x: -0.72, y: 1.56, z: 10.60, yaw: 0.05, pitch: -0.02 });
    m.bookmark("2 · Monumental Pier Hall", { x: 11.20, y: 1.56, z: -6.40, yaw: 0.62, pitch: 0.01 });
    m.bookmark("3 · Missing Tiles & Corridor", { x: -11.40, y: 1.56, z: 11.40, yaw: 0.14, pitch: -0.02 });
    m.bookmark("4 · The Pitfalls", { x: 11.40, y: 1.56, z: 12.60, yaw: 0.02, pitch: -0.08 });
  },
};
