import test from 'node:test';
import assert from 'node:assert/strict';
import {viewportSize, initialRenderScale} from '../src/render/viewport-size.js';

test('viewport projection is independent of quality, pixel density and integer targets', () => {
  for (const [w,h] of [[390,844],[844,390],[1280,832],[1703,1040],[180,1200],[1200,180]]) {
    for (const scale of [.36,.5,.75,1,initialRenderScale(w,h)]) for (const dpr of [1,2,3]) {
      const size=viewportSize(w,h,scale,dpr);
      assert.equal(size.aspect,w/h);
      assert.ok(Math.abs(size.width-w*scale)<=.5);
      assert.ok(Math.abs(size.height-h*scale)<=.5);
      assert.equal(size.canvasWidth,w*dpr);assert.equal(size.canvasHeight,h*dpr);
      // A projected circle must have equal CSS-pixel radii after presentation.
      assert.ok(Math.abs(w/size.aspect-h)<1e-9);
    }
  }
});
test('small and unaligned targets are not expanded to independent axis floors', () => {
  assert.deepEqual(viewportSize(390,844,.5),{width:195,height:422,canvasWidth:390,canvasHeight:844,aspect:390/844});
  assert.equal(viewportSize(844,390,.5).height,195);
  assert.equal(viewportSize(1703,1040,.5).width,852);
});
test('automatic budget and GPU limits scale both axes together', () => {
  assert.equal(initialRenderScale(1703,1040),initialRenderScale(1040,1703));
  assert.equal(initialRenderScale(390,844),1);
  const size=viewportSize(8000,4000,1,3,{maxDimension:4096,maxPixels:2097152});
  assert.equal(size.aspect,2);assert.equal(size.width,2048);assert.equal(size.height,1024);
  assert.equal(size.canvasWidth,4096);assert.equal(size.canvasHeight,2048);
  const roundedLimit=viewportSize(1703,1040,1,1,{maxPixels:1000000});
  assert.ok(roundedLimit.width*roundedLimit.height<=1000000);
  assert.equal(viewportSize(0,0).width,1);
});
