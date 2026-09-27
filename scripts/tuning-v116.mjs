import{chromium}from'@playwright/test';import{mkdirSync,writeFileSync}from'node:fs';import assert from'node:assert/strict';
const out=process.env.EVIDENCE_DIR||'../workroom-v1.16-tuning-evidence';mkdirSync(out,{recursive:true});const b=await chromium.launch({channel:'chrome',headless:true});
try{const p=await b.newPage();await p.goto('http://127.0.0.1:4173');await p.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs);await p.evaluate(()=>window.__POOLROOMS_V1__.pause());
const data=await p.evaluate(async()=>{const{createWaveSimulation}=await import('/src/render/wave-simulation.js');const adapter=await navigator.gpu.requestAdapter(),device=await adapter.requestDevice(),errors=[];device.addEventListener('uncapturederror',e=>errors.push(e.error.message));const sim=await createWaveSimulation(device),rows=[],ambient=[];const common={waterLevel:.42,seed:7819301};
function measure(q,x){let peak=0,bow=-1,rear=1,far=0,n=0,span=0;const roi=[];for(let i=0;i<q.values.length;i+=4){const h=q.values[i],px=-7+(i/4%448+.5)/32,pz=-17+(Math.floor(i/4/448)+.5)/32,dx=px-x,dz=pz-1;peak=Math.max(peak,Math.abs(h));if(dx>.2&&dx<.8&&Math.abs(dz)<.25)bow=Math.max(bow,h);if(dx<-.25&&dx>-1.5&&Math.abs(dz)<.25)rear=Math.min(rear,h);if(dx<-1&&dx>-4&&Math.abs(dz)<2){far+=h*h;n++;if(Math.abs(h)>.002)span=Math.max(span,Math.abs(dz));}if(px>-4&&px<5&&pz>-2&&pz<4)roi.push(h);}return{peak,bow,rear,farRMS:Math.sqrt(far/n),widthAbove2mm:2*span,roi};}
for(const[name,waveSpeed,bodyWakeBoost]of[['before',1,0],['after',.28,.6]]){
 sim.reset({...common,waveAmplitude:.052,waveForcing:true,waveSpeed,bodyWakeBoost},{shapes:[]});sim.setBody(null);const frames=[];const end=name==='before'?85:301;
 for(let i=0;i<=end;i++){sim.advance(i/30);if(i>=end-1)frames.push((await sim.audit()).values);else if(i%30===0)await device.queue.onSubmittedWorkDone();}
 let sum=0,h2=0,n=0;for(let i=0;i<frames[0].length;i+=4){const px=-7+(i/4%448+.5)/32,pz=-17+(Math.floor(i/4/448)+.5)/32;if(px>1&&px<5&&pz>-3&&pz<1){sum+=(frames[1][i]-frames[0][i])**2;h2+=frames[0][i]**2;n++;}}
 ambient.push({name,waveSpeed,physicalPhase:sim.info.time,heightRMS:Math.sqrt(h2/n),frameDeltaRMS:Math.sqrt(sum/n)});
 for(const speed of [.8,1.6]){sim.reset({...common,waveAmplitude:0,waveForcing:false,waveSpeed,bodyWakeBoost},{shapes:[]});const marks=[];
 for(let i=0;i<=450;i++){const t=i/30,x=-2.8+Math.min(6.4,Math.max(0,t-3)*speed);sim.setBody({x,z:1});sim.advance(t);if([90,150,210,270,330,390,450].includes(i))marks.push({t,x,...measure(await sim.audit(),x)});else if(i%30===0)await device.queue.onSubmittedWorkDone();}rows.push({name,speed,marks});}
}
const stress=[];
for(const speed of [.8,1.6]){sim.reset({...common,waveAmplitude:.052,waveForcing:true,waveSpeed:.28,bodyWakeBoost:.6},{shapes:[]});let peak=0;
 for(let i=0;i<=480;i++){const t=i/30;sim.setBody({x:-2.8+Math.min(6.4,Math.max(0,t-3)*speed),z:1});sim.advance(t);if(i%15===0){const q=await sim.audit();for(let j=0;j<q.values.length;j+=4)peak=Math.max(peak,Math.abs(q.values[j]));}}stress.push({speed,peak});}
// Frame-rate independence with the accepted boosted slow walk.
async function rate(hz){sim.reset({...common,waveAmplitude:0,waveForcing:false,waveSpeed:.28,bodyWakeBoost:.6},{shapes:[]});for(let i=0;i<=hz*5;i++){sim.setBody({x:-2+.8*i/hz,z:1});sim.advance(i/hz);if(i%hz===0)await device.queue.onSubmittedWorkDone();}return(await sim.audit()).values;}
const a=await rate(30),c=await rate(60);let max=0;for(let i=0;i<a.length;i+=4)max=Math.max(max,Math.abs(a[i]-c[i]));device.destroy();return{rows,ambient,stress,rateMax:max,errors};});
writeFileSync(out+'/simulation.json',JSON.stringify(data));console.log(JSON.stringify({...data,rows:data.rows.map(r=>({...r,marks:r.marks.map(({roi,...m})=>m)}))},null,2));assert.equal(data.errors.length,0);assert(data.rateMax<.005);assert(data.stress.every(r=>r.peak<.215));assert(data.rows.every(r=>r.marks.every(m=>m.peak<.215)));
}finally{await b.close()}
