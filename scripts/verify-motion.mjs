import { chromium } from '@playwright/test';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const out=process.env.EVIDENCE_DIR||'/Users/steven/Projects/workroom-v1.1-evidence/motion';
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1512,height:982},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(['error','warning'].includes(m.type()))errors.push(m.text());});
 await page.goto(process.env.VERIFY_URL||'http://127.0.0.1:4173');
 await page.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().completedFrames>3);
 const initial=await page.evaluate(()=>window.__POOLROOMS_V1__.snapshot());
 await page.keyboard.press('Space');await page.waitForTimeout(3000);
 await page.evaluate(()=>document.body.classList.add('evidence'));
 // Fixed physical time suppresses the scripted 34.6s sunlight event. Camera
 // still moves continuously; this flag does not choose a different camera path.
 await page.evaluate(()=>window.__POOLROOMS_V1__.configure({freeze:true,targetSamples:0}));
 const records=[];
 for(const scenario of ['slow-pan','fast-turn','dark-room','water-ceiling','diagonal-walk']) {
   console.log('Capture',scenario);
   await page.evaluate(name=>{
     window.__motionActive=true;const start=performance.now();
     const tick=now=>{
       if(!window.__motionActive)return;const t=(now-start)/1000;
       let v={x:-3.6,y:1.62,z:8,yaw:-.29,pitch:.028};
       if(name==='slow-pan')v.yaw=-.6+t*.12;
       if(name==='fast-turn')v.yaw=-.29+t*2.4;
       if(name==='dark-room')v={x:0,y:1.62,z:-14,yaw:t*.85,pitch:.05};
       if(name==='water-ceiling')v.pitch=-.75+Math.sin(t*.7)*1.5;
       if(name==='diagonal-walk'){v.x=-3.6+t*.55;v.z=8-t*1.4;v.yaw=-.29+t*.08;}
       window.__POOLROOMS_V1__.setView(v);requestAnimationFrame(tick);
     };requestAnimationFrame(tick);
   },scenario);
   for(let i=0;i<12;i++){
     await page.waitForTimeout(100);
     const file=`${scenario}-${String(i).padStart(2,'0')}.png`;
     await page.screenshot({path:`${out}/${file}`});
     const snapshot=await page.evaluate(()=>window.__POOLROOMS_V1__.snapshot());delete snapshot.frames;
     records.push({scenario,file,capturedAtMs:await page.evaluate(()=>performance.now()),snapshot});
   }
   await page.evaluate(()=>{window.__motionActive=false;});
   await page.waitForTimeout(60);
   const files=[];
   for(const [name,delay] of [['stop-0',0],['stop-1s',1000],['stop-2s',1000]]){
     await page.waitForTimeout(delay);const file=`${scenario}-${name}.png`;await page.screenshot({path:`${out}/${file}`});
     files.push({file,sha256:createHash('sha256').update(readFileSync(`${out}/${file}`)).digest('hex')});
   }
   assert.equal(files[0].sha256,files[1].sha256,`${scenario}: stop frame must already be identical to +1 second`);
   assert.equal(files[1].sha256,files[2].sha256,`${scenario}: no stationary flicker`);
   records.push({scenario,stopping:files});
 }
 assert.equal(errors.length,0);
 const audit=await page.evaluate(()=>window.__POOLROOMS_V1__.audit());delete audit.paths;
 writeFileSync(`${out}/manifest.json`,JSON.stringify({browser:await browser.version(),headless:true,firstFrameMs:initial.firstFrameMs,viewport:[1512,982],method:'Continuous RAF camera motion; 12 PNGs per scenario, >=100ms apart plus screenshot time. No screenshot timing is used as a performance benchmark. Stop-0 is captured after <=60ms settling wait plus screenshot latency.',records,audit,errors},null,2));
 console.log('Motion verification complete',out);
}finally{await browser.close();}
