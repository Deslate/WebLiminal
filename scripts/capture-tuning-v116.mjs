import{chromium}from'@playwright/test';import{mkdirSync,writeFileSync}from'node:fs';import assert from'node:assert/strict';
const out=process.env.EVIDENCE_DIR||'../workroom-v1.16-tuning-evidence';const browser=await chromium.launch({channel:'chrome',headless:true});
try{const p=await browser.newPage({viewport:{width:1280,height:832}});await p.goto('http://127.0.0.1:4173');await p.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs);
for(const[name,waveSpeed,bodyWakeBoost]of[['before',1,0],['after',.28,.6]])for(const kind of ['idle','walk']){
 const dir=`${out}/${name}-${kind}`;mkdirSync(dir,{recursive:true});const view=kind==='walk'?{x:-2,y:1.62,z:1,yaw:-Math.PI/2,pitch:-.8}:{x:2,y:1.62,z:3,yaw:0,pitch:-1.0};
 await p.evaluate(async c=>{await window.__POOLROOMS_V1__.configure(c);document.body.classList.add('evidence')},{view,body:kind==='walk',pause:true,freeze:false,scale:1,waveSpeed,bodyWakeBoost});
 const camera={x:1,y:5.65,z:3.1,yaw:0,pitch:-1.2},states=[],end=kind==='walk'?420:240;
 for(let i=0;i<=end;i++){const t=i/30,capture=kind==='walk'||i>=60;const actor={x:-2+Math.min(5.6,Math.max(0,t-2)*.8),z:1};const r=await p.evaluate(({kind,t,actor,camera,view,capture})=>kind==='walk'?window.__POOLROOMS_V1__.renderActorEvidence(t,actor,camera,capture):window.__POOLROOMS_V1__.renderEvidence(t,view,false,capture),{kind,t,actor,camera,view,capture});if(capture)writeFileSync(`${dir}/${String(kind==='walk'?i:i-60).padStart(4,'0')}.png`,Buffer.from(r.png.split(',')[1],'base64'));assert.equal(r.dynamics.waveTime,r.dynamics.causticTime);if(i%60===0){states.push({t,actor:kind==='walk'?actor:null,dynamics:r.dynamics});console.log(name,kind,t);}}
 const s=await p.evaluate(()=>window.__POOLROOMS_V1__.snapshot());assert.equal(s.errors.length,0);writeFileSync(`${dir}/state.json`,JSON.stringify({name,kind,waveSpeed,bodyWakeBoost,view,camera,states,errors:s.errors,method:'Production renderer; deterministic 30Hz physical replay, not realtime FPS. All material/lighting/grain settings unchanged.'},null,2));
}
}finally{await browser.close()}
