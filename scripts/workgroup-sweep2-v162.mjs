import{chromium}from'@playwright/test';import{readFileSync}from'node:fs';
const view={x:1.2,y:1.62,z:-3.25,yaw:-Math.PI/2,pitch:.45}; // door, worst case
const scale=Number(process.env.SCALE||1);
const configs=(process.env.CONFIGS||'8,8;4,4;8,4;4,8;2,8;8,2;16,4;4,16;2,16;16,2;1,64;64,1;1,32;32,1').split(';').map(s=>s.split(',').map(Number));
const b=await chromium.launch({channel:'chrome',headless:true});
let baseline=null;
try{
  for(const [x,y] of configs){
    const p=await b.newPage({viewport:{width:1280,height:832}});
    await p.routeWebSocket(/.*/,w=>w.close());
    await p.route(u=>u.pathname==='/src/render/camera.wgsl',async r=>{
      const s=readFileSync('src/render/camera.wgsl','utf8').replace('@compute @workgroup_size(8,8)',`@compute @workgroup_size(${x},${y})`);
      await r.fulfill({contentType:'text/javascript',body:'export default '+JSON.stringify(s)});
    });
    await p.route(u=>u.pathname==='/src/render/renderer.js',async r=>{
      const resp=await r.fetch();let s=await resp.text();
      s=s.replace('pass.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8));',`pass.dispatchWorkgroups(Math.ceil(width / ${x}), Math.ceil(height / ${y}));`);
      await r.fulfill({response:resp,body:s});
    });
    await p.goto('http://127.0.0.1:4173');
    await p.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs,null,{timeout:180000});
    await p.evaluate(({scale,view})=>__POOLROOMS_V1__.configure({lab:{resolution:1},scale,view,body:true,pause:true,freeze:false,grain:.004,profile:true}),{scale,view});
    // Correctness check: capture a frame and compare its PNG bytes to the 8x8 baseline.
    const shot=await p.evaluate(t=>__POOLROOMS_V1__.renderEvidence(t,{},false,true),0.033);
    if(x===8&&y===8)baseline=shot.png;
    const pixelMatch=baseline?shot.png===baseline:null;
    const data=await p.evaluate(async()=>{
      for(let i=0;i<40;i++){await __POOLROOMS_V1__.renderEvidence(1+i/30,{},false,false);}
      const rows=[];
      for(let i=40;i<100;i++){await __POOLROOMS_V1__.renderEvidence(1+i/30,{},false,false);rows.push(__POOLROOMS_V1__.snapshot().dynamics.frameCost.camera);}
      return {rows,errors:__POOLROOMS_V1__.snapshot().errors};
    });
    const avg=data.rows.reduce((a,b)=>a+b,0)/data.rows.length;
    console.log(`${x}x${y}`.padEnd(10), avg.toFixed(2)+'ms', 'pixelMatch='+pixelMatch, data.errors.length?('ERRORS:'+JSON.stringify(data.errors)):'');
    await p.close();
  }
}finally{await b.close();}
