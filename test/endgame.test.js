"use strict";
// ============================================================================
// test/endgame.test.js —— T-F 验收 harness（21.3 §3.3 E2/E3/E4 验收钩子，design/22.0 §二）
//
// 三个部分：
//   S1 E2 三结局：死指针消除/结局门/弹窗入队/条件达成择定/未达拒绝/一世一次/
//      后结局世界开放/转世重开（ending_id 与 witnessed 随世重置）
//   S2 E3 道痕修复：10 大境 gain 全 >0 且单调；历世录扩记结局与名位
//   S3 E4 见闻录：破劫成败 8×2 数据行齐备；_witness 去重/未知静默/浮字日志；
//      Boss 首杀与结缘钩子存在（生产路径写入点）
// ============================================================================
const { bootGame } = require("./harness.js");

const SEED = 20260903;
const nowUnix = () => Math.floor(Date.now() / 1000);
let failures = [];
function assert(cond, msg) {
  if (!cond) { failures.push(msg); console.log("  ❌ " + msg); }
  else console.log("  ✅ " + msg);
}

async function hy10State(opts = {}) {
  const h = await bootGame({ seed: opts.seed != null ? opts.seed : SEED });
  h.Game.init({ debug: false, fresh: true });
  const st = h.Game.state;
  st.realm_id = "hy_10";
  st.list_marks = opts.listMarks != null ? opts.listMarks : 0;
  st.resources.merit = opts.merit != null ? opts.merit : 0;
  if (opts.witnessed) st.witnessed = opts.witnessed.slice();
  if (opts.bossClears) st.boss_clears = { ...opts.bossClears };
  st.rebirth.count = opts.rebirthCount != null ? opts.rebirthCount : 0;
  h.UnlockManager.refresh(st);
  h.Game.popupQueue.length = 0;
  h.Game._endingOfferedThisSession = false;
  return h;
}

