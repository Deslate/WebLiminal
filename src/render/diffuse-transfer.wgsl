// Static visibility/BRDF transfer, applied to CURRENT irradiance every frame.
// Low-frequency diffuse transport uses the mean water plane, not a time cache.
// Probe-major compact links; 32 lanes integrate each probe concurrently.
const DIFFUSE_DIRECTIONS:u32=128u;
const DIFFUSE_LINKS:u32=DIFFUSE_DIRECTIONS*2u;
struct TransferLink { weight:vec3f, source:u32 };
@group(0) @binding(14) var<storage,read_write> linkCounts:array<u32>;
var<private> compactBase:u32;
var<private> compactCount:u32;
@group(0) @binding(3) var<storage,read> probeSurface:array<u32>;
@group(0) @binding(4) var<storage,read_write> links:array<TransferLink>;
@group(0) @binding(5) var<storage,read> patchDelta:array<vec4f>;
@group(0) @binding(6) var<storage,read> previousBounce:array<vec4f>;
@group(0) @binding(7) var<storage,read_write> nextBounce:array<vec4f>;
// Conservative finite-volume restriction, used only by diffuse transport.
// The camera and direct transmitted caustic still read the original fine field.
@group(0) @binding(10) var<storage,read> currentWater:array<vec4f>;
@group(0) @binding(11) var<storage,read> flatWater:array<vec4f>;
@group(0) @binding(12) var<storage,read> coveredCells:array<u32>;
@group(0) @binding(13) var<storage,read_write> patchOutput:array<vec4f>;
@compute @workgroup_size(64)
fn restrictPatches(@builtin(global_invocation_id) gid:vec3u){
 let idx=gid.x;if(idx>=U.live.w){return;}
 let sid=probeSurface[idx]&65535u;let s=surfaces[sid];let dims=(s.info.yz+u32(s.metric.w)-1u)/u32(s.metric.w);
 let local=idx-s.info.w;let q=vec2u(local%dims.x,local/dims.x);
 let lo=vec2f(q)*vec2f(s.info.yz)/vec2f(dims);let hi=vec2f(q+1u)*vec2f(s.info.yz)/vec2f(dims);
 var sum=vec3f(0);var area=0.;
 for(var y=u32(floor(lo.y));y<min(u32(ceil(hi.y)),s.info.z);y++){for(var x=u32(floor(lo.x));x<min(u32(ceil(hi.x)),s.info.y);x++){
  let cell=s.info.x+y*s.info.y+x;
  let overlap=max(vec2f(0),min(hi,vec2f(vec2u(x+1u,y+1u)))-max(lo,vec2f(vec2u(x,y))));
  let w=overlap.x*overlap.y*f32(coveredCells[cell]>>16u)*.25;
  sum+=(currentWater[cell].rgb-flatWater[cell].rgb)*w;area+=w;
 }}
 patchOutput[idx]=vec4f(sum/max(area,.000001),area*s.metric.z);
}

