// Built-in procedural PBR material library for Backrooms & Liminal Spaces.
// All textures are synthesized on the GPU at startup (zero bitmap assets).
// Levels reference presets by name or register lightweight parametric overrides.

export const MATERIAL_PRESETS = {
  tile_white: {
    presetId: 0,
    albedo: [0.76, 0.755, 0.675], // authentic warm architectural alabaster porcelain (matches v1 porcelain.wgsl)
    roughness: 0.145,
    metallic: 0.0,
    coat: 0.88,
    tileScale: 1.25, // 5x5 tiles per meter (200 mm architectural porcelain)
    pomDepth: 0.004,
    emissive: [0, 0, 0],
    emissiveStrength: 0,
    wetness: 0.0,
    seed: 1.0,
  },
  tile_pool: {
    presetId: 1,
    albedo: [0.73, 0.745, 0.675], // warm neutral pool porcelain; emerald-jade hue arises purely from Beer-Lambert water optics
    roughness: 0.16,
    metallic: 0.0,
    coat: 0.84,
    tileScale: 1.25,
    pomDepth: 0.004,
    emissive: [0, 0, 0],
    emissiveStrength: 0,
    wetness: 0.35,
    seed: 2.0,
  },
  tile_mosaic: {
    presetId: 2,
    albedo: [0.75, 0.75, 0.675],
    roughness: 0.155,
    metallic: 0.0,
    coat: 0.86,
    tileScale: 1.0, // 8x8 fine mosaic tiles per meter (125 mm)
    pomDepth: 0.003,
    emissive: [0, 0, 0],
    emissiveStrength: 0,
    wetness: 0.15,
    seed: 3.0,
  },
  plaster_warm: {
    presetId: 3,
    albedo: [0.76, 0.74, 0.66],
    roughness: 0.82,
    metallic: 0.0,
    coat: 0.04,
    tileScale: 0.5,
    pomDepth: 0.004,
    emissive: [0, 0, 0],
    emissiveStrength: 0,
    wetness: 0.0,
    seed: 4.0,
  },
  wallpaper_yellow: {
    presetId: 4,
    albedo: [0.86, 0.83, 0.59], // authentic 2002 HobbyTown Oshkosh pale cream-yellow wallpaper
    roughness: 0.82,
    metallic: 0.0,
    coat: 0.0,
    tileScale: 0.833333, // 1.20 m repeat (2 exact 0.60 m wallpaper rolls)
    pomDepth: 0.0025,
    emissive: [0, 0, 0],
    emissiveStrength: 0,
    wetness: 0.04,
    seed: 5.0,
  },
  carpet_damp: {
    presetId: 5,
    albedo: [0.49, 0.39, 0.22], // warm camel-tan / mocha commercial broadloom cut-pile carpet
    roughness: 0.94,
    metallic: 0.0,
    coat: 0.0,
    tileScale: 1.4,
    pomDepth: 0.009,
    emissive: [0, 0, 0],
    emissiveStrength: 0,
    wetness: 0.14,
    seed: 6.0,
  },
  ceiling_grid: {
    presetId: 6,
    albedo: [0.88, 0.87, 0.78], // clean bright warm-ivory commercial acoustic mineral tiles
    roughness: 0.88,
    metallic: 0.0,
    coat: 0.0,
    tileScale: 0.833333, // 1.20 m x 0.60 m commercial drop ceiling grid
    pomDepth: 0.006,
    emissive: [0, 0, 0],
    emissiveStrength: 0,
    wetness: 0.0,
    seed: 7.0,
  },
  wood_trim: {
    presetId: 7,
    albedo: [0.46, 0.37, 0.22], // commercial tan-oak baseboard & cove rail (matching original photo)
    roughness: 0.54,
    metallic: 0.0,
    coat: 0.14,
    tileScale: 1.0,
    pomDepth: 0.002,
    emissive: [0, 0, 0],
    emissiveStrength: 0,
    wetness: 0.0,
    seed: 8.0,
  },
  concrete_raw: {
    presetId: 8,
    albedo: [0.54, 0.54, 0.50], // weathered warm-grey architectural poured concrete
    roughness: 0.88,
    metallic: 0.0,
    coat: 0.0,
    tileScale: 0.625, // 1.60 m poured formwork grain cycle (no uniform polka-dot tie holes)
    pomDepth: 0.008,
    emissive: [0, 0, 0],
    emissiveStrength: 0,
    wetness: 0.26,
    seed: 9.0,
  },
  concrete_floor: {
    presetId: 9,
    albedo: [0.31, 0.30, 0.27], // gritty dark oil-worn concrete parking deck slab
    roughness: 0.84,
    metallic: 0.0,
    coat: 0.04,
    tileScale: 0.5, // 2.0 m rough concrete aggregate base
    pomDepth: 0.007,
    emissive: [0, 0, 0],
    emissiveStrength: 0,
    wetness: 0.78,
    seed: 10.0,
  },
  concrete_painted: {
    presetId: 10,
    albedo: [0.68, 0.69, 0.65], // weathered chalky off-white painted parking columns
    roughness: 0.76,
    metallic: 0.0,
    coat: 0.04,
    tileScale: 0.55,
    pomDepth: 0.006,
    emissive: [0, 0, 0],
    emissiveStrength: 0,
    wetness: 0.10,
    seed: 11.0,
  },
  stainless_steel: {
    presetId: 11,
    albedo: [0.84, 0.86, 0.88],
    roughness: 0.16,
    metallic: 0.98,
    coat: 0.0,
    tileScale: 1.5,
    pomDepth: 0.001,
    emissive: [0, 0, 0],
    emissiveStrength: 0,
    wetness: 0.0,
    seed: 12.0,
  },
  dark_metal: {
    presetId: 12,
    albedo: [0.16, 0.17, 0.18],
    roughness: 0.38,
    metallic: 0.85,
    coat: 0.0,
    tileScale: 1.0,
    pomDepth: 0.002,
    emissive: [0, 0, 0],
    emissiveStrength: 0,
    wetness: 0.0,
    seed: 13.0,
  },
  fluorescent_panel: {
    presetId: 13,
    albedo: [0.95, 0.94, 0.88],
    roughness: 0.25,
    metallic: 0.0,
    coat: 0.4,
    tileScale: 1.0,
    pomDepth: 0.004,
    emissive: [1.0, 0.95, 0.78],
    emissiveStrength: 9.0,
    wetness: 0.0,
    seed: 14.0,
  },
  exit_sign: {
    presetId: 14,
    albedo: [0.12, 0.14, 0.12],
    roughness: 0.22,
    metallic: 0.1,
    coat: 0.5,
    tileScale: 1.0,
    pomDepth: 0.002,
    emissive: [0.15, 1.0, 0.38],
    emissiveStrength: 10.0,
    wetness: 0.0,
    seed: 15.0,
  },
  vent_grate: {
    presetId: 15,
    albedo: [0.32, 0.34, 0.33],
    roughness: 0.46,
    metallic: 0.75,
    coat: 0.0,
    tileScale: 2.0,
    pomDepth: 0.018,
    emissive: [0, 0, 0],
    emissiveStrength: 0,
    wetness: 0.0,
    seed: 16.0,
  },
  tile_dado_green: {
    presetId: 16,
    albedo: [0.045, 0.19, 0.155], // deep glossy emerald ceramic dado tile
    roughness: 0.08,
    metallic: 0.0,
    coat: 0.98,
    tileScale: 1.25,
    pomDepth: 0.003,
    emissive: [0, 0, 0],
    emissiveStrength: 0,
    wetness: 0.35,
    seed: 17.0,
  },
  frosted_window: {
    presetId: 17,
    albedo: [0.96, 0.95, 0.90],
    roughness: 0.18,
    metallic: 0.0,
    coat: 0.65,
    tileScale: 1.0,
    pomDepth: 0.001,
    emissive: [1.0, 0.96, 0.86],
    emissiveStrength: 16.0,
    wetness: 0.0,
    seed: 18.0,
  },
  fiberglass_slide: {
    presetId: 18,
    albedo: [0.032, 0.105, 0.095], // dark glossy molded fiberglass pool slide
    roughness: 0.13,
    metallic: 0.0,
    coat: 0.96,
    tileScale: 1.0,
    pomDepth: 0.001,
    emissive: [0, 0, 0],
    emissiveStrength: 0,
    wetness: 0.5,
    seed: 19.0,
  },
};

