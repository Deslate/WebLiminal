// Production scheduler / GPU-completed frames, independent of offline video encoding.
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {sample,DURATION,segments} from './roam-v149-path.mjs';
import {provenance} from './roam-v149-provenance.mjs';
const root=process.env.EVIDENCE_DIR||'../workroom-v1.49-evidence/benchmark';mkdirSync(root,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1280,height:832}});await page.routeWebSocket(/.*/,w=>w.close());
 await page.route(u=>u.pathname==='/src/main.js',async r=>{const response=await r.fetch();let s=await response.text();const old='if (!holdTime && elapsed > 34.6 && elapsed < 43)';if(!s.includes(old))throw Error('Narrative cue hook missing');s=s.replace(old,'if (false)');await r.fulfill({response,body:s})});
 await page.goto(process.env.VERIFY_URL||'http://127.0.0.1:4173');await page.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs,null,{timeout:120000});
 await page.evaluate(async p=>{await __POOLROOMS_V1__.configure({view:p.actor,pause:false,freeze:false,scale:1,body:true});__POOLROOMS_V1__.setObserver(p.camera)},sample(0));
 await page.waitForTimeout(5000);const start=Date.now();const samples=[];const startElapsed=await page.evaluate(()=>__POOLROOMS_V1__.snapshot().elapsed);
 while((Date.now()-start)/1000<DURATION){const t=(Date.now()-start)/1000,state=sample(t);const s=await page.evaluate(p=>{const a=__POOLROOMS_V1__;a.setView(p.actor);a.setObserver(p.camera);const s=a.snapshot();return{completed:s.completedFrames,frameCount:s.frames.length,internal:s.internal,errors:s.errors}},state);samples.push({t,segment:state.segment,completed:s.completed,frameCount:s.frameCount,internal:s.internal});if(s.errors.length)throw Error(JSON.stringify(s.errors));await page.waitForTimeout(25);}
 const snapshot=await page.evaluate(async()=>{await __POOLROOMS_V1__.pause();return __POOLROOMS_V1__.snapshot()});
 const summary={};for(const seg of segments){const a=samples.filter(s=>s.t>=seg.start+1&&s.t<seg.end);if(a.length<2)continue;const first=a[0],last=a.at(-1);const ms=snapshot.frames.slice(first.frameCount,last.frameCount).map(f=>f.ms),sorted=[...ms].sort((a,b)=>a-b);let total=0;const bins=[];for(const m of ms){(bins[Math.floor(total/1000)]??=[]).push(m);total+=m;}summary[seg.name]={p95Ms:sorted[Math.floor(sorted.length*.95)],minOneSecondFps:bins.length>1?Math.min(...bins.slice(0,-1).map(a=>1000*a.length/a.reduce((x,y)=>x+y,0))):null,fps:(last.completed-first.completed)/(last.t-first.t),resolutionFirst:first.internal,resolutionLast:last.internal};}
 const result={source:provenance().sourceHash,method:'Production adaptive resolution, 1280x832 viewport, GPU-completed frames. No video capture/encoder. Narrative dim cue disabled as in replay; 25ms camera control. Five-second warmup, first second of each segment excluded.',segments:summary,samples,frames:snapshot.frames,errors:snapshot.errors};writeFileSync(root+'/performance.json',JSON.stringify(result,null,2));console.log(JSON.stringify(summary,null,2));
} finally {await browser.close()}
