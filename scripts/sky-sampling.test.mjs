import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const shader=readFileSync(new URL('../src/render/water-caustics.wgsl',import.meta.url),'utf8');
const table=[...shader.split('fn skyNet')[0].matchAll(/vec4u\((\d+)u,(\d+)u,(\d+)u,(\d+)u\)/g)].map(m=>m.slice(1).map(Number));
function reverse(v){v=((v>>>1)&0x55555555)|((v&0x55555555)<<1);v=((v>>>2)&0x33333333)|((v&0x33333333)<<2);v=((v>>>4)&0x0f0f0f0f)|((v&0x0f0f0f0f)<<4);v=((v>>>8)&0x00ff00ff)|((v&0x00ff00ff)<<8);return((v>>>16)|(v<<16))>>>0;}
function sample(i,d){let v=0;for(let b=0;i;i>>>=1,b++)if(i&1)v^=table[b][d];v=reverse(v);v^=Math.imul(v,0x3d20adea);const seed=[0x92c9d7ab,0x5e2d58d1,0xa68371e5,0x38f57ac9][d];v=(v+seed)>>>0;v=Math.imul(v,(seed>>>16)|1);v^=Math.imul(v,0x05526c56);v^=Math.imul(v,0x53a22864);return reverse(v)/2**32;}
test('sky net covers every dyadic stratum in each of its four domains',()=>{assert.equal(table.length,32);for(let d=0;d<4;d++)assert.equal(new Set(Array.from({length:1024},(_,i)=>Math.floor(sample(i,d)*1024))).size,1024);});
test('water/aperture projections cover the full area without collapsed correlations',()=>{for(let a=0;a<4;a++)for(let b=a+1;b<4;b++){const bins=new Uint32Array(256);for(let i=0;i<4096;i++)bins[Math.floor(sample(i,a)*16)+16*Math.floor(sample(i,b)*16)]++;assert(Math.min(...bins)>=8);assert(Math.max(...bins)<=24);}});

test('incremental Sobol binary carries preserve the original sample bits',()=>{
 const direct=index=>{const v=[0,0,0,0];for(let bit=0;index;index>>>=1,bit++)if(index&1)for(let d=0;d<4;d++)v[d]=(v[d]^table[bit][d])>>>0;return v;};
 for(const count of [32,128])for(const block of [0,1,17,1023,65535,131071]){
  const net=direct(block*count);
  for(let k=0;k<count;k++){
   assert.deepEqual(net,direct(block*count+k));
   for(let carry=k^(k+1),digit=0;carry;carry>>>=1,digit++)for(let d=0;d<4;d++)net[d]=(net[d]^table[digit][d])>>>0;
  }
 }
});
