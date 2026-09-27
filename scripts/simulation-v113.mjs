import {chromium}from'@playwright/test';import{mkdirSync,writeFileSync}from'node:fs';import assert from'node:assert/strict';
const out=process.env.EVIDENCE_DIR||'../workroom-v1.13-evidence/final';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{const p=await browser.newPage();await p.goto('http://127.0.0.1:4173');await p.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs);await p.evaluate(()=>window.__POOLROOMS_V1__.configure({pause:true}));
const result=await p.evaluate(async()=>{
 const {createWaveSimulation}=await import('/src/render/wave-simulation.js');const adapter=await navigator.gpu.requestAdapter();const device=await adapter.requestDevice();const errors=[];device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
 const sim=await createWaveSimulation(device);const base={seed:7819301,waterLevel:.42,waveAmplitude:0,waveForcing:false};const geometry={shapes:[]};
 const summaries=[];
 const stats=(s)=>{let sum=0,kinetic=0,potential=0,max=0,near=0,far=0,n=0;const a=s.values,{nx,nz,dx}=s.grid;for(let z=2;z<nz-2;z++)for(let x=2;x<nx-2;x++){const i=(z*nx+x)*4,h=a[i],v=a[i+1];sum+=h;max=Math.max(max,Math.abs(h));kinetic+=v*v;const gx=(a[i+4]-a[i-4])/(2*dx),gz=(a[i+nx*4]-a[i-nx*4])/(2*dx);potential+=9.81*.42*(gx*gx+gz*gz);const r=Math.hypot(-7+(x+.5)*dx-3,-17+(z+.5)*dx);if(r<.3)near+=h*h;if(r>.6&&r<2.2)far+=h*h;n++;}return {time:s.time,maxHeight:max,meanHeight:sum/n,energy:(kinetic+potential)*dx*dx,near,far,finite:a.every(Number.isFinite)};};
 sim.reset(base,geometry);sim.advance(0);const flat=stats(await sim.audit());sim.addWake({x:3,z:0,amplitude:.012});
 for(let i=1;i<=600;i++){sim.advance(i/60);if([12,60,180,600].includes(i))summaries.push(stats(await sim.audit()));else if(i%60===0)await device.queue.onSubmittedWorkDone();}
 // Frame-rate independence: same fixed steps and pressure history at 30/60 Hz.
 async function run(hz){sim.reset({...base,waveAmplitude:.052,waveForcing:true},geometry);sim.advance(0);for(let i=1;i<=hz*2;i++){sim.advance(i/hz);if(i===hz/2)sim.addWake({x:3,z:0,amplitude:.012});if(i%hz===0)await device.queue.onSubmittedWorkDone();}return await sim.audit();}
 const a=await run(60),b=await run(30);let maxDifference=0;for(let i=0;i<a.values.length;i++)maxDifference=Math.max(maxDifference,Math.abs(a.values[i]-b.values[i]));
 // Long deterministic integration, no render/recording overhead. Inspect state
 // after 20/40/60/90 seconds and measure correlation in the same 2x2m patch.
 sim.reset({...base,waveAmplitude:.052,waveForcing:true},geometry);sim.advance(0);const long=[];
 for(let i=1;i<=5400;i++){sim.advance(i/60);if([1200,2400,3600,5400].includes(i)){const s=await sim.audit(),roi=[];for(let z=496;z<560;z++)for(let x=288;x<352;x++)roi.push(s.values[(z*448+x)*4]);long.push({...stats(s),roi});}else if(i%60===0)await device.queue.onSubmittedWorkDone();}
 device.destroy();return {flat,summaries,maxDifference,long,errors};
});
writeFileSync(`${out}/simulation.json`,JSON.stringify(result,null,2));assert.equal(result.errors.length,0);assert.equal(result.flat.maxHeight,0);assert(result.summaries.every(x=>x.finite));assert(result.summaries[1].far>result.summaries[0].far*5);assert(result.summaries.at(-1).energy<result.summaries[1].energy);assert(result.maxDifference<1e-5);assert(result.long.every(x=>x.finite&&x.maxHeight<.20));console.log(JSON.stringify({...result,long:result.long.map(({roi,...s})=>s)},null,2));
}finally{await browser.close()}
