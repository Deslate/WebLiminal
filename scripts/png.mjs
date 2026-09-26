import {readFileSync,writeFileSync} from 'node:fs';
import {inflateSync,deflateSync} from 'node:zlib';
export function png(file){
 const b=readFileSync(file);let offset=8,width,height,channels;const chunks=[];
 while(offset<b.length){const n=b.readUInt32BE(offset),type=b.toString('ascii',offset+4,offset+8),body=b.subarray(offset+8,offset+8+n);if(type==='IHDR'){width=body.readUInt32BE(0);height=body.readUInt32BE(4);if(body[8]!==8||![2,6].includes(body[9]))throw Error('Expected RGB/RGBA8 PNG');channels=body[9]===6?4:3;}if(type==='IDAT')chunks.push(body);offset+=n+12;}
 const raw=inflateSync(Buffer.concat(chunks)),stride=width*channels,pixels=new Uint8Array(width*height*channels);
 const paeth=(a,b,c)=>{let p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<height;y++){let filter=raw[y*(stride+1)];for(let x=0;x<stride;x++){let i=y*stride+x,a=x>=channels?pixels[i-channels]:0,c=y&&x>=channels?pixels[i-stride-channels]:0,up=y?pixels[i-stride]:0;let predictor=[0,a,up,Math.floor((a+up)/2),paeth(a,up,c)][filter];pixels[i]=(raw[y*(stride+1)+1+x]+predictor)&255;}}
 return {width,height,channels,pixels};
}
export function writePng(file,width,height,pixels) {
 const crc=b=>{let c=0xffffffff;for(const v of b){c^=v;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
 const chunk=(type,data)=>{const t=Buffer.from(type);const o=Buffer.alloc(data.length+12);o.writeUInt32BE(data.length);t.copy(o,4);data.copy(o,8);o.writeUInt32BE(crc(Buffer.concat([t,data])),data.length+8);return o;};
 const hdr=Buffer.alloc(13);hdr.writeUInt32BE(width);hdr.writeUInt32BE(height,4);hdr[8]=8;hdr[9]=2;
 const raw=Buffer.alloc(height*(1+width*3));for(let y=0;y<height;y++)Buffer.from(pixels.buffer,pixels.byteOffset+y*width*3,width*3).copy(raw,y*(1+width*3)+1);
 writeFileSync(file,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',hdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));
}
