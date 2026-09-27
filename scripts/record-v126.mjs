import{chromium}from'@playwright/test';import{execFileSync}from'node:child_process';import{mkdirSync,writeFileSync}from'node:fs';import assert from'node:assert/strict';
const root=process.env.EVIDENCE_DIR||'../workroom-v1.26-evidence/appearance';
const variants=JSON.parse(process.env.VARIANTS||'["final"]');
for(const version of variants){const b=await chromium.launch({channel:'chrome',headless:true});try{const p=await b.newPage({viewport:{width:1280,height:832}});const errors=[];p.on('pageerror',e=>errors.push(e.message));if(version==='v123')for(const file of ['common.wgsl','renderer.js'])await p.route(u=>u.pathname==='/src/render/'+file,route=>{const s=execFileSync('git',['show','8ce969c:src/render/'+file],{encoding:'utf8'});return route.fulfill({contentType:'text/javascript',body:file.endsWith('wgsl')?'export default '+JSON.stringify(s):s});});await p.goto('http://localhost:4173');await p.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs);
const views={normal:{x:2,y:1.62,z:3,yaw:0,pitch:-1.12},floor:{x:3.5,y:1.5,z:-1,yaw:0,pitch:-Math.PI/2}};
for(const [name,view]of Object.entries(views)){
 // Normal view is appearance only. The above-water floor view is also used
 // solely for temporal comparison with v1.23, never irradiance diagnosis.
 if(name==='floor'&&version==='v123')continue;
 const out=root+'/'+version+'-'+name;mkdirSync(out+'/frames',{recursive:true});await p.evaluate(view=>window.__POOLROOMS_V1__.configure({view,body:false,pause:true,freeze:false,grain:.004,scale:1}),view);
 const count=name==='floor'?600:300;for(let i=0;i<count;i++){const r=await p.evaluate(t=>window.__POOLROOMS_V1__.renderEvidence(t,{},false,true),i/30);writeFileSync(out+'/frames/frame-'+String(i).padStart(4,'0')+'.png',Buffer.from(r.png.split(',')[1],'base64'));if(i%100===0)console.log(version,name,i);}
 const snap=await p.evaluate(()=>window.__POOLROOMS_V1__.snapshot());assert.equal(errors.length+snap.errors.length,0);writeFileSync(out+'/record.json',JSON.stringify({purpose:'Above-water appearance only, not floor irradiance diagnosis',frames:count,hz:30,view,config:snap.config,errors:[...errors,...snap.errors]},null,2));
}
}finally{await b.close()}}
