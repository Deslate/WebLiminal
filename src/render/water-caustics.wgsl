// v1.20: one scrambled 4-D Sobol net over water area x aperture area.
// No regular emitter lattice and no linear, spatially correlated aperture shift.
// Samples and scramble seeds are time/camera independent. Current waves move paths.
// Direction numbers from the first four Sobol polynomials; no texture assets.
const SKY_DIRECTIONS=array<vec4u,32>(
  vec4u(2147483648u,2147483648u,2147483648u,2147483648u),
  vec4u(1073741824u,3221225472u,3221225472u,3221225472u),
  vec4u(536870912u,2684354560u,1610612736u,536870912u),
  vec4u(268435456u,4026531840u,2415919104u,1342177280u),
  vec4u(134217728u,2281701376u,3892314112u,4160749568u),
  vec4u(67108864u,3422552064u,1543503872u,1946157056u),
  vec4u(33554432u,2852126720u,2382364672u,2717908992u),
  vec4u(16777216u,4278190080u,3305111552u,2466250752u),
  vec4u(8388608u,2155872256u,1753219072u,3632267264u),
  vec4u(4194304u,3233808384u,2629828608u,624951296u),
  vec4u(2097152u,2694840320u,3999268864u,1507852288u),
  vec4u(1048576u,4042260480u,1435500544u,3872391168u),
  vec4u(524288u,2290614272u,2154299392u,2013790208u),
  vec4u(262144u,3435921408u,3231449088u,3020685312u),
  vec4u(131072u,2863267840u,1626210304u,2181169152u),
  vec4u(65536u,4294901760u,2421489664u,3271884800u),
  vec4u(32768u,2147516416u,3900735488u,546275328u),
  vec4u(16384u,3221274624u,1556135936u,1363623936u),
  vec4u(8192u,2684395520u,2388680704u,4226424832u),
  vec4u(4096u,4026593280u,3314585600u,1977167872u),
  vec4u(2048u,2281736192u,1751705600u,2693105664u),
  vec4u(1024u,3422604288u,2627492864u,2437829632u),
  vec4u(512u,2852170240u,4008611328u,3689389568u),
  vec4u(256u,4278255360u,1431684352u,635137280u),
  vec4u(128u,2155905152u,2147543168u,1484783744u),
  vec4u(64u,3233857728u,3221249216u,3846176960u),
  vec4u(32u,2694881440u,1610649184u,2044723232u),
  vec4u(16u,4042322160u,2415969680u,3067084880u),
  vec4u(8u,2290649224u,3892340840u,2148008184u),
  vec4u(4u,3435973836u,1543543964u,3222012020u),
  vec4u(2u,2863311530u,2382425838u,537002146u),
  vec4u(1u,4294967295u,3305133397u,1342505107u)
);
fn skyNet(index:u32)->vec4f {var bits=index;var v=vec4u(0);var bit=0u;loop{if(bits==0u){break;}if((bits&1u)!=0u){v^=SKY_DIRECTIONS[bit];}bits>>=1u;bit++;}
 // Fixed fast Owen digit scrambling; PBRT 4e Sobol Samplers (Laine-Karras).
 v=reverseBits(v);v^=v*0x3d20adeau;let seed=vec4u(0x92c9d7abu,0x5e2d58d1u,0xa68371e5u,0x38f57ac9u);v+=seed;v*=(seed>>vec4u(16u))|vec4u(1u);v^=v*0x05526c56u;v^=v*0x53a22864u;v=reverseBits(v);
 return (vec4f(v>>vec4u(8u))+.5)/16777216.;}
