// Level 0 · The Lobby (Backrooms).
// Zero water, zero custom shaders: pure declarative architecture + seeded maze bays.
// Demonstrates arbitrary recessed fluorescent area lights, warm mono-yellow GI, and damp carpet/wallpaper PBR.

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default {
  id: "level0",
  title: "Level 0 · The Lobby",
  subtitle: "MONO-YELLOW",
  audio: "backrooms",
  spawn: { x: -0.4, y: 1.65, z: 9.2, yaw: 0.06, pitch: -0.02 },
  atmosphere: {
    fogColor: [0.16, 0.13, 0.055],
    fogDensity: 0.016,
    heightFogFalloff: 0.25,
    skyTop: [0.01, 0.01, 0.008],
    skyHorizon: [0.015, 0.013, 0.008],
    sun: null,
    exposure: 1.15,
    bloomStrength: 0.26,
    volumetricStrength: 0.22,
    ambientFloor: 0.004,
    bounceBoost: 1.38,
    aoRadius: 1.5,
  },

  build(m, opts = {}) {
    const rng = mulberry32(opts.seed ?? 404);
    const H = 3.15;

    const wallpaper = m.material({ base: "wallpaper_yellow", tint: [1.05, 0.96, 0.78] });
    const wallpaperAlt = m.material({ base: "wallpaper_yellow", tint: [0.96, 0.89, 0.72], seed: 21.4 });
    const carpet = m.material({ base: "carpet_damp", tint: [0.95, 0.86, 0.68] });
    const ceiling = m.material({ base: "ceiling_grid", tint: [1.02, 0.96, 0.82] });
    const trim = m.material({ base: "wood_trim", tint: [0.85, 0.78, 0.68] });

    // Share 3 fluorescent diffuser material layers across all 11 fixtures for fast startup baking!
    const lampBright = m.material({ base: "fluorescent_panel", emissive: [1.0, 0.93, 0.68], emissiveStrength: 15.0 });
    const lampWarm = m.material({ base: "fluorescent_panel", emissive: [1.0, 0.89, 0.60], emissiveStrength: 11.0 });
    const lampFlicker = m.material({ base: "fluorescent_panel", emissive: [0.98, 0.86, 0.54], emissiveStrength: 7.0, flicker: 0.55 });

    m.room([-13, 0, -13], [13, H, 13], {
      floor: carpet,
      ceiling,
      walls: wallpaper,
      trim,
      trimHeight: 0.13,
    });

    m.wallWithDoorway([-13, 0, 3.8], [5.5, H, 4.12], {
      material: wallpaper,
      trim,
      openings: [
        { pos: -7.5, width: 2.5, top: 2.55 },
        { pos: -0.6, width: 2.8, top: 2.65 },
      ],
    });

    m.wallWithDoorway([-4.5, 0, -2.4], [13, H, -2.08], {
      material: wallpaperAlt,
      trim,
      openings: [
        { pos: 0.5, width: 2.9, top: 2.65 },
        { pos: 7.4, width: 2.4, top: 2.55 },
      ],
    });

    m.wallWithDoorway([-13, 0, -7.8], [7.8, H, -7.48], {
      material: wallpaper,
      trim,
      openings: [
        { pos: -6.8, width: 2.6, top: 2.6 },
        { pos: 2.2, width: 2.5, top: 2.55 },
      ],
    });

    m.wallWithDoorway([5.5, 0, 1.0], [5.82, H, 13], {
      material: wallpaperAlt,
      trim,
      openings: [{ pos: 7.6, width: 2.4, top: 2.55 }],
    });

    m.wallWithDoorway([-5.6, 0, -7.48], [-5.28, H, 3.8], {
      material: wallpaper,
      trim,
      openings: [{ pos: -0.6, width: 2.6, top: 2.6 }],
    });

    m.box([4.2, 0, -9.8], [4.52, H, -5.2], wallpaperAlt);
    m.box([-9.2, 0, 6.2], [-8.88, H, 10.6], wallpaper);

    const pillars = [
      [-3.1, 8.2],
      [2.8, 7.6],
      [-2.2, 0.8],
      [3.6, 0.4],
      [-1.4, -5.1],
      [8.2, -5.4],
      [-8.4, -4.6],
      [0.4, -10.2],
    ];
    for (const [px, pz] of pillars) {
      const r = 0.34;
      m.box([px - r, 0, pz - r], [px + r, H, pz + r], wallpaper);
      m.box([px - r - 0.02, 0, pz - r - 0.02], [px + r + 0.02, 0.13, pz + r + 0.02], trim, { solid: false, priority: 0.25 });
    }

    m.box([-12.98, 2.45, 5.8], [-12.92, 2.82, 6.6], "vent_grate", { solid: false, priority: 0.3 });
    m.box([5.45, 2.45, 9.2], [5.50, 2.82, 10.0], "vent_grate", { solid: false, priority: 0.3 });

    const lightGrid = [
      { x: -0.4, z: 7.4, int: 15.0, col: [1.0, 0.93, 0.68], mat: lampBright },
      { x: -6.8, z: 8.0, int: 11.0, col: [1.0, 0.89, 0.60], mat: lampWarm },
      { x: 9.2, z: 8.2, int: 11.0, col: [1.0, 0.89, 0.60], mat: lampWarm },
      { x: -0.5, z: 1.0, int: 15.0, col: [1.0, 0.93, 0.68], mat: lampBright },
      { x: 7.4, z: 1.4, int: 6.5, col: [0.98, 0.86, 0.54], mat: lampFlicker, flicker: 0.55 },
      { x: -9.5, z: 0.6, int: 10.0, col: [1.0, 0.89, 0.60], mat: lampWarm },
      { x: 0.6, z: -5.0, int: 15.0, col: [1.0, 0.93, 0.68], mat: lampBright },
      { x: 8.4, z: -6.2, int: 9.5, col: [1.0, 0.89, 0.60], mat: lampWarm },
      { x: -8.6, z: -5.4, int: 5.5, col: [0.98, 0.86, 0.54], mat: lampFlicker, flicker: 0.35 },
      { x: -1.6, z: -10.6, int: 14.0, col: [1.0, 0.93, 0.68], mat: lampBright },
      { x: 7.2, z: -10.8, int: 10.5, col: [1.0, 0.89, 0.60], mat: lampWarm },
    ];
    for (const l of lightGrid) {
      const jx = (rng() - 0.5) * 0.14;
      const jz = (rng() - 0.5) * 0.14;
      m.panelLight([l.x + jx, H, l.z + jz], 1.22, 0.62, {
        color: l.col,
        intensity: l.int,
        material: l.mat,
        flicker: l.flicker ?? 0,
      });
    }

    m.bookmark("Main Corridor", { x: -0.4, y: 1.65, z: 9.2, yaw: 0.06, pitch: -0.02 });
    m.bookmark("Dim Partition", { x: 3.4, y: 1.65, z: 1.6, yaw: 0.65, pitch: -0.03 });
    m.bookmark("Deep Hall", { x: -2.2, y: 1.65, z: -4.4, yaw: -0.24, pitch: -0.02 });
  },
};
