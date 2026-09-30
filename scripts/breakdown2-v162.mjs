import{chromium}from'@playwright/test';
const scales=(process.env.SCALES||'0.7,1').split(',').map(Number);
const views={opening:{x:-3.6,y:1.62,z:8,yaw:-.29,pitch:.028},door:{x:1.2,y:1.62,z:-3.25,yaw:-Math.PI/2,pitch:.45}};
const b=await chromium.launch({channel:'chrome',headless:true});
try{
  const p=await b.newPage({viewport:{width:1280,height:832}});
  await p.routeWebSocket(/.*/,w=>w.close());
  await p.route(u=>u.pathname==='/src/render/renderer.js',async r=>{
    const resp=await r.fetch();let s=await resp.text();
    s=s.replace(
      "pass.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8));\n      pass.end();",
      "pass.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8));\n      pass.end();\n      device.queue.submit([encoder.finish()]);\n      await device.queue.onSubmittedWorkDone();\n      window.__CAMERA_PASS_MS__=performance.now()-lightingDone;\n      const encoder2=device.createCommandEncoder();"
    ).replaceAll('encoder,pipelines[12]','encoder2,pipelines[12]').replaceAll('encoder,pipelines[13]','encoder2,pipelines[13]')
     .replace('const draw = encoder.beginRenderPass({','const draw = encoder2.beginRenderPass({')
     .replace('device.queue.submit([encoder.finish()]);\n      await device.queue.onSubmittedWorkDone();\n      if(config.profile)frameCost=','device.queue.submit([encoder2.finish()]);\n      await device.queue.onSubmittedWorkDone();\n      window.__POST_MS__=performance.now()-lightingDone-window.__CAMERA_PASS_MS__;\n      if(config.profile)frameCost=');
    await r.fulfill({response:resp,body:s});
  });
  await p.goto('http://127.0.0.1:4173');
  await p.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs,null,{timeout:180000});
  for(const scale of scales)for(const[pose,view]of Object.entries(views)){
    const data=await p.evaluate(async({scale,view})=>{
      await __POOLROOMS_V1__.configure({lab:{resolution:1},scale,view,body:true,pause:true,freeze:false,grain:.004,profile:true});
      for(let i=0;i<40;i++){await __POOLROOMS_V1__.renderEvidence(i/30,view,false,false);}
      const rows=[];
      for(let i=40;i<80;i++){await __POOLROOMS_V1__.renderEvidence(i/30,view,false,false);rows.push([window.__CAMERA_PASS_MS__,window.__POST_MS__]);}
      return {rows,internal:__POOLROOMS_V1__.snapshot().internal};
    },{scale,view});
    const avg=i=>data.rows.reduce((a,r)=>a+r[i],0)/data.rows.length;
    console.log(scale,pose,data.internal,'cameraPass',avg(0).toFixed(2),'reflectionFilter+draw',avg(1).toFixed(2));
  }
}finally{await b.close();}
