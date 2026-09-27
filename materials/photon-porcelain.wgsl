// Area-averaged BRDF for the 4.17 cm world-light cells. Camera relief is
// evaluated separately; do not pay microscopic derivatives on every photon.
fn wallPhotonMaterial(h:Hit)->Material {
  let uv=tileUV(h);let n=h.n;
  if(h.material==1u){return Material(vec3f(.71,.69,.62)*(.86+.14*fbm(uv*.61)),.7,n,.025);}
  var size=vec2f(.25);let mode=tileMode(h);if(mode==1u||mode==2u){size.x=PI*shapes[h.sid/9u].params.x/32.;}let id=hash2(floor(uv/size)+vec2f(tileSeed(h.sid,mode)*17.19,0));
  var albedo=mix(vec3f(.57,.59,.49),vec3f(.80,.78,.66),id*.65+.18)*.94;
  if(h.material==2u){albedo=mix(vec3f(.37,.55,.47),vec3f(.52,.65,.57),id)*.94;}
  return Material(albedo,.17+.08*id,n,.043);
}

// Area-averaged BRDF for the 4.17 cm world-light cells. Camera relief is
// evaluated separately; do not pay microscopic derivatives on every photon.
fn floorPhotonMaterial(h:Hit)->Material {
  let uv=tileUV(h);let n=h.n;
  if(h.material==1u){return Material(vec3f(.71,.69,.62)*(.86+.14*fbm(uv*.61)),.7,n,.025);}
  return Material(vec3f(.445,.60,.52),.20,n,.043);
}

fn surfaceMaterial(h:Hit)->Material {if(h.material==2u){return floorPhotonMaterial(h);}return wallPhotonMaterial(h);}
