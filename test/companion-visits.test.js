"use strict";
// ============================================================================
// test/companion-visits.test.js —— T-E 验收 harness（21.4 §3.2/§5 验收钩子，design/22.0 §二）
//
// 五个部分：
//   S1 数据与存档兼容：3 试点 stance+visits 齐备/新号默认值/旧档归一
//   S2 触发与零引用：条件满足必触发；条件不满足/未结缘全程零引用（钩子：3 天内必现/零引用）
//   S3 频控三重闸门：pending_event 让位/开局总闸/境界闸/周上限 ≤2
//   S4 选项结算：奖励/favor/条件选项过滤/赵公明一成结算/哪吒延迟浮字与并肩斗法（胜有获/败零罚）
//   S5 幂等与边界：重复选择/非结缘者选择拒绝
// ============================================================================
const { bootGame } = require("./harness.js");

const SEED = 20260902;
const nowUnix = () => Math.floor(Date.now() / 1000);

let failures = [];
function assert(cond, msg) {
  if (!cond) { failures.push(msg); console.log("  ❌ " + msg); }
  else console.log("  ✅ " + msg);
}

function takeBattle(Game) {
  const idx = Game.popupQueue.map((p) => p.kind).lastIndexOf("battle_v2");
  return idx < 0 ? null : Game.popupQueue.splice(idx, 1)[0].battle;
}
const visitPopups = (Game, name) =>
  Game.popupQueue.filter((p) => p.kind === "text" && String(p.title || "").includes("道友回访") && String(p.title || "").includes(name));
const logMentions = (st, name) => (st.logs || []).filter((l) => String(l).includes(name)).length;

// 构造"可触发回访"的存档：境界/目标/账号日/阵营/资源/结缘集合就位
async function setup(opts = {}) {
  const h = await bootGame({ seed: opts.seed != null ? opts.seed : SEED });
  h.Game.init({ debug: false, fresh: true });
  const st = h.Game.state;
  // dx_05：过申公豹 unlock_realm(dx_03)/赵公明(dx_05) 解锁门，也满足 visits 境界闸(≥zr_06)与哪吒条件(≥zr_08)
  st.realm_id = opts.realm || "dx_05";
  const goals = h.DataManager.getRows("chapter_goal_table");
  const dayOneGoal = goals.find((g) => String(g.stage) === "第1天") || goals[goals.length - 1];
  st.current_goal_id = opts.goalId || String(dayOneGoal.goal_id);
  st.created_at = nowUnix() - (opts.day != null ? opts.day : 10) * 86400;
  if (opts.faction) st.faction_id = opts.faction;
  st.resources.merit = opts.merit != null ? opts.merit : 500;
  st.resources.calamity = opts.calamity != null ? opts.calamity : 0;
  st.resources.daoxing = opts.daoxing != null ? opts.daoxing : 10000;
  if (opts.bossClears) st.boss_clears = { ...opts.bossClears };
  for (const id of opts.bonded || []) {
    const row = h.DataManager.getById("companion_table", id);
    st.companions[id] = { stage: (row.stages || []).length, bonded: true, visit_ptr: 0, favor: 0, last_visit_day: 0 };
  }
  if (opts.pendingEvent) st.pending_event_id = opts.pendingEvent;
  h.Game.popupQueue.length = 0;
  st.logs.length = 0;
  return h;
}

