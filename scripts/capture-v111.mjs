import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const out=process.env.EVIDENCE_DIR||'/Users/steven/Projects/workroom-v1.13-evidence/final';mkdirSync(out,{recursive:true});
const b=await chromium.launch({channel:'chrome',headless:true});
try{const p=await b.newPage({viewport:{width:1512,height:982}});const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});await p.goto(process.env.VERIFY_URL||'http://127.0.0.1:4173');await p.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs);
const view={x:3,y:1.62,z:.8,yaw:0,pitch:-.9};const report={};
for(const[name,options]of Object.entries({original:{},shallow:{waterLevel:.22},deep:{waterLevel:.85},flat:{waveAmplitude:0},highWave:{waveAmplitude:.095},narrow:{apertureWidth:2.4,apertureDepth:2.9},otherView:{view:{...view,x:2.5,yaw:-.2}}})){
 await p.evaluate(a=>window.__POOLROOMS_V1__.configure({pause:true,freeze:false,grain:0,waterLevel:.42,waveAmplitude:.052,apertureWidth:4.8,apertureDepth:5.8,view:a.view,scale:1280/1512,...a.options}),{view,options});let r;for(let i=0;i<=25;i++)r=await p.evaluate(t=>window.__POOLROOMS_V1__.renderEvidence(t,{},false),12+i/25);writeFileSync(`${out}/${name}.png`,Buffer.from(r.png.split(',')[1],'base64'));report[name]=await p.evaluate(()=>window.__POOLROOMS_V1__.audit({floor:true}));console.log(name);
}const f=report.original.floor,flat=report.flat.floor,narrow=report.narrow.floor;
assert(f.positive>100000);assert(f.peak>2*flat.peak);assert.deepEqual(f.roi,report.otherView.floor.roi);
const ratio=narrow.integratedRGB[1]/f.integratedRGB[1];assert(ratio>.2&&ratio<.3);
assert(report.deep.floor.integratedRGB[0]/report.deep.floor.integratedRGB[2]<report.shallow.floor.integratedRGB[0]/report.shallow.floor.integratedRGB[2]);
writeFileSync(`${out}/capture.json`,JSON.stringify({view,report,errors},null,2));if(errors.length)throw Error(errors.join('\n'));}finally{await b.close()}
