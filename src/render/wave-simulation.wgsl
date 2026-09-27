// Stateful nonlinear height wave equation, metres / seconds. No carrier waves.
// eta_tt = div(g (depth+eta) grad eta)
//          - (sigma/rho) div(depth grad Laplacian eta)
//          - damping eta_t + viscosity Laplacian eta_t + local pressure.
struct SimParams { clock:vec4f, settings:vec4f, sources:array<vec4f,24>, shapes:array<vec4f,24>, body:vec4f, reserved:vec4f };
@group(0) @binding(0) var<uniform> P:SimParams;
@group(0) @binding(1) var<storage,read> previous:array<vec2f>;
@group(0) @binding(2) var<storage,read_write> next:array<vec2f>;
@group(0) @binding(3) var<storage,read> depth:array<f32>;
@group(0) @binding(4) var<storage,read_write> display:array<vec4f>;
const NX:i32=448;const NZ:i32=864;const DX:f32=.03125;
fn idx(p:vec2i)->u32 {let q=clamp(p,vec2i(0),vec2i(NX-1,NZ-1));return u32(q.y*NX+q.x);}
fn sampleHeight(p:vec2i,center:f32)->f32 {let i=idx(p);return select(center,previous[i].x,depth[i]>0.);}
fn hashSim(v:u32)->u32 {var x=v;x=((x>>16u)^x)*0x7feb352du;x=((x>>15u)^x)*0x846ca68bu;return (x>>16u)^x;}
// Rotationally balanced nine-point operator. Diagonal links cannot cross a
// dry corner. Pairwise symmetric links conserve mass at real pool boundaries.
const OFFSETS=array<vec2i,8>(vec2i(-1,0),vec2i(1,0),vec2i(0,-1),vec2i(0,1),vec2i(-1,-1),vec2i(1,-1),vec2i(-1,1),vec2i(1,1));
fn link(p:vec2i,j:u32)->f32 {
 let o=OFFSETS[j];let q=p+o;
 if(any(q<vec2i(0))||any(q>=vec2i(NX,NZ))||depth[idx(q)]<=0.){return 0.;}
 if(j>=4u){if(depth[idx(p+vec2i(o.x,0))]<=0.||depth[idx(p+vec2i(0,o.y))]<=0.){return 0.;}return 1./6.;}
 return 2./3.;
}
fn rand(n:u32)->f32{return f32(hashSim(n^7819301u))/4294967296.;}
@compute @workgroup_size(128) fn initialize(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=u32(NX*NZ)){return;}
 let p=(vec2f(f32(i%u32(NX)),f32(i/u32(NX)))+.5)*DX;
 // Scattered radial pressure-displacement packets: no value-noise lattice,
 // periodic tile or privileged direction. Only initial state, never animation.
 var h=0.;var v=0.;
 for(var j=0u;j<96u;j++){
  let n=j*11u;let center=vec2f(rand(n),rand(n+1u))*vec2f(14.,27.);
  let r=mix(.22,1.65,pow(rand(n+2u),1.25));let delta=p-center;
  let a=(rand(n+3u)*2.-1.)*.52*P.settings.x;
  let bump=a*exp(-dot(delta,delta)/(r*r));h+=bump;
  let angle=rand(n+4u)*6.2831853;
  v+=bump*dot(delta,vec2f(cos(angle),sin(angle)))*.65/(r*r);
 }
 // Locally enumerated scattered packets. Random occupancy and fully jittered
 // centres: cells are an acceleration structure, not noise interpolation knots.
 let cell=vec2i(floor(p/1.2));
 for(var z=-1;z<=1;z++){for(var x=-1;x<=1;x++){
  let c=cell+vec2i(x,z);let seed=hashSim((bitcast<u32>(c.x)*73856093u)^(bitcast<u32>(c.y)*19349663u));
  // Independent Poisson counts + uniform centres give homogeneous scattered
  // points. Unlike a fixed/Binomial count per cell, the bins leave no density
  // anticorrelation or Cartesian occupancy structure in the initial field.
  let u=rand(seed+137u);var probability=exp(-7.2);var cdf=probability;var count=0u;
  loop {if(u<=cdf||count>=24u){break;}count++;probability*=7.2/f32(count);cdf+=probability;}
  for(var j=0u;j<count;j++){
   let n=hashSim(seed+j*7919u);
   let center=(vec2f(c)+vec2f(rand(n+1u),rand(n+2u)))*1.2;
   let r=mix(.095,.32,rand(n+3u));let delta=p-center;
   let radius2=r*r;let dist2=dot(delta,delta);if(dist2>radius2*9.){continue;}
   let a=(rand(n+4u)*2.-1.)*.75*P.settings.x;
   // C1 compact radial profile prevents truncation seams between source cells.
   let taper=max(0.,1.-dist2/(9.*radius2));
   let bump=a*exp(-dist2/radius2)*taper*taper;h+=bump;
   let angle=rand(n+5u)*6.2831853;
   v+=bump*dot(delta,vec2f(cos(angle),sin(angle)))*.65/radius2;
  }
 }}
 next[i]=select(vec2f(0.),vec2f(h,v),depth[i]>0.);
}
// Immersed displacement potential. A stationary body maintains a smooth
// meniscus; translating the same potential drives the state, not drawn rings.
fn bodyDisplacement(world:vec2f)->f32 {
 if(P.body.w<=0.){return 0.;}
 let r2=dot(world-P.body.xy,world-P.body.xy)/(P.body.z*P.body.z);
 return P.body.w*exp(-r2*.5);
}
@compute @workgroup_size(128) fn step(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=u32(NX*NZ)){return;}if(depth[i]<=0.){next[i]=vec2f(0.);return;}
 let p=vec2i(vec2u(i%u32(NX),i/u32(NX)));let q=previous[i];let h=q.x;
 let world=(vec2f(p)+.5)*DX+vec2f(-7.,-17.);
 let nearBody=P.body.w>0. && distance(world,P.body.xy)<1.5;
 var displacement=0.;if(nearBody){displacement=bodyDisplacement(world);}
 var acceleration=0.;var velocityLaplacian=0.;
 for(var j=0u;j<8u;j++){
  let w=link(p,j);if(w==0.){continue;}let k=idx(p+OFFSETS[j]);
  let d=max(.04,(depth[i]+depth[k]+h+previous[k].x)*.5);
  var bodyGradient=0.;if(nearBody){bodyGradient=bodyDisplacement(world+vec2f(OFFSETS[j])*DX)-displacement;}
  acceleration+=w*9.81*d*(previous[k].x-h-bodyGradient)/(DX*DX);
  acceleration-=w*.000073*(depth[i]+depth[k])*.5*(curvatures[k]-curvatures[i])/(DX*DX);
  velocityLaplacian+=w*(previous[k].y-q.y)/(DX*DX);
 }
 // Scale-selective dissipation acts on physical velocity, not rendered pixels.
 // Unresolved short waves lose energy; metre-scale displacement remains sharp.
 acceleration+=.00008*velocityLaplacian;
 for(var j=0u;j<24u;j++){
  let s=P.sources[j];let shape=P.shapes[j];let age=P.clock.x-s.z;
  if(shape.x<=0.||age<0.||age>=shape.y){continue;}
  let a=age/shape.y;let pulse=16.*a*a*(1.-a)*(1.-a);
  // The cached discrete pressure Laplacian is conservative at solid boundaries.
  acceleration+=s.w*pulse*pressureKernels[j*u32(NX*NZ)+i];
 }
 // Symplectic Euler, fixed 1/360s. Damping is physical state dissipation,
 // not image filtering. Symmetric viscosity preserves the zero-mean source response.
 let v=(q.y+P.clock.y*acceleration)*exp(-P.clock.y*.055);
 next[i]=vec2f(h+P.clock.y*v,v);
}
@compute @workgroup_size(128) fn reconstruct(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=u32(NX*NZ)){return;}
 // First-order velocity extrapolation shorter than one simulation step prevents
 // display stair steps at 60 / 59 / 30 Hz. No accumulated camera history.
 let q=previous[i];display[i]=vec4f(q.x+q.y*P.clock.z,q.y,depth[i],0.);
}
@group(0) @binding(5) var<storage,read> reconstructed:array<vec4f>;
@group(0) @binding(6) var<storage,read_write> coefficients:array<vec4f>;
fn fieldHeight(p:vec2i)->f32{return reconstructed[idx(p)].x;}
fn polynomial(r:vec4f)->vec4f{return vec4f(r.y,.5*(-r.x+r.z),r.x-2.5*r.y+2.*r.z-.5*r.w,.5*(-r.x+3.*r.y-3.*r.z+r.w));}
@compute @workgroup_size(128) fn interpolate(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=u32(NX*NZ)){return;}let p=vec2i(vec2u(i%u32(NX),i/u32(NX)));
 var rows:array<vec4f,4>;
 for(var j=0;j<4;j++){rows[j]=polynomial(vec4f(fieldHeight(p+vec2i(-1,j-1)),fieldHeight(p+vec2i(0,j-1)),fieldHeight(p+vec2i(1,j-1)),fieldHeight(p+vec2i(2,j-1))));}
 coefficients[i*4u]=rows[1];coefficients[i*4u+1u]=.5*(-rows[0]+rows[2]);
 coefficients[i*4u+2u]=rows[0]-2.5*rows[1]+2.*rows[2]-.5*rows[3];
 coefficients[i*4u+3u]=.5*(-rows[0]+3.*rows[1]-3.*rows[2]+rows[3]);
}

