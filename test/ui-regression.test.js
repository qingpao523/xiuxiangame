"use strict";
// ============================================================================
// test/ui-regression.test.js —— G1 渲染回归黄金快照（design/19.0 A4-①测试钉死）
//
// 钉死口径：主按钮（label/dataset.type/actionId）、资源条（chip 数+名+值）、
// 导航徽章、身份行/天象/异象/进度/状态行、六抽屉（境界/游历/术法/本命法宝/
// 机缘/洞府）标题+卡片数+文本摘要、开局弹窗。
//
// 两个场景：S1 新号（rq_01，四抽屉锁）；S2 成长号（rq_06 全解锁+资源）。
// 用法：node test/ui-regression.test.js [--write]   --write 重新生成黄金文件。
// 确定性：ui-harness 钉死 Date=2026-08-28T12:00Z + LCG 随机种子，快照可复现。
// ============================================================================
const fs = require("fs");
const path = require("path");
const { bootUI } = require("./ui-harness");

const GOLDEN = path.join(__dirname, "golden", "ui-regression.json");
const PANELS = ["realm", "map", "spell", "treasure", "chance", "log"];
const PANEL_TITLES = { realm: "境界", map: "游历", spell: "术法", treasure: "本命法宝", chance: "机缘", log: "洞府" };
const NAV_KEYS = ["realm", "map", "spell", "treasure", "chance", "log"];

const norm = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();

function captureMain(h) {
  const btn = h.$("main-btn");
  return { label: norm(btn.textContent), type: btn.dataset.type || "", actionId: btn.dataset.actionId || "", cls: btn.className };
}

function captureTop(h) {
  return {
    identityLine: norm(h.$("identity-line").textContent),
    weatherLine: norm(h.$("weather-line").textContent),
    omenLine: norm(h.$("omen-line").textContent),
    goalText: norm(h.$("goal-text").textContent),
    goalReward: norm(h.$("goal-reward").textContent),
    progressLabel: norm(h.$("progress-label").textContent),
    progressFillWidth: h.$("progress-fill").style.width || "",
    statusLine: norm(h.$("status-line").textContent),
    autoToggle: { text: norm(h.$("auto-toggle").textContent), cls: h.$("auto-toggle").className },
    sealPressure: { level: h.$("seal-pressure").dataset.level || "", state: norm(h.$("seal-pressure-state").textContent), fillWidth: h.$("seal-pressure-fill").style.width || "" },
    treasureOrbHidden: h.$("treasure-orb").classList.contains("hidden"),
    fxSealLit: h.$("fx-seal").classList.contains("lit"),
    bgImage: h.$("bg").style.backgroundImage || "",
  };
}

function captureResources(h) {
  const strip = h.$("resource-strip");
  const chips = [...strip.querySelectorAll(".res-chip")].map((c) => ({
    name: norm(c.querySelector(".res-name")?.textContent),
    value: norm(c.querySelector(".res-value")?.textContent),
  }));
  return { count: strip.dataset.count || "", chips };
}

function captureNav(h) {
  return NAV_KEYS.map((key) => {
    const btn = h.document.querySelector(`.nav-btn[data-panel="${key}"]`);
    return { key, cls: btn.className, text: norm(btn.textContent) };
  });
}

function capturePanels(h) {
  const out = {};
  for (const key of PANELS) {
    const before = h.$("panel-title").textContent;
    h.run(`openPanelSheet(${JSON.stringify(key)})`);
    const title = norm(h.$("panel-title").textContent);
    const opened = title === PANEL_TITLES[key];
    const body = h.$("panel-body");
    out[key] = {
      opened,
      title,
      cards: body.querySelectorAll(".card").length,
      buttons: body.querySelectorAll("button").length,
      digest: norm(body.textContent).slice(0, 160),
    };
  }
  h.run("closePanelSheet()");
  return out;
}

function capturePopup(h) {
  return {
    layerCls: h.$("popup-layer").className,
    text: norm(h.$("popup-layer").textContent).slice(0, 200),
    queueKinds: h.run("Game.popupQueue.map(p => p.kind)"),
  };
}

function scenarioS1(h) {
  // 新号原样（boot 后：race_choice 弹窗在屏）
  return { main: captureMain(h), top: captureTop(h), resources: captureResources(h), nav: captureNav(h), panels: capturePanels(h), popup: capturePopup(h) };
}

