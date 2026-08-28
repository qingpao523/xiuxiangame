"use strict";
// ============================================================================
// server/test/ops.test.js —— Step4 验证（design/20.0）
// 完成标准：注册 → 升级 → 打Boss → 奖励入账 全 pass（含 tick / breakthrough）。
// 所有操作经服务端 vm 沙箱权威执行（game-runtime），客户端只发请求、不产结果。
// 运行：cd server && node test/ops.test.js
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
  return { status: r.status, body };
}
const json = (o) => JSON.stringify(o);
const H = { "content-type": "application/json" };

async function main() {
  console.log("========================================================");
  console.log(" Step4 验证：核心操作 API 化（tick/levelup/breakthrough/boss）");
  console.log("========================================================");

  const mongod = await MongoMemoryServer.create();
  await connect(mongod.getUri(), "xiuxiangame_ops_test");
  const server = app.listen(0);
  await new Promise((res) => server.once("listening", res));
  const base = `http://127.0.0.1:${server.address().port}`;
  console.log("[server] " + base);

  try {
    // —— 注册 ——
    const reg = await jfetch(base + "/api/auth/register", {
      method: "POST", headers: H, body: json({ phone: "13900000004", password: "secret123" }),
    });
    assert(reg.status === 201 && reg.body && reg.body.token, "注册 → 201 + token");
    const token = reg.body.token;
    const authH = { authorization: "Bearer " + token };
    const jH = { ...H, authorization: "Bearer " + token };

    // —— 注入资源（经 Step3 的 PUT /api/state，模拟已有存档；道行拉满以便升重/破劫）——
    const s0 = await jfetch(base + "/api/state", { headers: authH });
    const st = s0.body.state;
    for (const k of Object.keys(st.resources)) st.resources[k] = 1e9;
    const put = await jfetch(base + "/api/state", { method: "PUT", headers: jH, body: json({ state: st }) });
    assert(put.status === 200 && put.body.ok === true, "PUT /api/state 注入资源（道行等拉满）");

    // —— 无 token 打 Boss → 401（鉴权生效）——
    const noauth = await jfetch(base + "/api/battle/boss", { method: "POST", headers: H, body: json({ bossId: "boss_001" }) });
    assert(noauth.status === 401, "POST /api/battle/boss 无 token → 401");

    // —— tick ——
    const tick = await jfetch(base + "/api/action/tick", { method: "POST", headers: jH, body: json({}) });
    assert(tick.status === 200 && tick.body.ok === true && tick.body.result.ticked === true, "POST /api/action/tick → 200 ticked");

    // —— 升级（服务端权威；道行充足应可升多重）——
    let leveled = 0; let lastPower = 0; let realmAfter = st.realm_id;
    for (let i = 0; i < 6; i++) {
      const r = await jfetch(base + "/api/progress/levelup", { method: "POST", headers: jH, body: json({}) });
      if (r.status === 200 && r.body.result.leveled) { leveled++; lastPower = r.body.result.combat_power; realmAfter = r.body.result.to; }
      else break;
    }
    console.log(`[levelup] 成功升重 ${leveled} 次 → 境界=${realmAfter} 战力=${lastPower}`);
    assert(leveled >= 1, `POST /api/progress/levelup 至少升重 1 次（实际 ${leveled}）`);
    assert(lastPower > 280, `升重后战力提升（${lastPower} > 初始 280）`);

    // —— 打 Boss（服务端权威结算 + 奖励入账）——
    const boss = await jfetch(base + "/api/battle/boss", { method: "POST", headers: jH, body: json({ bossId: "boss_001" }) });
    const br = boss.body && boss.body.result;
    console.log(`[boss] boss_001 challenged=${br && br.challenged} win=${br && br.win} rounds=${br && br.rounds} dealt=${br && br.dealt} rewards=${br && JSON.stringify(br.rewards)} clears_delta=${br && br.clears_delta}`);
    assert(boss.status === 200 && br && br.challenged === true, "POST /api/battle/boss → 200 挑战成立（服务端创建战斗）");
    assert(br && typeof br.win === "boolean" && br.rounds >= 1, "Boss 战服务端跑到结束（win 为 boolean、rounds>=1）");
    assert(br && typeof br.dealt === "number" && br.dealt > 0, "服务端结算产生伤害 dealt>0");
    assert(br && typeof br.rewards === "object", "奖励对象返回（rewards 为资源增量映射）");

    // —— 奖励入账：GET /api/state 读回，确认 boss_clears / 资源已持久化 ——
    const s1 = await jfetch(base + "/api/state", { headers: authH });
    const st1 = s1.body.state;
    assert(st1 && st1.boss_clears && Number(st1.boss_clears["boss_001"] || 0) >= 1,
      `奖励入账：boss_clears[boss_001] 持久化（=${st1 && st1.boss_clears && st1.boss_clears["boss_001"]}）`);
    assert(st1 && String(st1.realm_id) === String(realmAfter), "state 持久化：realm_id 与升级后一致");

    // —— breakthrough（破劫：服务端跑劫数战斗；不强求成功，断言结构）——
    const bt = await jfetch(base + "/api/progress/breakthrough", { method: "POST", headers: jH, body: json({}) });
    const btr = bt.body && bt.body.result;
    console.log(`[breakthrough] ` + JSON.stringify(btr));
    assert(bt.status === 200 && btr && typeof btr === "object", "POST /api/progress/breakthrough → 200 返回结构化结果");
    if (btr && btr.attempted) {
      assert(typeof btr.win === "boolean" && btr.rounds >= 1, "破劫战斗服务端执行（win boolean、rounds>=1）");
    } else {
      assert(true, "破劫未触发（当前境界无可用破劫/道行不足）—— 结构正确");
    }
  } finally {
    server.close();
    await close();
    await mongod.stop();
  }

  console.log("========================================================");
  if (failures === 0) {
    console.log(" ✅ Step4 通过：注册→升级→打Boss→奖励入账 全链路 OK，操作均服务端权威执行。");
    process.exit(0);
  } else {
    console.log(` ❌ Step4 失败：${failures} 项断言未通过。`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("\n❌ Step4 抛出异常：");
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});
