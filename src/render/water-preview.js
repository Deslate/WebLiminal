// Fine waves are the shared default. The wider excitation bandwidth is an
// intentional visual choice, not measured environmental forcing. Heights,
// normals, refraction and photon caustics all use the same evolved surface.
export function waterPreview(name) {
  const previews = {
    fine: { pressurePasses: 4, detail: false },
    // A's spatial bandwidth, driven by coherent advected pressure, not white noise.
    wind: { pressurePasses: 4, detail: false, excitation: 4 },
    gust: { pressurePasses: 4, detail: false, excitation: 5 },
    // Authored physical source scenarios, not cosmetic surface layers.
    swell: { pressurePasses: 4, detail: false, excitation: 1 },
    mixed: { pressurePasses: 4, detail: false, excitation: 2 },
    settle: { pressurePasses: 4, detail: false, excitation: 3 },
    // Reduced short-wave excitation density: visual alternatives to fine.
    moderate: { pressurePasses: 5, detail: false },
    gentle: { pressurePasses: 6, detail: false },
    calm: { pressurePasses: 8, detail: false },
    dense: { pressurePasses: 2, detail: false },
    detail: { pressurePasses: 8, detail: true },
  };
  return Object.hasOwn(previews, name) ? previews[name] : previews.fine;
}

export function waterPreviewCamera(source, preview, conductorMaterials = []) {
  if (!preview.detail) return source;
  const original = 'return shadeHit(traceDynamicSolid(ro,rd,INF),rd,underwater);';
  if (!source.includes(original)) throw Error('Water detail preview hook missing');
  const ceramic = conductorMaterials.map(id => ` && base.material!=${id}u`).join('');
  return source.replace(original, `let base=traceDynamicSolid(ro,rd,INF);
  if(underwater && base.t<INF && base.material!=10u${ceramic}){
    let h=reliefHit(ro,rd,base);
    return shadeMaterial(h,rd,true,surfaceMaterial(h),true);
  }
  return shadeHit(base,rd,underwater);`);
}
