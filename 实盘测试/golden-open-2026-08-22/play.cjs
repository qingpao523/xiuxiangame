#!/usr/bin/env node
"use strict";

/**
 * 封神修道录 · 前 30 分钟黄金开局实盘（真人向，非 debug）
 * Viewport 390×844 · 新档 · 无 ?debug · 无 fastForward
 */

const fs = require("fs");
const path = require("path");
const { chromium } = require("/Users/flyaways/.npm-global/lib/node_modules/@playwright/mcp/node_modules/playwright");

const OUT = path.resolve(__dirname);
const SHOT = path.join(OUT, "screenshots");
const PORT = Number(process.env.PORT || 8090);
const BASE = `http://127.0.0.1:${PORT}/`;
const DURATION_MS = Number(process.env.DURATION_SEC || 1800) * 1000;
const LOOP_MS = 900;
const SNAP_MS = 15000;

fs.mkdirSync(SHOT, { recursive: true });

const timeline = { snapshots: [], events: [] };
const consoleLog = { consoles: [], pageerrors: [], requestfailed: [], httpErrors: [] };
const shotsTaken = new Set();
const anomalies = [];

let t0 = 0;
const nowSec = () => Math.max(0, (Date.now() - t0) / 1000);
const logLine = (msg) => {
  const line = `[${nowSec().toFixed(1)}s] ${msg}`;
  console.log(line);
  fs.appendFileSync(path.join(OUT, "play.log"), line + "\n");
};

function tag(kind, extra = {}) {
  const ev = { t: +nowSec().toFixed(2), kind, ...extra };
  timeline.events.push(ev);
  logLine(`EVENT ${kind} ${JSON.stringify(extra)}`);
  return ev;
}

async function shot(page, name, force = false) {
  const key = name;
  if (!force && shotsTaken.has(key)) return;
  shotsTaken.add(key);
  const file = path.join(SHOT, `${name}.png`);
  try {
    await page.screenshot({ path: file, fullPage: false });
    logLine(`SHOT ${name}.png`);
  } catch (e) {
    logLine(`SHOT FAIL ${name}: ${e.message}`);
  }
}

function recordConsole() {
  return {
    onConsole(msg) {
      const entry = {
        t: t0 ? +nowSec().toFixed(2) : 0,
        type: msg.type(),
        text: msg.text(),
        loc: msg.location(),
      };
      consoleLog.consoles.push(entry);
      if (msg.type() === "error") logLine(`CONSOLE.error ${msg.text()}`);
    },
    onPageError(err) {
      const entry = { t: t0 ? +nowSec().toFixed(2) : 0, message: String(err), stack: err.stack };
      consoleLog.pageerrors.push(entry);
      logLine(`PAGEERROR ${err.message}`);
    },
    onRequestFailed(req) {
      const entry = {
        t: t0 ? +nowSec().toFixed(2) : 0,
        url: req.url(),
        method: req.method(),
        failure: req.failure() && req.failure().errorText,
        resourceType: req.resourceType(),
      };
      consoleLog.requestfailed.push(entry);
      if (/audio|\.ogg|\.mp3|\.wav/i.test(req.url()) || req.resourceType() === "media") {
        logLine(`AUDIO_FAIL ${req.url()}`);
      }
    },
    onResponse(res) {
      if (res.status() >= 400) {
        const entry = {
          t: t0 ? +nowSec().toFixed(2) : 0,
          url: res.url(),
          status: res.status(),
          method: res.request().method(),
        };
        consoleLog.httpErrors.push(entry);
        if (res.status() === 404) logLine(`HTTP ${res.status()} ${res.url()}`);
      }
    },
  };
}

