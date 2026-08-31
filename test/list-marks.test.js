"use strict";
// ============================================================================
// test/list-marks.test.js —— T-C 验收 harness（21.1 §1.4~1.7 验收钩子，design/22.0 §二）
//
// 五个部分：
//   S1 list_marks 状态位：默认值/旧档归一 fuzz/单调性/存档往返/转世口径（与 god_seats 同生死）
//   S2 C2 两链路隔离：破劫败→list_marks；Boss/杀阵/遭遇败→god_seats，互不污染
//   S3 天庭差事保底（钩子 1.5）：list_marks 达阈值后首次闭关/游历必出差事；conditionMet 令牌
//   S4 替身符（钩子 1.6）：持符败局只燃 1 张（幂等）、title 不授、正常胜授 title、
//      无符败局回归快照（与旧版状态效果逐项一致）、丹房炼符（成本/境界门/每日限）
//   S5 newbie_protection 死字段清除确认（21.1 §1.7）
// ============================================================================
const { bootGame } = require("./harness.js");

const SEED = 20260901;
const ERRAND_IDS = ["event_341", "event_342", "event_343"];

let failures = [];
function assert(cond, msg) {
  if (!cond) { failures.push(msg); console.log("  ❌ " + msg); }
  else console.log("  ✅ " + msg);
}

function takeBattle(Game) {
  const idx = Game.popupQueue.map((p) => p.kind).lastIndexOf("battle_v2");
  return idx < 0 ? null : Game.popupQueue.splice(idx, 1)[0].battle;
}

// 生产路径起一场破劫斗法（境界/道行就位 → confirmBreakthrough → 取战斗）
async function startTrib(opts) {
  const h = await bootGame({ seed: opts.seed != null ? opts.seed : SEED });
  h.Game.init({ debug: false, fresh: true });
  const st = h.Game.state;
  const bt = h.DataManager.getById("breakthrough_table", opts.btId);
  st.realm_id = String(bt.from_realm);
  for (const id of h.DataManager.getResourceIds()) st.resources[id] = 0;
  st.resources.daoxing = Number(bt.required_daoxing);
  st.resources.merit = 0; st.resources.calamity = 0;
  if (opts.pills) Object.assign(st.pills, opts.pills);
  if (opts.failCounts) st.breakthrough_fail_counts = opts.failCounts;
  h.Game.popupQueue.length = 0;
  h.Game.confirmBreakthrough();
  const battle = takeBattle(h.Game);
  if (battle && opts.emptySlots) battle.slots = []; // 空栏 → 玩家无输出 → 求败
  if (battle && opts.oneHp) battle.enemies[0].hp = 1; // 首段一滴血 → 求胜
  return { h, st, bt, battle };
}

