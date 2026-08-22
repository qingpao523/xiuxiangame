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
  await page.waitForTimeout(700);
  await page.evaluate(() => { localStorage.removeItem("fengshen_web_save_v2"); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);

  if (await page.locator("#prologue-layer").evaluate((el) => !el.classList.contains("hidden")).catch(() => false)) {
    await page.locator("#prologue-skip").click();
    await page.waitForTimeout(300);
  }
  if (await page.locator("#popup-layer").evaluate((el) => !el.classList.contains("hidden")).catch(() => false)) {
    const pick = page.locator(".choice-pick").first();
    if (await pick.count()) {
      await pick.click();
      await page.waitForTimeout(150);
      const conf = page.locator(".race-confirm-btn");
      if (await conf.count()) await conf.click();
      await page.waitForTimeout(250);
    }
    await page.evaluate(() => { if (typeof closePopup === "function") { try { closePopup(); } catch (e) {} } Game.popupQueue = []; });
  }

  const dbg = page.locator("#debug-battle");
  if (!(await dbg.count())) { fail("调试条没有试斗一场"); await browser.close(); return; }

  await dbg.click();
  await page.waitForTimeout(400);
  const duel1 = await page.locator("#duel-layer").evaluate((el) => !el.classList.contains("hidden"));
  if (!duel1) fail("第一场斗法场未打开");
  else ok("第一场斗法场打开");

  const title1 = (await page.locator(".duel-title").innerText().catch(() => "")).trim();
  if (!title1) fail("第一场没有敌名");
  else ok("第一场敌名 " + title1);

  const leftoverOnPopup = await page.evaluate(() => document.querySelectorAll("#popup-panel .battle-end-row, #popup-panel .duel-collect").length);
  if (leftoverOnPopup) fail("结算钮挂到了弹窗上: " + leftoverOnPopup);
  else ok("结算钮不在弹窗上");
  const foeArt = await page.locator("[data-duel=foe-port] img, [data-duel=foe-port] svg").count();
  if (!foeArt) fail("敌方没有立绘/剪影");
  else ok("敌方有形象");
  const nYou = await page.locator("[data-duel=orbs] .duel-orb").count();
  const nFoe = await page.locator("[data-duel=foe-orbs] .duel-orb").count();
  if (nYou !== 6) fail("己方斗法栏不是六格 you=" + nYou);
  else ok("己方斗法栏 6 格");
  if (nFoe !== 6) fail("敌方斗法栏不是六格 foe=" + nFoe);
  else ok("敌方斗法栏 6 格");
  const foeNames = await page.locator("[data-duel=foe-orbs] .duel-orb-name").allTextContents();
  if (!foeNames.some((n) => n && n.trim() && n.trim() !== "…" && n.trim() !== "·")) fail("敌方斗法栏无招名: " + foeNames.join("/"));
  else ok("敌方招名 " + foeNames.join(" / "));
  if (!(await page.locator(".duel-field").count())) fail("没有对站场地");
  else ok("对站场地");
  const kitTxt = (await page.locator("[data-duel=kit]").innerText().catch(() => ""));
  if (kitTxt && kitTxt.includes("宝")) fail("法宝神通仍在栏外独立槽: " + kitTxt);
  else ok("法宝神通不在栏外");
  const cats = await page.locator("[data-duel=orbs] .duel-orb-cat").allTextContents();
  if (!cats.some((c) => c.includes("术") || c.includes("宝") || c.includes("通") || c.includes("锁"))) fail("六格没有品类标: " + cats.join("/"));
  else ok("六格品类 " + cats.join("/"));
  const callout = (await page.locator("[data-duel=callout]").innerText().catch(() => "")).trim();
  if (!callout) fail("没有出手台词");
  else ok("出手台词: " + callout.replace(/\s+/g, " ").slice(0, 24));

  const skip = page.locator(".duel-speed").filter({ hasText: "跳过" });
  if (await skip.count()) await skip.click();
  try {
    await page.waitForSelector(".duel-collect", { timeout: 8000 });
    ok("第一场结算钮出现");
  } catch (e) {
    fail("跳过后没有收取/退出按钮");
  }

  const collect = page.locator(".duel-collect");

  const endCount1 = await collect.count();
  if (endCount1 !== 1) fail("第一场结算钮数量=" + endCount1);
  else ok("第一场只有一枚结算钮");

  await collect.click();
  await page.waitForTimeout(400);
  await page.evaluate(() => { if (typeof closePopup === "function") { try { closePopup(); } catch (e) {} } Game.popupQueue = []; });
  await page.waitForTimeout(200);

  const closed = await page.locator("#duel-layer").evaluate((el) => el.classList.contains("hidden"));
  if (!closed) fail("收取后斗法场未关闭");
  else ok("收取后斗法场关闭");

  await dbg.click();
  await page.waitForTimeout(400);
  const duel2 = await page.locator("#duel-layer").evaluate((el) => !el.classList.contains("hidden"));
  if (!duel2) fail("第二场斗法场未打开");
  else ok("第二场斗法场打开");

  const title2 = (await page.locator(".duel-title").innerText().catch(() => "")).trim();
  if (!title2) fail("第二场没有敌名");
  else ok("第二场敌名 " + title2);
  if (!title1 || !title2) fail("缺敌名");
  else if (title1 === title2) fail("第二场敌名与第一场相同，可能串场: " + title2);
  else ok("第二场敌名已换");

  const tick = (await page.locator("[data-duel=tick]").innerText().catch(() => "")).trim();
  if (title1 && tick.includes(title1) && !tick.includes(title2)) fail("第二场战报仍带着第一场: " + tick);
  else ok("第二场开场战报干净: " + tick.slice(0, 40));

  const collect2 = await page.locator(".duel-collect").count();
  if (collect2 !== 0) fail("第二场开打时已有结算钮残留: " + collect2);
  else ok("第二场开打无结算残留");

  const popupKids = await page.evaluate(() => {
    const p = document.getElementById("popup-panel");
    return Array.from(p.children).map((el) => el.id || el.className);
  });
  if (popupKids.some((x) => String(x).includes("battle-end") || String(x).includes("duel-"))) fail("弹窗残留战斗节点: " + popupKids.join(","));
  else ok("弹窗子节点干净: " + popupKids.join("/"));

  const timeline = await page.locator(".round-timeline").count();
  if (timeline) fail("玩家对局仍露出调试时间轴");
  else ok("默认不展示调试时间轴");

  await page.evaluate(() => { if (typeof closePopup === "function") { try { closePopup(); } catch (e) {} } });
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    Game.state.unlocked_skills = ["skill_body_01", "skill_body_02", "skill_thunder_01"];
    Game.state.skill_levels = { skill_body_01: 1, skill_body_02: 1, skill_thunder_01: 1 };
    Game.state.battle_slots = [{ id: "skill_body_01", condition: "always" }, { id: "skill_thunder_01", condition: "always" }];
    Game.openSlotConfig();
  });
  await page.waitForTimeout(400);
  const formOpen = await page.locator("#formation-layer").evaluate((el) => !el.classList.contains("hidden"));
  if (!formOpen) fail("配招阵面未打开");
  else ok("配招阵面打开");
  const nForm = await page.locator(".form-slot").count();
  if (nForm !== 6) fail("配招不是六格: " + nForm);
  else ok("配招六格");
  const xiu = await page.locator(".form-xiu").count();
  if (xiu !== 4) fail("配招没有四修分组: " + xiu);
  else ok("配招四修分组 " + xiu);
  const slotBox = await page.locator(".form-slot").first().boundingBox();
  if (!slotBox || slotBox.width < 80 || slotBox.height < 80) fail("配招格太小: " + JSON.stringify(slotBox));
  else ok("配招格尺寸 " + Math.round(slotBox.width) + "x" + Math.round(slotBox.height));
  const nativeSelect = await page.locator("#formation-layer select").count();
  if (nativeSelect) fail("配招格内仍有原生 select");
  else ok("条件改为芯片，无原生 select");
  const chips = await page.locator(".form-chip.cond").count();
  if (!chips) fail("没有条件芯片");
  else ok("条件芯片存在");

  await browser.close();
  if (!process.exitCode) console.log("BATTLE LIFECYCLE PASS");
})().catch((e) => { console.error(e); process.exit(1); });
