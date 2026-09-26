import {chromium} from '@playwright/test';
import {writeFileSync,mkdirSync,readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {auditOptics} from './optical-audit.mjs';
const out=process.env.EVIDENCE_DIR||'/Users/steven/Projects/workroom-v1.6-evidence/final/synchrony';mkdirSync(out,{recursive:true});
const b=await chromium.launch({channel:'chrome',headless:true});
try{
 const p=await b.newPage({viewport:{width:1512,height:982}});const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await p.goto(process.env.VERIFY_URL||'http://127.0.0.1:4173');await p.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs);
 const wall={x:3,y:1.62,z:0,yaw:-1.57,pitch:.36},dark={...wall,z:-6,pitch:.22};
 async function frame(t,view,moving,name){const r=await p.evaluate(a=>window.__POOLROOMS_V1__.renderEvidence(a.t,a.view,a.moving),{t,view,moving});const png=Buffer.from(r.png.split(',')[1],'base64');if(name)writeFileSync(`${out}/${name}.png`,png);assert.equal(r.dynamics.waveTime,r.dynamics.causticTime);assert.equal(r.dynamics.waveTime,r.dynamics.diffuseTime);assert.equal(r.dynamics.lightKeyframes,false);return {...r.dynamics,time:t,hash:createHash('sha256').update(png).digest('hex')};}
 const report={method:'GPU-completed stepped frames, not a FPS benchmark; exact current-phase equality, history independence, CPU optical laws, 30/60Hz stop deadlines; low/glaze include smooth camera translation and turn',sequences:{},historyIndependent:{},deadlines:[],errors};
 for(const [name,view]of Object.entries({wall,dark,low:{x:2.35,y:.92,z:5,yaw:0,pitch:.025},glaze:{x:6.7,y:1.62,z:5,yaw:-.55,pitch:.08}})){
  await p.evaluate(view=>window.__POOLROOMS_V1__.configure({pause:true,freeze:false,grain:0,view}),view);
  report.sequences[name]=[];
  for(let i=0;i<61;i++)report.sequences[name].push(await frame(12+i/60,(name==='low'||name==='glaze')?{...view,z:view.z+i/600,yaw:view.yaw+i/2400}:view,true,`${name}-${String(i).padStart(3,'0')}`));
  assert.equal(new Set(report.sequences[name].map(x=>x.hash)).size,61);
  const a=await frame(12.123,view,true);await frame(20,view,true);const c=await frame(12.123,view,true);assert.equal(a.hash,c.hash);report.historyIndependent[name]=true;
  console.log(name,'61 unique continuous phases; phase history-independent');
 }
 const raw=await p.evaluate(()=>window.__POOLROOMS_V1__.audit());report.optics=auditOptics(raw);
 for(const hz of [30,60]){
  await p.evaluate(view=>window.__POOLROOMS_V1__.configure({pause:true,freeze:true,grain:0,view}),wall);
  const moving=await frame(12,wall,true,`moving-${hz}`);const steps=[];
  for(let i=1;i<=hz;i++)steps.push(await frame(12+i/hz,wall,false,i===hz?`settled-${hz}`:undefined));
  assert.equal(steps.at(-1).quality,1);assert.equal(moving.quality,0);report.deadlines.push({hz,moving,steps});
 }
 report.snapshot=await p.evaluate(()=>window.__POOLROOMS_V1__.snapshot());delete report.snapshot.frames;
 if(process.env.EXPECTED_CAPTURE){const old=JSON.parse(readFileSync(process.env.EXPECTED_CAPTURE));for(const name of ['wall','dark','low','glaze'])assert.deepEqual(report.sequences[name].map(x=>x.hash),old.sequences[name].map(x=>x.hash));report.storageLayoutPixelIdentical=true;}
 writeFileSync(`${out}/synchrony.json`,JSON.stringify(report,null,2));assert.equal(errors.length,0);
}finally{await b.close()}
