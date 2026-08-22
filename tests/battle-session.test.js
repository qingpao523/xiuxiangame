"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = (c, m) => { if (!c) { console.error("FAIL", m); process.exitCode = 1; } else console.log("ok ", m); };

const src = fs.readFileSync(path.join(__dirname, "../web/js/battle-engine-v2.js"), "utf8");
const sandbox = {
  DataManager: { getRows: () => [], tables: {} },
  RealmManager: { getCombatPower: () => 1000 },
  int: (v, f = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : f; },
  num: (v, f = 0) => { const n = Number(v); return Number.isFinite(n) ? n : f; },
  str: (v, f = "") => (v == null ? f : String(v)),
  formatInt: (n) => String(n),
  getTodayOmen: () => ({}),
  console,
  Math,
};
vm.createContext(sandbox);
vm.runInContext(src + "\n;this.BattleEngineV2 = BattleEngineV2;", sandbox);
const E = sandbox.BattleEngineV2;

const state = { flags: { battle_v2_tutorial_done: true }, battle_slots: [], unlocked_skills: [], skill_levels: {}, treasures: {}, benming_school: "", race_id: "human", realm_id: "rq_04" };
const a = E.create(state, { name: "甲", enemy_power: 200, source: "debug" });
const b = E.create(state, { name: "乙", enemy_power: 200, source: "debug" });
assert(a.sessionId && b.sessionId && a.sessionId !== b.sessionId, "每场唯一 sessionId");
assert(a.aborted === false && b.aborted === false, "新场 aborted=false");
E.abort(a);
assert(a.aborted === true, "abort 置位");
assert(E.startPlayerRound(state, a).length === 0, "abort 后 startPlayerRound 空");
assert(E.executeSingleSlot(state, a, 0).length === 0, "abort 后 executeSingleSlot 空");
assert(E.enemyGapAct(state, a).length === 0, "abort 后 enemyGapAct 空");
const ev = E.startPlayerRound(state, b);
assert(Array.isArray(ev), "未 abort 的场仍可步进");
assert(b.aborted === false && b.name === "乙", "第二场不被第一场 abort 污染");
if (!process.exitCode) console.log("BATTLE SESSION PASS");
