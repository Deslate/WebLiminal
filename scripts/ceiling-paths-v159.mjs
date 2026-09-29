import{execFileSync}from'node:child_process';
import{ggxVariant}from'./ggx-variant-v159.mjs';
import{chromium}from'@playwright/test';import{mkdirSync,writeFileSync,readFileSync}from'node:fs';import{provenance}from'./roam-v149-provenance.mjs';
const root=process.env.EVIDENCE_DIR||'../workroom-v1.59-evidence/ceiling',poses={opening:{x:-3.6,y:1.62,z:8,yaw:-.29,pitch:.55},deep:{x:0,y:1.62,z:-5.5,yaw:Math.PI,pitch:1.05},front:{x:0,y:1.62,z:4,yaw:0,pitch:1.02},arch:{x:0,y:1.62,z:-3.25,yaw:0,pitch:1.50}};
for(const name of (process.env.CASES||'current,no-ceiling-glaze,no-water-reflection,ceiling-64,ceiling-256').split(',')){
 const dir=root+'/'+name;mkdirSync(dir,{recursive:true});const b=await chromium.launch({channel:'chrome',headless:true});
 try{const p=await b.newPage({viewport:{width:960,height:624}});await p.routeWebSocket(/.*/,w=>w.close());const overrides={};let camera=name==='final'?readFileSync('src/render/camera.wgsl','utf8'):execFileSync('git',['show','bfb1dbc:src/render/camera.wgsl'],{encoding:'utf8'});
 if(name==='no-ceiling-glaze')camera=camera.replace('return CameraLayers(shadeMaterial(h,rd,false,m,m.coat<=.009),a,guide);','return CameraLayers(shadeMaterial(h,rd,false,m,m.coat<=.009),select(a,vec3f(0),h.material==1u),guide);');
 if(name.startsWith('ceiling-')){const n=Number(name.split('-')[1]);camera=camera.replace('for(var j=0u;j<8u;j++){',`let rays=select(8u,${n}u,h.material==1u);\n    for(var j=0u;j<rays;j++){`).replace('(f32(k)+.5)/16.','(f32(k)+.5)/f32(rays*2u)').replace('*weight/8.','*weight/f32(rays)');}
 if(name.startsWith('vndf-'))camera=ggxVariant(camera,{ceiling:Number(name.split('-')[1]),tile:Number(name.split('-')[1]),visible:true});
 if(name==='no-water-reflection'){
 camera=camera.replace('return (a*f+b*(1.-f))','return (b*(1.-f))');
 overrides['water-caustics.wgsl']=readFileSync('src/render/water-caustics.wgsl','utf8').replace('for(var branch=0u;branch<2u;branch++)','for(var branch=1u;branch<2u;branch++)');
 overrides['photons.wgsl']=readFileSync('src/render/photons.wgsl','utf8').replace('power*=f/probability;rd=reflect(rd,n);','power=vec3f(0);rd=reflect(rd,n);');
 overrides['diffuse-transfer.wgsl']=readFileSync('src/render/diffuse-transfer.wgsl','utf8').replace('before*f*select','before*0.*select');
 }
 overrides['camera.wgsl']=camera;for(const[file,s]of Object.entries(overrides))await p.route(u=>u.pathname==='/src/render/'+file,r=>r.fulfill({contentType:'text/javascript',body:'export default '+JSON.stringify(s)}));
 await p.goto('http://127.0.0.1:4173');await p.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs,null,{timeout:180000});
 await p.evaluate(async view=>{document.body.classList.add('evidence');await __POOLROOMS_V1__.configure({view,pause:true,freeze:false,body:false,scale:1,seed:7819301,exposure:.85,focalLength:24,grain:0});for(let i=0;i<=180;i++)await __POOLROOMS_V1__.renderEvidence(i/30,view,false,false)},poses.opening);
 for(const [label,pose]of Object.entries(poses)){const data=await p.evaluate(async pose=>{const a=__POOLROOMS_V1__;const v=await a.renderEvidence(6,pose,false,true);return {v,s:a.snapshot()}},pose);if(data.s.errors.length)throw Error(JSON.stringify(data.s.errors));writeFileSync(dir+'/'+label+'.png',Buffer.from(data.v.png.split(',')[1],'base64'));}
 writeFileSync(dir+'/source.json',JSON.stringify({source:provenance(),overrides}));console.log(name);
 }finally{await b.close()}
}
