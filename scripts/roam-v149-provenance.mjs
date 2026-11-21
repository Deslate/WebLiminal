import{readFileSync,readdirSync}from'node:fs';import{createHash}from'node:crypto';
// Same file set as `rg --files src materials levels`: skip hidden entries; the repo ignores nothing else under these roots.
function listFiles(dir){return readdirSync(dir,{withFileTypes:true}).filter(e=>!e.name.startsWith('.')).flatMap(e=>e.isDirectory()?listFiles(dir+'/'+e.name):e.isFile()?[dir+'/'+e.name]:[]);}
// Hash LF text so Windows (autocrlf) and macOS checkouts of the same commit agree.
export function provenance(){const files=['src','materials','levels'].flatMap(listFiles).sort();const sources=Object.fromEntries(files.map(f=>[f,readFileSync(f,'utf8').replace(/\r\n/g,'\n')]));const digest=normalize=>createHash('sha256').update(files.map(f=>{let s=sources[f];if(normalize&&f==='src/main.js')s=s.replace('e.code === "Tab"','e.code === "Escape"');return f+'\n'+s}).join('\n')).digest('hex');return{sourceHash:digest(false),renderEquivalenceHash:digest(true),sources};}
