// Bounded spatial footprint reconstruction of the reflected radiance component only.
// No image history; base radiance, grout and transmitted water stay untouched.
@group(0) @binding(3) var<storage,read> reflected:array<vec4f>;
@group(0) @binding(4) var<storage,read> guide:array<vec4f>;
@group(0) @binding(5) var<storage,read_write> rows:array<vec4f>;
@group(0) @binding(6) var<storage,read_write> image:array<vec4f>;
fn footprintWeight(center:vec4f,other:vec4f,offset:f32)->f32 {
 if(center.x!=other.x){return 0.;}
 let sigma=max(center.z,.25);
 // Primary surface guidance stops water/wall bleeding. Reflection silhouettes
 // are deliberately NOT guides: their continuous coverage must be integrated.
 return exp(-.5*offset*offset/(sigma*sigma)-abs(center.y-other.y)/max(.1,center.y*.12));
}
@compute @workgroup_size(128)
fn horizontalReflection(@builtin(global_invocation_id) gid:vec3u){
 let idx=gid.x;if(idx>=U.render.x*U.render.y){return;}
 let g=guide[idx];if(g.z<.25||g.x==0.){rows[idx]=reflected[idx];return;}
 let xy=vec2i(i32(idx%U.render.x),i32(idx/U.render.x));let radius=4;var sum=vec3f(0);var weight=0.;
 for(var x=-radius;x<=radius;x++){
  let q=clamp(xy+vec2i(x,0),vec2i(0),vec2i(U.render.xy)-1);let j=u32(q.y)*U.render.x+u32(q.x);
  let w=footprintWeight(g,guide[j],f32(x));sum+=reflected[j].rgb*w;weight+=w;
 }
 rows[idx]=vec4f(sum/max(weight,.0001),1.);
}
@compute @workgroup_size(128)
fn verticalReflection(@builtin(global_invocation_id) gid:vec3u){
 let idx=gid.x;if(idx>=U.render.x*U.render.y){return;}
 let g=guide[idx];if(g.z<.25||g.x==0.){image[idx]+=vec4f(rows[idx].rgb,0);return;}
 let xy=vec2i(i32(idx%U.render.x),i32(idx/U.render.x));let radius=4;var sum=vec3f(0);var weight=0.;
 for(var y=-radius;y<=radius;y++){
  let q=clamp(xy+vec2i(0,y),vec2i(0),vec2i(U.render.xy)-1);let j=u32(q.y)*U.render.x+u32(q.x);
  let w=footprintWeight(g,guide[j],f32(y));sum+=rows[j].rgb*w;weight+=w;
 }
 image[idx]+=vec4f(sum/max(weight,.0001),0);
}
