// Current-time finite quadrature of incident flux on the actual water surface.
// No stochastic branches, light keyframes or temporal filtering.
@group(0) @binding(3) var<storage,read_write> liveFlux:array<Flux>;
@group(0) @binding(4) var<storage,read_write> liveField:array<vec4f>;
@group(0) @binding(5) var<storage,read> cellSurface:array<u32>;
@group(0) @binding(6) var<storage,read_write> opticalPaths:array<vec4f>;
@group(0) @binding(7) var<storage,read_write> liveCounters:array<atomic<u32>>;
@group(0) @binding(8) var<storage,read_write> liveRows:array<vec4f>;
var<workgroup> packetCounts:array<atomic<u32>,5>;
// 30 fractional bits preserve weak, split reflected packets. The brightest
// audited cell remains far below the 4-unit uint32 accumulation limit.
const FLUX_SCALE:f32=1073741824.;
fn receive(h:Hit,power:vec3f,footprint:f32) {
  if(h.t>=INF){return;}
  let s=surfaces[h.sid];let p=h.uv*vec2f(s.info.yz)-.5;let base=vec2i(floor(p));let f=fract(p);
  // A sky packet represents a finite water patch, not a point. Reconstruct
  // that footprint on the floor; retain the fine solar and wall estimator.
  if(footprint>0. && h.sid==3u){
    let width=max(vec2f(1.),vec2f(footprint)*vec2f(s.info.yz)/s.metric.xy);
    let radius=vec2i(ceil(width));var norm=vec2f(0.);
    for(var x=1-radius.x;x<=radius.x;x++){norm.x+=max(0.,width.x-abs(f32(x)-f.x));}
    for(var y=1-radius.y;y<=radius.y;y++){norm.y+=max(0.,width.y-abs(f32(y)-f.y));}
    for(var y=1-radius.y;y<=radius.y;y++){
      let wy=max(0.,width.y-abs(f32(y)-f.y));
      for(var x=1-radius.x;x<=radius.x;x++){
        let weight=max(0.,width.x-abs(f32(x)-f.x))*wy/max(norm.x*norm.y,.00001);
        if(weight<=0.){continue;}
        let q=clamp(base+vec2i(x,y),vec2i(0),vec2i(s.info.yz)-1);let j=s.info.x+u32(q.y)*s.info.y+u32(q.x);
        let v=vec3u(max(power,vec3f(0))*weight*FLUX_SCALE);
        atomicAdd(&liveFlux[j].r,v.r);atomicAdd(&liveFlux[j].g,v.g);atomicAdd(&liveFlux[j].b,v.b);
      }
    }
  }else{for(var y=0;y<2;y++){for(var x=0;x<2;x++){
    let q=clamp(base+vec2i(x,y),vec2i(0),vec2i(s.info.yz)-1);let j=s.info.x+u32(q.y)*s.info.y+u32(q.x);
    let w=select(1.-f.x,f.x,x==1)*select(1.-f.y,f.y,y==1);let v=vec3u(max(power,vec3f(0))*w*FLUX_SCALE);
    atomicAdd(&liveFlux[j].r,v.r);atomicAdd(&liveFlux[j].g,v.g);atomicAdd(&liveFlux[j].b,v.b);
  }}
  }
  atomicAdd(&packetCounts[2],1u);atomicAdd(&packetCounts[3],1u);
  if(h.p.y>U.state.y+.1){atomicAdd(&packetCounts[4],1u);}
}
fn waterPacket(p:vec3f,n:vec3f,l:vec3f,power:vec3f,auditIndex:u32,footprint:f32,branches:u32) {
  let incoming=-l;let f=fresnel(dot(l,n),1.,1.333);atomicAdd(&packetCounts[1],1u);
  for(var branch=0u;branch<2u;branch++){
    if((branches & (1u<<branch))==0u){continue;}
    let reflected=branch==0u;let rd=select(refract(incoming,n,1./1.333),reflect(incoming,n),reflected);
    let h=traceDynamicSolid(p+rd*EPS*2.,rd,INF);let outgoing=power*select(1.-f,f,reflected);
    if(h.material==10u){continue;}
    var transmitted=outgoing;
    if(!reflected){transmitted*=waterTransmittance(h.t);}else{transmitted*=exp(-.004*h.t);}
    receive(h,transmitted*(1.-schlick(abs(dot(rd,h.n)),.043)),footprint);
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
// Integrate the same 0.2664-degree angular solar radius used by cached
// photon paths. Four symmetric disk samples match its first/second moments.
// Directions are fixed in source space, never randomized between frames.
const SUN_SAMPLES:u32=4u;
fn solarDiskDirection(k:u32)->vec3f {
  let ring=k/4u;let r=.00465*sqrt((f32(ring)+.5)/f32(SUN_SAMPLES/4u));
  let angle=2.*PI*(f32(k%4u)+.5+f32(ring)*.38196601125)/4.;
  return normalize(sunDirection()+basis(sunDirection())*vec3f(r*cos(angle),r*sin(angle),0.));
}
fn solarWaterPacket(i:u32,nSun:u32,l:vec3f) {
    // Sample the projected aperture footprint in horizontal water coordinates.
    // A margin encloses its displacement over the entire wave envelope.
    let shift=-l.xz/l.y*(6.101-U.state.y);let margin=max(vec2f(.12),(U.state.z*1.07+U.lighting.x)*abs(l.xz/l.y)+.005);let lo=U.opening.xz+shift-margin;let hi=U.opening.yw+shift+margin;
    let q=(vec2f(f32(i%nSun),f32(i/nSun))+.5)/f32(nSun);let xz=mix(lo,hi,q);
    if(xz.x>-7.&&xz.x<7.&&xz.y>-17.&&xz.y<10.){
      let w=wave(xz);let p=vec3f(xz.x,w.x,xz.y);let n=normalize(vec3f(-w.y,1,-w.z));
      let distance=(6.102-p.y)/l.y;let hit=traceDynamicSolid(p+l*EPS*2.,l,distance);
      if(hit.t>=distance-.005 && dot(n,l)>0.){
        let area=(hi.x-lo.x)*(hi.y-lo.y)/f32(nSun*nSun*2u);
        let power=sunIrradiance()*max(dot(n,l),0.)/n.y*area*exp(-.004*distance);
        waterPacket(p,n,l,power,select(99999u,i/1024u,i%1024u==128u),0.,3u);
      }
    }
}
// Integrate the finite sky aperture rather than treating it as four point sources.
// Extra angular samples are only for reflected flux. Transmission keeps its
// existing estimator; both use the same geometric normal and Fresnel partition.
const ENABLE_SKY_REFLECTION:bool=true;
const SKY_REFLECTION_SIDE:u32=8u;
fn skyWaterPacket(p:vec3f,n:vec3f,waterArea:f32,lightArea:f32,uv:vec2f,samples:f32,footprint:f32,branches:u32){
      let lp=vec3f(mix(U.opening.x,U.opening.y,uv.x),6.102,mix(U.opening.z,U.opening.w,uv.y));let delta=lp-p;let d=length(delta);let l=delta/d;
      if(dot(n,l)>0. && traceDynamicSolid(p+l*EPS*2.,l,d).t>=d-.005){
        let power=skyRadiance(l)*max(dot(n,l),0.)/n.y*waterArea*max(l.y,0.)*lightArea/(samples*d*d)*exp(-.004*d);
        // Near-axis projection of one source cell through the mean interface.
        // This is a finite-footprint estimate, not a full curved beam Jacobian.
        waterPacket(p,n,l,power,99999u,footprint,branches);
      }
}

@compute @workgroup_size(64)
fn emitWater(@builtin(global_invocation_id) gid:vec3u,@builtin(local_invocation_id) local:vec3u) {
  if(local.x<5u){atomicStore(&packetCounts[local.x],0u);}
  workgroupBarrier();
  let i=gid.x;let nSun=U.live.x;
  if(i<nSun*nSun){
    // Opposite directions cancel first-order angular error at each water cell.
    // Adjacent cells use the orthogonal pair: four disk nodes, two rays/cell.
    let k=(i%nSun+i/nSun)%2u;
    solarWaterPacket(i,nSun,solarDiskDirection(k));
    solarWaterPacket(i,nSun,solarDiskDirection(k+2u));
    atomicAdd(&packetCounts[0],2u);
  }
  let nx=U.live.y;let ny=U.live.z;
  if(i<nx*ny){
    let xz=mix(vec2f(-7,-17),vec2f(7,10),(vec2f(f32(i%nx),f32(i/nx))+.5)/vec2f(f32(nx),f32(ny)));
    let w=wave(xz);let p=vec3f(xz.x,w.x,xz.y);let n=normalize(vec3f(-w.y,1,-w.z));
    let waterArea=14.*27./f32(nx*ny);let lightArea=(U.opening.y-U.opening.x)*(U.opening.w-U.opening.z);
    let footprint=max(14./f32(nx),27./f32(ny))*(1.+U.state.y/(1.333*max(.1,6.102-U.state.y)));
    for(var k=0u;k<4u;k++){
      let uv=vec2f(.25+f32(k%2u)*.5,.25+f32(k/2u)*.5);
      skyWaterPacket(p,n,waterArea,lightArea,uv,4.,footprint,2u);
      atomicAdd(&packetCounts[0],1u);
    }
    if(ENABLE_SKY_REFLECTION){
      for(var k=0u;k<SKY_REFLECTION_SIDE*SKY_REFLECTION_SIDE;k++){
        let uv=(vec2f(f32(k%SKY_REFLECTION_SIDE),f32(k/SKY_REFLECTION_SIDE))+.5)/f32(SKY_REFLECTION_SIDE);
        skyWaterPacket(p,n,waterArea,lightArea,uv,f32(SKY_REFLECTION_SIDE*SKY_REFLECTION_SIDE),footprint,1u);
        atomicAdd(&packetCounts[0],1u);
      }
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
    sum+=vec3f(f32(atomicLoad(&liveFlux[j].r)),f32(atomicLoad(&liveFlux[j].g)),f32(atomicLoad(&liveFlux[j].b)))*w;weight+=coverage*w;
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
  let e=sum/(max(weight,1.)*FLUX_SCALE*s.metric.z);liveField[idx]=vec4f(e,dot(e,vec3f(.2126,.7152,.0722)));
}
