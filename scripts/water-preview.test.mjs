import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {waterPreview, waterPreviewCamera} from '../src/render/water-preview.js';

const camera=readFileSync(new URL('../src/render/camera.wgsl',import.meta.url),'utf8');
test('unselected and unknown water previews preserve the production camera',()=>{
  for(const name of ['', 'unknown', '__proto__', 'constructor', 'fine', 'dense', 'calm']){
    assert.equal(waterPreviewCamera(camera,waterPreview(name)),camera);
  }
  for(const name of ['', 'unknown', '__proto__', 'constructor']){
    assert.deepEqual(waterPreview(name),waterPreview('fine'));
  }
  assert.equal(waterPreview('').pressurePasses,4);
  assert.deepEqual(waterPreview('calm'),{pressurePasses:8,detail:false});
});
test('water detail preview refines submerged solid hits and guards missing hooks',()=>{
  const source=waterPreviewCamera(camera,waterPreview('detail'));
  assert.match(source,/underwater && base.t<INF && base.material!=10u/);
  assert.match(source,/reliefHit\(ro,rd,base\)/);
  assert.match(waterPreviewCamera(camera,waterPreview('detail'),[3]),/base.material!=3u/);
  assert.throws(()=>waterPreviewCamera('',waterPreview('detail')),/hook missing/);
});
