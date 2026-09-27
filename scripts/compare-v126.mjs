import{readFileSync,writeFileSync,unlinkSync}from'node:fs';
let s=readFileSync('scripts/compare-v123.mjs','utf8');
s=s.replace("readFileSync('src/render/'+file,'utf8')","execFileSync('git',['show','368919e:src/render/'+file],{encoding:'utf8'})");
s=s.replace('`${out}/${name}.png`','`${out}/${name}-top-appearance.png`');
s=s.replace('for(const file of',`await p.route(u=>u.pathname==='/src/render/short-waves.js',route=>{let code=name==='final'?execFileSync('git',['show','368919e:src/render/short-waves.js'],{encoding:'utf8'}):execFileSync('git',['show','fb40d2e:src/render/short-waves.js'],{encoding:'utf8'});if(name==='trial050')code=code.replace('SHORT_WAVE_AMPLITUDE = 0.00015','SHORT_WAVE_AMPLITUDE = 0.0005').replace('omega * time * waveSpeed','omega * time * waveSpeed * 0.1');return route.fulfill({contentType:'text/javascript',body:code});});\nfor(const file of`);
s=s.replace('console.log(name,a.solar);',`console.log(name,a.solar);const room=await p.evaluate(view=>window.__POOLROOMS_V1__.renderEvidence(6,view,false,true),{x:3.5,y:1.62,z:5,yaw:0,pitch:-.18});writeFileSync(out+'/'+name+'-room-appearance.png',Buffer.from(room.png.split(',')[1],'base64'));`);
process.env.WORKING='1';process.env.EVIDENCE_DIR ||= '../workroom-v1.26-evidence/irradiance';process.env.CASES ||= '[["baseline",640,2048],["trial050",640,2048],["final",640,2048]]';
const path=new URL('./.compare-v126-run.mjs',import.meta.url);writeFileSync(path,s);try{await import(path.href)}finally{unlinkSync(path)}
