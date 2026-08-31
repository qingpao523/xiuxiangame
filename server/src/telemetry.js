"use strict";
// ============================================================================
// server/src/telemetry.js —— 漏斗埋点（design/21.6 S1，第 3 批）
//
// 数据三立法（21.6 §3.3，本模块是其执行体）：
//   1. 数据只能回答"在哪一分钟"，不能回答"改什么"——本模块只写不读，
//      游戏逻辑零依赖（write-only），任何"数据说应该 X"的提案格式上不成立。
//   2. 拒绝优化的指标——本模块不记录点击数/爽点密度类指标，只记漏斗节点。
//   3. 字段白名单——不记录资源数量/战力数值，数据永远无法驱动数值调整。
//
// 存储：append-only JSONL（production/telemetry/funnel.jsonl），失败静默不阻塞游玩。
// ============================================================================
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "..", "production", "telemetry", "funnel.jsonl");

// 事件白名单：漏斗节点（注册/首战/首术/首机缘/升重/破劫成败/Boss 成败/退出）
const EVENTS = new Set([
  "register", "first_combat", "first_spell", "first_event",
  "realm_up", "breakthrough_win", "breakthrough_lose",
  "boss_win", "boss_lose", "exit",
]);

// 字段白名单：只记漏斗定位所需的最小字段；无资源/战力数值（立法 3）
const FIELD_KEYS = new Set(["realm_id", "boss_id", "bt_id", "win", "account_day"]);

function track(event, fields) {
  if (!EVENTS.has(String(event))) return;
  const rec = { t: Date.now(), event: String(event) };
  for (const k of Object.keys(fields || {})) {
    if (FIELD_KEYS.has(k)) rec[k] = fields[k];
  }
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.appendFileSync(FILE, JSON.stringify(rec) + "\n");
  } catch (e) { /* 埋点失败静默——永不阻塞游玩 */ }
}

module.exports = { track, TELEMETRY_FILE: FILE };
