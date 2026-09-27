import {chromium} from '@playwright/test';import {mkdirSync,writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
const out=process.env.EVIDENCE_DIR||'../workroom-v1.22-evidence/simulation';mkdirSync(out,{recursive:true});const b=await chromium.launch({channel:'chrome',headless:true});
try {const p=await b.newPage();await p.goto('http://localhost:4173');await p.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs);await p.evaluate(()=>window.__POOLROOMS_V1__.pause());const r=await p.evaluate(async()=>{
 const {createWaveSimulation}=await import('/src/render/wave-simulation.js');const adapter=await navigator.gpu.requestAdapter(),device=await adapter.requestDevice(),sim=await createWaveSimulation(device);const defaults=window.__POOLROOMS_V1__.snapshot().config;
 const base={...defaults,waveForcing:true};const results={};
 for(const [name,settings]of Object.entries({before:{waveAmplitude:.12,waveSpeed:1},after:{waveAmplitude:.052,waveSpeed:.28}})){
  sim.reset({...base,...settings},{shapes:[]});sim.advance(0);const frames=[],summary=[];
  for(let i=0;i<=1200;i++){if(i)sim.advance(i/60);if(i%4===0){const a=await sim.audit();const patch=[];let ss=0,max=0;for(let j=0;j<a.values.length;j+=4){const h=a.values[j];ss+=h*h;max=Math.max(max,Math.abs(h));}for(let z=496;z<560;z++)for(let x=288;x<352;x++)patch.push(a.values[(z*448+x)*4]);frames.push(patch);summary.push({t:i/60,rms:Math.sqrt(ss/(448*864)),max});}}
  results[name]={hz:15,dx:1/32,frames,summary};
 }
 const samples=[];for(const hz of [30,60]){sim.reset(base,{shapes:[]});sim.advance(0);for(let i=1;i<=hz*2;i++){sim.advance(i/hz);if(i===hz/2)sim.addWake({x:3,z:0,amplitude:.003});}samples.push(await sim.audit());}
 let maxDifference=0;for(let i=0;i<samples[0].values.length;i++)maxDifference=Math.max(maxDifference,Math.abs(samples[0].values[i]-samples[1].values[i]));device.destroy();return {...results,maxDifference};
});writeFileSync(`${out}/raw-spectra.json`,JSON.stringify(r));console.log('30/60Hz maximum state difference',r.maxDifference);assert(r.maxDifference<1e-5);
}finally{await b.close()}
