// Level 1 · Habitable Zone (Aquila Sector & 3 Connected Iconic Subterranean/Overgrown Sectors).
// Seamlessly unites four iconic Level 1 reference environments in one walkable 36 x 36 m megastructure:
//   1. Aquila Sector           — Huge chunky concrete pillars with drop-panels, blinding vertical column & wall
//                                fluorescent tubes, left concrete parking ramp, right corrugated metal partition,
//                                overhead white sprinkler pipes with red heads & mirror-wet tire-track puddles
//   2. High-Bay Warehouse      — Tall 5.6 m structural concrete girder ceiling, huge twin parallel galvanized
//                                curved HVAC air ducts, dense rod-suspended industrial light array, bright white
//                                painted interior perimeter rooms with open double steel vault doors
//   3. Vaulted Mushroom Garage — Dense forest of smooth concave trumpet-flared round concrete mushroom columns,
//                                warm sodium subterranean lighting & crisp white painted parking bay lines
//   4. Overgrown Courtyard     — Monumental stepped-plinth weathered concrete pillars, swirling sunlit emerald
//                                mossy floor, 3D hanging & climbing ivy vine curtains & real golden sunbeams

export default {
  id: "level1",
  title: "Level 1 · Habitable Zone",
  subtitle: "AQUILA SECTOR",
  audio: "parking",
  spawn: { x: -0.45, y: 1.56, z: 13.80, yaw: 0.05, pitch: -0.02 },
  atmosphere: {
    fogColor: [0.070, 0.075, 0.068],
    fogDensity: 0.0058,
    heightFogFalloff: 0.22,
    skyTop: [0.52, 0.68, 0.84],
    skyHorizon: [0.85, 0.90, 0.78],
    // Golden daylight streams ONLY into Sector 4's open roof aperture (Sectors 1-3 are fully roofed underground!)
    sun: { direction: [-0.36, 0.82, -0.44], color: [1.00, 0.95, 0.78], intensity: 10.5, angularRadius: 0.032 },
    perPixelAreaLights: true, // crisp per-pixel vertical tubes, high-bay lamps & sodium vault lights underground!
    exposure: 1.32,
    bloomStrength: 0.28,
    volumetricStrength: 0.16,
    ambientFloor: 0.004,
    bounceBoost: 1.78,
    aoRadius: 1.75,
  },

  build(m) {
    const H_AQ = 3.10;   // Aquila Sector oppressive low parking ceiling
    const H_WH = 5.60;   // High-Bay Warehouse soaring concrete girder ceiling
    const H_MG = 3.05;   // Vaulted Mushroom Garage low arched ceiling
    const H_OG = 5.40;   // Overgrown Courtyard monumental sunlit colonnade

    // Calibrated sector materials (zero bitmap assets)
    const concGrey = m.material({ base: "concrete_raw", albedo: [0.56, 0.56, 0.53], roughness: 0.88, wetness: 0.28 });
    const concCeil = m.material({ base: "concrete_raw", albedo: [0.54, 0.55, 0.52], roughness: 0.90, wetness: 0.12 });
    const concWareCeil = m.material({ base: "concrete_raw", albedo: [0.39, 0.38, 0.35], roughness: 0.92, wetness: 0.08 });
    const concPillar = m.material({ base: "concrete_painted", albedo: [0.68, 0.68, 0.65], roughness: 0.80, wetness: 0.30 });
    const concMushroom = m.material({ base: "concrete_raw", albedo: [0.50, 0.49, 0.44], roughness: 0.86, wetness: 0.18 });
    const concRuin = m.material({ base: "concrete_raw", albedo: [0.65, 0.62, 0.50], roughness: 0.88, wetness: 0.20 });
    const whiteDrywall = m.material({ base: "plaster_warm", albedo: [0.92, 0.92, 0.90], roughness: 0.82 });
    const corrMetal = m.material({ base: "corrugated_metal" });
    const steel = m.material({ base: "stainless_steel", roughness: 0.26 });
    const ductGalv = m.material({ base: "stainless_steel", albedo: [0.64, 0.66, 0.67], roughness: 0.36 });
    const darkSteel = m.material({ base: "dark_metal", albedo: [0.16, 0.17, 0.17], roughness: 0.44 });
    const whitePipe = m.material({ base: "plaster_warm", albedo: [0.84, 0.85, 0.83], roughness: 0.42, coat: 0.25 });
    const redSprinkler = m.material({ base: "plaster_warm", albedo: [0.68, 0.10, 0.08], roughness: 0.35, coat: 0.30 });
    const mossFloor = m.material({ base: "moss_floor" });
    const vineMat = m.material({ base: "foliage_vine" });

    // Sector-specific concrete floor variants (selected cleanly via preset 9 seed in gbuffer-pbr.wgsl!)
    const floorAquila = m.material({ base: "concrete_floor", albedo: [0.46, 0.46, 0.43], wetness: 0.92, seed: 5.0 });
    const floorWarehouse = m.material({ base: "concrete_floor", albedo: [0.56, 0.53, 0.47], wetness: 0.0, seed: 20.0 });
    const floorVault = m.material({ base: "concrete_floor", albedo: [0.42, 0.40, 0.35], wetness: 0.12, seed: 35.0 });

    // Lighting palettes calibrated to real fixtures
    const colAquila = [0.94, 0.99, 1.00];  // blinding cold-white industrial vertical tubes (Aquila Sector)
    const colHighBay = [0.94, 0.97, 1.00]; // bright crisp 5000K high-bay warehouse boxes
    const colVault = [1.00, 0.82, 0.50];   // dim warm subterranean sodium/tungsten glow (Mushroom Garage)
    const lampAquila = m.material({ base: "fluorescent_panel", emissive: colAquila, emissiveStrength: 38.0 });
    const lampHighBay = m.material({ base: "fluorescent_panel", emissive: colHighBay, emissiveStrength: 30.0 });
    const lampVault = m.material({ base: "fluorescent_panel", emissive: colVault, emissiveStrength: 22.0 });

    // Unified walkable bounds spanning all 4 connected sectors ([-18..18] x [-20.4..15.6])
    m.setWalkBounds(-18.0, -20.4, 18.0, 15.6, 0);

    // =========================================================================
    // SECTOR 1: AQUILA SECTOR (x in [-6.0..6.0], z in [-4.8..15.6], H = 3.10 m)
    //   Directly matched to Wikidot Level 1 Aquila Sector photograph (image.png):
    //   - Huge chunky 1.16 x 1.16 m square concrete pillars with wide flat drop-panels
    //   - Blinding VERTICAL white fluorescent tubes mounted directly onto pillars & right corrugated metal wall
    //   - Smooth inclined solid concrete parking ramp ascending diagonally on the left
    //   - Overhead white fire-sprinkler pipe network with tiny red sprinkler heads & vertical wire hangers
    //   - Long mirror-wet tire-track puddles reflecting every vertical column tube down the aisle!
    // =========================================================================
    m.floor(-6.0, -4.8, 6.0, 15.6, 0, floorAquila, { padOuter: false });
    m.ceiling(-6.0, -4.8, 6.0, 15.6, H_AQ, concCeil, { padOuter: true });
    // South concrete back wall behind spawn (z = 15.60)
    m.box([-6.0, 0, 15.6], [6.0, H_AQ, 15.9], concGrey, { solid: false, skipFaces: ["ny", "py", "pz", "nx", "px"] });
    // Right corrugated galvanized sheet-metal partition wall facing Aquila (-X), backed by weathered stone facing Overgrown Courtyard (+X)!
    m.wallWithDoorway([5.75, 0, -4.8], [5.88, H_AQ, 15.6], {
      material: corrMetal,
      openings: [{ pos: -2.8, width: 2.2, top: 2.45 }],
    });
    m.wallWithDoorway([5.88, 0, -4.8], [6.00, H_AQ, 15.6], {
      material: concRuin,
      openings: [{ pos: -2.8, width: 2.2, top: 2.45 }],
    });
    // North transition bulkhead between Aquila Sector (H=3.10) and High-Bay Warehouse (H=5.60)
    m.wallWithDoorway([-6.0, 0, -5.2], [6.0, H_AQ, -4.8], {
      material: concGrey,
      openings: [{ pos: 0.4, width: 5.4, top: 2.75 }],
    });
    // Upper concrete closure wall above Aquila ceiling facing into High-Bay Warehouse (y = 3.10..5.60)
    m.box([-6.0, H_AQ, -5.2], [6.0, H_WH, -4.8], concWareCeil, { solid: false, skipFaces: ["py", "pz"] });

    // Huge chunky concrete square pillars (1.16 x 1.16 m) + wide flat drop-panels + VERTICAL white fluorescent tubes!
    const aquilaPillars = [
      [-2.35, 9.20, true],
      [-2.35, 3.20, true],
      [-2.35, -2.20, true],
    ];
    for (const [px, pz, hasTube] of aquilaPillars) {
      const r = 0.58;
      m.box([px - r, 0, pz - r], [px + r, H_AQ - 0.24, pz + r], concPillar, { skipFaces: ["ny", "py"] });
      // Wide flat concrete slab drop-panel flush to ceiling (2.56 x 2.56 m, y = 2.86..3.10)
      m.box([px - 1.28, H_AQ - 0.24, pz - 1.28], [px + 1.28, H_AQ, pz + 1.28], concCeil, {
        solid: false, skipFaces: ["py"], priority: 0.6,
      });
      if (hasTube) {
        // Signature blinding vertical white fluorescent tube mounted on +X aisle side of the pillar!
        m.verticalTubeLight(px + r, 1.48, 2.74, pz + 0.12, "+x", {
          color: colAquila,
          intensity: 64.0,
          width: 0.16,
          depth: 0.08,
          material: lampAquila,
        });
      }
    }

    // Matching vertical white fluorescent tubes mounted along the right corrugated galvanized metal wall!
    for (const tz of [11.2, 6.2, 1.0]) {
      m.verticalTubeLight(5.75, 1.38, 2.72, tz, "-x", {
        color: colAquila,
        intensity: 60.0,
        width: 0.16,
        depth: 0.08,
        material: lampAquila,
      });
    }
    // Subtle overhead ceiling batten midway down Aquila aisle to illuminate pipes & far receding deck
    m.tubeLight(0.8, H_AQ - 0.12, 0.2, 1.8, "z", { color: colAquila, intensity: 42.0, material: lampAquila, hangY: H_AQ });
    m.tubeLight(0.8, H_AQ - 0.12, 9.8, 1.8, "z", { off: true, hangY: H_AQ }); // realistic dark ceiling fixture like image.png!

    // Smooth sloped solid concrete parking ramp ascending diagonally on the left (exact image.png silhouette!)
    // Smooth inclined ramp deck + smooth swept concrete side parapet wall (ZERO jagged staircase steps!)
    m.addQuad([-5.80, 0.0, 12.60], [-3.20, 0.0, 12.60], [-3.20, 1.45, 5.40], [-5.80, 1.45, 5.40], concGrey, {
      u0: -5.80, v0: 0, u1: -3.20, v1: 7.35, priority: 0.85,
    });
    m.floors.push({ kind: "ramp", axis: "z", minX: -5.80, maxX: -3.20, minZ: 5.40, maxZ: 12.60, y0: 1.45, y1: 0.0, override: false });
    m.box([-5.80, 0, 3.00], [-3.20, 1.45, 5.40], concGrey, { walkable: true, skipFaces: ["ny", "nx"] });
    // Smooth solid inclined side parapet wall (x = -3.22..-3.02) rising cleanly alongside ramp & landing!
    const rX0 = -3.22, rX1 = -3.02, rZA = 12.60, rZB = 5.40;
    const rYBotA = 0.0, rYTopA = 0.78, rYBotB = 0.0, rYTopB = 2.22;
    // Outer +X face of ramp parapet (smooth diagonal concrete fascia seen in Aquila Sector photo!)
    m.addQuad([rX1, rYBotA, rZA], [rX1, rYBotB, rZB], [rX1, rYTopB, rZB], [rX1, rYTopA, rZA], concGrey, { u0: 0, v0: 0, u1: 7.2, v1: 2.2, priority: 0.75 });
    // Inner -X face of ramp parapet
    m.addQuad([rX0, rYBotB, rZB], [rX0, rYBotA, rZA], [rX0, rYTopA, rZA], [rX0, rYTopB, rZB], concGrey, { u0: 0, v0: 0, u1: 7.2, v1: 2.2, priority: 0.55 });
    // Smooth sloped top cap of parapet
    m.addQuad([rX0, rYTopA, rZA], [rX1, rYTopA, rZA], [rX1, rYTopB, rZB], [rX0, rYTopB, rZB], concGrey, { u0: 0, v0: 0, u1: 0.2, v1: 7.4, priority: 0.45 });
    // South end face of parapet at ramp foot
    m.addQuad([rX0, rYBotA, rZA], [rX1, rYBotA, rZA], [rX1, rYTopA, rZA], [rX0, rYTopA, rZA], concGrey, { u0: 0, v0: 0, u1: 0.2, v1: 0.78, priority: 0.35 });
    // Upper horizontal parapet along landing (z = 3.00..5.40)
    m.box([-3.22, 1.45, 3.00], [-3.02, 2.22, 5.40], concGrey, { solid: false, skipFaces: ["ny", "pz"], priority: 0.4 });
    // Overhead Aquila white fire-sprinkler pipe network with red sprinkler heads & vertical hanger rods!
    for (const pz of [11.6, 8.2, 4.8, 1.4, -2.0]) {
      m.pipe([-5.8, H_AQ - 0.28, pz], [5.7, H_AQ - 0.28, pz], 0.026, whitePipe, { segments: 6 });
      for (const hx of [-3.6, -0.4, 2.8]) {
        m.pipe([hx, H_AQ - 0.28, pz], [hx, H_AQ, pz], 0.008, darkSteel, { segments: 4 });
        // Signature tiny red fire sprinkler head hanging right off the white pipe!
        m.box([hx - 0.032, H_AQ - 0.35, pz - 0.032], [hx + 0.032, H_AQ - 0.29, pz + 0.032], redSprinkler, { solid: false, priority: 0.12 });
      }
    }
    // Longitudinal main white sprinkler feeder pipes running straight down the aisle ceiling
    m.pipe([0.65, H_AQ - 0.20, -4.8], [0.65, H_AQ - 0.20, 15.6], 0.044, whitePipe, { segments: 6 });
    m.pipe([4.80, H_AQ - 0.20, -4.8], [4.80, H_AQ - 0.20, 15.6], 0.038, whitePipe, { segments: 6 });

    // =========================================================================
    // SECTOR 2: HIGH-BAY WAREHOUSE (x in [-6.0..18.0], z in [-20.4..-4.8], H = 5.60 m)
    //   Directly matched to image_2.png:
    //   - Tall 5.60 m dark industrial concrete girder & cross-beam roof
    //   - Huge twin parallel galvanized steel round HVAC air ducts sweeping cleanly overhead (ZERO column clip!)
    //   - Dense 3x4 receding grid of rod-suspended industrial high-bay rectangular light fixtures
    //   - Clean bright-white painted perimeter interior room walls + open double steel vault doors!
    // =========================================================================
    m.floor(-6.0, -20.4, 18.0, -4.8, 0, floorWarehouse, { padOuter: false });
    m.ceiling(-6.0, -20.4, 18.0, -4.8, H_WH, concWareCeil, { padOuter: true });

    // Crisp bright-white painted warehouse perimeter walls (iconic contrast against dark industrial roof of image_2.png!)
    m.box([-6.0, 0, -20.6], [18.0, 4.10, -20.4], whiteDrywall, { solid: false, skipFaces: ["ny", "py", "nz", "nx", "px"] });
    m.box([-6.0, 4.10, -20.6], [18.0, H_WH, -20.4], concWareCeil, { solid: false, skipFaces: ["ny", "py", "nz", "nx", "px"] });
    m.box([18.0, 0, -20.4], [18.2, 4.10, -4.8], whiteDrywall, { solid: false, skipFaces: ["ny", "py", "px", "nz", "pz"] });
    m.box([18.0, 4.10, -20.4], [18.2, H_WH, -4.8], concWareCeil, { solid: false, skipFaces: ["ny", "py", "px", "nz", "pz"] });
    // White interior office box protrusion on the far right corner with open double steel vault doors (image_2.png back-right!)
    m.wallWithDoorway([11.2, 0, -17.6], [18.0, 3.60, -17.4], {
      material: whiteDrywall,
      openings: [{ pos: 14.6, width: 1.90, top: 2.35 }],
    });
    m.box([11.0, 0, -20.4], [11.2, 3.60, -17.4], whiteDrywall, { skipFaces: ["ny", "py"] });
    m.box([11.2, 3.50, -20.4], [18.0, 3.60, -17.4], concWareCeil, { solid: false, skipFaces: ["ny"], priority: 0.4 });
    // Open double steel doors swung outward flanking the dark doorway opening (image_2.png!)
    m.box([13.55, 0, -17.4], [13.64, 2.32, -16.55], darkSteel, { solid: false, skipFaces: ["ny"], priority: 0.25 });
    m.box([15.56, 0, -17.4], [15.65, 2.32, -16.55], darkSteel, { solid: false, skipFaces: ["ny"], priority: 0.25 });

    // Tall slender raw concrete structural warehouse columns + deep concrete roof girder beams (image_2.png!)
    for (const cx of [1.2, 7.6, 13.8]) {
      for (const cz of [-10.0, -15.6]) {
        const r = 0.28;
        m.box([cx - r, 0, cz - r], [cx + r, H_WH - 0.75, cz + r], concGrey, { skipFaces: ["ny", "py"] });
      }
    }
    // Deep longitudinal & transverse raw concrete structural roof girders
    for (const gx of [-5.8, 1.2, 7.6, 13.8]) {
      m.box([gx - 0.26, H_WH - 0.78, -20.4], [gx + 0.26, H_WH, -4.8], concWareCeil, { solid: false, skipFaces: ["py"], priority: 0.45 });
    }
    for (const gz of [-10.0, -15.6]) {
      m.box([-6.0, H_WH - 0.62, gz - 0.22], [18.0, H_WH, gz + 0.22], concWareCeil, { solid: false, skipFaces: ["py"], priority: 0.45 });
    }

    // ICONIC HUGE TWIN PARALLEL GALVANIZED STEEL ROUND HVAC DUCTS sweeping cleanly between columns (ZERO column clip!)
    m.curvedTube(
      [
        [-2.2, 4.78, -5.2],
        [2.6, 4.78, -8.4],
        [6.4, 4.78, -12.6],
        [10.2, 4.78, -16.8],
        [15.6, 4.78, -16.8],
      ],
      0.26,
      ductGalv,
      { stepsPerSegment: 4, radialSegments: 10, solid: false, priority: 0.3 },
    );
    m.curvedTube(
      [
        [-0.4, 4.78, -5.2],
        [4.2, 4.78, -8.2],
        [8.2, 4.78, -12.0],
        [11.8, 4.78, -15.6],
        [16.8, 4.78, -15.6],
      ],
      0.24,
      ductGalv,
      { stepsPerSegment: 4, radialSegments: 10, solid: false, priority: 0.3 },
    );

    // Dense 3x4 receding grid of rod-suspended industrial high-bay rectangular fixtures (y = 4.25 m, hung from H_WH!)
    for (const lx of [-1.6, 4.4, 10.6]) {
      for (const lz of [-7.4, -11.4, -15.2, -18.6]) {
        m.tubeLight(lx, 4.28, lz, 1.50, "x", {
          width: 0.42,
          color: colHighBay,
          intensity: 44.0,
          material: lampHighBay,
          hangY: H_WH,
        });
      }
    }

    // =========================================================================
    // SECTOR 3: VAULTED MUSHROOM GARAGE (x in [-18.0..-6.0], z in [-20.4..15.6], H = 3.05 m)
    //   Directly matched to image_3.png:
    //   - Dense rhythmic forest of smooth concave trumpet-flared round concrete mushroom columns (trumpetColumn!)
    //   - Warm dim sodium subterranean illumination & crisp white painted parking stall lines!
    // =========================================================================
    m.floor(-18.0, -20.4, -6.0, 15.6, 0, floorVault, { padOuter: false });
    m.ceiling(-18.0, -20.4, -6.0, 15.6, H_MG, concMushroom, { padOuter: true });
    // Outer west, north, south walls of Vaulted Mushroom Garage
    m.box([-18.2, 0, -20.4], [-18.0, H_MG + 0.04, 15.6], concMushroom, { solid: false, skipFaces: ["ny", "py", "nx", "nz", "pz"] });
    m.box([-18.0, 0, -20.6], [-6.0, H_MG + 0.04, -20.4], concMushroom, { solid: false, skipFaces: ["ny", "py", "nz", "nx", "px"] });
    m.box([-18.0, 0, 15.6], [-6.0, H_MG + 0.04, 15.8], concMushroom, { solid: false, skipFaces: ["ny", "py", "pz", "nx", "px"] });
    // Upper closure wall between Vaulted Garage (H=3.05) and High-Bay Warehouse / Aquila along x = -6.0 (watertight!)
    m.box([-6.2, H_MG - 0.04, -20.4], [-6.0, H_WH + 0.04, -4.8], concWareCeil, { solid: false, skipFaces: ["py", "nx"] });
    m.box([-6.2, H_MG - 0.04, -4.8], [-6.0, H_AQ + 0.04, 15.6], concGrey, { solid: false, skipFaces: ["py", "nx"] });
    // Open architectural dividing piers between Sector 3 & Sector 1/2 along x = -6.0 (wide open drive-through bays!)
    m.wallWithDoorway([-6.2, 0, -20.4], [-6.0, H_MG, 15.6], {
      material: concMushroom,
      openings: [
        { pos: 1.6, width: 4.4, top: 2.65 },   // wide drive opening to Aquila Sector
        { pos: -10.8, width: 4.8, top: 2.65 }, // wide drive opening to High-Bay Warehouse
      ],
    });

    // Dense 3x6 grid of sweeping concave trumpet-flared round concrete mushroom columns (image_3.png!)
    for (const mx of [-15.6, -11.4, -7.8]) {
      for (const mz of [10.4, 5.6, 0.8, -4.0, -8.8, -13.6]) {
        m.trumpetColumn(mx, mz, 0, H_MG, 0.34, 1.62, concMushroom, {
          yFlare: 1.48,
          flarePower: 2.25,
          segments: 16,
          rings: 4,
        });
      }
    }
    // Warm subterranean sodium/tungsten ceiling lights tucked between the vaulted mushroom arches
    for (const lz of [8.0, 0.8, -6.4, -13.6]) {
      m.tubeLight(-13.5, H_MG - 0.08, lz, 1.40, "x", { color: colVault, intensity: 48.0, material: lampVault, hangY: H_MG });
      m.tubeLight(-9.6, H_MG - 0.08, lz + 2.4, 1.40, "x", { color: colVault, intensity: 44.0, material: lampVault, hangY: H_MG });
    }

    // =========================================================================
    // SECTOR 4: OVERGROWN COURTYARD (x in [6.0..18.0], z in [-4.8..15.6], H = 5.40 m)
    //   Directly matched to image_4.png:
    //   - Monumental weathered square concrete pillars standing on stepped plinth bases
    //   - Lush swirling emerald mossy floor (moss_floor)
    //   - Real open ceiling roof sky aperture pouring golden diagonal sunbeams + volumetric mist shafts!
    //   - Dense organic alpha-cutout 3D hanging ivy curtains & pillar-climbing vines with dappled leaf shadows!
    // =========================================================================
    m.floor(6.0, -4.8, 18.0, 15.6, 0, mossFloor, { padOuter: false });
    // Tall sunlit weathered concrete perimeter courtyard walls (catching warm golden sun!)
    m.box([18.0, 0, -4.8], [18.3, H_OG, 15.6], concRuin, { solid: false, skipFaces: ["ny", "py", "px", "nz", "pz"] });
    m.box([6.0, 0, 15.6], [18.0, H_OG, 15.9], concRuin, { solid: false, skipFaces: ["ny", "py", "pz", "nx", "px"] });
    // Upper concrete wall above Aquila's 3.10 m roof facing into Overgrown Courtyard (x = 5.88..6.0, y = 3.10..5.40)
    m.box([5.88, H_AQ, -4.8], [6.00, H_OG, 15.6], concRuin, { solid: false, skipFaces: ["py", "nx"] });
    // North courtyard dividing wall with wide shadowed portal leading into High-Bay Warehouse (z = -5.2..-4.8, sealed to H_WH!)
    m.wallWithDoorway([6.0, 0, -5.2], [18.0, H_WH, -4.8], {
      material: concRuin,
      openings: [{ pos: 12.0, width: 3.4, top: 3.20 }],
    });

    // Open-sky roof frame: solid perimeter beams & cross-beams framing a huge open skylight aperture
    // so crisp golden sunbeams slice diagonally across the monumental pillars & hanging ivy!
    m.ceiling(6.0, 11.4, 18.0, 15.6, H_OG, concRuin, { padOuter: true });  // South roof overhang above viewer
    m.ceiling(6.0, -4.8, 18.0, -2.2, H_OG, concRuin, { padOuter: true });  // North roof overhang
    m.ceiling(6.0, -2.2, 8.0, 11.4, H_OG, concRuin, { padOuter: true });   // West roof border
    m.ceiling(16.0, -2.2, 18.0, 11.4, H_OG, concRuin, { padOuter: true }); // East roof border
    // Concrete pergola sky-beams spanning across the open sky opening to slice sun shafts dramatically!
    for (const bz of [7.6, 3.2, -0.8]) {
      m.box([8.0, H_OG - 0.55, bz - 0.35], [16.0, H_OG, bz + 0.35], concRuin, { solid: false, skipFaces: ["py"], priority: 0.4 });
    }
    for (const bx of [9.6, 13.8]) {
      m.box([bx - 0.35, H_OG - 0.55, -2.2], [bx + 0.35, H_OG, 11.4], concRuin, { solid: false, skipFaces: ["py"], priority: 0.4 });
    }

    // Monumental stepped-plinth weathered square concrete courtyard pillars (image_4.png!)
    const courtyardPillars = [
      [9.6, 9.0],
      [9.6, 4.2],
      [9.6, -0.4],
      [14.0, 9.0],
      [14.0, 4.2],
      [14.0, -0.4],
    ];
    for (const [px, pz] of courtyardPillars) {
      const r = 0.54;
      const pr = 0.72;
      // Wide stepped stone plinth base (1.44 x 1.44 x 0.30 m)
      m.box([px - pr, 0, pz - pr], [px + pr, 0.30, pz + pr], concRuin, { skipFaces: ["ny"], priority: 0.4 });
      // Monumental shaft rising straight to concrete roof beams
      m.box([px - r, 0.30, pz - r], [px + r, H_OG - 0.55, pz + r], concRuin, { skipFaces: ["ny", "py"] });
      // Climbing botanical ivy vine blankets hugging pillar corners & faces!
      m.foliageVine(px + r + 0.14, H_OG - 0.3, 0.35, pz + 0.28, vineMat, { width: 0.44, sway: 0.10 });
      m.foliageVine(px - r - 0.14, H_OG - 0.4, 0.55, pz - 0.22, vineMat, { width: 0.42, sway: 0.10 });
      m.foliageVine(px + 0.18, H_OG - 0.3, 0.65, pz + r + 0.14, vineMat, { width: 0.44, sway: 0.09 });
      m.foliageVine(px - 0.24, H_OG - 0.3, 0.85, pz + r + 0.14, vineMat, { width: 0.38, sway: 0.08 });
    }

    // Iconic free-hanging vertical sunlit ivy vine curtains descending from overhead sky beams (image_4.png!)
    const hangingVines = [
      [11.4, 5.4, 0.25, 7.6, 0.40],
      [12.3, 5.4, 0.35, 5.4, 0.38],
      [10.6, 5.4, 0.65, 2.8, 0.42],
      [12.8, 5.4, 0.20, 1.4, 0.44],
      [11.8, 5.4, 0.90, -1.2, 0.38],
      [15.0, 5.4, 0.45, 6.2, 0.48],
      [15.4, 5.4, 0.25, 10.4, 0.52],
      [14.2, 5.4, 0.30, 11.4, 0.48], // Foreground right sunlit draping vine curtain (image_4.png!)
      [8.4, 5.4, 0.55, 10.6, 0.46],
      [7.6, 5.4, 0.70, 6.4, 0.44],
      [6.4, 5.4, 0.40, 8.8, 0.46],  // Climbing vine curtain draping down west stone wall!
      [6.4, 5.4, 0.60, 4.0, 0.46],
      [13.4, 5.4, 0.65, -2.0, 0.38],
    ];
    for (const [vx, yT, yB, vz, w] of hangingVines) {
      m.foliageVine(vx, yT, yB, vz, vineMat, { width: w, sway: 0.12 });
    }

    // 4 Curated Photographic Reference Bookmarks (matching ALL 4 Level 1 reference images!)
    m.bookmark("1 · Aquila Sector", { x: -0.45, y: 1.56, z: 13.80, yaw: 0.05, pitch: -0.02 });
    m.bookmark("2 · High-Bay Warehouse", { x: -3.20, y: 1.60, z: -6.20, yaw: -0.58, pitch: 0.06 });
    m.bookmark("3 · Vaulted Mushroom Garage", { x: -9.60, y: 1.54, z: 12.20, yaw: 0.24, pitch: -0.02 });
    m.bookmark("4 · Overgrown Courtyard", { x: 11.40, y: 1.58, z: 13.40, yaw: 0.22, pitch: -0.02 });
  },
};
