// Current-time finite quadrature of incident flux on the actual water surface.
// No stochastic branches, light keyframes or temporal filtering.
@group(0) @binding(3) var<storage,read_write> liveFlux:array<Flux>;
@group(0) @binding(4) var<storage,read_write> liveField:array<vec4f>;
@group(0) @binding(5) var<storage,read> cellSurface:array<u32>;
@group(0) @binding(6) var<storage,read_write> opticalPaths:array<vec4f>;
@group(0) @binding(7) var<storage,read_write> liveCounters:array<atomic<u32>>;
@group(0) @binding(8) var<storage,read_write> liveRows:array<vec4f>;
var<workgroup> packetCounts:array<atomic<u32>,5>;
const FLUX_SCALE:f32=16777216.;
fn receive(h:Hit,power:vec3f) {
  if(h.t>=INF){return;}
  let s=surfaces[h.sid];let p=h.uv*vec2f(s.info.yz)-.5;let base=vec2i(floor(p));let f=fract(p);
  for(var y=0;y<2;y++){for(var x=0;x<2;x++){
    let q=clamp(base+vec2i(x,y),vec2i(0),vec2i(s.info.yz)-1);let j=s.info.x+u32(q.y)*s.info.y+u32(q.x);
    let w=select(1.-f.x,f.x,x==1)*select(1.-f.y,f.y,y==1);let v=vec3u(max(power,vec3f(0))*w*FLUX_SCALE);
    atomicAdd(&liveFlux[j].r,v.r);atomicAdd(&liveFlux[j].g,v.g);atomicAdd(&liveFlux[j].b,v.b);
  }}
  atomicAdd(&packetCounts[2],1u);atomicAdd(&packetCounts[3],1u);
  if(h.p.y>U.state.y+.1){atomicAdd(&packetCounts[4],1u);}
}
fn waterPacket(p:vec3f,n:vec3f,l:vec3f,power:vec3f,auditIndex:u32) {
  let incoming=-l;let f=fresnel(dot(l,n),1.,1.333);atomicAdd(&packetCounts[1],1u);
  for(var branch=0u;branch<2u;branch++){
    let reflected=branch==0u;let rd=select(refract(incoming,n,1./1.333),reflect(incoming,n),reflected);
    let h=traceSolid(p+rd*EPS*2.,rd,INF);let outgoing=power*select(1.-f,f,reflected);
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
    let l=sunDirection();let shift=-l.xz/l.y*(6.101-U.state.y);let lo=U.opening.xz+shift-.12;let hi=U.opening.yw+shift+.12;
    let q=(vec2f(f32(i%nSun),f32(i/nSun))+.5)/f32(nSun);let xz=mix(lo,hi,q);
    if(xz.x>-7.&&xz.x<7.&&xz.y>-17.&&xz.y<10.){
      let w=wave(xz);let p=vec3f(xz.x,w.x,xz.y);let n=normalize(vec3f(-w.y,1,-w.z));
      let distance=(6.102-p.y)/l.y;let hit=traceSolid(p+l*EPS*2.,l,distance);
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
    let xz=mix(vec2f(-7,-17),vec2f(7,10),(vec2f(f32(i%nx),f32(i/nx))+.5)/vec2f(f32(nx),f32(ny)));
    let w=wave(xz);let p=vec3f(xz.x,w.x,xz.y);let n=normalize(vec3f(-w.y,1,-w.z));
    let waterArea=14.*27./f32(nx*ny);let lightArea=(U.opening.y-U.opening.x)*(U.opening.w-U.opening.z);
    for(var k=0u;k<4u;k++){
      let uv=vec2f(.25+f32(k%2u)*.5,.25+f32(k/2u)*.5);
      let lp=vec3f(mix(U.opening.x,U.opening.y,uv.x),6.102,mix(U.opening.z,U.opening.w,uv.y));let delta=lp-p;let d=length(delta);let l=delta/d;
      if(dot(n,l)>0. && traceSolid(p+l*EPS*2.,l,d).t>=d-.005){
        let power=skyRadiance(l)*max(dot(n,l),0.)/n.y*waterArea*max(l.y,0.)*lightArea/(4.*d*d)*exp(-.004*d);
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
