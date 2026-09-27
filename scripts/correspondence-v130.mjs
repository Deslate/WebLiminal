import{execFileSync}from'node:child_process';
import{chromium}from'@playwright/test';import{readFileSync,writeFileSync,mkdirSync}from'node:fs';
const root=process.env.EVIDENCE_DIR||'../workroom-v1.30-evidence';
const variants=JSON.parse(process.env.VARIANTS||'[{"name":"before","amplitude":0.00022,"wavelength":0.06},{"name":"medium","amplitude":0.002,"wavelength":0.18},{"name":"visible","amplitude":0.006,"wavelength":0.24}]');
for(const v of variants){const out=root+'/'+v.name;mkdirSync(out,{recursive:true});const b=await chromium.launch({channel:'chrome',headless:true});try{const p=await b.newPage({viewport:{width:1024,height:1024}});p.on('pageerror',e=>console.error(e.message));
await p.route(u=>u.pathname==='/src/render/renderer.js',r=>{let s=readFileSync('src/render/renderer.js','utf8');s=s.replace('rb.unmap();rb.destroy();\n      const beamSize=',`{solar.patches=[];const norm=Math.hypot(.66,.69,.295),rx=.66/norm/1.333,rz=-.295/norm/1.333,ry=-Math.sqrt(1-rx*rx-rz*rz);const lo=[-2.1-config.apertureWidth/2+.66/.69*(6.101-config.waterLevel)-rx*config.waterLevel/ry-.8,1.3-config.apertureDepth/2-.295/.69*(6.101-config.waterLevel)-rz*config.waterLevel/ry-.8];for(const width of [2,.5]){const values=[];for(let y=0;y<512;y++)for(let x=0;x<512;x++){const px=(3.5+(x/511-.5)*width-lo[0])/dx-.5,pz=(-1+(y/511-.5)*width-lo[1])/dz-.5;const bx=Math.floor(px),bz=Math.floor(pz),fx=px-bx,fz=pz-bz;let l=0;for(let j=0;j<2;j++)for(let k=0;k<2;k++){const i=(Math.max(0,Math.min(2047,bz+j))*2048+Math.max(0,Math.min(2047,bx+k)))*4;l+=(half(a[i])*.2126+half(a[i+1])*.7152+half(a[i+2])*.0722)*(k?fx:1-fx)*(j?fz:1-fz);}values.push(l);}solar.patches.push({width,values});}}rb.unmap();rb.destroy();\n      const beamSize=`);
s=s.replace('size:geometry.totalCells*16,usage:GPUBufferUsage.STORAGE});','size:geometry.totalCells*16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});');s=s.replace('options.combined?buffers.combined:buffers.liveField','options.cached?buffers.fine0:options.combined?buffers.combined:buffers.liveField');s=s.replace('    configure,','    configure,\n    setEvidenceLens(p){config.focalLength=p.focalLength;config.exposure=p.exposure;},');return r.fulfill({contentType:'text/javascript',body:s})});
if(!v.production)await p.route(u=>u.pathname==='/src/render/short-waves.js',r=>r.fulfill({contentType:'text/javascript',body:execFileSync('git',['show','d42d844:src/render/short-waves.js'],{encoding:'utf8'}).replace('= 0.00022;',`= ${v.amplitude};`).replace('wavelength: .06 *',`wavelength: ${v.wavelength} *`).replace('= 0.03;',`= ${v.timeScale??.03};`)}));
if(!v.production)await p.route(u=>u.pathname==='/src/render/wave-simulation.js',r=>r.fulfill({contentType:'text/javascript',body:execFileSync('git',['show','d42d844:src/render/wave-simulation.js'],{encoding:'utf8'}).replace('config={...c};',`config={...c,waveAmplitude:c.waveAmplitude*${v.background??1}};`)}));
await p.route(u=>u.pathname==='/src/main.js',r=>r.fulfill({contentType:'text/javascript',body:readFileSync('src/main.js','utf8').replace('snapshot: () => ({','setEvidenceLens: p=>renderer.setEvidenceLens(p),\n    snapshot: () => ({')}));
await p.goto('http://127.0.0.1:4173');await p.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs);
const under={x:3.5,y:.35,z:-1,yaw:0,pitch:-Math.PI/2},above={x:3.5,y:1.62,z:2.6,yaw:0,pitch:-.5};
await p.evaluate(async({under,v})=>window.__POOLROOMS_V1__.configure({view:under,body:false,pause:true,freeze:false,grain:0,scale:1,focalLength:14,exposure:.15,...v.config}),{under,v});
for(let i=0;i<=180;i++){const t=i/30;await p.evaluate(t=>window.__POOLROOMS_V1__.renderEvidence(t,{},false,false),t);}
for(const [name,pose,lens]of[['under',under,{focalLength:4.2,exposure:.08}],['above',above,{focalLength:14,exposure:.15}],['reflection',{x:4.36,y:1.62,z:-1.34,yaw:1.958,pitch:-.778},{focalLength:20,exposure:.15}],['production',above,{focalLength:14,exposure:.85}]]){await p.evaluate(lens=>window.__POOLROOMS_V1__.setEvidenceLens(lens),lens);const r=await p.evaluate(pose=>window.__POOLROOMS_V1__.renderEvidence(6,pose,false,true),pose);writeFileSync(`${out}/${name}-6.png`,Buffer.from(r.png.split(',')[1],'base64'));}
const a=await p.evaluate(()=>window.__POOLROOMS_V1__.audit({solar:true,simulation:true}));if(a.errors.length)throw Error(a.errors[0]);delete a.paths;for(const patch of a.solar.patches){writeFileSync(`${out}/solar-${patch.width}-6.f32`,Buffer.from(new Float32Array(patch.values).buffer));delete patch.values;}writeFileSync(out+'/wave-6.f32',Buffer.from(new Float32Array(a.simulation.values).buffer));delete a.simulation.values;writeFileSync(out+'/state-6.json',JSON.stringify({variant:v,...a}));console.log(v.name);
if(process.env.RECORD==='1'){
 mkdirSync(out+'/surface',{recursive:true});mkdirSync(out+'/floor',{recursive:true});
 const surface={x:4.36,y:1.62,z:-1.34,yaw:1.958,pitch:-.778};
 for(let i=180;i<=540;i++){
  const t=i/30;
  for(const [name,pose,lens]of[['surface',surface,{focalLength:20,exposure:.15}],['floor',under,{focalLength:4.2,exposure:.08}]]){
   await p.evaluate(lens=>window.__POOLROOMS_V1__.setEvidenceLens(lens),lens);
   const f=await p.evaluate(({t,pose})=>window.__POOLROOMS_V1__.renderEvidence(t,pose,false,true),{t,pose});writeFileSync(`${out}/${name}/${String(i-180).padStart(4,'0')}.png`,Buffer.from(f.png.split(',')[1],'base64'));
  }
  if(i%90===0)console.log(v.name,'record',t);
 }
 const state=await p.evaluate(()=>window.__POOLROOMS_V1__.snapshot());writeFileSync(out+'/record-state.json',JSON.stringify({method:'Same physical time, two real camera rays; lens/exposure only changes, no simulation reset. 30Hz replay t6..18.',...state}));if(state.errors.length)throw Error(state.errors[0]);
}

}finally{await b.close()}}
