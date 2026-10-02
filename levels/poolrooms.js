// Poolrooms level module: data, scene builder and material sources.
import data from "./poolrooms.json";
import near from "../materials/porcelain.wgsl?raw";
import photon from "../materials/photon-porcelain.wgsl?raw";
import steel from "../materials/stainless-steel.wgsl?raw";
import { buildPoolroomsScene } from "./poolrooms-scene.js";
import { createPoolroomsWorld } from "./poolrooms-regions.js";

// Only the new windows use the metal slot; the original shaders stay identical.
const metal = 'if(h.material==3u){return stainlessSteel(h);}';
const regionMaterials = {
  near: steel + near.replace('fn filteredMaterial(h:Hit)->Material {', 'fn filteredMaterial(h:Hit)->Material {' + metal)
    .replace('fn surfaceBaseMaterial(h:Hit)->Material {', 'fn surfaceBaseMaterial(h:Hit)->Material {' + metal)
    .replace('fn surfaceMaterial(h:Hit)->Material {', 'fn surfaceMaterial(h:Hit)->Material {' + metal),
  photon: steel + photon.replace('fn surfaceMaterial(h:Hit)->Material {', 'fn surfaceMaterial(h:Hit)->Material {' + metal),
};
// Smaller tonal variation and wider GGX lobes on clean glazed ceramic. The
// original material source is retained verbatim by the origin window.
const cleanPorcelain = source => source
  .replaceAll('.57,.59,.49', '.69,.71,.62')
  .replaceAll('.80,.78,.66', '.77,.78,.70')
  .replaceAll('.128,.14,.113', '.23,.25,.20')
  .replaceAll('.15,.165,.133', '.23,.25,.20')
  .replaceAll('.17+.10*t.id', '.25+.04*t.id')
  .replaceAll('.10+.13*t.id', '.22+.06*t.id')
  .replaceAll('.17+.08*id', '.25+.04*id');
const refinedMaterials = {near:cleanPorcelain(regionMaterials.near),photon:cleanPorcelain(regionMaterials.photon)};
regionMaterials.columns=refinedMaterials;
regionMaterials.rotunda=refinedMaterials;

export default {
  ...data,
  materials: { near, photon },
  world: createPoolroomsWorld(data, regionMaterials),
  limits: { apertureWidth: [0.5, 7.8], apertureDepth: [0.5, 9] },
  scene: (options) => buildPoolroomsScene(data, options),
};
