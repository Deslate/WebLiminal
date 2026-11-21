// Opt-in shared-renderer previews. Production is deliberately unchanged.
export function waterPreview(name) {
  const previews = {
    fine: { pressurePasses: 4, detail: false },
    dense: { pressurePasses: 2, detail: false },
    detail: { pressurePasses: 8, detail: true },
  };
  return Object.hasOwn(previews, name) ? previews[name] : { pressurePasses: 8, detail: false };
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
