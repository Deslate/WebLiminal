import{chromium}from'@playwright/test';import{mkdirSync,writeFileSync}from'node:fs';import assert from'node:assert/strict';import{auditOptics}from'./optical-audit.mjs';
const out=process.env.EVIDENCE_DIR||'../workroom-v1.15-evidence/final';mkdirSync(out,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true});
try{const p=await browser.newPage({viewport:{width:1512,height:982}});await p.goto('http://127.0.0.1:4173');await p.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs);
const results={};for(const inject of [false,true]){
 await p.evaluate(inject=>window.__POOLROOMS_V1__.configure({bodyDisplacement:inject,pause:true,freeze:false,grain:0,scale:1280/1512,view:{x:-.8,y:1.62,z:1,yaw:-Math.PI/2,pitch:-1.05}}),inject);
 for(let i=0;i<=420;i++){await p.evaluate(({t,x})=>window.__POOLROOMS_V1__.renderActorEvidence(t,{x,z:1},{x:5.8,y:1.25,z:5.2,yaw:.64,pitch:-.16},false),{t:i/60,x:-.8+Math.min(4.8,Math.max(0,i/60-3)*1.6)});}
 for(const[name,view]of Object.entries({floor:{x:3,y:1.62,z:1,yaw:0,pitch:-1.05},wall:{x:3,y:1.62,z:0,yaw:-1.57,pitch:.36},surface:{x:3,y:.72,z:1,yaw:0,pitch:-.12}})){const r=await p.evaluate(view=>window.__POOLROOMS_V1__.renderEvidence(7,view,true),view);writeFileSync(`${out}/${inject?'source':'control'}-${name}.png`,Buffer.from(r.png.split(',')[1],'base64'));}
 const raw=await p.evaluate(()=>window.__POOLROOMS_V1__.audit({simulation:true,floor:true,receivers:[18]}));results[inject?'source':'control']={raw,optics:auditOptics(raw)};
}
const a=results.control.raw,b=results.source.raw;function difference(a,b){let max=0,sum=0,n=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);max=Math.max(max,d);sum+=d;if(d>1e-5)n++;}return{max,mean:sum/a.length,changed:n};}
const floor=difference(a.floor.roi.rgb,b.floor.roi.rgb),wallA=[],wallB=[];const {nx,ny}=a.receivers[18];for(let z=0;z<ny;z++)if((z+.5)/ny*6.1>.6)for(let x=0;x<nx;x++)for(let c=0;c<3;c++){const i=(z*nx+x)*4+c;wallA.push(a.receivers[18].irradiance[i]);wallB.push(b.receivers[18].irradiance[i]);}const wall=difference(wallA,wallB);
const simulation=difference(a.simulation.values.filter((_,i)=>i%4===0),b.simulation.values.filter((_,i)=>i%4===0));
writeFileSync(`${out}/body-coupling.json`,JSON.stringify({method:'Identical deterministic simulation replay; only difference is persistent body displacement forcing. Visible cylinder, shadows, footsteps, actor path and background field are identical. Read raw transported irradiance before tone mapping. Wall selects y>0.6m, above water.',floor,wall,simulation,optics:{control:results.control.optics,source:results.source.optics}},null,2));
assert(floor.max>.01);assert(wall.max>.001);assert(simulation.max>.0001);assert.equal(a.errors.length+b.errors.length,0);console.log({floor,wall,simulation,optics:results.source.optics.maxResidual});
}finally{await browser.close()}
