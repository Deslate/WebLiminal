import{chromium}from'@playwright/test';import{execFileSync}from'node:child_process';
const variant=process.env.VARIANT||'after'; // 'after' = working tree, 'before' = HEAD
const files=(process.env.FILES||'common.wgsl,camera.wgsl,sky.wgsl,water-caustics.wgsl').split(',');
const views=[
  {x:-3.6,y:1.62,z:8,yaw:-.29,pitch:.028},
  {x:1.2,y:1.62,z:-3.25,yaw:-Math.PI/2,pitch:.45},
  {x:-1,y:1.62,z:6,yaw:0,pitch:1.05},
  {x:2,y:1.62,z:4,yaw:-.6,pitch:1.05},
  {x:4,y:1.62,z:-1.5,yaw:-Math.PI/2,pitch:.55},
  {x:-3.6,y:1.62,z:8,yaw:-.29,pitch:.85},
];
const b=await chromium.launch({channel:'chrome',headless:true});
try{
  const p=await b.newPage({viewport:{width:1280,height:832}});
  await p.routeWebSocket(/.*/,w=>w.close());
  if(variant==='before')for(const f of files)await p.route(u=>u.pathname==='/src/render/'+f,r=>r.fulfill({contentType:'text/javascript',body:'export default '+JSON.stringify(execFileSync('git',['show','HEAD:src/render/'+f],{encoding:'utf8'}))}));
  await p.goto('http://127.0.0.1:4173');
  await p.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs,null,{timeout:180000});
  await p.evaluate(()=>__POOLROOMS_V1__.configure({pause:true,freeze:false,body:true,grain:.004,scale:1,focalLength:24}));
  const pngs=[];let t=0;
  for(let i=0;i<views.length;i++){
    for(let k=0;k<4;k++){
      t+=1.3;
      const r=await p.evaluate(({t,view})=>__POOLROOMS_V1__.renderEvidence(t,view,false,true),{t,view:views[i]});
      pngs.push(r.png);
    }
  }
  console.log(JSON.stringify({variant,count:pngs.length,hash:pngs.join('|').length,pngs}));
}finally{await b.close();}
