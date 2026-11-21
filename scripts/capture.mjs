// Headless Chromium WebGPU visual capture & diagnostic verification script.
// Writes screenshots outside the repository (default: /tmp/webliminal-captures).

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const url = process.env.VERIFY_URL || "http://127.0.0.1:4173/";
const outDir = process.env.EVIDENCE_DIR || "/tmp/webliminal-captures";
const targetSpp = Number(process.env.SPP || 40);
const width = Number(process.env.WIDTH || 960);
const height = Number(process.env.HEIGHT || 540);
const levels = (process.env.LEVELS || "poolrooms,level0,level1").split(",").map((s) => s.trim()).filter(Boolean);

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--enable-unsafe-webgpu",
    "--enable-unsafe-swiftshader",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--use-vulkan=swiftshader",
    "--enable-features=Vulkan",
  ],
});

const page = await browser.newPage({ viewport: { width, height } });
const consoleErrors = [];
page.on("pageerror", (e) => {
  const s = `PAGEERROR: ${e.message}`;
  consoleErrors.push(s);
  console.error(s);
});
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") {
    const s = `CONSOLE[${m.type()}]: ${m.text()}`;
    if (m.type() === "error") consoleErrors.push(s);
    console.error(s);
  }
});

const report = [];

for (const levelId of levels) {
  const targetUrl = `${url}?level=${encodeURIComponent(levelId)}&capture=1&spp=${targetSpp}`;
  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__WEBLIMINAL__?.snapshot()?.level), null, { timeout: 90000 });

  const res = await page.evaluate(async (spp) => {
    return await window.__WEBLIMINAL__.renderFrame(spp);
  }, targetSpp);

  const pngPath = join(outDir, `${levelId}.png`);
  await page.screenshot({ path: pngPath });

  // Also capture a secondary viewpoint bookmark for each level.
  await page.evaluate(async () => {
    window.__WEBLIMINAL__.jumpToBookmark(1);
    return await window.__WEBLIMINAL__.renderFrame(null);
  });
  const altPath = join(outDir, `${levelId}-alt.png`);
  await page.screenshot({ path: altPath });

  // Capture baked GI lightmap debug view for the first level.
  if (levelId === levels[0]) {
    await page.evaluate(async () => {
      window.__WEBLIMINAL__.jumpToBookmark(0);
      window.__WEBLIMINAL__.setSettings({ debugView: 1 });
      return await window.__WEBLIMINAL__.renderFrame(null);
    });
    await page.screenshot({ path: join(outDir, `${levelId}-lightmap.png`) });
  }

  report.push({ levelId, ...res, pngPath, altPath });
  console.log(
    `[CAPTURE] ${levelId}: ${res.stats.triangles} tris, tex=${res.bake.textureMs}ms, initGI=${res.bake.initBakeMs}ms, ` +
      `spp=${res.bake.bakedSpp}, gpuErrors=${res.errors.length} -> ${pngPath}`,
  );
}

writeFileSync(join(outDir, "report.json"), JSON.stringify({ report, consoleErrors }, null, 2));
await browser.close();

if (consoleErrors.length) {
  console.error("Captured runtime/console errors:\n" + consoleErrors.join("\n"));
  process.exit(1);
}
for (const r of report) {
  if (r.errors.length) {
    console.error(`GPU validation errors in ${r.levelId}:\n` + r.errors.join("\n"));
    process.exit(1);
  }
}
console.log(`All captures succeeded with 0 GPU/console errors -> ${outDir}`);
