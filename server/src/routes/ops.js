"use strict";
// ============================================================================
// server/src/routes/ops.js —— 核心操作 API（design/20.0 Step4）
//   POST /api/action/tick           挂机推进
//   POST /api/progress/levelup      升重（消耗道行）
//   POST /api/progress/breakthrough 破劫（境界突破，服务端跑劫数战斗）
//   POST /api/battle/boss           打 Boss（服务端权威结算，奖励入账）
//
// 统一模式：读 DB player.state → game-runtime 服务端执行 → 写回新 state → 返回 result。
// 全部经 authMiddleware（JWT）保护。
// ============================================================================
const express = require("express");
const { ObjectId } = require("mongodb");
const { players } = require("../db");
const { authMiddleware } = require("../auth");
const { opTick, opLevelUp, opBreakthrough, opBossBattle } = require("../game-runtime");
const { rateLimit } = require("../middleware/rate-limit");
const { deriveProfile } = require("./leaderboard");
const { track } = require("../telemetry"); // 21.6 S1 漏斗埋点（write-only，字段白名单，失败静默）

const router = express.Router();
// 注意：不用 router.use(authMiddleware) —— 本 router 挂载在 /api 下，
//  blanket 中间件会拦截同前缀的 /api/auth/* （注册/登录无 token）导致 401。
// 因此逐路由挂 authMiddleware，未匹配路径（/auth/*）自然回落到 app.js 自身路由。

// 读当前玩家文档（含 state）
async function loadPlayer(req) {
  return players().findOne({ _id: new ObjectId(req.player.sub) });
}

// 写回 state，并同步维护服务端可信摘要 profile（排行榜用）。
// combatPower 优先取本次 op 算出的真值（result.combat_power）。
async function persistState(req, state, combatPower) {
  const profile = deriveProfile(state, combatPower != null ? { combatPower } : {});
  await players().updateOne(
    { _id: new ObjectId(req.player.sub) },
    { $set: { state, profile, updatedAt: Date.now() } }
  );
}

// 统一包装：读 state → 跑 op → 落库 → 返回 { state, result }
// trackFn（可选，21.6 S1）：落库后记漏斗节点；埋点失败静默，不影响响应。
function wrap(opFn, trackFn) {
  return async (req, res) => {
    const doc = await loadPlayer(req);
    if (!doc) return res.status(404).json({ error: "player not found" });
    const { state, result } = await opFn(doc.state || null, req.body || {});
    if (state) await persistState(req, state, result && result.combat_power);
    if (trackFn) { try { trackFn(state, result || {}, req.body || {}); } catch (e) { /* 埋点静默 */ } }
    res.json({ ok: true, result, state });
  };
}

// 频率限制（Step6 反作弊）：正常游玩远低于上限，拦截脚本刷接口。
const tickLimiter = rateLimit({ windowMs: 60000, max: 240 });
const levelLimiter = rateLimit({ windowMs: 60000, max: 120 });
const breakLimiter = rateLimit({ windowMs: 60000, max: 30 });
const bossLimiter = rateLimit({ windowMs: 60000, max: 30 });

router.post("/action/tick", authMiddleware, tickLimiter, wrap((state, body) => opTick(state, body)));

router.post("/progress/levelup", authMiddleware, levelLimiter, wrap(
  (state, body) => opLevelUp(state, body),
  (state) => track("realm_up", { realm_id: state && state.realm_id })
));

router.post("/progress/breakthrough", authMiddleware, breakLimiter, wrap(
  (state, body) => opBreakthrough(state, body),
  (state, result) => track(result && result.win ? "breakthrough_win" : "breakthrough_lose",
    { bt_id: result && result.bt_id, win: !!(result && result.win), realm_id: state && state.realm_id })
));

router.post("/battle/boss", authMiddleware, bossLimiter, wrap(
  (state, body) => opBossBattle(state, String(body.bossId || ""), body),
  (state, result, body) => track(result && result.win ? "boss_win" : "boss_lose",
    { boss_id: String(body.bossId || ""), win: !!(result && result.win), realm_id: state && state.realm_id })
));

module.exports = { router };
