@group(0) @binding(10) var solarAtlas:texture_2d<f32>;
fn fineSolar(p:vec3f)->vec3f {
 let l=sunDirection();let rd=refract(-l,vec3f(0,1,0),1./1.333);
 let shift=-l.xz/l.y*(6.101-U.state.y)+rd.xz*(-U.state.y/rd.y);
 let lo=U.opening.xz+shift-vec2f(.8);let hi=U.opening.yw+shift+vec2f(.8);
 let uv=(p.xz-lo)/(hi-lo);if(any(uv<vec2f(0))||any(uv>vec2f(1))){return vec3f(0);}
 let q=uv*2048.-.5;let b=vec2i(floor(q));let f=fract(q);var e=vec3f(0);
 for(var y=0;y<2;y++){for(var x=0;x<2;x++){
 e+=textureLoad(solarAtlas,clamp(b+vec2i(x,y),vec2i(0),vec2i(2047)),0).rgb*select(1.-f.x,f.x,x==1)*select(1.-f.y,f.y,y==1);
 }}return e;
}
@group(0) @binding(3) var<storage,read> irradiance: array<vec4f>;
@group(0) @binding(4) var<storage,read_write> image: array<vec4f>;
@group(0) @binding(5) var<storage,read_write> reflectionLayer:array<vec4f>;
@group(0) @binding(6) var<storage,read_write> reflectionGuide:array<vec4f>;
@group(0) @binding(8) var<storage,read> skyIntegral: array<vec4f>;
fn photonEstimate(h:Hit)->vec4f {
  let s=surfaces[h.sid];let p=h.uv*vec2f(s.info.yz)-.5;let b=vec2i(floor(p));let f=fract(p);var result=vec4f(0);
  for(var y=0;y<2;y++){for(var x=0;x<2;x++){
    let q=clamp(b+vec2i(x,y),vec2i(0),vec2i(s.info.yz)-1);let idx=s.info.x+u32(q.y)*s.info.y+u32(q.x);
    let e=irradiance[idx];
    result+=e*select(1.-f.x,f.x,x==1)*select(1.-f.y,f.y,y==1);
  }}
  if(h.sid==3u){let solar=fineSolar(h.p);result+=vec4f(solar,dot(solar,vec3f(.2126,.7152,.0722)));}
  return result;
}
fn integratedSky(h:Hit)->vec3f {
  let s=surfaces[h.sid];let p=h.uv*vec2f(s.info.yz)-.5;let b=vec2i(floor(p));let f=fract(p);var result=vec3f(0);var weight=0.;
  for(var y=0;y<2;y++){for(var x=0;x<2;x++){
    let q=clamp(b+vec2i(x,y),vec2i(0),vec2i(s.info.yz)-1);let idx=s.info.x+u32(q.y)*s.info.y+u32(q.x);
    let w=select(1.-f.x,f.x,x==1)*select(1.-f.y,f.y,y==1)*skyIntegral[idx].w;
    result+=skyIntegral[idx].rgb*w;weight+=w;
  }}return result/max(weight,.0001);
}
// Deterministic finite quadrature: no per-frame or per-pixel random decisions.
fn directLighting(h:Hit,m:Material,v:vec3f)->vec3f {
  let n=m.normal;let nv=max(dot(n,v),.001);let fv=schlick(nv,m.coat);let ro=h.p+h.n*.012;var result=vec3f(0);
  let sun=sunDirection();let nl=max(dot(n,sun),0.);
  if(nl>0. && traceSolid(ro,sun,INF).t>=INF){
    let hv=normalize(sun+v);let nh=max(dot(n,hv),0.);let vh=max(dot(v,hv),0.);let a=max(m.roughness*m.roughness,.035);
    let spec=ggxD(nh,a)*smithG1(nl,a)*smithG1(nv,a)*schlick(vh,m.coat)/max(4.*nl*nv,.00001);
    result+=jointVisibility(h,sun)*sunIrradiance()*nl*(m.albedo/PI*(1.-fv)*(1.-schlick(nl,m.coat))+vec3f(spec));
  }
  // The 64-point world-space sky integral is already available in both modes.
  // Reuse it for moving primary and glaze rays instead of retracing four points
  // and four grout visibility walks per shading invocation.
  let sky=integratedSky(h);
  // A zero sky integral needs no local grout visibility walk.
  if(any(sky>vec3f(0))){result+=sky*jointVisibility(h,normalize(vec3f((U.opening.x+U.opening.y)*.5,6.102,(U.opening.z+U.opening.w)*.5)-h.p))*m.albedo/PI*(1.-fv)*(1.-m.coat);}
  return result;
}
fn shadeMaterial(h:Hit,rd:vec3f,underwater:bool,material:Material)->vec3f {
  if(h.t>=INF){return skyRadiance(rd);}
  var m=material;if(dot(m.normal,rd)>0.){m.normal=-m.normal;}
  let nv=max(dot(m.normal,-rd),.001);let photons=photonEstimate(h);
  if(U.settings.w>.5){return vec3f(photons.w)*.3;}
  // Cached irradiance is filtered in world metres; the tile BRDF is evaluated
  // afterwards at full camera resolution, never blurred with the illumination.
  let indirect=m.albedo/PI*(1.-schlick(nv,m.coat))*photons.rgb*U.settings.z;
  var c=indirect;
  if(!underwater){c+=directLighting(h,m,-rd);}
  // Rough glaze environment is a bounded irradiance approximation, not a
  // stochastic GGX continuation capable of producing fireflies.
  c+=photons.rgb*m.coat*.08*U.settings.z;
  if(underwater){return c*waterTransmittance(h.t);}
  let tr=exp(-.004*h.t);
  return c*tr+vec3f(.065,.085,.09)*(1.-tr);
}
fn shadeBody(h:Hit,rd:vec3f,underwater:bool)->vec3f {
 let light=normalize(vec3f(-.4,1.,.5));let diffuse=.18+.65*max(0.,dot(h.n,light));
 let wet=h.p.y<U.state.y+.10;let albedo=select(vec3f(.24,.30,.32),vec3f(.085,.13,.15),wet);
 let c=albedo*diffuse+vec3f(.035)*pow(max(0.,dot(reflect(-light,h.n),-rd)),24.);
 return c*select(vec3f(1.),waterTransmittance(h.t),underwater);
}
fn shadeHit(h:Hit,rd:vec3f,underwater:bool)->vec3f {
  if(h.material==10u){return shadeBody(h,rd,underwater);}
  if(h.t>=INF){return skyRadiance(rd);}
  return shadeMaterial(h,rd,underwater,filteredMaterial(h));
}
fn shadeSolid(ro:vec3f,rd:vec3f,underwater:bool)->vec3f {
  return shadeHit(traceDynamicSolid(ro,rd,INF),rd,underwater);
}
fn environmentHit(h:Hit,ro:vec3f,rd:vec3f,sampleIndex:u32)->vec3f {
  if(h.material!=9u){return shadeHit(h,rd,false);}
  let n=h.n;let f=fresnel(-dot(rd,n),1.,1.333);
  let reflected=reflect(rd,n);let transmitted=refract(rd,n,1./1.333);
  // Secondary water also uses the single physical specular direction.
  // Both dielectric branches remain deterministic; no temporal sampling.
  let a=shadeSolid(h.p+reflected*EPS*3.,reflected,false);
  let b=shadeSolid(h.p+transmitted*EPS*3.,transmitted,true)/(1.333*1.333);
  return (a*f+b*(1.-f))*exp(-.004*h.t);
}
fn environmentRay(ro:vec3f,rd:vec3f,sampleIndex:u32)->vec3f {return environmentHit(trace(ro,rd,INF),ro,rd,sampleIndex);}
struct CameraLayers { base:vec3f, reflection:vec3f, guide:vec4f };
fn reflectionSigma(radius:f32,primaryDistance:f32,receiverDistance:f32,maxSigma:f32)->f32 {
  // Project an angular lobe into the reflected image. Uniform disk variance
  // is radius^2/4 per axis; Gaussian moment matching has one central peak.
  // Bound the reconstruction footprint to preserve resolved wave/tile detail.
  // This is spatial antialiasing, not an exact rough-BRDF angular integral.
  let focalPixels=f32(U.render.y)/(2.*U.lens.y);
  let receiver=min(receiverDistance,40.);
  return min(.5*radius*focalPixels*receiver/(primaryDistance+receiver),maxSigma)*U.lighting.w;
}
fn radiance(ro:vec3f,rd:vec3f,sampleIndex:u32)->CameraLayers {
  let base=trace(ro,rd,INF);
  if(base.t>=INF){return CameraLayers(skyRadiance(rd),vec3f(0),vec4f(0));}
  if(base.material==10u){return CameraLayers(shadeBody(base,rd,false),vec3f(0),vec4f(0));}
  if(base.material==9u){
    let reflected=reflect(rd,base.n);let transmitted=refract(rd,base.n,1./1.333);
    let f=fresnel(-dot(rd,base.n),1.,1.333);let tr=exp(-.004*base.t);
    let receiver=traceDynamicSolid(base.p+reflected*EPS*3.,reflected,INF);
    let a=shadeHit(receiver,reflected,false)*f*tr;
    let b=shadeSolid(base.p+transmitted*EPS*3.,transmitted,true)*(1.-f)*tr/(1.333*1.333);
    let radius=U.lighting.y*(.65+.35*(1.-abs(rd.y)));
    return CameraLayers(b,a,vec4f(10000.,base.t,reflectionSigma(radius,base.t,receiver.t,.8),1.));
  }
  let h=reliefHit(ro,rd,base);let m=surfaceMaterial(h);
  let near=1.-smoothstep(3.,5.,h.t);var a=vec3f(0);var guide=vec4f(0);
  if(near>.001 && m.coat>.009){
    let reflected=reflect(rd,m.normal);let origin=h.p+h.n*.010;
    let receiver=trace(origin,reflected,INF);
    let fres=schlick(max(dot(m.normal,-rd),0.),m.coat);
    a=environmentHit(receiver,origin,reflected,sampleIndex)*fres*near;
    guide=vec4f(f32(h.sid+1u),h.t,reflectionSigma(m.roughness*m.roughness*.55,h.t,receiver.t,1.1),1.);
  }
  return CameraLayers(shadeMaterial(h,rd,false,m),a,guide);
}
@compute @workgroup_size(8,8)
fn camera(@builtin(global_invocation_id) gid:vec3u) {
  if(gid.x>=U.render.x||gid.y>=U.render.y){return;}
  let idx=gid.y*U.render.x+gid.x;var c=vec3f(0);var reflected=vec3f(0);var guide=vec4f(0);var lo=vec3f(1e6);var hi=vec3f(0);
  let offsets=array<vec2f,8>(vec2f(.25,.25),vec2f(.75,.75),vec2f(.25,.75),vec2f(.75,.25),vec2f(.125,.625),vec2f(.625,.875),vec2f(.875,.375),vec2f(.375,.125));
  var count=2u;
  // One shading path for ordinary and edge samples; no temporal jitter/history.
  for(var i=0u;i<count;i++){
    let pixel=(vec2f(gid.xy)+offsets[i])/vec2f(U.render.xy);
    let sensor=(pixel*2.-1.)*vec2f(U.lens.x,-1.);
    let rd=normalize(U.forward.xyz+U.right.xyz*sensor.x*U.lens.y+U.up.xyz*sensor.y*U.lens.y);
    let layers=radiance(U.camera.xyz,rd,i%4u);let value=layers.base+layers.reflection;c+=layers.base;reflected+=layers.reflection;
    if(i==0u){guide=layers.guide;}
    lo=min(lo,value);hi=max(hi,value);
    let contrast=max(max(hi.x-lo.x,hi.y-lo.y),hi.z-lo.z);
    if(i==1u){
      // Smooth opaque interiors need less quadrature than a dielectric image.
      // Preserve water's four samples and spend eight on contrast boundaries.
      if(guide.x==10000.||layers.guide.x==10000.){count=4u;}
      if(contrast>.3||guide.x!=layers.guide.x){count=8u;}
    }
    if(i==3u && contrast>.3){count=8u;}
  }
  image[idx]=vec4f(c/f32(count),1.);
  reflectionLayer[idx]=vec4f(reflected/f32(count),1.);reflectionGuide[idx]=guide;
}
