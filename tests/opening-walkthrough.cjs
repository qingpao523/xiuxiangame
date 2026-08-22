const { chromium } = require("playwright");

const url = process.env.OPENING_URL || "http://127.0.0.1:8090/";
const fail = (m) => { console.error("FAIL", m); process.exitCode = 1; };
const ok = (m) => console.log("ok ", m);

async function title(page) {
  try { return await page.locator("#popup-title").innerText(); } catch (e) { return ""; }
}
async function visible(page, sel) {
  try { return await page.locator(sel).isVisible(); } catch (e) { return false; }
}

(async () => {
  const exe = process.env.PW_CHROME || "/Users/flyaways/Library/Caches/ms-playwright/chromium_headless_shell-1237/chrome-headless-shell-mac-arm64/chrome-headless-shell";
  const browser = await chromium.launch({ headless: true, executablePath: exe });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", (e) => console.error("pageerror", e.message));

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  await page.evaluate(() => { localStorage.removeItem("fengshen_web_save_v2"); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);

  const prolog = await page.locator("#prologue-layer").evaluate((el) => !el.classList.contains("hidden"));
  if (!prolog) fail("卷首未出现");
  else ok("卷首出现");
  const ptxt = await page.locator("#prologue-stage").innerText();
  if (!ptxt.includes("你睁开眼") && !ptxt.includes("洞府")) fail("卷首不是洞府第一息: " + ptxt.slice(0, 80));
  else ok("卷首是洞府第一息");
  const enter = page.locator("#prologue-enter");
  if (await enter.count()) {
    const et = await enter.innerText();
    if (et.includes("盘膝吐纳")) ok("末幕按钮盘膝吐纳");
    else ok("末幕按钮: " + et);
  }
  await page.locator("#prologue-skip").click();
  await page.waitForTimeout(400);

  let t = await title(page);
  if (!t.includes("跟脚")) fail("卷首后不是择跟脚: " + t);
  else ok("第一步择跟脚: " + t);
  await page.locator(".choice-pick").first().click();
  await page.waitForTimeout(200);
  await page.locator(".race-confirm-btn").click();
  await page.waitForTimeout(400);
  t = await title(page);
  if (!t.includes("跟脚已定")) fail("未确认跟脚: " + t);
  else ok("跟脚已定: " + t);
  await page.locator(".popup-btn").filter({ hasText: "踏入修行" }).click();
  await page.waitForTimeout(300);

  await page.locator("#main-btn").click();
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    if (Game.state.current_action) Game.state.current_action.end_time_ms = Date.now() - 1;
    Game.tick();
  });
  await page.waitForTimeout(400);
  t = await title(page);
  if (!t.includes("你听见了风")) fail("第一次吐纳标题不是你听见了风: " + t);
  else ok("第一次吐纳：你听见了风");
  await page.locator(".popup-btn").first().click();
  await page.waitForTimeout(200);

  await page.evaluate(() => {
    for (let i = 0; i < 6; i++) {
      Game.state.resources.daoxing = 9999;
      if (["rq_03", "rq_04", "rq_05"].includes(Game.state.realm_id)) break;
      Game.levelUp();
    }
  });
  await page.waitForTimeout(500);
  if (await visible(page, "#world-map-layer")) {
    const close = page.locator("#world-map-close");
    if (await close.count()) await close.click();
    await page.waitForTimeout(300);
  }
  await page.evaluate(() => { if (typeof closePopup === "function") { try { closePopup(); } catch (e) {} } });
  await page.waitForTimeout(200);
  ok("境界 " + await page.evaluate(() => Game.state.realm_id));

  await page.evaluate(() => Game.startAction("wild_travel"));
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const a = Game.state.current_action;
    if (a && a.encounters) for (const e of a.encounters) e.at = Date.now() - 1;
    Game.tick();
  });
  await page.waitForTimeout(500);
  t = await title(page);
  const btns = await page.locator("#popup-buttons .popup-btn").allTextContents();
  if (!t.includes("遭遇") && !t.includes("斗法") && !t.includes("配招")) fail("游历未出斗法/遭遇: " + t + " | " + btns.join(","));
  else ok("游历出了: " + t + " | " + btns.join(" / "));
  if (btns.some((b) => b.includes("绕行") || b.includes("稳妥"))) fail("首次游历仍给出绕行");
  else ok("首次游历只有斗法选项（无绕行）");

  await page.evaluate(() => {
    Game.state.current_action = null;
    Game.state.flags.battle_v2_tutorial_done = true;
    if (typeof closePopup === "function") { try { closePopup(); } catch (e) {} }
    Game.popupQueue.length = 0;
    let guard = 0;
    while (String(Game.state.realm_id) < "rq_04" && guard++ < 8) {
      Game.state.resources.daoxing = 9999;
      const before = Game.state.realm_id;
      Game.levelUp();
      if (Game.state.realm_id === before) break;
    }
    if (typeof WorldMap !== "undefined" && WorldMap.close) WorldMap.close();
    if (typeof closePopup === "function") { try { closePopup(); } catch (e) {} }
    Game.popupQueue = (Game.popupQueue || []).filter((p) => p.kind === "minigame");
    if (typeof ContentDirector !== "undefined") ContentDirector.pulse("realm");
    if (typeof drainPopupQueue === "function") drainPopupQueue();
  });
  await page.waitForTimeout(500);
  t = await title(page);
  const q = await page.evaluate(() => ({
    title: document.getElementById("popup-title") && document.getElementById("popup-title").textContent,
    realm: Game.state.realm_id,
    queue: (Game.popupQueue || []).map((p) => p.kind + ":" + (p.minigameId || "")),
    fired: Game.state.flags.beats_fired || {},
  }));
  const tide = (t && t.includes("灵潮")) || (q.queue || []).some((x) => x.includes("spirit_tide"));
  if (!tide) fail("炼气四重未出灵潮: " + JSON.stringify(q));
  else ok("炼气四重出灵潮: " + JSON.stringify(q));

  await browser.close();
  if (!process.exitCode) console.log("WALKTHROUGH PASS");
})().catch((e) => { console.error(e); process.exit(1); });
