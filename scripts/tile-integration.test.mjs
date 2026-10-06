import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {domeTiles} from '../src/render/dome-tiles.js';
import {integratedTiles,TILE_GAUSS_NODES,TILE_GAUSS_WEIGHTS} from '../src/render/tile-integration.js';
import {curvedShader,tileMaterial} from '../src/render/curved-shapes.js';
import {poolroomsScene} from './geometry-fixture.mjs';
import {buildRegion} from '../levels/poolrooms-regions.js';
import {validateScene} from '../src/render/scene.js';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const common=read('../src/render/common.wgsl'),near=read('../materials/porcelain.wgsl'),photon=read('../materials/photon-porcelain.wgsl');
test('legacy window preserves all ceramic shader paths exactly',()=>{
 const s=poolroomsScene();assert.equal(domeTiles(curvedShader(common,s),s),common);
 assert.equal(integratedTiles(tileMaterial(near,s),s),near);assert.equal(tileMaterial(photon,s),photon);
});
test('integration is independently selectable without changing ceramic construction',()=>{
 const s=buildRegion('rotunda');validateScene(s);
 const legacy={...s,tileSampling:'legacy'};validateScene(legacy);
 const low=integratedTiles(near,legacy);assert(low.includes('sqrt(dot(f[0],f[0])'));assert(!low.includes('struct TileAxis'));
 assert(low.includes('moments.z*dot(f[0],f[0])'));
 assert.notEqual(integratedTiles(near,s),near);
 assert.equal(domeTiles(curvedShader(common,s),s),domeTiles(curvedShader(common,legacy),legacy));
 assert.throws(()=>validateScene({...s,tileSampling:'blur'}),/tile sampling/);
});
test('dome specialization requires the construction hooks and keeps non-dome charts untouched',()=>{
 assert.equal(domeTiles(common,{shapes:[{kind:2}]}),common);
 assert.throws(()=>domeTiles('',buildRegion('rotunda')),/Missing dome tile hook/);
 const s=buildRegion('rotunda'),code=domeTiles(curvedShader(common,s),s);
 assert(code.includes('cell.x=cell.x-count*floor(cell.x/count)'));
 assert(code.includes('if(rho<.000001)'));
 assert(tileMaterial(photon,s).includes('mode==6u'));
});

test('piecewise quadrature conserves constants and integrates shoulder slope moments',()=>{
 for(let degree=0;degree<=7;degree++){
  const got=TILE_GAUSS_NODES.reduce((sum,x,i)=>sum+TILE_GAUSS_WEIGHTS[i]*x**degree,0);
  const expected=degree%2?0:2/(degree+1);
  assert(Math.abs(got-expected)<2e-9,`degree ${degree}`);
 }
 assert(TILE_GAUSS_WEIGHTS.every(w=>w>0));
});
