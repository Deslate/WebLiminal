const PI: f32 = 3.14159265359;
const EPS: f32 = 0.0015;
const INF: f32 = 10000.;

struct Uniforms {
  camera: vec4f,
  right: vec4f,
  up: vec4f,
  forward: vec4f,
  lens: vec4f, // aspect, tan(hfov/2), aperture radius, focus distance
  state: vec4f, // wave time, water height, wave amplitude, exposure
  opening: vec4f, // x min/max z min/max
  render: vec4u, // width, height, sample, shape count
  settings: vec4f, // history weight, photon history weight, sunlight multiplier, diagnostic
  counts: vec4u, // total cells, surfaces, batch number, fixed seed
  sampling: vec4u, // photon paths this batch; divisible by 512
  lighting: vec4f, // cache interpolation, rough reflection cone, reserved
};
struct Shape { lo: vec4f, hi: vec4f, info: vec4u, params: vec4f };
struct Surface { info: vec4u, metric: vec4f };
struct Flux { r: atomic<u32>, g: atomic<u32>, b: atomic<u32>, c: atomic<u32> };
struct Hit { t: f32, p: vec3f, n: vec3f, uv: vec2f, sid: u32, material: u32 };
struct Material { albedo: vec3f, roughness: f32, normal: vec3f, coat: f32 };
@group(0) @binding(0) var<uniform> U: Uniforms;
@group(0) @binding(1) var<storage,read> shapes: array<Shape>;
@group(0) @binding(2) var<storage,read> surfaces: array<Surface>;

