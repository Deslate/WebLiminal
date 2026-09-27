// Remeasure historical/current solar receiver buffers, never screen images.
import{readFileSync,writeFileSync,unlinkSync}from'node:fs';
let s=readFileSync('scripts/compare-v123.mjs','utf8');
s=s.replace('`${out}/${name}.png`','`${out}/${name}-top-appearance.png`');
s=s.replace("['renderer.js','solar-atlas.wgsl','camera.wgsl']","['renderer.js','solar-atlas.wgsl','camera.wgsl','common.wgsl']");
s=s.replace("let s=process.env.WORKING?readFileSync('src/render/'+file,'utf8'):execFileSync('git',['show','ca09c32:src/render/'+file],{encoding:'utf8'});", "let s=name==='v125'?readFileSync('src/render/'+file,'utf8'):execFileSync('git',['show',(name==='v122'?'ca09c32':'8ce969c')+':src/render/'+file],{encoding:'utf8'});");
s=s.replace('const base=process.env.WORKING?640:384;','const base=name===\'v122\'?384:640;');
s=s.replace("console.log(name,a.solar);",`console.log(name,a.solar);
const viewNormal={x:2,y:1.62,z:3,yaw:0,pitch:-1.12};const normal=await p.evaluate(view=>window.__POOLROOMS_V1__.renderEvidence(6,view,false,true),viewNormal);writeFileSync(out+'/'+name+'-appearance.png',Buffer.from(normal.png.split(',')[1],'base64'));
const room=await p.evaluate(view=>window.__POOLROOMS_V1__.renderEvidence(6,view,false,true),{x:3.5,y:1.62,z:5,yaw:0,pitch:-.18});writeFileSync(out+'/'+name+'-room-appearance.png',Buffer.from(room.png.split(',')[1],'base64'));
`);
process.env.EVIDENCE_DIR ||= '../workroom-v1.25-evidence/irradiance';
process.env.CASES ||= '[["v122",384,2048],["v123",640,2048],["v125",640,2048]]';
const path=new URL('./.compare-v125-run.mjs',import.meta.url);writeFileSync(path,s);try{await import(path.href)}finally{unlinkSync(path)}
