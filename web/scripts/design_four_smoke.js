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
const skillTable = JSON.parse(fs.readFileSync(path.join(root, "data/skill_table.json"), "utf8"));
const realmOrder = {};
[...realmTable.rows].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).forEach((r, i) => { realmOrder[r.realm_id] = i; });
const eventById = {};
for (const row of eventTable.rows) eventById[row.event_id] = row;
ctx.DataManager = {
  tables: { event_table: eventTable, realm_table: realmTable, skill_table: skillTable },
  realmOrder,
  getRows: (name) => (name === "event_table" ? eventTable.rows : name === "skill_table" ? skillTable.rows : []),
  getById: (name, id) => (name === "event_table" ? eventById[String(id)] || {} : {}),
  isRealmAtLeast(currentId, requiredId) {
    if (!requiredId) return true;
    if (!(currentId in realmOrder) || !(requiredId in realmOrder)) return false;
    return realmOrder[currentId] >= realmOrder[requiredId];
  },
};
let fakeDay = 1;
ctx.UnlockManager = {
  isUnlocked(state, id) { return (state.unlocked_ids || []).includes(id); },
  conditionMet(state, condition) {
    if (!condition || condition === "open" || condition === "开局") return true;
    if (condition in realmOrder) return ctx.DataManager.isRealmAtLeast(state.realm_id, condition);
    if (String(condition).startsWith("day_")) return fakeDay >= parseInt(condition.slice(4), 10);
    return false;
  },
  currentDay() { return fakeDay; },
};
ctx.RealmManager = {
  getCurrentRealm(state) { return realmTable.rows.find((r) => r.realm_id === state.realm_id) || { major_realm: "炼气士" }; },
};
vm.runInContext(fs.readFileSync(path.join(root, "js/skill-identity.js"), "utf8") + "\nthis.SkillIdentity = SkillIdentity;", ctx);
vm.runInContext(fs.readFileSync(path.join(root, "js/event-manager.js"), "utf8") + "\nthis.EventManager = EventManager;", ctx);
const EM = ctx.EventManager;
const SI = ctx.SkillIdentity;
const fails = [];
function assert(name, cond, detail) {
  if (cond) console.log("PASS", name);
  else { console.log("FAIL", name, detail || ""); fails.push(name); }
}

assert("稀有度四档都有行", ["common", "rare", "epic", "fate"].every((r) => eventTable.rows.some((x) => x.rarity === r)));
const st = { realm_id: "rq_04", unlocked_ids: ["event_system"], event_counts_today: {}, seen_events: [], event_pity: { days_without_rare: 0, got_rare_today: false }, created_at: Math.floor(Date.now() / 1000) };
fakeDay = 1;
const counts = { common: 0, rare: 0, epic: 0, fate: 0, other: 0 };
for (let i = 0; i < 400; i++) {
  st.event_counts_today = {};
  st.event_pity = { days_without_rare: 0, got_rare_today: false };
  const id = EM.rollEvent(st, "offline");
  const rar = EM._rarity(EM.getEvent(id));
  if (counts[rar] == null) counts.other++; else counts[rar]++;
}
assert("首次收菜保底只出普通或精良", counts.epic + counts.fate === 0 && counts.common + counts.rare === 400, JSON.stringify(counts));

fakeDay = 3;
st.seen_events = [];
st.event_counts_today = {};
const rooted = EM.rollEvent(st, "offline");
assert("第3天跟脚保底 event_006", rooted === "event_006", rooted);

st.event_pity = { days_without_rare: 2, got_rare_today: false };
st.seen_events = ["event_006"];
st.event_counts_today = {};
fakeDay = 8;
const pityId = EM.rollEvent(st, "offline");
const pityR = EM._rarity(EM.getEvent(pityId));
assert("两日无稀有则首次升稀有或天命", pityR === "epic" || pityR === "fate", pityR + " " + pityId);

const body = skillTable.rows.find((r) => r.id === "skill_body_01");
assert("炼气仍叫炼体拳", SI.displayName(body, { realm_id: "rq_04" }) === "炼体拳");
assert("真人进阶金刚体", SI.displayName(body, { realm_id: "zr_01" }) === "金刚体");
assert("地仙进阶三头六臂", SI.displayName(body, { realm_id: "dx_01" }) === "三头六臂");
assert("天仙觉醒肉身成圣", SI.displayName(body, { realm_id: "tx_01" }) === "肉身成圣");
assert("天仙 class 神通", SI.skillClass(body, { realm_id: "tx_01" }) === "神通");
assert("炼气 class 法术", SI.skillClass(body, { realm_id: "rq_04" }) === "法术");
assert("雷归体修", SI.tixiOf("thunder") === "ti" && SI.tixiOf("body") === "ti");
assert("火与御器挂器修术法", SI.tixiOf("fire") === "qi" && SI.tixiOf("weapon") === "qi");

if (fails.length) { console.log("\nFAILED", fails.join(", ")); process.exit(1); }
console.log("\nDESIGN FOUR SMOKE PASS");
