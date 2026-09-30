import{chromium}from'@playwright/test';
const scales=(process.env.SCALES||'0.7,1').split(',').map(Number);
const views={opening:{x:-3.6,y:1.62,z:8,yaw:-.29,pitch:.028},door:{x:1.2,y:1.62,z:-3.25,yaw:-Math.PI/2,pitch:.45}};
const b=await chromium.launch({channel:'chrome',headless:true});
try{
  const p=await b.newPage({viewport:{width:1280,height:832}});
  await p.routeWebSocket(/.*/,w=>w.close());
  await p.goto('http://127.0.0.1:4173');
  await p.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs,null,{timeout:180000});
  await p.evaluate(()=>__POOLROOMS_V1__.configure({profile:true}));
  for(const scale of scales)for(const[pose,view]of Object.entries(views)){
    const data=await p.evaluate(async({scale,view})=>{
      await __POOLROOMS_V1__.configure({lab:{resolution:1},scale,view,body:true,pause:true,freeze:false,grain:.004,profile:true});
      const rows=[];
      for(let i=0;i<40;i++){await __POOLROOMS_V1__.renderEvidence(i/30,view,false,false);}
      for(let i=40;i<80;i++){await __POOLROOMS_V1__.renderEvidence(i/30,view,false,false);rows.push(__POOLROOMS_V1__.snapshot().dynamics.frameCost);}
      return {rows,internal:__POOLROOMS_V1__.snapshot().internal};
    },{scale,view});
    const avg=k=>data.rows.reduce((a,r)=>a+r[k],0)/data.rows.length;
    const sim=avg('simulation'),light=avg('lighting'),cam=avg('camera'),total=sim+light+cam;
    console.log(scale,pose,data.internal,'sim',sim.toFixed(2),'lighting',light.toFixed(2),'camera',cam.toFixed(2),'total',total.toFixed(2),'fps',(1000/total).toFixed(2));
  }
}finally{await b.close();}
