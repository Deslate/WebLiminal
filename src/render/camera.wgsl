@group(0) @binding(3) var<storage,read> irradiance: array<vec4f>;
@group(0) @binding(4) var<storage,read_write> image: array<vec4f>;
fn photonEstimate(h:Hit)->vec4f {
  let s=surfaces[h.sid];let p=h.uv*vec2f(s.info.yz)-.5;let b=vec2i(floor(p));let f=fract(p);var result=vec4f(0);
  for(var y=0;y<2;y++){for(var x=0;x<2;x++){let q=clamp(b+vec2i(x,y),vec2i(0),vec2i(s.info.yz)-1);let idx=s.info.x+u32(q.y)*s.info.y+u32(q.x);result+=irradiance[idx]*select(1.-f.x,f.x,x==1)*select(1.-f.y,f.y,y==1);}}
  return result;
}
fn directLighting(h:Hit,m:Material,v:vec3f,seed:ptr<function,u32>)->vec3f {
  let n=m.normal;let nv=max(dot(n,v),.001);let fv=schlick(nv,m.coat);let ro=h.p+h.n*EPS*3.;var result=vec3f(0);
  let sun=sampleSun(seed);let nl=max(dot(n,sun),0.);
  if(nl>0. && trace(ro,sun,INF).t>=INF){
    let hv=normalize(sun+v);let nh=max(dot(n,hv),0.);let vh=max(dot(v,hv),0.);let a=m.roughness*m.roughness;
    let spec=ggxD(nh,a)*smithG1(nl,a)*smithG1(nv,a)*schlick(vh,m.coat)/max(4.*nl*nv,.00001);
    result+=sunIrradiance()*nl*(m.albedo/PI*(1.-fv)*(1.-schlick(nl,m.coat))+vec3f(spec));
  }
  let lx=mix(U.opening.x,U.opening.y,rnd(seed));let lz=mix(U.opening.z,U.opening.w,rnd(seed));let lp=vec3f(lx,6.102,lz);let delta=lp-ro;let dist=length(delta);let l=delta/dist;let cosine=max(dot(n,l),0.);
  if(cosine>0. && trace(ro,l,dist-.004).t>=dist-.004){
    let area=(U.opening.y-U.opening.x)*(U.opening.w-U.opening.z);let geom=cosine*max(l.y,0.)*area/(dist*dist);
    // Specular sky is sampled by the camera continuation instead of twice via NEE.
    result+=skyRadiance(l)*geom*m.albedo/PI*(1.-fv)*(1.-schlick(cosine,m.coat));
  }
  return result;
}
fn airScattering(ro:vec3f,rd:vec3f,distance:f32,seed:ptr<function,u32>)->vec3f {
  let d=rnd(seed)*distance;let p=ro+rd*d;let tr=exp(-.004*d);let l=sampleSun(seed);let exitDist=max((6.102-p.y)/l.y,0.);
  if(trace(p,l,exitDist).t>=exitDist){return tr*exp(-.004*exitDist)*.003*distance*sunIrradiance()/(4.*PI);}
  return vec3f(0);
}
fn environment(d:vec3f,includeSun:bool)->vec3f {
  var e=skyRadiance(d);if(includeSun&&dot(d,sunDirection())>cos(.00465)){e+=sunIrradiance()/(2.*PI*(1.-cos(.00465)));}return e;
}
fn radiance(origin:vec3f,direction:vec3f,seed:ptr<function,u32>)->vec3f {
  var ro=origin;var rd=direction;var throughput=vec3f(1);var result=vec3f(0);var underwater=false;var lastOpaque=false;
  for(var bounce=0u;bounce<6u;bounce++) {
    let h=trace(ro,rd,INF);
    if(h.t>=INF){result+=throughput*environment(rd,!lastOpaque);break;}
    if(underwater){throughput*=waterTransmittance(h.t);}else{
      // Homogeneous medium: sampled single scattering, with a shadow ray to the sun.
      result+=throughput*airScattering(ro,rd,h.t,seed);throughput*=exp(-.004*h.t);
    }
    if(h.material==9u){
      lastOpaque=false;
      let entering=dot(rd,h.n)<0.;let n=select(-h.n,h.n,entering);let ni=select(1.333,1.,entering);let nt=select(1.,1.333,entering);let f=fresnel(-dot(rd,n),ni,nt);
      if(rnd(seed)<f){rd=reflect(rd,n);}else{rd=refract(rd,n,ni/nt);throughput*=ni*ni/(nt*nt);underwater=entering;}
      ro=h.p+rd*EPS*2.;continue;
    }
    lastOpaque=true;var m=surfaceMaterial(h);if(dot(m.normal,rd)>0.){m.normal=-m.normal;}
    let v=-rd;let nv=max(dot(m.normal,v),.001);let photons=photonEstimate(h);
    if(U.settings.w>.5){return vec3f(photons.w)*.3;}
    result+=throughput*(directLighting(h,m,v,seed)+m.albedo/PI*(1.-schlick(nv,m.coat))*photons.rgb);
    // A rough dielectric-glaze continuation. Photon estimate supplies diffuse
    // indirect transport; this continuation only supplies the glossy part.
    let l=sampleGGX(m.normal,v,m.roughness,seed);let nl=max(dot(m.normal,l),0.);if(nl<=0.){break;}
    let hh=normalize(v+l);let nh=max(dot(m.normal,hh),.00001);let vh=max(dot(v,hh),.00001);let a=m.roughness*m.roughness;
    throughput*=schlick(vh,m.coat)*smithG1(nv,a)*smithG1(nl,a)*vh/(nv*nh);
    if(max(max(throughput.x,throughput.y),throughput.z)<.0001){break;}
    ro=h.p+l*EPS*3.;rd=l;
  }
  return result;
}
@compute @workgroup_size(8,8)
fn camera(@builtin(global_invocation_id) gid:vec3u) {
  if(gid.x>=U.render.x||gid.y>=U.render.y){return;}
  let idx=gid.y*U.render.x+gid.x;var seed=hash(idx+U.render.z*2891336453u+U.counts.w);
  let pixel=(vec2f(gid.xy)+vec2f(rnd(&seed),rnd(&seed)))/vec2f(U.render.xy);
  let sensor=(pixel*2.-1.)*vec2f(U.lens.x,-1.);
  var rd=normalize(U.forward.xyz+U.right.xyz*sensor.x*U.lens.y+U.up.xyz*sensor.y*U.lens.y);
  let focus=U.camera.xyz+rd*(U.lens.w/max(dot(rd,U.forward.xyz),.01));
  let rr=sqrt(rnd(&seed))*U.lens.z;let theta=rnd(&seed)*2.*PI;let ro=U.camera.xyz+(U.right.xyz*cos(theta)+U.up.xyz*sin(theta))*rr;rd=normalize(focus-ro);
  let c=radiance(ro,rd,&seed);image[idx]=mix(image[idx],vec4f(c,1.),U.settings.x);
}
