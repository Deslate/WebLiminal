// Assemble current illumination once per world cell, instead of repeating
// probe reconstruction for every primary / glaze / dielectric camera ray.
@group(0) @binding(3) var<storage,read> coarse:array<vec4f>;
@group(0) @binding(4) var<storage,read> fine:array<vec4f>;
@group(0) @binding(5) var<storage,read> water:array<vec4f>;
@group(0) @binding(6) var<storage,read> diffuse:array<vec4f>;
@group(0) @binding(7) var<storage,read_write> combined:array<vec4f>;
@group(0) @binding(8) var<storage,read> cellSurface:array<u32>;
@compute @workgroup_size(128)
fn compose(@builtin(global_invocation_id) gid:vec3u){
 let idx=gid.x;if(idx>=U.counts.x){return;}
 let sid=cellSurface[idx]&65535u;let s=surfaces[sid];let local=idx-s.info.x;
 let uv=(vec2f(f32(local%s.info.y),f32(local/s.info.y))+.5)/vec2f(s.info.yz);
 let dims=(s.info.yz+u32(s.metric.w)-1u)/u32(s.metric.w);let p=uv*vec2f(dims)-.5;let b=vec2i(floor(p));let f=fract(p);var sum=vec3f(0);var weight=0.;
 for(var y=0;y<2;y++){for(var x=0;x<2;x++){
  let e=diffuse[chartCellClamped(sid,b+vec2i(x,y),true)];
  let w=select(1.-f.x,f.x,x==1)*select(1.-f.y,f.y,y==1)*e.a;sum+=e.rgb*w;weight+=w;
 }}
 let base=mix(coarse[idx],fine[idx],U.lighting.z)+water[idx];
 combined[idx]=vec4f(max(vec3f(0),base.rgb+sum/max(weight,.0001)),base.w);
}
