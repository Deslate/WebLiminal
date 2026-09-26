import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {png,writePng} from './png.mjs';
const dir=process.env.EVIDENCE_DIR||'/Users/steven/Projects/workroom-v1.3-evidence/final';
const manifest=JSON.parse(readFileSync(`${dir}/capture.json`));mkdirSync(`${dir}/sheets`,{recursive:true});
const luminance=im=>{const a=new Float32Array(im.width*im.height);for(let i=0;i<a.length;i++)a[i]=.2126*im.pixels[i*im.channels]+.7152*im.pixels[i*im.channels+1]+.0722*im.pixels[i*im.channels+2];return a;};
const regions={whole:[0,0,1512,982],ceiling:[580,28,850,130],darkWall:[130,320,310,270],floor:[60,780,640,150]};
function difference(a,b,roi){let sum=0,sq=0,max=0,n=0;const [x,y,w,h]=roi;for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++){let d=Math.abs(a[j*1512+i]-b[j*1512+i]);sum+=d;sq+=d*d;max=Math.max(max,d);n++;}return {mae:sum/n,rmse:Math.sqrt(sq/n),max};}
const comparisons=[];const refPath='/Users/steven/Projects/workroom-v1.3-evidence/reference/256-batches.png';
const ref=existsSync(refPath)?luminance(png(refPath)):null;
for(const p of manifest.pairs){const a=luminance(png(`${dir}/${p.moving.file}`)),b=luminance(png(`${dir}/${p.stopped.file}`));const r={name:p.name,qualityAfterSeconds:p.transition.find(x=>x.quality===1)?.time-p.moving.time,regions:{}};for(const [name,roi] of Object.entries(regions)){r.regions[name]={change:difference(a,b,roi)};if(ref&&p.name==='spawn'){r.regions[name].movingErrorToReference=difference(a,ref,roi);r.regions[name].stoppedErrorToReference=difference(b,ref,roi);}}comparisons.push(r);}
let previous=luminance(png(`${dir}/spawn-moving-equal-budget.png`));const transition=[];
for(let i=1;i<=30;i++){const cur=luminance(png(`${dir}/stop-${String(i).padStart(3,'0')}.png`));transition.push({frame:i,...difference(previous,cur,regions.whole)});previous=cur;}
let sheet,prev=null;const perFrame=[];
for(let i=0;i<manifest.frames.length;i++){
 const f=manifest.frames[i],im=png(`${dir}/${f.file}`),lum=luminance(im);let isolated=0,darkPixels=0;
 for(let y=1;y<im.height-1;y++)for(let x=1;x<im.width-1;x++){
  const idx=y*im.width+x;if(lum[idx]<80)darkPixels++;if(lum[idx]<75)continue;let max=0,avg=0;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const v=lum[idx+dy*im.width+dx];max=Math.max(max,v);avg+=v/8;}
  if(avg<50&&lum[idx]>max+25)isolated++;
 }
 const record={frame:i,isolatedBrightPixels:isolated,darkPixelFraction:darkPixels/lum.length,quality:f.quality,cacheSamples:f.cacheSamples};
 if(prev && ((i>120&&i<180)||(i>270))){record.stationaryWallDelta=difference(prev,lum,regions.darkWall).mae;record.stationaryWaterDelta=difference(prev,lum,regions.floor).mae;}
 perFrame.push(record);prev=lum;
 if(i%12===0)sheet=new Uint8Array(1512*1308*3);
 const col=(i%12)%3,row=Math.floor((i%12)/3);
 for(let y=0;y<327;y++)for(let x=0;x<504;x++)for(let c=0;c<3;c++)sheet[((row*327+y)*1512+col*504+x)*3+c]=im.pixels[((y*3)*im.width+x*3)*im.channels+c];
 if(i%12===11||i===manifest.frames.length-1)writePng(`${dir}/sheets/${String(Math.floor(i/12)).padStart(2,'0')}.png`,1512,1308,sheet);
}
const report={date:new Date().toISOString(),units:'Display luminance, 0..255. Images are not exposure-normalized.',comparisons,transition,sequence:{frames:perFrame.length,duration:perFrame.length/30,maximumIsolatedBrightPixels:Math.max(...perFrame.map(f=>f.isolatedBrightPixels)),cacheLateFrames:manifest.frames.at(-1).cacheLateFrames,perFrame},limits:'The isolated-pixel heuristic detects single-pixel fireflies, not all flicker or structured photon variance. The reference uses the same biased finite kernel with 256 batches, not unbiased ground truth. Controlled pairs hold water phase and compare production budgets of 32 moving / 128 stopped batches. Separate equal-budget frames isolate spatial integration and transition continuity. The dynamic sequence uses normal adaptive 32/128 batches.'};
writeFileSync(`${dir}/analysis.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,transition:undefined,sequence:{...report.sequence,perFrame:undefined}},null,2));
