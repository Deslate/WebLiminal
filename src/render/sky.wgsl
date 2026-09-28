@group(0) @binding(3) var<storage,read> cellSurface: array<u32>;
@group(0) @binding(4) var<storage,read_write> skyIntegral: array<vec4f>;
@compute @workgroup_size(64)
fn integrateSky(@builtin(global_invocation_id) gid:vec3u) {
  let idx=gid.x;if(idx>=U.counts.x){return;}
  let sid=cellSurface[idx]&65535u;let s=surfaces[sid];let local=idx-s.info.x;
  let uv=(vec2f(f32(local%s.info.y),f32(local/s.info.y))+.5)/vec2f(s.info.yz);
  let h=surfaceHit(sid,uv);let ro=h.p+h.n*EPS*3.;var sum=vec3f(0);
  let area=(U.opening.y-U.opening.x)*(U.opening.w-U.opening.z);
  for(var i=0u;i<256u;i++){
    let p=vec2f((f32(i%16u)+.5)/16.,(f32(i/16u)+.5)/16.);
    let lp=vec3f(mix(U.opening.x,U.opening.y,p.x),6.102,mix(U.opening.z,U.opening.w,p.y));
    let delta=lp-ro;let dist=length(delta);let l=delta/dist;let nl=max(dot(h.n,l),0.);
    if(nl>0. && traceSolid(ro,l,dist-.004).t>=dist-.004){sum+=skyRadiance(l)*nl*(1.-pow(1.-nl,5.))*max(l.y,0.)*area/(dist*dist)/256.;}
  }
  skyIntegral[idx]=vec4f(sum,f32(cellSurface[idx]>>16u)*.25);
}
