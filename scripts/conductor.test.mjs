import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {conductorShader,conductorCommon} from '../src/render/conductor-shaders.js';
const source=name=>readFileSync(new URL(`../src/render/${name}.wgsl`,import.meta.url),'utf8');
test('legacy material and transport shader paths remain byte identical',()=>{
  assert.equal(conductorCommon(source('common'),{}),source('common'));
  for(const kind of ['camera','photons'])assert.equal(conductorShader(kind,source(kind),{}),source(kind));
});
test('quadrature can be configured without a conductor material class',()=>{
  const shader=conductorShader('camera',source('camera'),{reflectionSamples:{glaze:24,rough:32}});
  assert(shader.includes('let rays=select(24u,32u,h.material==1u);'));
  assert(!shader.includes('isConductor'));
});
test('conductor class is explicitly assigned rather than tied to one material id',()=>{
  const scene={conductorMaterials:[4,7]};
  const common=conductorCommon(source('common'),scene);
  assert(common.includes('material==4u||material==7u'));
  assert(common.includes('h.material==1u || isConductor(h.material) || h.material==9u'));
  const photons=conductorShader('photons',source('photons'),scene);
  assert(photons.includes('if(!isConductor(h.material) && bounce>0u'));
  assert(photons.includes('1.,isConductor(h.material)'));
});
