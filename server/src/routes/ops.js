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

const router = express.Router();
// 注意：不用 router.use(authMiddleware) —— 本 router 挂载在 /api 下，
//  blanket 中间件会拦截同前缀的 /api/auth/* （注册/登录无 token）导致 401。
// 因此逐路由挂 authMiddleware，未匹配路径（/auth/*）自然回落到 app.js 自身路由。

// 读当前玩家文档（含 state）
async function loadPlayer(req) {
  return players().findOne({ _id: new ObjectId(req.player.sub) });
}

// 写回 state（仅当操作产生了新 state）
async function persistState(req, state) {
  await players().updateOne(
    { _id: new ObjectId(req.player.sub) },
    { $set: { state, updatedAt: Date.now() } }
  );
}

// 统一包装：读 state → 跑 op → 落库 → 返回 { state, result }
function wrap(opFn) {
  return async (req, res) => {
    const doc = await loadPlayer(req);
    if (!doc) return res.status(404).json({ error: "player not found" });
    const { state, result } = await opFn(doc.state || null, req.body || {});
    if (state) await persistState(req, state);
    res.json({ ok: true, result, state });
  };
}

router.post("/action/tick", authMiddleware, wrap((state, body) => opTick(state, body)));

router.post("/progress/levelup", authMiddleware, wrap((state, body) => opLevelUp(state, body)));

router.post("/progress/breakthrough", authMiddleware, wrap((state, body) => opBreakthrough(state, body)));

router.post("/battle/boss", authMiddleware, wrap((state, body) => opBossBattle(state, String(body.bossId || ""), body)));

module.exports = { router };
