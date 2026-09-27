import{chromium}from'@playwright/test';import{mkdirSync,writeFileSync}from'node:fs';import assert from'node:assert/strict';
const out=process.env.EVIDENCE_DIR||'../workroom-v1.15-evidence/final';mkdirSync(`${out}/first-person-motion`,{recursive:true});const b=await chromium.launch({channel:'chrome',headless:true});
try{const p=await b.newPage({viewport:{width:1280,height:832}});await p.goto('http://127.0.0.1:4173');await p.waitForFunction(()=>window.__POOLROOMS_V1__);const report={};for(const[name,pose]of Object.entries({bright:{x:3,y:1.62,z:1,yaw:0,pitch:-1.1},dark:{x:0,y:1.62,z:-7,yaw:0,pitch:-1.1}})){
 await p.evaluate(view=>window.__POOLROOMS_V1__.configure({pause:true,freeze:false,view,grain:.004,scale:1}),pose);
 for(let i=0;i<180;i++)await p.evaluate(({t,pose})=>window.__POOLROOMS_V1__.renderActorEvidence(t,pose,pose,false),{t:i/60,pose});
 const states=[];for(let i=0;i<=60;i++){const actor={...pose,z:pose.z-i/60*1.6};const r=await p.evaluate(({t,actor})=>window.__POOLROOMS_V1__.renderActorEvidence(t,actor,actor,true),{t:3+i/60,actor});writeFileSync(`${out}/first-person-motion/${name}-${String(i).padStart(3,'0')}.png`,Buffer.from(r.png.split(',')[1],'base64'));states.push({t:3+i/60,actor,simulation:r.dynamics.simulation});assert.equal(r.dynamics.waveTime,r.dynamics.causticTime);assert.equal(r.dynamics.waveTime,r.dynamics.diffuseTime);}
 report[name]=states;
 }const errors=await p.evaluate(()=>window.__POOLROOMS_V1__.snapshot().errors);writeFileSync(`${out}/first-person-motion.json`,JSON.stringify({method:'60Hz replay of player AND first-person camera translation with production body and footsteps, grain enabled. Not a realtime benchmark.',report,errors},null,2));assert.equal(errors.length,0);
}finally{await b.close()}
