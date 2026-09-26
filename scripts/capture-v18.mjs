import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const out=process.env.EVIDENCE_DIR||'/Users/steven/Projects/workroom-v1.8-evidence/final';mkdirSync(out,{recursive:true});
const before=process.env.BEFORE==='1';const b=await chromium.launch({channel:'chrome',headless:true});
try{const p=await b.newPage({viewport:{width:1512,height:982}});const errors=[];p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});p.on('pageerror',e=>errors.push(e.message));
if(before){const source=execFileSync('git',['show','641e210:src/render/common.wgsl'],{encoding:'utf8'});await p.route(/\/common\.wgsl\?/,r=>r.fulfill({contentType:'application/javascript',body:`export default ${JSON.stringify(source)};`}));}
await p.goto(process.env.VERIFY_URL||(before?'http://127.0.0.1:4173':'http://127.0.0.1:4174/poolrooms/'));await p.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs);
const views={springFront:{x:1.92,y:2.5,z:-2.55,yaw:0,pitch:0},springInside:{x:1.48,y:2.5,z:-3.25,yaw:-Math.PI/2,pitch:0},springLeft:{x:-1.48,y:2.5,z:-3.25,yaw:Math.PI/2,pitch:0},overview:{x:0,y:2.4,z:.5,yaw:0,pitch:.26},crown:{x:0,y:3.98,z:-3.25,yaw:0,pitch:Math.PI/2-.001}};
for(const[name,view]of Object.entries(views)){await p.evaluate(view=>window.__POOLROOMS_V1__.configure({pause:true,freeze:false,grain:0,view,scale:1280/1512}),view);let r;for(let i=0;i<31;i++)r=await p.evaluate(a=>window.__POOLROOMS_V1__.renderEvidence(a.t,a.view,false),{t:12+i/30,view});writeFileSync(`${out}/${name}.png`,Buffer.from(r.png.split(',')[1],'base64'));console.log(name);}
writeFileSync(`${out}/capture.json`,JSON.stringify({before,views,errors,snapshot:await p.evaluate(()=>window.__POOLROOMS_V1__.snapshot())},null,2));if(errors.length)throw Error(errors.join('\n'));}finally{await b.close();}