async function snapState(page) {
  try {
    // Game / RealmManager 是页面顶层 const，不挂 window；必须走页面全局求值。
    return await page.evaluate(`(() => {
      const G = Game;
      if (!G || !G.state) return null;
      const s = G.state;
      const main = G.getMainAction ? G.getMainAction() : {};
      const realm = (typeof RealmManager !== "undefined") ? RealmManager.getCurrentRealm(s) : {};
      const progress = (typeof RealmManager !== "undefined") ? RealmManager.getProgress(s) : {};
      const power = (typeof RealmManager !== "undefined") ? RealmManager.getCombatPower(s) : 0;
      const popupLayer = document.getElementById("popup-layer");
      const panelLayer = document.getElementById("panel-layer");
      const mapLayer = document.getElementById("world-map-layer");
      const prologue = document.getElementById("prologue-layer");
      const popupHidden = !popupLayer || popupLayer.classList.contains("hidden");
      const hints = [...document.querySelectorAll("#action-hints button")].map((b) => b.textContent);
      const identity = (document.getElementById("identity-line") || {}).textContent || "";
      const goalText = (document.getElementById("goal-text") || {}).textContent || "";
      const goalReward = (document.getElementById("goal-reward") || {}).textContent || "";
      const mainLabel = (document.getElementById("main-btn-label") || {}).textContent || "";
      const popupTitle = (document.getElementById("popup-title") || {}).textContent || "";
      const popupKind = G.popupQueue && G.popupQueue[0] ? G.popupQueue[0].kind : null;
      const battleOn = !!(document.querySelector(".battle-v2-zone") || document.querySelector(".battle-v2-config"));
      const daoxing = s.resources ? Number(s.resources.daoxing || 0) : 0;
      const spellsLearned = Object.values(s.spells || {}).filter((x) => (x && x.level) > 0).map((x) => x);
      const spellNames = Object.entries(s.spells || {})
        .filter(([, v]) => v && v.level > 0)
        .map(([id, v]) => id + "#" + v.level);
      return {
        realm_id: s.realm_id,
        realm_name: realm.realm_name || "",
        major: realm.major_realm || "",
        minor: realm.minor_level || 0,
        display_realm: identity.split("｜")[0] || "",
        daoxing,
        daoxing_need: progress.required || 0,
        daoxing_cur: progress.current || 0,
        canLevelUp: !!(typeof RealmManager !== "undefined" && RealmManager.canLevelUp(s)),
        mainType: main.type || "",
        mainLabel,
        mainActionId: main.actionId || (main.row && main.row.action_id) || "",
        popupVisible: !popupHidden,
        popupTitle,
        popupKindQueued: popupKind,
        popupQueueLen: (G.popupQueue || []).length,
        popupQueueKinds: (G.popupQueue || []).map((p) => p.kind),
        auto_repeat: !!s.flags.auto_repeat,
        current_action: s.current_action ? s.current_action.action_id : null,
        combatPower: power,
        logs0: (s.logs && s.logs[0]) || "",
        identity,
        goalText,
        goalReward,
        current_goal_id: s.current_goal_id,
        hints,
        panelOpen: panelLayer && !panelLayer.classList.contains("hidden"),
        mapOpen: mapLayer && !mapLayer.classList.contains("hidden"),
        prologueOpen: prologue && !prologue.classList.contains("hidden"),
        battleOn,
        race_id: s.race_id,
        pending_event_id: s.pending_event_id || "",
        seen_events: s.seen_events || [],
        action_counts: s.action_counts_total || {},
        boss_clears: s.boss_clears || {},
        unlocked_skills: s.unlocked_skills || [],
        spellNames,
        flags: {
          world_map_seen: !!(s.flags && s.flags.world_map_seen),
          prologue_seen: !!(s.flags && s.flags.prologue_seen),
          battle_v2_tutorial_done: !!(s.flags && s.flags.battle_v2_tutorial_done),
          sparkle_guide_seen: !!(s.flags && s.flags.sparkle_guide_seen),
        },
        resources: s.resources || {},
      };
    })()`);
  } catch (e) {
    return { error: e.message };
  }
}

async function isVisible(page, sel) {
  try {
    const loc = page.locator(sel).first();
    if (!(await loc.count())) return false;
    return loc.evaluate((el) => {
      if (!el || el.classList.contains("hidden")) return false;
      const st = getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden") return false;
      const r = el.getBoundingClientRect();
      return r.width > 2 && r.height > 2;
    });
  } catch {
    return false;
  }
}

async function clickFirst(page, selectors, opts = {}) {
  const timeout = opts.timeout || 800;
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).first();
      if (await loc.count()) {
        const vis = await loc.isVisible({ timeout: 200 }).catch(() => false);
        if (vis) {
          await loc.click({ timeout, force: !!opts.force });
          return sel;
        }
      }
    } catch {
      /* continue */
    }
  }
  return null;
}

async function clickText(page, selector, textRe, timeout = 800) {
  try {
    const loc = page.locator(selector).filter({ hasText: textRe }).first();
    if (await loc.count()) {
      if (await loc.isVisible({ timeout: 200 }).catch(() => false)) {
        await loc.click({ timeout });
        return true;
      }
    }
  } catch {
    /* ignore */
  }
  return false;
}

async function handlePrologue(page) {
  if (!(await isVisible(page, "#prologue-layer"))) return false;
  const skipped = await clickFirst(page, ["#prologue-skip"]);
  if (skipped) {
    tag("prologue_skip");
    return true;
  }
  await page.locator("#prologue-layer").click({ timeout: 500 }).catch(() => {});
  return true;
}

