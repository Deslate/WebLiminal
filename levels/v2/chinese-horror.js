// Chinese Horror · Old Courtyard Corridor (v2 Hardware-Rasterized + Baked GI Framework).
// Zero bitmap assets: mud-plaster flaking, damp stone sheen, aged charcoal-timber double
// doors, SDF brush calligraphy couplets (富贵由天 / 平安是福), translucent candle wax, and
// flickering floor candlelight are synthesized procedurally at startup and shaded in real time.

export default {
  id: "chinese-horror",
  title: "Old Courtyard Corridor · Chinese Horror",
  subtitle: "NIGHT VIGIL · CANDLE & MOONLIGHT",
  audio: "horror",
  spawn: { x: 0.28, y: 0.94, z: 3.15, yaw: 0.16, pitch: -0.05 },
  atmosphere: {
    sun: null,
    skyTop: [0.012, 0.016, 0.024],
    skyHorizon: [0.020, 0.025, 0.034],
    fogColor: [0.008, 0.009, 0.012],
    fogDensity: 0.032,
    heightFogFalloff: 0.45,
    exposure: 1.18,
    fov: 48,
    bloomStrength: 0.32,
    volumetricStrength: 0.14,
    ambientFloor: 0.0012,
    bounceBoost: 1.35,
    aoRadius: 1.2,
  },

  build(m) {
    const roof = 3.0;
    const minX = -3.8;
    const maxX = 1.55;
    const minZ = -2.2;
    const maxZ = 4.35;
    const leftCourtMinX = -2.55;

    // --- Procedural Material Palette ---
    const plasterWarm = m.material({
      base: "plaster_mud",
      name: "ch_plaster_warm",
      albedo: [0.35, 0.26, 0.17],
      wetness: 0.88,
      seed: 20.0,
    });
    const plasterProtrudingFront = m.material({
      base: "plaster_mud",
      name: "ch_plaster_protruding_front",
      albedo: [0.36, 0.27, 0.18],
      wetness: 0.94,
      seed: 25.0,
    });
    const plasterAshFar = m.material({
      base: "plaster_mud",
      name: "ch_plaster_ash_far",
      albedo: [0.36, 0.36, 0.35],
      wetness: 0.28,
      seed: 24.0,
    });
    const stoneFloor = m.material({
      base: "stone_damp",
      name: "ch_stone_floor",
      albedo: [0.056, 0.048, 0.040],
      roughness: 0.60,
      coat: 0.42,
      wetness: 0.85,
      seed: 21.0,
    });
    const sootDark = m.material({
      base: "concrete_raw",
      name: "ch_soot_dark",
      albedo: [0.008, 0.007, 0.007],
      roughness: 0.96,
      coat: 0.0,
      pomDepth: 0.0,
      wetness: 0.0,
      seed: 29.0,
    });
    const doorWood = m.material({
      base: "wood_plank_aged",
      name: "ch_door_wood",
      albedo: [0.105, 0.098, 0.090],
      roughness: 0.74,
      coat: 0.06,
      seed: 22.0,
    });
    const trimWood = m.material({
      base: "wood_plank_aged",
      name: "ch_trim_wood",
      albedo: [0.036, 0.030, 0.024],
      roughness: 0.82,
      coat: 0.04,
      tileScale: 0.5,
      pomDepth: 0.0,
      wetness: 0.0,
      seed: 23.0,
    });
    const darkIron = m.material({
      base: "dark_metal",
      name: "ch_dark_iron",
      albedo: [0.022, 0.022, 0.024],
      roughness: 0.38,
      metallic: 0.85,
      pomDepth: 0.0,
      seed: 26.0,
    });
    const charredCeramic = m.material({
      base: "concrete_raw",
      name: "ch_charred_ceramic",
      albedo: [0.056, 0.049, 0.043],
      roughness: 0.30,
      coat: 0.52,
      pomDepth: 0.0,
      wetness: 0.0,
      seed: 27.0,
    });
    const incenseAsh = m.material({
      base: "concrete_raw",
      name: "ch_incense_ash",
      albedo: [0.15, 0.14, 0.13],
      roughness: 0.96,
      coat: 0.0,
      pomDepth: 0.0,
      wetness: 0.0,
      seed: 28.0,
    });
    const candleWax = m.material({
      base: "candle_wax",
      name: "ch_candle_wax",
      albedo: [0.85, 0.73, 0.50],
      roughness: 0.42,
      coat: 0.26,
      emissive: [1.0, 0.42, 0.07],
      emissiveStrength: 2.5,
      seed: 24.0,
    });
    const candleFlame = m.material({
      base: "candle_flame",
      name: "ch_candle_flame",
      emissive: [1.0, 0.64, 0.20],
      emissiveStrength: 28.0,
      seed: 0.4,
      flicker: 0.055,
    });

    // Five SDF calligraphy paper panels (baked cleanly into mipmapped PBR layers at startup).
    const coupletLeft = m.material({ base: "couplet_paper", name: "ch_couplet_left", seed: 1.0 });
    const coupletRight = m.material({ base: "couplet_paper", name: "ch_couplet_right", seed: 2.0 });
    const coupletScroll = m.material({ base: "couplet_paper", name: "ch_couplet_scroll", seed: 3.0 });
    const talismanLeft = m.material({ base: "couplet_paper", name: "ch_talisman_left", seed: 4.0 });
    const talismanRight = m.material({ base: "couplet_paper", name: "ch_talisman_right", seed: 5.0 });

    // --- Floor & Dark Soot Ceiling ---
    m.floor(minX - 0.2, minZ - 0.3, maxX + 0.6, maxZ + 0.2, 0.0, stoneFloor, { priority: 1.6 });
    m.ceiling(minX - 0.2, minZ - 0.3, maxX + 0.6, maxZ + 0.2, roof, sootDark, { priority: 0.6 });
    m.setWalkBounds(minX + 0.08, minZ + 0.05, maxX - 0.04, maxZ - 0.05, 0.0);

    // --- Far End Wall (z = -2.20) with Recessed Double Doorway ---
    const doorL = -0.24;
    const doorR = 1.08;
    const doorH = 2.24;
    const doorMid = (doorL + doorR) * 0.5;
    m.box([minX - 0.2, 0.0, minZ - 0.3], [doorL, roof, minZ], plasterAshFar, { solid: true, priority: 1.4 });
    m.box([doorR, 0.0, minZ - 0.3], [maxX + 0.25, roof, minZ], plasterAshFar, { solid: true, priority: 1.2 });
    m.box([doorL, doorH, minZ - 0.3], [doorR, roof, minZ], plasterAshFar, { solid: false, priority: 1.0 });
    // Dark timber backing behind the recessed double door leaves.
    m.box([doorL - 0.1, 0.0, minZ - 0.38], [doorR + 0.1, doorH + 0.08, minZ - 0.26], trimWood, { solid: true, priority: 0.4 });

    // --- Concealed Left Vestibule Wall with Tiny Broken Hole (小破洞) ---
    // Hidden behind the foreground left corridor wall (x = -0.42, z >= 0.0).
    // A small 22 cm x 24 cm breach (z in [-0.64, -0.42], y in [0.76, 1.00]) lets a tight,
    // focused cool beam of night moonlight fall locally onto the lower couplet and doorway.
    m.box([-1.38, 0.0, minZ], [-1.12, roof, -0.64], plasterAshFar, { solid: true, priority: 0.8 });
    m.box([-1.38, 0.0, -0.42], [-1.12, roof, 0.0], plasterWarm, { solid: true, priority: 0.8 });
    m.box([-1.38, 0.0, -0.64], [-1.12, 0.76, -0.42], plasterAshFar, { solid: true, priority: 0.8 });
    m.box([-1.38, 1.00, -0.64], [-1.12, roof, -0.42], plasterAshFar, { solid: false, priority: 0.5 });
    // Keep player inside main corridor (cannot step into the concealed moonlight shaft).
    m.solids.push({ minX: minX, maxX: -1.12, minZ, maxZ: 0.0, minY: 0.0, maxY: roof });
    // Concealed outer court back wall (butts cleanly behind the left corridor wall step at z = 0.0).
    m.box([leftCourtMinX - 0.2, 0.0, minZ - 0.2], [leftCourtMinX, roof, 0.0], sootDark, { solid: false, priority: 0.3 });

    // --- Foreground Left Corridor Wall (Parallel & Opposite Right Wall, Facing +X) ---
    // Runs longitudinally along Z (z in [0.0, maxZ]) so the foreground forms a genuine narrow
    // perspective corridor facing the right wall (x = 1.55), then steps outward at z = 0.0
    // into the moonlit doorway vestibule.
    m.box([minX - 0.2, 0.0, 0.0], [-0.42, roof, maxZ + 0.2], plasterWarm, {
      faces: { px: plasterProtrudingFront },
      solid: true,
      priority: 1.7,
    });
    // Rear corridor wall behind the viewer.
    m.box([-0.42, 0.0, maxZ], [maxX + 0.25, roof, maxZ + 0.25], plasterWarm, { solid: true, priority: 0.6 });

    // --- Right Corridor Wall (x = 1.55) with Recessed Chinese Wooden Lattice Window ---
    const winZ0 = -1.18;
    const winZ1 = 0.38;
    const winY0 = 1.26;
    const winY1 = 2.66;
    m.box([maxX, 0.0, minZ], [maxX + 0.24, roof, winZ0], plasterWarm, { solid: true, priority: 1.1 });
    m.box([maxX, 0.0, winZ1], [maxX + 0.24, roof, maxZ], plasterWarm, { solid: true, priority: 1.1 });
    m.box([maxX, 0.0, winZ0], [maxX + 0.24, winY0, winZ1], plasterWarm, { solid: true, priority: 1.1 });
    m.box([maxX, winY1, winZ0], [maxX + 0.24, roof, winZ1], plasterWarm, { solid: false, priority: 0.6 });
    // Dark night shutter/recess backing sealed cleanly behind the right wooden lattice window.
    m.box([maxX + 0.23, winY0 - 0.15, winZ0 - 0.15], [maxX + 0.45, winY1 + 0.15, winZ1 + 0.15], sootDark, { solid: false, priority: 0.3 });
    // Slim dark timber skirting board along the base of the right corridor wall.
    m.box([maxX - 0.025, 0.0, minZ], [maxX, 0.10, maxZ], trimWood, { solid: false, skipFaces: ["px", "ny"], priority: 0.5 });

    // Traditional Chinese wooden lattice window (outer frame + vertical mullions + horizontal transoms).
    const wf = 0.055;
    m.box([maxX - 0.01, winY0, winZ0], [maxX + 0.22, winY0 + wf, winZ1], trimWood, { solid: false, priority: 0.5 });
    m.box([maxX - 0.01, winY1 - wf, winZ0], [maxX + 0.22, winY1, winZ1], trimWood, { solid: false, priority: 0.5 });
    m.box([maxX - 0.01, winY0 + wf, winZ0], [maxX + 0.22, winY1 - wf, winZ0 + wf], trimWood, { solid: false, priority: 0.5 });
    m.box([maxX - 0.01, winY0 + wf, winZ1 - wf], [maxX + 0.22, winY1 - wf, winZ1], trimWood, { solid: false, priority: 0.5 });
    for (const wz of [-0.82, -0.42, -0.02]) {
      m.box([maxX + 0.04, winY0 + wf, wz - 0.022], [maxX + 0.14, winY1 - wf, wz + 0.022], trimWood, { solid: false, priority: 0.4 });
    }
    for (const wy of [1.72, 2.20]) {
      m.box([maxX + 0.05, wy - 0.02, winZ0 + wf], [maxX + 0.13, wy + 0.02, winZ1 - wf], trimWood, { solid: false, priority: 0.4 });
    }

    // --- Heavy Dark Wooden Doorframe (Top, Left & Right Only), Recessed Double Door Leaves & Iron Hardware ---
    const jf = 0.075;
    m.box([doorL, 0.0, minZ - 0.22], [doorL + jf, doorH, minZ + 0.02], trimWood, { solid: false, priority: 0.7 });
    m.box([doorR - jf, 0.0, minZ - 0.22], [doorR, doorH, minZ + 0.02], trimWood, { solid: false, priority: 0.7 });
    m.box([doorL - 0.02, doorH - 0.09, minZ - 0.22], [doorR + 0.02, doorH + 0.02, minZ + 0.025], trimWood, { solid: false, priority: 0.7 });

    const leafZ0 = minZ - 0.22;
    const leafZ1 = minZ - 0.14;
    m.box([doorL + jf, 0.0, leafZ0], [doorMid - 0.008, doorH - 0.09, leafZ1], doorWood, { solid: true, priority: 1.3 });
    m.box([doorMid + 0.008, 0.0, leafZ0], [doorR - jf, doorH - 0.09, leafZ1], doorWood, { solid: true, priority: 1.3 });
    // Small dark iron door lock hasp and ring pull at the center split.
    m.box([doorMid - 0.022, 1.32, leafZ1], [doorMid + 0.022, 1.42, leafZ1 + 0.024], darkIron, { solid: false, skipFaces: ["nz"], priority: 0.4 });
    m.box([doorMid - 0.018, 1.18, leafZ1], [doorMid + 0.018, 1.24, leafZ1 + 0.026], darkIron, { solid: false, skipFaces: ["nz"], priority: 0.4 });

    // --- Aged Patterned Red Paper Spring Festival Couplets, Horizontal Scroll & Door Talismans ---
    const addPaperPanel = (x0, y0, x1, y1, z, mat) => {
      m.addQuad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], mat, {
        u0: 0, v0: 0, u1: 1, v1: 1, priority: 1.2,
      });
    };
    addPaperPanel(-0.60, 0.44, -0.30, 1.98, minZ + 0.006, coupletLeft);              // Left couplet (富贵由天)
    addPaperPanel(1.14, 0.44, 1.44, 1.98, minZ + 0.006, coupletRight);               // Right couplet (平安是福)
    addPaperPanel(-0.08, 2.34, 0.92, 2.68, minZ + 0.006, coupletScroll);             // Horizontal scroll above lintel
    addPaperPanel(doorMid - 0.34, 1.12, doorMid - 0.13, 1.60, leafZ1 + 0.008, talismanLeft);  // Left door talisman
    addPaperPanel(doorMid + 0.13, 1.12, doorMid + 0.34, 1.60, leafZ1 + 0.008, talismanRight); // Right door talisman

    // --- Foreground Floor Candle, Tapered Teardrop Flame & Smooth Ceramic Offering Bowl ---
    const cx = -0.02;
    const cz = 0.28;
    // Melted wax puddle base + low stubby cream paraffin vigil candle cylinder.
    m.cylinder(cx, cz, 0.0, 0.010, 0.056, candleWax, { segments: 18, caps: true, solid: false, priority: 0.4 });
    m.cylinder(cx, cz, 0.010, 0.120, 0.020, candleWax, { segments: 18, caps: true, solid: false, priority: 0.4 });
    // Tapered incandescent teardrop candle flame (3-ring revolved profile).
    const flameRings = [
      { y: 0.122, r: 0.0055 },
      { y: 0.137, r: 0.0115 },
      { y: 0.158, r: 0.0076 },
      { y: 0.178, r: 0.0012 },
    ];
    const fSegs = 12;
    const flameChart = m._beginChart(0.08, 0.08, 0.15);
    for (let r = 0; r < flameRings.length - 1; r++) {
      const a = flameRings[r];
      const b = flameRings[r + 1];
      const v0 = r / (flameRings.length - 1);
      const v1 = (r + 1) / (flameRings.length - 1);
      for (let i = 0; i < fSegs; i++) {
        const u0 = i / fSegs;
        const u1 = (i + 1) / fSegs;
        const t0 = u0 * Math.PI * 2;
        const t1 = u1 * Math.PI * 2;
        const p0 = [cx + Math.cos(t0) * a.r, a.y, cz + Math.sin(t0) * a.r];
        const p1 = [cx + Math.cos(t1) * a.r, a.y, cz + Math.sin(t1) * a.r];
        const p2 = [cx + Math.cos(t1) * b.r, b.y, cz + Math.sin(t1) * b.r];
        const p3 = [cx + Math.cos(t0) * b.r, b.y, cz + Math.sin(t0) * b.r];
        m.addQuad(p0, p3, p2, p1, candleFlame, {
          u0, v0, u1, v1,
          chart: flameChart,
          lu0: u0, lv0: v0, lu1: u1, lv1: v1,
        });
      }
    }

    // Smooth wheel-thrown dark stoneware offering bowl (narrow foot ring flaring to a
    // rounded open rim with a concave interior filled with matte incense ash).
    const addRevolvedSurface = (rx, rz, profile, mat, segs, chart) => {
      // Precompute smooth outward/upward profile normals (dr, dy) -> radial dy, vertical -dr.
      const profN = profile.map((_, idx) => {
        const prev = profile[Math.max(0, idx - 1)];
        const next = profile[Math.min(profile.length - 1, idx + 1)];
        const dr = next.r - prev.r;
        const dy = next.y - prev.y;
        const len = Math.hypot(dy, -dr) || 1;
        return { nr: dy / len, ny: -dr / len };
      });
      for (let r = 0; r < profile.length - 1; r++) {
        const a = profile[r];
        const b = profile[r + 1];
        const na = profN[r];
        const nb = profN[r + 1];
        const v0 = r / (profile.length - 1);
        const v1 = (r + 1) / (profile.length - 1);
        for (let i = 0; i < segs; i++) {
          const u0 = i / segs;
          const u1 = (i + 1) / segs;
          const t0 = u0 * Math.PI * 2;
          const t1 = u1 * Math.PI * 2;
          const c0 = Math.cos(t0);
          const s0 = Math.sin(t0);
          const c1 = Math.cos(t1);
          const s1 = Math.sin(t1);
          const p0 = [rx + c0 * a.r, a.y, rz + s0 * a.r];
          const p1 = [rx + c1 * a.r, a.y, rz + s1 * a.r];
          const p2 = [rx + c1 * b.r, b.y, rz + s1 * b.r];
          const p3 = [rx + c0 * b.r, b.y, rz + s0 * b.r];
          const n0 = [na.nr * c0, na.ny, na.nr * s0];
          const n1 = [na.nr * c1, na.ny, na.nr * s1];
          const n2 = [nb.nr * c1, nb.ny, nb.nr * s1];
          const n3 = [nb.nr * c0, nb.ny, nb.nr * s0];
          m.addQuad(p0, p3, p2, p1, mat, {
            u0, v0, u1, v1,
            normals: [n0, n3, n2, n1],
            chart,
            lu0: u0, lv0: v0, lu1: u1, lv1: v1,
          });
        }
      }
    };

    const bx = -0.18;
    const bz = 0.34;
    const bowlChart = m._beginChart(0.45, 0.28, 0.55);
    addRevolvedSurface(
      bx,
      bz,
      [
        { y: 0.000, r: 0.056 }, // ceramic foot ring base
        { y: 0.014, r: 0.058 }, // foot ring neck
        { y: 0.030, r: 0.088 }, // curving lower belly
        { y: 0.056, r: 0.114 }, // mid belly
        { y: 0.086, r: 0.130 }, // upper bowl flare
        { y: 0.108, r: 0.136 }, // outer lip
        { y: 0.114, r: 0.132 }, // rounded rim crest
        { y: 0.111, r: 0.123 }, // inner lip edge
        { y: 0.086, r: 0.110 }, // concave inner wall
        { y: 0.068, r: 0.094 }, // inner hollow floor junction
      ],
      charredCeramic,
      24,
      bowlChart,
    );
    const ashChart = m._beginChart(0.20, 0.20, 0.35);
    addRevolvedSurface(
      bx,
      bz,
      [
        { y: 0.070, r: 0.096 }, // ash rim touching inner bowl wall
        { y: 0.080, r: 0.056 }, // gently mounded incense ash bed
        { y: 0.085, r: 0.003 }, // closed center cap
      ],
      incenseAsh,
      24,
      ashChart,
    );
    m.solids.push({ kind: "circle", x: bx, z: bz, radius: 0.19, minY: 0, maxY: 0.22 });

    // Low pitch-dark rounded foreground silhouette tucked along the near left corridor wall.
    m.box([-0.42, 0.0, 1.72], [-0.04, 0.34, 2.42], sootDark, { solid: true, priority: 0.4 });
    m.cylinder(-0.04, 1.92, 0.0, 0.34, 0.16, sootDark, { segments: 20, caps: true, solid: true, priority: 0.4 });

    // Far-right dark wooden stool and matte dark ceramic jar tucked deep in corner shadow.
    m.box([1.14, 0.0, minZ + 0.04], [1.52, 0.30, minZ + 0.40], trimWood, { solid: true, priority: 0.5 });
    m.cylinder(1.34, minZ + 0.22, 0.30, 0.50, 0.06, charredCeramic, { segments: 16, caps: true, solid: false, priority: 0.3 });

    // --- Physically Placed Multi-Layer Lighting ---
    // 1. Low foreground floor candle point light: intense warm golden pool around the bowl,
    //    candle, and lower-left corridor wall, falling off rapidly before the mid-corridor so a
    //    deep dark shadow gulf naturally separates the foreground candle from the moonlit doorway.
    m.pointLight([cx, 0.162, cz], {
      color: [1.0, 0.56, 0.18],
      intensity: 5.1,
      radius: 0.018,
      shadowOffset: 0.046,
      flickerAmp: 0.055,
      flickerFreq: 7.3,
      flickerPhase: 0.4,
    });
    // 2. Single tiny baffled broken-hole moonlight aperture (14 cm x 14 cm, kind = 1.3125 -> focusExp = 19.75)
    //    sitting right at the concealed 22 cm x 24 cm breach in the left wall [-1.04, 0.88, -0.50]
    //    and aimed at [0.04, 0.78, -2.26]. Produces a tight, focused cool pool on the lower couplet
    //    (由天) and lower-mid doorway planks while leaving the upper wall, ceiling, right wall, and
    //    mid-corridor floor trough behind the candle in deep night shadow.
    const addOrientedPortal = (center, uDir, vDir, hw, hh, color, intensity, kind = 1) => {
      const p0 = [
        center[0] - uDir[0] * hw - vDir[0] * hh,
        center[1] - uDir[1] * hw - vDir[1] * hh,
        center[2] - uDir[2] * hw - vDir[2] * hh,
      ];
      const p1 = [p0[0] + uDir[0] * hw * 2, p0[1] + uDir[1] * hw * 2, p0[2] + uDir[2] * hw * 2];
      const p3 = [p0[0] + vDir[0] * hh * 2, p0[1] + vDir[1] * hh * 2, p0[2] + vDir[2] * hh * 2];
      m.addAreaLight(p0, p1, p3, color, intensity, { kind });
    };
    addOrientedPortal(
      [-1.04, 0.88, -0.50],
      [0.906, 0.0, 0.422],
      [-0.022, -0.999, 0.047],
      0.07,
      0.07,
      [0.84, 0.90, 0.98],
      240.0,
      1.3125,
    );

    // --- Curated Viewpoints ---
    m.bookmark("Candlelit Threshold", { x: 0.28, y: 0.94, z: 3.15, yaw: 0.16, pitch: -0.05 });
    m.bookmark("Corridor Midpoint", { x: 0.52, y: 1.38, z: 1.05, yaw: 0.04, pitch: -0.06 });
    m.bookmark("Double Door & Couplets", { x: 0.42, y: 1.42, z: -0.55, yaw: 0.0, pitch: -0.02 });
  },
};