@group(0) @binding(7) var<storage,read_write> kernelOutput:array<f32>;
@group(0) @binding(8) var<storage,read> pressureKernels:array<f32>;
@group(0) @binding(10) var<storage,read_write> curvatureOutput:array<f32>;
@group(0) @binding(11) var<storage,read> curvatures:array<f32>;
fn gaussian(world:vec2f,s:vec4f,shape:vec4f)->f32 {
 let delta=world-s.xy;let c=cos(shape.z);let sn=sin(shape.z);
 let uv=vec2f(c*delta.x+sn*delta.y,-sn*delta.x+c*delta.y)/vec2f(shape.x,shape.x*shape.w);
 return exp(-dot(uv,uv));
}
@compute @workgroup_size(128) fn pressureKernel(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=u32(NX*NZ)){return;}let p=vec2i(vec2u(i%u32(NX),i/u32(NX)));
 let world=(vec2f(p)+.5)*DX+vec2f(-7.,-17.);

 for(var j=0u;j<24u;j++){if((u32(P.settings.y)&(1u<<j))==0u){continue;}
  let s=P.sources[j];let shape=P.shapes[j];let dst=j*u32(NX*NZ)+i;
  if(shape.x<=0.||depth[i]<=0.){kernelOutput[dst]=0.;continue;}
  let center=gaussian(world,s,shape);var lap=0.;
  for(var k=0u;k<8u;k++){let w=link(p,k);let n=idx(p+OFFSETS[k]);if(w>0.){let nw=(vec2f(f32(n%u32(NX)),f32(n/u32(NX)))+.5)*DX+vec2f(-7.,-17.);lap+=w*(gaussian(nw,s,shape)-center);}}
  kernelOutput[dst]=-lap/(DX*DX)*shape.x*shape.x/(2.*(1.+1./(shape.w*shape.w)));
 }
}
@compute @workgroup_size(128) fn curvature(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=u32(NX*NZ)){return;}let p=vec2i(vec2u(i%u32(NX),i/u32(NX)));let h=previous[i].x;
 var lap=0.;for(var j=0u;j<8u;j++){lap+=link(p,j)*(sampleHeight(p+OFFSETS[j],h)-h);}
 curvatureOutput[i]=lap/(DX*DX);
}
