import{chromium}from'@playwright/test';import{execFileSync}from'node:child_process';
const view={x:1.2,y:1.62,z:-3.25,yaw:-Math.PI/2,pitch:.45}; // door, worst case
const scale=Number(process.env.SCALE||1);
const variant=process.env.VARIANT||'after'; // 'after' = working tree (optimized), 'before' = HEAD (pre-optimization)
const files=['common.wgsl','camera.wgsl','sky.wgsl','water-caustics.wgsl'];
const b=await chromium.launch({channel:'chrome',headless:true});
try{
  const p=await b.newPage({viewport:{width:1280,height:832}});
  await p.routeWebSocket(/.*/,w=>w.close());
  if(variant==='before')for(const f of files)await p.route(u=>u.pathname==='/src/render/'+f,r=>r.fulfill({contentType:'text/javascript',body:'export default '+JSON.stringify(execFileSync('git',['show','HEAD:src/render/'+f],{encoding:'utf8'}))}));
  await p.goto('http://127.0.0.1:4173');
  await p.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs,null,{timeout:180000});
  const data=await p.evaluate(async({scale,view})=>{
    await __POOLROOMS_V1__.configure({lab:{resolution:1},scale,view,body:true,pause:true,freeze:false,grain:.004,profile:true});
    for(let i=0;i<30;i++){await __POOLROOMS_V1__.renderEvidence(i/30,view,false,false);}
    const rows=[];
    for(let i=30;i<180;i++){await __POOLROOMS_V1__.renderEvidence(i/30,view,false,false);rows.push(__POOLROOMS_V1__.snapshot().dynamics.frameCost);}
    return rows;
  },{scale,view});
  const avg=k=>data.reduce((a,r)=>a+r[k],0)/data.length;
  const med=k=>{const v=data.map(r=>r[k]).sort((a,b)=>a-b);return v[Math.floor(v.length/2)];};
  console.log(JSON.stringify({variant,scale,sim:avg('simulation'),lighting:avg('lighting'),camera:avg('camera'),camMed:med('camera'),simMed:med('simulation')}));
}finally{await b.close();}
