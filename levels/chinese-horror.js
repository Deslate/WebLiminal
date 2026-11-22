// Chinese horror corridor level module: dry floor, candle & ember point lights,
// procedural mud-plaster, dark timber double door, and SDF calligraphy couplets.
import near from "../materials/chinese-horror.wgsl?raw";
import photon from "../materials/photon-chinese-horror.wgsl?raw";
import { buildChineseHorrorScene, CHINESE_HORROR_BOOKMARKS } from "./chinese-horror-scene.js";

const defaultOptics = {
  waterLevel: 0,
  waveAmplitude: 0,
  waveSpeed: 0,
  bodyWakeBoost: 0,
  apertureWidth: 0.85,
  apertureDepth: 1.45,
  exposure: 1.65,
  focalLength: 28,
  lightBatches: 32,
};

const defaultLimits = {
  apertureWidth: [0.3, 0.95],
  apertureDepth: [0.4, 1.8],
};

const bookmarks = CHINESE_HORROR_BOOKMARKS.map((b, i) => ({
  name: b.name,
  address: { x: i, z: 0 },
}));

export default {
  id: "chinese-horror",
  title: "Old Courtyard Corridor",
  subtitle: "CANDLELIGHT VIGIL",
  indexLabel: "CHINESE HORROR",
  audioProfile: "horror",
  spawn: { ...CHINESE_HORROR_BOOKMARKS[0].spawn },
  optics: defaultOptics,
  limits: defaultLimits,
  materials: { near, photon },
  scene: (options) => buildChineseHorrorScene(options),
  world: {
    bookmarks,
    generate(address) {
      if (!Number.isSafeInteger(address.x) || !Number.isSafeInteger(address.z)) {
        throw Error("Invalid world address");
      }
      const entry = CHINESE_HORROR_BOOKMARKS[address.x];
      if (address.z !== 0 || !entry) {
        throw Error(`Unloaded Chinese horror address: ${address.x},${address.z}`);
      }
      return {
        spawn: { ...entry.spawn },
        optics: { ...defaultOptics },
        limits: defaultLimits,
        materials: { near, photon },
        scene: (options) => buildChineseHorrorScene(options),
      };
    },
  },
};
