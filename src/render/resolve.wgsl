@group(0) @binding(3) var<storage,read_write> flux: array<Flux>;
@group(0) @binding(4) var<storage,read_write> irradiance: array<vec4f>;
@group(0) @binding(5) var<storage,read> cellSurface: array<u32>;
@compute @workgroup_size(128)
fn resolve(@builtin(global_invocation_id) gid:vec3u) {
  let idx=gid.x;if(idx>=U.counts.x){return;}
  let s=surfaces[cellSurface[idx]];let local=idx-s.info.x;let xy=vec2i(i32(local%s.info.y),i32(local/s.info.y));
  var sum=vec4f(0);var weight=0.;
  for(var y=-3;y<=3;y++){for(var x=-3;x<=3;x++){
    let q=xy+vec2i(x,y);if(any(q<vec2i(0))||any(q>=vec2i(s.info.yz))){continue;}
    let j=s.info.x+u32(q.y)*s.info.y+u32(q.x);let w=f32((4-abs(x))*(4-abs(y)));
    sum+=vec4f(f32(atomicLoad(&flux[j].r)),f32(atomicLoad(&flux[j].g)),f32(atomicLoad(&flux[j].b)),f32(atomicLoad(&flux[j].c)))*w;weight+=w;
  }}
  let estimate=sum/(max(weight,1.)*2048.*f32(U.sampling.x)*s.metric.z);
  irradiance[idx]=mix(irradiance[idx],estimate,U.settings.y);
}
