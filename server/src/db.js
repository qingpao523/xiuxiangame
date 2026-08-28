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
  // 手机号 / 邮箱 各自唯一。用 partial 索引（只对真实字符串值建索引）：
  // 用户可只填其一，缺省字段不入库（见 register），故不会因多个 null 触发唯一冲突。
  // 注意：sparse 仍会索引显式 null，故不能用 sparse 解决「多个只填手机号的用户」。
  await col.createIndex({ phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: "string" } } });
  await col.createIndex({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: "string" } } });
}

async function close() {
  if (client) await client.close();
  client = null;
  db = null;
}

module.exports = { connect, getDb, players, close };
