import{ggxVariant}from'./ggx-variant-v159.mjs';
import{chromium}from'@playwright/test';import{mkdirSync,writeFileSync,readFileSync}from'node:fs';import{execFileSync}from'node:child_process';import{spawn}from'node:child_process';import{once}from'node:events';import{provenance}from'./roam-v149-provenance.mjs';
const root=process.env.EVIDENCE_DIR||'/Users/steven/Projects/workroom-v1.59-evidence', FPS=30,DURATION=22, W=960,H=624;
for(const [name,url,sourceDir]of [[process.env.VARIANT||'area','http://127.0.0.1:4173','.']]){
 if(process.env.ONLY&&process.env.ONLY!==name)continue;
 const out=root+'/'+name;mkdirSync(out,{recursive:true});const cwd=process.cwd();process.chdir(sourceDir);const source=provenance();process.chdir(cwd);
 const browser=await chromium.launch({channel:'chrome',headless:true});let encoder;
 try{const p=await browser.newPage({viewport:{width:W,height:H}});await p.routeWebSocket(/.*/,w=>w.close());await p.route(u=>u.pathname==='/src/main.js',async r=>{const q=await r.fetch();let s=await q.text();s=s.replace('camera,capture=true){','camera,capture=true,moving=true){').replace('renderer.render(camera,time,true,1)','renderer.render(camera,time,moving,1)');await r.fulfill({response:q,body:s})});

 const cameraBase=execFileSync('git',['show','bfb1dbc:src/render/camera.wgsl'],{encoding:'utf8'});
 const overrides={};
 if(!name.startsWith('final'))overrides['src/render/camera.wgsl']=cameraBase;
 if(name==='baseline')for(const file of ['src/render/diffuse-transfer.wgsl','src/render/renderer.js'])overrides[file]=execFileSync('git',['show','bfb1dbc:'+file],{encoding:'utf8'});
 if(name!=='baseline'){
 let d=readFileSync('src/render/diffuse-transfer.wgsl','utf8');
 if(name.includes('256')){d=d.replace('DIFFUSE_DIRECTIONS:u32=128u','DIFFUSE_DIRECTIONS:u32=256u');overrides['src/render/renderer.js']=readFileSync('src/render/renderer.js','utf8').replace('geometry.probeCount*256*16','geometry.probeCount*512*16');}
 if(name.includes('receiver')){d=d.replace('  for(var i=0u;i<DIFFUSE_DIRECTIONS;i++){','  var receiverSamples=0u;\n  for(var i=0u;i<DIFFUSE_DIRECTIONS;i++){').replace(' linkCounts[idx]=compactCount;',' for(var j=0u;j<compactCount;j++){links[compactBase+j].weight*=f32(DIFFUSE_DIRECTIONS)/max(1.,f32(receiverSamples));}\n linkCounts[idx]=compactCount;');d=d.replace('let rd=basis(h.n)',`let receiverUV=(vec2f(f32(local%dims.x),f32(local/dims.x))+fract(vec2f(.5)+f32(i)*vec2f(.754877666,.569840296)))/vec2f(dims);
    let h=surfaceHit(sid,receiverUV);
    let check=traceSolid(h.p+h.n*EPS*3.,-h.n,EPS*6.);
    if(check.t>=EPS*6.){continue;}receiverSamples++;
    let rd=basis(h.n)`);}
 if(name.includes('rotated'))d=d.replace('fract(f32(i)*.61803398875)','fract(f32(i)*.61803398875+.125)');
 overrides['src/render/diffuse-transfer.wgsl']=d;
 }
 for(const[file,s]of Object.entries(overrides))await p.route(u=>u.pathname==='/'+file,async r=>{
 if(file.endsWith('.wgsl'))return r.fulfill({contentType:'text/javascript',body:'export default '+JSON.stringify(s)});
 const q=await r.fetch();await r.fulfill({response:q,body:s.replaceAll(/from (["'])\.\/([^"']+)\1/g,'from "/src/render/$2"')});
 });
 if(name.startsWith('glaze-')){const rays=Number(name.split('-')[1]);const c=cameraBase.replace('for(var j=0u;j<8u;j++){',`for(var j=0u;j<${rays}u;j++){`).replace('(f32(k)+.5)/16.',`(f32(k)+.5)/${rays*2}.`).replace('*weight/8.',`*weight/${rays}.`);await p.route(u=>u.pathname==='/src/render/camera.wgsl',r=>r.fulfill({contentType:'text/javascript',body:'export default '+JSON.stringify(c)}));overrides['src/render/camera.wgsl']=c;}
 if(name.startsWith('vndf-')){const rays=Number(name.split('-')[1]);const c=ggxVariant(cameraBase,{ceiling:rays,tile:rays,visible:true});overrides['src/render/camera.wgsl']=c;await p.route(u=>u.pathname==='/src/render/camera.wgsl',r=>r.fulfill({contentType:'text/javascript',body:'export default '+JSON.stringify(c)}));}
 if(name==='no-glaze'){const c=cameraBase.replace('return CameraLayers(shadeMaterial(h,rd,false,m,m.coat<=.009),a,guide);','return CameraLayers(shadeMaterial(h,rd,false,m,m.coat<=.009),vec3f(0),guide);');overrides['src/render/camera.wgsl']=c;await p.route(u=>u.pathname==='/src/render/camera.wgsl',r=>r.fulfill({contentType:'text/javascript',body:'export default '+JSON.stringify(c)}));}
 writeFileSync(out+'/overrides.json',JSON.stringify(overrides));
 await p.goto(url);await p.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs,null,{timeout:180000});
 const initial={x:0,y:1.62,z:4,yaw:0,pitch:1.02};await p.evaluate(async view=>{document.body.classList.add('evidence');await __POOLROOMS_V1__.configure({view,pause:true,freeze:false,body:true,scale:1,seed:7819301,exposure:.85,focalLength:24,grain:.004})},initial);
 encoder=spawn('/opt/homebrew/bin/python3',['scripts/roam-v149-encode.py',out,String(FPS*DURATION),String(W),String(H),String(FPS)],{stdio:['pipe','inherit','inherit']});const done=once(encoder,'exit');const frames=[];
 for(let i=0;i<FPS*DURATION;i++){const t=i/FPS;const distance=Math.min(7.25,Math.max(0,t-2)*.8);const moving=t>2&&distance<7.25;const actor={...initial,z:4-distance};const camera={...actor,pitch:t<11.1?1.02:1.02+Math.min(1,(t-11.1)/2)*.48};
 const r=await p.evaluate(async({t,actor,camera,moving})=>{const a=__POOLROOMS_V1__;const v=await a.renderActorEvidence(t,actor,camera,true,moving);return{png:v.png,snapshot:a.snapshot()}},{t,actor,camera,moving});if(r.snapshot.errors.length||!r.snapshot.validPosition)throw Error(JSON.stringify(r.snapshot));const png=Buffer.from(r.png.split(',')[1],'base64');const h=Buffer.alloc(4);h.writeUInt32LE(png.length);if(!encoder.stdin.write(Buffer.concat([h,png])))await once(encoder.stdin,'drain');frames.push({t,actor,camera,moving,internal:r.snapshot.internal,dynamics:r.snapshot.dynamics});if(i%150===0)console.log(name,t);
 }
 encoder.stdin.end();const[code]=await done;if(code)throw Error('encoder '+code);
 const poses={floor:{x:3,y:1.5,z:3,yaw:0,pitch:-.75},wall:{x:3,y:1.62,z:0,yaw:-Math.PI/2,pitch:.25},ceiling:{x:-3.6,y:1.62,z:8,yaw:-.29,pitch:.55}};
 for(const [label,camera]of Object.entries(poses)){const r=await p.evaluate(async({camera})=>__POOLROOMS_V1__.renderActorEvidence(22,{x:0,y:1.62,z:-3.25,yaw:0,pitch:0},camera,true,false),{camera});writeFileSync(out+'/'+label+'.png',Buffer.from(r.png.split(',')[1],'base64'))}
 writeFileSync(out+'/manifest.json',JSON.stringify({name,url,source,FPS,DURATION,W,H,frames,snapshot:await p.evaluate(()=>__POOLROOMS_V1__.snapshot()),method:'30Hz deterministic replay, not realtime FPS. First-person upward walk at 0.8m/s into central arch, then hold looking at inner arch ceiling. Same seed, waves, actor, exposure and camera.'},null,2));
 }finally{encoder?.stdin.destroy();if(encoder?.exitCode===null)encoder.kill();await browser.close()}
}
