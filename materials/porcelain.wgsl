// Secondary-ray area material approximation. Primary normal moments and
// their roughness compensation are evaluated by surfaceMaterial below.
fn filteredMaterial(h:Hit)->Material {
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
fn surfaceBaseMaterial(h:Hit)->Material {
  let uv=tileUV(h);let n=h.n;
  if(h.material==1u){return Material(vec3f(.71,.69,.62)*(.86+.14*fbm(uv*.61)),.7,n,.025);}
  let distance=length(U.camera.xyz-h.p);
  if(distance>=5.){return filteredMaterial(h);}
  let t=tileProfile(uv,h.sid,h.material,tileMode(h));
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
  // Normal moments are evaluated by surfaceMaterial below.
  let normal=n;
  let rough=.10+.13*t.id+scaleDeposit*.13+mineral*.055;
  if(distance<=3.){return Material(color,mix(rough,.86,seam),normal,mix(.047,.006,seam));}
  let coarse=filteredMaterial(h);let lod=smoothstep(3.,5.,distance);
  return Material(mix(color,coarse.albedo,lod),mix(mix(rough,.86,seam),coarse.roughness,lod),normalize(mix(normal,coarse.normal,lod)),mix(.047,.006,seam));
}

// Four physical footprint samples retain both slope moments. A coarser normal
// is not a plane mirror: unresolved slope variance broadens the NDF.
fn glazeSlopeAt(uv:vec2f,h:Hit)->vec2f {
 let t=tileProfile(uv,h.sid,h.material,tileMode(h));
 let seed=vec2f(t.id*173.1,tileSeed(h.sid,tileMode(h))*13.71);
 let seam=1.-smoothstep(0.,t.bevel,t.edge);
 let micro=vec2f(noise(uv*137.3+seed),noise(uv*143.7-seed))-.5;
 let waviness=vec2f(noise(uv*23.7+seed),noise(uv*27.1-seed))-.5;
 return t.slope+(micro*.024+waviness*.016)*(1.-seam);
}
fn glazeMoments(h:Hit)->vec4f {
 let v=normalize(U.camera.xyz-h.p);let f=tileFrame(h);
 let halfPixel=length(U.camera.xyz-h.p)*U.lens.y/f32(U.render.y);
 let width=halfPixel*vec2f(sqrt(1.+pow(dot(v,f[0])/max(abs(dot(v,h.n)),.1),2.)),sqrt(1.+pow(dot(v,f[1])/max(abs(dot(v,h.n)),.1),2.)));
 let uv=tileUV(h);var mean=vec2f(0);var second=vec2f(0);
 for(var i=0u;i<4u;i++){let q=vec2f(select(-1.,1.,(i&1u)!=0u),select(-1.,1.,(i&2u)!=0u));let s=glazeSlopeAt(uv+q*width*.577350269,h);mean+=s*.25;second+=s*s*.25;}
 return vec4f(mean,max(second-mean*mean,vec2f(0)));
}
fn surfaceMaterial(h:Hit)->Material {
 var m=surfaceBaseMaterial(h);if(h.material==1u){return m;}
 let moments=glazeMoments(h);let f=tileFrame(h);
 m.normal=normalize(h.n-f[0]*moments.x-f[1]*moments.y);
 // Isotropic moment matching in slope space (GGX core approximation).
 m.roughness=min(1.,pow(pow(m.roughness,4.)+moments.z+moments.w,.25));
 return m;
}
