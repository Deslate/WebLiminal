import {execFileSync} from 'node:child_process';
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const speed=Number(process.env.WALK_SPEED||.8);
const out=process.env.EVIDENCE_DIR||'../workroom-v1.29-fix-evidence/video';
const b=await chromium.launch({channel:'chrome',headless:true});
try{for(const [name,strength]of[['before',.3],['after',.45]].filter(([n])=>!process.env.ONLY_VARIANT||n===process.env.ONLY_VARIANT)){const dir=out+'/'+name;mkdirSync(dir,{recursive:true});const p=await b.newPage({viewport:{width:1280,height:832}});if(name==='before')await p.route(u=>u.pathname==='/src/render/resolve.wgsl',r=>r.fulfill({contentType:'text/javascript',body:'export default '+JSON.stringify(execFileSync('git',['show','b07cd99:src/render/resolve.wgsl'],{encoding:'utf8'}))}));await p.goto('http://127.0.0.1:4173');await p.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs);
const actor={x:-2,y:1.62,z:1,yaw:-Math.PI/2,pitch:-.8},camera={x:1,y:5.65,z:3.1,yaw:0,pitch:-1.20};await p.evaluate(async({actor,strength})=>window.__POOLROOMS_V1__.configure({view:actor,body:true,bodyWaveStrength:strength,pause:true,freeze:false,scale:1,grain:0}),{actor,strength});
for(let i=0;i<=360;i++){const t=i/30;const x=-2+Math.min(5.6,Math.max(0,t-2)*speed);const r=await p.evaluate(({t,actor,camera})=>window.__POOLROOMS_V1__.renderActorEvidence(t,actor,camera,true),{t,actor:{...actor,x},camera});writeFileSync(`${dir}/${String(i).padStart(4,'0')}.png`,Buffer.from(r.png.split(',')[1],'base64'));if(i%90===0)console.log(name,t);}
const s=await p.evaluate(()=>window.__POOLROOMS_V1__.snapshot());writeFileSync(dir+'/state.json',JSON.stringify({method:'Deterministic actual body and foot sources; 30 Hz; starts t2, travels 5.6m at recorded speed, then stops. Fixed observer. Capture is not a performance benchmark.',strength,speed,...s}));if(s.errors.length)throw Error(s.errors[0]);await p.close();}}finally{await b.close()}
