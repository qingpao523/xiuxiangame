// design/数值规划与平衡待办 v0.1 §三「统一数值规划」度量 harness（D 线）
// 采集全境界：玩家战力/气血 → 对应 Boss → 回合数/胜负/伤害吞吐，导出基准曲线。
// 21.1 §1.1 起追加破劫采样：8 关 × 全 phase（生产路径 confirmBreakthrough），
// 目标带 3-8 回合/phase；bt_001 前 30 分钟手感冻结，单独黄金断言（不计带）。
// 只读度量，不改游戏数值；结论写回台账。
"use strict";
const { bootGame } = require("./harness.js");

function takeBattle(Game) {
  const idx = Game.popupQueue.map((p) => p.kind).lastIndexOf("battle_v2");
  return idx < 0 ? null : Game.popupQueue.splice(idx, 1)[0].battle;
}

// 每个境界采样点：把新号养成到该境界后打「推荐 Boss」
async function sample(realmId, bossId, seed) {
  const h = await bootGame({ seed });
  h.Game.init({ debug: false, fresh: true });
  const st = h.Game.state;
  st.realm_id = realmId;
  // 斗法栏用默认三连（新号口径），资源拉满保证不因资源卡壳
  for (const id of h.DataManager.getResourceIds()) st.resources[id] = 1e9;
  const power = h.RealmManager.getCombatPower(st);
  const hpMax = h.RealmManager.getPlayerHpMax ? h.RealmManager.getPlayerHpMax(st) : null;

  st.boss_counts_today = {}; // 绕每日限次
  h.Game.popupQueue.length = 0;
  h.Game.startBossBattle(bossId);
  const battle = takeBattle(h.Game);
  if (!battle) return { realmId, bossId, power, error: "no battle (canChallenge?)" };
  h.BattleEngineV2.runFullAuto(st, battle);
  return {
    realmId,
    bossId,
    power,
    enemyHpMax: battle.enemies.reduce((s, e) => s + (e.hpMax || 0), 0),
    enemyPower: battle.enemies.reduce((s, e) => s + (e.power || 0), 0),
    playerHpMax: battle.playerHpMax,
    win: !!battle.win,
    rounds: battle.round,
    dealt: battle.stats.dealt,
    taken: battle.stats.taken,
    dps: battle.round > 0 ? Math.round(battle.stats.dealt / battle.round) : 0,
    dpr: battle.round > 0 ? Math.round(battle.stats.taken / battle.round) : 0,
  };
}

// 采样计划：境界 → 该境界解锁的 Boss（按 boss_table unlock_condition 配对，D 线 v1.3）
const PLAN = [
  ["rq_05", "boss_001"],
  ["rq_08", "boss_004"],
  ["rq_09", "boss_025"],
  ["zr_01", "boss_026"],
  ["zr_02", "boss_028"],
  ["zr_05", "boss_030"],
  ["zr_07", "boss_002"],
  ["zr_10", "boss_031"],
  ["dx_01", "boss_003"],
  ["dx_05", "boss_006"],
  ["jx_01", "boss_008"],
];

// ---------- 破劫采样（21.1 §1.1 phases 还债）----------

// bt_001 前 30 分钟手感黄金快照（还债前基线采样锁定，种子 20260829 新号口径）。
// feel_lock 行保留还债前旧公式，以下数值必须逐字段一致，漂移即回归失败。
const BT_001_GOLDEN = {
  win: true,
  totalRounds: 2,
  taken: 1029,
  phases: [
    { name: "榜文碎光", hpMax: 4260, power: 4260, rounds: 1, taken: 274 },
    { name: "金影照灵", hpMax: 5396, power: 5396, rounds: 1, taken: 755 },
  ],
};

// 走生产路径：BreakthroughManager.getAvailable → Game.confirmBreakthrough → 斗法。
// 逐回合驱动 executeRound，按 phaseIndex 切片统计每段回合数/吃血（phase 内击杀当回合计入该段）。
async function sampleTrib(btId, seed) {
  const h = await bootGame({ seed });
  h.Game.init({ debug: false, fresh: true });
  const st = h.Game.state;
  const bt = h.DataManager.getById("breakthrough_table", btId);
  if (!bt || !bt.breakthrough_id) return { btId, error: "row missing" };
  st.realm_id = String(bt.from_realm);
  for (const id of h.DataManager.getResourceIds()) st.resources[id] = 1e9;
  st.resources.daoxing = Number(bt.required_daoxing);
  st.boss_counts_today = {};
  h.Game.popupQueue.length = 0;
  h.Game.confirmBreakthrough();
  const battle = takeBattle(h.Game);
  if (!battle) return { btId, error: "no battle queued" };
  const E = h.BattleEngineV2;
  const phases = [];
  let cur = { name: battle.enemies[0].name, hpMax: battle.enemies[0].hpMax, power: battle.enemies[0].power, rounds: 0, taken: 0 };
  while (!E._dead(battle) && battle.round < battle.maxRounds) {
    const phaseBefore = battle.phaseIndex;
    const takenBefore = battle.stats.taken;
    E.executeRound(st, battle);
    cur.rounds += 1;
    cur.taken += battle.stats.taken - takenBefore;
    if (battle.phaseIndex !== phaseBefore) {
      phases.push(cur);
      const e0 = battle.enemies[0];
      cur = { name: e0.name, hpMax: e0.hpMax, power: e0.power, rounds: 0, taken: 0 };
    }
  }
  phases.push(cur);
  return {
    btId,
    realm: String(bt.from_realm),
    power: h.RealmManager.getCombatPower(st),
    playerHpMax: battle.playerHpMax,
    win: !!battle.win,
    totalRounds: battle.round,
    taken: battle.stats.taken,
    takenRatio: +(battle.stats.taken / battle.playerHpMax).toFixed(3),
    phases,
  };
}

