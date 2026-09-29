import{execFileSync}from'node:child_process';import{writeFileSync}from'node:fs';
export async function recordBackground(root){
 execFileSync(process.execPath,['scripts/pause-project-v157.mjs'],{env:{...process.env,EVIDENCE_DIR:root}});
 const samples=[];for(let i=0;i<3;i++){await new Promise(r=>setTimeout(r,700));const raw=execFileSync('ioreg',['-r','-c','AGXAccelerator','-l'],{encoding:'utf8'});samples.push({at:new Date().toISOString(),deviceUtilization:Number(raw.match(/"Device Utilization %"=(\d+)/)?.[1]),rendererUtilization:Number(raw.match(/"Renderer Utilization %"=(\d+)/)?.[1]),gameGpuClient:raw.split('\n').filter(s=>s.includes('IOUserClientCreator')&&s.includes('Civ6'))});}
 const processes=execFileSync('ps',['-axo','pid,ppid,%cpu,comm'],{encoding:'utf8'}).split('\n').filter(s=>/Civ6|WindowServer/.test(s));writeFileSync(root+'/background-gpu.json',JSON.stringify({method:'Other project previews paused; no benchmark browser open. Aggregate device load is not per-process attribution.',samples,processes},null,2));
}
