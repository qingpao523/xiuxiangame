const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const url = process.env.OPENING_URL || "http://127.0.0.1:8090/?debug=1";
const out = path.join(__dirname, "..", "实盘测试", "battle-board-2026-08-22");
fs.mkdirSync(out, { recursive: true });

(async () => {
  const exe = process.env.PW_CHROME || "/Users/flyaways/Library/Caches/ms-playwright/chromium_headless_shell-1237/chrome-headless-shell-mac-arm64/chrome-headless-shell";
  const browser = await chromium.launch({ headless: true, executablePath: exe });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", (e) => console.error("pageerror", e.message));

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);
  await page.evaluate(() => { localStorage.removeItem("fengshen_web_save_v2"); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);
  if (await page.locator("#prologue-layer").evaluate((el) => !el.classList.contains("hidden")).catch(() => false)) {
    await page.locator("#prologue-skip").click();
    await page.waitForTimeout(250);
  }
  if (await page.locator("#popup-layer").evaluate((el) => !el.classList.contains("hidden")).catch(() => false)) {
    const pick = page.locator(".choice-pick").first();
    if (await pick.count()) {
      await pick.click();
      await page.waitForTimeout(120);
      const conf = page.locator(".race-confirm-btn");
      if (await conf.count()) await conf.click();
      await page.waitForTimeout(200);
    }
    await page.evaluate(() => { if (typeof closePopup === "function") { try { closePopup(); } catch (e) {} } Game.popupQueue = []; });
  }

  await page.locator("#debug-battle").click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(out, "01-board.png"), fullPage: false });
  console.log("shot 01-board");

  await page.waitForTimeout(1800);
  await page.screenshot({ path: path.join(out, "02-acting.png"), fullPage: false });
  console.log("shot 02-acting");

  await browser.close();
  console.log("SHOT_OK", out);
})().catch((e) => { console.error(e); process.exit(1); });
