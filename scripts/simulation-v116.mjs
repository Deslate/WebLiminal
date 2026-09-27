import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const out=process.env.EVIDENCE_DIR||'../workroom-v1.16-evidence/final';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:4173');await page.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs);await page.evaluate(()=>window.__POOLROOMS_V1__.pause());
 const result=await page.evaluate(async()=>{
  const {createWaveSimulation}=await import('/src/render/wave-simulation.js');
  const adapter=await navigator.gpu.requestAdapter(),device=await adapter.requestDevice(),errors=[];device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
  const simulation=await createWaveSimulation(device);const config={waveAmplitude:0,waveForcing:false,waterLevel:.42,seed:7819301};
  const runs=[];
  for(const speed of [.8,1.6]){
   simulation.reset(config,{shapes:[]});const rows=[];
   for(let i=0;i<=1800;i++){
    const t=i/60,x=-2.8+Math.min(6.4,Math.max(0,t-3)*speed);simulation.setBody({x,z:1});simulation.advance(t);
    const marks=[0,3,5,7,9,11,13,17,23,30];
    if(marks.some(v=>Math.abs(t-v)<1e-6)){
     const q=await simulation.audit();let peak=0,mean=0,energy=0,bow=-1,rear=1,far=0,farN=0;const roi=[];
     for(let j=0;j<q.values.length;j+=4){const h=q.values[j],v=q.values[j+1],px=-7+(j/4%448+.5)/32,pz=-17+(Math.floor(j/4/448)+.5)/32,dx=px-x,dz=pz-1;peak=Math.max(peak,Math.abs(h));mean+=h;energy+=v*v;if(dx>.2&&dx<.8&&Math.abs(dz)<.25)bow=Math.max(bow,h);if(dx<-.25&&dx>-1.5&&Math.abs(dz)<.25)rear=Math.min(rear,h);if(dx<-1&&dx>-4&&Math.abs(dz)<2){far+=h*h;farN++}if(px>-4&&px<5&&pz>-2&&pz<4)roi.push(h);}
     rows.push({t,x,peak,mean:mean/(448*864),velocityEnergy:energy/1024,bow,rear,farRMS:Math.sqrt(far/farN),roi});
    }else if(i%60===0)await device.queue.onSubmittedWorkDone();
   }runs.push({speed,rows});
  }
  async function rate(hz){simulation.reset(config,{shapes:[]});for(let i=0;i<=hz*4;i++){const t=i/hz;simulation.setBody({x:-2+1.6*t,z:1});simulation.advance(t);if(i%hz===0)await device.queue.onSubmittedWorkDone();}return(await simulation.audit()).values;}
  const a30=await rate(30),a60=await rate(60);let rateMax=0,rateRMS=0;for(let i=0;i<a30.length;i+=4){const delta=a30[i]-a60[i];rateMax=Math.max(rateMax,Math.abs(delta));rateRMS+=delta*delta;}
  simulation.reset({...config,waveAmplitude:.052,waveForcing:true},{shapes:[]});let stressPeak=0;
  for(let i=0;i<=1200;i++){const t=i/60;simulation.setBody({x:-2.8+Math.min(6.4,Math.max(0,t-3)*1.6),z:1});simulation.advance(t);if(i%30===0){const q=await simulation.audit();for(let j=0;j<q.values.length;j+=4)stressPeak=Math.max(stressPeak,Math.abs(q.values[j]));}}
  device.destroy();return{runs,rateMax,rateRMS:Math.sqrt(rateRMS/(448*864)),stressPeak,errors,roi:{x:[-4,5],z:[-2,4],size:[288,192],dx:.03125}};
 });
 writeFileSync(`${out}/wake-simulation.json`,JSON.stringify(result));console.log(JSON.stringify({...result,runs:result.runs.map(r=>({speed:r.speed,rows:r.rows.map(({roi,...row})=>row)}))},null,2));
 assert.equal(result.errors.length,0);assert(result.stressPeak<.215);assert(result.rateMax<.005);assert(result.runs.every(r=>r.rows.every(row=>Number.isFinite(row.peak))));
 const fast=result.runs[1].rows.find(r=>r.t===7),slow=result.runs[0].rows.find(r=>r.t===11);assert(fast.farRMS>slow.farRMS*1.5);assert(fast.rear<-.005);assert(fast.bow>.005);
}finally{await browser.close()}
