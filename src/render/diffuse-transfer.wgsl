// Static visibility/BRDF transfer, applied to CURRENT irradiance every frame.
// Low-frequency diffuse transport uses the mean water plane, not a time cache.
// Direction-major layout lets adjacent GPU lanes read adjacent links.
struct TransferLink { weight:vec4f, source:vec4u };
@group(0) @binding(3) var<storage,read> probeSurface:array<u32>;
@group(0) @binding(4) var<storage,read_write> links:array<TransferLink>;
@group(0) @binding(5) var<storage,read> currentWater:array<vec4f>;
@group(0) @binding(6) var<storage,read> previousBounce:array<vec4f>;
@group(0) @binding(7) var<storage,read_write> nextBounce:array<vec4f>;
@group(0) @binding(8) var<storage,read> flatWater:array<vec4f>;

fn storeLink(slot:u32,h:Hit,rd:vec3f,throughput:vec3f,viaWater:bool) {
  if(h.t>=INF){links[slot]=TransferLink(vec4f(0),vec4u(0));return;}
  let s=surfaces[h.sid];let xy=min(vec2u(h.uv*vec2f(s.info.yz)),s.info.yz-1u);let cell=s.info.x+xy.y*s.info.y+xy.x;
  let dims=(s.info.yz+3u)/4u;let q=min(vec2u(h.uv*vec2f(dims)),dims-1u);let probe=s.info.w+q.y*dims.x+q.x;
  let m=surfaceMaterial(h);let weight=m.albedo*throughput*(1.-schlick(abs(dot(h.n,rd)),m.coat))/32.;
  links[slot]=TransferLink(vec4f(weight,0),vec4u(cell,probe,0,0));
}
@compute @workgroup_size(64)
fn bakeTransfer(@builtin(global_invocation_id) gid:vec3u) {
  let idx=gid.x;if(idx>=U.live.w){return;}
  let packed=probeSurface[idx];let sid=packed&65535u;let s=surfaces[sid];let dims=(s.info.yz+3u)/4u;let local=idx-s.info.w;
  let h=surfaceHit(sid,(vec2f(f32(local%dims.x),f32(local/dims.x))+.5)/vec2f(dims));
  for(var i=0u;i<32u;i++){
    let slot=idx+i*2u*U.live.w;links[slot]=TransferLink(vec4f(0),vec4u(0));links[slot+U.live.w]=TransferLink(vec4f(0),vec4u(0));
    if((packed>>16u)==0u){continue;}
    let r=sqrt((f32(i)+.5)/32.);let angle=2.*PI*fract(f32(i)*.61803398875);
    let rd=basis(h.n)*vec3f(r*cos(angle),r*sin(angle),sqrt(1.-r*r));let ro=h.p+h.n*EPS*3.;
    let solid=traceSolid(ro,rd,INF);let wet=ro.y<U.state.y;let waterT=(U.state.y-ro.y)/rd.y;
    let wp=ro+rd*waterT;
    if(waterT<=EPS||waterT>=solid.t||wp.x<=-7.||wp.x>=7.||wp.z<=-17.||wp.z>=10.){
      storeLink(slot,solid,rd,select(vec3f(exp(-.004*solid.t)),waterTransmittance(solid.t),wet),false);continue;
    }
    let n=vec3f(0,select(1.,-1.,wet),0);let ni=select(1.,1.333,wet);let nt=select(1.333,1.,wet);let f=fresnel(-dot(rd,n),ni,nt);
    let before=select(vec3f(exp(-.004*waterT)),waterTransmittance(waterT),wet);
    let reflected=reflect(rd,n);let a=traceSolid(wp+reflected*EPS*3.,reflected,INF);
    storeLink(slot,a,reflected,before*f*select(vec3f(exp(-.004*a.t)),waterTransmittance(a.t),wet),true);
    if(f<.99999){
      let refracted=refract(rd,n,ni/nt);let b=traceSolid(wp+refracted*EPS*3.,refracted,INF);
      storeLink(slot+U.live.w,b,refracted,before*(1.-f)*(ni*ni/(nt*nt))*select(waterTransmittance(b.t),vec3f(exp(-.004*b.t)),wet),true);
    }
  }
}
@compute @workgroup_size(128)
fn propagate(@builtin(global_invocation_id) gid:vec3u) {
  let idx=gid.x;if(idx>=U.live.w){return;}var sum=vec3f(0);
  for(var i=0u;i<64u;i++){
    let link=links[i*U.live.w+idx];if(all(link.weight.rgb==vec3f(0))){continue;}
    let cell=link.source.x;let probe=link.source.y;
    let e=currentWater[cell].rgb-flatWater[cell].rgb+previousBounce[probe].rgb;
    sum+=e*link.weight.rgb;
  }
  nextBounce[idx]=vec4f(sum,f32(probeSurface[idx]>>16u));
}
