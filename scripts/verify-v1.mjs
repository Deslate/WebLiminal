import {chromium} from '@playwright/test';
import {writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const output=process.env.EVIDENCE_DIR||'/Users/steven/Projects/workroom-v1.12-evidence/final/performance';mkdirSync(output,{recursive:true});
const headless=process.env.HEADLESS!=='0';
const browser=await chromium.launch({channel:'chrome',headless,timeout:15000,ignoreDefaultArgs:['--mute-audio']});
try {
const page=await browser.newPage({viewport:{width:1512,height:982},deviceScaleFactor:1});const errors=[],requests=[],messages=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{messages.push({type:m.type(),text:m.text()});if(['error','warning'].includes(m.type()))errors.push(m.text());});page.on('request',r=>requests.push(r.url()));page.on('requestfailed',r=>errors.push(r.url()));
const cdp=await page.context().newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
const url=process.env.VERIFY_URL||'http://127.0.0.1:4173';console.log('Browser ready',url);await page.goto(url);await page.bringToFront();await page.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs!=null);
const initial=await page.evaluate(()=>window.__POOLROOMS_V1__.snapshot());assert(initial.firstFrameMs<=3000);assert.equal(initial.errors.length,0);
await page.keyboard.press('Space'); // normal user gesture, no autoplay bypass
await page.waitForTimeout(18000);
const staticResult=await page.evaluate(()=>window.__POOLROOMS_V1__.snapshot());assert(staticResult.staticExposure);console.log('Static sample',JSON.stringify({frames:staticResult.completedFrames,samples:staticResult.samples,internal:staticResult.internal}));assert(staticResult.samples>1);
await page.keyboard.down('KeyW');await page.waitForTimeout(4000);await page.keyboard.up('KeyW');
const walked=await page.evaluate(()=>window.__POOLROOMS_V1__.snapshot());assert(walked.view.z<initial.view.z-3);assert(walked.validPosition);
await page.keyboard.down('ShiftLeft');await page.keyboard.down('KeyD');await page.waitForTimeout(7500);await page.keyboard.up('KeyD');await page.keyboard.up('ShiftLeft');const wall=await page.evaluate(()=>window.__POOLROOMS_V1__.snapshot());assert(wall.validPosition);assert(wall.view.x<=6.76);
await page.mouse.move(600,450);await page.mouse.down();await page.mouse.move(780,500,{steps:12});await page.mouse.up();
await page.waitForTimeout(1500);const final=await page.evaluate(()=>window.__POOLROOMS_V1__.snapshot());assert(Math.abs(final.view.yaw-initial.view.yaw)>.2);assert.equal(final.audio.state,'running');assert(final.audio.rms>0);
function stats(frames,a,b){const selected=frames.filter(f=>f.t>=a&&f.t<b);const dt=selected.map(f=>f.ms).sort((a,b)=>a-b);const windows=[];for(let t=a;t<b;t++){let ff=selected.filter(f=>f.t>=t&&f.t<t+1);if(ff.length)windows.push(1000*ff.length/ff.reduce((s,f)=>s+f.ms,0));}return {from:a,to:b,frames:dt.length,averageFps:1000*dt.length/dt.reduce((a,b)=>a+b,0),minimumOneSecondFps:Math.min(...windows),p95FrameMs:dt[Math.floor(dt.length*.95)],maxFrameMs:dt.at(-1),framesOver50ms:dt.filter(x=>x>50).length};}
const stable=stats(staticResult.frames,5,17),movement=stats(final.frames,20,22);
const allFrames=final.frames;for(const s of [initial,staticResult,walked,wall,final])delete s.frames;
const report={date:new Date().toISOString(),url,browser:await browser.version(),headless,initial,stable,movement,staticResult,walked,wall,final,errors,messages,externalRequests:requests.filter(r=>!r.startsWith(new URL(url).origin)&&!r.startsWith('data:'))};
writeFileSync(`${output}/performance-${headless?'headless':'headed'}.json`,JSON.stringify(report,null,2));writeFileSync(`${output}/frames-${headless?'headless':'headed'}.json`,JSON.stringify(allFrames));console.log(JSON.stringify(report,null,2));assert(stable.averageFps>=30);assert(stable.minimumOneSecondFps>=29.5);assert(movement.averageFps>=30);assert.equal(errors.length,0);assert.equal(report.externalRequests.length,0);
}finally{await browser.close();}
