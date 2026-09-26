import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { auditOptics } from "./optical-audit.mjs";
const output =
  process.env.EVIDENCE_DIR ||
  "/Users/steven/Projects/workroom-v1.6-evidence/proof";
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (["warning", "error"].includes(m.type())) errors.push(m.text());
  });
  await page.goto("http://127.0.0.1:4173");
  await page.waitForFunction(
    () => window.__POOLROOMS_V1__?.snapshot().completedFrames > 2,
  );
  await page.evaluate(() => document.body.classList.add("evidence"));
  const runId = await page.evaluate(
    () => window.__POOLROOMS_V1__.snapshot().runId,
  );
  const views = [];
  const base = {
    photonCount: 131072,
    freeze: true,
    targetSamples: 8,
    waterLevel: 0.42,
    waveAmplitude: 0.052,
    apertureWidth: 4.8,
    apertureDepth: 5.8,
    exposure: 0.85,
    waveTime: 1.7,
    seed: 7819301,
    scale: 0.8,
  };
  const cases = [
    ["01-original", {}],
    ["02-water-level", { waterLevel: 0.86 }],
    ["03-skylight-opening", { apertureWidth: 1.6 }],
    ["04-flat-wave-control", { waveAmplitude: 0.001 }],
    ["05-restored-original", {}],
  ];
  for (const [name, patch] of cases) {
    console.log("Rendering", name);
    await page.evaluate((p) => window.__POOLROOMS_V1__.configure(p), {
      ...base,
      ...patch,
    });
    await page.waitForFunction(
      () => window.__POOLROOMS_V1__.snapshot().samples >= 8,
      {},
      { timeout: 180000 },
    );
    const snapshot = await page.evaluate(() =>
      window.__POOLROOMS_V1__.snapshot(),
    );
    const raw = await page.evaluate(() => window.__POOLROOMS_V1__.audit());
    const optics = auditOptics(raw);
    delete raw.paths;
    assert.equal(snapshot.runId, runId);
    assert.equal(snapshot.samples, 8);
    assert.equal(raw.batches, raw.config.lightBatches);
    assert.equal(raw.errors.length, 0);
    await page.screenshot({ path: `${output}/${name}.png` });
    const sha256 = createHash("sha256")
      .update(readFileSync(`${output}/${name}.png`))
      .digest("hex");
    const frames = snapshot.frames.slice(2).map((x) => x.ms),
      fps = (1000 * frames.length) / frames.reduce((a, b) => a + b, 0);
    delete snapshot.frames;
    const result = { name, runId, snapshot, raw, optics, fps, sha256 };
    writeFileSync(`${output}/${name}.json`, JSON.stringify(result, null, 2));
    views.push({
      name,
      runId,
      config: raw.config,
      view: snapshot.view,
      samples: raw.batches,
      fps,
      sha256,
      opticalResiduals: optics.maxResidual,
      baseEmittedPhotons: raw.baseEmittedSinceReset,
      livePacketsPerFrame:raw.livePacketsPerFrame,
    });
    console.log(
      name,
      "complete; fps",
      fps.toFixed(2),
      "optics",
      JSON.stringify(optics.maxResidual),
    );
  }
  // A fourth required deliverable: a normal-size complete frame with more camera pixels.
  console.log("Rendering full-size frame");
  await page.setViewportSize({ width: 1920, height: 1200 });
  await page.evaluate((p) => window.__POOLROOMS_V1__.configure(p), {
    ...base,
    scale: 0.85,
    targetSamples: 8,
  });
  await page.waitForFunction(
    () => window.__POOLROOMS_V1__.snapshot().samples >= 8,
    {},
    { timeout: 180000 },
  );
  await page.screenshot({ path: `${output}/06-full-frame.png` });
  const full = await page.evaluate(() => window.__POOLROOMS_V1__.snapshot());
  const fullDeltas=full.frames.slice(2).map(f=>f.ms);full.captureFps=1000*fullDeltas.length/fullDeltas.reduce((a,b)=>a+b,0);delete full.frames;
  writeFileSync(
    `${output}/06-full-frame.json`,
    JSON.stringify(full, null, 2),
  );
  assert.equal(
    views[0].sha256,
    views[4].sha256,
    "Restoring the exact physical state should restore the exact image",
  );
  assert.equal(errors.length, 0);
  writeFileSync(
    `${output}/manifest.json`,
    JSON.stringify(
      {
        runId,
        browser: await browser.version(),
        cases: views,
        full,
        errors,
        identicalRestoredImage: true,
      },
      null,
      2,
    ),
  );
  console.log("PROOF COMPLETE", runId);
} finally {
  await browser.close();
}
