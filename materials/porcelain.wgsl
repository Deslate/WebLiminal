// Footprint-filtered secondary-ray material; keep the same individual tile
// boundaries/colour. Microscopic glaze slopes are integrated into roughness.
fn filteredMaterial(h:Hit)->Material {
  let uv=tileUV(h);let n=h.n;
  if(h.material==1u){return Material(vec3f(.71,.69,.62)*(.86+.14*noise(uv*.61)),.7,n,.025);}
  let t=tileProfile(uv,h.sid,h.material);
  let footprint=clamp(length(U.camera.xyz-h.p)*U.lens.y/f32(U.render.y)/max(abs(dot(n,normalize(U.camera.xyz-h.p))),.2),.00012,.06);
  let seam=1.-smoothstep(-footprint,t.bevel+footprint,t.edge);
  var color=mix(vec3f(.57,.59,.49),vec3f(.80,.78,.66),t.id*.65+.18);
  if(h.material==2u){color=mix(vec3f(.37,.55,.47),vec3f(.52,.65,.57),t.id);}
  color*=.94-.15*exp(-abs(h.p.y-U.state.y-.045)/.08);
  return Material(mix(color,vec3f(.128,.14,.113),seam),mix(.17+.10*t.id,.86,seam),n,mix(.047,.006,seam));
}
// Shared material slot; all variation uses metres and stable independent tile ids.
fn surfaceMaterial(h:Hit)->Material {
  let uv=tileUV(h);let n=h.n;
  if(h.material==1u){return Material(vec3f(.71,.69,.62)*(.86+.14*fbm(uv*.61)),.7,n,.025);}
  let distance=length(U.camera.xyz-h.p);
  if(distance>=5.){return filteredMaterial(h);}
  let t=tileProfile(uv,h.sid,h.material);let f=tileFrame(h);
  let footprint=select(.0001,clamp(distance*U.lens.y/f32(U.render.y)/max(abs(dot(n,normalize(U.camera.xyz-h.p))),.15),.00006,.06),U.sampling.y==1u);
  let detail=1.-smoothstep(.0007,.005,footprint);
  let seam=1.-smoothstep(-footprint,t.bevel+footprint,t.edge);
  let seed=vec2f(t.id*173.1,f32(h.sid)*13.71);
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
  let coarse=filteredMaterial(h);let lod=smoothstep(3.,5.,distance);
  return Material(mix(color,coarse.albedo,lod),mix(mix(rough,.86,seam),coarse.roughness,lod),normalize(mix(normal,coarse.normal,lod)),mix(.047,.006,seam));
}
