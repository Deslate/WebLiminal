import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const out=process.env.EVIDENCE_DIR||'/Users/steven/Projects/workroom-v1.4-evidence/regression';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
const page=await browser.newPage({viewport:{width:1512,height:982},deviceScaleFactor:1});const errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto(process.env.VERIFY_URL||'http://127.0.0.1:4173');await page.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs);
const spawn={x:-3.6,y:1.62,z:8,yaw:-.29,pitch:.028};
const poses={spawn,arch:{x:-1,y:1.62,z:.6,yaw:-.08,pitch:.16},dark:{x:0,y:1.62,z:-7.5,yaw:.7,pitch:.08}};
const previous=process.env.PAIRS_ONLY&&existsSync(`${out}/capture.json`)?JSON.parse(readFileSync(`${out}/capture.json`)):null;
const meta={date:new Date().toISOString(),pairs:[],frames:previous?.frames||[],sequenceSnapshot:previous?.sequenceSnapshot||previous?.snapshot};
async function frame(time,pose,moving,file){
 const r=await page.evaluate(async a=>window.__POOLROOMS_V1__.renderEvidence(a.time,a.pose,a.moving),{time,pose,moving});
 if(file)writeFileSync(`${out}/${file}`,Buffer.from(r.png.split(',')[1],'base64'));
 assert.equal((await page.evaluate(()=>window.__POOLROOMS_V1__.snapshot().errors)).length,0);
 return {time,view:r.view,...r.dynamics,file};
}
for(const [name,pose] of Object.entries(poses)){
 await page.evaluate(async p=>{await window.__POOLROOMS_V1__.configure({pause:true,freeze:true,grain:0,lightBatches:32,targetSamples:1,view:p});},pose);
 for(let i=0;i<15;i++)await frame(12+i/30,pose,true);
 const moving=await frame(12.5,pose,true,`${name}-moving.png`);
 // Equal-phase comparison of actual production budgets: 32 moving / 128 settled.
 // A separate equal-budget frame isolates just the continuous estimator blend.
 await page.evaluate(async p=>{await window.__POOLROOMS_V1__.configure({pause:true,freeze:true,grain:0,lightBatches:128,targetSamples:1,view:p});},pose);
 const equalBudget=await frame(12.5,pose,true,`${name}-moving-equal-budget.png`);
 const transition=[];
 for(let i=1;i<=30;i++)transition.push(await frame(12.5+i/30,pose,false,name==='spawn'?`stop-${String(i).padStart(3,'0')}.png`:undefined));
 const stopped=await frame(13.5,pose,false,`${name}-stopped-1s.png`);
 assert.equal(moving.quality,0);assert.equal(stopped.quality,1);meta.pairs.push({name,moving,equalBudget,stopped,transition});console.log('Compared',name);
}
if(!process.env.PAIRS_ONLY){
await page.evaluate(async p=>{await window.__POOLROOMS_V1__.configure({pause:true,freeze:false,grain:.004,lightBatches:32,targetSamples:1,view:p});},spawn);
mkdirSync(`${out}/sequence`,{recursive:true});
for(let i=0;i<360;i++){
 const t=i/30;let pose={...spawn};let moving=true;
 if(t<4){pose.z=8-t*.8;pose.yaw=-.29+t*.04;}
 else if(t<6){pose.z=4.8;pose.yaw=-.13;moving=false;}
 else if(t<9){pose.z=4.8;pose.x=-3.6+(t-6)*.8;pose.yaw=-.13-(t-6)*.12;}
 else{pose.z=4.8;pose.x=-1.2;pose.yaw=-.49;moving=false;}
 meta.frames.push(await frame(12+t,pose,moving,`sequence/frame-${String(i).padStart(4,'0')}.png`));
 if(i%60===0)console.log('Sequence',i,'quality',meta.frames.at(-1).quality);
}
}
meta.errors=errors;meta.snapshot=await page.evaluate(()=>window.__POOLROOMS_V1__.snapshot());delete meta.snapshot.frames;
writeFileSync(`${out}/capture.json`,JSON.stringify(meta,null,2));assert.equal(errors.length,0);if(meta.frames.length){
 assert.equal(meta.frames.at(-1).cacheLateFrames,0);
 for(const i of [150,300]){assert.equal(meta.frames[i].quality,1);assert.deepEqual(meta.frames[i].cacheSamples.slice(0,2),[128,128]);}
}
}finally{await browser.close();}
