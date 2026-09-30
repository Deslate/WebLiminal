import{chromium}from'@playwright/test';import{readFileSync}from'node:fs';
const view={x:1.2,y:1.62,z:-3.25,yaw:-Math.PI/2,pitch:.45}; // door, worst case
const scale=Number(process.env.SCALE||1);
const variants={
  base: s=>s,
  'no-water (skip traceWater path entirely)': s=>s.replace('fn trace(ro:vec3f,rd:vec3f,maxT:f32)->Hit {var h=traceDynamicSolid(ro,rd,maxT);let w=traceWater(ro,rd,h.t);if(w.t<h.t){h=w;}return h;}','fn trace(ro:vec3f,rd:vec3f,maxT:f32)->Hit {return traceDynamicSolid(ro,rd,maxT);}'),
  'water Newton capped at 4 iters (not shippable, cost probe)': s=>s.replace('for(var i=0u;i<24u;i++){','for(var i=0u;i<4u;i++){'),
  'water Newton capped at 12 iters (not shippable, cost probe)': s=>s.replace('for(var i=0u;i<24u;i++){','for(var i=0u;i<12u;i++){'),
  'no-relief (skip reliefHit tile marching)': s=>s.replace('let h=reliefHit(ro,rd,base);','let h=base;'),
  'no-jointVisibility (return 1 immediately)': s=>s.replace('fn jointVisibilityPrepare(h:Hit)->JointPrep {','fn jointVisibilityPrepare(h:Hit)->JointPrep {return JointPrep(0.,0.,0.,vec3f(0),vec3f(0),vec2f(0),0u,0u,0u);'),
  'no-shadow-ray (skip sun traceSolidAny)': s=>s.replace('!traceSolidAny(ro,sun,INF)','true'),
  'schlick pow(5)->mul': s=>s.replace('fn schlick(c:f32,f0:f32)->f32{return f0+(1.-f0)*pow(1.-clamp(c,0.,1.),5.);}','fn schlick(c:f32,f0:f32)->f32{let x=1.-clamp(c,0.,1.);let x2=x*x;return f0+(1.-f0)*x2*x2*x;}'),
  'workgroup 4x4 instead of 8x8': s=>s.replace('@compute @workgroup_size(8,8)','@compute @workgroup_size(4,4)'),
  'workgroup 16x16 instead of 8x8': s=>s.replace('@compute @workgroup_size(8,8)','@compute @workgroup_size(16,16)'),
  'workgroup 32x4 instead of 8x8': s=>s.replace('@compute @workgroup_size(8,8)','@compute @workgroup_size(32,4)'),
  'workgroup 8x4 instead of 8x8': s=>s.replace('@compute @workgroup_size(8,8)','@compute @workgroup_size(8,4)'),
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
      for(let i=40;i<100;i++){await __POOLROOMS_V1__.renderEvidence(i/30,view,false,false);rows.push(__POOLROOMS_V1__.snapshot().dynamics.frameCost.camera);}
      return {rows,internal:__POOLROOMS_V1__.snapshot().internal,errors:__POOLROOMS_V1__.snapshot().errors};
    },{scale,view});
    const avg=data.rows.reduce((a,b)=>a+b,0)/data.rows.length;
    console.log(name.padEnd(60), avg.toFixed(2)+'ms', data.internal, data.errors.length?('ERRORS:'+JSON.stringify(data.errors)):'');
    await p.close();
  }
}finally{await b.close();}
