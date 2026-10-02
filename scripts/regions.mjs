// Capture navigation landmarks and time the actual GPU-completed scheduler.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { recordBackground } from './environment-lab-v158.mjs';
import { provenance } from './roam-v149-provenance.mjs';
const source = provenance().sourceHash;
const root = resolve(process.env.EVIDENCE_DIR || '../workroom-evidence/regions');
mkdirSync(root, { recursive: true });
await recordBackground(root);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 832 } });
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
  page.on('console', message => { if(message.type()==='error'&&!message.text().includes('[vite]')) console.error(message.text()); });
  await page.routeWebSocket(/.*/, socket => socket.close());
  await page.goto(process.env.VERIFY_URL || 'http://127.0.0.1:4173');
  await page.waitForFunction(() => window.__POOLROOMS_V1__?.snapshot().firstFrameMs, null, { timeout: 120000 });
  await page.evaluate(async () => {
    document.body.classList.add('evidence');
    await __POOLROOMS_V1__.setLab({ resolution: .5 });
  });
  for (let index = 1; index < 5; index++) {
    await page.keyboard.press(`Digit${index + 1}`);
    await page.waitForFunction(i => {
      const s = __POOLROOMS_V1__.snapshot(); return s.region === i && !s.regionChanging;
    }, index, { timeout: 180000 });
    await page.waitForTimeout(5000);
    const start = await page.evaluate(() => ({ time: performance.now(), ...__POOLROOMS_V1__.snapshot() }));
    await page.waitForTimeout(Number(process.env.MEASURE_MS || 15000));
    const end = await page.evaluate(async () => { await __POOLROOMS_V1__.pause(); return { time: performance.now(), ...__POOLROOMS_V1__.snapshot() }; });
    assert(end.validPosition, 'Spawn must be collision valid');
    assert.equal(end.level, 'poolrooms-v1');
    assert.deepEqual(end.internal, [640, 416]);
    assert.deepEqual(end.errors, []);
    assert.deepEqual(errors, []);
    const ms = end.frames.slice(start.frames.length).map(f => f.ms);
    const sorted = [...ms].sort((a, b) => a - b);
    let t = 0; const bins = [];
    for (const dt of ms) { t += dt; bins[Math.floor(t / 1000)] = (bins[Math.floor(t / 1000)] || 0) + 1; }
    const fps = 1000 * (end.completedFrames - start.completedFrames) / (end.time - start.time);
    const result = { index, address: end.address, internal: end.internal, fps,
      p95Ms: sorted[Math.floor(sorted.length * .95)], minOneSecondFps: Math.min(...bins.slice(1, -1)),
      errors: end.errors, frames: ms, dynamics: end.dynamics };
    results.push(result);
    await page.screenshot({ path: `${root}/location-${index + 1}.png` });
    console.log(JSON.stringify({ ...result, frames: undefined, dynamics: undefined }));
    await page.keyboard.press('Tab');
  }
  // The same document cycles across both ends and returns to the original area.
  await page.evaluate(() => __POOLROOMS_V1__.pause());
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => __POOLROOMS_V1__.snapshot().region === 0 && !__POOLROOMS_V1__.snapshot().regionChanging, null, { timeout: 180000 });
  assert(await page.evaluate(() => __POOLROOMS_V1__.snapshot().paused), 'Teleport must preserve pause');
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => __POOLROOMS_V1__.snapshot().region === 4 && !__POOLROOMS_V1__.snapshot().regionChanging, null, { timeout: 180000 });
  await page.keyboard.press('Digit1');
  await page.waitForFunction(() => __POOLROOMS_V1__.snapshot().region === 0 && !__POOLROOMS_V1__.snapshot().regionChanging, null, { timeout: 180000 });
  await page.evaluate(() => dispatchEvent(new KeyboardEvent('keydown', {code:'ArrowRight',repeat:true})));
  assert.equal(await page.evaluate(() => __POOLROOMS_V1__.snapshot().region), 0);
  await page.keyboard.press('KeyG');
  await page.keyboard.press('Digit3');
  assert.equal(await page.evaluate(() => __POOLROOMS_V1__.snapshot().region), 0, 'Lab owns its keys');
  await page.keyboard.press('KeyG');
  await page.evaluate(() => { const input=document.createElement('input');input.id='navigation-test-input';document.body.append(input);input.focus(); });
  await page.keyboard.press('Digit5');
  assert.equal(await page.evaluate(() => __POOLROOMS_V1__.snapshot().region), 0, 'Editable fields own their keys');
  await page.evaluate(() => document.getElementById('navigation-test-input').remove());
  assert.equal(provenance().sourceHash, source, 'Source changed during measurement');
  const adapter = await page.evaluate(async () => (await __POOLROOMS_V1__.audit({})).adapter);
  writeFileSync(`${root}/performance.json`, JSON.stringify({ source, adapter, navigation: 'Digits, wrap in both directions, pause preservation, repeat, lab and input ownership passed.', method: '1280x832 viewport, fixed 50% (640x416), default transport, 5 s warmup, GPU-completed frames; screenshots after timing.', results, errors }, null, 2));
} finally { await browser.close(); }