(async () => {
  // ---------- S1 数据与存档兼容 ----------
  console.log("\n===== S1 数据与存档兼容（21.4 §3.2.1） =====");
  {
    const h = await setup();
    const ct = h.DataManager.getRows("companion_table");
    for (const id of ["shengongbao", "nezha", "zhaogongming"]) {
      const row = ct.find((r) => String(r.companion_id) === id);
      assert(row && row.stance && String(row.stance.faction), `${id} 有 stance 声明（faction=${row && row.stance && row.stance.faction}）`);
      assert(row && Array.isArray(row.visits) && row.visits.length >= 1, `${id} 有 ≥1 条 visits（实际 ${row && row.visits ? row.visits.length : 0}）`);
      for (const v of (row && row.visits) || []) {
        assert(Number(v.cooldown_days) >= 7, `${id}/${v.visit_id} cooldown_days ≥7（实际 ${v.cooldown_days}）`);
        assert(v.condition && Array.isArray(v.condition.all_of) && v.condition.all_of.length > 0, `${id}/${v.visit_id} 条件为非空 all_of（防无条件回访）`);
      }
    }
    // 新号默认值
    const fresh = h.SaveManager.createDefault();
    assert(fresh.visit_week === -1 && fresh.visit_week_count === 0, "新号 visit_week=-1/visit_week_count=0");
    // 旧档归一：无 visit 字段的 companions 补默认
    const old = h.SaveManager.createDefault();
    old.companions = { nezha: { stage: 3, bonded: true } };
    delete old.visit_week; delete old.visit_week_count;
    const norm = h.SaveManager.normalize(old);
    const c = norm.companions.nezha;
    assert(c.visit_ptr === 0 && c.favor === 0 && c.last_visit_day === 0, "旧档 companions 归一补 visit_ptr/favor/last_visit_day");
    assert(norm.visit_week === -1 && norm.visit_week_count === 0, "旧档 visit_week/visit_week_count 归一");
  }

  // ---------- S2 触发与零引用 ----------
  console.log("\n===== S2 触发与零引用（21.4 §5 钩子） =====");
  {
    // 申公豹：结缘 + 阐教 + 功德 500 → 必触发
    const h = await setup({ bonded: ["shengongbao"], faction: "chan", merit: 500 });
    h.Game._checkCompanions();
    assert(visitPopups(h.Game, "申公豹").length === 1, "申公豹条件满足 → 触发 1 条回访弹窗");
    const st = h.Game.state;
    assert(st.companions.shengongbao.visit_ptr === 1, "触发后 visit_ptr 推进 0→1");
    assert(st.companions.shengongbao.last_visit_day >= 1, "触发后 last_visit_day 置 ≥1");
    assert(st.visit_week_count === 1, "触发后周计数 +1");
    // 选项数：劫气 0 < 800 → 第三选项被条件过滤（只剩 2）
    const pop = visitPopups(h.Game, "申公豹")[0];
    assert(pop.buttons.length === 2, `劫气不足 800 → 只显现 2 个选项（实际 ${pop.buttons.length}）`);
  }
  {
    // 功德不足 → 全程零引用
    const h = await setup({ bonded: ["shengongbao"], faction: "chan", merit: 499 });
    h.Game._checkCompanions();
    assert(visitPopups(h.Game, "申公豹").length === 0, "功德 499 < 500 → 不触发");
    assert(logMentions(h.Game.state, "申公豹") === 0, "功德不足 → 日志零引用申公豹");
  }
  {
    // 阵营不符（截教）→ 零引用
    const h = await setup({ bonded: ["shengongbao"], faction: "jie", merit: 800 });
    h.Game._checkCompanions();
    assert(visitPopups(h.Game, "申公豹").length === 0 && logMentions(h.Game.state, "申公豹") === 0, "阵营不符（截教）→ 全程零引用");
  }
  {
    // 未结缘 → visits 系统零引用（stage 结缘推进属另一系统，不算回访引用）
    const h = await setup({ faction: "chan", merit: 800 });
    h.Game._checkCompanions();
    assert(visitPopups(h.Game, "申公豹").length === 0, "未结缘 → 无回访弹窗");
    assert(!(h.Game.state.logs || []).some((l) => String(l).includes("道友回访") && String(l).includes("申公豹")), "未结缘 → 回访日志零引用申公豹");
  }
  {
    // 赵公明：破关总数 ≥5 触发；4 不触发
    const clears5 = { boss_001: 1, boss_002: 1, boss_003: 1, boss_004: 1, boss_005: 1 };
    const h = await setup({ bonded: ["zhaogongming"], bossClears: clears5 });
    h.Game._checkCompanions();
    assert(visitPopups(h.Game, "赵公明").length === 1, "赵公明 boss_clears_total=5 → 触发");
    const h2 = await setup({ bonded: ["zhaogongming"], bossClears: { boss_001: 1, boss_002: 1, boss_003: 1, boss_004: 1 } });
    h2.Game._checkCompanions();
    assert(visitPopups(h2.Game, "赵公明").length === 0, "boss_clears_total=4 < 5 → 不触发");
  }
  {
    // visit_ptr 已耗尽（回访过）→ 不重复触发
    const h = await setup({ bonded: ["shengongbao"], faction: "chan", merit: 500 });
    h.Game.state.companions.shengongbao.visit_ptr = 1;
    h.Game._checkCompanions();
    assert(visitPopups(h.Game, "申公豹").length === 0, "visit_ptr 耗尽 → 不再触发（once 语义）");
  }

  // ---------- S3 频控三重闸门 ----------
  console.log("\n===== S3 频控三重闸门（21.4 §3.2.3） =====");
  {
    // pending_event_id 占用 → 让位
    const h = await setup({ bonded: ["shengongbao"], faction: "chan", merit: 500, pendingEvent: "event_001" });
    h.Game._checkCompanions();
    assert(visitPopups(h.Game, "申公豹").length === 0, "pending_event_id 占用 → 回访让位");
    assert(h.Game.state.companions.shengongbao.visit_ptr === 0, "让位时 visit_ptr 不推进");
  }
  {
    // 开局总闸：目标仍在"前30分钟" → 不触发
    const h = await setup({ bonded: ["shengongbao"], faction: "chan", merit: 500, goalId: "goal_001" });
    h.Game._checkCompanions();
    assert(visitPopups(h.Game, "申公豹").length === 0, "开局阶段（前30分钟目标）→ 一律不触发");
  }
  {
    // 境界闸：< zr_06（且低于申公豹解锁门 dx_03）→ 不触发
    const h = await setup({ bonded: ["shengongbao"], faction: "chan", merit: 500, realm: "zr_05" });
    h.Game._checkCompanions();
    assert(visitPopups(h.Game, "申公豹").length === 0, "境界 zr_05（未达解锁门与 zr_06 闸）→ 不触发");
  }
  {
    // 周上限：同周已 2 条 → 第 3 条不发
    const h = await setup({ bonded: ["zhaogongming"], bossClears: { boss_001: 5 } });
    h.Game.state.visit_week = Math.floor(h.Game._visitDay() / 7);
    h.Game.state.visit_week_count = 2;
    h.Game._checkCompanions();
    assert(visitPopups(h.Game, "赵公明").length === 0, "全局每周 ≤2：第 3 条被拦");
  }
  {
    // 一次变更至多 1 条：两人同时合格只出 1 条
    const h = await setup({ bonded: ["shengongbao", "zhaogongming"], faction: "chan", merit: 500, bossClears: { boss_001: 5 } });
    h.Game._checkCompanions();
    const all = h.Game.popupQueue.filter((p) => p.kind === "text" && String(p.title || "").includes("道友回访"));
    assert(all.length === 1, `两人同合格 → 单次变更只触发 1 条（实际 ${all.length}）`);
  }

  // ---------- S4 选项结算 ----------
  console.log("\n===== S4 选项结算（21.4 §3.4 样例语义） =====");
  {
    // 申公豹 opt0：收"不合时宜" → 劫气 +120、favor +1
    const h = await setup({ bonded: ["shengongbao"], faction: "chan", merit: 500 });
    h.Game._checkCompanions();
    const pop = visitPopups(h.Game, "申公豹")[0];
    const sel = pop.buttons[0].visit;
    const before = h.Game.state.resources.calamity;
    const r = h.Game.chooseVisitOption(sel);
    assert(r.ok === true, "chooseVisitOption 合法选择 → ok");
    assert(h.Game.state.resources.calamity === before + 120, `收下 → 劫气 +120（${before}→${h.Game.state.resources.calamity}）`);
    assert(h.Game.state.companions.shengongbao.favor === 1, "收下 → favor +1");
  }
  {
    // 申公豹 opt2：劫气 ≥800 才显现
    const h = await setup({ bonded: ["shengongbao"], faction: "chan", merit: 500, calamity: 900 });
    h.Game._checkCompanions();
    const pop = visitPopups(h.Game, "申公豹")[0];
    assert(pop.buttons.length === 3, `劫气 900 ≥ 800 → 第三选项显现（实际 ${pop.buttons.length} 项）`);
  }
  {
    // 赵公明 opt1："一成照付" → 道行 -10%、favor +2、flag 置位
    const h = await setup({ bonded: ["zhaogongming"], bossClears: { boss_001: 5 }, daoxing: 10000 });
    h.Game._checkCompanions();
    const pop = visitPopups(h.Game, "赵公明")[0];
    const sel = pop.buttons[1].visit;
    h.Game.chooseVisitOption(sel);
    const st = h.Game.state;
    assert(st.resources.daoxing === 9000, `一成照付 → 道行 10000→9000（实际 ${st.resources.daoxing}）`);
    assert(st.companions.zhaogongming.favor === 2, "一成照付 → favor +2（他更敬这一手）");
    assert(st.flags.zhgm_pearl_pledge === true, "定海珠·押 flag 置位");
  }
  {
    // 哪吒 opt1：劝忍 → 功德 +80 + 延迟浮字 7 天后兑现
    const h = await setup({ bonded: ["nezha"], merit: 0 });
    h.Game._checkCompanions();
    const pop = visitPopups(h.Game, "哪吒")[0];
    assert(pop && pop.buttons.length === 2, "哪吒回访触发且 2 选项");
    const sel = pop.buttons[1].visit;
    h.Game.chooseVisitOption(sel);
    const st = h.Game.state;
    assert(st.resources.merit === 80, "劝忍 → 功德 +80");
    assert(st.companions.nezha.pending_log && st.companions.nezha.pending_log.day === h.Game._visitDay() + 7, "延迟浮字挂号：7 天后");
    // 推进 8 天 → 兑浮字（纯 _log 不弹窗）
    st.created_at -= 8 * 86400;
    st.logs.length = 0;
    h.Game.popupQueue.length = 0;
    h.Game._checkCompanions();
    assert((st.logs || []).some((l) => String(l).includes("陈塘关方向风雷渐息")), "8 天后延迟浮字兑现入日志");
    assert(st.companions.nezha.pending_log === null, "兑现后 pending_log 清空");
    assert(visitPopups(h.Game, "哪吒").length === 0, "延迟浮字只走日志不弹窗");
  }
  {
    // 哪吒 opt0：并肩斗法 → 胜有获（favor+1）/ 败零罚
    const h = await setup({ bonded: ["nezha"], merit: 0 });
    h.Game._checkCompanions();
    const pop = visitPopups(h.Game, "哪吒")[0];
    h.Game.chooseVisitOption(pop.buttons[0].visit);
    const battle = takeBattle(h.Game);
    assert(battle && battle.source === "visit", "并肩选项 → 起 source=visit 斗法");
    const st = h.Game.state;
    const daoBefore = st.resources.daoxing, merBefore = st.resources.merit;
    battle.win = true;
    h.Game.finishBattle(battle);
    assert(st.companions.nezha.favor === 1, "并肩胜 → favor +1（护持成长台阶预留）");
    // 败局零罚：重开一局
    const h2 = await setup({ bonded: ["nezha"], merit: 0 });
    h2.Game._checkCompanions();
    const pop2 = visitPopups(h2.Game, "哪吒")[0];
    h2.Game.chooseVisitOption(pop2.buttons[0].visit);
    const b2 = takeBattle(h2.Game);
    const st2 = h2.Game.state;
    const d2 = st2.resources.daoxing, m2 = st2.resources.merit;
    b2.win = false;
    h2.Game.finishBattle(b2);
    assert(st2.resources.daoxing === d2 && st2.resources.merit === m2, "并肩败 → 资源零惩罚");
    assert(st2.companions.nezha.favor === 0, "并肩败 → favor 不变");
    assert((st2.logs || []).some((l) => String(l).includes("这账记在东海头上")), "并肩败 → 叙事余味入日志");
    void daoBefore; void merBefore;
  }

  // ---------- S5 幂等与边界 ----------
  console.log("\n===== S5 幂等与边界 =====");
  {
    const h = await setup({ bonded: ["shengongbao"], faction: "chan", merit: 500 });
    h.Game._checkCompanions();
    const pop = visitPopups(h.Game, "申公豹")[0];
    const sel = pop.buttons[0].visit;
    h.Game.chooseVisitOption(sel);
    const calamityAfter = h.Game.state.resources.calamity;
    const again = h.Game.chooseVisitOption(sel); // visit_ptr 已推进，visit_id 对不上
    assert(again.ok === false, "重复选择同一回访 → 拒绝（visit_id 核对）");
    assert(h.Game.state.resources.calamity === calamityAfter, "重复选择 → 奖励不重发");
  }
  {
    const h = await setup({});
    const r = h.Game.chooseVisitOption({ id: "nezha", visit_id: "nz_visit_01", index: 0 });
    assert(r.ok === false, "未结缘者选择 → 拒绝");
  }

  // ---------- 汇总 ----------
  console.log("\n===== 汇总 =====");
  if (failures.length) {
    console.log(`❌ ${failures.length} 项失败：`);
    failures.forEach((f) => console.log("  - " + f));
    process.exit(1);
  }
  console.log("✅ 全部断言通过（visits 触发/零引用/频控/选项结算/延迟浮字/并肩斗法/幂等）");
})().catch((e) => { console.error(e); process.exit(1); });