fn storeLink(slot:u32,h:Hit,rd:vec3f,throughput:vec3f,viaWater:bool) {
  if(h.t>=INF){return;}
  let s=surfaces[h.sid];let xy=min(vec2u(h.uv*vec2f(s.info.yz)),s.info.yz-1u);let cell=s.info.x+xy.y*s.info.y+xy.x;
  let dims=(s.info.yz+u32(s.metric.w)-1u)/u32(s.metric.w);let q=min(vec2u(h.uv*vec2f(dims)),dims-1u);let probe=s.info.w+q.y*dims.x+q.x;
  let m=surfaceMaterial(h);let weight=m.albedo*throughput*(1.-schlick(abs(dot(h.n,rd)),m.coat))/f32(DIFFUSE_DIRECTIONS);
  if(all(weight==vec3f(0))){return;}
  // Algebraic coalescing: all rays to this same finite-volume basis value
  // share its irradiance, so sum coefficients once without dropping a ray.
  for(var j=0u;j<compactCount;j++){
    if(links[compactBase+j].source==probe){links[compactBase+j].weight+=weight;return;}
  }
  links[compactBase+compactCount]=TransferLink(weight,probe);compactCount++;
}
@compute @workgroup_size(64)
fn bakeTransfer(@builtin(global_invocation_id) gid:vec3u) {
  let idx=gid.x;if(idx>=U.live.w){return;}
  compactBase=idx*DIFFUSE_LINKS;compactCount=0u;
  let packed=probeSurface[idx];let sid=packed&65535u;let s=surfaces[sid];let dims=(s.info.yz+u32(s.metric.w)-1u)/u32(s.metric.w);let local=idx-s.info.w;
  let h=surfaceHit(sid,(vec2f(f32(local%dims.x),f32(local/dims.x))+.5)/vec2f(dims));
  for(var i=0u;i<DIFFUSE_DIRECTIONS;i++){
    let slot=idx*DIFFUSE_LINKS+i*2u;
    if((packed>>16u)==0u){continue;}
    let r=sqrt((f32(i)+.5)/f32(DIFFUSE_DIRECTIONS));let angle=2.*PI*fract(f32(i)*.61803398875);
    let rd=basis(h.n)*vec3f(r*cos(angle),r*sin(angle),sqrt(1.-r*r));let ro=h.p+h.n*EPS*3.;
    let solid=traceSolid(ro,rd,INF);let wet=ro.y<U.state.y;let waterT=(U.state.y-ro.y)/rd.y;
    let wp=ro+rd*waterT;
    if(waterT<=EPS||waterT>=solid.t||wp.x<=WATER_MIN.x||wp.x>=WATER_MAX.x||wp.z<=WATER_MIN.y||wp.z>=WATER_MAX.y){
      storeLink(slot,solid,rd,select(vec3f(exp(-.004*solid.t)),waterTransmittance(solid.t),wet),false);continue;
    }
    let n=vec3f(0,select(1.,-1.,wet),0);let ni=select(1.,1.333,wet);let nt=select(1.333,1.,wet);let f=fresnel(-dot(rd,n),ni,nt);
    let before=select(vec3f(exp(-.004*waterT)),waterTransmittance(waterT),wet);
    let reflected=reflect(rd,n);let a=traceSolid(wp+reflected*EPS*3.,reflected,INF);
    storeLink(slot,a,reflected,before*f*select(vec3f(exp(-.004*a.t)),waterTransmittance(a.t),wet),true);
    if(f<.99999){
      let refracted=refract(rd,n,ni/nt);let b=traceSolid(wp+refracted*EPS*3.,refracted,INF);
      storeLink(slot+1u,b,refracted,before*(1.-f)*(ni*ni/(nt*nt))*select(waterTransmittance(b.t),vec3f(exp(-.004*b.t)),wet),true);
    }
  }
 linkCounts[idx]=compactCount;
}
var<workgroup> partial:array<vec3f,128>;
@compute @workgroup_size(128)
fn propagate(@builtin(global_invocation_id) gid:vec3u,@builtin(local_invocation_index) lid:u32) {
  let idx=gid.x/32u;let lane=lid%32u;var sum=vec3f(0);
  if(idx<U.live.w){for(var i=lane;i<linkCounts[idx];i+=32u){
    let link=links[idx*DIFFUSE_LINKS+i];
    let weight=link.weight;
    if(all(weight==vec3f(0))){continue;}
    let e=patchDelta[link.source].rgb+previousBounce[link.source].rgb;
    sum+=e*weight;
  }}
  partial[lid]=sum;workgroupBarrier();
  for(var stride=16u;stride>0u;stride/=2u){
    if(lane<stride){partial[lid]+=partial[lid+stride];}workgroupBarrier();
  }
  if(idx<U.live.w&&lane==0u){nextBounce[idx]=vec4f(partial[lid],f32(probeSurface[idx]>>16u));}
}
