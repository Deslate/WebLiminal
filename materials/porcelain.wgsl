// v1.19: restore v1.17 wall finish exactly; retain floor finish for diagnosis.
// Footprint-filtered secondary-ray material; keep the same individual tile
// boundaries/colour. Microscopic glaze slopes are integrated into roughness.
fn wallFilteredMaterial(h:Hit)->Material {
  let uv=tileUV(h);let n=h.n;
  if(h.material==1u){return Material(vec3f(.71,.69,.62)*(.86+.14*noise(uv*.61)),.7,n,.025);}
  let t=tileProfile(uv,h.sid,h.material,tileMode(h));
  let footprint=clamp(length(U.camera.xyz-h.p)*U.lens.y/f32(U.render.y)/max(abs(dot(n,normalize(U.camera.xyz-h.p))),.2),.00012,.06);
  let seam=1.-smoothstep(-footprint,t.bevel+footprint,t.edge);
  var color=mix(vec3f(.57,.59,.49),vec3f(.80,.78,.66),t.id*.65+.18);
  if(h.material==2u){color=mix(vec3f(.37,.55,.47),vec3f(.52,.65,.57),t.id);}
  color*=.94-.15*exp(-abs(h.p.y-U.state.y-.045)/.08);
  return Material(mix(color,vec3f(.128,.14,.113),seam),mix(.17+.10*t.id,.86,seam),n,mix(.047,.006,seam));
}
// Shared material slot; all variation uses metres and stable independent tile ids.
fn wallSurfaceMaterial(h:Hit)->Material {
  let uv=tileUV(h);let n=h.n;
  if(h.material==1u){return Material(vec3f(.71,.69,.62)*(.86+.14*fbm(uv*.61)),.7,n,.025);}
  let distance=length(U.camera.xyz-h.p);
  if(distance>=5.){return wallFilteredMaterial(h);}
  let t=tileProfile(uv,h.sid,h.material,tileMode(h));let f=tileFrame(h);
  let footprint=select(.0001,clamp(distance*U.lens.y/f32(U.render.y)/max(abs(dot(n,normalize(U.camera.xyz-h.p))),.15),.00006,.06),U.sampling.y==1u);
  let detail=1.-smoothstep(.0007,.005,footprint);
  let seam=1.-smoothstep(-footprint,t.bevel+footprint,t.edge);
  let seed=vec2f(t.id*173.1,tileSeed(h.sid,tileMode(h))*13.71);
  var color=mix(vec3f(.57,.59,.49),vec3f(.80,.78,.66),t.id*.65+.18);
  if(h.material==2u){color=mix(vec3f(.37,.55,.47),vec3f(.52,.65,.57),t.id);}
  let mineral=smoothstep(.43,.70,fbm(uv*4.7+seed))*exp(-max(0.,t.edge)/.025);
  let streak=pow(noise(vec2f(uv.x*39.,uv.y*2.3)+seed),3.);
  let waterline=exp(-abs(h.p.y-U.state.y-.045)/.08);
  color*=1.-mineral*.13-streak*.065-waterline*.20;
  let chip=(1.-smoothstep(.001,.008,t.edge))*smoothstep(.60,.84,noise(uv*217.+seed));
  color=mix(color,vec3f(.31,.30,.24),chip*.35*detail);
  let scaleDeposit=smoothstep(.58,.79,noise(uv*17.3+seed)+noise(uv*61.7-seed)*.14)*(.18+.65*mineral);
  color=mix(color,vec3f(.69,.70,.61),scaleDeposit*.22);
  let dirt=fbm(uv*71.9+seed);
  let grout=vec3f(.15,.165,.133)*(.62+.38*dirt)*(1.-waterline*.28);
  color=mix(color,grout,seam);
  color*=1.+(noise(uv*491.3+seed)-.5)*.035*detail;
  // Derivatives of actual rounded relief + independent glaze undulations.
  let micro=vec2f(noise(uv*137.3+seed),noise(uv*143.7-seed))-.5;
  let waviness=vec2f(noise(uv*23.7+seed),noise(uv*27.1-seed))-.5;
  let slope=t.slope*(1.-smoothstep(.002,.018,footprint))+(micro*.024*detail+waviness*.016)*(1.-seam);
  let normal=normalize(n-f[0]*slope.x-f[1]*slope.y);
  let rough=.10+.13*t.id+scaleDeposit*.13+mineral*.055;
  if(distance<=3.){return Material(color,mix(rough,.86,seam),normal,mix(.047,.006,seam));}
  let coarse=wallFilteredMaterial(h);let lod=smoothstep(3.,5.,distance);
  return Material(mix(color,coarse.albedo,lod),mix(mix(rough,.86,seam),coarse.roughness,lod),normalize(mix(normal,coarse.normal,lod)),mix(.047,.006,seam));
}

