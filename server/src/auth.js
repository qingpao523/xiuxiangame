"use strict";
// ============================================================================
// server/src/auth.js —— JWT + bcryptjs（design/20.0 Step3）
// 认证：手机号/邮箱 + 密码；JWT Bearer 保护 /api/state。
// bcryptjs 为纯 JS 实现，免 node-gyp 原生编译。
// ============================================================================
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const JWT_EXPIRES = process.env.JWT_EXPIRES || "7d";

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function hashPassword(pw) { return bcrypt.hashSync(pw, 10); }
function verifyPassword(pw, hash) { return bcrypt.compareSync(pw, hash); }

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: "missing token" });
  try {
    req.player = jwt.verify(m[1], JWT_SECRET); // { sub, phone, email }
    return next();
  } catch (e) {
    return res.status(401).json({ error: "invalid token" });
  }
}

module.exports = { signToken, hashPassword, verifyPassword, authMiddleware, JWT_SECRET };