async function main() {
  const seed = 20260829;
  const rows = [];
  for (const [realmId, bossId] of PLAN) rows.push(await sample(realmId, bossId, seed));
  const cols = ["realmId", "power", "playerHpMax", "enemyHpMax", "dps", "rounds", "win", "taken"];
  console.log(cols.join("\t"));
  for (const r of rows) console.log(cols.map((c) => (c === "win" ? (r.win ? "胜" : "负") : r[c])).join("\t"));
  const ok = rows.filter((r) => r.rounds >= 3 && r.rounds <= 8).length;
  console.log(`\n目标带（3-8 回合）命中：${ok}/${rows.length}`);

  // 破劫：8 关 × 全 phase
  const trows = [];
  for (const row of DataManagerRowsForTrib()) trows.push(await sampleTrib(row, seed));
  console.log("\n===== 破劫采样（21.1 §1.1：8 关 × 全 phase，生产路径 confirmBreakthrough）=====");
  console.log(["btId", "境界", "战力", "胜负", "总回合", "吃血比", "各段（回合/吃血）"].join("\t"));
  for (const r of trows) {
    if (r.error) { console.log(`${r.btId}\tERROR: ${r.error}`); continue; }
    const per = r.phases.map((p) => `${p.name}:${p.rounds}r/${Math.round(p.taken)}`).join("  ");
    console.log([r.btId, r.realm, r.power, r.win ? "胜" : "负", r.totalRounds, r.takenRatio, per].join("\t"));
  }

  // 目标带命中：bt_002~bt_008 全 phase（bt_001 手感冻结=旧公式两段 1 回合，按设计不计带）。
  // 验收口径对齐 D 线：命中率 ≥ 8/11（比值）。
  const tribPts = [];
  for (const r of trows) if (!r.error && r.btId !== "bt_001") tribPts.push(...r.phases);
  const bandHits = tribPts.filter((p) => p.rounds >= 3 && p.rounds <= 8).length;
  const tribWins = trows.filter((r) => !r.error && r.win).length;
  console.log(`破劫目标带（3-8 回合/phase）命中：${bandHits}/${tribPts.length}（验收口径 ≥8/11 比值：${(bandHits / Math.max(1, tribPts.length) >= 8 / 11) ? "达标" : "未达标"}）`);
  console.log(`破劫八关胜负：${tribWins}/${trows.length}`);

  // bt_001 前 30 分钟手感冻结断言（逐字段一致；漂移即 exit 1）
  const g = trows.find((r) => r.btId === "bt_001");
  const diffs = [];
  if (!g || g.error) diffs.push(`bt_001 采样失败：${g ? g.error : "missing"}`);
  else {
    if (g.win !== BT_001_GOLDEN.win) diffs.push(`win ${g.win} != ${BT_001_GOLDEN.win}`);
    if (g.totalRounds !== BT_001_GOLDEN.totalRounds) diffs.push(`totalRounds ${g.totalRounds} != ${BT_001_GOLDEN.totalRounds}`);
    if (g.taken !== BT_001_GOLDEN.taken) diffs.push(`taken ${g.taken} != ${BT_001_GOLDEN.taken}`);
    if (g.phases.length !== BT_001_GOLDEN.phases.length) diffs.push(`phase 数 ${g.phases.length} != ${BT_001_GOLDEN.phases.length}`);
    else BT_001_GOLDEN.phases.forEach((gp, i) => {
      const ap = g.phases[i];
      for (const k of ["name", "hpMax", "power", "rounds", "taken"]) {
        if (ap[k] !== gp[k]) diffs.push(`phase[${i}].${k} ${ap[k]} != ${gp[k]}`);
      }
    });
  }
  if (diffs.length) {
    console.log(`\n❌ bt_001 黄金快照漂移（前 30 分钟手感冻结被破坏）：`);
    for (const d of diffs) console.log("  - " + d);
    process.exit(1);
  }
  console.log("bt_001 黄金快照：零漂移 ✅（回合数/吃血/敌 HP 与还债前基线逐字段一致）");

  if (process.argv[2] === "--json") console.log(JSON.stringify({ boss: rows, tribulations: trows }, null, 2));
}

// bt 表行序（bt_001~bt_008）
function DataManagerRowsForTrib() {
  return ["bt_001", "bt_002", "bt_003", "bt_004", "bt_005", "bt_006", "bt_007", "bt_008"];
}

main().catch((e) => { console.error(e); process.exit(1); });
