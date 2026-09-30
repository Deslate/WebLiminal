import{chromium}from'@playwright/test';import{execFileSync}from'node:child_process';
const scales=(process.env.SCALES||'0.5,0.7,0.85,1').split(',').map(Number);
const views={opening:{x:-3.6,y:1.62,z:8,yaw:-.29,pitch:.028},door:{x:1.2,y:1.62,z:-3.25,yaw:-Math.PI/2,pitch:.45}};
const variant=process.env.VARIANT||'after';
const files=['common.wgsl','camera.wgsl','sky.wgsl','water-caustics.wgsl'];
const b=await chromium.launch({channel:'chrome',headless:true});
try{
  const p=await b.newPage({viewport:{width:1280,height:832}});
  await p.routeWebSocket(/.*/,w=>w.close());
  if(variant==='before')for(const f of files)await p.route(u=>u.pathname==='/src/render/'+f,r=>r.fulfill({contentType:'text/javascript',body:'export default '+JSON.stringify(execFileSync('git',['show','HEAD:src/render/'+f],{encoding:'utf8'}))}));
  await p.goto('http://127.0.0.1:4173');
  await p.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs,null,{timeout:180000});
  for(const scale of scales)for(const[pose,view]of Object.entries(views)){
    const data=await p.evaluate(async({scale,view})=>{
      await __POOLROOMS_V1__.configure({lab:{resolution:1},scale,view,body:true,pause:true,freeze:false,grain:.004,profile:true});
      for(let i=0;i<30;i++){await __POOLROOMS_V1__.renderEvidence(i/30,view,false,false);}
      const rows=[];
      for(let i=30;i<130;i++){await __POOLROOMS_V1__.renderEvidence(i/30,view,false,false);rows.push(__POOLROOMS_V1__.snapshot().dynamics.frameCost);}
      return {rows,internal:__POOLROOMS_V1__.snapshot().internal};
    },{scale,view});
    const avg=k=>data.rows.reduce((a,r)=>a+r[k],0)/data.rows.length;
    const sim=avg('simulation'),lighting=avg('lighting'),camera=avg('camera'),total=sim+lighting+camera;
    console.log(JSON.stringify({variant,scale,pose,internal:data.internal,sim,lighting,camera,total,fps:1000/total}));
  }
}finally{await b.close();}
