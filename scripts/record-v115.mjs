import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync,copyFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const out=process.env.EVIDENCE_DIR||'../workroom-v1.15-evidence/final';mkdirSync(out,{recursive:true});
const b=await chromium.launch({channel:'chrome',headless:true});
try {
 const c=await b.newContext({viewport:{width:1280,height:832},recordVideo:{dir:`${out}/raw-video`,size:{width:1280,height:832}}});
 const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:4173');await p.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs);
 await p.evaluate(async()=>{const a=window.__POOLROOMS_V1__;await a.configure({view:{x:-.8,y:1.62,z:1,yaw:-Math.PI/2,pitch:-.8},freeze:false,pause:false,scale:1});a.setObserver({x:5.8,y:1.25,z:5.2,yaw:.64,pitch:-.16});document.body.classList.add('evidence');window.log=[];window.timer=setInterval(()=>{const s=a.snapshot();window.log.push({t:s.elapsed,actor:s.view,observer:s.observer,simulation:s.dynamics.simulation,internal:s.internal,completed:s.completedFrames,wakes:s.wakes})},100)});
 const marks=[];
 for(let sec=0;sec<30;sec++) {
  if(sec===3)await p.keyboard.down('KeyW');if(sec===6)await p.keyboard.up('KeyW');
  await p.waitForTimeout(1000);
  if([2,4,5,6,7,9,13,21,29].includes(sec)){const r=await p.evaluate(()=>({png:document.querySelector('canvas').toDataURL(),s:window.__POOLROOMS_V1__.snapshot()}));writeFileSync(`${out}/observer-${sec+1}.png`,Buffer.from(r.png.split(',')[1],'base64'));marks.push({second:sec+1,t:r.s.elapsed,actor:r.s.view,simulation:r.s.dynamics.simulation});}
 }
 const result=await p.evaluate(()=>{clearInterval(window.timer);return{log:window.log,snapshot:window.__POOLROOMS_V1__.snapshot()}});
 const video=p.video();await c.close();copyFileSync(await video.path(),`${out}/observer-walk.webm`);
 writeFileSync(`${out}/observer-walk.json`,JSON.stringify({method:'Real browser recording. W key held for three wall-clock seconds; fixed observer, production collision-resolved player, ambient simulation and grain enabled. Recording is not the performance benchmark.',marks,errors,...result},null,2));assert.equal(errors.length,0);assert(result.log.some(r=>r.wakes.length>=6));console.log({simulationSeconds:result.log.at(-1).simulation.time-result.log[0].simulation.time,actorStart:result.log[0].actor,actorEnd:result.log.at(-1).actor,errors});
} finally {await b.close()}
