import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
const url = process.env.VERIFY_URL || "http://127.0.0.1:4173";
const mode = process.env.VERIFY_MODE || "full";
const headless = process.env.HEADLESS === "1";
const width = Number(process.env.WIDTH || 1512),
  height = Number(process.env.HEIGHT || 982);
const dpr = Number(process.env.DPR || 2);
const output = process.env.OUTPUT_DIR || "docs/verification";
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  channel: "chrome",
  headless,
  args: [`--window-size=${width},${height + 90}`],
  ignoreDefaultArgs: ["--mute-audio"],
});
const context = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: dpr,
});
const page = await context.newPage();
const errors = [],
  requests = [],
  consoleMessages = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (["error", "warning"].includes(m.type()))
    errors.push(`${m.type()}: ${m.text()}`);
  consoleMessages.push({ type: m.type(), text: m.text() });
});
page.on("request", (r) => requests.push(r.url()));
page.on("requestfailed", (r) =>
  errors.push(`request: ${r.url()} ${r.failure()?.errorText}`),
);
const cdp = await context.newCDPSession(page);
await cdp.send("Network.enable");
await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
await page.goto(url);
await page.waitForFunction(
  () => window.__POOLROOMS__?.snapshot().firstFrameMs != null,
);
const initial = await page.evaluate(() => {
  const s = window.__POOLROOMS__.snapshot();
  delete s.frames;
  return {
    ...s,
    paints: performance
      .getEntriesByType("paint")
      .map((p) => ({ name: p.name, time: p.startTime })),
  };
});
assert(
  initial.firstFrameMs <= 3000,
  `First WebGL frame took ${initial.firstFrameMs}ms`,
);
await page.waitForFunction(() => window.__POOLROOMS__.snapshot().elapsed >= 3);
await page.screenshot({
  type: "jpeg",
  quality: 85,
  scale: "css",
  path: `${output}/${mode}-entry.jpg`,
});
console.log(
  "First frame",
  initial.firstFrameMs.toFixed(1),
  "ms; GPU",
  initial.renderer,
  "; initial audio",
  initial.audio.state,
);
if (mode === "full") {
  await page.keyboard.press("KeyM"); // User interaction both unlocks and mutes: visual-only event test.
  await page.waitForFunction(
    () => window.__POOLROOMS__.snapshot().elapsed >= 6,
  );
  // No screenshots, polling or input in the next 28 seconds: uncontaminated FPS window.
  await page.waitForTimeout(28000);
  const beforeEvent = await page.evaluate(() =>
    window.__POOLROOMS__.snapshot(),
  );
  await page.screenshot({
    type: "jpeg",
    quality: 85,
    scale: "css",
    path: `${output}/before-moment.jpg`,
  });
  await page.waitForFunction(
    () => window.__POOLROOMS__.snapshot().elapsed >= 37,
  );
  await page.screenshot({
    type: "jpeg",
    quality: 85,
    scale: "css",
    path: `${output}/moment-muted.jpg`,
  });
  const moment = await page.evaluate(() => window.__POOLROOMS__.snapshot());
  assert(moment.disturbance > 0.95);
  assert(moment.audio.muted);
  await page.waitForFunction(
    () => window.__POOLROOMS__.snapshot().elapsed >= 44,
  );
  await page.screenshot({
    type: "jpeg",
    quality: 85,
    scale: "css",
    path: `${output}/after-moment.jpg`,
  });
  await page.keyboard.press("KeyM");
  await page.waitForTimeout(1000);
  const audio = await page.evaluate(
    () => window.__POOLROOMS__.snapshot().audio,
  );
  assert.equal(audio.state, "running");
  assert(audio.rms > 0.0001, "No audio signal");
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(4000);
  await page.keyboard.up("KeyW");
  const walked = await page.evaluate(() => window.__POOLROOMS__.snapshot());
  assert(walked.position.z < initial.position.z - 3);
  assert(walked.validPosition);
  // Strafe to the outer wall and continue pressing into it; no developer teleport hooks.
  await page.keyboard.down("ShiftLeft");
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(7000);
  await page.keyboard.up("KeyD");
  await page.keyboard.up("ShiftLeft");
  const atWall = await page.evaluate(() => window.__POOLROOMS__.snapshot());
  assert(atWall.validPosition);
  assert(atWall.position.x <= 9.76);
  assert(atWall.position.y > 1.5 && atWall.position.y < 1.8);
  await page.mouse.move(width / 2, height / 2);
  await page.mouse.down();
  await page.mouse.move(width / 2 + 180, height / 2 + 50, { steps: 10 });
  await page.mouse.up();
  const looked = await page.evaluate(() => window.__POOLROOMS__.snapshot());
  assert(Math.abs(looked.yaw - initial.yaw) > 0.3);
  const final = await page.evaluate(() => window.__POOLROOMS__.snapshot());
  const frames = beforeEvent.frames.filter((f) => f.t >= 7 && f.t <= 33);
  const sorted = frames.map((f) => f.ms).sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const windows = [];
  for (let t = 7; t < 33; t++) {
    const w = frames.filter((f) => f.t >= t && f.t < t + 1);
    if (w.length)
      windows.push(1000 / (w.reduce((a, b) => a + b.ms, 0) / w.length));
  }
  const stats = {
    sampleSeconds: 26,
    samples: frames.length,
    averageFps: 1000 / mean,
    p95FrameMs: sorted[Math.floor(sorted.length * 0.95)],
    p99FrameMs: sorted[Math.floor(sorted.length * 0.99)],
    minOneSecondFps: Math.min(...windows),
    maxFrameMs: sorted.at(-1),
    framesOver50ms: sorted.filter((x) => x > 50).length,
  };
  const report = {
    date: new Date().toISOString(),
    url,
    browser: await browser.version(),
    headless,
    viewport: { width, height, dpr },
    initial,
    stats,
    audioAfterGesture: audio,
    eventLog: final.eventLog,
    mutedMoment: { disturbance: moment.disturbance, audio: moment.audio },
    movement: {
      walked: walked.position,
      wall: atWall.position,
      lookYaw: looked.yaw,
      allValid: walked.validPosition && atWall.validPosition,
    },
    finalQuality: {
      pixelRatio: final.pixelRatio,
      drawingBuffer: final.drawingBuffer,
      changes: final.qualityChanges,
    },
    errors,
    externalRequests: requests.filter(
      (u) => !u.startsWith(new URL(url).origin) && !u.startsWith("data:"),
    ),
    consoleMessages,
  };
  writeFileSync(`${output}/results.json`, JSON.stringify(report, null, 2));
  writeFileSync(`${output}/frame-times.json`, JSON.stringify(final.frames));
  console.log(JSON.stringify(report, null, 2));
  assert(stats.averageFps >= 30);
  assert(stats.minOneSecondFps >= 30);
  assert.equal(errors.length, 0);
  assert.equal(report.externalRequests.length, 0);
} else {
  await page.keyboard.press("KeyW");
  await page.waitForTimeout(1100);
  const s = await page.evaluate(() => {
    const s = window.__POOLROOMS__.snapshot();
    delete s.frames;
    return s;
  });
  const report = {
    url,
    mode,
    initial,
    afterInteraction: s,
    errors,
    externalRequests: requests.filter(
      (u) => !u.startsWith(new URL(url).origin) && !u.startsWith("data:"),
    ),
    consoleMessages,
  };
  writeFileSync(`${output}/${mode}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  assert.equal(errors.length, 0);
  assert.equal(report.externalRequests.length, 0);
  assert.equal(s.audio.state, "running");
}
await browser.close();
