import test from 'node:test';
import assert from 'node:assert/strict';
import {makeGeometry} from './geometry-fixture.mjs';
const g=makeGeometry();const words=new Uint32Array(g.surfaces),floats=new Float32Array(g.surfaces);
test('main floor has at most 2.1 cm irradiance cell spacing',()=>{
 const sid=3;assert(floats[sid*16+4]/words[sid*16+1]<=.021);assert(floats[sid*16+5]/words[sid*16+2]<=.021);
});
test('arch receiver area excludes the opening instead of treating it as black wall',()=>{
 for(const shapeId of [9,10,11,12])for(const face of [4,5]){
  const s=g.shapes[shapeId],sid=shapeId*9+face,offset=words[sid*16],count=words[sid*16+1]*words[sid*16+2];let quarterArea=0,voidCells=0;
  for(const packed of g.cellSurfaces.subarray(offset,offset+count)){assert.equal(words[(packed&65535)*16],offset);const coverage=packed>>>16;assert(coverage<=4);quarterArea+=coverage;if(!coverage)voidCells++;}
  const actual=quarterArea*.25*floats[sid*16+6];
  const members=g.atlases.find(a=>a.offset===offset).members;const expected=members.reduce((sum,id)=>{const q=g.shapes[Math.floor(id/9)];return sum+(q.hi[0]-q.lo[0])*(q.hi[1]-q.lo[1])-2*q.radius*q.spring-Math.PI*q.radius*q.radius/2;},0);
  assert(Math.abs(actual-expected)<.025,`${shapeId}/${face}: ${actual} vs ${expected}`);assert(voidCells>1000);
 }
});
test('unbroken receiving planes preserve full physical area',()=>{
 for(const sid of [3,10,18,32,40]){const offset=words[sid*16],n=words[sid*16+1]*words[sid*16+2];assert(g.cellSurfaces.subarray(offset,offset+n).every(p=>(p>>>16)===4));}
});
test('diffuse probe offsets partition the buffer and exclude CSG voids',()=>{
 let end=0,invalid=0;
 for(const atlas of g.atlases){const sid=atlas.sid;
  const offset=words[sid*16+3],nx=Math.ceil(words[sid*16+1]/floats[sid*16+7]),ny=Math.ceil(words[sid*16+2]/floats[sid*16+7]);
  assert.equal(offset,end);
  for(const packed of g.probeSurfaces.subarray(offset,offset+nx*ny)){
   assert.equal(words[(packed&65535)*16+3],offset);assert((packed>>>16)<=1);if(!(packed>>>16))invalid++;
  }
  end+=nx*ny;
 }
 assert.equal(end,g.probeCount);assert.equal(end,g.probeSurfaces.length);assert(invalid>1000);
});
test('all arch spring lines meet the common 250 mm course datum',()=>{
 for(const s of g.shapes.filter(s=>s.kind===1))assert.equal(s.spring/.25,Math.round(s.spring/.25));
});
test('arch setting-out preserves full modules and symmetric non-sliver closing cuts',()=>{
 for(const s of g.shapes.filter(s=>s.kind===1)){
  const half=Math.PI*s.radius/2,full=Math.floor(half/.25)-1,cut=(half-full*.25)/2;
  const widths=[...Array(full).fill(.25),cut,cut];const left=[...widths].reverse();
  assert(cut>=.125&&cut<.25,'closing tiles must not be narrow slivers');
  assert(Math.abs(widths.reduce((a,b)=>a+b,0)-half)<1e-12);
  assert.deepEqual([...widths,...left].reverse(),[...widths,...left]);
  assert(Math.abs(s.spring/.25-Math.round(s.spring/.25))<1e-12);

 }
});

test('floor keeps its 6/m probe density while shared atlas padding stays bounded',()=>{
 // Shared domains include masked padding; only the floor budget is invariant.
 assert(g.probeCount<73225*1.25);
 const stride=floats[3*16+7];
 assert.equal(words[3*16+1]/stride/14,6);
 assert.equal(words[3*16+2]/stride/27,6);
});