(async () => {
  // ---------- S1 E2 三结局 ----------
  console.log("\n===== S1 E2 三结局（21.3 §3.3 E2） =====");
  {
    const h = await hy10State();
    const ut = (id) => h.DataManager.getById("unlock_table", id);
    // 死指针消除：hy_10 unlock_ids 指向的 ending_choice 真实存在且有消费代码
    const hy10 = h.DataManager.getRealm("hy_10");
    assert((hy10.unlock_ids || []).includes("ending_choice"), "hy_10.unlock_ids 含 ending_choice");
    assert(Object.keys(ut("ending_choice")).length > 0, "ending_choice 死指针消除（unlock_table 有行）");
    assert(typeof h.Game.chooseEnding === "function", "ending_choice 有消费代码（chooseEnding）");
    const endings = ["ending_fengshen", "ending_chengsheng", "ending_xiaoyao"];
    for (const id of endings) {
      const row = ut(id);
      assert(Object.keys(row).length && row.feature_type === "ending" && row.ending_condition, `${id} 行存在且带 ending_condition`);
    }
    // 结局门开 → 弹窗入队（3 路 + 暂缓）
    assert(h.Game._endingGateOpen() === true, "混元圆满+未择结局 → 结局门开");
    h.Game._maybeQueueEndingChoice();
    const pop = h.Game.popupQueue.find((p) => p.kind === "text" && String(p.title).includes("终局"));
    assert(!!pop, "三选一弹窗入队");
    assert(pop && pop.buttons.length === 4, `弹窗 4 按钮（3 路+暂缓，实际 ${pop ? pop.buttons.length : 0}）`);
    // 每会话至多一次
    h.Game._maybeQueueEndingChoice();
    const nPops = h.Game.popupQueue.filter((p) => String(p.title || "").includes("终局")).length;
    assert(nPops === 1, "每会话至多入队一次（弹窗克制）");
  }
  {
    // 条件未达 → 拒绝且不置 ending_id
    const h = await hy10State({ listMarks: 0, merit: 0 });
    const r = h.Game.chooseEnding("ending_fengshen");
    assert(r.ok === false, "受封天庭条件未达（留名0/功德0）→ 拒绝");
    assert(h.Game.state.ending_id === "", "拒绝后 ending_id 仍为空");
  }
  {
    // 留名 3 缕 → 受封天庭达成
    const h = await hy10State({ listMarks: 3 });
    const r = h.Game.chooseEnding("ending_fengshen");
    assert(r.ok === true, "榜上留名 3 缕 → 受封天庭达成（any_of 一支即达）");
    assert(h.Game.state.ending_id === "fengshen", "ending_id=fengshen（永久身份）");
    assert(h.Game.state.unlocked_ids.includes("ending_fengshen"), "结局解锁授予 ending_fengshen");
    const getTitle = h.runInSandbox("getTitle");
    assert(getTitle(h.Game.state) === "受封天庭", `getTitle 显示结局之名（实际「${getTitle(h.Game.state)}」）`);
    const endPop = h.Game.popupQueue.find((p) => String(p.title || "").includes("终局·受封天庭"));
    assert(!!endPop && String(endPop.body).length > 10, "终局画卷文案弹窗");
    // 一世一次：再选拒绝
    const r2 = h.Game.chooseEnding("ending_xiaoyao");
    assert(r2.ok === false, "本世已择 → 再选拒绝（一世一定）");
    // 后结局世界开放：转世仍可用
    assert(h.Game.canReincarnate() === true, "后结局世界开放（转世仍可用）");
  }
  {
    // 功德 800 支路也可达（多维可替代）
    const h = await hy10State({ merit: 800 });
    assert(h.Game.chooseEnding("ending_fengshen").ok === true, "功德 800 → 受封天庭也可达（多维可替代，守则 5）");
  }
  {
    // 肉身成圣：首杀 15 支路
    const clears = {};
    for (let i = 1; i <= 15; i++) clears["boss_" + String(i).padStart(3, "0")] = 1;
    const h = await hy10State({ bossClears: clears });
    assert(h.Game.chooseEnding("ending_chengsheng").ok === true, "具名 Boss 首杀 15 → 肉身成圣达成");
  }
  {
    // 混元逍遥：历世 1 次支路；并验证转世重置 ending_id 与 witnessed
    const h = await hy10State({ rebirthCount: 1, witnessed: ["boss_boss_001"], listMarks: 2 });
    h.Game.state.ending_id = "xiaoyao"; // 模拟上世结局已择前的本世：此处直接验转世重置
    h.Game.state.ending_id = ""; // 本世未择
    assert(h.Game.chooseEnding("ending_xiaoyao").ok === true, "历世 1 次 → 混元逍遥达成");
    h.Game.state.ending_id = "xiaoyao";
    h.Game.reincarnate();
    assert(h.Game.state.ending_id === "", "转世 → ending_id 重置（来世可另择他路）");
    assert(Array.isArray(h.Game.state.witnessed) && h.Game.state.witnessed.length === 0, "转世 → witnessed 随世重置");
    assert(h.Game.state.rebirth.count === 2, "转世计数 +1");
  }

  // ---------- S2 E3 道痕修复 ----------
  console.log("\n===== S2 E3 道痕修复（21.3 §3.3 E3） =====");
  {
    const h = await bootGame({ seed: SEED });
    h.Game.init({ debug: false, fresh: true });
    const majors = [];
    for (const row of h.DataManager.getRows("realm_table")) {
      if (!majors.some((m) => m.major === row.major_realm)) majors.push({ major: row.major_realm, id: row.realm_id });
    }
    const gains = [];
    for (const m of majors) {
      h.Game.state.realm_id = m.id;
      gains.push({ major: m.major, gain: h.Game.getRebirthPreview().gain });
    }
    assert(gains.length === 10, `10 个大境全覆盖（实际 ${gains.length}）`);
    assert(gains.every((g) => g.gain > 0), "各大境道痕 gain 全 >0");
    let mono = true;
    for (let i = 1; i < gains.length; i++) if (gains[i].gain <= gains[i - 1].gain) mono = false;
    assert(mono, `道痕随大境严格单调（${gains.map((g) => g.gain).join("/")})`);
    assert(gains[gains.length - 1].gain >= 10, `混元道痕 ≥10（实际 ${gains[gains.length - 1].gain}），不再是 1 点`);
    // 历世录扩记：结局与名位
    const st = h.Game.state;
    st.realm_id = "hy_10";
    st.ending_id = "fengshen";
    st.list_marks = 4;
    st.unlocked_ids.push("ending_fengshen");
    h.Game.reincarnate();
    const line = st.rebirth.log[0];
    assert(String(line).includes("终局「受封天庭」"), `历世录记结局（${line}）`);
    assert(String(line).includes("榜上留名 4 缕"), "历世录记名位缕数");
  }

  // ---------- S3 E4 见闻录 ----------
  console.log("\n===== S3 E4 见闻录（21.3 §3.3 E4） =====");
  {
    const h = await bootGame({ seed: SEED });
    h.Game.init({ debug: false, fresh: true });
    // 数据行：破劫成败 8×2 齐备
    let all = true;
    for (let i = 1; i <= 8; i++) {
      const id = "bt_00" + i;
      if (!Object.keys(h.DataManager.getById("witness_table", id + "_win")).length) all = false;
      if (!Object.keys(h.DataManager.getById("witness_table", id + "_lose")).length) all = false;
    }
    assert(all, "破劫见证数据行 8 胜 8 败齐备");
    // _witness：未知静默 / 已知写入 / 去重
    h.Game._witness("not_exist_id");
    assert(h.Game.state.witnessed.length === 0, "未知 witness_id → 静默不写");
    h.Game._witness("bt_001_win");
    assert(h.Game.state.witnessed.length === 1 && h.Game.state.witnessed[0] === "bt_001_win", "破劫胜 → 见证写入");
    h.Game._witness("bt_001_win");
    assert(h.Game.state.witnessed.length === 1, "同一条目二次 → seen 去重");
    // 生产路径钩子存在（Boss 首杀/结缘/破劫成败写入点）
    const src = require("fs").readFileSync("web/js/game.js", "utf8");
    assert(src.includes('this._witness(btId + "_win")') && src.includes('this._witness(btId + "_lose")'), "破劫成败写入点存在");
    assert(src.includes('this._witness("boss_" + bossId)'), "Boss 首杀写入点存在");
    assert(src.includes('this._witness("bond_" + id)'), "同伴结缘写入点存在");
    // 存档兼容：旧档 witnessed 归一
    const old = h.SaveManager.createDefault();
    delete old.witnessed;
    const norm = h.SaveManager.normalize(old);
    assert(Array.isArray(norm.witnessed), "旧档 witnessed 归一为数组");
  }

  // ---------- S4 杀劫压力世界值（21.3 §3.4 S2 / 21.1 §2.1） ----------
  console.log("\n===== S4 杀劫压力世界值 =====");
  {
    const h = await bootGame({ seed: SEED });
    h.Game.init({ debug: false, fresh: true });
    const getP = h.runInSandbox("getCalamityPressure");
    const getT = h.runInSandbox("getCalamityPressureTier");
    const st = h.Game.state;
    // 新号低压（<25 → 天象行不追加，黄金快照零漂移守卫）
    assert(getP(st) < 25, `新号压力 <25（实际 ${getP(st)}，天象行零改动守卫）`);
    // 值域
    st.current_goal_id = "goal_024"; st.array_wins = { zhuxian: 99 }; st.realm_id = "hy_10";
    assert(getP(st) <= 100 && getP(st) >= 0, `值域钳制 0-100（极端态 ${getP(st)}）`);
    // 驱动源单调性：杀阵胜场越多压力越高
    st.array_wins = {};
    const p0 = getP(st);
    st.array_wins = { zhuxian: 2 };
    const p1 = getP(st);
    assert(p1 > p0, `杀阵胜场 → 压力升高（${p0}→${p1}）`);
    // 境界驱动
    st.array_wins = {}; st.realm_id = "zs_01";
    const pHigh = getP(st);
    st.realm_id = "rq_01";
    const pLow = getP(st);
    assert(pHigh > pLow, `境界越高压力越高（rq_01 ${pLow} → zs_01 ${pHigh}）`);
    // 档位序：终局态档位不浅于新号（压力越高档位越深）
    const order = { 榜文微照: 0, 榜文牵引: 1, 杀劫已深: 2, 榜文全力压制: 3 };
    const t0 = getT(h.SaveManager.createDefault());
    st.array_wins = { zhuxian: 5, wanxian: 5 }; st.realm_id = "hy_10"; st.current_goal_id = "goal_024";
    const tEnd = getT(st);
    assert(order[tEnd.label] >= order[t0.label], `档位序单调（新号「${t0.label}」→ 终局「${tEnd.label}」）`);
    assert(t0.label === "榜文微照", `新号档位=榜文微照（实际「${t0.label}」）`);
    assert(String(t0.mood).length > 5, "档位带氛围文案（mood）");
  }

  // ---------- S5 名位档案与历世神位（21.3 §3.4 S1） ----------
  console.log("\n===== S5 名位档案与历世神位 =====");
  {
    const h = await bootGame({ seed: SEED });
    h.Game.init({ debug: false, fresh: true });
    const seats = h.DataManager.getRows("god_seat_table");
    assert(seats.length === 36, `god_seat_table 36 原型神位（实际 ${seats.length}）`);
    const depts = new Set(seats.map((s) => s.department));
    assert(depts.size === 6, `六部齐备（实际 ${depts.size}）`);
    const leads = seats.filter((s) => s.lead);
    assert(leads.length === 6, "每部一个部主位（lead=true，对应 GOD_SEATS 机制位）");
    assert(seats.every((s) => String(s.seat_name).length > 0 && String(s.lore).length > 0), "每位具名带 lore（挂锚点）");
    // 转世并档：本世神位并入历世档案，去重；本世 god_seats 随世重置（机制按世不变）
    const st = h.Game.state;
    st.realm_id = "hy_10";
    st.god_seats = ["leibu", "huobu"];
    st.rebirth.god_seats_seen = ["leibu"]; // 历世已有雷部
    h.Game.reincarnate();
    assert(h.Game.state.rebirth.god_seats_seen.includes("leibu") && h.Game.state.rebirth.god_seats_seen.includes("huobu"), "转世 → 本世神位并入历世档案");
    assert(h.Game.state.rebirth.god_seats_seen.length === 2, "并档去重（雷部不重复计）");
    assert(h.Game.state.god_seats.length === 0, "本世 god_seats 随世重置（buff 机制按世不变）");
    // 旧档归一
    const old = h.SaveManager.createDefault();
    delete old.rebirth.god_seats_seen;
    old.rebirth.god_seats_seen = undefined;
    const norm = h.SaveManager.normalize(old);
    assert(Array.isArray(norm.rebirth.god_seats_seen), "旧档 god_seats_seen 归一为数组");
  }

  // ---------- S6 反馈预算调度器（21.2 §3.3 S2） ----------
  console.log("\n===== S6 反馈预算调度器 =====");
  {
    const h = await bootGame({ seed: SEED });
    h.Game.init({ debug: false, fresh: true });
    const FR = h.runInSandbox("FeedbackRenderer");
    assert(FR.RECENT_KEEP === 10, "RECENT_KEEP=10（同池近 10 次不重复）");
    assert(FR.LONG_DAILY_CAP === 20 && FR.DECAY_AFTER === 30, "长文日配额 20 / 重复衰减阈值 30");
    // 近 10 次不重复：12 项合成池连抽 15 次，最近 10 次下标无重复
    const pool12 = Array.from({ length: 12 }, (_, i) => "line" + i);
    const picks = [];
    for (let i = 0; i < 15; i++) picks.push(FR._pick(pool12, "synth_pool"));
    const last10 = picks.slice(-10);
    assert(new Set(last10).size === 10, `12 项池近 10 次抽取无重复（去重后 ${new Set(last10).size}/10）`);
  }
  {
    // 长文日配额（确定性）：_isLong/_shorten 单元 + 配额封顶集成
    const h = await bootGame({ seed: SEED + 1 });
    h.Game.init({ debug: false, fresh: true });
    const FR = h.runInSandbox("FeedbackRenderer");
    assert(FR._isLong("一句。两句。") === true && FR._isLong("只有一句。") === false, "_isLong：≥2 句判长文");
    assert(FR._shorten("一轮周天运转完毕。指尖微暖。") === "一轮周天运转完毕。", "_shorten：只留第一句");
    // 集成：配额设 2，连抽 30 次 → 长文输出恰 2 次，其后长文被降级为短句
    FR.LONG_DAILY_CAP = 2;
    const shortened = new Set(["一轮周天运转完毕。", "气息沉入丹田。"]);
    let longN = 0, shortenedHits = 0;
    for (let i = 0; i < 30; i++) {
      const t = FR.line("qiyun_breath_cycle");
      if (FR._isLong(t)) longN++;
      if (shortened.has(t)) shortenedHits++;
    }
    assert(longN === 2, `长文输出恰为配额 2 次（实际 ${longN}）`);
    assert(shortenedHits > 0, `超额长文被降级为短句（命中 ${shortenedHits} 次）`);
  }
  {
    // 重复衰减：同条曝光超 30 次后恒输出短句
    const h = await bootGame({ seed: SEED + 2 });
    h.Game.init({ debug: false, fresh: true });
    const FR = h.runInSandbox("FeedbackRenderer");
    FR.LONG_DAILY_CAP = 999; // 隔离变量：只测衰减
    let last = "";
    for (let i = 0; i < 35; i++) last = FR.line("qiyun_breath_cycle");
    assert(!FR._isLong(last), `第 35 次曝光已衰减为短句（「${last}」）`);
  }

  // ---------- S7 反馈入口（21.6 L1 三问卡 / L2 榜上留书） ----------
  console.log("\n===== S7 反馈入口 =====");
  {
    const h = await bootGame({ seed: SEED });
    h.Game.init({ debug: false, fresh: true });
    const st = h.Game.state;
    // 新号（在线不足）不弹
    st.play_seconds = 100;
    h.Game._maybeShowThreeQ();
    assert(!h.Game.popupQueue.some((p) => String(p.title || "") === "三问"), "在线不足 30 分钟 → 不弹三问");
    assert(st.flags.three_q_shown === false, "未弹不置标志");
    // 在线满 30 分钟 → 弹一次且置标志
    st.play_seconds = 1800;
    h.Game._maybeShowThreeQ();
    const q1 = h.Game.popupQueue.filter((p) => String(p.title || "") === "三问");
    assert(q1.length === 1, "在线满 30 分钟 → 弹三问卡");
    assert(st.flags.three_q_shown === true, "弹后置标志");
    assert(q1[0].buttons.some((b) => b.action === "feedback_form"), "三问卡带榜上留书入口");
    // 每账号一次：再触发不弹
    h.Game._maybeShowThreeQ(true);
    assert(h.Game.popupQueue.filter((p) => String(p.title || "") === "三问").length === 1, "每账号一次，不重复弹");
    // openFeedbackForm 未配置 URL → 气韵提示不崩溃
    h.Game.openFeedbackForm();
    assert(true, "openFeedbackForm 未配置 URL 不崩溃");
  }
  {
    // 首次退出补发：在线 ≥5 分钟且未弹过 → 出关时补发
    const h = await bootGame({ seed: SEED + 3 });
    h.Game.init({ debug: false, fresh: true });
    const st = h.Game.state;
    st.play_seconds = 400; // ≥300
    st.last_claim_time = nowUnix() - 3600; // 1 小时前
    h.Game._refreshPendingReward();
    h.Game.claimOfflineReward();
    assert(h.Game.popupQueue.some((p) => String(p.title || "") === "三问"), "首次退出（在线≥5分钟）→ 出关补发三问");
  }

  // ---------- 汇总 ----------
  console.log("\n===== 汇总 =====");
  if (failures.length) {
    console.log(`❌ ${failures.length} 项失败：`);
    failures.forEach((f) => console.log("  - " + f));
    process.exit(1);
  }
  console.log("✅ 全部断言通过（三结局可达可拒可转世 + 道痕单调 + 见闻录去重）");
})().catch((e) => { console.error(e); process.exit(1); });