async function handleWorldMap(page, flags) {
  if (!(await isVisible(page, "#world-map-layer"))) return false;
  if (!flags.worldMapShot) {
    flags.worldMapShot = true;
    await page.waitForTimeout(800);
    await shot(page, "first_world_map", true);
    tag("world_map_open");
  }
  await clickFirst(page, ["#world-map-close"]);
  return true;
}

async function handleWorldScroll(page) {
  if (!(await isVisible(page, "#world-scroll-layer"))) return false;
  await clickFirst(page, ["#world-scroll-close"]);
  return true;
}

async function handlePopup(page, flags) {
  if (!(await isVisible(page, "#popup-layer"))) return false;
  const info = await page.evaluate(() => {
    const title = (document.getElementById("popup-title") || {}).textContent || "";
    const body = (document.getElementById("popup-body") || {}).textContent || "";
    const panel = document.getElementById("popup-panel");
    const cls = panel ? panel.className : "";
    const btnTexts = [...document.querySelectorAll("#popup-buttons .popup-btn, #popup-panel .popup-btn, .slot-confirm-btn, .battle-end-row .popup-btn")].map(
      (b) => ({ text: (b.textContent || "").replace(/\s+/g, " ").trim(), secondary: b.classList.contains("secondary"), cls: b.className })
    );
    const battle = !!document.querySelector(".battle-v2-zone, .battle-v2");
    const config = !!document.querySelector(".battle-v2-config, .slot-row");
    const speeds = [...document.querySelectorAll(".speed-btn")].map((b) => b.textContent);
    const tut = !!document.querySelector(".tut-banner, .tut-go");
    const insight = /心得/.test(title);
    return { title, body: body.slice(0, 240), cls, btnTexts, battle, config, speeds, tut, insight };
  });

  const key = `${info.title}|${info.battle}|${info.config}|${info.tut}`;
  if (flags.lastPopupKey !== key) {
    flags.lastPopupKey = key;
    tag("popup", {
      title: info.title,
      battle: info.battle,
      config: info.config,
      tut: info.tut,
      insight: info.insight,
      buttons: info.btnTexts.map((b) => b.text),
    });
    if (info.insight) {
      flags.insightPopups = (flags.insightPopups || 0) + 1;
      tag("insight_sanchose", { count: flags.insightPopups, title: info.title });
    }
    if (/心得三选一|择一缕心得/.test(info.title + info.body)) {
      flags.insightEveryRound = true;
    }
  }

  // 种族
  if (/择跟脚|何处来/.test(info.title) || info.btnTexts.some((b) => /人族/.test(b.text))) {
    const picked = await clickText(page, ".popup-btn", /人族|^人｜|人族｜/);
    await page.waitForTimeout(250);
    const confirmed = await clickText(page, ".race-confirm-btn, .popup-btn", /立此为命|确认/);
    if (picked || confirmed) {
      if (!flags.raceShot) {
        flags.raceShot = true;
        await shot(page, "after_race_choice", true);
      }
      tag("race_human");
      return true;
    }
  }

  // 配招教学：交换让同系相邻
  if (info.tut || (info.config && /教学|同系/.test(info.body + info.title))) {
    try {
      const cells = page.locator(".slot-cell.filled");
      const n = await cells.count();
      if (n >= 3) {
        await cells.nth(2).click({ timeout: 600 });
        await page.waitForTimeout(200);
        await cells.nth(1).click({ timeout: 600 });
        await page.waitForTimeout(400);
      }
    } catch {
      /* ignore */
    }
    const go = await clickText(page, "button", /开始斗法|试试威力|确认配招/);
    if (go) tag("slot_tutorial_confirm");
    return true;
  }

  if (info.config) {
    const ok = await clickText(page, "button", /确认配招|开始斗法/);
    if (ok) tag("slot_confirm");
    return true;
  }

  // 战斗中：加速 / 跳过 / 结算
  if (info.battle) {
    if (!flags.firstCombat) {
      flags.firstCombat = true;
      flags.firstCombatT = nowSec();
      await shot(page, "first_combat", true);
      tag("first_combat", { t: flags.firstCombatT, title: info.title, body: info.body.slice(0, 80) });
    }
    const end = await clickText(page, ".battle-end-row .popup-btn, .popup-btn.primary, .popup-btn", /收取战果|退出战圈|战后休整/);
    if (end) {
      tag("battle_end_click");
      return true;
    }
    if (!flags.battleSped) {
      flags.battleSped = true;
      await clickText(page, ".speed-btn", /2×|2x/);
    }
    const watched = flags.firstCombatT ? nowSec() - flags.firstCombatT : 0;
    if (watched > 12 || flags.combatCount > 0) {
      await clickText(page, ".speed-btn", /跳过/);
    }
    flags.battleWait = (flags.battleWait || 0) + 1;
    if (flags.battleWait > 80) {
      await shot(page, `anomaly_battle_stuck_${Math.floor(nowSec())}`, true);
      tag("anomaly_battle_stuck");
      anomalies.push({ t: nowSec(), kind: "battle_stuck", title: info.title });
      await clickText(page, ".speed-btn", /跳过/);
    }
    return true;
  }
  flags.battleWait = 0;
  flags.battleSped = false;

  // 战后休整
  if (/战后休整/.test(info.title)) {
    await clickText(page, ".popup-btn", /调息养气|敛气而去/);
    tag("rest_choice");
    return true;
  }

  // 遭遇：优先斗法
  const battleBtn = info.btnTexts.find((b) => /应战|斗法镇杀|出手相助|斗法/.test(b.text) && !/绕行|避让|隔崖/.test(b.text));
  if (battleBtn) {
    const clicked = await clickText(page, ".popup-btn", new RegExp(battleBtn.text.slice(0, 4)));
    if (clicked) {
      tag("encounter_fight", { label: battleBtn.text });
      return true;
    }
  }

  // 机缘
  if (/机缘|榜文碎光/.test(info.title)) {
    if (/榜文碎光/.test(info.title) && !flags.bangwen) {
      flags.bangwen = true;
      flags.bangwenT = nowSec();
      await shot(page, "first_jinyuan_bangwen", true);
      tag("bangwen_suiguang", { t: flags.bangwenT });
    }
    const pri = info.btnTexts.find((b) => !b.secondary);
    if (pri) await clickText(page, ".popup-btn:not(.secondary)", new RegExp(pri.text.slice(0, 6)));
    else await clickFirst(page, ["#popup-buttons .popup-btn:not(.secondary)", "#popup-buttons .popup-btn"]);
    return true;
  }

  // 升重相关
  if (/金光|升重|吐纳完成|境界/.test(info.title)) {
    if (!flags.firstLevelPopup) {
      flags.firstLevelPopup = true;
      await shot(page, "first_shengzhong_popup", true);
    }
  }

  // 山河图误入弹窗（一般走 layer）
  if (/山河图/.test(info.title)) {
    await clickFirst(page, ["#popup-buttons .popup-btn"]);
    return true;
  }

  // 通用：点主按钮（非 secondary）
  const clicked = await clickFirst(page, [
    "#popup-buttons .popup-btn:not(.secondary)",
    "#popup-panel .popup-btn.primary",
    "#popup-buttons .popup-btn",
    "#popup-panel .popup-btn",
  ]);
  if (!clicked) {
    // 点蒙层外无按钮时记录
    flags.emptyPopup = (flags.emptyPopup || 0) + 1;
    if (flags.emptyPopup === 3) {
      await shot(page, `anomaly_popup_nobtn_${Math.floor(nowSec())}`, true);
      tag("popup_no_button", { title: info.title });
    }
  } else {
    flags.emptyPopup = 0;
  }
  return true;
}

