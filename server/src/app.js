"use strict";
// ============================================================================
// server/src/app.js —— Express 应用（design/20.0 Step3）
// 路由：
//   GET  /api/health        健康检查（无鉴权）
//   POST /api/auth/register 注册（手机号/邮箱 + 密码）→ { token, player }
//   POST /api/auth/login    登录 → { token, player }
//   GET  /api/state         读 state（JWT 鉴权）→ { state }
//   PUT  /api/state         写 state（JWT 鉴权，upsert 整个 JSON 文档）→ { ok, updatedAt }
// players collection 文档形如：
//   { _id, phone?, email?, passwordHash, state: <游戏 state JSON>, createdAt, updatedAt }
// ============================================================================
const express = require("express");
const { players } = require("./db");
const { signToken, hashPassword, verifyPassword, authMiddleware } = require("./auth");
const { router: opsRouter } = require("./routes/ops");
const { createInitialState } = require("./game-runtime");

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use("/api", opsRouter); // Step4 核心操作：/api/action/tick、/api/progress/*、/api/battle/boss

function publicPlayer(doc) {
  return { id: String(doc._id), phone: doc.phone || null, email: doc.email || null };
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "xiuxiangame-server", ts: Date.now() });
});

// —— 注册 ——
app.post("/api/auth/register", async (req, res) => {
  const phone = req.body.phone ? String(req.body.phone).trim() : null;
  const email = req.body.email ? String(req.body.email).trim().toLowerCase() : null;
  const password = req.body.password ? String(req.body.password) : "";
  if (!phone && !email) return res.status(400).json({ error: "phone or email required" });
  if (password.length < 6) return res.status(400).json({ error: "password must be >= 6 chars" });

  const col = players();
  const or = [];
  if (phone) or.push({ phone });
  if (email) or.push({ email });
  const exists = await col.findOne({ $or: or });
  if (exists) return res.status(409).json({ error: "account already exists" });

  const now = Date.now();
  // 服务端权威生成初始 state（默认新号），存为 JSON 文档；注册即开局。
  const initialState = await createInitialState();
  const doc = { phone, email, passwordHash: hashPassword(password), state: initialState, createdAt: now, updatedAt: now };
  const r = await col.insertOne(doc);
  doc._id = r.insertedId;
  const token = signToken({ sub: String(doc._id), phone, email });
  res.status(201).json({ token, player: publicPlayer(doc) });
});

// —— 登录 ——
app.post("/api/auth/login", async (req, res) => {
  const phone = req.body.phone ? String(req.body.phone).trim() : null;
  const email = req.body.email ? String(req.body.email).trim().toLowerCase() : null;
  const password = req.body.password ? String(req.body.password) : "";
  if (!phone && !email) return res.status(400).json({ error: "phone or email required" });

  const col = players();
  const or = [];
  if (phone) or.push({ phone });
  if (email) or.push({ email });
  const doc = await col.findOne({ $or: or });
  if (!doc || !verifyPassword(password, doc.passwordHash)) {
    return res.status(401).json({ error: "invalid credentials" });
  }
  const token = signToken({ sub: String(doc._id), phone: doc.phone, email: doc.email });
  res.json({ token, player: publicPlayer(doc) });
});

// —— 读 state（鉴权）——
app.get("/api/state", authMiddleware, async (req, res) => {
  const { ObjectId } = require("mongodb");
  const doc = await players().findOne({ _id: new ObjectId(req.player.sub) });
  if (!doc) return res.status(404).json({ error: "player not found" });
  res.json({ state: doc.state || null, updatedAt: doc.updatedAt || null });
});

// —— 写 state（鉴权，upsert 整个 JSON 文档）——
app.put("/api/state", authMiddleware, async (req, res) => {
  const { ObjectId } = require("mongodb");
  const state = req.body.state;
  if (state === undefined) return res.status(400).json({ error: "state required" });
  const now = Date.now();
  await players().updateOne(
    { _id: new ObjectId(req.player.sub) },
    { $set: { state, updatedAt: now } }
  );
  res.json({ ok: true, updatedAt: now });
});

module.exports = { app };
