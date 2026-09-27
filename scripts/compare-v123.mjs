import {execFileSync} from 'node:child_process';
import {chromium} from '@playwright/test';import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
const out=process.env.EVIDENCE_DIR||'../workroom-v1.23-evidence/convergence';mkdirSync(out,{recursive:true});
const specs=JSON.parse(process.env.CASES||'[["previous",384,2048],["source512",512,2048],["source768",768,2048],["reference",1536,4096]]');
const lastFrame=Math.round(Number(process.env.TARGET_TIME||6)*30);
let focus=existsSync(`${out}/previous.json`)?JSON.parse(readFileSync(`${out}/previous.json`)).solar.peakXZ:null;
for(const[name,n,size,directions=3]of specs){const browser=await chromium.launch({channel:'chrome',headless:true});try{const p=await browser.newPage({viewport:{width:1280,height:832}});
for(const file of ['renderer.js','solar-atlas.wgsl','camera.wgsl','common.wgsl'])await p.route(u=>u.pathname==='/src/render/'+file,route=>{
 let s=process.env.WORKING?readFileSync('src/render/'+file,'utf8'):execFileSync('git',['show','ca09c32:src/render/'+file],{encoding:'utf8'});
 const base=process.env.WORKING?640:384;
 s=s.replace(new RegExp('\\b('+[base,base+1,base+2,2048,2047].join('|')+')(?=u?\\b)','g'),x=>({[base]:n,[base+1]:n+1,[base+2]:n+2,2048:size,2047:size-1}[x]));
 if(directions!==3){
  if(file==='renderer.js')s=s.replaceAll(`${n+1}*${n+1}*3`,`${n+1}*${n+1}*${directions}`).replaceAll(`${n}*${n}*6*3`,`${n}*${n}*6*${directions}`).replace('d<3;','d<'+directions+';');
  if(file==='solar-atlas.wgsl')s=s.replace('count*3u','count*'+directions+'u').replace('(BEAM_N+1u)*(BEAM_N+1u)*3u','(BEAM_N+1u)*(BEAM_N+1u)*'+directions+'u').replace('(f32(disc)+.5)*2.*PI/3.','(f32(disc)+.5)*2.*PI*.61803398875').replace('(.00465*.70710678)','(.00465*sqrt((f32(disc)+.5)/'+directions+'.))').replace('schlick(abs(rd.y),.043))/3.','schlick(abs(rd.y),.043))/'+directions+'.');
 }
 if(file==='renderer.js'){
 s=s.replace('rb.unmap();rb.destroy();\n      const beamSize=',`if(options.patches){solar.patches=[];const norm=Math.hypot(.66,.69,.295),rx=.66/norm/1.333,rz=-.295/norm/1.333,ry=-Math.sqrt(1-rx*rx-rz*rz);const lo=[-2.1-config.apertureWidth/2+.66/.69*(6.101-config.waterLevel)-rx*config.waterLevel/ry-.8,1.3-config.apertureDepth/2-.295/.69*(6.101-config.waterLevel)-rz*config.waterLevel/ry-.8];for(const patch of options.patches){const values=[];for(let y=0;y<512;y++)for(let x=0;x<512;x++){const px=(patch.x+(x/511-.5)*patch.width-lo[0])/dx-.5,pz=(patch.z+(y/511-.5)*patch.width-lo[1])/dz-.5;const bx=Math.floor(px),bz=Math.floor(pz),fx=px-bx,fz=pz-bz;let l=0;for(let j=0;j<2;j++)for(let k=0;k<2;k++){const i=(Math.max(0,Math.min(${size-1},bz+j))*${size}+Math.max(0,Math.min(${size-1},bx+k)))*4;l+=(half(a[i])*.2126+half(a[i+1])*.7152+half(a[i+2])*.0722)*(k?fx:1-fx)*(j?fz:1-fz);}values.push(l);}solar.patches.push({...patch,values});}}rb.unmap();rb.destroy();\n      const beamSize=`);
 }
 return route.fulfill({contentType:'text/javascript',body:file.endsWith('.wgsl')?'export default '+JSON.stringify(s):s});});
 await p.goto('http://localhost:4173');await p.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs);
 const view={x:3.5,y:1.5,z:-1,yaw:0,pitch:-Math.PI/2};if(process.env.BENCH){await p.evaluate(view=>window.__POOLROOMS_V1__.configure({view,body:false,pause:false,freeze:false,grain:.004,scale:1}),view);await p.waitForTimeout(2500);const start=await p.evaluate(()=>window.__POOLROOMS_V1__.snapshot().elapsed);await p.waitForTimeout(6500);const r=await p.evaluate(()=>window.__POOLROOMS_V1__.snapshot());const frames=r.frames.filter(f=>f.t>start+.5),ms=frames.map(f=>f.ms).sort((a,b)=>a-b),bins=[];for(let t=start+1;t<start+5;t++){const a=frames.filter(f=>f.t>=t&&f.t<t+1);bins.push(1000*a.length/a.reduce((s,f)=>s+f.ms,0));}const result={fps:1000*ms.length/ms.reduce((a,b)=>a+b,0),p95:ms[Math.floor(ms.length*.95)],minOneSecond:Math.min(...bins),firstFrameMs:r.firstFrameMs,internal:r.internal,errors:r.errors};writeFileSync(`${out}/${name}-performance.json`,JSON.stringify(result,null,2));console.log(name,result);continue;}await p.evaluate(view=>window.__POOLROOMS_V1__.configure({view,body:false,pause:true,freeze:false,grain:0,scale:1}),view);
 let r;for(let i=0;i<=lastFrame;i++)r=await p.evaluate(({i,lastFrame})=>window.__POOLROOMS_V1__.renderEvidence(i/30,{},false,i===lastFrame),{i,lastFrame});
 writeFileSync(`${out}/${name}.png`,Buffer.from(r.png.split(',')[1],'base64'));
 if(!focus)focus=(await p.evaluate(()=>window.__POOLROOMS_V1__.audit({solar:true}))).solar.peakXZ;
 const a=await p.evaluate(focus=>window.__POOLROOMS_V1__.audit({solar:true,patches:[{name:'main',x:3.5,z:-1,width:2},{name:'focus',x:focus[0],z:focus[1],width:.25}]}),focus);
 for(const patch of a.solar.patches){writeFileSync(`${out}/${name}-${patch.name}.f32`,Buffer.from(new Float32Array(patch.values).buffer));delete patch.values;}
 writeFileSync(`${out}/${name}.json`,JSON.stringify({n,size,directions,solar:a.solar,errors:a.errors},null,2));console.log(name,a.solar);
 }finally{await browser.close()}}
