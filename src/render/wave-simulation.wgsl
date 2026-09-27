// Stateful nonlinear height wave equation, metres / seconds. No carrier waves.
// eta_tt = div(g (depth+eta) grad eta) - (sigma/rho) Laplacian² eta
//          - damping eta_t + local, finite-duration pressure impulses.
struct SimParams { clock:vec4f, settings:vec4f, sources:array<vec4f,24>, shapes:array<vec4f,24> };
@group(0) @binding(0) var<uniform> P:SimParams;
@group(0) @binding(1) var<storage,read> previous:array<vec2f>;
@group(0) @binding(2) var<storage,read_write> next:array<vec2f>;
@group(0) @binding(3) var<storage,read> depth:array<f32>;
@group(0) @binding(4) var<storage,read_write> display:array<vec4f>;
const NX:i32=448;const NZ:i32=864;const DX:f32=.03125;
fn idx(p:vec2i)->u32 {let q=clamp(p,vec2i(0),vec2i(NX-1,NZ-1));return u32(q.y*NX+q.x);}
fn sampleHeight(p:vec2i,center:f32)->f32 {let i=idx(p);return select(center,previous[i].x,depth[i]>0.);}
fn hashSim(v:u32)->u32 {var x=v;x=((x>>16u)^x)*0x7feb352du;x=((x>>15u)^x)*0x846ca68bu;return (x>>16u)^x;}
fn random(p:vec2i)->f32{return f32(hashSim((bitcast<u32>(p.x)*73856093u) ^ (bitcast<u32>(p.y)*19349663u) ^ 7819301u))/4294967296.;}
fn smoothNoise(p:vec2f)->f32 {let b=vec2i(floor(p));let t=fract(p);let f=t*t*t*(t*(t*6.-15.)+10.);return mix(mix(random(b),random(b+vec2i(1,0)),f.x),mix(random(b+vec2i(0,1)),random(b+vec2i(1)),f.x),f.y)-.5;}
@compute @workgroup_size(128) fn initialize(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=u32(NX*NZ)){return;}let p=vec2f(f32(i%u32(NX)),f32(i/u32(NX)))*DX;
 // Broadband initial displacement, subsequently evolved by the PDE. These
 // random fields are initial conditions, never sampled by optics or animated.
 let h=P.settings.x*(.44*smoothNoise(p/.93)+.23*smoothNoise(p/.29+17.3)+.65*smoothNoise(p/.105-8.4));
 next[i]=vec2f(select(0.,h,depth[i]>0.),0.);
}
@compute @workgroup_size(128) fn step(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=u32(NX*NZ)){return;}if(depth[i]<=0.){next[i]=vec2f(0.);return;}
 let p=vec2i(vec2u(i%u32(NX),i/u32(NX)));let q=previous[i];let h=q.x;
 let l=sampleHeight(p+vec2i(-1,0),h);let r=sampleHeight(p+vec2i(1,0),h);
 let b=sampleHeight(p+vec2i(0,-1),h);let t=sampleHeight(p+vec2i(0,1),h);
 let lap=(l+r+b+t-4.*h)/(DX*DX);
 var acceleration=0.;
 let neighbors=array<vec2i,4>(p+vec2i(-1,0),p+vec2i(1,0),p+vec2i(0,-1),p+vec2i(0,1));
 let heights=vec4f(l,r,b,t);
 for(var j=0u;j<4u;j++){let d=depth[idx(neighbors[j])];if(d>0.){acceleration+=9.81*max(.04,(depth[i]+d+h+heights[j])*.5)*(heights[j]-h)/(DX*DX);}}
 for(var j=0u;j<4u;j++){let k=idx(neighbors[j]);if(depth[k]>0.){acceleration-=.000073*(depth[i]+depth[k])*.5*(curvatures[k]-curvatures[i])/(DX*DX);}}
 let world=(vec2f(p)+.5)*DX+vec2f(-7.,-17.);
 for(var j=0u;j<24u;j++){
  let s=P.sources[j];let shape=P.shapes[j];let age=P.clock.x-s.z;
  if(shape.x<=0.||age<0.||age>=shape.y){continue;}
  let a=age/shape.y;let pulse=16.*a*a*(1.-a)*(1.-a);
  // The cached discrete pressure Laplacian is conservative at solid boundaries.
  acceleration+=s.w*pulse*pressureKernels[j*u32(NX*NZ)+i];
 }
 // Symplectic Euler, fixed 1/360s. Damping is physical state dissipation,
 // not image filtering. Uniform damping preserves the zero-mean source response.
 let v=(q.y+P.clock.y*acceleration)*exp(-P.clock.y*.055);
 next[i]=vec2f(h+P.clock.y*v,v);
}
@compute @workgroup_size(128) fn reconstruct(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=u32(NX*NZ)){return;}
 // Hermite-in-time extrapolation shorter than one simulation step prevents
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
 let neighbors=array<vec2i,4>(p+vec2i(-1,0),p+vec2i(1,0),p+vec2i(0,-1),p+vec2i(0,1));
 for(var j=0u;j<24u;j++){if((u32(P.settings.y)&(1u<<j))==0u){continue;}
  let s=P.sources[j];let shape=P.shapes[j];let dst=j*u32(NX*NZ)+i;
  if(shape.x<=0.||depth[i]<=0.){kernelOutput[dst]=0.;continue;}
  let center=gaussian(world,s,shape);var lap=0.;
  for(var k=0u;k<4u;k++){let n=idx(neighbors[k]);if(depth[n]>0.){let nw=(vec2f(f32(n%u32(NX)),f32(n/u32(NX)))+.5)*DX+vec2f(-7.,-17.);lap+=gaussian(nw,s,shape)-center;}}
  kernelOutput[dst]=-lap/(DX*DX)*shape.x*shape.x/(2.*(1.+1./(shape.w*shape.w)));
 }
}
@compute @workgroup_size(128) fn curvature(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=u32(NX*NZ)){return;}let p=vec2i(vec2u(i%u32(NX),i/u32(NX)));let h=previous[i].x;
 curvatureOutput[i]=(sampleHeight(p+vec2i(-1,0),h)+sampleHeight(p+vec2i(1,0),h)+sampleHeight(p+vec2i(0,-1),h)+sampleHeight(p+vec2i(0,1),h)-4.*h)/(DX*DX);
}
