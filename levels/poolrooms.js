// Level 37 · The Poolrooms.
// Declarative map (~105 lines) automatically receiving baked PBR ceramic tiles,
// multi-bounce BVH global illumination, volumetric sunbeams, SSR, and interactive caustic water.

export default {
  id: "poolrooms",
  title: "Level 37 · The Poolrooms",
  subtitle: "SUNLIT COLONNADE",
  audio: "poolrooms",
  spawn: { x: 1.6, y: 1.65, z: 9.8, yaw: 0.14, pitch: -0.05 },
  atmosphere: {
    fogColor: [0.22, 0.34, 0.34],
    fogDensity: 0.009,
    heightFogFalloff: 0.25,
    skyTop: [0.16, 0.42, 0.78],
    skyHorizon: [0.72, 0.86, 0.92],
    sun: {
      direction: [-0.50, 0.74, 0.44],
      color: [1.0, 0.94, 0.80],
      intensity: 16.0,
      angularRadius: 0.028,
    },
    exposure: 0.88,
    bloomStrength: 0.16,
    volumetricStrength: 0.48,
    ambientFloor: 0.008,
    bounceBoost: 1.25,
    aoRadius: 1.8,
  },

  build(m) {
    // Parametric material variants — zero WGSL required.
    const creamTile = m.material({ base: "tile_white", tint: [1.02, 1.0, 0.95], roughness: 0.16, coat: 0.85 });
    const archTile = m.material({ base: "tile_white", tint: [0.98, 1.0, 0.96], roughness: 0.18, coat: 0.80 });
    const poolFloor = m.material({ base: "tile_pool", tint: [0.85, 1.05, 1.02], roughness: 0.20, coat: 0.70 });
    const mosaicCol = m.material({ base: "tile_mosaic", tint: [0.96, 1.02, 1.0], roughness: 0.17, coat: 0.78 });
    const plaster = m.material({ base: "plaster_warm", tint: [1.0, 0.99, 0.96], roughness: 0.84 });
    const warmCove = m.material({ base: "fluorescent_panel", emissive: [1.0, 0.90, 0.70], emissiveStrength: 9.0 });

    // Main flooded hall shell with two overhead skylight shafts.
    m.room([-8, 0, -16], [8, 5.8, 13], {
      floor: poolFloor,
      ceiling: plaster,
      walls: creamTile,
      ceilingHoles: [
        [-4.0, -1.2, 2.2, 5.2],   // Primary foreground skylight
        [-2.8, -13.4, 2.8, -8.6], // Far atrium skylight
      ],
    });

    // Skylight shaft framing walls rising above roof so daylight pours through clean wells.
    const addShaft = (x0, z0, x1, z1, y0, y1) => {
      m.box([x0 - 0.3, y0, z0], [x0, y1, z1], creamTile, { solid: false, priority: 0.5 });
      m.box([x1, y0, z0], [x1 + 0.3, y1, z1], creamTile, { solid: false, priority: 0.5 });
      m.box([x0, y0, z0 - 0.3], [x1, y1, z0], creamTile, { solid: false, priority: 0.5 });
      m.box([x0, y0, z1], [x1, y1, z1 + 0.3], creamTile, { solid: false, priority: 0.5 });
      m.skylight(x0, z0, x1, z1, y1, { color: [0.76, 0.92, 1.0], intensity: 3.4 });
    };
    addShaft(-4.0, -1.2, 2.2, 5.2, 5.8, 7.6);
    addShaft(-2.8, -13.4, 2.8, -8.6, 5.8, 7.6);

    // Three signature semicircular arch colonnade walls creating deep Poolrooms layering.
    m.wallWithArch([-8, 0, 1.6], [8, 5.8, 2.45], {
      material: archTile,
      arches: [
        { pos: -5.1, radius: 1.75, spring: 2.45 },
        { pos: 0.0, radius: 1.95, spring: 2.55 },
        { pos: 5.1, radius: 1.75, spring: 2.45 },
      ],
    });

    m.wallWithArch([-8, 0, -5.8], [8, 5.8, -4.95], {
      material: archTile,
      arches: [
        { pos: -4.2, radius: 1.85, spring: 2.5 },
        { pos: 4.2, radius: 1.85, spring: 2.5 },
      ],
    });

    m.wallWithArch([-8, 0, -11.4], [8, 5.8, -10.6], {
      material: archTile,
      arches: [{ pos: 0.0, radius: 2.4, spring: 2.4 }],
    });

    // Round mosaic-tiled columns flanking the skylight atrium.
    m.cylinder(-4.2, -2.0, 0, 5.8, 0.52, mosaicCol);
    m.cylinder(4.2, -2.0, 0, 5.8, 0.52, mosaicCol);
    m.cylinder(-4.8, -8.5, 0, 5.8, 0.58, mosaicCol);
    m.cylinder(4.8, -8.5, 0, 5.8, 0.58, mosaicCol);

    // Raised dry tiled promenade deck along the left wall + walkable submerged entry steps.
    m.box([-8, 0, 2.45], [-5.8, 0.62, 13], creamTile, { walkable: true });
    m.stairs([-5.8, 0, 5.8], [-4.5, 0.62, 8.6], "-x", 4, poolFloor);
    // Stainless steel pool ladder descending from deck edge into the sunlit basin.
    m.poolLadder(-5.68, 4.1, 0.02, 0.62, { facing: "+x", rungs: 3 });

    // Low tiled underwater bench along the right wall.
    m.box([6.6, 0, 2.45], [8, 0.34, 11.5], poolFloor, { walkable: true });

    // Subtle warm recessed cove lights in the deep rear gallery for atmospheric contrast.
    m.panelLight([-5.6, 5.79, -13.8], 1.1, 0.5, { color: [1.0, 0.90, 0.70], intensity: 9.0, material: warmCove });
    m.panelLight([5.6, 5.79, -13.8], 1.1, 0.5, { color: [1.0, 0.90, 0.70], intensity: 9.0, material: warmCove });

    // Interactive finite-depth water covering the entire hall floor.
    m.water(-8, -16, 8, 13, 0.44, {
      absorption: [0.58, 0.13, 0.075],
      waveAmp: 0.014,
      causticStrength: 1.55,
      cellSize: 0.08,
    });

    m.bookmark("Sunlit Colonnade", { x: 1.6, y: 1.65, z: 9.8, yaw: 0.14, pitch: -0.05 });
    m.bookmark("Atrium Pillars", { x: -4.4, y: 1.65, z: 0.4, yaw: -0.26, pitch: -0.05 });
    m.bookmark("Promenade Steps", { x: -6.7, y: 2.27, z: 9.5, yaw: -0.52, pitch: -0.14 });
  },
};