export const MATERIAL_STRIDE_FLOATS = 16; // 64 bytes per MaterialGPU struct

export class MaterialTable {
  constructor() {
    this.entries = [];
    this.byKey = new Map();
  }

  resolve(spec) {
    if (typeof spec === "number") {
      if (spec < 0 || spec >= this.entries.length) {
        throw new Error(`Unknown material index: ${spec}`);
      }
      return spec;
    }
    if (typeof spec === "string") {
      if (this.byKey.has(spec)) return this.byKey.get(spec);
      const preset = MATERIAL_PRESETS[spec];
      if (!preset) {
        throw new Error(
          `Unknown material preset "${spec}". Available: ${Object.keys(MATERIAL_PRESETS).join(", ")}`,
        );
      }
      const id = this.entries.length;
      this.entries.push({ ...preset, name: spec, tint: [1, 1, 1], flicker: 0 });
      this.byKey.set(spec, id);
      return id;
    }
    if (spec && typeof spec === "object") {
      const baseName = spec.base ?? "tile_white";
      const preset = MATERIAL_PRESETS[baseName];
      if (!preset) {
        throw new Error(`Unknown base material "${baseName}".`);
      }
      const entry = {
        ...preset,
        name: spec.name ?? `${baseName}_custom_${this.entries.length}`,
        tint: spec.tint ? [...spec.tint] : [1, 1, 1],
        albedo: spec.albedo ? [...spec.albedo] : [...preset.albedo],
        roughness: spec.roughness ?? preset.roughness,
        metallic: spec.metallic ?? preset.metallic,
        coat: spec.coat ?? preset.coat,
        tileScale: spec.tileScale ?? preset.tileScale,
        pomDepth: spec.pomDepth ?? preset.pomDepth,
        emissive: spec.emissive ? [...spec.emissive] : [...preset.emissive],
        emissiveStrength: spec.emissiveStrength ?? preset.emissiveStrength,
        wetness: spec.wetness ?? preset.wetness,
        seed: spec.seed ?? preset.seed + this.entries.length * 0.37,
        flicker: spec.flicker ?? 0,
      };
      const key = JSON.stringify(entry);
      if (this.byKey.has(key)) return this.byKey.get(key);
      const id = this.entries.length;
      this.entries.push(entry);
      this.byKey.set(key, id);
      return id;
    }
    throw new Error(`Invalid material spec: ${String(spec)}`);
  }

