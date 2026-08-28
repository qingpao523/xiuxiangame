"use strict";
// ============================================================================
// server/src/db.js —— MongoDB 连接层（design/20.0 Step3）
// players collection：state 直接存 JSON 文档。
// ============================================================================
const { MongoClient } = require("mongodb");

let client = null;
let db = null;

async function connect(uri, dbName) {
  uri = uri || process.env.MONGO_URL || "mongodb://127.0.0.1:27017";
  dbName = dbName || process.env.DB_NAME || "xiuxiangame";
  client = new MongoClient(uri);
  await client.connect();
  db = client.db(dbName);
  await ensureIndexes(db);
  return db;
}

function getDb() {
  if (!db) throw new Error("DB not connected — call connect() first");
  return db;
}

function players() { return getDb().collection("players"); }

async function ensureIndexes(database) {
  const col = database.collection("players");
  // 手机号 / 邮箱 各自唯一；sparse 允许多个 null（用户可只填其一）
  await col.createIndex({ phone: 1 }, { unique: true, sparse: true });
  await col.createIndex({ email: 1 }, { unique: true, sparse: true });
}

async function close() {
  if (client) await client.close();
  client = null;
  db = null;
}

module.exports = { connect, getDb, players, close };
