"use strict";
// ============================================================================
// server/dev.js —— 本地开发启动器（design/20.0）
// 无系统 mongod 时，用 mongodb-memory-server 起一个内存 MongoDB，再挂 app 监听 :3000。
// 仅用于本地开发/验证；生产用 src/index.js + 真实 MongoDB（阿里云）。
// 用法：node dev.js   （可选 PORT 环境变量）
// ============================================================================
const { MongoMemoryServer } = require("mongodb-memory-server");
const { connect } = require("./src/db");
const { app } = require("./src/app");

const PORT = process.env.PORT || 3000;

(async () => {
  const mem = await MongoMemoryServer.create();
  const uri = mem.getUri();
  await connect(uri, "xiuxiangame");
  app.listen(PORT, () => {
    console.log(`[dev] xiuxiangame-server listening on :${PORT} mongo=${uri} (in-memory)`);
  });
  process.on("SIGINT", async () => { await mem.stop(); process.exit(0); });
})().catch((e) => {
  console.error("[dev] failed to start:", e);
  process.exit(1);
});
