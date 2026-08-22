const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const url = process.env.OPENING_URL || "http://127.0.0.1:8090/";
const out = path.join(__dirname, "..", "实盘测试", "opening-wow-2026-08-22");
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
  await page.waitForTimeout(900);

  const shot = async (name) => {
    const p = path.join(out, name + ".png");
    await page.screenshot({ path: p, fullPage: false });
    console.log("shot", name);
  };

  await shot("01-prologue-wake");
  await page.locator("#prologue-layer").click({ position: { x: 200, y: 400 } });
  await page.waitForTimeout(700);
  await shot("02-prologue-gold");
  await page.locator("#prologue-layer").click({ position: { x: 200, y: 400 } });
  await page.waitForTimeout(700);
  await shot("03-prologue-breathe");

  const enter = page.locator("#prologue-enter");
  if (await enter.count()) await enter.click();
  else await page.locator("#prologue-skip").click();
  await page.waitForTimeout(500);
  await shot("04-race-default");

  const fog = page.locator(".race-fog-card");
  const fogCount = await fog.count();
  console.log("fog-cards", fogCount);
  if (fogCount) {
    await fog.nth(1).click();
    await page.waitForTimeout(250);
    await shot("05-race-fog-tease");
  }

  await page.locator(".choice-pick").first().click();
  await page.waitForTimeout(250);
  await shot("06-race-human-selected");

  await page.locator(".race-confirm-btn").click();
  await page.waitForTimeout(400);
  await shot("07-race-confirmed");

  const enterWorld = page.locator(".popup-btn").filter({ hasText: "踏入修行" });
  if (await enterWorld.count()) await enterWorld.click();
  await page.waitForTimeout(500);
  await shot("08-home-after-race");

  await browser.close();
  console.log("SHOT_OK", out);
})().catch((e) => { console.error(e); process.exit(1); });
