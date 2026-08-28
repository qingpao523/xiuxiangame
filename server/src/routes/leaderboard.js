"use strict";
// ============================================================================
// server/src/routes/leaderboard.js —— 排行榜（design/20.0 Step6）
//   GET /api/leaderboard?limit=50   按境界(sort_order)→战力→Boss击杀 排名
//
// 排名依据 player.profile（服务端在 ops/state 写入时维护的可信摘要），
// 不直接信任 state 里可被客户端 PUT 改动的字段做排序键之外的展示。
// ============================================================================
const fs = require("fs");
const path = require("path");
const express = require("express");
const { players } = require("../db");

// —— 境界排序表：从 web/data/realm_table.json 读 sort_order / realm_name ——
const REALM_TABLE_PATH = path.join(__dirname, "..", "..", "..", "web", "data", "realm_table.json");
const REALM_ORDER = new Map(); // realm_id -> sort_order
const REALM_NAME = new Map();  // realm_id -> realm_name
(function loadRealmTable() {
  try {
    const t = JSON.parse(fs.readFileSync(REALM_TABLE_PATH, "utf8"));
    for (const r of t.rows || []) {
      REALM_ORDER.set(String(r.realm_id), Number(r.sort_order) || 0);
      REALM_NAME.set(String(r.realm_id), String(r.realm_name || r.realm_id));
    }
  } catch (e) {
    console.warn("[leaderboard] 读取 realm_table.json 失败，排序退化为数字后缀：", e.message);
  }
})();

function realmOrder(realmId) {
  const o = REALM_ORDER.get(String(realmId));
  if (o != null) return o;
  const m = /(\d+)$/.exec(String(realmId || "")); // 退化：rq_07 -> 7
  return m ? Number(m[1]) : 0;
}

// 从 state 派生可信摘要 profile（服务端写入时调用，存到 player.profile）。
// combat_power 优先用服务端 op 算出的真值（opts.combatPower），否则用境界基础值近似。
function deriveProfile(state, opts = {}) {
  const s = state || {};
  const realmId = String(s.realm_id || "rq_01");
  let combatPower = Number(opts.combatPower);
  if (!Number.isFinite(combatPower)) {
    // 近似：境界基础 100 + 重数加成（真值由 ops 的 RealmManager.getCombatPower 提供）
    combatPower = 100 + realmOrder(realmId) * 20;
  }
  let totalClears = 0;
  const bc = s.boss_clears;
  if (bc && typeof bc === "object" && !Array.isArray(bc)) {
    for (const k of Object.keys(bc)) totalClears += Number(bc[k]) || 0;
  } else {
    totalClears = Number(bc) || 0;
  }
  return {
    realm_id: realmId,
    realm_name: REALM_NAME.get(realmId) || realmId,
    realm_order: realmOrder(realmId),
    combat_power: Math.round(combatPower),
    boss_clears_total: totalClears,
    level: Number(s.level) || 0,
    updatedAt: Date.now(),
  };
}

const router = express.Router();

// 匿名展示（隐藏密码哈希，手机号/邮箱打码）
function mask(doc) {
  const email = doc.email ? String(doc.email).replace(/^(.).*(@.*)$/, "$1***$2") : null;
  const phone = doc.phone ? String(doc.phone).replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2") : null;
  return email || phone || ("修士" + String(doc._id).slice(-4));
}

router.get("/leaderboard", async (req, res) => {
  let limit = Number(req.query.limit) || 50;
  if (limit < 1) limit = 1;
  if (limit > 100) limit = 100;
  const docs = await players().find({}).toArray();
  const ranked = docs
    .map((d) => ({ doc: d, p: d.profile || deriveProfile(d.state) }))
    .sort((a, b) =>
      (b.p.realm_order - a.p.realm_order) ||
      (b.p.combat_power - a.p.combat_power) ||
      (b.p.boss_clears_total - a.p.boss_clears_total)
    )
    .slice(0, limit)
    .map((x, i) => ({
      rank: i + 1,
      name: mask(x.doc),
      realm_id: x.p.realm_id,
      realm_name: x.p.realm_name,
      combat_power: x.p.combat_power,
      boss_clears_total: x.p.boss_clears_total,
    }));
  res.json({ ok: true, count: ranked.length, leaderboard: ranked });
});

module.exports = { router, deriveProfile, realmOrder };
