import test from 'node:test';import assert from 'node:assert/strict';import {buildLightAtlases} from '../src/render/light-atlas.js';import {makeGeometry} from './geometry-fixture.mjs';
const box=(lo,hi)=>({lo,hi,kind:0,material:0,radius:0,spring:0});
test('unequal rectangles and T junctions use one coordinate system independent of shape order',()=>{
 const a=[box([0,0,0],[2,1,4]),box([2,0,0],[5,1,1]),box([2,0,1],[5,1,4])];
 for(const shapes of [a,[a[2],a[0],a[1]]]){const g=buildLightAtlases(shapes),u=new Uint32Array(g.surfaces),f=new Float32Array(g.surfaces);for(const face of [2,3]){const offset=u[face*16];for(let i=0;i<3;i++){const n=(i*9+face)*16;assert.equal(u[n],offset);assert.deepEqual(Array.from(f.slice(n+8,n+12)),[0,0,5,4]);}}}
});
test('disconnected patches, opposite normals and material changes are not welded',()=>{
 const a=box([0,0,0],[1,1,1]),b=box([2,0,0],[3,1,1]),c={...box([1,0,0],[2,1,1]),material:2};const g=buildLightAtlases([a,b,c]),u=new Uint32Array(g.surfaces);assert.notEqual(u[3*16],u[12*16]);assert.notEqual(u[3*16],u[21*16]);assert.notEqual(u[3*16],u[2*16]);
});
test('ceiling hole is excluded from coverage and probes after merging four rectangles',()=>{
 const g=makeGeometry(),a=g.atlases.find(a=>a.members.includes(5*9+2));assert.deepEqual(a.members,[47,56,65,74]);let area=0;for(const p of g.cellSurfaces.subarray(a.offset,a.offset+a.nx*a.ny))area+=(p>>>16)*.25*a.width*a.height/(a.nx*a.ny);assert(Math.abs(area-(14*27-4.8*5.8))<.08);const nx=Math.ceil(a.nx/a.stride),ny=Math.ceil(a.ny/a.stride);for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const px=a.bounds[0]+(x+.5)*a.width/nx,pz=a.bounds[1]+(y+.5)*a.height/ny;if(px>g.aperture[0]&&px<g.aperture[1]&&pz>g.aperture[2]&&pz<g.aperture[3])assert.equal(g.probeSurfaces[a.probeOffset+y*nx+x]>>>16,0);}
});
test('every smooth arch spring shares both flux and probe addresses with its jambs',()=>{const g=makeGeometry(),u=new Uint32Array(g.surfaces);for(const i of [9,10,11,12])for(const face of [7,8]){assert.equal(u[(i*9+6)*16],u[(i*9+face)*16]);assert.equal(u[(i*9+6)*16+3],u[(i*9+face)*16+3]);}});
