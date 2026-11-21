import test from 'node:test';
import assert from 'node:assert/strict';
import {sceneShaderPrelude,validateScene,waterGrid,packScene} from '../src/render/scene.js';
import {poolroomsScene} from './geometry-fixture.mjs';
const box=(lo,hi,extra={})=>({lo,hi,kind:0,material:0,radius:0,spring:0,...extra});
const onTop=v=>Array.from({length:9},(_,face)=>face===3?v:undefined);
const minimal=(shapes=[box([0,-1,0],[4,0,4])])=>({bounds:{minX:0,maxX:4,minZ:0,maxZ:4,ceiling:3},shapes,solids:[],water:{minX:0,maxX:4,minZ:0,maxZ:4,cell:.25},aperture:{minX:1,maxX:2,minZ:1,maxZ:2,y:3},floor:{shape:0,face:3}});
test('Poolrooms compiles to the historical water grid, aperture plane and floor receiver',()=>{
 const p=sceneShaderPrelude(poolroomsScene());
 for(const line of ['const WATER_MIN=vec2f(-7.,-17.);','const WATER_MAX=vec2f(7.,10.);','const WATER_NX:u32=448u;','const WATER_NZ:u32=864u;','const WATER_DX=0.03125;','const WATER_CELLS_PER_METRE=32.;','const OPENING_Y=6.1;','const FLOOR_SID:u32=3u;'])assert(p.includes(line),line);
});
test('shader constants do not depend on the runtime aperture size',()=>{
 assert.equal(sceneShaderPrelude(poolroomsScene(2,3)),sceneShaderPrelude(poolroomsScene(7.8,9)));
});
test('water grid must tile the water rectangle exactly',()=>{
 assert.deepEqual(waterGrid({minX:0,maxX:4,minZ:-1,maxZ:1,cell:.25}),{nx:16,nz:8,dx:.25,dt:1/60,minX:0,minZ:-1});
 assert.throws(()=>waterGrid({minX:0,maxX:4.1,minZ:0,maxZ:1,cell:.25}));
});
test('scene validation rejects empty shapes and engine-reserved materials',()=>{
 assert.doesNotThrow(()=>validateScene(minimal()));
 assert.throws(()=>validateScene(minimal([box([0,0,0],[0,1,1])])),/lo >= hi/);
 for(const material of [9,10])assert.throws(()=>validateScene(minimal([box([0,-1,0],[4,0,4],{material})])),/material/);
 assert.throws(()=>validateScene({...minimal(),floor:{shape:3,face:3}}),/floor/);
});

test('wall rails require complete round bounds and conductor transport',()=>{
 const rail=box([-.02,1,-2],[.02,1.04,2],{kind:6,material:3,radius:.02,axis:2});
 const scene={...minimal([...minimal().shapes,rail]),conductorMaterials:[3]};
 assert.doesNotThrow(()=>validateScene(scene));
 const packed=new Float32Array(packScene(scene).geometryData);
 assert.equal(packed[31],2);
 assert.throws(()=>validateScene({...scene,conductorMaterials:[]}),/conductor/);
 assert.throws(()=>validateScene({...scene,shapes:[scene.shapes[0],{...rail,axis:1}]}),/cylinder/);
 const ring={...rail,kind:7,radius:2,tubeRadius:.02,lo:[-2.02,1,-2.02],hi:[2.02,1.04,2.02]};
 assert.doesNotThrow(()=>validateScene({...scene,shapes:[scene.shapes[0],ring]}));
 assert.throws(()=>validateScene({...scene,shapes:[scene.shapes[0],{...ring,hi:[2,1.04,2]}]}),/torus/);
});

test('physical tile spacing rejects degenerate modules',()=>{
 for(const tileSize of [0,.01,NaN,Infinity,2]) assert.throws(()=>validateScene({...minimal(),tileSize}),/tile module/);
 assert.doesNotThrow(()=>validateScene({...minimal(),tileSize:.18}));
});
test('per-face receiver density and probe stride come from shape data',()=>{
 const plain=packScene(minimal()),fine=packScene(minimal([box([0,-1,0],[4,0,4],{density:onTop(48),probeStride:onTop(8)})]));
 const top=g=>{const u=new Uint32Array(g.surfaces),f=new Float32Array(g.surfaces);return {nx:u[3*16+1],stride:f[3*16+7]};};
 assert.deepEqual(top(plain),{nx:48,stride:4});
 assert.deepEqual(top(fine),{nx:192,stride:8});
 assert.equal(fine.floorSid,3);
});

test('explicit curved centres are packed and flagged; rings and arcades validate',()=>{
  const scene=minimal();
  const dome={lo:[-7,3,-4],hi:[7,9,6],kind:3,material:0,radius:5,spring:3,oculus:0,center:[0,1]};
  const packed=packScene({...scene,shapes:[...scene.shapes,dome]});
  const f=new Float32Array(packed.geometryData),u=new Uint32Array(packed.geometryData),o=scene.shapes.length*16;
  assert.deepEqual([f[o+3],f[o+7],u[o+11]],[0,1,1]);
  assert.equal(u[11],0,'implicit centres keep the historical packing');
  assert.throws(()=>validateScene({...scene,shapes:[...scene.shapes,{...dome,hi:[7,9,5]}]}),/near side/);
  const ring={lo:[-3,0,0],hi:[3,4,.4],kind:9,material:0,radius:2,outerRadius:2.2,spring:1.4};
  assert.doesNotThrow(()=>validateScene({...scene,shapes:[...scene.shapes,ring]}));
  assert.throws(()=>validateScene({...scene,shapes:[...scene.shapes,{...ring,outerRadius:1}]}),/ring/);
  const arcade={lo:[-5,0,-5],hi:[5,3,5],kind:10,material:0,radius:4,outerRadius:5,spring:1.5,openingRadius:.6,openings:8};
  assert.doesNotThrow(()=>validateScene({...scene,shapes:[...scene.shapes,arcade]}));
  const packedArcade=new Uint32Array(packScene({...scene,shapes:[...scene.shapes,arcade]}).geometryData);
  assert.equal(packedArcade[scene.shapes.length*16+11],8<<8);
  assert.throws(()=>validateScene({...scene,shapes:[...scene.shapes,{...arcade,openings:24}]}),/arcade/,'openings would overlap');
});
