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
// Hue of the white glaze, matched per window to its reference view. The
// endpoints keep their luminance, so only colour changes, not reflectance.
const glazeTint = (source, endpoints, [r, b]) => endpoints.reduce((text, e) => {
  const c = e.split(',').map(Number), t = [c[0] * r, c[1], c[2] * b];
  const k = (.2126 * c[0] + .7152 * c[1] + .0722 * c[2]) / (.2126 * t[0] + .7152 * t[1] + .0722 * t[2]);
  return text.replaceAll(e, t.map(v => (v * k).toFixed(3).replace(/^0/, '')).join(','));
}, source);
const tinted = (materials, endpoints, tint) => ({ near: glazeTint(materials.near, endpoints, tint), photon: glazeTint(materials.photon, endpoints, tint) });
const cleanWhite = ['.69,.71,.62', '.77,.78,.70'];
regionMaterials.columns=tinted(refinedMaterials, cleanWhite, [1.19, .80]);
regionMaterials.rotunda=refinedMaterials;
regionMaterials.rings=tinted(regionMaterials, ['.57,.59,.49', '.80,.78,.66'], [1.09, 1.05]);
const thresholdCeramic=source=>cleanPorcelain(source)
  .replaceAll('.37,.55,.47','.16,.36,.24')
  .replaceAll('.52,.65,.57','.26,.44,.31')
  .replaceAll('.25+.04','.45+.04')
  .replaceAll('.22+.06','.40+.06')
  .replaceAll('mineral*.13-streak*.065-waterline*.20','mineral*.05-streak*.02-waterline*.12')
  .replaceAll('chip*.35*detail','chip*.12*detail')
  .replaceAll('scaleDeposit*.22','scaleDeposit*.08');
regionMaterials.threshold=tinted({near:thresholdCeramic(regionMaterials.near),
  photon:thresholdCeramic(regionMaterials.photon)}, cleanWhite, [1.06, 1.13]);

export default {
  ...data,
  materials: { near, photon },
  world: createPoolroomsWorld(data, regionMaterials),
  limits: { apertureWidth: [0.5, 7.8], apertureDepth: [0.5, 9] },
  scene: (options) => buildPoolroomsScene(data, options),
};
