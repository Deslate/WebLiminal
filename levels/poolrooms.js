// Poolrooms level module: data, scene builder and material sources.
import data from "./poolrooms.json";
import near from "../materials/porcelain.wgsl?raw";
import photon from "../materials/photon-porcelain.wgsl?raw";
import { buildPoolroomsScene } from "./poolrooms-scene.js";
import { createPoolroomsWorld } from "./poolrooms-regions.js";

// Only the new windows use the metal slot; the original shaders stay identical.
const metal = 'if(h.material==3u){return Material(vec3f(.34,.39,.36),.14,h.n,.72);}';
const regionMaterials = {
  near: near.replace('fn filteredMaterial(h:Hit)->Material {', 'fn filteredMaterial(h:Hit)->Material {' + metal)
    .replace('fn surfaceBaseMaterial(h:Hit)->Material {', 'fn surfaceBaseMaterial(h:Hit)->Material {' + metal),
  photon: photon.replace('fn surfaceMaterial(h:Hit)->Material {', 'fn surfaceMaterial(h:Hit)->Material {' + metal),
};

export default {
  ...data,
  materials: { near, photon },
  world: createPoolroomsWorld(data, regionMaterials),
  limits: { apertureWidth: [0.5, 7.8], apertureDepth: [0.5, 9] },
  scene: (options) => buildPoolroomsScene(data, options),
};
