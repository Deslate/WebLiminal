import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {waterPreview, waterPreviewCamera} from '../src/render/water-preview.js';

const camera=readFileSync(new URL('../src/render/camera.wgsl',import.meta.url),'utf8');
test('unselected and unknown water previews preserve the production camera',()=>{
  for(const name of ['', 'unknown', '__proto__', 'constructor', 'fine', 'dense']){
    assert.equal(waterPreviewCamera(camera,waterPreview(name)),camera);
  }
  assert.equal(waterPreview('').pressurePasses,8);
  assert.equal(waterPreview('unknown').pressurePasses,8);
});
test('water detail preview refines submerged solid hits and guards missing hooks',()=>{
  const source=waterPreviewCamera(camera,waterPreview('detail'));
  assert.match(source,/underwater && base.t<INF && base.material!=10u/);
  assert.match(source,/reliefHit\(ro,rd,base\)/);
  assert.match(waterPreviewCamera(camera,waterPreview('detail'),[3]),/base.material!=3u/);
  assert.throws(()=>waterPreviewCamera('',waterPreview('detail')),/hook missing/);
});

test('preview dropdown keeps stable default and existing detail URLs', async () => {
  const {WATER_OPTIONS, previewSelection, previewUrl} = await import('../src/preview-menu.js');
  assert.deepEqual(WATER_OPTIONS.map(([name]) => name), ['', 'detail', 'fine', 'dense']);
  assert.deepEqual(waterPreview(previewSelection(null)), {pressurePasses:8, detail:false});
  assert.deepEqual(waterPreview(previewSelection('detail')), {pressurePasses:8, detail:true});
  for (const [name] of WATER_OPTIONS) {
    const url = new URL(previewUrl('http://localhost/?waterPreview=fine&level=poolrooms-v1#view', name));
    assert.equal(url.searchParams.get('waterPreview'), name || null);
    assert.deepEqual(waterPreview(url.searchParams.get('waterPreview')), waterPreview(name));
    assert.equal(url.searchParams.get('level'), 'poolrooms-v1');
    assert.equal(url.hash, '#view');
  }
  for (const name of ['patches','contacts','wind','unknown','__proto__']) assert.equal(previewSelection(name), '');
});