async function handleSparkle(page, flags) {
  const n = await page.locator("#stage .sparkle").count().catch(() => 0);
  if (!n) return false;
  try {
    await page.locator("#stage .sparkle").first().click({ timeout: 400 });
    flags.sparkles = (flags.sparkles || 0) + 1;
    if (flags.sparkles === 1) tag("first_sparkle");
    return true;
  } catch {
    return false;
  }
}

async function handleHints(page, flags) {
  const hints = page.locator("#action-hints button.hint-btn");
  const n = await hints.count().catch(() => 0);
  if (!n) return false;
  const labels = [];
  for (let i = 0; i < n; i++) labels.push(await hints.nth(i).textContent());
  if (flags.lastHintJoin !== labels.join("|")) {
    flags.lastHintJoin = labels.join("|");
    tag("hints", { labels });
  }
  // 优先游历 / 斗法 / Boss / 观榜
  const prefer = /游历|斗法|挑战|Boss|山野|观榜|妖首|机缘/;
  for (let i = 0; i < n; i++) {
    const t = labels[i] || "";
    if (prefer.test(t)) {
      try {
        await hints.nth(i).click({ timeout: 600 });
        tag("hint_click", { label: t });
        if (/游历|山野/.test(t) && !flags.firstTravelClick) {
          flags.firstTravelClick = true;
          await shot(page, "first_youli_or_map", true);
          tag("first_travel_click");
        }
        return true;
      } catch {
        /* next */
      }
    }
  }
  return false;
}

