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
  lighting: vec4f, // x: live wake height bound; y: reflection roughness; z: quality
  live: vec4u, // sun grid width, sky grid width/height, diffuse probe count
  wakes: array<vec4f,12>, // x, z, birth phase, displacement amplitude
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
// Quintic world-space random field with an analytic gradient. Its advected
// coordinates never wrap, and value/first/second derivatives meet at cells.
fn waveNoise(p:vec2f)->vec3f {
 let b=floor(p);let t=fract(p);let f=t*t*t*(t*(t*6.-15.)+10.);
 let df=30.*t*t*(t-1.)*(t-1.);
 let a=hash2(b);let c=hash2(b+vec2f(1,0));let d=hash2(b+vec2f(0,1));let e=hash2(b+vec2f(1));
 return vec3f(mix(mix(a,c,f.x),mix(d,e,f.x),f.y),mix(c-a,e-d,f.y)*df.x,mix(d-a,e-c,f.x)*df.y);
}
fn wave(p:vec2f)->vec3f {
 var h=0.;var grad=vec2f(0.);
 let a=waveNoise(p*.71+vec2f(.023,-.017)*U.state.x);
 let b=waveNoise(p*1.37+vec2f(-.031,.013)*U.state.x+vec2f(17.3,-9.1));
 let ga=a.yz*.71;let gb=b.yz*1.37;
 let envelope=.45+.55*a.x;let envelopeGradient=.55*ga;
 let dirs=array<vec2f,10>(vec2f(.91,.41),vec2f(-.38,.925),vec2f(.71,-.704),vec2f(-.97,-.24),vec2f(.18,.984),vec2f(.839,.544),vec2f(-.61,.792),vec2f(.994,-.108),vec2f(.39,-.921),vec2f(-.84,-.542));
 let ks=array<f32,10>(1.17,2.03,3.19,5.37,8.71,13.43,19.7,27.1,35.3,43.7);
 let amps=array<f32,10>(.28,.25,.12,.07,.043,.023,.07,.05,.034,.024);
 let rates=array<f32,10>(.19,.23,.17,.26,.31,.28,.4,.43,.37,.46);
 for(var i=0u;i<10u;i++){
  let k=ks[i];let modulation=vec2f(dirs[(i+3u)%10u].x,dirs[(i+7u)%10u].y)*(2.7+k*.24);
  let ph=dot(p,dirs[i])*k+sqrt(9.81*k)*rates[i]*U.state.x+f32(i*i)*1.719+dot(modulation,vec2f(a.x,b.x)-.5);
  let dp=dirs[i]*k+modulation.x*ga+modulation.y*gb;
  let amplitude=amps[i]*U.state.z;
  h+=amplitude*envelope*sin(ph);
  grad+=amplitude*(envelope*cos(ph)*dp+envelopeGradient*sin(ph));
 }
 // Analytic dispersing wave packets from real foot contacts. Both the height
 // and its exact slope enter all camera and light paths, never a surface decal.
 for(var i=0u;i<12u;i++){
  let source=U.wakes[i];let age=U.state.x-source.z;
  if(source.w<=0.||age<=0.||age>=4.5){continue;}
  let delta=p-source.xy;let r=sqrt(dot(delta,delta)+.0025);
  let front=r-.85*age;let width=.13+.065*age;
  if(abs(front)>width*3.5){continue;}
  let fade=smoothstep(0.,.16,age)*(1.-smoothstep(3.4,4.5,age))*exp(-.6*age);
  let packet=source.w*fade*exp(-front*front/(width*width));
  let phase=front*(24.-1.4*age);
  h+=packet*cos(phase);
  grad+=packet*(-2.*front/(width*width)*cos(phase)-(24.-1.4*age)*sin(phase))*delta/r;
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
  let lo=(U.state.y-U.state.z*1.07-U.lighting.x-ro.y)/rd.y;let hi=(U.state.y+U.state.z*1.07+U.lighting.x-ro.y)/rd.y;
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

// Inverse of makeHit: physical location, orientation and receiving coverage.
fn surfaceHit(sid:u32,uv:vec2f)->Hit {
  let s=shapes[sid/9u];let face=sid%9u;let d=s.hi.xyz-s.lo.xyz;
  var p=s.lo.xyz;var n=vec3f(0);
  if(face<2u){p=vec3f(select(s.lo.x,s.hi.x,face==1u),s.lo.y+uv.y*d.y,s.lo.z+uv.x*d.z);n.x=select(-1.,1.,face==1u);}
  else if(face<4u){p=vec3f(s.lo.x+uv.x*d.x,select(s.lo.y,s.hi.y,face==3u),s.lo.z+uv.y*d.z);n.y=select(-1.,1.,face==3u);}
  else if(face<6u){p=vec3f(s.lo.x+uv.x*d.x,s.lo.y+uv.y*d.y,select(s.lo.z,s.hi.z,face==5u));n.z=select(-1.,1.,face==5u);}
  else if(face==6u){let a=uv.x*PI;let radial=vec3f(cos(a),sin(a),0);p=vec3f((s.lo.x+s.hi.x)*.5,s.params.y,s.lo.z+uv.y*d.z)+radial*s.params.x;n=-radial;}
  else {p=vec3f((s.lo.x+s.hi.x)*.5+select(-s.params.x,s.params.x,face==8u),uv.y*s.params.y,s.lo.z+uv.x*d.z);n.x=select(1.,-1.,face==8u);}
  return Hit(0.,p,n,uv,sid,s.info.x);
}

// Metre-scale tile construction. Independent seeds stay attached to the world.
const GROUT_HALF_WIDTH:f32=.0028;
struct TileProfile { height:f32, edge:f32, id:f32, bevel:f32, slope:vec2f };
// Continuous setting-out chart: right jamb -> arch -> left jamb.
// The 250 mm module starts at each spring. Two equal closing cuts on
// each half absorb the remainder, avoiding a sliver and keeping a crown joint.
fn archCourse(s:f32,r:f32)->vec3f {
 let half=PI*r*.5;let full=max(0.,floor(half/.25)-1.);
 let closing=(half-full*.25)*.5;let mirror=s>half;
 let x=select(s,2.*half-s,mirror);var i=floor(x/.25);
 var width=.25;var center=(i+.5)*.25;
 if(x>=full*.25){i=full+floor((x-full*.25)/closing);width=closing;center=full*.25+(i-full+.5)*closing;}
 if(mirror){center=2.*half-center;i=2.*(full+2.)-1.-i;}
 return vec3f(i,center,width);
}
fn tileMode(h:Hit)->u32 {
 let shape=shapes[h.sid/9u];let face=h.sid%9u;
 if(shape.info.y!=1u){return 0u;}
 if(face>=6u){return 1u;}
 return 0u;
}
fn archAlong(p:vec2f,r:f32)->f32 {
 if(p.y<0.){return select(PI*r-p.y,p.y,p.x>=0.);}
 return atan2(max(0.,p.y),p.x)*r;
}
fn tileUV(h:Hit)->vec2f {
 let mode=tileMode(h);let shape=shapes[h.sid/9u];
 let q=h.p.xy-vec2f((shape.lo.x+shape.hi.x)*.5,shape.params.y);
 if(mode==1u){return vec2f(archAlong(q,shape.params.x),h.p.z);}
 if(abs(h.n.x)>.7){return h.p.zy;}
 if(abs(h.n.y)>.7){return h.p.xz;}
 return h.p.xy;
}
fn tileFrame(h:Hit)->mat3x3f {
 var t=vec3f(1,0,0);var b=vec3f(0,1,0);let mode=tileMode(h);let shape=shapes[h.sid/9u];
 if(abs(h.n.x)>.7){t=vec3f(0,0,1);}
 if(abs(h.n.y)>.7){b=vec3f(0,0,1);}
 if(mode==1u){t=vec3f(h.n.y,-h.n.x,0);b=vec3f(0,0,1);}
 return mat3x3f(t,b,h.n);
}
fn tileSeed(sid:u32,mode:u32)->f32 {
 let shape=shapes[sid/9u];let face=sid%9u;
 if(shape.info.y==1u&&(face==4u||face==5u)&&mode==0u){return round(select(shape.lo.z,shape.hi.z,face==5u)*4.)*19.+f32(face);}
 return f32(sid);
}
// Distance inward from the two independently tiled faces at an opening.
// Each face leaves half of the ordinary 5.6mm joint in the unfolded chart.
fn openingJoint(uv:vec2f,sid:u32,mode:u32)->vec3f {
 let shape=shapes[sid/9u];let face=sid%9u;
 if(shape.info.y!=1u){return vec3f(1e6,0,0);}
 if(mode==0u&&(face==4u||face==5u)){
  let p=uv-vec2f((shape.lo.x+shape.hi.x)*.5,shape.params.y);
  if(p.y<0.){return vec3f(abs(p.x)-shape.params.x,sign(p.x),0);}
  return vec3f(length(p)-shape.params.x,normalize(p));
 }
 if(mode==1u){return vec3f(min(uv.y-shape.lo.z,shape.hi.z-uv.y),0,select(1.,-1.,uv.y>(shape.lo.z+shape.hi.z)*.5));}
 return vec3f(1e6,0,0);
}
fn tileProfile(uv:vec2f,sid:u32,material:u32,mode:u32)->TileProfile {
  let shape=shapes[sid/9u];var size=vec2f(.25);
  var cell=floor(uv/size);var center=(cell+.5)*size;
  if(mode==1u){let course=archCourse(uv.x,shape.params.x);cell.x=course.x;center.x=course.y;size.x=course.z;}
  let seed=tileSeed(sid,mode);
  let id=hash2(cell+vec2f(seed*17.19,0));
  let r=vec4f(hash2(cell+vec2f(13.1+seed*31.,7.3)),hash2(cell+vec2f(28.7,9.1+seed*11.)),hash2(cell+vec2f(97.3+id*31.,43.7)),hash2(cell+vec2f(29.1,61.3+id*71.)));
  let angle=0.;let local=uv-center;
  let rotation=mat2x2f(cos(angle),-sin(angle),sin(angle),cos(angle));let q=rotation*local;
  let halfSize=size*.5-vec2f(GROUT_HALF_WIDTH);
  let radius=.0012+.0012*id;
  let d=abs(q)-halfSize+radius;
  var edge=-(length(max(d,vec2f(0)))+min(max(d.x,d.y),0.)-radius);
  let joint=openingJoint(uv,sid,mode);let openingEdge=joint.x-GROUT_HALF_WIDTH;
  let atOpening=openingEdge<edge;edge=min(edge,openingEdge);
  let bevel=.0012+.0016*r.y;
  let shoulder=smoothstep(0.,bevel,edge);
  let tilt=dot(q,(r.xy-.5)*.009);
  let face=.001+(id-.5)*.0018+tilt;
  // Flat joints retain their 4mm bed. At a 90-degree edge the two
  // independent beds recede 1.8mm per face (~4mm from tile tips along
  // the bisector), so opposing shoulders do not hide the grout bottom.
  // Join ordinary cross-joints continuously into the corner bed.
  let bedT=clamp((joint.x-GROUT_HALF_WIDTH)/.0052,0.,1.);
  let bed=mix(-.0018,-.004,bedT*bedT*(3.-2.*bedT));
  var height=mix(bed,face,shoulder);
  var ge=-sign(q)*select(vec2f(0,1),vec2f(1,0),d.x>d.y);
  if(any(d>vec2f(0))){ge=-sign(q)*normalize(max(d,vec2f(0)));}
  if(atOpening){ge=joint.yz;}
  let u=clamp(edge/bevel,0.,1.);
  var slope=transpose(rotation)*((r.xy-.5)*.009*shoulder+ge*(face-bed)*6.*u*(1.-u)/bevel);
  slope+=joint.yz*(-.0022/.0052)*6.*bedT*(1.-bedT)*(1.-shoulder);
  return TileProfile(height,edge,id,bevel,slope);
}
fn reliefAt(ro:vec3f,rd:vec3f,h:Hit,t:f32,uvRay:vec2f)->Hit {let off=t-h.t;
      var result=h;result.t=t;result.p=ro+rd*t;
      if(h.sid%9u==6u){result.uv=h.uv+uvRay*off/surfaces[h.sid].metric.xy;}
      else {let shape=shapes[h.sid/9u];let q=(result.p-shape.lo.xyz)/(shape.hi.xyz-shape.lo.xyz);result.uv=q.xy;if(h.sid%9u<2u){result.uv=q.zy;}if(h.sid%9u==2u||h.sid%9u==3u){result.uv=q.xz;}if(h.sid%9u>=7u){result.uv=vec2f(q.z,result.p.y/shape.params.y);}}
      return result;
}
fn reliefHit(ro:vec3f,rd:vec3f,h:Hit)->Hit {
  if(h.t>=INF || h.material==1u || h.material==9u){return h;}
  let lod=1.-smoothstep(2.5,4.,h.t);if(lod<=0.){return h;}
  let nv=dot(rd,h.n);if(abs(nv)<.025){return h;}
  let mode=tileMode(h);let frame=tileFrame(h);let uv=tileUV(h);let uvRay=vec2f(dot(rd,frame[0]),dot(rd,frame[1]));
  let span=.006/abs(nv);var a=max(EPS,h.t-span);let end=h.t+span;
  // Conservative signed-height stepping: the rounded shoulder's slope <= 10.
  let bound=abs(nv)+10.*length(uvRay);var t=a;
  // Interior rays intersect an independently tilted plane exactly. Only the
  // narrow rounded shoulder needs conservative height-field stepping.
  let center=tileProfile(uv,h.sid,h.material,mode);
  if(center.edge>center.bevel+span*length(uvRay)&&length(center.slope)<.02){
    t=h.t+center.height*lod/(nv-dot(center.slope,uvRay)*lod);
    return reliefAt(ro,rd,h,t,uvRay);
  }
  for(var i=0u;i<128u;i++){
    let off=t-h.t;let profile=tileProfile(uv+uvRay*off,h.sid,h.material,mode);let f=off*nv-profile.height*lod;
    if(f<.000015){
      return reliefAt(ro,rd,h,t,uvRay);
    }
    t+=max(.000012,f/bound*.85);if(t>end){break;}
  }
  return h;
}
fn jointVisibility(h:Hit,l:vec3f)->f32 {
  let detail=1.-smoothstep(2.5,4.,length(h.p-U.camera.xyz));if(detail<=0.||h.material==1u){return 1.;}
  let f=tileFrame(h);let uv=tileUV(h);let mode=tileMode(h);let shape=shapes[h.sid/9u];
  var border=min(fract(uv/.25),1.-fract(uv/.25))*.25;
  if(mode==1u){let course=archCourse(uv.x,shape.params.x);border.x=course.z*.5-abs(uv.x-course.y);}
  var clear=min(min(border.x,border.y),openingJoint(uv,h.sid,mode).x);
  if(clear>.010){return 1.;}
  let profile=tileProfile(uv,h.sid,h.material,mode);if(profile.edge>profile.bevel+.0003){return 1.;}let start=profile.height;
  let dir=vec2f(dot(l,f[0]),dot(l,f[1]));let nl=dot(h.n,l);var visible=1.;
  for(var i=1u;i<=32u;i++){
    let t=f32(i)*.0004;let obstacle=tileProfile(uv+dir*t,h.sid,h.material,tileMode(h)).height;
    visible=min(visible,smoothstep(-.00012,.00020,start+nl*t-obstacle+.00012));
    // min() cannot recover from zero: remaining occlusion steps are redundant.
    if(visible==0.){break;}
  }
  return mix(1.,visible,detail);
}
