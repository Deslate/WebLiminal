import {chromium} from '@playwright/test';import {writeFileSync,mkdirSync} from 'node:fs';
const out=process.env.EVIDENCE_DIR||'/Users/steven/Projects/workroom-v1.6-evidence/final';mkdirSync(out,{recursive:true});
const b=await chromium.launch({channel:'chrome',headless:true});try{const p=await b.newPage({viewport:{width:1512,height:982}});const errors=[];p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});await p.goto(process.env.VERIFY_URL||'http://127.0.0.1:4173');await p.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs);
const views={wall30cm:{x:6.7,y:1.62,z:5,yaw:-1.57,pitch:0},oblique30cm:{x:6.7,y:1.62,z:5,yaw:-.8,pitch:-.10},reflection30cm:{x:6.7,y:1.62,z:5,yaw:-.55,pitch:.08},pillar30cm:{x:2.35,y:1.62,z:-2.55,yaw:0,pitch:0},room:{x:-3.6,y:1.62,z:8,yaw:-.29,pitch:.028}};
const report={views:{},errors};
for(const [name,view]of Object.entries(views)){
 await p.evaluate(async view=>window.__POOLROOMS_V1__.configure({freeze:false,grain:.004,targetSamples:1,pause:true,view,scale:1280/1512}),view);let r;
 for(let i=0;i<36;i++)r=await p.evaluate(a=>window.__POOLROOMS_V1__.renderEvidence(a.t,a.view,false),{t:12+i/30,view});
 writeFileSync(`${out}/${name}.png`,Buffer.from(r.png.split(',')[1],'base64'));report.views[name]={view,dynamics:r.dynamics};console.log('Captured',name);
}
await p.evaluate(view=>window.__POOLROOMS_V1__.configure({freeze:false,targetSamples:0,view,scale:1280/1512}),views.wall30cm);
await p.waitForTimeout(7000);const staticView=await p.evaluate(()=>window.__POOLROOMS_V1__.snapshot());
await p.evaluate(()=>{window.v14MotionStart=performance.now();function step(){const t=(performance.now()-window.v14MotionStart)/1000;window.__POOLROOMS_V1__.setView({z:5-.25*Math.sin(t),yaw:-1.57+.15*Math.sin(t*.8)});window.v14RAF=requestAnimationFrame(step)}step()});
await p.waitForTimeout(5000);await p.evaluate(()=>cancelAnimationFrame(window.v14RAF));const moving=await p.evaluate(()=>window.__POOLROOMS_V1__.snapshot());
function stats(frames){const d=frames.map(f=>f.ms).sort((a,b)=>a-b);return {frames:d.length,fps:1000*d.length/d.reduce((a,b)=>a+b,0),p95:d[Math.floor(d.length*.95)],max:d.at(-1),minimumOneSecondFps:Math.min(...Array.from({length:Math.max(1,Math.floor(frames.reduce((a,f)=>a+f.ms,0)/1000))},(_,i)=>{let elapsed=0;const bin=frames.filter(f=>{elapsed+=f.ms;return elapsed>i*1000&&elapsed<=(i+1)*1000});return 1000*bin.length/bin.reduce((a,f)=>a+f.ms,0)}))};}
report.nearPerformance={static:stats(staticView.frames.slice(-90)),moving:stats(moving.frames.slice(-90)),staticResolution:staticView.internal,movingResolution:moving.internal,lightFrames:moving.dynamics.lightFrames,phaseError:Math.abs(moving.dynamics.causticTime-moving.dynamics.waveTime)};writeFileSync(`${out}/near.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
if(errors.length||report.nearPerformance.static.fps<30||report.nearPerformance.moving.fps<30||moving.dynamics.causticTime!==moving.dynamics.waveTime)throw Error('Near-wall validation failed');
}finally{await b.close()}
