import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const out=process.env.EVIDENCE_DIR||'/Users/steven/Projects/workroom-v1.10-evidence/final';mkdirSync(out,{recursive:true});
const before=process.env.BEFORE==='1';const b=await chromium.launch({channel:'chrome',headless:true});
try{const p=await b.newPage({viewport:{width:1512,height:982}});const errors=[];p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});p.on('pageerror',e=>errors.push(e.message));
if(before){const source=execFileSync('git',['show','d1f2d7f:src/render/common.wgsl'],{encoding:'utf8'});await p.route(/\/common\.wgsl\?/,r=>r.fulfill({contentType:'application/javascript',body:`export default ${JSON.stringify(source)};`}));}
await p.goto(process.env.VERIFY_URL||(before?'http://127.0.0.1:4173':'http://127.0.0.1:4174/poolrooms/'));await p.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs);
const views={edgeArc:{x:(1.78-.212132)*Math.cos(.7),y:2.5+(1.78-.212132)*Math.sin(.7),z:-2.85+.212132,yaw:-Math.atan(Math.cos(.7)),pitch:Math.asin(Math.sin(.7)/Math.sqrt(2))},edgeFront:{x:1.2674,y:3.75,z:-2.55,yaw:0,pitch:0},edgeOblique:{x:1.56,y:2.55,z:-2.63,yaw:-.7854,pitch:0},edgeInside:{x:1.48,y:2.55,z:-2.88,yaw:-Math.PI/2,pitch:0},front:{x:0,y:2.4,z:.5,yaw:0,pitch:.26},inside:{x:1.48,y:2.5,z:-3.25,yaw:-Math.PI/2,pitch:0},crown:{x:0,y:3.98,z:-3.25,yaw:0,pitch:Math.PI/2-.001}};
for(const[name,view]of Object.entries(views)){await p.evaluate(view=>window.__POOLROOMS_V1__.configure({pause:true,freeze:false,grain:0,view,scale:1280/1512}),view);let r;for(let i=0;i<31;i++)r=await p.evaluate(a=>window.__POOLROOMS_V1__.renderEvidence(a.t,a.view,false),{t:12+i/30,view});writeFileSync(`${out}/${name}.png`,Buffer.from(r.png.split(',')[1],'base64'));console.log(name);}
writeFileSync(`${out}/capture.json`,JSON.stringify({before,views,errors,snapshot:await p.evaluate(()=>window.__POOLROOMS_V1__.snapshot())},null,2));if(errors.length)throw Error(errors.join('\n'));}finally{await b.close();}
