import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {png,writePng} from './png.mjs';
const dir=process.env.EVIDENCE_DIR||'/Users/steven/Projects/workroom-v1.1-evidence/motion';
const manifest=JSON.parse(readFileSync(`${dir}/manifest.json`));const frames=manifest.records.filter(r=>r.file);const sheets=`${dir}/contact-sheets`;mkdirSync(sheets,{recursive:true});
const results=[];
for(let i=0;i<frames.length;i+=4){
 const group=frames.slice(i,i+4),images=group.map(r=>png(`${dir}/${r.file}`));
 const width=images[0].width,height=images[0].height,sheet=new Uint8Array(width*height*4*3);
 images.forEach((im,k)=>{
  const lum=new Float32Array(width*height);for(let p=0;p<lum.length;p++)lum[p]=.2126*im.pixels[p*im.channels]+.7152*im.pixels[p*im.channels+1]+.0722*im.pixels[p*im.channels+2];
  let isolated=0,darkPixels=0;
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
   const idx=y*width+x;if(lum[idx]<80)darkPixels++;
   if(lum[idx]<75)continue;let max=0,avg=0;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const l=lum[idx+dy*width+dx];max=Math.max(l,max);avg+=l/8;}
   if(avg<50&&lum[idx]>max+25)isolated++;
  }
  results.push({file:group[k].file,isolatedBrightPixels:isolated,darkPixelFraction:darkPixels/lum.length});
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<3;c++)sheet[((y+Math.floor(k/2)*height)*width*2+x+(k%2)*width)*3+c]=im.pixels[(y*width+x)*im.channels+c];
 });
 writePng(`${sheets}/${String(i/4).padStart(2,'0')}.png`,width*2,height*2,sheet);
}
const scenarios=[...new Set(frames.map(r=>r.scenario))].map(s=>{const a=frames.filter(r=>r.scenario===s);const intervals=a.slice(1).map((x,i)=>(x.capturedAtMs??x.metadata.timestamp*1000)-(a[i].capturedAtMs??a[i].metadata.timestamp*1000));return {name:s,count:a.length,averageCaptureIntervalMs:intervals.reduce((a,b)=>a+b,0)/intervals.length,stopHashesIdentical:manifest.records.some(r=>r.scenario===s&&r.stopping)?new Set((manifest.records.find(r=>r.scenario===s&&r.stopping)?.stopping||[]).map(s=>s.sha256)).size===1:null,lightingBatches:[...new Set(a.map(x=>x.snapshot?.lightingBatches))],resolutions:[...new Set(a.map(x=>x.snapshot?.internal.join('x')))]};});
const report={date:new Date().toISOString(),firstFrameMs:manifest.firstFrameMs,totalMotionFrames:frames.length,scenarios,isolatedPixelDefinition:'Luminance >=75/255, 8-neighbour average <50/255, centre > brightest neighbour +25/255. A heuristic for isolated one-pixel fireflies, NOT a general perceptual proof.',maximumIsolatedBrightPixels:Math.max(...results.map(x=>x.isolatedBrightPixels)),perFrame:results};
writeFileSync(`${dir}/analysis.json`,JSON.stringify(report,null,2));writeFileSync(manifest.firstFrameMs?'docs/v1.1-motion.json':'docs/v1.1-consecutive.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,perFrame:undefined},null,2));
