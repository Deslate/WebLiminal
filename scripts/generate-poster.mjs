import { chromium } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1,
});
await page.goto("http://127.0.0.1:4173");
await page.waitForFunction(
  () => window.__POOLROOMS__?.snapshot().elapsed >= 2.8,
);
await page.addStyleTag({
  content:
    ".film,.tracking,.tape,.archive,.caption,footer,#audio-status{display:none!important}",
});
await page
  .locator("canvas")
  .screenshot({ path: "public/first-frame.jpg", type: "jpeg", quality: 88 });
await browser.close();