fn hash(v: u32) -> u32 { var x=v; x=((x>>16u)^x)*0x7feb352du; x=((x>>15u)^x)*0x846ca68bu;return (x>>16u)^x; }
fn rnd(seed: ptr<function,u32>) -> f32 { *seed=hash(*seed+0x9e3779b9u);return f32(*seed)/4294967296.; }
fn hash2(p: vec2f) -> f32 { let q=vec2i(floor(p));return f32(hash((bitcast<u32>(q.x)*73856093u)^(bitcast<u32>(q.y)*19349663u)))/4294967296.; }
fn noise(p: vec2f) -> f32 {let b=floor(p);let t=fract(p);let f=t*t*(3.-2.*t);return mix(mix(hash2(b),hash2(b+vec2f(1,0)),f.x),mix(hash2(b+vec2f(0,1)),hash2(b+vec2f(1)),f.x),f.y);}
fn fbm(p:vec2f)->f32{return noise(p)*.55+noise(p*2.071+17.3)*.27+noise(p*4.317-8.4)*.12+noise(p*8.193)*.06;}
fn basis(n:vec3f)->mat3x3f {let a=select(vec3f(0,1,0),vec3f(1,0,0),abs(n.y)>.9);let t=normalize(cross(a,n));return mat3x3f(t,cross(n,t),n);}
fn cosineDirection(n:vec3f,seed:ptr<function,u32>)->vec3f {let r=sqrt(rnd(seed));let a=2.*PI*rnd(seed);return basis(n)*vec3f(r*cos(a),r*sin(a),sqrt(max(0.,1.-r*r)));}
fn fresnel(cosIn:f32,etaI:f32,etaT:f32)->f32 {let c=clamp(abs(cosIn),0.,1.);let sinT=etaI/etaT*sqrt(max(0.,1.-c*c));if(sinT>=1.){return 1.;}let ct=sqrt(1.-sinT*sinT);let rp=(etaT*c-etaI*ct)/(etaT*c+etaI*ct);let rs=(etaI*c-etaT*ct)/(etaI*c+etaT*ct);return .5*(rp*rp+rs*rs);}
fn wave(p:vec2f)->vec3f {
  // Three scale bands, each with its own dispersion rate. Deterministic in
  // world position and continuous seconds; no camera-dependent wave phase.
  var h=0.;var grad=vec2f(0.);
  let dirs=array<vec2f,10>(vec2f(.91,.41),vec2f(-.38,.925),vec2f(.71,-.704),vec2f(-.97,-.24),vec2f(.18,.984),vec2f(.839,.544),vec2f(-.61,.792),vec2f(.994,-.108),vec2f(.39,-.921),vec2f(-.84,-.542));
  let ks=array<f32,10>(1.17,2.03,3.19,5.37,8.71,13.43,19.7,27.1,35.3,43.7);
  let amps=array<f32,10>(.45,.25,.12,.07,.043,.023,.013,.009,.006,.003);
  let rates=array<f32,10>(.19,.23,.17,.26,.31,.28,.4,.43,.37,.46);
  for(var i=0u;i<10u;i++){
    let k=ks[i];let ph=dot(p,dirs[i])*k+sqrt(9.81*k)*rates[i]*U.state.x+f32(i*i)*1.719;
    let a=amps[i]*U.state.z;h+=a*sin(ph);grad+=a*k*cos(ph)*dirs[i];
  }
  return vec3f(U.state.y+h,grad);
}
fn emptyHit()->Hit {return Hit(INF,vec3f(0),vec3f(0),vec2f(0),0u,0u);}
fn makeHit(t:f32,ro:vec3f,rd:vec3f,n:vec3f,s:Shape,face:u32)->Hit {
  let p=ro+rd*t;let size=s.hi.xyz-s.lo.xyz;let q=(p-s.lo.xyz)/size;
  var uv=q.zy;if(face==2u||face==3u){uv=q.xz;}if(face==4u||face==5u){uv=q.xy;}
  if(face>=7u){uv=vec2f(q.z,p.y/s.params.y);}
  if(face==6u){uv=vec2f(atan2(p.y-s.params.y,p.x-(s.lo.x+s.hi.x)*.5)/PI,q.z);}
  return Hit(t,p,n,clamp(uv,vec2f(0.000001),vec2f(.999999)),s.info.z+face,s.info.x);
}
fn inHole(p:vec3f,s:Shape)->bool {
  let x=p.x-(s.lo.x+s.hi.x)*.5;let y=p.y-s.params.y;let r=s.params.x;
  return abs(x)<r && (y<0. || x*x+y*y<r*r);
}
fn traceSolid(ro:vec3f,rd:vec3f,maxT:f32)->Hit {
  var best=emptyHit();best.t=maxT;
  let inv=1./select(vec3f(.0000001),rd,abs(rd)>vec3f(.0000001));
  for(var i=0u;i<U.render.w;i++) {
    let s=shapes[i];let aa=(s.lo.xyz-ro)*inv;let bb=(s.hi.xyz-ro)*inv;
    let near=min(aa,bb);let far=max(aa,bb);let tn=max(max(near.x,near.y),near.z);let tf=min(min(far.x,far.y),far.z);
    if(tf<max(tn,EPS)||tn>best.t){continue;}
    for(var exit=0u;exit<2u;exit++) {
      let t=select(tn,tf,exit==1u);if(t<EPS||t>=best.t){continue;}
      let p=ro+rd*t;if(s.info.y==1u&&inHole(p,s)){continue;}
      let ns=select(near,far,exit==1u);var axis=0u;
      if(abs(ns.y-t)<.0005){axis=1u;}if(abs(ns.z-t)<.0005){axis=2u;}
      var n=vec3f(0);n[axis]=select(-sign(rd[axis]),sign(rd[axis]),exit==1u);
      let face=axis*2u+select(0u,1u,n[axis]>0.);
      best=makeHit(t,ro,rd,n,s,face);
    }
    if(s.info.y!=1u){continue;}
    let cx=(s.lo.x+s.hi.x)*.5;let r=s.params.x;let spring=s.params.y;
    for(var side=0u;side<2u;side++) {
      let x=cx+select(-r,r,side==1u);let t=(x-ro.x)*inv.x;let p=ro+rd*t;
      if(t>EPS&&t<best.t&&p.z>s.lo.z&&p.z<s.hi.z&&p.y>=0.&&p.y<spring){
        let n=vec3f(select(1.,-1.,side==1u),0,0);
        best=makeHit(t,ro,rd,n,s,select(7u,8u,side==1u));
      }
    }
    let o=ro.xy-vec2f(cx,spring);let a=dot(rd.xy,rd.xy);let b=dot(o,rd.xy);let c=dot(o,o)-r*r;let disc=b*b-a*c;
    if(disc>=0.&&a>.00001){
      for(var k=0u;k<2u;k++){
        let t=(-b+select(-sqrt(disc),sqrt(disc),k==1u))/a;let p=ro+rd*t;
        if(t>EPS&&t<best.t&&p.y>=spring&&p.z>s.lo.z&&p.z<s.hi.z){best=makeHit(t,ro,rd,normalize(vec3f(cx-p.x,spring-p.y,0)),s,6u);}
      }
    }
  }
  return best;
}
fn traceWater(ro:vec3f,rd:vec3f,maxT:f32)->Hit {
  var h=emptyHit();
  if(abs(rd.y)<.00001){return h;}
  let lo=(U.state.y-U.state.z*1.07-ro.y)/rd.y;let hi=(U.state.y+U.state.z*1.07-ro.y)/rd.y;
  if(max(lo,hi)<EPS||min(lo,hi)>maxT){return h;}
  var a=max(EPS,min(lo,hi));var b=min(maxT,max(lo,hi));
  if(a>=b){return h;}
  var fa=(ro+rd*a).y-wave((ro+rd*a).xz).x;
  let fb=(ro+rd*b).y-wave((ro+rd*b).xz).x;
  if(fa*fb>0.){return h;}
  var t=clamp((U.state.y-ro.y)/rd.y,a,b);
  // Safeguarded Newton: never leave the root bracket, never discard a valid
  // water hit merely because an unconstrained Newton iteration diverged.
  for(var i=0u;i<24u;i++){
    let p=ro+rd*t;let w=wave(p.xz);let f=p.y-w.x;
    if(abs(f)<.00001){break;}
    if(f*fa>0.){a=t;fa=f;}else{b=t;}
    let deriv=rd.y-dot(w.yz,rd.xz);
    var next=t-f/select(.0001,deriv,abs(deriv)>.0001);
    if(next<=a||next>=b||i>10u){next=(a+b)*.5;}
    t=next;
  }
  let p=ro+rd*t;let w=wave(p.xz);
  if(t>EPS&&t<maxT&&p.x>-7.&&p.x<7.&&p.z>-17.&&p.z<10.){h=Hit(t,p,normalize(vec3f(-w.y,1.,-w.z)),vec2f(0),0u,9u);}
  return h;
}
fn trace(ro:vec3f,rd:vec3f,maxT:f32)->Hit {var h=traceSolid(ro,rd,maxT);let w=traceWater(ro,rd,h.t);if(w.t<h.t){h=w;}return h;}
fn waterTransmittance(distance:f32)->vec3f{return exp(-vec3f(.34,.075,.037)*distance);}
fn skyRadiance(d:vec3f)->vec3f {return mix(vec3f(.68,.80,.97),vec3f(.31,.52,.88),pow(max(d.y,0.),.45))*.62;}
fn sunDirection()->vec3f{return normalize(vec3f(-.66,.69,.295));}
fn sampleSun(seed:ptr<function,u32>)->vec3f {let r=.00465*sqrt(rnd(seed));let a=2.*PI*rnd(seed);return normalize(sunDirection()+basis(sunDirection())*vec3f(r*cos(a),r*sin(a),0));}
fn sunIrradiance()->vec3f{return vec3f(19.8,18.4,15.5)*U.settings.z;}
fn schlick(c:f32,f0:f32)->f32{return f0+(1.-f0)*pow(1.-clamp(c,0.,1.),5.);}
fn ggxD(nh:f32,a:f32)->f32 {let a2=a*a;let q=nh*nh*(a2-1.)+1.;return a2/(PI*q*q);}
fn smithG1(nv:f32,a:f32)->f32{return 2.*nv/max(nv+sqrt(a*a+(1.-a*a)*nv*nv),.00001);}
fn sampleGGX(n:vec3f,v:vec3f,rough:f32,seed:ptr<function,u32>)->vec3f {
  let a=rough*rough;let r=rnd(seed);let ct=sqrt((1.-r)/(1.+(a*a-1.)*r));let st=sqrt(max(0.,1.-ct*ct));let ph=2.*PI*rnd(seed);let hn=basis(n)*vec3f(st*cos(ph),st*sin(ph),ct);
  return reflect(-v,hn);
}
