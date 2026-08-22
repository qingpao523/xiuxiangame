"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..", "web", "data");

function load(name) {
  return JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
}

const mg = load("minigame_table.json");
const beats = load("beat_table.json");
const index = load("data_index.json");
const goals = load("chapter_goal_table.json");
const realms = load("realm_table.json");

let failed = 0;
function assert(cond, msg) {
  if (!cond) { console.error("FAIL", msg); failed++; }
  else console.log("ok ", msg);
}

assert(index.tables.includes("minigame_table.json"), "data_index 含 minigame_table");
assert(index.tables.includes("beat_table.json"), "data_index 含 beat_table");
const spirit = (mg.rows || []).find((r) => r.minigame_id === "spirit_tide");
assert(!!spirit, "灵潮玩法存在");
assert(spirit.lore_anchor && spirit.fsm && spirit.fsm[0].options.length === 3, "灵潮有锚点+三选");
assert(spirit.fsm[0].options.every((o) => o.id && o.label), "灵潮选项完整");
const tideBeat = (beats.rows || []).find((r) => r.minigame_id === "spirit_tide");
assert(!!tideBeat, "导演排了灵潮");
assert(tideBeat.day_min === 0 && tideBeat.opening_only === true, "灵潮只在开号第0天开局阶段");
assert(tideBeat.realm_min === "rq_04", "灵潮炼气四重起");
const reserved = (beats.rows || []).filter((r) => !r.minigame_id);
assert(reserved.length >= 4, "第1–7天日程有表位");

const g4 = (goals.rows || []).find((r) => r.goal_id === "goal_004");
assert(g4.complete_condition.require_battle === true, "游历目标要求斗法");
const g8 = (goals.rows || []).find((r) => r.goal_id === "goal_008");
const g9 = (goals.rows || []).find((r) => r.goal_id === "goal_009");
assert(g8.stage === "前30分钟" && g9.stage === "第1天", "妖首在开局，破劫在第1天");

const rq05 = (realms.rows || []).find((r) => r.realm_id === "rq_05");
const rq08 = (realms.rows || []).find((r) => r.realm_id === "rq_08");
assert((rq05.unlock_ids || []).includes("boss_001"), "rq_05 挂妖首");
assert(!(rq08.unlock_ids || []).includes("boss_001"), "rq_08 不再误挂妖首");

const daoxing = (realms.rows || []).filter((r) => String(r.realm_id).startsWith("rq_")).map((r) => r.required_daoxing_to_next);
assert(daoxing[0] === 10 && daoxing[6] === 260, "未改炼气道行曲线");

if (failed) { console.error("failed", failed); process.exit(1); }
console.log("all pass");
