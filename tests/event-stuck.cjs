const { chromium } = require("playwright");

const url = process.env.OPENING_URL || "http://127.0.0.1:8090/?debug=1";
const fail = (m) => { console.error("FAIL", m); process.exitCode = 1; };
const ok = (m) => console.log("ok ", m);

(async () => {
  const exe = process.env.PW_CHROME || "/Users/flyaways/Library/Caches/ms-playwright/chromium_headless_shell-1237/chrome-headless-shell-mac-arm64/chrome-headless-shell";
  const browser = await chromium.launch({ headless: true, executablePath: exe });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", (e) => console.error("pageerror", e.message));
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  await page.evaluate(() => localStorage.removeItem("fengshen_web_save_v2"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);
  if (await page.locator("#prologue-skip").count()) await page.locator("#prologue-skip").click();
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    if (typeof closePopup === "function") try { closePopup(); } catch (e) {}
    Game.popupQueue = [];
    Game.state.flags.prologue_seen = true;
    Game.state.pending_event_id = "event_101";
    Game.eventPopupActive = false;
    Game.openPendingEvent();
  });
  await page.waitForTimeout(900);

  const title = await page.locator("#popup-title").innerText().catch(() => "");
  if (!title.includes("山中异象")) fail("未弹出山中异象: " + title);
  else ok("弹出 " + title);

  const btns = await page.locator("#popup-buttons button").allTextContents();
  if (!btns.length) fail("机缘无按钮，会卡住");
  else ok("机缘按钮: " + btns.join(" / "));
  if (!btns.some((b) => b.includes("记下") || b.includes("知道"))) fail("叙事机缘没有记下/知道了");
  else ok("有收束钮");

  await page.locator("#popup-buttons button").first().click();
  await page.waitForTimeout(400);
  const hidden = await page.locator("#popup-layer").evaluate((el) => el.classList.contains("hidden"));
  if (!hidden) fail("点记下后弹层仍开着");
  else ok("弹层已关");
  const pending = await page.evaluate(() => Game.state.pending_event_id);
  if (pending) fail("记下后 pending 仍在: " + pending);
  else ok("pending 已清");

  await page.evaluate(() => {
    Game.state.pending_event_id = "event_102";
    Game.eventPopupActive = true;
    Game.popupQueue = [];
  });
  await page.evaluate(() => Game.openPendingEvent());
  await page.waitForTimeout(500);
  const t2 = await page.locator("#popup-title").innerText().catch(() => "");
  if (!t2.includes("灵泉")) fail("eventPopupActive 挡死再开: " + t2);
  else ok("卡住后仍能再开: " + t2);
  const n2 = await page.locator("#popup-buttons button").count();
  if (!n2) fail("第二场叙事机缘仍无按钮");
  else ok("第二场也有收束钮");

  await browser.close();
  if (!process.exitCode) console.log("EVENT STUCK PASS");
})().catch((e) => { console.error(e); process.exit(1); });
