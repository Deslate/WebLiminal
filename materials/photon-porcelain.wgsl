// Area-averaged BRDF for the 4.17 cm world-light cells. Camera relief is
// evaluated separately; do not pay microscopic derivatives on every photon.
fn surfaceMaterial(h:Hit)->Material {
  let uv=tileUV(h);let n=h.n;
  if(h.material==1u){return Material(vec3f(.71,.69,.62)*(.86+.14*fbm(uv*.61)),.7,n,.025);}
  let fields=porcelainFields(h.p);
  return Material(porcelainColor(h.p,h.material,fields),.17+.08*fields.z,n,.043);
}