(async () => {
  // ---------- S1 list_marks 状态位：默认/归一 fuzz/单调/存档往返/转世 ----------
  console.log("\n===== S1 list_marks 状态位（21.1 §1.4） =====");
  {
    const h = await bootGame({ seed: SEED });
    h.Game.init({ debug: false, fresh: true });
    const st = h.Game.state;
    assert(st.list_marks === 0, `新号默认 list_marks=0（实际 ${st.list_marks}）`);

    // 旧档归一 fuzz：缺字段/脏值/类型错误均归一为合法整数
    const mk = (patch) => { const s = h.SaveManager.createDefault(); Object.assign(s, patch); return s; };
    const cases = [
      [{}, 0, "缺字段→0"],
      [{ list_marks: undefined }, 0, "undefined→0"],
      [{ list_marks: null }, 0, "null→0"],
      [{ list_marks: "3" }, 3, "字符串'3'→3"],
      [{ list_marks: 7.9 }, 7, "浮点 7.9→7"],
    ];
    for (const [patch, want, name] of cases) {
      const s = h.SaveManager.normalize(mk(patch));
      assert(s.list_marks === want, `旧档归一 ${name}（实际 ${s.list_marks}）`);
    }

    // 单调性：applyDefeat 是唯一增量源，逐次 +1 不回退
    const bt3 = h.DataManager.getById("breakthrough_table", "bt_003");
    let mono = true;
    for (let i = 1; i <= 5; i++) {
      const before = st.list_marks;
      h.BreakthroughManager.applyDefeat(st, bt3);
      if (st.list_marks !== before + 1 || st.list_marks !== i) mono = false;
    }
    assert(mono && st.list_marks === 5, "连续 5 次破劫败 → list_marks 逐次 +1 恰为 5（单调不减）");

    // 胜利不减、不增（败后转胜场景不得回退留名）
    const beforeWin = st.list_marks;
    h.BreakthroughManager.applyVictory(st, bt3);
    assert(st.list_marks === beforeWin, "applyVictory 不改 list_marks（只增不减）");

    // 存档往返：save→JSON.parse→normalize 无损
    st.pills.tishen = 2; st.pills.tishen_day = "2026-09-01"; st.pills.tishen_today = 1;
    h.SaveManager.save(st);
    const round = h.SaveManager.normalize(JSON.parse(h.SaveManager._backend.read()));
    assert(round.list_marks === 5 && round.pills.tishen === 2 && round.pills.tishen_today === 1,
      "存档往返 fuzz：list_marks/替身符存货/当日炼制数无损");

    // 转世口径：与 god_seats 同生死（此生真灵入轮回，新世重走）。canReincarnate=isCapped，百境之顶为 hy_10
    st.realm_id = "hy_10"; st.god_seats = ["leibu"]; st.list_marks = 3;
    h.Game.reincarnate();
    assert(h.Game.state.list_marks === 0 && h.Game.state.god_seats.length === 0 && h.Game.state.rebirth.count === 1,
      "转世：list_marks 与 god_seats 同口径重置（真灵重走），rebirth 记账保留");
  }

  // ---------- S2 C2 两链路隔离（21.0 §7.1 裁决：破劫败=榜文留名，Boss/斗法败=真灵化神位） ----------
  console.log("\n===== S2 C2 两链路隔离 =====");
  {
    // 破劫败 → list_marks +1，god_seats 不动
    const r = await startTrib({ btId: "bt_003", emptySlots: true });
    h_runFullAuto(r);
    r.h.Game.finishBattle(r.battle);
    assert(!r.battle.win, "bt_003 空栏斗法确实败了（测试前提）");
    assert(r.st.list_marks === 1 && r.st.god_seats.length === 0,
      `破劫败：list_marks=${r.st.list_marks}（期望1）、god_seats=${r.st.god_seats.length}（期望0）——榜文亲笔，不化神位`);

    // Boss 败 → god_seats +1，list_marks 不动（生产路径）
    const b = await bootGame({ seed: SEED + 1 });
    b.Game.init({ debug: false, fresh: true });
    const bs = b.Game.state;
    bs.realm_id = "rq_05";
    for (const id of b.DataManager.getResourceIds()) bs.resources[id] = 1e6;
    bs.boss_counts_today = {};
    b.Game.popupQueue.length = 0;
    b.Game.startBossBattle("boss_001");
    const bb = takeBattle(b.Game);
    bb.slots = []; // 空栏求败
    b.BattleEngineV2.runFullAuto(bs, bb);
    b.Game.finishBattle(bb);
    assert(!bb.win && bs.god_seats.length === 1 && bs.list_marks === 0,
      `Boss败：god_seats=${bs.god_seats.length}（期望1）、list_marks=${bs.list_marks}（期望0）——真灵化神位，不留榜名`);

    // 杀阵败 → god_seats，list_marks 不动
    const a = await bootGame({ seed: SEED + 2 });
    a.Game.init({ debug: false, fresh: true });
    const as = a.Game.state;
    as.list_marks = 0;
    a.Game.popupQueue.length = 0;
    a.Game.finishBattle({ source: "array", win: false, name: "十绝阵", payload: { arrayId: "tianjue" }, stats: {} });
    assert(as.god_seats.length === 1 && as.list_marks === 0,
      `杀阵败：god_seats=${as.god_seats.length}（期望1）、list_marks=${as.list_marks}（期望0）`);

    // 遭遇败 → god_seats，list_marks 不动
    const e = await bootGame({ seed: SEED + 3 });
    e.Game.init({ debug: false, fresh: true });
    const es = e.Game.state;
    e.Game.popupQueue.length = 0;
    e.Game.finishBattle({ source: "encounter", win: false, name: "拦路小妖", payload: { encounterId: "enc_wild_01", optionIndex: 0 }, stats: {} });
    assert(es.god_seats.length === 1 && es.list_marks === 0,
      `遭遇败：god_seats=${es.god_seats.length}（期望1）、list_marks=${es.list_marks}（期望0）`);
  }

  // ---------- S3 天庭差事保底（21.1 §5 钩子 1.5） ----------
  console.log("\n===== S3 天庭差事保底触发 =====");
  {
    const h = await bootGame({ seed: SEED + 10 });
    h.Game.init({ debug: false, fresh: true });
    const st = h.Game.state;
    st.resources.daoxing = 0;
    const EM = h.EventManager;

    // conditionMet 令牌
    st.list_marks = 1;
    assert(!h.UnlockManager.conditionMet(st, "list_marks_min:2"), "list_marks=1 → list_marks_min:2 不满足");
    st.list_marks = 2;
    assert(h.UnlockManager.conditionMet(st, "list_marks_min:2"), "list_marks=2 → list_marks_min:2 满足");

    // 未达阈值：保底不武装（_pityForce 不吐差事）
    st.list_marks = 1;
    const pf1 = EM._pityForce(st, "offline");
    assert(!pf1 || !ERRAND_IDS.includes(pf1.eventId), "阈值−1（1缕）：保底不吐天庭差事");

    // 达阈值（2缕）：首次闭关 rollEvent 必出差事（保底先于抽签，确定性）
    st.list_marks = 2;
    st.event_counts_today = {};
    const rolled = EM.rollEvent(st, "offline");
    assert(ERRAND_IDS.includes(rolled), `达阈值后首次闭关必出差事（实际 ${rolled || "空"}）`);
    assert(int2(st.flags.errand_pity_marks) === 2, "保底兑现后武装旗记为当前缕数（2）");
    EM.markSeen(st, rolled);

    // 同一缕数不重复武装；添一缕新名重新武装（缕数越多差事越多——正反馈）
    const pf2 = EM._pityForce(st, "offline");
    assert(!pf2 || !ERRAND_IDS.includes(pf2.eventId), "同缕数保底不重复触发");
    st.list_marks = 3;
    const pf3 = EM._pityForce(st, "travel");
    assert(pf3 && ERRAND_IDS.includes(pf3.eventId), `添新缕（3缕）后游历保底重新武装（实际 ${pf3 && pf3.eventId}）`);

    // 非闭关/游历来源不触发（level_up 不在钩子口径内）
    st.list_marks = 4; st.flags.errand_pity_marks = 0;
    const pf4 = EM._pityForce(st, "level_up");
    assert(!pf4 || !ERRAND_IDS.includes(pf4.eventId), "level_up 来源不触发差事保底（钩子口径=闭关/游历）");
    st.flags.errand_pity_marks = 0;

    // 差事事件可正常消费：event_342「代班司榜」选项 A 授替身符一张（pills 奖励通道）
    st.pending_event_id = "event_342";
    const tishenBefore = int2(st.pills.tishen);
    h.Game.chooseEventOption(0);
    assert(st.pills.tishen === tishenBefore + 1, `event_342 选项A：替身符 +1（存 ${st.pills.tishen}）`);
  }

  // ---------- S4 替身符（21.1 §5 钩子 1.6） ----------
  console.log("\n===== S4 替身符：代形败转胜 =====");
  {
    // 持符败局：燃 1 张、败转胜、境界照进、title 不授、list_marks 不记、fail_counts 清零
    const r = await startTrib({ btId: "bt_003", emptySlots: true, pills: { tishen: 2 } });
    const st = r.st;
    const daoxingBefore = Number(st.resources.daoxing);
    r.h.BattleEngineV2.runFullAuto(st, r.battle);
    assert(!r.battle.win, "斗法层面确实败了（替身在结算处介入）");
    r.h.Game.finishBattle(r.battle);
    assert(st.pills.tishen === 1, `只消耗 1 张（2→${st.pills.tishen}）`);
    assert(r.battle.win === true, "battle.win 翻转为胜（败转胜）");
    assert(String(st.realm_id) === "zx_01", `境界照进 zx_01（实际 ${st.realm_id}）`);
    assert(Number(st.resources.daoxing) === Math.max(0, daoxingBefore - Number(r.bt.required_daoxing)), "道行按破劫口径扣除");
    assert(!st.unlocked_ids.includes("title_三花初现"), "替身代形：名位「三花初现」不授（骗过定数，骗不过自己的道）");
    assert(int2(st.breakthrough_fail_counts.bt_003) === 0, "败转胜按胜利结算：此劫 fail_counts 清零");
    assert(st.list_marks === 0, "替身代形不记榜上留名（榜文被瞒过）");
    const pop = r.h.Game.popupQueue.find((p) => p.kind === "text" && String(p.title).includes("替身代形"));
    assert(!!pop && String(pop.body).includes("未授"), "结算弹窗为「破劫成功·替身代形」且言明名位未授（非新增模态，沿用 text 弹窗）");

    // 幂等：同一场战斗重复触发结算，不再燃第二张
    r.h.Game.finishBattle(r.battle);
    assert(st.pills.tishen === 1, "重复触发幂等：仍是 1 张（_tishenDone 护栏）");

    // 正常胜局：title 授予（对照项——替身代价是真实的）。
    // 构型：每回合把存活敌钉到 1 血再 executeRound——回合推进/换段/胜负判定全走真实引擎，确定求胜。
    const w = await startTrib({ btId: "bt_003" });
    const E = w.h.BattleEngineV2;
    let guard = 0;
    while (!E._dead(w.battle) && !w.battle.win && guard++ < 100) {
      for (const e of w.battle.enemies) { if (e.hp > 0) e.hp = 1; }
      E.executeRound(w.st, w.battle);
    }
    assert(w.battle.win === true, "钉血推进 → 正常胜局（测试前提）");
    w.h.Game.finishBattle(w.battle);
    assert(w.st.unlocked_ids.includes("title_三花初现"), "正常破劫胜：名位「三花初现」授予（title_* 解锁）");

    // 无符败局回归快照：与旧版状态效果逐项一致（list_marks 为设计内新增，其余不变）
    const n = await startTrib({ btId: "bt_003", emptySlots: true });
    const ns = n.st;
    const snap = {
      realm: String(ns.realm_id),
      daoxing: Number(ns.resources.daoxing),
      mana: Number(ns.resources.mana = 2000),
      fail: int2(ns.breakthrough_fail_counts.bt_003),
      seats: ns.god_seats.length,
    };
    n.h.BattleEngineV2.runFullAuto(ns, n.battle);
    n.h.Game.finishBattle(n.battle);
    assert(!n.battle.win, "无符败局：败就是败（测试前提）");
    assert(String(ns.realm_id) === snap.realm && Number(ns.resources.daoxing) === snap.daoxing,
      "无符回归：境界不进、道行不扣（与旧版一致）");
    assert(int2(ns.breakthrough_fail_counts.bt_003) === snap.fail + 1, "无符回归：fail_counts +1（劫火淬体照旧）");
    assert(Number(ns.resources.mana) >= snap.mana + 100, "无符回归：法力补偿照旧（max(100, 5%)）");
    assert(ns.god_seats.length === snap.seats, "无符回归：破劫败不授神位（C2 隔离）");
    assert(ns.list_marks === 1, "无符败局：list_marks +1（本批唯一新增状态效果）");
    const dpop = n.h.Game.popupQueue.find((p) => p.kind === "text" && p.title === "破劫失败");
    assert(!!dpop, "无符回归：破劫失败弹窗照旧（未改既有模态）");
  }

  console.log("\n===== S4b 替身符炼制（丹房，数据驱动自 pill_table） =====");
  {
    const h = await bootGame({ seed: SEED + 20 });
    h.Game.init({ debug: false, fresh: true });
    const st = h.Game.state;
    const row = h.DataManager.getById("pill_table", "tishen");
    assert(Object.keys(row).length > 0 && row.pill_id === "tishen", "pill_table.getById('tishen') 可取行（data_index/ID_FIELDS 已通）");

    // 境界门：rq_08（丹房已开、未至真人）→ 拒绝
    st.realm_id = "rq_08";
    for (const id of h.DataManager.getResourceIds()) st.resources[id] = 1e6;
    let r = h.Game.craftTishan();
    assert(r.ok === false && int2(st.pills.tishen) === 0, "境界门：rq_08（未至真人）不可炼");

    // 正门：zr_05 + 功德/炼材足额 → 炼成，成本照扣
    st.realm_id = "zr_05";
    st.resources.merit = 1000; st.resources.refine_material = 10;
    r = h.Game.craftTishan();
    assert(r.ok === true && int2(st.pills.tishen) === 1, "zr_05 炼符成功（存 1 张）");
    assert(Number(st.resources.merit) === 1000 - Number(row.cost.merit) && Number(st.resources.refine_material) === 10 - Number(row.cost.refine_material),
      `成本照扣：功德 ${st.resources.merit}、炼材 ${st.resources.refine_material}（读自 pill_table.cost）`);

    // 每日限：同日二次炼制拒绝且不扣资源
    const m = Number(st.resources.merit);
    r = h.Game.craftTishan();
    assert(r.ok === false && int2(st.pills.tishen) === 1 && Number(st.resources.merit) === m, "每日限（daily_limit=1）：同日二炼拒绝、资源不动");

    // 资源不足：拒绝
    st.pills.tishen_day = ""; st.pills.tishen_today = 0; // 重置当日计数以测资源门
    st.resources.merit = 0;
    r = h.Game.craftTishan();
    assert(r.ok === false && int2(st.pills.tishen) === 1, "功德不足：拒绝炼制");
  }

  // ---------- S5 newbie_protection 死字段清除（21.1 §1.7） ----------
  console.log("\n===== S5 newbie_protection 字段清除 =====");
  {
    const h = await bootGame({ seed: SEED + 30 });
    const rows = h.DataManager.getRows("breakthrough_table");
    assert(rows.length === 8 && rows.every((r) => !("newbie_protection" in r)),
      "breakthrough_table 8 行均无 newbie_protection（死字段已删）");
    const bt1 = h.DataManager.getById("breakthrough_table", "bt_001");
    assert(bt1.feel_lock === true && Number(bt1.min_success_rate) === 0.95,
      "bt_001 新手保护由 feel_lock 黄金锁 + min_success_rate 0.95 软保底承载（删字段不删保护）");
  }

  // ---------- 汇总 ----------
  console.log("\n===== 汇总 =====");
  if (failures.length) {
    console.log(`❌ ${failures.length} 项断言失败：`);
    for (const f of failures) console.log("  - " + f);
    process.exit(1);
  }
  console.log("✅ 全部断言通过（list_marks + 两链路隔离 + 天庭差事保底 + 替身符 + 死字段清除）");
})().catch((e) => { console.error(e); process.exit(1); });

// 工具：bootGame 返回对象上直接跑全自动战斗
function h_runFullAuto(r) { r.h.BattleEngineV2.runFullAuto(r.st, r.battle); }
// int 兜底（测试侧不依赖沙箱 utils 全局）
function int2(v) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : 0; }
