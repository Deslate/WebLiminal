import test from 'node:test';
import assert from 'node:assert/strict';
import { playbackRate, playbackStep } from '../src/playback.js';

test('diagnostic rates are opt-in and cannot accelerate the clock', () => {
  for (const value of [null, '', '1', '2', '-1', 'NaN']) assert.equal(playbackRate(value), 1);
  assert.equal(playbackRate('0.5'), .5);
  assert.equal(playbackRate('0.33'), 1 / 3);
  for (const name of ['1', '0.5', '0.33']) {
    const rate = playbackRate(name);
    const elapsed = Array.from({length: 600}, () => playbackStep(1 / 60, rate)).reduce((a,b) => a+b, 0);
    assert.ok(Math.abs(elapsed - 10 * rate) < 1e-10);
    assert.equal(playbackStep(.2, rate), .05 * rate);
    assert.equal(playbackStep(0, rate), 0);
  }
});
