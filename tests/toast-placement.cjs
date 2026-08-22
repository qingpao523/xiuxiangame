const { chromium } = require("playwright");
const url = process.env.OPENING_URL || "http://127.0.0.1:8090/?debug=1";
const fail = (m) => { console.error("FAIL", m); process.exitCode = 1; };
const ok = (m) => console.log("ok ", m);

(async () => {
  const exe = process.env.PW_CHROME || "/Users/flyaways/Library/Caches/ms-playwright/chromium_headless_shell-1237/chrome-headless-shell-mac-arm64/chrome-headless-shell";
  const browser = await chromium.launch({ headless: true, executablePath: exe });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  await page.evaluate(() => localStorage.removeItem("fengshen_web_save_v2"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);
  if (await page.locator("#prologue-skip").count()) await page.locator("#prologue-skip").click();
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    if (typeof closePopup === "function") try { closePopup(); } catch (e) {}
    Game.popupQueue = [];
    Game.toast("突破至炼气化神·6重", "天边榜文碎光初现，山野机缘开始浮动。", 8000, "world");
  });
  await page.waitForTimeout(400);
  const toast = page.locator("#action-toast");
  if (!(await toast.isVisible())) fail("浮字未出现");
  else ok("浮字出现");
  const parent = await toast.evaluate((el) => el.parentElement && el.parentElement.id);
  if (parent !== "stage") fail("浮字不在舞台: " + parent);
  else ok("浮字在舞台");
  const t = await toast.boundingBox();
  const btn = await page.locator("#main-btn").boundingBox();
  if (!t || !btn) fail("量不到包围盒");
  else {
    const overlap = !(t.y + t.height <= btn.y || btn.y + btn.height <= t.y || t.x + t.width <= btn.x || btn.x + btn.width <= t.x);
    if (overlap) fail("浮字压住主按钮 t=" + JSON.stringify(t) + " btn=" + JSON.stringify(btn));
    else ok("浮字不压主按钮");
  }
  await browser.close();
  if (!process.exitCode) console.log("TOAST PLACEMENT PASS");
})().catch((e) => { console.error(e); process.exit(1); });
