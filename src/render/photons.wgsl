@group(0) @binding(3) var<storage,read_write> flux: array<Flux>;
@group(0) @binding(4) var<storage,read_write> counters: array<atomic<u32>>;
@group(0) @binding(5) var<storage,read_write> pathAudit: array<vec4f>;
var<workgroup> groupCounts: array<atomic<u32>,5>;
// RGB flux is quantized only for portable atomic accumulation; never a sampled texture.
fn deposit(h:Hit,power:vec3f,caustic:bool) {
  let s=surfaces[h.sid];let q=h.uv*vec2f(s.info.yz)-.5;let base=vec2i(floor(q));let f=fract(q);
  for(var dy=0;dy<2;dy++){for(var dx=0;dx<2;dx++){
    let xy=clamp(base+vec2i(dx,dy),vec2i(0),vec2i(s.info.yz)-1);let idx=s.info.x+u32(xy.y)*s.info.y+u32(xy.x);
    let w=select(1.-f.x,f.x,dx==1)*select(1.-f.y,f.y,dy==1);
    let val=vec3u(max(vec3f(0),power)*w*2048.);
    atomicAdd(&flux[idx].r,val.r);atomicAdd(&flux[idx].g,val.g);atomicAdd(&flux[idx].b,val.b);
    if(caustic){atomicAdd(&flux[idx].c,u32(dot(power,vec3f(.2126,.7152,.0722))*w*2048.));}
  }}
  atomicAdd(&groupCounts[select(2u,3u,caustic)],1u);
  if(caustic&&h.p.y>U.state.y+.10){atomicAdd(&groupCounts[4],1u);}
}
@compute @workgroup_size(64)
fn photons(@builtin(global_invocation_id) gid:vec3u,@builtin(local_invocation_id) local:vec3u) {
  let i=gid.x;
  if(local.x<5u){atomicStore(&groupCounts[local.x],0u);}
  workgroupBarrier();
  var seed=hash(i+U.counts.z*U.sampling.x+U.counts.w);
  let dims=U.opening.yw-U.opening.xz;
  let stratum=vec2f(f32(i%512u),f32(i/512u));
  let uv=(stratum+vec2f(rnd(&seed),rnd(&seed)))/vec2f(512.,f32(U.sampling.x/512u));
  var ro=vec3f(U.opening.x+uv.x*dims.x,6.101,U.opening.z+uv.y*dims.y);
  var rd=-sampleSun(&seed);var power=sunIrradiance()*dims.x*dims.y*abs(rd.y)/.75;
  if(rnd(&seed)>.75){rd=cosineDirection(vec3f(0,-1,0),&seed);power=skyRadiance(-rd)*PI*dims.x*dims.y/.25;}
  atomicAdd(&groupCounts[0],1u);
  var underwater=false;var touchedWater=false;var diffuseBounces=0u;var recorded=false;var received=false;let recordThis=i%256u==128u;let ai=(i/256u)*8u;
  for(var bounce=0u;bounce<12u;bounce++) {
    var h=traceSolid(ro,rd,INF);
    if(U.sampling.z==1u){
      let t=(U.state.y-ro.y)/rd.y;let p=ro+rd*t;
      if(t>EPS&&t<h.t&&p.x>-7.&&p.x<7.&&p.z>-17.&&p.z<10.){h=Hit(t,p,vec3f(0,1,0),vec2f(0),0u,9u);}
    }else{h=trace(ro,rd,INF);}
    if(h.t>=INF){break;}
    if(underwater){power*=waterTransmittance(h.t);}else{power*=exp(-.004*h.t);}
    if(h.material==9u){
      atomicAdd(&groupCounts[1],1u);touchedWater=true;
      let entering=dot(rd,h.n)<0.;let n=select(-h.n,h.n,entering);let ni=select(1.333,1.,entering);let nt=select(1.,1.333,entering);
      let f=fresnel(-dot(rd,n),ni,nt);
      // Deliberately importance-sample the weak reflected branch more often; divide
      // by its probability. Reflection + transmission still sum to exactly one.
      let probability=select(.5,1.,f>.9999);
      let canRecord=recordThis&&!recorded&&diffuseBounces==0u;
      if(canRecord){pathAudit[ai]=vec4f(ro,0);pathAudit[ai+1u]=vec4f(rd,ni);pathAudit[ai+2u]=vec4f(h.p,nt);pathAudit[ai+3u]=vec4f(n,f);pathAudit[ai+6u]=vec4f(power,probability);}
      if(rnd(&seed)<probability){power*=f/probability;rd=reflect(rd,n);}else{power*=(1.-f)/(1.-probability);rd=refract(rd,n,ni/nt);underwater=entering;}
      if(canRecord){pathAudit[ai+4u]=vec4f(rd,select(0.,1.,dot(rd,n)>0.));pathAudit[ai+7u]=vec4f(power,1.);recorded=true;}
      ro=h.p+rd*EPS*2.;continue;
    }
    if(recorded&&!received){pathAudit[ai+5u]=vec4f(h.p,f32(h.sid));received=true;}
    let m=surfaceMaterial(h);let n=select(-m.normal,m.normal,dot(rd,m.normal)<0.);
    // First direct diffuse hit is handled by next-event estimation in camera paths.
    // LS+D and all subsequent indirect paths are measured here in world space.
    if(bounce>0u && !(U.sampling.z==1u && touchedWater && diffuseBounces==0u)){deposit(h,power*(1.-schlick(abs(dot(rd,n)),m.coat)),touchedWater&&diffuseBounces==0u);}
    let v=-rd;let fres=schlick(max(dot(v,n),0.),m.coat);let ps=clamp(fres,.08,.8);
    if(rnd(&seed)<ps){
      let outgoing=sampleGGX(n,v,m.roughness,&seed);let no=max(dot(n,outgoing),0.);let nv=max(dot(n,v),0.);
      if(no<=0.){break;}let halfv=normalize(v+outgoing);let nh=max(dot(n,halfv),0.);let vh=max(dot(v,halfv),.00001);let a=m.roughness*m.roughness;
      let g=smithG1(no,a)*smithG1(nv,a);power*=schlick(vh,m.coat)*g*vh/max(nv*nh*ps,.00001);rd=outgoing;
    }else{
      rd=cosineDirection(n,&seed);power*=m.albedo*(1.-fres)*(1.-schlick(max(dot(n,rd),0.),m.coat))/(1.-ps);diffuseBounces++;
    }
    ro=h.p+rd*EPS*2.;
    if(bounce>2u){let q=.72;if(rnd(&seed)>q){break;}power/=q;}
  }
  workgroupBarrier();
  if(local.x<5u){atomicAdd(&counters[local.x],atomicLoad(&groupCounts[local.x]));}
}
