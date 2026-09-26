import {chromium} from '@playwright/test';
import {writeFileSync,mkdirSync} from 'node:fs';
const out=process.env.OUT || '/Users/steven/Projects/workroom-v1-evidence/round-1';mkdirSync(out,{recursive:true});
const b=await chromium.launch({channel:'chrome',headless:true});const p=await b.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
p.on('console',m=>console.log(m.type(),m.text()));p.on('pageerror',e=>console.log('PAGEERROR',e.message));
await p.goto('http://127.0.0.1:4173');
try{
await p.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().completedFrames>2,{},{timeout:60000});
await p.evaluate(()=>window.__POOLROOMS_V1__.configure({freeze:true,scale:1,targetSamples:512}));
await p.waitForFunction(()=>window.__POOLROOMS_V1__.snapshot().samples>=512,{},{timeout:180000});
await p.evaluate(()=>document.body.classList.add('evidence'));await p.screenshot({path:out+'/scene.png'});
const s=await p.evaluate(async()=>({snapshot:window.__POOLROOMS_V1__.snapshot(),audit:await window.__POOLROOMS_V1__.audit()}));writeFileSync(out+'/metrics.json',JSON.stringify(s,null,2));delete s.snapshot.frames;delete s.audit.paths;console.log(JSON.stringify(s));
}catch(e){console.log(e.message);await p.screenshot({path:out+'/error.png'});}
await b.close();
