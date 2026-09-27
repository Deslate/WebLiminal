import {chromium} from '@playwright/test';import{mkdirSync,writeFileSync}from'node:fs';
const out=process.env.EVIDENCE_DIR||'/Users/steven/Projects/workroom-v1.14-evidence/final';
const b=await chromium.launch({channel:'chrome',headless:true});
try{const p=await b.newPage({viewport:{width:1512,height:982}});const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});await p.goto('http://127.0.0.1:4174/poolrooms/');await p.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs);
for(const kind of ['inside']){mkdirSync(`${out}/${kind}-frames`,{recursive:true});await p.evaluate(()=>window.__POOLROOMS_V1__.configure({pause:true,freeze:false,grain:.004,scale:1280/1512}));const frames=[];
for(let i=0;i<=300;i++){const t=i/25;const distance=-.5+(Math.PI*1.78/2+.5)*t/12;const angle=Math.max(0,distance)/1.78;const radius=kind==='front'?2.03:1.48;
const view={x:radius*Math.cos(angle),y:2.5+(distance<0?distance:radius*Math.sin(angle)),z:kind==='front'?-2.55:-3.25,yaw:kind==='front'?0:-Math.PI/2,pitch:kind==='front'?0:angle};
const r=await p.evaluate(a=>window.__POOLROOMS_V1__.renderEvidence(a.t,a.view,true),{t:12+t,view});writeFileSync(`${out}/${kind}-frames/frame-${String(i).padStart(4,'0')}.png`,Buffer.from(r.png.split(',')[1],'base64'));if(r.dynamics.waveTime!==r.dynamics.causticTime)throw Error('Water/light phase mismatch');frames.push({i,t,view,dynamics:r.dynamics});}
writeFileSync(`${out}/${kind}-sequence.json`,JSON.stringify({method:'301 deterministic production frames at 25Hz over 12s; normal grain; fixed 1280x832; not a real-time FPS test',errors,frames},null,2));console.log(kind,'301 frames');}
if(errors.length)throw Error(errors.join('\n'));}finally{await b.close()}
