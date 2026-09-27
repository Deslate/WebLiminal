import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync,copyFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const out=process.env.EVIDENCE_DIR||'../workroom-v1.16-evidence/final';mkdirSync(out,{recursive:true});
const b=await chromium.launch({channel:'chrome',headless:true});
try {for(const [name,duration,fast]of[['slow',7,false],['fast',3.5,true]]){
 const c=await b.newContext({viewport:{width:1280,height:832},recordVideo:{dir:`${out}/raw-video`,size:{width:1280,height:832}}});
 const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:4173');await p.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs);
 await p.evaluate(async()=>{const a=window.__POOLROOMS_V1__;await a.configure({view:{x:-2,y:1.62,z:1,yaw:-Math.PI/2,pitch:-.8},freeze:false,pause:false,scale:1});a.setObserver({x:1,y:5.65,z:3.1,yaw:0,pitch:-1.20});document.body.classList.add('evidence');window.log=[];window.timer=setInterval(()=>{const s=a.snapshot();window.log.push({t:s.elapsed,actor:s.view,observer:s.observer,simulation:s.dynamics.simulation,internal:s.internal,completed:s.completedFrames})},100)});
 const marks=[];const start=Date.now();
 for(let sec=0;sec<24;sec++) {
  if(sec===3){if(fast)await p.keyboard.down('ShiftLeft');await p.keyboard.down('KeyW');setTimeout(async()=>{await p.keyboard.up('KeyW');await p.keyboard.up('ShiftLeft')},duration*1000)}
  await p.waitForTimeout(Math.max(0,start+(sec+1)*1000-Date.now()));
  const r=await p.evaluate(()=>({png:document.querySelector('canvas').toDataURL(),s:window.__POOLROOMS_V1__.snapshot()}));writeFileSync(`${out}/${name}-${String(sec+1).padStart(2,'0')}.png`,Buffer.from(r.png.split(',')[1],'base64'));marks.push({second:sec+1,t:r.s.elapsed,actor:r.s.view,simulation:r.s.dynamics.simulation,frameCost:r.s.dynamics.frameCost});
 }
 const result=await p.evaluate(()=>{clearInterval(window.timer);return{log:window.log,snapshot:window.__POOLROOMS_V1__.snapshot()}});
 const video=p.video();await c.close();copyFileSync(await video.path(),`${out}/high-angle-${name}.webm`);
 writeFileSync(`${out}/high-angle-${name}.json`,JSON.stringify({method:'Actual keyboard locomotion, fixed high-angle observer. Production ambient waves, lighting, grain, collision. Slow .8m/s; Shift fast1.6m/s. Capture overhead is excluded from standalone performance.',marks,errors,...result},null,2));assert.equal(errors.length,0);console.log({name,simulationSeconds:result.log.at(-1).simulation.time-result.log[0].simulation.time,actorStart:result.log[0].actor,actorEnd:result.log.at(-1).actor,errors});
}} finally {await b.close()}
