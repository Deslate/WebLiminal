// Initial conditions, pressure footprints and shared water reconstruction.
// Time propagation lives in finite-depth.wgsl.
struct SimParams { clock:vec4f, settings:vec4f, sources:array<vec4f,24>, shapes:array<vec4f,24>, body:vec4f, reserved:vec4f };
@group(0) @binding(0) var<uniform> P:SimParams;
@group(0) @binding(1) var<storage,read> previous:array<vec2f>;
@group(0) @binding(2) var<storage,read_write> next:array<vec2f>;
@group(0) @binding(3) var<storage,read> depth:array<f32>;
@group(0) @binding(4) var<storage,read_write> display:array<vec4f>;
const NX:i32=i32(WATER_NX);const NZ:i32=i32(WATER_NZ);const DX:f32=WATER_DX;
fn idx(p:vec2i)->u32 {let q=clamp(p,vec2i(0),vec2i(NX-1,NZ-1));return u32(q.y*NX+q.x);}
fn sampleHeight(p:vec2i,center:f32)->f32 {let i=idx(p);return select(center,previous[i].x,depth[i]>0.);}
@group(0) @binding(12) var<storage,read> bodyField:array<vec4f>;
fn cubicBody(a:vec2f,b:vec2f,c:vec2f,d:vec2f,t:f32)->vec2f {
 return b+.5*t*(c-a+t*(2.*a-5.*b+4.*c-d+t*(3.*(b-c)+d-a)));
}
fn bodySample(world:vec2f)->vec2f {
 let uv=(world+vec2f(16.,32.))/.125;let p=vec2i(floor(uv));let f=fract(uv);
 var rows:array<vec2f,4>;
 for(var j=0;j<4;j++) {let i=u32((p.y+j-1)*256+p.x);rows[j]=cubicBody(bodyField[i-1u].xz,bodyField[i].xz,bodyField[i+1u].xz,bodyField[i+2u].xz,f.x);}
 return cubicBody(rows[0],rows[1],rows[2],rows[3],f.y);
}
@compute @workgroup_size(128) fn reconstruct(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=u32(NX*NZ)){return;}
 // First-order velocity extrapolation shorter than one simulation step prevents
 // display stair steps at 60 / 59 / 30 Hz. No accumulated camera history.
 let q=previous[i];let world=(vec2f(f32(i%u32(NX)),f32(i/u32(NX)))+.5)*DX+WATER_MIN;
 let wake=bodySample(world)*select(0.,1.,depth[i]>0.);
 display[i]=vec4f(q.x+q.y*P.clock.z+wake.x,q.y+wake.y,depth[i],0.);
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
