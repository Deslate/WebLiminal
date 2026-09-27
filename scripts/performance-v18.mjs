import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const out=process.env.EVIDENCE_DIR||'/Users/steven/Projects/workroom-v1.13-evidence/final';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
function stats(frames){const ms=frames.map(f=>f.ms),sorted=[...ms].sort((a,b)=>a-b);let elapsed=0;const bins=[];for(const t of ms){const i=Math.floor(elapsed/1000);(bins[i]??=[]).push(t);elapsed+=t;}return {fps:1000*ms.length/ms.reduce((a,b)=>a+b,0),minimumOneSecondFps:Math.min(...bins.slice(0,-1).map(b=>1000*b.length/b.reduce((a,b)=>a+b,0))),p95:sorted[Math.floor(sorted.length*.95)],max:sorted.at(-1),frames:ms.length};}
try{const p=await browser.newPage({viewport:{width:1512,height:982}});await p.goto(process.env.VERIFY_URL||'http://127.0.0.1:4174/poolrooms/');await p.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs);const report={};
for(const [name,view]of Object.entries({springFront:{x:1.92,y:2.5,z:-2.55,yaw:0,pitch:0},springInside:{x:1.48,y:2.5,z:-3.25,yaw:-Math.PI/2,pitch:0},arch30cm:{x:1.05,y:3.55,z:-2.95,yaw:-.6,pitch:.55},corner30cm:{x:1.56,y:1.65,z:-2.64,yaw:-.81,pitch:.025},glaze30cm:{x:6.7,y:1.62,z:5,yaw:-.55,pitch:.08}})){
 await p.evaluate(view=>window.__POOLROOMS_V1__.configure({pause:false,freeze:false,grain:.004,targetSamples:0,view,scale:1280/1512}),view);
 await p.waitForTimeout(11000);let s=await p.evaluate(()=>window.__POOLROOMS_V1__.snapshot());report[name]={static:stats(s.frames.slice(-180)),staticResolution:s.internal,errors:s.errors};
 await p.evaluate(view=>{const start=performance.now();function move(){const t=(performance.now()-start)/1000;window.__POOLROOMS_V1__.setView({z:view.z+.12*Math.sin(t),yaw:view.yaw+.035*Math.sin(t*.7)});window.perfRAF=requestAnimationFrame(move)}move()},view);
 await p.waitForTimeout(11000);await p.evaluate(()=>cancelAnimationFrame(window.perfRAF));s=await p.evaluate(()=>window.__POOLROOMS_V1__.snapshot());Object.assign(report[name],{moving:stats(s.frames.slice(-180)),movingResolution:s.internal,errors:s.errors});console.log(name,JSON.stringify(report[name]));
 if(s.errors.length)throw Error('Browser error');
}writeFileSync(`${out}/reflection-performance.json`,JSON.stringify(report,null,2));if(Object.values(report).some(r=>r.static.fps<30||r.moving.fps<30||r.static.minimumOneSecondFps<30||r.moving.minimumOneSecondFps<30))throw Error('Construction performance failed');}finally{await browser.close()}
