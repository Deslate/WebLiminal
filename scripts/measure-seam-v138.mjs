import {chromium} from '@playwright/test';import {installVariant} from './v138-variant.mjs';import {writeFileSync} from 'node:fs';
const kernel=`
@compute @workgroup_size(1) fn seamAudit(@builtin(global_invocation_id) gid:vec3u){
 let i=gid.x;if(i>=U.render.w*100u){return;}let side=i%2u;let level=(i/2u)%5u;let row=(i/10u)%6u;let join=(i/60u)%2u;let face=4u+(i/120u);
 let heights=array<f32,6>(.75,1.125,2.125,3.125,4.625,5.125);
 let eps=pow(10.,-2.-f32(level));let sid=(9u+join+side)*9u+face;let s=shapes[sid/9u];let width=s.hi.x-s.lo.x;
 let uv=vec2f(select(1.-eps/width,eps/width,side==1u),heights[row]/5.8);let h=surfaceHit(sid,uv);
 image[2u*i]=photonEstimate(h);image[2u*i+1u]=vec4f(integratedSky(h),1.);
}`;
const inject=`
 if(options.seam){
 const m=device.createShaderModule({code:common+camera.slice(0,camera.indexOf('// Deterministic'))+${JSON.stringify(kernel)}});
 const p=await device.createComputePipelineAsync({layout:'auto',compute:{module:m,entryPoint:'seamAudit'}});
 const out=device.createBuffer({size:240*32,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});const rb=device.createBuffer({size:240*32,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
 const g=bindings(p,[[0,uniforms],[1,buffers.geometry],[2,buffers.surfaces],[3,buffers.combined],[4,out],[8,buffers.sky]]);
 const e=device.createCommandEncoder(),pass=e.beginComputePass();pass.setPipeline(p);pass.setBindGroup(0,g);pass.dispatchWorkgroups(240);pass.end();e.copyBufferToBuffer(out,0,rb,0,240*32);device.queue.submit([e.finish()]);await rb.mapAsync(GPUMapMode.READ);const values=Array.from(new Float32Array(rb.getMappedRange()));rb.unmap();rb.destroy();out.destroy();return {seam:values};
 }
`;
for(const name of ['before','after']){const b=await chromium.launch({channel:'chrome',headless:true});try{const p=await b.newPage();await installVariant(p,name);
 // Chain through the variant route, then inject a read-only GPU diagnostic.
 await p.route(u=>u.pathname==='/src/render/renderer.js',async r=>{const q=await r.fetch();let s=await q.text();if(name==='before')s=s.replace('horizontalGroup=bindings(pipelines[5],[[0,uniforms],[1,buffers.geometry],[2,','horizontalGroup=bindings(pipelines[5],[[0,uniforms],[2,').replace('composeGroup=bindings(pipelines[11],[[0,uniforms],[1,buffers.geometry],[2,','composeGroup=bindings(pipelines[11],[[0,uniforms],[2,');s=s.replace('async function audit(options={}) {','async function audit(options={}) {'+inject);await r.fulfill({response:q,body:s});});
 await p.goto('http://127.0.0.1:4173');await p.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs);await p.evaluate(()=>__POOLROOMS_V1__.configure({pause:true,freeze:true,scale:1}));await p.evaluate(()=>__POOLROOMS_V1__.renderEvidence(12,{},false));const a=await p.evaluate(()=>__POOLROOMS_V1__.audit({seam:true}));const errors=await p.evaluate(()=>__POOLROOMS_V1__.snapshot().errors);if(errors.length)throw Error(JSON.stringify(errors));if(!a.seam.some(v=>v>0))throw Error("empty diagnostic");writeFileSync(`../workroom-v1.38-evidence/${name}-seam.json`,JSON.stringify(a));console.log(name);
}finally{await b.close()}}
