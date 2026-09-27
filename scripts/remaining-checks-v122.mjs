import {spawnSync} from 'node:child_process';import{mkdirSync,writeFileSync}from'node:fs';
const root=process.env.EVIDENCE_DIR||'../workroom-v1.22-evidence/checks';mkdirSync(root,{recursive:true});const report=[];
for(const[name,script]of [['simulation','simulation-v114.mjs'],['body','simulation-v116.mjs'],['body-coupling','coupling-v115.mjs'],['record','record-v116.mjs'],['calm-spectra','simulation-v122.mjs']]){
 const out=`${root}/${name}`;mkdirSync(out,{recursive:true});const start=Date.now();const r=spawnSync(process.execPath,[`scripts/${script}`],{env:{...process.env,EVIDENCE_DIR:out},encoding:'utf8',timeout:300000});writeFileSync(`${root}/${name}.log`,(r.stdout||'')+(r.stderr||''));report.push({name,status:r.status,seconds:(Date.now()-start)/1000,error:r.error?.message});writeFileSync(`${root}/checks.json`,JSON.stringify(report,null,2));console.log(report.at(-1));
}