async function closePanel(page) {
  if (!(await isVisible(page, "#panel-layer"))) return false;
  await clickFirst(page, ["#panel-close"]);
  return true;
}

async function openNav(page, panel) {
  const btn = page.locator(`#bottom-nav .nav-btn[data-panel="${panel}"]`);
  if (!(await btn.count())) return false;
  const locked = await btn.evaluate((el) => el.classList.contains("locked")).catch(() => true);
  if (locked) return false;
  await btn.click({ timeout: 800 }).catch(() => {});
  await page.waitForTimeout(250);
  return await isVisible(page, "#panel-layer");
}

async function tryTravel(page, flags, st) {
  if (st && st.current_action === "wild_travel") return false;
  const opened = await openNav(page, "map");
  if (!opened) return false;
  await page.waitForTimeout(200);
  if (!flags.firstTravelShot) {
    flags.firstTravelShot = true;
    await shot(page, "first_youli_or_map", true);
  }
  const go = await clickText(page, "#panel-body .card-btn, #panel-body .popup-btn, #panel-body button", /山野游历/);
  if (go) {
    flags.travelClicks = (flags.travelClicks || 0) + 1;
    tag("map_start_wild_travel", { n: flags.travelClicks });
    return true;
  }
  await closePanel(page);
  return false;
}

async function tryBoss(page, flags) {
  const opened = await openNav(page, "map");
  if (!opened) return false;
  await page.waitForTimeout(200);
  const go = await clickText(page, "#panel-body button", /斗法/);
  if (go) {
    tag("map_start_boss");
    flags.bossClicks = (flags.bossClicks || 0) + 1;
    return true;
  }
  await closePanel(page);
  return false;
}

async function trySpell(page, flags) {
  const opened = await openNav(page, "spell");
  if (!opened) return false;
  await page.waitForTimeout(250);
  const go = await clickText(page, "#panel-body .card-btn, #panel-body button", /^参悟$/);
  if (go) {
    tag("spell_canwu");
    flags.spellClicked = true;
    await page.waitForTimeout(300);
    await closePanel(page);
    return true;
  }
  await closePanel(page);
  return false;
}

async function tryObserve(page, flags) {
  const opened = await openNav(page, "chance");
  if (opened) {
    const go = await clickText(page, "#panel-body .popup-btn, #panel-body button", /观榜悟道/);
    if (go) {
      tag("observe_seal_click");
      flags.observeClicked = true;
      return true;
    }
    await closePanel(page);
  }
  return false;
}

async function clickMainIfNeeded(page, st, flags) {
  const label = st.mainLabel || "";
  const type = st.mainType || "";
  if (type === "acting") {
    // 吐纳节拍
    const beat = await page.locator("#main-btn.beat").count().catch(() => 0);
    if (beat) {
      await page.locator("#main-btn").click({ timeout: 400 }).catch(() => {});
      flags.beats = (flags.beats || 0) + 1;
    }
    return false;
  }
  const urgent = /升重|破劫|出关|机缘|天象有变|榜文/;
  if (urgent.test(label) || ["level_up", "breakthrough", "event", "claim", "treasure_choice"].includes(type)) {
    await page.locator("#main-btn").click({ timeout: 800 }).catch(() => {});
    tag("main_click", { type, label: label.slice(0, 40) });
    if (/升重/.test(label) && !flags.firstShengzhong) {
      flags.firstShengzhong = true;
      flags.firstShengzhongT = nowSec();
      await page.waitForTimeout(400);
      await shot(page, "first_shengzhong", true);
      tag("first_shengzhong", { t: flags.firstShengzhongT, realm: st.realm_id });
    }
    return true;
  }
  if (!st.auto_repeat && type === "action") {
    await page.locator("#main-btn").click({ timeout: 800 }).catch(() => {});
    tag("main_click_idle_start", { label: label.slice(0, 40) });
    return true;
  }
  return false;
}

async function ensureAuto(page, st, flags) {
  if (!st) return;
  if (st.auto_repeat) {
    flags.autoOn = true;
    return;
  }
  if (flags.holdAutoOff) return;
  if (!st.race_id) return;
  if (st.popupVisible || st.prologueOpen || st.mapOpen) return;
  const clicked = await clickFirst(page, ["#auto-toggle"]);
  if (clicked) {
    tag("auto_toggle_on");
    flags.autoOn = true;
  }
}

