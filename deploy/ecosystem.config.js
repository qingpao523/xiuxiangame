"use strict";
// ============================================================================
// deploy/ecosystem.config.js —— PM2 进程配置（design/20.0 Step6 部署）
// 用法（服务器上）：
//   pm2 start deploy/ecosystem.config.js --env production
//   pm2 save && pm2 startup
// ============================================================================
module.exports = {
  apps: [
    {
      name: "xiuxiangame-server",
      script: "server/src/index.js",
      cwd: __dirname + "/..",
      // 集群模式利用多核。注意：频率限制是进程内 Map，N 个实例 → 每 IP/玩家
      // 的有效上限约为 N×max（非全局精确）。需严格全局限流时换 Redis 共享后端。
      instances: "max",
      exec_mode: "cluster",
      max_memory_restart: "512M",
      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
        MONGO_URL: "mongodb://127.0.0.1:27017",
        DB_NAME: "xiuxiangame",
        // JWT_SECRET 务必经环境变量注入真实随机值，勿用默认。
        JWT_SECRET: process.env.JWT_SECRET || "CHANGE_ME_TO_A_LONG_RANDOM_SECRET",
        JWT_EXPIRES: "7d",
      },
    },
  ],
};
