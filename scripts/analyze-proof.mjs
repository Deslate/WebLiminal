// Reads exported PNG pixels without image libraries; does not alter any image.
import {readFileSync,writeFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
import {resolve} from 'node:path';
const dir=process.env.EVIDENCE_DIR||resolve('../workroom-v1-evidence/final');
function png(file){
 const b=readFileSync(file);let offset=8,width,height,channels;const chunks=[];
 while(offset<b.length){const n=b.readUInt32BE(offset),type=b.toString('ascii',offset+4,offset+8),body=b.subarray(offset+8,offset+8+n);if(type==='IHDR'){width=body.readUInt32BE(0);height=body.readUInt32BE(4);if(body[8]!==8||![2,6].includes(body[9]))throw Error('Expected RGB/RGBA8 PNG');channels=body[9]===6?4:3;}if(type==='IDAT')chunks.push(body);offset+=n+12;}
 const raw=inflateSync(Buffer.concat(chunks)),stride=width*channels,pixels=new Uint8Array(width*height*channels);
 const paeth=(a,b,c)=>{let p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<height;y++){let filter=raw[y*(stride+1)];for(let x=0;x<stride;x++){let i=y*stride+x,a=x>=channels?pixels[i-channels]:0,c=y&&x>=channels?pixels[i-stride-channels]:0,up=y?pixels[i-stride]:0;let predictor=[0,a,up,Math.floor((a+up)/2),paeth(a,up,c)][filter];pixels[i]=(raw[y*(stride+1)+1+x]+predictor)&255;}}
 return {width,height,channels,pixels};
}
const base=JSON.parse(readFileSync(`${dir}/01-original.json`));const water=JSON.parse(readFileSync(`${dir}/02-water-level.json`));
const key=r=>[...r.source,...r.incident].map(v=>v.toFixed(5)).join(',');
const a=new Map(base.optics.records.filter(r=>r.branch==='reflection').map(r=>[key(r),r]));let shift=[];
for(const r of water.optics.records){const other=a.get(key(r));if(r.branch!=='reflection'||!other||r.receiver[1]<1||other.receiver[1]<1)continue;shift.push(Math.hypot(...r.receiver.map((v,i)=>v-other.receiver[i])));}
const image=png(`${dir}/01-original.png`),differences={};
for(const name of ['02-water-level','03-skylight-opening','04-flat-wave-control','05-restored-original']){
 const other=png(`${dir}/${name}.png`);let total=0,wall=0;
 for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)for(let c=0;c<3;c++){const d=Math.abs(image.pixels[(y*image.width+x)*image.channels+c]-other.pixels[(y*other.width+x)*other.channels+c]);total+=d;if(y>=100&&y<580)wall+=d;}
 differences[name]={wholeImageMeanAbsoluteRGBDifference:total/(image.width*image.height*3),aboveWaterWallMeanAbsoluteRGBDifference:wall/(image.width*480*3),identicalPixelsEverywhere:total===0};
}
const report={pairedReflectedPaths:shift.length,meanReceiverShiftMetres:shift.reduce((a,b)=>a+b,0)/shift.length,maxReceiverShiftMetres:Math.max(...shift),imageDifferences:differences};
writeFileSync(`${dir}/difference-analysis.json`,JSON.stringify(report,null,2));
writeFileSync('docs/v1-proof-summary.json',JSON.stringify({manifest:JSON.parse(readFileSync(`${dir}/manifest.json`)),difference:report},null,2));
console.log(JSON.stringify(report,null,2));
