import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {curvedShader,tileMaterial} from '../src/render/curved-shapes.js';
import {buildRegion} from '../levels/poolrooms-regions.js';
import {validateScene} from '../src/render/scene.js';
import {poolroomsScene} from './geometry-fixture.mjs';
const common=readFileSync(new URL('../src/render/common.wgsl',import.meta.url),'utf8');
const photon=readFileSync(new URL('../materials/photon-porcelain.wgsl',import.meta.url),'utf8');
test('unauthored ceramic retains the exact legacy camera and photon sources',()=>{
 const scene=poolroomsScene();assert.equal(curvedShader(common,scene),common);assert.equal(tileMaterial(photon,scene),photon);
});
test('slab overrides share a module across relief, joint visibility and photons',()=>{
 const scene=buildRegion('rotunda'),source=curvedShader(common,scene);
 validateScene(scene);
 assert.equal(scene.shapes.filter(s=>s.tileSize===.45).length,3);
 assert(source.includes('var size=vec2f(tileModule(sid));'));
 assert(source.includes('let spacing=tileModule(h.sid);var border=min(fract(uv/spacing)'));
 assert(tileMaterial(photon,scene).includes('var size=vec2f(tileModule(h.sid));'));
 assert(source.includes('default:{return 0.3;}'));
 for(const tileSize of [0,NaN,1])assert.throws(()=>validateScene({...scene,shapes:[{...scene.shapes[0],tileSize},...scene.shapes.slice(1)]}),/tile module/);
 for(const tileBevelScale of [0,NaN,2])assert.throws(()=>validateScene({...scene,tileBevelScale}),/bevel/);
});
test('region modules match photon IDs and narrower shoulders retain conservative stepping',()=>{
 for(const kind of ['columns','rings','threshold']){
  const [apertureWidth,apertureDepth]={columns:[9.5,8.9],rings:[2.05,13],threshold:[8.9,11.7]}[kind];
  const scene=buildRegion(kind,{apertureWidth,apertureDepth});validateScene(scene);const source=curvedShader(common,scene);
  assert(source.includes(`var size=vec2f(${scene.tileSize});`));
  assert(tileMaterial(photon,scene).includes(`var size=vec2f(${scene.tileSize});`));
  assert(source.includes(`(${10/scene.tileBevelScale})*length(uvRay)`));
 }
});
