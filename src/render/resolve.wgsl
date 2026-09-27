// Cached indirect photons only; dynamic solar / sky receivers bypass this filter.
// Floor receiver density doubled from 24/m to 48/m in 911c8bd, but the
// kernel stayed in cell units. Restore its 7/24 m and 5/24 m zero-crossing
// half-widths on the floor, rather than leaving stationary sampling mottling.
// Keep coverage normalization and every other surface's reconstruction unchanged.
struct FilterRow { broad:vec4f, fine:vec4f, weights:vec2f, pad:vec2f };
@group(0) @binding(3) var<storage,read_write> flux: array<Flux>;
@group(0) @binding(4) var<storage,read_write> irradiance: array<vec4f>;
@group(0) @binding(5) var<storage,read> cellSurface: array<u32>;
@group(0) @binding(6) var<storage,read_write> fineIrradiance: array<vec4f>;
@group(0) @binding(7) var<storage,read_write> rows: array<FilterRow>;
@compute @workgroup_size(128)
fn horizontal(@builtin(global_invocation_id) gid:vec3u) {
  let idx=gid.x;if(idx>=U.counts.x){return;}
  let s=surfaces[cellSurface[idx]&65535u];let local=idx-s.info.x;let xy=vec2i(i32(local%s.info.y),i32(local/s.info.y));
  let floorCell=(cellSurface[idx]&65535u)==3u;let radius=select(6,13,floorCell);let broadWidth=select(7,14,floorCell);let fineWidth=select(5,10,floorCell);
  var b=vec4f(0);var f=vec4f(0);var weights=vec2f(0);
  for(var x=-radius;x<=radius;x++){
    let q=xy+vec2i(x,0);if(q.x<0||q.x>=i32(s.info.y)){continue;}
    let j=s.info.x+u32(q.y)*s.info.y+u32(q.x);let coverage=f32(cellSurface[j]>>16u)*.25;
    let value=vec4f(f32(atomicLoad(&flux[j].r)),f32(atomicLoad(&flux[j].g)),f32(atomicLoad(&flux[j].b)),f32(atomicLoad(&flux[j].c)));
    let w=vec2f(f32(broadWidth-abs(x)),f32(max(0,fineWidth-abs(x))));b+=value*w.x;f+=value*w.y;weights+=w*coverage;
  }
  rows[idx]=FilterRow(b,f,weights,vec2f(0));
}
@compute @workgroup_size(128)
fn resolve(@builtin(global_invocation_id) gid:vec3u) {
  let idx=gid.x;if(idx>=U.counts.x){return;}
  let s=surfaces[cellSurface[idx]&65535u];let local=idx-s.info.x;let xy=vec2i(i32(local%s.info.y),i32(local/s.info.y));
  let floorCell=(cellSurface[idx]&65535u)==3u;let radius=select(6,13,floorCell);let broadWidth=select(7,14,floorCell);let fineWidth=select(5,10,floorCell);
  var b=vec4f(0);var f=vec4f(0);var weights=vec2f(0);
  for(var y=-radius;y<=radius;y++){
    let q=xy+vec2i(0,y);if(q.y<0||q.y>=i32(s.info.z)){continue;}
    let j=s.info.x+u32(q.y)*s.info.y+u32(q.x);let row=rows[j];
    let w=vec2f(f32(broadWidth-abs(y)),f32(max(0,fineWidth-abs(y))));b+=row.broad*w.x;f+=row.fine*w.y;weights+=row.weights*w;
  }
  let normalization=2048.*f32(U.sampling.x)*f32(U.counts.z)*s.metric.z;
  irradiance[idx]=b/(max(weights.x,1.)*normalization);
  fineIrradiance[idx]=f/(max(weights.y,1.)*normalization);
}
