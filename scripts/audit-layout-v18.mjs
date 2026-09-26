// Execute the production WGSL course function on GPU, compare to independently
// assembled physical boundary lists (both radii, mirrors, springs and crown).
import {chromium} from '@playwright/test';import{readFileSync,writeFileSync,mkdirSync}from'node:fs';import assert from'node:assert/strict';
const out=process.env.EVIDENCE_DIR||'/Users/steven/Projects/workroom-v1.11-evidence/final';mkdirSync(out,{recursive:true});
const common=readFileSync('src/render/common.wgsl','utf8');const fn=common.slice(common.indexOf('fn archCourse('),common.indexOf('fn tileMode('));
const tests=[];
for(const r of [1.78,2.1]){const half=Math.PI*r/2,n=Math.floor(half/.25)-1,cut=(half-n*.25)/2;const widths=[...Array(n).fill(.25),cut,cut,cut,cut,...Array(n).fill(.25)];let a=0;
for(const w of widths){for(const f of [.01,.5,.99])tests.push({s:a+w*f,r,center:a+w/2,width:w});a+=w;}
for(const s of [-.125,Math.PI*r+.125])tests.push({s,r,center:s,width:.25});}
const browser=await chromium.launch({channel:'chrome',headless:true});try{const p=await browser.newPage();await p.goto('http://127.0.0.1:4174/poolrooms/');const result=await p.evaluate(async({fn,tests})=>{
const adapter=await navigator.gpu.requestAdapter();const device=await adapter.requestDevice();const data=new Float32Array(tests.flatMap(t=>[t.s,t.r]));const input=device.createBuffer({size:data.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});device.queue.writeBuffer(input,0,data);
const output=device.createBuffer({size:tests.length*16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});const read=device.createBuffer({size:tests.length*16,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
const module=device.createShaderModule({code:`const PI:f32=3.141592653589793; ${fn}\n@group(0) @binding(0) var<storage,read> input:array<vec2f>; @group(0) @binding(1) var<storage,read_write> output:array<vec4f>; @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3u){if(id.x>=arrayLength(&input)){return;} output[id.x]=vec4f(archCourse(input[id.x].x,input[id.x].y),0);}`});
const pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main'}});const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:input}},{binding:1,resource:{buffer:output}}]});const enc=device.createCommandEncoder(),pass=enc.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil(tests.length/64));pass.end();enc.copyBufferToBuffer(output,0,read,0,tests.length*16);device.queue.submit([enc.finish()]);await read.mapAsync(GPUMapMode.READ);const values=Array.from(new Float32Array(read.getMappedRange()));device.destroy();return values;},{fn,tests});let centerError=0,widthError=0;
for(let i=0;i<tests.length;i++){centerError=Math.max(centerError,Math.abs(tests[i].center-result[i*4+1]));widthError=Math.max(widthError,Math.abs(tests[i].width-result[i*4+2]));}
assert(centerError<.000002);assert(widthError<.000002);const report={samples:tests.length,maximumCenterErrorMetres:centerError,maximumWidthErrorMetres:widthError,method:'Production archCourse WGSL on GPU versus independently assembled 250mm full modules and mirrored closing cuts'};writeFileSync(`${out}/layout-audit.json`,JSON.stringify(report,null,2));console.log(report);
}finally{await browser.close()}
