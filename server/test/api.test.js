"use strict";
// ============================================================================
// server/test/api.test.js —— Step3 验证（design/20.0）
// 完成标准：注册 → 登录 → 读 state（并写 state  round-trip）全 pass。
// 用 mongodb-memory-server 起内存 mongod（二进制已缓存），无需本地装 MongoDB。
// 等价于 curl 流程：
//   curl POST /api/auth/register / login，curl GET/PUT /api/state（带 Bearer）。
// 运行：cd server && node test/api.test.js
// ============================================================================
const { MongoMemoryServer } = require("mongodb-memory-server");
const { connect, close, players } = require("../src/db");
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
  console.log(" Step3 验证：Express + MongoDB(players) + JWT 注册/登录/读写state");
  console.log("========================================================");

  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  console.log("[mongo] 内存 mongod uri=" + uri);
  await connect(uri, "xiuxiangame_test");

  const server = app.listen(0);
  await new Promise((res) => server.once("listening", res));
  const base = `http://127.0.0.1:${server.address().port}`;
  console.log("[server] listening on " + base);

  try {
    // —— health ——
    const hp = await jfetch(base + "/api/health");
    assert(hp.status === 200 && hp.body && hp.body.ok === true, "GET /api/health → 200 ok");

    // —— register（手机号）——
    const reg = await jfetch(base + "/api/auth/register", {
      method: "POST", headers: H,
      body: json({ phone: "13800000001", password: "secret123" }),
    });
    console.log("[register] status=" + reg.status + " player=" + json(reg.body && reg.body.player));
    assert(reg.status === 201 && reg.body && typeof reg.body.token === "string", "注册 → 201 返回 JWT token");
    assert(reg.body && reg.body.player && reg.body.player.phone === "13800000001", "注册返回 player.phone");

    // —— 重复注册 → 409 ——
    const dup = await jfetch(base + "/api/auth/register", {
      method: "POST", headers: H,
      body: json({ phone: "13800000001", password: "secret123" }),
    });
    assert(dup.status === 409, "重复注册 → 409 account already exists");

    // —— 弱密码 → 400 ——
    const weak = await jfetch(base + "/api/auth/register", {
      method: "POST", headers: H,
      body: json({ email: "a@b.com", password: "123" }),
    });
    assert(weak.status === 400, "弱密码（<6）→ 400");

    // —— login 正确 ——
    const login = await jfetch(base + "/api/auth/login", {
      method: "POST", headers: H,
      body: json({ phone: "13800000001", password: "secret123" }),
    });
    assert(login.status === 200 && login.body && typeof login.body.token === "string", "登录（正确密码）→ 200 + token");
    const token = login.body.token;

    // —— login 错误密码 → 401 ——
    const bad = await jfetch(base + "/api/auth/login", {
      method: "POST", headers: H,
      body: json({ phone: "13800000001", password: "wrongpass" }),
    });
    assert(bad.status === 401, "登录（错误密码）→ 401 invalid credentials");

    // —— GET /api/state 无 token → 401 ——
    const noauth = await jfetch(base + "/api/state");
    assert(noauth.status === 401, "GET /api/state 无 token → 401");

    // —— GET /api/state 有 token（新号已服务端初始化 state）——
    const authH = { authorization: "Bearer " + token };
    const s0 = await jfetch(base + "/api/state", { headers: authH });
    assert(s0.status === 200 && s0.body && s0.body.state && typeof s0.body.state === "object"
      && s0.body.state.realm_id === "rq_01" && s0.body.state.resources && typeof s0.body.state.resources === "object",
      "GET /api/state（新号）→ 200 服务端已初始化 state（realm_id=rq_01 + resources）");

    // —— PUT /api/state 写入一个游戏 state JSON 文档 ——
    const fakeState = { realm_id: "rq_03", race_id: "human", resources: { mana: 12345 }, level: 7, _v: "step3-test" };
    const put = await jfetch(base + "/api/state", {
      method: "PUT", headers: { ...H, authorization: "Bearer " + token },
      body: json({ state: fakeState }),
    });
    assert(put.status === 200 && put.body && put.body.ok === true, "PUT /api/state → 200 ok");

    // —— GET /api/state 读回，验证 JSON 文档完整持久化 ——
    const s1 = await jfetch(base + "/api/state", { headers: authH });
    const st = s1.body && s1.body.state;
    assert(s1.status === 200 && st && st.realm_id === "rq_03" && st.resources && st.resources.mana === 12345 && st._v === "step3-test",
      "GET /api/state 读回 → state JSON 文档完整持久化（realm/resources/_v 一致）");

    // —— 直接查库确认 players collection 存了 state 文档 ——
    const dbDoc = await players().findOne({ phone: "13800000001" });
    assert(dbDoc && dbDoc.state && dbDoc.state.level === 7 && typeof dbDoc.passwordHash === "string" && dbDoc.passwordHash !== "secret123",
      "players collection 文档：state 已存 + passwordHash 为 bcrypt 哈希（非明文）");
  } finally {
    server.close();
    await close();
    await mongod.stop();
  }

  console.log("========================================================");
  if (failures === 0) {
    console.log(" ✅ Step3 通过：注册/登录/读写state 全链路 OK，state 以 JSON 文档存于 MongoDB players collection。");
    process.exit(0);
  } else {
    console.log(` ❌ Step3 失败：${failures} 项断言未通过。`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("\n❌ Step3 抛出异常：");
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});