  // Packs MaterialGPU array (64 bytes each):
  // vec4f albedoTint (albedo * tint, tileScale)
  // vec4f pbrParams  (roughness, metallic, coat, pomDepth)
  // vec4f emissive   (emissive.rgb, emissiveStrength)
  // vec4f meta       (presetId, wetness, seed, flicker)
  packGPU() {
    const count = Math.max(1, this.entries.length);
    const data = new Float32Array(count * MATERIAL_STRIDE_FLOATS);
    for (let i = 0; i < this.entries.length; i++) {
      const m = this.entries[i];
      const o = i * MATERIAL_STRIDE_FLOATS;
      data[o + 0] = m.albedo[0] * m.tint[0];
      data[o + 1] = m.albedo[1] * m.tint[1];
      data[o + 2] = m.albedo[2] * m.tint[2];
      data[o + 3] = m.tileScale;
      data[o + 4] = m.roughness;
      data[o + 5] = m.metallic;
      data[o + 6] = m.coat;
      data[o + 7] = m.pomDepth;
      data[o + 8] = m.emissive[0];
      data[o + 9] = m.emissive[1];
      data[o + 10] = m.emissive[2];
      data[o + 11] = m.emissiveStrength;
      data[o + 12] = m.presetId;
      data[o + 13] = m.wetness;
      data[o + 14] = m.seed;
      data[o + 15] = m.flicker;
    }
    return data;
  }
}