function detectP0(st, flags) {
  if (!st || st.error) return;
  const overflow = st.canLevelUp && st.mainType === "acting" && st.auto_repeat;
  if (overflow) {
    flags.p0_1_ticks = (flags.p0_1_ticks || 0) + 1;
    if (flags.p0_1_ticks === 4) {
      tag("P0-#1_acting_lock_levelup", {
        daoxing: st.daoxing_cur,
        need: st.daoxing_need,
        label: st.mainLabel,
      });
    }
  } else {
    flags.p0_1_ticks = 0;
  }
  const idleAuto =
    st.auto_repeat &&
    !st.current_action &&
    !st.canLevelUp &&
    !st.popupVisible &&
    !st.pending_event_id &&
    st.mainType !== "level_up" &&
    st.mainType !== "event" &&
    st.mainType !== "breakthrough";
  if (idleAuto) {
    flags.p0_2_ticks = (flags.p0_2_ticks || 0) + 1;
    if (flags.p0_2_ticks === 8) {
      tag("P0-#2_auto_idle_no_resume", { label: st.mainLabel, goal: st.current_goal_id });
    }
  } else {
    flags.p0_2_ticks = 0;
  }
  if (st.panelOpen && /升重|破劫/.test(st.mainLabel || "") && st.canLevelUp) {
    flags.panelCover = (flags.panelCover || 0) + 1;
    if (flags.panelCover === 3) tag("panel_covering_levelup");
  }
}

async function stuckRecover(page, st, flags) {
  const sig = `${st.realm_id}|${Math.floor(st.daoxing_cur)}|${st.mainLabel}|${st.current_action || ""}|${st.popupVisible}|${st.panelOpen}`;
  if (sig === flags.stuckSig) {
    if (Date.now() - flags.stuckSince > 60000) {
      flags.stuckSince = Date.now();
      await shot(page, `anomaly_stuck_${Math.floor(nowSec())}`, true);
      tag("stuck_60s", { sig, goal: st.current_goal_id });
      anomalies.push({ t: nowSec(), kind: "stuck_60s", sig });
      await handlePopup(page, flags);
      await closePanel(page);
      if (st.mapOpen) await clickFirst(page, ["#world-map-close"]);
      await handleHints(page, flags);
      if (st.auto_repeat) {
        await clickFirst(page, ["#auto-toggle"]);
        await page.waitForTimeout(200);
        await clickFirst(page, ["#auto-toggle"]);
      } else {
        await clickFirst(page, ["#auto-toggle"]);
      }
      const rq = realmRank(st.realm_id);
      if (rq >= 3) await tryTravel(page, flags, st);
      return true;
    }
  } else {
    flags.stuckSig = sig;
    flags.stuckSince = Date.now();
  }
  return false;
}

function realmRank(id) {
  const m = String(id || "").match(/^rq_(\d+)/);
  if (m) return Number(m[1]);
  if (/^zr_/.test(id || "")) return 100 + Number((id.match(/(\d+)/) || [0, 0])[1]);
  return 0;
}

