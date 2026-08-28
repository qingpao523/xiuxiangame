"use strict";
// ============================================================================
// test/server-game-test.js —— Step 2 同构验证（design/20.0）
//
// 完成标准：node test/server-game-test.js 跑 init→tick→levelUp→startBossBattle，
//           模拟 7 天流程，无报错。
// 源码改动 ≤20 行：save-manager.js 存储后端抽象（LocalSaveManager/useBackend/hasSave）
//                 + game.js init(opts) 参数注入（去 location.search / localStorage 裸依赖）。
// 其余靠 test/harness.js 的 vm 沙箱 + Atmosphere 表现层桩。
// ============================================================================
const { bootGame } = require("./harness");

let failures = 0;
function assert(cond, msg) { if (cond) console.log(`  ✅ ${msg}`); else { console.log(`  ❌ ${msg}`); failures++; } }

// 注入修行资源，使升重/斗法可行（Step2 只验证流程跑得通，不调平衡）
function grantResources(state) { for (const id of Object.keys(state.resources)) state.resources[id] = 1e9; }

// startBossBattle 把战斗排队进 popupQueue（{kind:"battle_v2", battle}），不 return（game.js:578 丢弃返回值）。
// 从队列取最后一个 battle_v2 弹窗的 battle；取不到说明 BossManager.canChallenge 拒绝（会排"挑战"text 弹窗）。
function takeBattle(Game) {
  const idx = Game.popupQueue.map((p) => p.kind).lastIndexOf("battle_v2");
  if (idx < 0) return null;
  return Game.popupQueue.splice(idx, 1)[0].battle;
}

async function main() {
  const SEED = 20260828;
  console.log("========================================================");
  console.log(" Step 2 同构验证：game.js 在 Node.js 跑完整生命周期 + 7天流程");
  console.log(" 随机种子 =", SEED);
  console.log("========================================================");

  const g = await bootGame({ seed: SEED });
  const { Game, RealmManager, BattleEngineV2, SaveManager } = g;

  // —— init ——
  Game.init({ debug: false });
  const state = Game.state;
  console.log(`\n[init] realm=${state.realm_id} race='${state.race_id}' resources键数=${Object.keys(state.resources).length} 开局弹窗=${Game.popupQueue.length}`);
  assert(state && typeof state === "object" && Object.keys(state).length > 0, "init() 创建 state");
  assert(state.realm_id === "rq_01", "新号初始境界 rq_01");
  assert(SaveManager.hasSave() === true, "init() 经 SaveManager 后端落档（hasSave=true）");
  assert(Game.popupQueue.length > 0, "init() 弹出开局弹窗（prologue/race_choice）");

  // —— tick ——
  Game.tick();
  assert(true, "tick() 无异常返回");

  // —— levelUp（注入资源后升重，验证 Atmosphere 表现层桩路径）——
  grantResources(state);
  let ups = 0;
  while (ups < 5 && RealmManager.canLevelUp(state)) { Game.levelUp(); ups++; }
  console.log(`[levelUp] 升重次数=${ups} 当前境界=${state.realm_id} 战力=${RealmManager.getCombatPower(state)}`);
  assert(ups >= 1, `levelUp() 至少成功升重 1 次（实际 ${ups}）`);

  // —— startBossBattle（创建 → 运行 → 结算）——
  Game.startBossBattle("boss_001");
  console.log(`[boss] startBossBattle 后弹窗种类=[${Game.popupQueue.map((p) => p.kind).join(",")}]`);
  const battle = takeBattle(Game);
  assert(battle && typeof battle === "object" && Array.isArray(battle.enemies), "startBossBattle() 排队 battle_v2 弹窗（含 battle 对象）");
  if (battle) {
    BattleEngineV2.runFullAuto(state, battle);
    Game.finishBattle(battle);
    console.log(`[boss] boss_001 结果=${battle.win ? "胜" : "负"} 回合=${battle.round}/${battle.maxRounds}`);
    assert(battle.done === true, "Boss 战跑到结束（battle.done）");
    assert(battle.source === "boss", "battle.source==='boss'（finishBattle 走 Boss 结算分支）");
  }

  // —— 模拟 7 天流程 ——
  console.log("\n================ 模拟 7 天流程 ================");
  const dayLog = [];
  for (let day = 1; day <= 7; day++) {
    state.boss_counts_today = {}; state.action_counts_today = {}; state.event_counts_today = {};
    grantResources(state);
    Game.tick();
    let du = 0; while (du < 3 && RealmManager.canLevelUp(state)) { Game.levelUp(); du++; }
    Game.startBossBattle("boss_001");
    const b = takeBattle(Game);
    let res = "—";
    if (b) { BattleEngineV2.runFullAuto(state, b); Game.finishBattle(b); res = b.win ? "胜" : "负"; }
    dayLog.push(`第${day}天: 境界=${state.realm_id} 战力=${RealmManager.getCombatPower(state)} 升重+${du} Boss=${res}`);
  }
  dayLog.forEach((l) => console.log("  " + l));
  assert(dayLog.length === 7, "完成 7 天流程循环");
  assert(RealmManager.getCombatPower(state) >= 280, "7 天后战力不低于初始（成长或保持）");

  console.log("\n========================================================");
  if (failures === 0) {
    console.log(" ✅ Step 2 通过：game.js 在 Node.js 跑通 init→tick→levelUp→startBossBattle + 7天流程。");
    process.exit(0);
  } else {
    console.log(` ❌ Step 2 失败：${failures} 项断言未通过。`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("\n❌ Step 2 抛出异常（未完成标准）：");
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});
