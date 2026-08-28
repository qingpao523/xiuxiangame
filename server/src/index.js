"use strict";
// ============================================================================
// server/src/index.js —— 服务入口（design/20.0 Step3）
// 环境变量：MONGO_URL（默认 mongodb://127.0.0.1:27017）、DB_NAME（默认 xiuxiangame）、
//           PORT（默认 3000）、JWT_SECRET、JWT_EXPIRES。
// ============================================================================
const { connect } = require("./db");
const { app } = require("./app");

const PORT = process.env.PORT || 3000;
const MONGO_URL = process.env.MONGO_URL || "mongodb://127.0.0.1:27017";
const DB_NAME = process.env.DB_NAME || "xiuxiangame";

(async () => {
  await connect(MONGO_URL, DB_NAME);
  app.listen(PORT, () => {
    console.log(`xiuxiangame-server listening on :${PORT} db=${DB_NAME} mongo=${MONGO_URL}`);
  });
})().catch((e) => {
  console.error("server failed to start:", e);
  process.exit(1);
});
