// Replay the accepted v1.27 sequences and compare every encoded PNG byte.
// Identical decoded pixels follow from identical PNGs; no regenerated metrics can drift.
import{readFileSync,writeFileSync,unlinkSync}from'node:fs';
let s=readFileSync('scripts/record-v127.mjs','utf8');s=s.replace("mkdirSync,writeFileSync","mkdirSync,writeFileSync,readFileSync");
s=s.replace("writeFileSync(out+'/frames/frame-'+String(i).padStart(4,'0')+'.png',Buffer.from(r.png.split(',')[1],'base64'));", "const png=Buffer.from(r.png.split(',')[1],'base64');const old=readFileSync('../workroom-v1.27-evidence/appearance/'+version+'-'+name+'/frames/frame-'+String(i).padStart(4,'0')+'.png');assert.equal(png.compare(old),0,'PNG mismatch '+name+' frame '+i);");
s=s.replace("purpose:'Above-water appearance only, not floor irradiance diagnosis'", "purpose:'Byte-identical replay against v1.27 accepted sequence',allPNGsIdentical:true");
process.env.EVIDENCE_DIR='../workroom-v1.29-evidence/identity';const path=new URL('./.identity-v129-run.mjs',import.meta.url);writeFileSync(path,s);try{await import(path.href)}finally{unlinkSync(path)}
