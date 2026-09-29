// Linear finite-depth gravity-capillary surface dynamics on a masked domain:
// h_tt = -G(L)[g*h + (sigma/rho)*L*h + pressure/rho] - damping*h_t.
// L is the symmetric positive Neumann graph Laplacian, not a periodic FFT.
struct SimParams { clock:vec4f, settings:vec4f, sources:array<vec4f,24>, shapes:array<vec4f,24>, body:vec4f, reserved:vec4f };
@group(0) @binding(0) var<uniform> P:SimParams;
@group(0) @binding(1) var<storage,read> state:array<vec2f>;
@group(0) @binding(2) var<storage,read_write> next:array<vec2f>;
@group(0) @binding(3) var<storage,read> excitation:array<vec2f>;
@group(0) @binding(4) var<storage,read_write> potential:array<f32>;
@group(0) @binding(5) var<storage,read_write> rhs:array<f32>;
@group(0) @binding(6) var<storage,read> previous:array<vec2f>;
@group(0) @binding(7) var<storage,read_write> output:array<vec2f>;
@group(0) @binding(8) var<storage,read> links:array<u32>;
struct Control { coefficient:f32, limit:f32, order:u32, pad:u32 };
@group(0) @binding(9) var<uniform> C:Control;
const N:u32=448u*864u;
const OFFSETS=array<i32,8>(-1,1,-448,448,-449,-447,447,449);
fn weight(j:u32)->f32{return select(2./3.,1./6.,j>=4u)*1024.;}
fn lapState(i:u32)->vec2f {
 var r=vec2f(0);let center=state[i];for(var j=0u;j<8u;j++){if((links[i]&(1u<<j))!=0u){r+=weight(j)*(center-state[u32(i32(i)+OFFSETS[j])]);}}return r;
}
fn lapPotential(i:u32)->f32 {
 var r=0.;let center=potential[i];for(var j=0u;j<8u;j++){if((links[i]&(1u<<j))!=0u){r+=weight(j)*(center-potential[u32(i32(i)+OFFSETS[j])]);}}return r;
}
fn shiftedLaplacian(i:u32)->f32 {
 var r=0.;let center=previous[i].x;for(var j=0u;j<8u;j++){if((links[i]&(1u<<j))!=0u){r+=weight(j)*(center-previous[u32(i32(i)+OFFSETS[j])].x);}}return 2.*r/C.limit-center;
}
@compute @workgroup_size(128) fn prepare(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=N){return;}if((links[i]&0x80000000u)==0u){potential[i]=0.;return;}
 // Spatially homogeneous pressure fluctuations. White-in-time forcing is
 // scaled by 1/sqrt(dt); it excites the physical oscillators, never the image.
 let p=.003*(P.settings.x/.018)*P.settings.w/sqrt(P.clock.y)*lapNoise(i).x/1024.;
 potential[i]=9.81*state[i].x+.000073*lapState(i).x+p;
}
@compute @workgroup_size(128) fn beginPolynomial(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=N){return;}let v=lapPotential(i);rhs[i]=v;output[i]=vec2f(C.coefficient*v,0.);
}
@compute @workgroup_size(128) fn recur(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=N){return;}output[i]=vec2f(2.*shiftedLaplacian(i)-previous[i].y+C.coefficient*rhs[i],previous[i].x);
}
@compute @workgroup_size(128) fn finish(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=N){return;}if((links[i]&0x80000000u)==0u){next[i]=vec2f(0);return;}
 let acceleration=-(shiftedLaplacian(i)-previous[i].y+C.coefficient*rhs[i])-.00008*lapState(i).y;
 let v=(state[i].y+P.clock.y*acceleration)*exp(-P.clock.y*.055);
 next[i]=vec2f(state[i].x+P.clock.y*v,v);
}

fn hashNoise(v:u32)->u32 {var x=v;x=((x>>16u)^x)*0x7feb352du;x=((x>>15u)^x)*0x846ca68bu;return (x>>16u)^x;}
fn randomUnit(v:u32)->f32{return f32(hashNoise(v))/4294967296.*2.-1.;}
fn randomGaussianApprox(v:u32)->f32 {
 return .86602540378*(randomUnit(v)+randomUnit(v+7919u)+randomUnit(v+104729u)+randomUnit(v+15485863u));
}
fn lapNoise(i:u32)->vec2f {
 var r=vec2f(0);let center=excitation[i];for(var j=0u;j<8u;j++){if((links[i]&(1u<<j))!=0u){r+=weight(j)*(center-excitation[u32(i32(i)+OFFSETS[j])]);}}return r;
}
@compute @workgroup_size(128) fn seedPressure(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=N){return;}
 let seed=hashNoise(i^hashNoise(u32(round(P.clock.x*120.))+u32(P.settings.z)));
 output[i]=select(vec2f(0),vec2f(randomGaussianApprox(seed),randomGaussianApprox(seed^0xa511e9b3u)),(links[i]&0x80000000u)!=0u);
}
@compute @workgroup_size(128) fn diffusePressure(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=N){return;}output[i]=excitation[i]-lapNoise(i)/(C.limit*1.05);
}
@compute @workgroup_size(128) fn initializeState(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=N){return;}
 let q=lapNoise(i)/1024.*(.01*P.settings.x/.018);
 next[i]=vec2f(q.x,18.*q.y);
}
