import {chromium} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const out='../workroom-v1.35-evidence';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function gpu(){const s=execFileSync('ioreg',['-r','-c','AGXAccelerator','-l'],{encoding:'utf8'});return Object.fromEntries([...s.matchAll(/"((?:Device|Renderer|Tiler) Utilization %)"=(\d+)/g)].map(x=>[x[1],+x[2]]));}
async function sample(n=10){const a=[];for(let i=0;i<n;i++){a.push({wall:Date.now(),...gpu()});await sleep(1000);}return a;}
const report={};
report.closedBefore=await sample(5);console.log('closed before sampled');
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1280,height:832}});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(()=>{window.__submits=0;const f=GPUQueue.prototype.submit;GPUQueue.prototype.submit=function(...a){window.__submits++;return f.apply(this,a)};});
 // Observe completed production frames without modifying their render or time.
 await page.route('**/src/main.js*',async route=>{const r=await route.fetch();let s=await r.text();assert(s.includes('completed++;'));s=s.replace('completed++;',`    completed++;
    if(window.__captureNext>0){window.__captureNext--;window.__captured.push({t:elapsed,png:canvas.toDataURL(),dynamics:renderer.dynamics});}`);await route.fulfill({response:r,body:s});});
 await page.goto('http://127.0.0.1:4173');
 await page.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().completedFrames>120,{timeout:120000});
 await page.keyboard.press('KeyM'); // exercise audio suspension after a real gesture
 const snap=()=>page.evaluate(()=>({...window.__POOLROOMS_V1__.snapshot(),submits:window.__submits}));
 report.activeStart=await snap();report.active=await sample();report.activeEnd=await snap();
 await page.keyboard.press('Escape');
 await page.waitForFunction(()=>{const s=__POOLROOMS_V1__.snapshot();return s.paused&&!s.rendering;});
 report.pauseStart=await snap();console.log('paused');
 const png=await page.evaluate(()=>document.querySelector('canvas').toDataURL());
 fs.writeFileSync(`${out}/paused.png`,Buffer.from(png.split(',')[1],'base64'));
 await sleep(2000); // Hardware utilization counters lag the last submitted frame.
 report.paused=await sample(15);report.pauseEnd=await snap();console.log('pause sampled');
 assert.equal(report.pauseStart.submits,report.pauseEnd.submits);
 assert.equal(report.pauseStart.elapsed,report.pauseEnd.elapsed);
 assert.equal(report.pauseEnd.frameScheduled,false);
 assert.equal(await page.evaluate(()=>document.querySelector('canvas').toDataURL()),png);
 await page.evaluate(()=>dispatchEvent(new KeyboardEvent('keydown',{code:'Escape',repeat:true})));
 await page.keyboard.press('KeyW');
 assert.deepEqual((await snap()).view,report.pauseStart.view);
 assert.equal((await snap()).paused,true);
 await page.evaluate(()=>{window.__captureNext=6;window.__captured=[]});
 await page.keyboard.press('Escape');
 await page.waitForFunction(()=>window.__captured.length===6).catch(async e=>{console.log('capture failure',await snap(),await page.evaluate(()=>({n:__captureNext,f:__captured.length})),errors);throw e;});
 const frames=await page.evaluate(()=>window.__captured);
 report.resumeFrames=frames.map(({png,...x},i)=>{fs.writeFileSync(`${out}/resume-${i}.png`,Buffer.from(png.split(',')[1],'base64'));return x});
 assert.equal(frames[0].t,report.pauseStart.elapsed);
 assert.equal(frames[0].png,png);

 await sleep(2000);
 report.resumedStart=await snap();report.resumed=await sample();report.resumedEnd=await snap();
 // Resize while paused must retain backing pixels; apply deferred resize on resume.
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!__POOLROOMS_V1__.snapshot().rendering);
 const beforeResize=await page.evaluate(()=>document.querySelector('canvas').toDataURL());
 await page.setViewportSize({width:1100,height:760});
 assert.equal(await page.evaluate(()=>document.querySelector('canvas').toDataURL()),beforeResize);
 await page.keyboard.press('Escape');await page.waitForFunction(()=>document.querySelector('canvas').width===1100);
 // Rapid toggles must leave one loop, and a final pause must stay stopped.
 for(let i=0;i<8;i++)await page.keyboard.press('Escape');
 await page.keyboard.press('Escape');await page.waitForFunction(()=>__POOLROOMS_V1__.snapshot().paused&&!__POOLROOMS_V1__.snapshot().rendering);
 const stopped=await snap();await sleep(1000);assert.equal((await snap()).submits,stopped.submits);
 report.errors=errors;assert.deepEqual(errors,[]);
 await page.close();report.closedAfter=await sample(10);
 for(const [a,b,k] of [['activeStart','activeEnd','beforeFPS'],['resumedStart','resumedEnd','resumedFPS']]){const f=report[b].frames.slice(report[a].frames.length);report[k]={fps:1000*f.length/f.reduce((s,x)=>s+x.ms,0),frames:f.length,resolution:report[b].internal,p95ms:f.map(x=>x.ms).sort((a,b)=>a-b)[Math.floor(f.length*.95)],minOneSecondFPS:Math.min(...Array.from({length:Math.floor(f.reduce((s,x)=>s+x.ms,0)/1000)},(_,i)=>{let t=0;return f.filter(x=>{const start=t;t+=x.ms;return start>=i*1000&&start<(i+1)*1000}).length}))};}
 fs.writeFileSync(`${out}/measurements.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({before:report.beforeFPS,after:report.resumedFPS,gpu:Object.fromEntries(['closedBefore','active','paused','resumed','closedAfter'].map(k=>[k,report[k].map(x=>x['Device Utilization %'])])),resumeTimes:report.resumeFrames.map(x=>x.t)},null,2));
} finally {await browser.close();}