// Current-time finite quadrature of incident flux on the actual water surface.
// No stochastic branch selection, temporal resampling, keyframes or image filtering.
// Two u32 limbs per channel: portable exact carry, no dark-flux truncation.
struct WaterFlux { rlo:atomic<u32>, rhi:atomic<u32>, glo:atomic<u32>, ghi:atomic<u32>, blo:atomic<u32>, bhi:atomic<u32> };
@group(0) @binding(3) var<storage,read_write> liveFlux:array<WaterFlux>;
@group(0) @binding(4) var<storage,read_write> liveField:array<vec4f>;
@group(0) @binding(5) var<storage,read> cellSurface:array<u32>;
@group(0) @binding(6) var<storage,read_write> opticalPaths:array<vec4f>;
@group(0) @binding(7) var<storage,read_write> liveCounters:array<atomic<u32>>;
@group(0) @binding(8) var<storage,read_write> liveRows:array<vec4f>;
var<workgroup> packetCounts:array<atomic<u32>,5>;
fn fluxScale()->f32 {return select(1099511627776.,16777216.,U.sampling.w==0u);}
fn addFlux(j:u32,v:vec3f){
 let upper=vec3u(floor(v/4294967296.));let lower=vec3u(v-vec3f(upper)*4294967296.);
 let r=atomicAdd(&liveFlux[j].rlo,lower.r);atomicAdd(&liveFlux[j].rhi,upper.r+select(0u,1u,r>0xffffffffu-lower.r));
 let g=atomicAdd(&liveFlux[j].glo,lower.g);atomicAdd(&liveFlux[j].ghi,upper.g+select(0u,1u,g>0xffffffffu-lower.g));
 let b=atomicAdd(&liveFlux[j].blo,lower.b);atomicAdd(&liveFlux[j].bhi,upper.b+select(0u,1u,b>0xffffffffu-lower.b));
}
fn readFlux(j:u32)->vec3f {
 let low=vec3f(f32(atomicLoad(&liveFlux[j].rlo)),f32(atomicLoad(&liveFlux[j].glo)),f32(atomicLoad(&liveFlux[j].blo)));
 let high=vec3f(f32(atomicLoad(&liveFlux[j].rhi)),f32(atomicLoad(&liveFlux[j].ghi)),f32(atomicLoad(&liveFlux[j].bhi)));
 return high*4294967296.+low;
}
fn receive(h:Hit,power:vec3f) {
  if(h.t>=INF){return;}
  let s=surfaces[h.sid];let p=h.uv*vec2f(s.info.yz)-.5;let base=vec2i(floor(p));let f=fract(p);
  for(var y=0;y<2;y++){for(var x=0;x<2;x++){
    let q=clamp(base+vec2i(x,y),vec2i(0),vec2i(s.info.yz)-1);let j=s.info.x+u32(q.y)*s.info.y+u32(q.x);
    let w=select(1.-f.x,f.x,x==1)*select(1.-f.y,f.y,y==1);let v=max(power,vec3f(0))*w*fluxScale();
    addFlux(j,v);
  }}
  atomicAdd(&packetCounts[2],1u);atomicAdd(&packetCounts[3],1u);
  if(h.p.y>U.state.y+.1){atomicAdd(&packetCounts[4],1u);}
}
fn waterPacket(p:vec3f,n:vec3f,l:vec3f,power:vec3f,auditIndex:u32) {
  let incoming=-l;let f=fresnel(dot(l,n),1.,1.333);atomicAdd(&packetCounts[1],1u);
  for(var branch=0u;branch<2u;branch++){
    let reflected=branch==0u;let rd=select(refract(incoming,n,1./1.333),reflect(incoming,n),reflected);
    let h=traceDynamicSolid(p+rd*EPS*2.,rd,INF);let outgoing=power*select(1.-f,f,reflected);
    if(h.material==10u){continue;}
    var transmitted=outgoing;
    if(!reflected){transmitted*=waterTransmittance(h.t);}else{transmitted*=exp(-.004*h.t);}
    receive(h,transmitted*(1.-schlick(abs(dot(rd,h.n)),.043)));
    if(auditIndex<256u && h.t<INF){
      let ai=(auditIndex*2u+branch)*8u;let source=p+l*((6.101-p.y)/l.y);
      opticalPaths[ai]=vec4f(source,0);opticalPaths[ai+1u]=vec4f(incoming,1.);
      opticalPaths[ai+2u]=vec4f(p,1.333);opticalPaths[ai+3u]=vec4f(n,f);
      opticalPaths[ai+4u]=vec4f(rd,select(0.,1.,reflected));opticalPaths[ai+5u]=vec4f(h.p,f32(h.sid));
      opticalPaths[ai+6u]=vec4f(power,-1.); // -1: both branches, no probability division
      opticalPaths[ai+7u]=vec4f(outgoing,1.);
    }
  }
}
@compute @workgroup_size(64)
fn emitWater(@builtin(global_invocation_id) gid:vec3u,@builtin(local_invocation_id) local:vec3u) {
  if(local.x<5u){atomicStore(&packetCounts[local.x],0u);}
  workgroupBarrier();
  let i=gid.x;let nSun=U.live.x;
  if(i<nSun*nSun){
    // Sample the projected aperture footprint in horizontal water coordinates.
    // A margin encloses its displacement over the entire wave envelope.
    let central=sunDirection();let shift=-central.xz/central.y*(6.101-U.state.y);let margin=max(vec2f(.12),(U.state.z*1.07+U.lighting.x)*abs(central.xz/central.y)+select(.005,.07,(U.sampling.w==1u||U.sampling.w==2u)));let lo=U.opening.xz+shift-margin;let hi=U.opening.yw+shift+margin;
    let q=(vec2f(f32(i%nSun),f32(i/nSun))+.5)/f32(nSun);let xz=mix(lo,hi,q);
    let disc=fract(vec2f(f32(i%nSun)*.754877666+f32(i/nSun)*.569840296,f32(i%nSun)*.438579021+f32(i/nSun)*.819172513));
    let radius=select(0.,.00465,(U.sampling.w==1u||U.sampling.w==2u))*sqrt(disc.x);let angle=2.*PI*disc.y;
    let l=normalize(central+basis(central)*vec3f(radius*cos(angle),radius*sin(angle),0.));
    if(xz.x>-7.&&xz.x<7.&&xz.y>-17.&&xz.y<10.){
      let w=wave(xz);let p=vec3f(xz.x,w.x,xz.y);let n=normalize(vec3f(-w.y,1,-w.z));
      let distance=(6.102-p.y)/l.y;let hit=traceDynamicSolid(p+l*EPS*2.,l,distance);
      if(hit.t>=distance-.005 && dot(n,l)>0.){
        let area=(hi.x-lo.x)*(hi.y-lo.y)/f32(nSun*nSun);
        let power=sunIrradiance()*max(dot(n,l),0.)/n.y*area*exp(-.004*distance);
        waterPacket(p,n,l,power,select(99999u,i/1024u,i%1024u==128u));
      }
    }
    atomicAdd(&packetCounts[0],1u);
  }
  let nx=U.live.y;let ny=U.live.z;
  if(i<nx*ny){

    let waterArea=14.*27./f32(nx*ny);let lightArea=(U.opening.y-U.opening.x)*(U.opening.w-U.opening.z);
    // 4,194,304 sky paths/frame by default (8x v1.19); 128 is an offline reference.
    // Each path has its own water point AND aperture point. Keep the original
    // receiver kernel and radiometry; no contrast reduction or extra smoothing.
    let sampleCount=select(32u,128u,U.sampling.w==2u);
    for(var k=0u;k<sampleCount;k++){
      let sample=skyNet(i*sampleCount+k);let xz=mix(vec2f(-7,-17),vec2f(7,10),sample.xy);let w=wave(xz);let p=vec3f(xz.x,w.x,xz.y);let n=normalize(vec3f(-w.y,1,-w.z));let uv=sample.zw;
      let lp=vec3f(mix(U.opening.x,U.opening.y,uv.x),6.102,mix(U.opening.z,U.opening.w,uv.y));let delta=lp-p;let d=length(delta);let l=delta/d;
      if(dot(n,l)>0. && traceDynamicSolid(p+l*EPS*2.,l,d).t>=d-.005){
        let power=skyRadiance(l)*max(dot(n,l),0.)/n.y*waterArea*max(l.y,0.)*lightArea/(f32(sampleCount)*d*d)*exp(-.004*d);
        waterPacket(p,n,l,power,99999u);
      }
      atomicAdd(&packetCounts[0],1u);
    }
  }
  workgroupBarrier();
  if(local.x<5u){atomicAdd(&liveCounters[local.x],atomicLoad(&packetCounts[local.x]));}
}
@compute @workgroup_size(128)
fn waterHorizontal(@builtin(global_invocation_id) gid:vec3u) {
  let idx=gid.x;if(idx>=U.counts.x){return;}
  let s=surfaces[cellSurface[idx]&65535u];let local=idx-s.info.x;let xy=vec2i(i32(local%s.info.y),i32(local/s.info.y));var sum=vec3f(0);var weight=0.;
  let radius=select(3,1,s.metric.w>4.);
  for(var x=-3;x<=3;x++){if(abs(x)>radius){continue;}
    let q=xy+vec2i(x,0);if(q.x<0||q.x>=i32(s.info.y)){continue;}
    let j=s.info.x+u32(q.y)*s.info.y+u32(q.x);let w=f32(radius+1-abs(x));let coverage=f32(cellSurface[j]>>16u)*.25;
    sum+=readFlux(j)*w;weight+=coverage*w;
  }
  liveRows[idx]=vec4f(sum,weight);
}
@compute @workgroup_size(128)
fn waterResolve(@builtin(global_invocation_id) gid:vec3u) {
  let idx=gid.x;if(idx>=U.counts.x){return;}
  let s=surfaces[cellSurface[idx]&65535u];let local=idx-s.info.x;let xy=vec2i(i32(local%s.info.y),i32(local/s.info.y));var sum=vec3f(0);var weight=0.;
  let radius=select(3,1,s.metric.w>4.);
  for(var y=-3;y<=3;y++){if(abs(y)>radius){continue;}
    let q=xy+vec2i(0,y);if(q.y<0||q.y>=i32(s.info.z)){continue;}
    let j=s.info.x+u32(q.y)*s.info.y+u32(q.x);let w=f32(radius+1-abs(y));let v=liveRows[j];sum+=v.rgb*w;weight+=v.a*w;
  }
  let e=sum/(max(weight,1.)*fluxScale()*s.metric.z);liveField[idx]=vec4f(e,dot(e,vec3f(.2126,.7152,.0722)));
}
