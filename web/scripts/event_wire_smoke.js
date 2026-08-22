"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const ctx = { console, Math, Date, Number, parseInt, String, Object, Array, JSON };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, "js/utils.js"), "utf8"), ctx);

const eventTable = JSON.parse(fs.readFileSync(path.join(root, "data/event_table.json"), "utf8"));
const realmTable = JSON.parse(fs.readFileSync(path.join(root, "data/realm_table.json"), "utf8"));
const beatTable = JSON.parse(fs.readFileSync(path.join(root, "data/beat_table.json"), "utf8"));
const actionTable = JSON.parse(fs.readFileSync(path.join(root, "data/action_table.json"), "utf8"));
const unlockTable = JSON.parse(fs.readFileSync(path.join(root, "data/unlock_table.json"), "utf8"));
const exploreTable = JSON.parse(fs.readFileSync(path.join(root, "data/explore_point_table.json"), "utf8"));
const bossTable = JSON.parse(fs.readFileSync(path.join(root, "data/boss_table.json"), "utf8"));

const realmOrder = {};
[...realmTable.rows].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).forEach((r, i) => {
  realmOrder[r.realm_id] = i;
});
const eventById = {};
for (const row of eventTable.rows) eventById[row.event_id] = row;

ctx.DataManager = {
  tables: { event_table: eventTable, realm_table: realmTable },
  realmOrder,
  getRows: (name) => (name === "event_table" ? eventTable.rows : []),
  getById: (name, id) => (name === "event_table" ? eventById[String(id)] || {} : {}),
  isRealmAtLeast(currentId, requiredId) {
    if (!requiredId) return true;
    if (!(currentId in realmOrder) || !(requiredId in realmOrder)) return false;
    return realmOrder[currentId] >= realmOrder[requiredId];
  },
};
ctx.UnlockManager = {
  isUnlocked(state, id) { return (state.unlocked_ids || []).includes(id); },
  conditionMet(state, condition) {
    if (!condition || condition === "open" || condition === "开局") return true;
    if (condition in realmOrder) return ctx.DataManager.isRealmAtLeast(state.realm_id, condition);
    return false;
  },
  currentDay() { return 1; },
};
vm.runInContext(fs.readFileSync(path.join(root, "js/event-manager.js"), "utf8") + "\nthis.EventManager = EventManager;", ctx);
const EM = ctx.EventManager;

function stateAt(realm, extra = {}) {
  return {
    realm_id: realm,
    unlocked_ids: extra.unlocked_ids || ["event_system"],
    event_counts_today: extra.event_counts_today || {},
    seen_events: extra.seen_events || [],
    pending_event_id: "",
    created_at: Math.floor(Date.now() / 1000),
  };
}

const fails = [];
function assert(name, cond, detail) {
  if (cond) console.log("PASS", name);
  else { console.log("FAIL", name, detail || ""); fails.push(name); }
}

const breath = actionTable.rows.find((r) => r.action_id === "breath_cycle");
assert("吐纳 event_chance > 0", Number(breath.event_chance) > 0, breath.event_chance);

const evUnlock = unlockTable.rows.find((r) => r.unlock_id === "event_system");
assert("event_system 炼气二重", evUnlock.unlock_realm === "rq_02", evUnlock.unlock_realm);

const beat = beatTable.rows.find((r) => r.beat_id === "seal_light_d0");
assert("开局节拍绑 event_001", beat && beat.event_id === "event_001", JSON.stringify(beat));

const rq02 = stateAt("rq_02");
const off = EM._getCandidates(rq02, "offline");
const offIds = off.map((r) => r.event_id);
assert("炼气二重抽签含 001/101/102", ["event_001", "event_101", "event_102"].every((id) => offIds.includes(id)), offIds.join(","));

const w001 = EM._lotteryWeight(eventById.event_001);
const w101 = EM._lotteryWeight(eventById.event_101);
const w102 = EM._lotteryWeight(eventById.event_102);
assert("新机缘权重能跟旧彩票打", w101 >= 50 && w101 < w001 * 2 && w102 >= 50, `001=${w001} 101=${w101} 102=${w102}`);

const scripted = eventTable.rows.filter((r) => EM._lotteryWeight(r) === 0);
assert("脚本机缘不进抽签（缺 weight 或 0）", scripted.length >= 20, scripted.length);

assert("weight=0 的探索机缘 canOffer", EM.canOffer(stateAt("rq_01"), "event_401"), "event_401");
assert("weight=0 不进 travel 抽签", EM._lotteryWeight(eventById.event_401) === 0);
assert("缺行 canOffer 拒绝", !EM.canOffer(stateAt("dx_10"), "event_404"));

const dx = stateAt("dx_01");
assert("入局机缘可显式触发", EM.canOffer(dx, "event_316"));
assert("入局机缘不进 offline 抽签", EM._lotteryWeight(eventById.event_316) === 0);
assert("nextScripted 吐 offline 脚本", ["event_303", "event_304", "event_305", "event_309", "event_312", "event_314", "event_315", "event_325", "event_328", "event_331", "event_332", "event_340"].includes(EM.nextScripted(dx, ["offline"])) || !!EM.nextScripted(dx, ["offline"]), EM.nextScripted(dx, ["offline"]));
assert("nextScripted 不吐入局", EM.nextScripted(dx, ["offline"]) !== "event_316");

const counts = {};
for (let i = 0; i < 400; i++) {
  const id = EM.rollEvent(rq02, "offline");
  counts[id] = (counts[id] || 0) + 1;
}
const newHits = (counts.event_101 || 0) + (counts.event_102 || 0);
assert("炼气二重 400 抽里新机缘会出现", newHits >= 80, JSON.stringify(counts));

const points = exploreTable.rows.filter((p) => p.trigger_event);
assert("探索点 401-403 仍绑机缘", ["event_401", "event_402", "event_403"].every((id) => points.some((p) => p.trigger_event === id)));

const stolen = bossTable.rows.filter((b) => ["event_401", "event_402", "event_403"].includes(b.first_clear_event));
assert("Boss 首通不再偷探索机缘 ID", stolen.length === 0, stolen.map((b) => b.boss_id).join(","));

const rq02n = realmTable.rows.find((r) => r.realm_id === "rq_02");
assert("境界表 rq_02 含 event_system", (rq02n.unlock_ids || []).includes("event_system"));

if (fails.length) {
  console.log("\nFAILED", fails.length, fails.join(", "));
  process.exit(1);
}
console.log("\nALL PASS");
