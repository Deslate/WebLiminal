import {installBaseline} from './baseline-v144.mjs';
import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const out=process.env.EVIDENCE_DIR||'../workroom-v1.44-evidence/performance';mkdirSync(out,{recursive:true});

function variant(path,s,name){
 if(path==='/src/main.js')s=s.replace('if (!paused && !holdTime && frameMs.length > 60 && done - lastResize > 900)','if (false)');


 return s;
}

const names=(process.env.CASES||'before,after,before-end').split(',');
const b=await chromium.launch({channel:'chrome',headless:true});
try{for(const name of names){const p=await b.newPage({viewport:{width:1280,height:832}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{window.allocation={live:0,peak:0,count:0};const f=GPUDevice.prototype.createBuffer,d=GPUBuffer.prototype.destroy;GPUDevice.prototype.createBuffer=function(x){const b=f.call(this,x);b.__size=x.size;window.allocation.live+=x.size;window.allocation.peak=Math.max(window.allocation.peak,window.allocation.live);window.allocation.count++;return b};GPUBuffer.prototype.destroy=function(){if(this.__size){window.allocation.live-=this.__size;this.__size=0;}return d.call(this)}});
 for(const path of ['/src/main.js','/src/render/renderer.js','/src/render/light-atlas.js','/src/render/sky.wgsl','/src/render/water-caustics.wgsl','/src/render/camera.wgsl'])await p.route(u=>u.pathname===path,async r=>{const response=await r.fetch();const source=path.endsWith('.wgsl')?'export default '+JSON.stringify(variant(path,readFileSync('.'+path,'utf8'),name)):(process.env.ADAPTIVE&&path==='/src/main.js'?await response.text():variant(path,await response.text(),name));await r.fulfill({response,body:source})});
 await installBaseline(p,name);
 let result={name};const start=Date.now();try{
 await p.goto('http://127.0.0.1:4173');await p.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs,{},{timeout:120000});
 const tuning={pause:false,freeze:false,scale:Number(process.env.SCALE)||1};if(name==='photons'||name==='all'||name==='recommended')Object.assign(tuning,{photonCount:196608,sunGrid:768,skyGridX:512,skyGridY:1024});if(name==='diffuse'||name==='all')tuning.diffuseIterations=8;
 if(process.env.WALL)tuning.view={x:4,y:1.62,z:-1.5,yaw:-Math.PI/2,pitch:.55};const t=Date.now();await p.evaluate(t=>window.__POOLROOMS_V1__.configure(t),tuning);await p.waitForTimeout(process.env.ADAPTIVE?14000:4500);const startView=await p.evaluate(()=>window.__POOLROOMS_V1__.snapshot().view);if(process.env.WALK)await p.keyboard.down('KeyW');const frameStart=await p.evaluate(()=>window.__POOLROOMS_V1__.snapshot().frames.length);await p.waitForTimeout(name==='all'?20000:6500);
 const s=await p.evaluate(()=>({s:window.__POOLROOMS_V1__.snapshot(),allocation:window.allocation}));const frames=s.s.frames.slice(frameStart+1),ms=frames.map(f=>f.ms),sum=ms.reduce((a,b)=>a+b,0),sort=[...ms].sort((a,b)=>a-b);let tm=0;const bins=[];for(const m of ms){(bins[Math.floor(tm/1000)]??=[]).push(m);tm+=m;}
 result={...result,startView,endView:s.s.view,config:s.s.config,dynamics:s.s.dynamics,fps:ms.length*1000/sum,meanMs:sum/ms.length,p95:sort[Math.floor(sort.length*.95)],minOneSecond:Math.min(...bins.slice(0,-1).map(a=>1000*a.length/a.reduce((x,y)=>x+y,0))),count:ms.length,resolution:s.s.internal,firstFrameMs:s.s.firstFrameMs,loadWallMs:t-start,allocation:s.allocation,tuning,errors:[...errors,...s.s.errors]};
 await p.evaluate(()=>document.body.classList.add('evidence'));await p.evaluate(()=>window.__POOLROOMS_V1__.pause());await p.screenshot({path:`${out}/${name}.png`});
 }catch(e){result.error=String(e);result.errors=errors;}
 writeFileSync(`${out}/${name}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));await p.close();}}
finally{await b.close()}