function scenarioS2(h) {
  // 成长号：rq_06 全解锁 + 资源注入（确定性数值），强制刷新
  h.run(`
    Game.state.realm_id = "rq_06";
    UnlockManager.refresh(Game.state);
    Game.state.resources.mana = 12345;
    Game.state.resources.daoxing = 6789;
    Game.state.flags.auto_repeat = true;
    Game._afterMutated();
    render();
  `);
  return { main: captureMain(h), top: captureTop(h), resources: captureResources(h), nav: captureNav(h), panels: capturePanels(h), popup: capturePopup(h) };
}

function scenarioS3(h) {
  // 真人号：zr_01 解锁本命法宝（unlock_realm=zr_01）+ 破劫入口（rq_10），钉死法宝抽屉与破劫口径
  h.run(`
    Game.state.realm_id = "zr_01";
    UnlockManager.refresh(Game.state);
    Game.state.resources.daoxing = 0;
    Game.state.resources.mana = 5000;
    Game._afterMutated();
    render();
  `);
  return { main: captureMain(h), top: captureTop(h), resources: captureResources(h), nav: captureNav(h), panels: capturePanels(h), popup: capturePopup(h) };
}

function scenarioS4(h) {
  // 破劫待决：rq_10（破劫入口 unlock_realm=rq_10）+ 道行满足，钉死 breakthrough 主按钮口径。
  // 桩：isOpeningStage（开局期导演门控，与主按钮渲染无关；第1天恒为「前30分钟」）。
  h.run(`
    Game._origIsOpeningStage = Game.isOpeningStage;
    Game.isOpeningStage = () => false;
    Game.state.realm_id = "rq_10";
    UnlockManager.refresh(Game.state);
    Game.state.resources.daoxing = 99999;
    Game._afterMutated();
    render();
  `);
  const main = captureMain(h);
  const canAttempt = h.run("BreakthroughManager.canAttempt(Game.state)");
  const out = { main, canAttempt, top: captureTop(h), nav: captureNav(h), popup: capturePopup(h) };
  h.run(`Game.isOpeningStage = Game._origIsOpeningStage; delete Game._origIsOpeningStage;`);
  return out;
}

function diffGolden(golden, actual) {
  const g = JSON.stringify(golden, null, 2).split("\n");
  const a = JSON.stringify(actual, null, 2).split("\n");
  const lines = [];
  const n = Math.max(g.length, a.length);
  for (let i = 0; i < n && lines.length < 40; i++) {
    if (g[i] !== a[i]) lines.push(`  L${i + 1}\n    黄金: ${g[i]}\n    实际: ${a[i]}`);
  }
  return lines.join("\n");
}

async function main() {
  const write = process.argv.includes("--write");
  const h = await bootUI();
  if (!h.ready) { console.error("❌ UI harness 未就绪（boot 失败）"); process.exit(1); }

  const snapshot = {
    _meta: { seed: h.seed, fixedNow: "2026-08-28T12:00:00Z" },
    s1_fresh: scenarioS1(h),
    s2_unlocked: scenarioS2(h),
    s4_breakthrough: scenarioS4(h),
    s3_zhenren: scenarioS3(h),
  };

  if (write || !fs.existsSync(GOLDEN)) {
    fs.mkdirSync(path.dirname(GOLDEN), { recursive: true });
    fs.writeFileSync(GOLDEN, JSON.stringify(snapshot, null, 2) + "\n");
    console.log(`✅ 黄金快照已生成：${GOLDEN}`);
    process.exit(0);
  }

  const golden = JSON.parse(fs.readFileSync(GOLDEN, "utf8"));
  if (JSON.stringify(golden) === JSON.stringify(snapshot)) {
    console.log("✅ G1 渲染回归通过：主按钮/资源条/导航/六抽屉/弹窗 与黄金快照完全一致。");
    process.exit(0);
  }
  console.error("❌ G1 渲染回归失败：与黄金快照存在差异（前 40 行）：");
  console.error(diffGolden(golden, snapshot));
  console.error("\n若为有意改动，运行 node test/ui-regression.test.js --write 更新黄金快照。");
  process.exit(1);
}

main().catch((e) => { console.error("❌ 异常：", e && e.stack || e); process.exit(1); });