// Secondary rays share world-space dirt and pigment with primary rays.
// Microscopic glaze slopes are integrated into roughness.
fn floorFilteredMaterial(h:Hit)->Material {
  let uv=tileUV(h);let n=h.n;
  if(h.material==1u){return Material(vec3f(.71,.69,.62)*(.86+.14*noise(uv*.61)),.7,n,.025);}
  let t=tileProfile(uv,h.sid,h.material,tileMode(h));
  let footprint=clamp(length(U.camera.xyz-h.p)*U.lens.y/f32(U.render.y)/max(abs(dot(n,normalize(U.camera.xyz-h.p))),.2),.00012,.06);
  let seam=1.-smoothstep(-footprint,t.bevel+footprint,t.edge);
  let fields=porcelainFields(h.p);let color=porcelainColor(h.p,h.material,fields);
  let grout=vec3f(.15,.165,.133)*(.60+.40*fields.z);
  return Material(mix(color,grout,seam),mix(.18+.10*fields.z+.09*fields.y,.86,seam),n,mix(.047,.006,seam));
}
// Shared world-space finish; tile-local data only controls constructed relief.
fn floorSurfaceMaterial(h:Hit)->Material {
  let uv=tileUV(h);let n=h.n;
  if(h.material==1u){return Material(vec3f(.71,.69,.62)*(.86+.14*fbm(uv*.61)),.7,n,.025);}
  let distance=length(U.camera.xyz-h.p);
  if(distance>=5.){return floorFilteredMaterial(h);}
  let t=tileProfile(uv,h.sid,h.material,tileMode(h));let f=tileFrame(h);
  let footprint=select(.0001,clamp(distance*U.lens.y/f32(U.render.y)/max(abs(dot(n,normalize(U.camera.xyz-h.p))),.15),.00006,.06),U.sampling.y==1u);
  let detail=1.-smoothstep(.0007,.005,footprint);
  let seam=1.-smoothstep(-footprint,t.bevel+footprint,t.edge);
  let fields=porcelainFields(h.p);var color=porcelainColor(h.p,h.material,fields);
  let detailPoint=h.p;
  let chip=(1.-smoothstep(.001,.008,t.edge))*smoothstep(.64,.85,materialNoise(detailPoint*217.3+vec3f(9.2,3.7,1.8)));
  color=mix(color,vec3f(.31,.30,.24),chip*.35*detail);
  let dirt=materialNoise(detailPoint*71.9+vec3f(1.7,6.2,9.1));
  let grout=vec3f(.15,.165,.133)*(.60+.40*fields.z)*(.85+.15*dirt);
  color=mix(color,grout,seam);
  color*=1.+(materialNoise(detailPoint*491.3)-.5)*.035*detail;
  let micro=vec2f(materialNoise(detailPoint*137.3),materialNoise(detailPoint*143.7+vec3f(8.3,2.4,7.1)))-.5;
  let waviness=vec2f(materialNoise(detailPoint*23.7),materialNoise(detailPoint*27.1+vec3f(2.7,8.1,1.2)))-.5;
  let slope=t.slope*(1.-smoothstep(.002,.018,footprint))+(micro*.024*detail+waviness*.016)*(1.-seam);
  let normal=normalize(n-f[0]*slope.x-f[1]*slope.y);
  let rough=.10+.13*fields.z+fields.y*.13+fields.x*.055;
  if(distance<=3.){return Material(color,mix(rough,.86,seam),normal,mix(.047,.006,seam));}
  let coarse=floorFilteredMaterial(h);let lod=smoothstep(3.,5.,distance);
  return Material(mix(color,coarse.albedo,lod),mix(mix(rough,.86,seam),coarse.roughness,lod),normalize(mix(normal,coarse.normal,lod)),mix(.047,.006,seam));
}

fn filteredMaterial(h:Hit)->Material {if(h.material==2u){return floorFilteredMaterial(h);}return wallFilteredMaterial(h);}
fn surfaceMaterial(h:Hit)->Material {if(h.material==2u){return floorSurfaceMaterial(h);}return wallSurfaceMaterial(h);}
