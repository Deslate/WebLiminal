@group(0) @binding(3) var<storage,read> irradiance: array<vec4f>;
@group(0) @binding(4) var<storage,read_write> image: array<vec4f>;
@group(0) @binding(5) var<storage,read> irradianceNext: array<vec4f>;
@group(0) @binding(6) var<storage,read> fineIrradiance: array<vec4f>;
@group(0) @binding(7) var<storage,read> fineIrradianceNext: array<vec4f>;
@group(0) @binding(8) var<storage,read> skyIntegral: array<vec4f>;
fn photonEstimate(h:Hit)->vec4f {
  let s=surfaces[h.sid];let p=h.uv*vec2f(s.info.yz)-.5;let b=vec2i(floor(p));let f=fract(p);var result=vec4f(0);
  for(var y=0;y<2;y++){for(var x=0;x<2;x++){let q=clamp(b+vec2i(x,y),vec2i(0),vec2i(s.info.yz)-1);let idx=s.info.x+u32(q.y)*s.info.y+u32(q.x);var e=mix(irradiance[idx],irradianceNext[idx],U.lighting.x);if(U.lighting.z>0.){e=mix(e,mix(fineIrradiance[idx],fineIrradianceNext[idx],U.lighting.x),U.lighting.z);}result+=e*select(1.-f.x,f.x,x==1)*select(1.-f.y,f.y,y==1);}}
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
  let n=m.normal;let nv=max(dot(n,v),.001);let fv=schlick(nv,m.coat);let ro=h.p+h.n*EPS*3.;var result=vec3f(0);
  let sun=sunDirection();let nl=max(dot(n,sun),0.);
  if(nl>0. && traceSolid(ro,sun,INF).t>=INF){
    let hv=normalize(sun+v);let nh=max(dot(n,hv),0.);let vh=max(dot(v,hv),0.);let a=max(m.roughness*m.roughness,.035);
    let spec=ggxD(nh,a)*smithG1(nl,a)*smithG1(nv,a)*schlick(vh,m.coat)/max(4.*nl*nv,.00001);
    result+=sunIrradiance()*nl*(m.albedo/PI*(1.-fv)*(1.-schlick(nl,m.coat))+vec3f(spec));
  }
  let area=(U.opening.y-U.opening.x)*(U.opening.w-U.opening.z);
  var sky=vec3f(0);
  for(var i=0u;i<select(4u,0u,U.lighting.z>=1.);i++){
    let uv=vec2f(.25+f32(i%2u)*.5,.25+f32(i/2u)*.5);
    let lp=vec3f(mix(U.opening.x,U.opening.y,uv.x),6.102,mix(U.opening.z,U.opening.w,uv.y));let delta=lp-ro;let dist=length(delta);let l=delta/dist;let cosine=max(dot(n,l),0.);
    if(cosine>0. && traceSolid(ro,l,dist-.004).t>=dist-.004){
      let geom=cosine*max(l.y,0.)*area/(dist*dist)*.25;
      sky+=skyRadiance(l)*geom*m.albedo/PI*(1.-fv)*(1.-schlick(cosine,m.coat));
    }
  }
  if(U.lighting.z>0.){sky=mix(sky,integratedSky(h)*m.albedo/PI*(1.-fv)*(1.-m.coat),U.lighting.z);}
  result+=sky;
  return result;
}
fn shadeHit(h:Hit,rd:vec3f,underwater:bool)->vec3f {
  if(h.t>=INF){return skyRadiance(rd);}
  var m=surfaceMaterial(h);if(dot(m.normal,rd)>0.){m.normal=-m.normal;}
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
fn shadeSolid(ro:vec3f,rd:vec3f,underwater:bool)->vec3f {
  return shadeHit(traceSolid(ro,rd,INF),rd,underwater);
}
fn radiance(ro:vec3f,rd:vec3f,sampleIndex:u32)->vec3f {
  let h=trace(ro,rd,INF);
  if(h.material!=9u){return shadeHit(h,rd,false);}
  let n=h.n;let f=fresnel(-dot(rd,n),1.,1.333);
  let reflected=reflect(rd,n);let transmitted=refract(rd,n,1./1.333);
  // Evaluate BOTH physical branches; no Bernoulli choice and no history reset.
  // Four deterministic cone directions, distributed over the four spatial
  // samples. Roughness affects only reflection, never the whole frame.
  let offsets=array<vec2f,4>(vec2f(-.707,-.707),vec2f(.707,-.707),vec2f(-.707,.707),vec2f(.707,.707));
  let radius=U.lighting.y*(.65+.35*(1.-abs(rd.y)));
  let cone=normalize(reflected+basis(reflected)*vec3f(offsets[sampleIndex]*radius,0));
  let a=shadeSolid(h.p+reflected*EPS*3.,cone,false);
  let b=shadeSolid(h.p+transmitted*EPS*3.,transmitted,true)/(1.333*1.333);
  return (a*f+b*(1.-f))*exp(-.004*h.t);
}
@compute @workgroup_size(8,8)
fn camera(@builtin(global_invocation_id) gid:vec3u) {
  if(gid.x>=U.render.x||gid.y>=U.render.y){return;}
  let idx=gid.y*U.render.x+gid.x;var c=vec3f(0);
  // Fixed subpixel quadrature, not temporal jitter. Every frame stands alone.
  for(var i=0u;i<4u;i++){
    let offset=vec2f(.25+f32(i%2u)*.5,.25+f32(i/2u)*.5);
    let pixel=(vec2f(gid.xy)+offset)/vec2f(U.render.xy);
    let sensor=(pixel*2.-1.)*vec2f(U.lens.x,-1.);
    let rd=normalize(U.forward.xyz+U.right.xyz*sensor.x*U.lens.y+U.up.xyz*sensor.y*U.lens.y);
    c+=radiance(U.camera.xyz,rd,i)*.25;
  }
  image[idx]=vec4f(c,1.);
}
