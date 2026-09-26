import {chromium} from '@playwright/test';
import {writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
const out=process.env.EVIDENCE_DIR||'/Users/steven/Projects/workroom-v1.11-evidence/final';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const context=await browser.newContext({viewport:{width:1512,height:982},recordVideo:{dir:`${out}/raw-video`,size:{width:1512,height:982}}});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto(process.env.VERIFY_URL||'http://127.0.0.1:4173');await page.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs);
 await page.keyboard.press('Space');await page.waitForTimeout(1200);
 await page.evaluate(()=>{
  const poses=[
   [0,1.1,-1.8,-.7,.15,1.62],[4,1.56,-2.64,-.81,.025,1.65],
   [8,1.35,-2.6,-.6,.25,1.8],[12,1.05,-2.95,-.6,.55,3.55],
   [16,0,-.9,0,.58,1.62]
  ];window.recording={start:performance.now(),samples:[],poses};
  function frame(){const t=Math.min(16,(performance.now()-window.recording.start)/1000);let k=0;while(k<poses.length-2&&t>poses[k+1][0])k++;const a=poses[k],b=poses[k+1];let u=Math.min(1,Math.max(0,(t-a[0])/(b[0]-a[0])));u=u*u*(3-2*u);const blend=i=>a[i]+(b[i]-a[i])*u;
   window.__POOLROOMS_V1__.setView({x:blend(1),y:blend(5),z:blend(2),yaw:blend(3),pitch:blend(4)});
   if(t<16)requestAnimationFrame(frame);else window.recording.done=true;
  }frame();
  window.recording.timer=setInterval(()=>{const s=window.__POOLROOMS_V1__.snapshot();window.recording.samples.push({wallMs:performance.now()-window.recording.start,view:s.view,internal:s.internal,completedFrames:s.completedFrames,dynamics:s.dynamics,valid:s.validPosition});},100);
 });
 await page.waitForFunction(()=>window.recording.done,{},{timeout:25000});
 const report=await page.evaluate(()=>{clearInterval(window.recording.timer);const s=window.__POOLROOMS_V1__.snapshot();return {recording:window.recording,firstFrameMs:s.firstFrameMs,config:s.config,frames:s.frames,errors:s.errors,internal:s.internal}});
 report.errors.push(...errors);report.method='Real-time Playwright browser recording; no manual time steps or frozen water. Recording overhead excluded from independent FPS benchmark.';
 const video=page.video();await context.close();copyFileSync(await video.path(),`${out}/tile-construction-motion.webm`);
 writeFileSync(`${out}/recording.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({first:report.firstFrameMs,samples:report.recording.samples.length,errors:report.errors,internal:report.internal,movie:`${out}/tile-construction-motion.webm`}));
 if(report.errors.length||report.recording.samples.some(s=>!s.valid))throw Error('Recording validation failed');
}finally{await browser.close()}
