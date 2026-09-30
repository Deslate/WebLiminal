import {normalizeLab} from '../src/lab-settings.js';
const labConfig=normalizeLab(JSON.parse(process.env.LAB_CONFIG||'{}'));
import {provenance} from './roam-v149-provenance.mjs';
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';
import {once} from 'node:events';
import {FPS,WIDTH,HEIGHT,DURATION,segments,sample} from './roam-v149-path.mjs';
const root=resolve(process.env.EVIDENCE_DIR||'../workroom-v1.49-evidence/benchmark');
const variants=(process.env.CASES||'current,no-glaze,rotated').split(',');
function sourceHash(){return provenance().sourceHash;}
function replaceOnce(s,a,b){if(!s.includes(a))throw Error('Diagnostic hook missing: '+a);return s.replace(a,b)}
for(const variant of variants){
 const out=resolve(root,variant);if(existsSync(out+'/manifest.json'))throw Error('Refuse to overwrite completed round: '+out);mkdirSync(out,{recursive:true});
 const source=provenance();writeFileSync(out+'/source-snapshot.json',JSON.stringify(source));const initialHash=source.sourceHash,errors=[],frames=[];let encoder;
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
 const page=await browser.newPage({viewport:{width:WIDTH,height:HEIGHT}});page.on('pageerror',e=>errors.push(e.message));await page.routeWebSocket(/.*/,w=>w.close());
 // Test-only hook passes actual stationary/moving state and validates collision.
 await page.route(u=>u.pathname==='/src/main.js',async r=>{let s=await(await r.fetch()).text();s=replaceOnce(s,'camera,capture=true){','camera,capture=true,moving=true){');s=replaceOnce(s,'renderer.render(camera,time,true,1)','renderer.render(camera,time,moving,1)');await r.fulfill({contentType:'text/javascript',body:s})});
 if(!['current','repeat','no-diffuse','static-light','rotated-transfer','dense-transfer','low-transfer','rollback-four','legacy-energy'].includes(variant))await page.route(u=>u.pathname==='/src/render/camera.wgsl',async r=>{
 let s=readFileSync('src/render/camera.wgsl','utf8');
 if(variant==='no-glaze')s=replaceOnce(s,'if(m.coat>.009){','if(false){');
 else if(variant==='rotated')s=replaceOnce(s,'fract(f32(k)*.61803398875)','fract(f32(k)*.61803398875+.125)');
 else if(variant==='dense') {s=replaceOnce(s,'j<8u','j<128u').replace('/16.','/256.').replace('weight/8.','weight/128.');}
 else throw Error('Unknown variant '+variant);
 await r.fulfill({contentType:'text/javascript',body:'export default '+JSON.stringify(s)});
 });
 if(variant==='legacy-energy'){
  // Reproduce the pre-v1.53 implementation without changing the working tree.
  for(const file of ['common.wgsl','camera.wgsl'])await page.route(u=>u.pathname==='/src/render/'+file,r=>{
   let s=readFileSync('src/render/'+file,'utf8');
   if(file==='common.wgsl')s=replaceOnce(s,'if(U.sampling.w==1u || (U.state.z==0. && U.body.z==0.))','if(U.state.z==0. && U.body.z==0.)');
   else s=replaceOnce(s,'if(approximateEnvironment){c+=photons.rgb*m.coat*.08*U.settings.z;}','c+=photons.rgb*m.coat*.08*U.settings.z;');
   return r.fulfill({contentType:'text/javascript',body:'export default '+JSON.stringify(s)});
  });
  await page.route(u=>u.pathname==='/src/render/renderer.js',async r=>{const q=await r.fetch();let s=await q.text();s=replaceOnce(s,'      f.set([wakeEnvelope,config.reflectionCone,quality*quality*(3-2*quality),config.reflectionFilter],44);','');s=replaceOnce(s,'u[43]=1;device.queue.writeBuffer(uniforms,0,data);','f[22]=0;device.queue.writeBuffer(uniforms,0,data);');s=replaceOnce(s,'u[43]=0;f.set(activeWakes,52);','f[22]=config.waveAmplitude;f.set(activeWakes,52);');await r.fulfill({response:q,body:s});});
 }
 if(variant==='rollback-four'){
  await page.route(u=>u.pathname==='/src/render/sky.wgsl',r=>r.fulfill({contentType:'text/javascript',body:'export default '+JSON.stringify(readFileSync('src/render/sky.wgsl','utf8').replaceAll('256','64').replaceAll('16','8'))}));
  await page.route(u=>u.pathname==='/src/render/diffuse-transfer.wgsl',r=>r.fulfill({contentType:'text/javascript',body:'export default '+JSON.stringify(replaceOnce(readFileSync('src/render/diffuse-transfer.wgsl','utf8'),'DIFFUSE_DIRECTIONS:u32=128u','DIFFUSE_DIRECTIONS:u32=32u'))}));
  await page.route(u=>u.pathname==='/src/render/water-caustics.wgsl',r=>r.fulfill({contentType:'text/javascript',body:'export default '+JSON.stringify(readFileSync('src/render/water-caustics.wgsl','utf8').replace('solarDiskDirection(k)','sunDirection()').replace('solarDiskDirection(k+2u)','sunDirection()'))}));
 }
 if(variant==='rotated-transfer')await page.route(u=>u.pathname==='/src/render/diffuse-transfer.wgsl',r=>{const s=replaceOnce(readFileSync('src/render/diffuse-transfer.wgsl','utf8'),'fract(f32(i)*.61803398875)','fract(f32(i)*.61803398875+.125)');return r.fulfill({contentType:'text/javascript',body:'export default '+JSON.stringify(s)})});
 const effectiveLabConfig={...labConfig,...(variant==='dense-transfer'?{diffuseDirections:256}:variant==='low-transfer'?{diffuseDirections:32}:{})};
 if(['no-diffuse','static-light'].includes(variant))await page.route(u=>u.pathname==='/src/render/compose-light.wgsl',r=>{let s=readFileSync('src/render/compose-light.wgsl','utf8');s=replaceOnce(s,'base.rgb+sum/max(weight,.0001)','base.rgb');if(variant==='static-light')s=replaceOnce(s,'+water[idx]','+water[idx]*select(0.,1.,U.settings.w>10.)');return r.fulfill({contentType:'text/javascript',body:'export default '+JSON.stringify(s)})});
 await page.goto(process.env.VERIFY_URL||'http://127.0.0.1:4173');await page.waitForFunction(()=>window.__POOLROOMS_V1__?.snapshot().firstFrameMs,null,{timeout:120000});
 await page.evaluate(async ({actor,variant,labConfig})=>{document.body.classList.add('evidence');await __POOLROOMS_V1__.configure({lab:labConfig,view:actor,seed:7819301,pause:true,freeze:false,scale:labConfig.resolution==='auto'?1:labConfig.resolution,grain:.004,body:true,focalLength:24,photonCount:variant==='rollback-four'?49152:labConfig.photonCount})},{actor:sample(0).actor,variant,labConfig:effectiveLabConfig});
 const count=DURATION*FPS;encoder=spawn(process.env.PYTHON||(process.platform==='win32'?'python':'python3'),['scripts/roam-v149-encode.py',out,String(count),String(WIDTH),String(HEIGHT),String(FPS)],{stdio:['pipe','inherit','inherit']});const finished=once(encoder,'exit');
 const start=Date.now();
 for(let i=0;i<count;i++){
 const t=i/FPS,state=sample(t);const result=await page.evaluate(async({t,state})=>{const a=__POOLROOMS_V1__;const r=await a.renderActorEvidence(t,state.actor,state.camera,true,state.moving);const s=a.snapshot();return {png:r.png,valid:s.validPosition,internal:s.internal,errors:s.errors,waveTime:s.dynamics.waveTime}}, {t,state});
 if(!result.valid)throw Error('Path collides at '+t);if(result.errors.length)throw Error(JSON.stringify(result.errors));
 const png=Buffer.from(result.png.split(',')[1],'base64'),header=Buffer.alloc(4);header.writeUInt32LE(png.length);if(!encoder.stdin.write(Buffer.concat([header,png])))await once(encoder.stdin,'drain');
 frames.push({i,t,...state,internal:result.internal,waveTime:result.waveTime});
 if(i%(FPS*5)===0)console.log(variant,t,state.segment,'wall',((Date.now()-start)/1000).toFixed(1));
 }
 encoder.stdin.end();const [code]=await finished;if(code!==0)throw Error('Encoder failed '+code);
 const snapshot=await page.evaluate(()=>__POOLROOMS_V1__.snapshot());if(sourceHash()!==initialHash)throw Error('Source changed during capture; round invalid');
 writeFileSync(out+'/manifest.json',JSON.stringify({schema:2,variant,labConfig,effectiveLabConfig,sourceHash:initialHash,renderEquivalenceHash:source.renderEquivalenceHash,pathHash:createHash('sha256').update(readFileSync('scripts/roam-v149-path.mjs')).digest('hex'),commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:execFileSync('git',['status','--short'],{encoding:'utf8'}),method:'Deterministic 30Hz simulation replay from reset, NOT realtime FPS. Film grain retained. Narrative light cue bypassed by evidence API. All actor poses collision validated.',fps:FPS,width:WIDTH,height:HEIGHT,duration:DURATION,segments,frames,errors,snapshot},null,2));
 console.log('complete',out);
 }finally{encoder?.stdin.destroy();if(encoder?.exitCode===null)encoder.kill();await browser.close()}
}
