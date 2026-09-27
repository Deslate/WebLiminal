import{readFileSync,writeFileSync,unlinkSync}from'node:fs';
let s=readFileSync('scripts/compare-v123.mjs','utf8');
s=s.replace('`${out}/${name}.png`','`${out}/${name}-top-appearance.png`');
s=s.replace('console.log(name,a.solar);',`console.log(name,a.solar);const room=await p.evaluate(view=>window.__POOLROOMS_V1__.renderEvidence(6,view,false,true),{x:3.5,y:1.62,z:5,yaw:0,pitch:-.18});writeFileSync(out+'/'+name+'-room-appearance.png',Buffer.from(room.png.split(',')[1],'base64'));`);
process.env.WORKING='1';process.env.EVIDENCE_DIR ||= '../workroom-v1.27-evidence/irradiance';process.env.CASES ||= '[["final",640,2048]]';
const path=new URL('./.compare-v127-run.mjs',import.meta.url);writeFileSync(path,s);try{await import(path.href)}finally{unlinkSync(path)}