async function goalDrive(page, st, flags) {
  if (!st || st.popupVisible || st.prologueOpen || st.mapOpen || st.battleOn) return false;
  const rq = realmRank(st.realm_id);
  const travels = Number((st.action_counts || {}).wild_travel || 0);
  const observes = Number((st.action_counts || {}).observe_seal || 0);
  const boss001 = Number((st.boss_clears || {}).boss_001 || 0);
  const learned = (st.spellNames || []).length;
  const t = nowSec();

  // 首战窗口：rq_03 后尽快游历
  if (rq >= 3 && travels === 0 && t - (flags.lastTravelTry || 0) > 6) {
    flags.lastTravelTry = t;
    flags.holdAutoOff = false;
    return tryTravel(page, flags, st);
  }

  // 已游历但还没战斗：继续游历（遭遇才有首战）
  if (rq >= 3 && !flags.firstCombat && travels > 0 && travels < 8 && t - (flags.lastTravelTry || 0) > 12) {
    if (st.current_action === "wild_travel") return false;
    flags.lastTravelTry = t;
    return tryTravel(page, flags, st);
  }

  // 术法：rq_04+ 且未参悟
  if (rq >= 4 && learned === 0 && t - (flags.lastSpellTry || 0) > 12) {
    flags.lastSpellTry = t;
    return trySpell(page, flags);
  }

  // 观榜：rq_04+ 未触发 event_001
  const seenBangwen = (st.seen_events || []).includes("event_001") || flags.bangwen;
  if (rq >= 4 && !seenBangwen && observes === 0 && t - (flags.lastObserveTry || 0) > 10) {
    flags.lastObserveTry = t;
    // 机缘页可能锁到 rq_06：先试 hints，再试 缘，再关自动抢 hint
    if (await handleHints(page, flags)) return true;
    if (await tryObserve(page, flags)) return true;
    if (st.auto_repeat && !st.current_action) {
      // idle 窗口极短，立刻点主按钮若是机缘
      if (/机缘|观榜|天象/.test(st.mainLabel || "")) {
        await page.locator("#main-btn").click({ timeout: 500 }).catch(() => {});
        return true;
      }
    }
    if (st.auto_repeat && rq >= 4 && t > 60) {
      flags.holdAutoOff = true;
      if (st.auto_repeat) await clickFirst(page, ["#auto-toggle"]);
    }
    return false;
  } else if (seenBangwen && flags.holdAutoOff) {
    flags.holdAutoOff = false;
    await ensureAuto(page, { ...st, auto_repeat: false, race_id: st.race_id }, flags);
  }

  // 山野妖首 rq_05
  if (rq >= 5 && boss001 === 0 && t - (flags.lastBossTry || 0) > 18) {
    flags.lastBossTry = t;
    if (await handleHints(page, flags)) return true;
    return tryBoss(page, flags);
  }

  // 持续游历增加遭遇
  if (rq >= 3 && t > 90 && t - (flags.lastTravelTry || 0) > 40 && travels < 10 && st.current_action !== "wild_travel") {
    flags.lastTravelTry = t;
    return tryTravel(page, flags, st);
  }
  return false;
}

async function timedShots(page, t, flags) {
  const marks = [
    [180, "t_3min"],
    [480, "t_8min"],
    [900, "t_15min"],
    [1320, "t_22min"],
    [1800, "t_30min"],
  ];
  for (const [sec, name] of marks) {
    if (t >= sec && !flags[`shot_${name}`]) {
      flags[`shot_${name}`] = true;
      await shot(page, name, true);
    }
  }
}

async function dump(page, extra = {}) {
  const finalState = await snapState(page).catch(() => null);
  const payload = {
    generated_at: new Date().toISOString(),
    duration_s: nowSec(),
    port: PORT,
    url: BASE,
    extra,
    snapshots: timeline.snapshots,
    events: timeline.events,
    anomalies,
    flags_note: extra.flags || {},
    final: finalState,
  };
  fs.writeFileSync(path.join(OUT, "timeline.json"), JSON.stringify(payload, null, 2));
  fs.writeFileSync(path.join(OUT, "console.json"), JSON.stringify(consoleLog, null, 2));
  fs.writeFileSync(path.join(OUT, "final_state.json"), JSON.stringify(finalState, null, 2));
}

