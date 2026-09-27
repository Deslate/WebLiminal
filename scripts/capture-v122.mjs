import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const out=process.env.EVIDENCE_DIR||'../workroom-v1.22-evidence/final';mkdirSync(out,{recursive:true});
const b=await chromium.launch({channel:'chrome',headless:true});
try {
 const p=await b.newPage({viewport:{width:1280,height:832}});
 await p.goto('http://localhost:4173');await p.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs);
 for(const [name,view] of Object.entries({floor:{x:3.5,y:1.5,z:-1,yaw:0,pitch:-Math.PI/2},dark:{x:-4,y:1.3,z:-6,yaw:0,pitch:-Math.PI/2}})) {
  await p.evaluate(view=>window.__POOLROOMS_V1__.configure({view,body:false,pause:true,freeze:false,grain:.004,scale:1}),view);
  for(let i=0;i<=600;i++){
   const capture=i%60===0;
   const r=await p.evaluate(({i,capture})=>window.__POOLROOMS_V1__.renderEvidence(i/30,{},false,capture),{i,capture});
   if(capture){writeFileSync(`${out}/${name}-${String(i).padStart(4,'0')}.png`,Buffer.from(r.png.split(',')[1],'base64'));console.log(name,i);}
  }
 }
 writeFileSync(`${out}/state.json`,JSON.stringify(await p.evaluate(()=>window.__POOLROOMS_V1__.snapshot()),null,2));
}finally{await b.close()}
