import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {integratedTiles,TILE_GAUSS_NODES,TILE_GAUSS_WEIGHTS} from '../src/render/tile-integration.js';
import {curvedShader,tileMaterial} from '../src/render/curved-shapes.js';
import {poolroomsScene} from './geometry-fixture.mjs';
import {buildRegion} from '../levels/poolrooms-regions.js';
import {validateScene} from '../src/render/scene.js';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const common=read('../src/render/common.wgsl'),near=read('../materials/porcelain.wgsl'),photon=read('../materials/photon-porcelain.wgsl');
test('legacy window preserves all ceramic shader paths exactly',()=>{
 const s=poolroomsScene();assert.equal(curvedShader(common,s),common);
 assert.equal(integratedTiles(near,s),near);assert.equal(tileMaterial(photon,s),photon);
});
test('integration is independently selectable without changing ceramic construction',()=>{
 const s=buildRegion('rotunda');validateScene(s);
 const legacy={...s,tileSampling:'legacy'};validateScene(legacy);
 assert.equal(integratedTiles(near,legacy),near);
 assert.notEqual(integratedTiles(near,s),near);
 assert.equal(curvedShader(common,s),curvedShader(common,legacy));
 assert.throws(()=>validateScene({...s,tileSampling:'blur'}),/tile sampling/);
});
test('regular dome coordinates remain independent of high-quality joint integration',()=>{
 const s=buildRegion('rotunda'),code=curvedShader(common,s);
 assert(code.includes('atan2(v.y,v.x)*r+select(0.,shape.params.w'));
 assert(code.includes('h.p.y);'));
 assert(!code.includes('domeCourseRadius'));
 assert(!tileMaterial(photon,s).includes('mode==6u'));
 for(const region of ['columns','threshold','rings','rotunda']){
  const scene=buildRegion(region);
  assert.equal(scene.tileSampling,'integrated');
  assert(integratedTiles(near,scene).includes('struct TileAxis'));
 }
});

test('piecewise quadrature conserves constants and integrates shoulder slope moments',()=>{
 for(let degree=0;degree<=7;degree++){
  const got=TILE_GAUSS_NODES.reduce((sum,x,i)=>sum+TILE_GAUSS_WEIGHTS[i]*x**degree,0);
  const expected=degree%2?0:2/(degree+1);
  assert(Math.abs(got-expected)<2e-9,`degree ${degree}`);
 }
 assert(TILE_GAUSS_WEIGHTS.every(w=>w>0));
});

test('integrated sampling rejects missing boundaries and moment wiring',()=>{
 const scene=buildRegion('rotunda');
 for(const hook of ['fn glazeMoments(','fn surfaceMaterial(','moments.z+moments.w']){
  assert(near.includes(hook));
  assert.throws(()=>integratedTiles(near.replace(hook,'BROKEN_HOOK'),scene),/hook|boundaries/i);
 }
});
