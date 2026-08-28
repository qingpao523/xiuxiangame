"use strict";
// ============================================================================
// test/harness.js —— 同构战斗引擎加载器（design/20.0 Step 1）
//
// 目的：在 Node.js 里运行 web/js 的浏览器逻辑层，源码 0 改动。
// 原理：
//   1. vm.createContext 建隔离沙箱，注入浏览器全局桩（document/window/localStorage/...）。
//   2. fetch 桩 backed by fs，按 web 根目录解析相对路径 → DataManager.loadAll() 原样可用。
//   3. 按 web/index.html 的 script 顺序把逻辑层文件依次 runInContext 进同一沙箱，
//      const 全局共享同一词法环境（等价于浏览器多 <script> 共享全局）。
//   4. Math.random 替换为可复现 LCG，使战斗结果可重复（客户端/服务端一致性代理验证）。
// ============================================================================
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const WEB = path.resolve(__dirname, "..", "web");

// 可复现伪随机（LCG）。同种子 → 同序列 → 同战斗结果。
function makeSeededRandom(seed) {
  let s = (seed >>> 0) || 1;
  return function () {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function makeFakeEl() {
  return {
    style: {}, dataset: {}, children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild(c) { this.children.push(c); return c; },
    removeChild() {}, insertBefore() {}, remove() {},
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    addEventListener() {}, removeEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    getContext() { return null; },
  };
}

function buildSandbox(seed) {
  const storage = (() => {
    const m = new Map();
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => void m.set(k, String(v)),
      removeItem: (k) => void m.delete(k),
      clear: () => void m.clear(),
    };
  })();

  // 复制 Math 全部自有属性，仅替换 random 为可复现版本
  const MathCopy = {};
  for (const k of Object.getOwnPropertyNames(Math)) {
    try { MathCopy[k] = Math[k]; } catch (_) { /* 忽略不可拷贝项 */ }
  }
  MathCopy.random = makeSeededRandom(seed);

  const sandbox = {
    console,
    Date, JSON, Number, String, Boolean, Array, Object, Map, Set, WeakMap, WeakSet,
    Promise, Proxy, Reflect, Symbol, RegExp, Error, TypeError, RangeError, SyntaxError,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
    setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
    Math: MathCopy,
    localStorage: storage,
    sessionStorage: storage,
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => makeFakeEl(),
      createTextNode: () => ({}),
      body: makeFakeEl(),
      documentElement: { style: {} },
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    navigator: { userAgent: "node-harness" },
    location: { search: "", href: "http://localhost/", origin: "http://localhost" },
    fetch: async (url) => {
      const rel = String(url).replace(/^\//, "");
      const p = path.join(WEB, rel);
      return {
        ok: true,
        status: 200,
        json: async () => JSON.parse(fs.readFileSync(p, "utf8")),
        text: async () => fs.readFileSync(p, "utf8"),
      };
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  return sandbox;
}

// Step 1 战斗聚焦的最小逻辑层加载序（镜像 web/index.html 相对顺序，剔除 DOM/UI 文件）。
// 引擎外部依赖中，仅 num/int/str(utils) 与 DataManager 不带 typeof 守卫，必须加载；
// 其余（RealmManager/ResonanceSystem/SkillIdentity/BossMechanicsV2/getTodayOmen/Game）均带守卫。
const BATTLE_LOAD_ORDER = [
  "utils.js",
  "constants.js",
  "data-manager.js",
  "realm-manager.js",
  "save-manager.js",
  "resonance-system.js",
  "skill-identity.js",
  "battle-engine-v2.js",
  "boss-mechanics-v2.js",
  "liupai-manager.js",
];

// 完整逻辑层（Step 2 起用；仍剔除 DOM/UI：audio-manager/battle-ui-v2/scroll-scene/
// atmosphere/world-scroll/world-map/ui-constants/ui/game.js）。
const FULL_LOGIC_LOAD_ORDER = [
  "utils.js", "constants.js", "data-manager.js", "realm-manager.js", "save-manager.js",
  "unlock-manager.js", "event-manager.js", "reward-manager.js", "action-manager.js",
  "goal-manager.js", "boss-manager.js", "breakthrough-manager.js", "resonance-system.js",
  "skill-identity.js", "battle-engine-v2.js", "boss-mechanics-v2.js", "liupai-manager.js",
  "gameplay-engine.js", "content-director.js",
];

async function bootEngine(opts = {}) {
  const seed = opts.seed != null ? opts.seed : 20260828;
  const loadList = opts.files || BATTLE_LOAD_ORDER;
  const sandbox = buildSandbox(seed);

  for (const f of loadList) {
    const code = fs.readFileSync(path.join(WEB, "js", f), "utf8");
    vm.runInContext(code, sandbox, { filename: f });
  }

  // 走 fetch 桩加载全部数据表（DataManager.loadAll 原样可用）
  await vm.runInContext("DataManager.loadAll()", sandbox);

  // 把沙箱内的 const 全局桥接到 host 可读
  const bridge = vm.runInContext(
    "({ DataManager, SaveManager, RealmManager, BattleEngineV2, BossMechanicsV2, " +
    "ResonanceSystem, SkillIdentity, ID_FIELDS, BOSS_DAILY_LIMIT })",
    sandbox
  );

  return {
    sandbox,
    seed,
    ...bridge,
    runInSandbox: (code) => vm.runInContext(code, sandbox),
  };
}

// 表现层 no-op 桩工厂：服务端无 DOM/动画，任意方法调用返回 undefined、任意属性访问返回新桩。
// 供 Step3+ 给纯表现全局打桩用（Step2 仅需 Atmosphere 显式桩）。
function makeNoopStub() {
  return new Proxy(function () {}, {
    get(t, prop) {
      if (prop === Symbol.toPrimitive) return () => "";
      if (prop === "then") return undefined; // 避免被当成 thenable
      return makeNoopStub();
    },
    apply() { return undefined; },
    set() { return true; },
  });
}

// Step2 起：game.js 及其依赖的逻辑层加载序（镜像 index.html 相对顺序）。
// 剔除 DOM/UI/表现层；ContentDirector、GameplayEngine 在 game.js 中均带 typeof 守卫，CraftMinigame 仅注释，故可省略。
const GAME_LOAD_ORDER = [
  "utils.js", "constants.js", "data-manager.js", "realm-manager.js", "save-manager.js",
  "unlock-manager.js", "event-manager.js", "reward-manager.js", "action-manager.js",
  "goal-manager.js", "boss-manager.js", "breakthrough-manager.js", "resonance-system.js",
  "skill-identity.js", "battle-engine-v2.js", "boss-mechanics-v2.js", "liupai-manager.js",
  "game.js",
];

// 表现层桩：Atmosphere 在 game.js 有 6 处裸引用（无 typeof 守卫，L304/617/618/1060/1061/1062），
// 服务端必须提供；返回值全部 falsy/no-op，使仪式/动画分支安全跳过。AudioManager 全部带守卫，留 undefined 即可。
const PRESENTATION_STUBS = {
  Atmosphere: {
    actionLine: () => "", breakthroughScene: () => false, playBreakthrough: () => {},
    phaseRitual: () => "", isPhaseTransition: () => false, playRitual: () => {},
  },
};

async function bootGame(opts = {}) {
  const seed = opts.seed != null ? opts.seed : 20260828;
  const sandbox = buildSandbox(seed);
  for (const [k, v] of Object.entries(PRESENTATION_STUBS)) sandbox[k] = v;
  const loadList = opts.files || GAME_LOAD_ORDER;
  for (const f of loadList) {
    const code = fs.readFileSync(path.join(WEB, "js", f), "utf8");
    vm.runInContext(code, sandbox, { filename: f });
  }
  await vm.runInContext("DataManager.loadAll()", sandbox);
  const bridge = vm.runInContext(
    "({ Game, DataManager, SaveManager, RealmManager, UnlockManager, EventManager, RewardManager, " +
    "GoalManager, BossManager, BreakthroughManager, BattleEngineV2, BossMechanicsV2, ResonanceSystem, SkillIdentity })",
    sandbox
  );
  return { sandbox, seed, ...bridge, runInSandbox: (c) => vm.runInContext(c, sandbox) };
}

module.exports = { bootEngine, bootGame, buildSandbox, makeSeededRandom, makeNoopStub, WEB, BATTLE_LOAD_ORDER, FULL_LOGIC_LOAD_ORDER, GAME_LOAD_ORDER, PRESENTATION_STUBS };
