import {chromium} from '@playwright/test';import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';import assert from 'node:assert/strict';
const out=process.env.EVIDENCE_DIR||'../workroom-v1.22-evidence/optics';mkdirSync(out,{recursive:true});const b=await chromium.launch({channel:'chrome',headless:true});
try {const p=await b.newPage({viewport:{width:1280,height:832}});await p.goto('http://localhost:4173');await p.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs);
const result={};
for(const [name,c]of Object.entries({normal:{},flat:{waveAmplitude:.001},deep:{waterLevel:.85},smallOpening:{apertureWidth:2.4,apertureDepth:2.9}})){
 await p.evaluate(c=>window.__POOLROOMS_V1__.configure({view:{x:3.5,y:1.5,z:-1,yaw:0,pitch:-Math.PI/2},body:false,pause:true,freeze:false,grain:0,scale:1,waterLevel:.42,waveAmplitude:.052,apertureWidth:4.8,apertureDepth:5.8,...c}),c);
 let r;for(let i=0;i<=180;i++)r=await p.evaluate(i=>window.__POOLROOMS_V1__.renderEvidence(i/30,{},false,i===180),i);
 writeFileSync(`${out}/${name}.png`,Buffer.from(r.png.split(',')[1],'base64'));
 const a=await p.evaluate(()=>window.__POOLROOMS_V1__.audit({solar:true}));result[name]={solar:a.solar,errors:a.errors,config:a.config};console.log(name,a.solar);assert(a.solar.finite);assert(Math.abs(a.solar.rasterRelativeError)<.015);assert.equal(a.errors.length,0);
}
writeFileSync(`${out}/optics.json`,JSON.stringify(result,null,2));
// Same waves, time, material and exposure: only replace the fine first receiver
// with the retained centimetre-grid solar estimate, using shader routes.
await p.route(u=>u.pathname==='/src/render/camera.wgsl',route=>{const s=readFileSync('src/render/camera.wgsl','utf8').replace('if(h.sid==3u){let solar=fineSolar(h.p);','if(h.sid==3u){let solar=fineSolar(h.p)*0.;');return route.fulfill({contentType:'text/javascript',body:'export default '+JSON.stringify(s)});});
await p.route(u=>u.pathname==='/src/render/compose-light.wgsl',route=>{const s=readFileSync('src/render/compose-light.wgsl','utf8').replace('-solarField[idx]','-solarField[idx]*0.');return route.fulfill({contentType:'text/javascript',body:'export default '+JSON.stringify(s)});});
await p.reload();await p.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs);
await p.evaluate(()=>window.__POOLROOMS_V1__.configure({view:{x:3.5,y:1.5,z:-1,yaw:0,pitch:-Math.PI/2},body:false,pause:true,freeze:false,grain:0,scale:1}));
let r;for(let i=0;i<=180;i++)r=await p.evaluate(i=>window.__POOLROOMS_V1__.renderEvidence(i/30,{},false,i===180),i);
writeFileSync(`${out}/coarse-same-water.png`,Buffer.from(r.png.split(',')[1],'base64'));
}finally{await b.close()}
