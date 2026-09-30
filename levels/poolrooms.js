// Poolrooms level module: data, scene builder and material sources.
import data from "./poolrooms.json";
import near from "../materials/porcelain.wgsl?raw";
import photon from "../materials/photon-porcelain.wgsl?raw";
import { buildPoolroomsScene } from "./poolrooms-scene.js";

export default {
  ...data,
  materials: { near, photon },
  limits: { apertureWidth: [0.5, 7.8], apertureDepth: [0.5, 9] },
  scene: (options) => buildPoolroomsScene(data, options),
};
