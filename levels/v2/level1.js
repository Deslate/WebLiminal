// Level 1 · Habitable Zone (Subterranean Concrete Hall & Parking).
// Zero water simulation — showcases glossy wet concrete puddles with SSR reflections,
// brutalist structural concrete beams, procedural glowing EXIT sign, stairs, and conduits.

export default {
  id: "level1",
  title: "Level 1 · Habitable Zone",
  subtitle: "SUBTERRANEAN CONCRETE",
  audio: "parking",
  spawn: { x: 0.2, y: 1.65, z: 11.4, yaw: 0.05, pitch: -0.04 },
  atmosphere: {
    fogColor: [0.032, 0.042, 0.046],
    fogDensity: 0.017,
    heightFogFalloff: 0.28,
    skyTop: [0.006, 0.008, 0.010],
    skyHorizon: [0.012, 0.015, 0.018],
    sun: null,
    exposure: 1.18,
    bloomStrength: 0.34,
    volumetricStrength: 0.32,
    ambientFloor: 0.004,
    bounceBoost: 1.30,
    aoRadius: 2.0,
  },

  build(m) {
    const wallConcrete = m.material({ base: "concrete_raw", tint: [0.92, 0.96, 0.95], wetness: 0.28 });
    const wetFloor = m.material({ base: "concrete_floor", tint: [0.90, 0.94, 0.96], wetness: 0.85, roughness: 0.56 });
    const ceilingConcrete = m.material({ base: "concrete_raw", tint: [0.74, 0.78, 0.78], roughness: 0.88 });
    const paintedDado = m.material({ base: "concrete_painted", tint: [0.76, 0.82, 0.74], roughness: 0.65 });
    const steel = m.material({ base: "stainless_steel", roughness: 0.20 });

    const tubeCool = m.material({ base: "fluorescent_panel", emissive: [0.80, 0.93, 1.0], emissiveStrength: 22.0 });
    const tubeFlicker = m.material({ base: "fluorescent_panel", emissive: [0.78, 0.92, 1.0], emissiveStrength: 16.0, flicker: 0.45 });
    const tubeSodium = m.material({ base: "fluorescent_panel", emissive: [1.0, 0.76, 0.40], emissiveStrength: 18.0 });

    const H = 4.5;
    m.room([-11, 0, -16], [11, H, 14], {
      floor: wetFloor,
      ceiling: ceilingConcrete,
      walls: wallConcrete,
    });

    // Concrete structural cross-beams spanning the ceiling every 5.5 m
    for (let z = -12; z <= 10; z += 5.5) {
      m.box([-11, H - 0.55, z - 0.24], [11, H, z + 0.24], ceilingConcrete, { solid: false });
    }

    // Twin rows of heavy brutalist square concrete pillars with painted lower safety band
    for (const px of [-4.4, 4.4]) {
      for (const pz of [-12, -6.5, -1.0, 4.5, 10.0]) {
        m.box([px - 0.45, 0, pz - 0.45], [px + 0.45, H - 0.55, pz + 0.45], wallConcrete);
        m.box([px - 0.465, 0, pz - 0.465], [px + 0.465, 1.05, pz + 0.465], paintedDado, { solid: false, priority: 0.4 });
      }
    }

    // Far concrete partition wall with a recessed service corridor doorway + glowing EXIT sign
    m.wallWithDoorway([-11, 0, -10.2], [11, H, -9.6], {
      material: wallConcrete,
      openings: [
        { pos: 0.0, width: 3.4, top: 3.0 },
        { pos: -7.8, width: 2.2, top: 2.7 },
      ],
    });
    m.signLight([-0.68, 3.16, -9.6], [0.68, 3.62, -9.48], "+z", {
      color: [0.08, 1.0, 0.34],
      intensity: 18.0,
    });

    // Raised concrete loading platform & walkable concrete staircase along the right aisle
    m.box([6.4, 0, -9.6], [11, 1.05, 1.5], wallConcrete, { walkable: true });
    m.stairs([6.4, 0, 1.5], [9.2, 1.05, 5.2], "-z", 6, wallConcrete);
    m.pipe([6.52, 1.05, -9.4], [6.52, 2.02, -9.4], 0.028, steel);
    m.pipe([6.52, 1.05, -4.0], [6.52, 2.02, -4.0], 0.028, steel);
    m.pipe([6.52, 1.05, 1.4], [6.52, 2.02, 1.4], 0.028, steel);
    m.pipe([6.52, 2.0, -9.4], [6.52, 2.0, 1.4], 0.028, steel);
    m.pipe([6.52, 1.52, -9.4], [6.52, 1.52, 1.4], 0.022, steel);

    // Overhead industrial stainless steel ventilation conduits
    for (const x of [-2.2, -1.85, 2.1]) {
      m.pipe([x, H - 0.72, -15.8], [x, H - 0.72, 13.8], 0.075, steel);
    }
    m.box([-10.98, 2.6, 2.0], [-10.90, 3.3, 3.6], "vent_grate", { solid: false, priority: 0.3 });
    m.box([-10.98, 2.6, -5.0], [-10.90, 3.3, -3.4], "vent_grate", { solid: false, priority: 0.3 });

    // Alternating cool industrial fluorescent & warm sodium aisle lights
    m.tubeLight(0.0, H - 0.62, 8.2, 2.4, "x", { color: [0.80, 0.93, 1.0], intensity: 22.0, material: tubeCool });
    m.tubeLight(0.0, H - 0.62, 1.8, 2.4, "x", { color: [0.80, 0.93, 1.0], intensity: 22.0, material: tubeCool });
    m.tubeLight(0.0, H - 0.62, -4.6, 2.4, "x", { color: [0.78, 0.92, 1.0], intensity: 16.0, material: tubeFlicker, flicker: 0.45 });
    m.tubeLight(-7.8, H - 0.62, 5.2, 1.8, "z", { color: [1.0, 0.76, 0.40], intensity: 18.0, material: tubeSodium });
    m.tubeLight(8.6, H - 0.62, -3.8, 2.0, "z", { color: [1.0, 0.76, 0.40], intensity: 18.0, material: tubeSodium });
    m.tubeLight(0.0, H - 0.62, -13.2, 2.0, "x", { color: [0.72, 0.88, 1.0], intensity: 12.0, material: tubeCool });

    m.bookmark("Main Drive Aisle", { x: 0.2, y: 1.65, z: 11.4, yaw: 0.05, pitch: -0.04 });
    m.bookmark("Exit Portal", { x: -0.6, y: 1.65, z: -2.4, yaw: -0.08, pitch: 0.01 });
    m.bookmark("Concrete Mezzanine", { x: 8.2, y: 2.70, z: -1.8, yaw: 0.72, pitch: -0.14 });
  },
};
