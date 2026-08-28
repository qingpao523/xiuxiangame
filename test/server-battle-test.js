"use strict";
// ============================================================================
// test/server-battle-test.js —— Step 1 同构验证（design/20.0）
//
// 完成标准：node test/server-battle-test.js 打印完整战斗结果，无报错。
// 验证：同 Boss 配置 + 同随机种子，跑两次结果完全一致（客户端/服务端一致性代理）。
// 源码 0 改动，仅通过 test/harness.js 的 vm 沙箱加载浏览器逻辑层。
// ============================================================================
const { bootEngine } = require("./harness");

// 镜像 game.js startBossBattleV2(:572-577) 的 adds 与 cfg 构造（host 侧用 Number 代替沙箱 num）
const BOSS_ADDS = {
  boss_002: (p) => [{ name: "巡海残兵", power: p * 0.2 }],
  boss_003: (p) => [{ name: "白骨阴火", power: p * 0.12 }, { name: "白骨阴火", power: p * 0.12 }],
  boss_020: (p) => [{ name: "碧霄", power: p * 0.5 }, { name: "琼霄", power: p * 0.5 }],
};

function buildBossCfg(DataManager, bossId) {
  const boss = DataManager.getById("boss_table", bossId);
  if (!Object.keys(boss).length) throw new Error(`boss_table 无此 Boss: ${bossId}`);
  const p = Number(boss.recommended_power) || 0;
  const adds = BOSS_ADDS[bossId] ? BOSS_ADDS[bossId](p) : [];
  const mechanic = boss.mechanics ? String(boss.mechanics).split(":")[0].trim() : null;
  return {
    name: String(boss.boss_name),
    enemy_power: p,
    adds,
    source: "boss",
    mechanic,
    weakness: boss.weakness || null,
    payload: { bossId },
  };
}

// 跑一场 Boss 战，返回可比较的结果签名 + 完整 battle
async function runBossBattle(seed, bossId) {
  const eng = await bootEngine({ seed });
  const state = eng.SaveManager.loadOrCreate();
  const playerPower = eng.RealmManager.getCombatPower(state);
  const cfg = buildBossCfg(eng.DataManager, bossId);
  const battle = eng.BattleEngineV2.create(state, cfg);
  const events = eng.BattleEngineV2.runFullAuto(state, battle);
  return { eng, state, playerPower, cfg, battle, events };
}

function signature(battle) {
  return JSON.stringify({
    win: battle.win,
    round: battle.round,
    dealt: battle.stats && battle.stats.dealt,
    taken: battle.stats && battle.stats.taken,
    playerHp: battle.playerHp,
    enemiesHp: (battle.enemies || []).map((e) => e.hp),
  });
}

function printBattle(tag, r) {
  const b = r.battle;
  console.log(`\n────────── ${tag} ──────────`);
  console.log(`Boss        : ${r.cfg.name}（${r.cfg.payload.bossId}）  机制=${r.cfg.mechanic || "无"}  弱点=${JSON.stringify(r.cfg.weakness)}`);
  console.log(`玩家战力    : ${r.playerPower}   玩家气血: ${b.playerHp}/${b.playerHpMax}   本命: ${b.benming || "无"}`);
  console.log(`敌方        : ${(b.enemies || []).map((e) => `${e.name}[hp ${e.hp}]`).join(", ")}`);
  console.log(`结果        : ${b.done ? "已结束" : "未结束"}  ${b.win ? "✅ 胜利" : "❌ 失利"}  回合=${b.round}/${b.maxRounds}`);
  console.log(`战报统计    : 输出=${b.stats.dealt} 承受=${b.stats.taken} 末击=${b.stats.lastHit || "—"} 共鸣破/增/常=${b.stats.resoBroken}/${b.stats.resoEnhanced}/${b.stats.resoNormal}`);
  console.log(`事件总数    : ${r.events.length}   类型分布: ${typeDist(r.events)}`);
}

function typeDist(events) {
  const m = {};
  for (const e of events) m[e.type] = (m[e.type] || 0) + 1;
  return Object.entries(m).map(([k, v]) => `${k}×${v}`).join(" ");
}

let failures = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  ✅ ${msg}`); }
  else { console.log(`  ❌ ${msg}`); failures++; }
}

async function main() {
  const SEED = 20260828;
  console.log("========================================================");
  console.log(" Step 1 同构验证：battle-engine-v2 在 Node.js 跑完整 Boss 战");
  console.log(" 随机种子 =", SEED, "（可复现）");
  console.log("========================================================");

  // —— 用例 A：无机制 Boss（boss_001 山野妖首）——
  const a = await runBossBattle(SEED, "boss_001");
  printBattle("用例A · 无机制 Boss", a);

  // —— 用例 B：带机制 Boss（boss_004 黑风老妖·summon，弱点 weapon）——
  const bRun = await runBossBattle(SEED, "boss_004");
  printBattle("用例B · 机制 Boss(summon)", bRun);

  // —— 完成标准断言 ——
  console.log("\n================ 完成标准断言 ================");
  for (const [tag, r] of [["A", a], ["B", bRun]]) {
    assert(r.battle && typeof r.battle === "object", `用例${tag}: create() 返回 battle 对象`);
    assert(r.battle.done === true, `用例${tag}: 战斗跑到结束（battle.done === true）`);
    assert(typeof r.battle.win === "boolean", `用例${tag}: 有明确胜负（battle.win 为 boolean）`);
    assert(r.battle.round >= 1, `用例${tag}: 至少进行了 1 回合（round=${r.battle.round}）`);
    assert(Array.isArray(r.events) && r.events.length > 0, `用例${tag}: 产出战斗事件（${r.events.length} 条）`);
    assert((r.battle.stats.dealt | 0) > 0, `用例${tag}: 玩家造成了伤害（dealt=${r.battle.stats.dealt}）`);
  }

  // —— 一致性验证：同种子跑两次，结果签名完全一致 ——
  console.log("\n================ 一致性验证（同种子 ×2）================");
  const a2 = await runBossBattle(SEED, "boss_001");
  const b2 = await runBossBattle(SEED, "boss_004");
  const sigA1 = signature(a.battle), sigA2 = signature(a2.battle);
  const sigB1 = signature(bRun.battle), sigB2 = signature(b2.battle);
  console.log("  boss_001 run1:", sigA1);
  console.log("  boss_001 run2:", sigA2);
  console.log("  boss_004 run1:", sigB1);
  console.log("  boss_004 run2:", sigB2);
  assert(sigA1 === sigA2, "boss_001 两次运行结果完全一致（确定性）");
  assert(sigB1 === sigB2, "boss_004 两次运行结果完全一致（确定性）");

  console.log("\n========================================================");
  if (failures === 0) {
    console.log(" ✅ Step 1 通过：引擎在 Node.js 无报错跑完 Boss 战，且结果确定可复现。");
    console.log("========================================================");
    process.exit(0);
  } else {
    console.log(` ❌ Step 1 失败：${failures} 项断言未通过。`);
    console.log("========================================================");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\n❌ Step 1 运行抛出异常（未完成标准）：");
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
