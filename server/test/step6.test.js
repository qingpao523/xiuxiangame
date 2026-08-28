"use strict";
// ============================================================================
// server/test/step6.test.js —— Step6 验证（design/20.0）
// 完成标准：排行榜 + 反作弊（资源校验 / 频率限制 / 服务端权威）全 pass。
// 运行：cd server && node test/step6.test.js
// ============================================================================
const { MongoMemoryServer } = require("mongodb-memory-server");
const { connect, close } = require("../src/db");
const { app } = require("../src/app");

let failures = 0;
function assert(cond, msg) { if (cond) console.log(`  ✅ ${msg}`); else { console.log(`  ❌ ${msg}`); failures++; } }

async function jfetch(url, opts) {
  const r = await fetch(url, opts);
  let body = null;
  try { body = await r.json(); } catch (e) { /* 非 JSON */ }
  return { status: r.status, body, headers: r.headers };
}
const json = (o) => JSON.stringify(o);
const H = { "content-type": "application/json" };

async function register(base, phone) {
  const r = await jfetch(base + "/api/auth/register", { method: "POST", headers: H, body: json({ phone, password: "secret123" }) });
  return { token: r.body.token, jH: { ...H, authorization: "Bearer " + r.body.token }, authH: { authorization: "Bearer " + r.body.token } };
}

async function main() {
  console.log("========================================================");
  console.log(" Step6 验证：排行榜 + 反作弊（资源校验/频率限制/服务端权威）");
  console.log("========================================================");

  const mongod = await MongoMemoryServer.create();
  await connect(mongod.getUri(), "xiuxiangame_step6_test");
  const server = app.listen(0);
  await new Promise((res) => server.once("listening", res));
  const base = `http://127.0.0.1:${server.address().port}`;
  console.log("[server] " + base);

  try {
    // —— 两个账号：A 升重领先，B 新号 ——
    const A = await register(base, "13900000061");
    const B = await register(base, "13900000062");

    // 给 A 注入道行并升重 3 次，使其境界/战力高于 B
    const sA = await jfetch(base + "/api/state", { headers: A.authH });
    const stA = sA.body.state;
    for (const k of Object.keys(stA.resources)) stA.resources[k] = 1e9;
    await jfetch(base + "/api/state", { method: "PUT", headers: A.jH, body: json({ state: stA }) });
    let lastLevel = null;
    for (let i = 0; i < 3; i++) {
      lastLevel = await jfetch(base + "/api/progress/levelup", { method: "POST", headers: A.jH, body: json({}) });
    }
    assert(lastLevel.status === 200 && lastLevel.body.result.leveled === true, "A 升重成功（境界领先 B）");
    const realmA = lastLevel.body.result.to;

    // —— 排行榜：A 应排在 B 前，且名字打码 ——
    const lb = await jfetch(base + "/api/leaderboard?limit=50");
    assert(lb.status === 200 && lb.body.ok === true && Array.isArray(lb.body.leaderboard), "GET /api/leaderboard → 200 + 数组");
    const board = lb.body.leaderboard;
    assert(board.length >= 2, `排行榜含至少 2 名玩家（实际 ${board.length}）`);
    const rankA = board.findIndex((r) => r.realm_id === realmA);
    const rankB = board.findIndex((r) => r.realm_id === "rq_01");
    assert(rankA >= 0 && rankB >= 0 && rankA < rankB, `高境界 A(${realmA}) 排在新号 B(rq_01) 之前`);
    const top = board[0];
    assert(typeof top.combat_power === "number" && top.combat_power > 0, "排行榜条目含战力数值");
    assert(!/13900000061|13900000062/.test(JSON.stringify(board)), "排行榜名字已打码（不含完整手机号）");

    // —— 反作弊①：资源校验（PUT 非法 state → 400）——
    const bad1 = JSON.parse(JSON.stringify(stA)); bad1.resources.mana = -500;
    const r1 = await jfetch(base + "/api/state", { method: "PUT", headers: A.jH, body: json({ state: bad1 }) });
    // 负数被钳制为 0（合法化），不报错；真正拒绝的是 NaN/Infinity/非法 realm
    assert(r1.status === 200, "PUT 负数资源 → 被钳制为合法（200）");
    const afterNeg = await jfetch(base + "/api/state", { headers: A.authH });
    assert(afterNeg.body.state.resources.mana === 0, "负数资源被钳制为 0");

    const bad2 = JSON.parse(JSON.stringify(stA)); bad2.resources.mana = "not-a-number";
    const r2 = await jfetch(base + "/api/state", { method: "PUT", headers: A.jH, body: json({ state: bad2 }) });
    assert(r2.status === 400, "PUT 非数值资源(NaN) → 400 拒绝");

    const bad3 = JSON.parse(JSON.stringify(stA)); bad3.realm_id = "rq_HACK";
    const r3 = await jfetch(base + "/api/state", { method: "PUT", headers: A.jH, body: json({ state: bad3 }) });
    assert(r3.status === 400, "PUT 非法 realm_id → 400 拒绝");

    const big = JSON.parse(JSON.stringify(stA)); big.resources.mana = 1e18;
    const r4 = await jfetch(base + "/api/state", { method: "PUT", headers: A.jH, body: json({ state: big }) });
    const afterBig = await jfetch(base + "/api/state", { headers: A.authH });
    assert(r4.status === 200 && afterBig.body.state.resources.mana === 1e12, "天文数字资源被钳制到上限 1e12");

    // —— 反作弊②：频率限制（突破口 max=30/min，连发 35 次必触发 429）——
    let saw429 = false, sawLimitHeader = false, non429 = 0;
    for (let i = 0; i < 35; i++) {
      const rr = await jfetch(base + "/api/progress/breakthrough", { method: "POST", headers: A.jH, body: json({}) });
      if (rr.headers.get("x-ratelimit-limit")) sawLimitHeader = true;
      if (rr.status === 429) { saw429 = true; break; }
      else non429++;
    }
    assert(sawLimitHeader, "响应含 X-RateLimit-Limit 头");
    assert(saw429, `连续高频请求触发 429（前 ${non429} 次放行后限流）`);

    // —— 反作弊③：鉴权仍生效（无 token 打 Boss → 401）——
    const noauth = await jfetch(base + "/api/battle/boss", { method: "POST", headers: H, body: json({ bossId: "boss_001" }) });
    assert(noauth.status === 401, "无 token 打 Boss → 401");

    console.log("\n========================================================");
    if (failures === 0) { console.log(" ✅ Step6 通过：排行榜 + 反作弊（资源校验/频率限制/服务端权威）全链路 OK。"); process.exit(0); }
    else { console.log(` ❌ Step6 失败：${failures} 项断言未通过。`); process.exit(1); }
  } finally {
    server.close();
    await close();
    await mongod.stop();
  }
}

main().catch((e) => { console.error("\n❌ Step6 抛出异常："); console.error(e && e.stack ? e.stack : e); process.exit(1); });
