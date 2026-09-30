// Fixed high-angle observer that keeps the walking player in frame; real W-key
// locomotion with production ambient waves. Recording overhead: not an fps test.
import {installVariant,EVIDENCE} from './cone-variant.mjs';
import {chromium} from '@playwright/test';import {mkdirSync,writeFileSync,copyFileSync} from 'node:fs';import assert from 'node:assert/strict';
const variant=process.env.VARIANT||'after',out=`${EVIDENCE}/observer-${variant}`;mkdirSync(out,{recursive:true});
const b=await chromium.launch({channel:'chrome',headless:true});
try{for(const [name,duration,fast] of [['slow',7,false],['fast',3.5,true]]){
 const c=await b.newContext({viewport:{width:1280,height:832},recordVideo:{dir:`${out}/raw`,size:{width:1280,height:832}}});
 const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await installVariant(p,variant);
 await p.goto('http://127.0.0.1:4173');await p.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs);
 await p.evaluate(async()=>{const a=window.__POOLROOMS_V1__;await a.setLab({resolution:1});await a.configure({view:{x:-2,y:1.62,z:1,yaw:-Math.PI/2,pitch:-.8},freeze:false,pause:false});a.setObserver({x:1,y:5.65,z:3.1,yaw:0,pitch:-1.20});document.body.classList.add('evidence');});
 const marks=[],start=Date.now();
 for(let sec=0;sec<16;sec++){
  if(sec===3){if(fast)await p.keyboard.down('ShiftLeft');await p.keyboard.down('KeyW');setTimeout(async()=>{await p.keyboard.up('KeyW');await p.keyboard.up('ShiftLeft');},duration*1000);}
  await p.waitForTimeout(Math.max(0,start+(sec+1)*1000-Date.now()));
  const r=await p.evaluate(()=>({png:document.querySelector('canvas').toDataURL(),s:window.__POOLROOMS_V1__.snapshot()}));writeFileSync(`${out}/${name}-${String(sec+1).padStart(2,'0')}.png`,Buffer.from(r.png.split(',')[1],'base64'));marks.push({second:sec+1,t:r.s.elapsed,actor:r.s.view,internal:r.s.internal});assert.equal(r.s.errors.length,0);
 }
 const video=p.video();await c.close();copyFileSync(await video.path(),`${out}/high-angle-${name}.webm`);
 writeFileSync(`${out}/high-angle-${name}.json`,JSON.stringify({variant,method:'Real W key; fixed high-angle observer includes the player for the whole path. Slow .8m/s, Shift 1.6m/s. Recording overhead; not an fps benchmark.',marks,errors},null,2));assert.equal(errors.length,0);
 console.log(variant,name,marks.map(m=>`${m.second}:${m.actor.x.toFixed(2)}`).join(' '));
}}finally{await b.close()}
