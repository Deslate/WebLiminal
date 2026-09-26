import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// Load the production geometry generator with the same JSON data. The data URL
// replaces only Vite's JSON import, allowing this regression test in plain Node.
const level=JSON.parse(readFileSync(new URL('../levels/poolrooms.json',import.meta.url)));
const source=readFileSync(new URL('../src/render/geometry.js',import.meta.url),'utf8').replace('import level from "../../levels/poolrooms.json";',`const level=${JSON.stringify(level)};`);
const {makeGeometry}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const g=makeGeometry();const words=new Uint32Array(g.surfaces),floats=new Float32Array(g.surfaces);
test('main floor has at most 4.2 cm irradiance cell spacing',()=>{
 const sid=3;assert(floats[sid*8+4]/words[sid*8+1]<=.042);assert(floats[sid*8+5]/words[sid*8+2]<=.042);
});
test('arch receiver area excludes the opening instead of treating it as black wall',()=>{
 for(const shapeId of [9,10,11,12])for(const face of [4,5]){
  const s=g.shapes[shapeId],sid=shapeId*9+face,offset=words[sid*8],count=words[sid*8+1]*words[sid*8+2];let quarterArea=0,voidCells=0;
  for(const packed of g.cellSurfaces.subarray(offset,offset+count)){assert.equal(packed&65535,sid);const coverage=packed>>>16;assert(coverage<=4);quarterArea+=coverage;if(!coverage)voidCells++;}
  const actual=quarterArea*.25*floats[sid*8+6];
  const expected=(s.hi[0]-s.lo[0])*(s.hi[1]-s.lo[1])-2*s.radius*s.spring-Math.PI*s.radius*s.radius/2;
  assert(Math.abs(actual-expected)<.025,`${shapeId}/${face}: ${actual} vs ${expected}`);assert(voidCells>1000);
 }
});
test('unbroken receiving planes preserve full physical area',()=>{
 for(const sid of [3,10,18,32,40]){const offset=words[sid*8],n=words[sid*8+1]*words[sid*8+2];assert(g.cellSurfaces.subarray(offset,offset+n).every(p=>(p>>>16)===4));}
});
test('diffuse probe offsets partition the buffer and exclude CSG voids',()=>{
 let end=0,invalid=0;
 for(let sid=0;sid<g.surfaceCount;sid++){
  const offset=words[sid*8+3],nx=Math.ceil(words[sid*8+1]/4),ny=Math.ceil(words[sid*8+2]/4);
  assert.equal(offset,end);
  for(const packed of g.probeSurfaces.subarray(offset,offset+nx*ny)){
   assert.equal(packed&65535,sid);assert((packed>>>16)<=1);if(!(packed>>>16))invalid++;
  }
  end+=nx*ny;
 }
 assert.equal(end,g.probeCount);assert.equal(end,g.probeSurfaces.length);assert(invalid>1000);
});
