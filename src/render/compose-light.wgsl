// Experimental static-cache-only lighting. No replacement caustic estimator.
@group(0) @binding(3) var<storage,read> coarse:array<vec4f>;
@group(0) @binding(4) var<storage,read> fine:array<vec4f>;
@group(0) @binding(7) var<storage,read_write> combined:array<vec4f>;
@compute @workgroup_size(128)
fn compose(@builtin(global_invocation_id) gid:vec3u){
 let idx=gid.x;if(idx>=U.counts.x){return;}
 combined[idx]=mix(coarse[idx],fine[idx],U.lighting.z);
}
