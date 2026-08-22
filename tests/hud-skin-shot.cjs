const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const url = process.env.OPENING_URL || "http://127.0.0.1:8090/";
const exe = process.env.PW_CHROME || "/Users/flyaways/Library/Caches/ms-playwright/chromium_headless_shell-1237/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const out = path.join(__dirname, "../实盘测试/golden-open-2026-08-22/hud-skin");
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: exe });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", (e) => console.error("pageerror", e.message));
  await page.goto(url + "?hud=1", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(500);
  await page.evaluate(() => localStorage.removeItem("fengshen_web_save_v2"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);

  const skip = page.locator("#prologue-skip");
  if (await skip.count()) { await skip.click(); await page.waitForTimeout(350); }
  const yao = page.locator(".choice-pick").filter({ hasText: "妖" });
  if (await yao.count()) await yao.click();
  else await page.locator(".choice-pick").first().click();
  await page.waitForTimeout(200);
  const confirm = page.locator(".race-confirm-btn");
  if (await confirm.count()) { await confirm.click(); await page.waitForTimeout(300); }
  const enter = page.locator(".popup-btn").filter({ hasText: "踏入修行" });
  if (await enter.count()) { await enter.click(); await page.waitForTimeout(300); }
  await page.evaluate(() => { if (typeof closePopup === "function") try { closePopup(); } catch (e) {} });
  await page.waitForTimeout(200);

  const shot = async (name) => {
    const p = path.join(out, name);
    await page.screenshot({ path: p, fullPage: false });
    console.log("shot", name);
  };

  await shot("01-main-default.png");

  const css = await page.evaluate(() => {
    const cs = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return { missing: true };
      const s = getComputedStyle(el);
      return {
        bg: s.backgroundImage.slice(0, 180),
        border: s.borderImageSource.slice(0, 120),
        radius: s.borderRadius,
        h: Math.round(el.getBoundingClientRect().height),
        w: Math.round(el.getBoundingClientRect().width),
      };
    };
    const char = document.getElementById("char-img");
    const cr = char.getBoundingClientRect();
    const navs = [...document.querySelectorAll(".nav-btn")].map((el) => {
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), ratio: +(r.width / r.height).toFixed(2) };
    });
    return {
      goal: cs("#goal-panel"),
      main: cs("#main-btn"),
      nav: cs(".nav-btn"),
      auto: cs("#auto-toggle"),
      bar: cs("#progress-bar"),
      chip: cs(".res-chip"),
      navs,
      char: { w: Math.round(cr.width), h: Math.round(cr.height), natural: [char.naturalWidth, char.naturalHeight] },
      mainClass: document.getElementById("main-btn")?.className,
      label: document.getElementById("main-btn-label")?.textContent,
    };
  });
  console.log(JSON.stringify(css, null, 2));

  await page.evaluate(() => {
    Game.state.resources.daoxing = 999999;
    Game.tick();
    if (typeof render === "function") render();
  });
  await page.waitForTimeout(250);
  await page.locator("#auto-toggle").click();
  await page.waitForTimeout(150);
  await shot("02-main-ready.png");
  const ready = await page.evaluate(() => ({
    cls: document.getElementById("main-btn")?.className,
    label: document.getElementById("main-btn-label")?.textContent,
    bg: getComputedStyle(document.getElementById("main-btn")).backgroundImage.slice(0, 160),
  }));
  console.log("ready", JSON.stringify(ready));

  await page.locator(".nav-btn[data-panel='realm']").click();
  await page.waitForTimeout(300);
  await shot("03-panel-realm.png");
  await page.locator("#panel-close").click();
  await page.waitForTimeout(200);

  await page.locator(".nav-btn[data-panel='log']").click();
  await page.waitForTimeout(300);
  await shot("04-panel-log.png");
  const logCss = await page.evaluate(() => {
    const card = document.querySelector("#panel-body .card");
    if (!card) return { noCard: true };
    const s = getComputedStyle(card);
    return { bg: s.backgroundColor, radius: s.borderRadius, color: getComputedStyle(card.querySelector(".card-name") || card).color };
  });
  console.log("log-card", JSON.stringify(logCss));
  await page.locator("#panel-close").click();
  await page.waitForTimeout(200);

  await page.locator(".nav-btn[data-panel='spell']").click();
  await page.waitForTimeout(350);
  await shot("05-popup-locked.png");
  await page.locator(".popup-btn").filter({ hasText: "知道了" }).click().catch(() => {});
  await page.waitForTimeout(200);
  const audio = page.locator("#audio-settings-btn");
  if (await audio.count()) {
    await audio.click();
    await page.waitForTimeout(300);
    await shot("06-audio.png");
    const ac = await page.evaluate(() => {
      const lab = document.querySelector(".audio-slider label");
      return lab ? getComputedStyle(lab).color : "none";
    });
    console.log("audio-label-color", ac);
  }
  const pop = await page.evaluate(() => {
    const panel = document.getElementById("popup-panel");
    const btn = document.querySelector("#popup-buttons button");
    const s = getComputedStyle(panel);
    const b = btn ? getComputedStyle(btn) : {};
    return {
      hidden: document.getElementById("popup-layer").classList.contains("hidden"),
      title: document.getElementById("popup-title")?.textContent,
      bg: s.backgroundImage + " | " + s.backgroundColor,
      radius: s.borderRadius,
      btnRadius: b.borderRadius,
      btnBg: String(b.backgroundImage || b.backgroundColor).slice(0, 160),
    };
  });
  console.log("locked-popup", JSON.stringify(pop, null, 2));

  await browser.close();
  console.log("done", out);
})().catch((e) => { console.error(e); process.exit(1); });
