import{chromium}from'@playwright/test';import{readFileSync}from'node:fs';
const view={x:1.2,y:1.62,z:-3.25,yaw:-Math.PI/2,pitch:.45}; // door, worst case
const scale=Number(process.env.SCALE||1);
const variants={
  base: s=>s,
  'no-glaze (skip 48/64-ray loop entirely)': s=>s.replace('if(m.coat>.009){','if(false){'),
  'no-shadow-ray (skip sun traceSolid in directLighting)': s=>s.replace('traceSolid(ro,sun,INF).t>=INF','true'),
  'no-relief (skip reliefHit tile marching)': s=>s.replace('let h=reliefHit(ro,rd,base);','let h=base;'),
  'no-jointVisibility (return 1 immediately)': s=>s.replace('fn jointVisibility(h:Hit,l:vec3f)->f32 {','fn jointVisibility(h:Hit,l:vec3f)->f32 {return 1.;'),
  'no-sky-integral-term (skip second directLighting term)': s=>s.replace('if(any(sky>vec3f(0))){result+=sky*jointVisibility','if(false){result+=sky*jointVisibility'),
  'no-photonEstimate (skip irradiance sample)': s=>s.replace('let photons=photonEstimate(h);','let photons=vec4f(0);'),
};
const b=await chromium.launch({channel:'chrome',headless:true});
try{
  for(const [name,patch] of Object.entries(variants)){
    const p=await b.newPage({viewport:{width:1280,height:832}});
    await p.routeWebSocket(/.*/,w=>w.close());
    await p.route(u=>u.pathname==='/src/render/camera.wgsl'||u.pathname==='/src/render/common.wgsl',async r=>{
      const path='.'+new URL(r.request().url()).pathname;
      const s=patch(readFileSync(path,'utf8'));
      await r.fulfill({contentType:'text/javascript',body:'export default '+JSON.stringify(s)});
    });
    await p.goto('http://127.0.0.1:4173');
    await p.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs,null,{timeout:180000});
    const data=await p.evaluate(async({scale,view})=>{
      await __POOLROOMS_V1__.configure({lab:{resolution:1},scale,view,body:true,pause:true,freeze:false,grain:.004,profile:true});
      for(let i=0;i<40;i++){await __POOLROOMS_V1__.renderEvidence(i/30,view,false,false);}
      const rows=[];
      for(let i=40;i<70;i++){await __POOLROOMS_V1__.renderEvidence(i/30,view,false,false);rows.push(__POOLROOMS_V1__.snapshot().dynamics.frameCost.camera);}
      return {rows,internal:__POOLROOMS_V1__.snapshot().internal,errors:__POOLROOMS_V1__.snapshot().errors};
    },{scale,view});
    const avg=data.rows.reduce((a,b)=>a+b,0)/data.rows.length;
    console.log(name.padEnd(55), avg.toFixed(2)+'ms', data.internal, data.errors.length?('ERRORS:'+JSON.stringify(data.errors)):'');
    await p.close();
  }
}finally{await b.close();}
