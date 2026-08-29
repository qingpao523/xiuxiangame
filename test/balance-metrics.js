// design/数值规划与平衡待办 v0.1 §三「统一数值规划」度量 harness（D 线）
// 采集全境界：玩家战力/气血 → 对应 Boss → 回合数/胜负/伤害吞吐，导出基准曲线。
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

async function main() {
  const rows = [];
  for (const [realmId, bossId] of PLAN) rows.push(await sample(realmId, bossId, 20260829));
  const cols = ["realmId", "power", "playerHpMax", "enemyHpMax", "dps", "rounds", "win", "taken"];
  console.log(cols.join("\t"));
  for (const r of rows) console.log(cols.map((c) => (c === "win" ? (r.win ? "胜" : "负") : r[c])).join("\t"));
  const ok = rows.filter((r) => r.rounds >= 3 && r.rounds <= 8).length;
  console.log(`\n目标带（3-8 回合）命中：${ok}/${rows.length}`);
  if (process.argv[2] === "--json") console.log(JSON.stringify(rows, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
