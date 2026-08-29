"use strict";
// ============================================================================
// test/ui-harness.js —— G1 渲染回归 harness（design/19.0 A4-①测试钉死）
//
// 目标：用 jsdom 加载真实 web/index.html DOM，在 jsdom window 上建 vm 上下文，
//       按 index.html 加载序把「逻辑层 + ui-constants + ui.js」跑进同一词法环境，
//       boot() 自动执行（无 ApiClient → 跳过 Step5 auth 门 → Game.init()），
//       从而拿到真实渲染后的 DOM 供快照比对。
//
// 确定性：Date 钉死到 FIXED_NOW、Math.random 用 LCG 种子，保证 omen/weather/今日
//         相关文案与任何随机分支在多次运行间完全一致（golden 快照可比对）。
// 源码 0 改动：全部靠桩 + vm，不改 web/js 任何文件。
// ============================================================================
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");
const { GAME_LOAD_ORDER, makeSeededRandom, WEB } = require("./harness");

const FIXED_NOW = Date.parse("2026-08-28T12:00:00Z");

// ui.js 在 game.js 之后追加加载（镜像 index.html：game.js→…→ui-constants→ui.js）。
// gameplay-engine.js（registerPopupRenderers 裸引用）+ content-director.js（保险）+ ui-constants.js（MAP_BACKGROUNDS/getCharacterPath）。
const PANEL_FILES = [
  "panels/realm-panel.js",
  "panels/map-panel.js",
  "panels/spell-panel.js",
  "panels/treasure-panel.js",
  "panels/chance-panel.js",
  "panels/log-panel.js",
];
const UI_LOAD_ORDER = [...GAME_LOAD_ORDER, "gameplay-engine.js", "content-director.js", "ui-constants.js", ...PANEL_FILES,
  // design/19.0 G3：Vue 面板路径（vendor global build + 适配器 + 已迁面板；镜像 index.html 顺序）
  "vendor/vue.global.prod.js", "panels/vue-panel-mount.js",
  "panels/treasure-panel-vue.js", "panels/chance-panel-vue.js", "panels/realm-panel-vue.js",
  "panels/spell-panel-vue.js", "panels/map-panel-vue.js", "panels/log-panel-vue.js",
  "ui.js"];

// 表现层桩：render()/boot() 中裸引用但无 DOM 动画语义的全局。返回值全部确定/falsy/no-op。
const UI_PRESENTATION_STUBS = {
  Atmosphere: {
    actionLine: () => "", breakthroughScene: () => false, playBreakthrough: () => {},
    phaseRitual: () => "", isPhaseTransition: () => false, playRitual: () => {},
  },
  WorldScroll: {
    getSealPressure: () => ({ value: 0, label: "封印稳固", tip: "" }),
    open() {}, close() {}, playPrologue(cb) { if (cb) cb(); },
  },
  WorldMap: { open() {}, close() {}, render() {} },
};

// 钉死时钟：无参 new Date() 与 Date.now() 恒返回 FIXED_NOW，带参构造透传。
function makeFixedDate(now) {
  class FixedDate extends Date {
    constructor(...a) { if (a.length === 0) super(now); else super(...a); }
    static now() { return now; }
  }
  return FixedDate;
}

// fetch 桩：按 web 根解析相对路径读文件（jsdom 无 fetch）。返回 {ok,status,json(),text()}。
function makeFetchStub(win) {
  return async (url) => {
    const rel = String(url).replace(/^\//, "").split("?")[0];
    const full = path.join(WEB, rel);
    try {
      const buf = fs.readFileSync(full);
      const text = buf.toString("utf8");
      return {
        ok: true, status: 200,
        json: async () => JSON.parse(text),
        text: async () => text,
      };
    } catch (e) {
      return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
    }
  };
}

async function bootUI(opts = {}) {
  const seed = opts.seed != null ? opts.seed : 20260828;
  const html = fs.readFileSync(path.join(WEB, "index.html"), "utf8");
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost/", pretendToBeVisual: true });
  const win = dom.window;

  // 确定性优先：钉死 Date、随机、setInterval（避免后台 tick 干扰快照）。
  win.Date = makeFixedDate(FIXED_NOW);
  const rng = makeSeededRandom(seed);
  win.Math.random = rng;
  const intervals = [];
  win.setInterval = (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; }; // 记录但不自动跑
  win.clearInterval = () => {};
  win.fetch = makeFetchStub(win);
  win.requestAnimationFrame = (cb) => win.setTimeout(cb, 0);

  // 表现层桩注入。
  for (const [k, v] of Object.entries(UI_PRESENTATION_STUBS)) win[k] = v;

  const context = vm.createContext(win);
  const loadList = opts.files || UI_LOAD_ORDER;
  for (const f of loadList) {
    const code = fs.readFileSync(path.join(WEB, "js", f), "utf8");
    vm.runInContext(code, context, { filename: f });
  }

  // 等 boot() 完成：轮询直到 Game.state 就绪且 #identity-line 有内容（render 跑过）。
  const ready = await new Promise((resolve) => {
    let tries = 0;
    const t = win.setInterval ? null : null;
    const id = global.setInterval(() => {
      tries++;
      let ok = false;
      try {
        ok = vm.runInContext("!!(typeof Game !== 'undefined' && Game.state && Game.state.realm_id)", context)
          && win.document.getElementById("identity-line").textContent.length > 0;
      } catch (e) { ok = false; }
      if (ok || tries > 200) { global.clearInterval(id); resolve(ok); }
    }, 5);
  });

  const bridge = vm.runInContext(
    "({ Game, DataManager, SaveManager, RealmManager, UnlockManager, GoalManager, BattleEngineV2, UI_RENDER: (typeof render === 'function' ? render : null) })",
    context
  );

  return {
    window: win,
    document: win.document,
    context,
    seed,
    ready,
    intervals,
    run: (code) => vm.runInContext(code, context),
    $: (id) => win.document.getElementById(id),
    ...bridge,
  };
}

module.exports = { bootUI, UI_LOAD_ORDER, UI_PRESENTATION_STUBS, FIXED_NOW };
