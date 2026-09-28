import {chromium} from '@playwright/test';import{installVariant}from'./forward-variant.mjs';import{mkdirSync,writeFileSync}from'node:fs';
const out='../workroom-forward-evidence/compare';mkdirSync(out,{recursive:true});
const b=await chromium.launch({channel:'chrome',headless:true});
try{for(const name of (process.env.VARIANTS||'steep,bow2safe,bow4safe').split(',')){
 const p=await b.newPage({viewport:{width:1280,height:832}});await installVariant(p,name);await p.goto('http://127.0.0.1:4173');await p.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs);
 const v={x:-3.6,y:1.62,z:8,yaw:-.29,pitch:-.32};await p.evaluate(v=>__POOLROOMS_V1__.configure({view:v,pause:true,freeze:false,scale:1}),v);
 for(let i=0;i<=240;i++){const t=i/30,dist=Math.max(0,t-2)*.8,actor={...v,x:v.x-Math.sin(v.yaw)*dist,z:v.z-Math.cos(v.yaw)*dist};const q=await p.evaluate(async({t,actor,capture})=>__POOLROOMS_V1__.renderActorEvidence(t,actor,actor,capture),{t,actor,capture:i%30===0});if(q.png)writeFileSync(`${out}/${name}-${i}.png`,Buffer.from(q.png.split(',')[1],'base64'));if(i===180){const a=await p.evaluate(()=>__POOLROOMS_V1__.audit({simulation:true}));writeFileSync(`${out}/${name}.f32`,Buffer.from(new Float32Array(a.simulation.values).buffer));}}
 await p.close();console.log(name);
}}finally{await b.close()}