async function main() {
  fs.writeFileSync(path.join(OUT, "play.log"), `start ${new Date().toISOString()} ${BASE}\n`);
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    locale: "zh-CN",
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  await context.addInitScript(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {}
  });
  const page = await context.newPage();
  const h = recordConsole();
  page.on("console", h.onConsole);
  page.on("pageerror", h.onPageError);
  page.on("requestfailed", h.onRequestFailed);
  page.on("response", h.onResponse);

  t0 = Date.now();
  await page.goto(BASE, { waitUntil: "load", timeout: 30000 });
  await shot(page, "00_first_paint", true);
  tag("first_paint");

  await page.waitForFunction("typeof Game !== 'undefined' && Game.state && Game.state.realm_id", { timeout: 30000 });
  tag("game_ready", { realm: await page.evaluate("Game.state.realm_id") });

  const flags = {
    stuckSig: "",
    stuckSince: Date.now(),
    insightPopups: 0,
    sparkles: 0,
    combatCount: 0,
  };

  let lastSnap = 0;
  let lastRealm = "";
  let lastDaoxing = -1;
  let firstFeedback = false;

  while (Date.now() - t0 < DURATION_MS) {
    const t = nowSec();
    let st = await snapState(page);
    if (st && !st.error) {
      if (!firstFeedback && (st.daoxing_cur > 0 || (st.action_counts || {}).breath_cycle > 0)) {
        firstFeedback = true;
        flags.firstFeedbackT = t;
        tag("first_feedback", { t, daoxing: st.daoxing_cur, label: st.mainLabel });
      }
      if (st.realm_id && st.realm_id !== lastRealm) {
        tag("realm_change", { from: lastRealm, to: st.realm_id, display: st.display_realm, identity: st.identity });
        lastRealm = st.realm_id;
        if (st.realm_id === "rq_02" || /升重/.test(st.logs0 || "")) {
          if (!flags.firstShengzhong) {
            flags.firstShengzhong = true;
            flags.firstShengzhongT = t;
            await shot(page, "first_shengzhong", true);
          }
        }
      }
      if (st.daoxing_cur !== lastDaoxing && lastDaoxing >= 0 && st.daoxing_cur > lastDaoxing && !firstFeedback) {
        firstFeedback = true;
        flags.firstFeedbackT = t;
        tag("first_feedback", { t, daoxing: st.daoxing_cur });
      }
      lastDaoxing = st.daoxing_cur;
      if ((st.boss_clears || {}).boss_001 > 0 && !flags.bossCleared) {
        flags.bossCleared = true;
        flags.bossT = t;
        tag("boss_001_cleared", { t });
        await shot(page, "boss_yaoshou_cleared", true);
      }
      if ((st.action_counts || {}).wild_travel > 0 && !flags.travelDone) {
        flags.travelDone = true;
        flags.travelT = t;
        tag("first_travel_done", { t });
      }
      if ((st.spellNames || []).length > 0 && !flags.spellLearned) {
        flags.spellLearned = true;
        flags.spellT = t;
        tag("first_spell", { t, spells: st.spellNames });
      }
      if ((st.seen_events || []).includes("event_001") && !flags.bangwen) {
        flags.bangwen = true;
        flags.bangwenT = t;
        tag("bangwen_seen_events", { t });
      }
      detectP0(st, flags);
    }

    if (t - lastSnap >= SNAP_MS / 1000 || lastSnap === 0) {
      lastSnap = t;
      const snap = {
        t: +t.toFixed(1),
        realm_id: st && st.realm_id,
        display_realm: st && st.display_realm,
        daoxing: st && st.daoxing_cur,
        daoxing_need: st && st.daoxing_need,
        mainLabel: st && st.mainLabel,
        mainType: st && st.mainType,
        popupKind: st && (st.popupTitle || st.popupKindQueued),
        auto_repeat: st && st.auto_repeat,
        current_action: st && st.current_action,
        combatPower: st && st.combatPower,
        logs0: st && st.logs0,
        goal: st && st.current_goal_id,
        goalReward: st && st.goalReward,
        hints: st && st.hints,
        identity: st && st.identity,
        panelOpen: st && st.panelOpen,
        canLevelUp: st && st.canLevelUp,
        pending_event_id: st && st.pending_event_id,
      };
      timeline.snapshots.push(snap);
      logLine(
        `SNAP r=${snap.realm_id} dx=${snap.daoxing}/${snap.daoxing_need} main=${snap.mainLabel} act=${snap.current_action} auto=${snap.auto_repeat} goal=${snap.goal} pop=${snap.popupKind || "-"}`
      );
      await dump(page, { flags });
    }

    await timedShots(page, t, flags);

    try {
      if (await handlePrologue(page)) {
        await page.waitForTimeout(200);
        continue;
      }
      if (await handleWorldMap(page, flags)) {
        await page.waitForTimeout(300);
        continue;
      }
      if (await handleWorldScroll(page)) {
        await page.waitForTimeout(200);
        continue;
      }
      if (await handlePopup(page, flags)) {
        await page.waitForTimeout(250);
        continue;
      }

      st = (await snapState(page)) || st;
      if (st && st.panelOpen && !flags.workingPanel) {
        // 面板遮挡：若不是我们刚打开的，收起
        if (t - (flags.panelOpenedAt || 0) > 6) {
          await closePanel(page);
        }
      }

      await handleSparkle(page, flags);
      await ensureAuto(page, st, flags);
      const hinted = await handleHints(page, flags);
      if (!hinted) await clickMainIfNeeded(page, st, flags);
      await goalDrive(page, st, flags);
      await stuckRecover(page, st, flags);
    } catch (e) {
      logLine(`LOOP_ERR ${e.message}`);
      anomalies.push({ t, kind: "loop_err", message: e.message });
    }

    await page.waitForTimeout(LOOP_MS);
  }

  const final = await snapState(page);
  await shot(page, "t_30min", true);
  await shot(page, "zz_final", true);
  tag("run_end", { final_realm: final && final.realm_id, daoxing: final && final.daoxing_cur });
  await dump(page, { flags, done: true });
  await browser.close();
  logLine("DONE");
}

main().catch((err) => {
  console.error(err);
  fs.appendFileSync(path.join(OUT, "play.log"), `FATAL ${err.stack || err}\n`);
  process.exit(1);
});
