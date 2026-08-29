#!/usr/bin/env node
"use strict";
// C 线（design/6.2 维度4 重连）：道友结缘护持回归测试
// 覆盖：bondPassiveSum 单测 / 引擎 bondMods（多宝全伤、殷郊破劫罡气、广成子破罡、陆压处决、孔宣减伤、云霄控抗）
//       姜子牙杀阵奖励 / 赵公明战利 / 元始破劫成功率 / 土行孙游历耗时 / 老君炼丹翻倍
// 运行：node tests/companion-passives.test.js
const path = require("path");
const { bootGame } = require(path.join(__dirname, "..", "test", "harness.js"));

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra != null ? " → " + JSON.stringify(extra) : ""}`); }
}

function bond(state, id) {
  state.companions = state.companions || {};
  state.companions[id] = { bonded: true, stage: 3 };
  state.lineup = [id];
}

async function main() {
  console.log("== C 线：道友结缘护持（bond_passive）回归 ==\n");

  // ---- 1. bondPassiveSum 单测 ----
  {
    const h = await bootGame({ seed: 20260829 });
    h.Game.init({ debug: false, fresh: true });
    const st = h.Game.state;
    const sum = (type) => h.runInSandbox(`bondPassiveSum(Game.state, ${JSON.stringify(type)})`);
    st.companions = { duobao: { bonded: true, stage: 3 } };
    st.lineup = [];
    check("结缘未上场 → 0", sum("all_dmg") === 0, sum("all_dmg"));
    st.lineup = ["duobao"];
    check("多宝上场 → all_dmg=0.08", Math.abs(sum("all_dmg") - 0.08) < 1e-9, sum("all_dmg"));
    st.lineup = ["duobao", "nobody"]; // 未结缘/不存在的 id 不计
    check("未结缘同列 → 仍 0.08", Math.abs(sum("all_dmg") - 0.08) < 1e-9, sum("all_dmg"));
    st.companions.tongtian = { bonded: true, stage: 3 };
    st.lineup = ["duobao", "tongtian"];
    check("多类型互不串扰 → all_dmg 仍 0.08（通天道友是 weapon_dmg）", Math.abs(sum("all_dmg") - 0.08) < 1e-9);
    check("通天上场 → weapon_dmg=0.20", Math.abs(sum("weapon_dmg") - 0.2) < 1e-9, sum("weapon_dmg"));
  }

  // ---- 2. 引擎 bondMods：多宝全伤 ----
  {
    const mk = async (withDuobao) => {
      const h = await bootGame({ seed: 20260829 });
      h.Game.init({ debug: false, fresh: true });
      const st = h.Game.state;
      if (withDuobao) bond(st, "duobao");
      const battle = h.BattleEngineV2.create(st, { name: "试剑石", enemy_power: 1000, source: "boss", payload: {} });
      return { h, st, battle };
    };
    const a = await mk(false), b = await mk(true);
    check("无护持 → bondMods.all_dmg=0", a.battle.bondMods.all_dmg === 0);
    check("多宝上场 → bondMods.all_dmg=0.08", b.battle.bondMods.all_dmg === 0.08);
    const dmgA = a.h.BattleEngineV2._applyGlobalMult(1000, a.st, a.battle, { spell_type: "fire" });
    const dmgB = b.h.BattleEngineV2._applyGlobalMult(1000, b.st, b.battle, { spell_type: "fire" });
    check("多宝上场同技能伤害 ≈ ×1.08", dmgB === Math.floor(dmgA * 1.08), { dmgA, dmgB });
  }

  // ---- 3. 殷郊 trib_shield：破劫开局罡气 = 气血上限×10% ----
  {
    const h = await bootGame({ seed: 20260829 });
    h.Game.init({ debug: false, fresh: true });
    const st = h.Game.state;
    bond(st, "yinjiao");
    const battle = h.BattleEngineV2.create(st, { name: "天劫", enemy_power: 1000, source: "breakthrough", payload: {} });
    check("殷郊上场破劫 → 开局罡气=round(hpMax×0.10)", battle.playerBlock === Math.round(battle.playerHpMax * 0.1), { block: battle.playerBlock, hpMax: battle.playerHpMax });
    const normal = h.BattleEngineV2.create(st, { name: "妖物", enemy_power: 1000, source: "boss", payload: {} });
    check("非破劫战斗 → 不加罡气", normal.playerBlock === 0);
  }

  // ---- 4. 广成子破罡 + 陆压处决 ----
  {
    const h = await bootGame({ seed: 20260829 });
    h.Game.init({ debug: false, fresh: true });
    const st = h.Game.state;
    bond(st, "guangchengzi");
    st.companions.luya = { bonded: true, stage: 3 };
    st.lineup = ["guangchengzi", "luya"];
    const battle = h.BattleEngineV2.create(st, { name: "罡气妖", enemy_power: 1000, source: "normal", payload: {} });
    const enemy = battle.enemies[0];
    // 破罡：敌方罡气吸收 -25% → 1000 伤害对 500 罡气只吸收 375
    enemy.block = 500; enemy.hp = enemy.hpMax = 100000;
    const dealt = h.BattleEngineV2._dealDamageToEnemy(enemy, 1000, battle);
    check("广成子破罡 → 罡气只吸收 75%", dealt === 1000 - 375 && enemy.block === 125, { dealt, block: enemy.block });
    // 处决：陆压斩杀线 5%
    enemy.block = 0; enemy.hp = Math.round(enemy.hpMax * 0.05);
    h.BattleEngineV2._dealDamageToEnemy(enemy, 1, battle);
    check("陆压处决 → 敌 hp≤5% 时斩杀归零", enemy.hp === 0, { hp: enemy.hp });
    enemy.hp = Math.round(enemy.hpMax * 0.06);
    h.BattleEngineV2._dealDamageToEnemy(enemy, 1, battle);
    check("hp>5% 不处决", enemy.hp === Math.round(enemy.hpMax * 0.06) - 1, { hp: enemy.hp });
  }

  // ---- 5. 孔宣减伤 + 云霄控抗（字段就位） ----
  {
    const h = await bootGame({ seed: 20260829 });
    h.Game.init({ debug: false, fresh: true });
    const st = h.Game.state;
    st.companions = { kongxuan: { bonded: true, stage: 3 }, yunxiao: { bonded: true, stage: 3 } };
    st.lineup = ["kongxuan", "yunxiao"];
    const battle = h.BattleEngineV2.create(st, { name: "试炼", enemy_power: 1000, source: "normal", payload: {} });
    check("孔宣上场 → bondMods.dmg_taken_reduce=0.10", battle.bondMods.dmg_taken_reduce === 0.1);
    check("云霄上场 → bondMods.control_resist=0.20", battle.bondMods.control_resist === 0.2);
    const before = battle.playerHp;
    h.BattleEngineV2._damagePlayer(st, battle, 100);
    check("孔宣减伤 → 100 点伤害只扣 90", before - battle.playerHp === 90, { lost: before - battle.playerHp });
  }

  // ---- 6. 元始 trib_rate：破劫成功率 +0.15 ----
  {
    const h = await bootGame({ seed: 20260829 });
    h.Game.init({ debug: false, fresh: true });
    const st = h.Game.state;
    const data = { breakthrough_id: "bt_001", base_success_rate: 0.3, min_success_rate: 0.05, max_success_rate: 0.95, fail_bonus: 0.02 };
    const rate0 = h.BreakthroughManager.getRateBreakdown(st, data).rate;
    bond(st, "yuanshi");
    const rate1 = h.BreakthroughManager.getRateBreakdown(st, data).rate;
    check("元始上场 → 破劫率 +0.15", Math.abs(rate1 - rate0 - 0.15) < 1e-9, { rate0, rate1 });
  }

  // ---- 7. 赵公明战利 +15%（finishBattle boss 奖励） ----
  {
    const run = async (withZhao) => {
      const h = await bootGame({ seed: 20260829 });
      h.Game.init({ debug: false, fresh: true });
      const st = h.Game.state;
      if (withZhao) bond(st, "zhaogongming");
      const before = Number(st.resources.daoxing || 0);
      h.Game.finishBattle({ source: "boss", win: true, done: true, round: 5, stats: { dealt: 100, taken: 50 }, payload: { bossId: "boss_001" } });
      return Number(st.resources.daoxing || 0) - before;
    };
    const g0 = await run(false), g1 = await run(true);
    check("赵公明上场 → Boss 道行奖励更高（×1.15 口径）", g1 > g0 && g1 <= Math.ceil(g0 * 1.15), { g0, g1 });
  }

  // ---- 8. 土行孙游历耗时 -10% ----
  {
    const h = await bootGame({ seed: 20260829 });
    h.Game.init({ debug: false, fresh: true });
    const st = h.Game.state;
    st.realm_id = "rq_03"; // wild_travel 解锁境界
    bond(st, "tuxingsun");
    h.Game.startAction("wild_travel");
    const dur = st.current_action ? (st.current_action.end_time_ms - st.current_action.start_time_ms) / 1000 : -1;
    const row = h.DataManager.getById("action_table", "wild_travel");
    check("土行孙上场 → 游历驻留耗时 ×0.90", dur > 0 && Math.abs(dur - Number(row.duration_sec) * 0.9) <= 2, { dur, base: row.duration_sec });
  }

  // ---- 9. 老君炼丹翻倍 ----
  {
    const h = await bootGame({ seed: 20260829 });
    h.Game.init({ debug: false, fresh: true });
    const st = h.Game.state;
    st.realm_id = "rq_07"; // 丹房解锁（isAlchemyUnlocked 需 rq_07）
    st.resources.mana = 20000; st.resources.spell_page = 100;
    bond(st, "laojun");
    // PILL_DEFS 只有 due/peiyuan/ningfa；渡厄丹中品基准 1 枚，老君护持 ×2
    const before = Number(st.pills?.due || 0);
    const res = h.Game.brewPillWithQuality("due", "zhong");
    const made = Number(st.pills.due) - before;
    check("老君上场炼丹 → 渡厄丹产出 ×2（中品基准 1 → 2）", res && res.ok === true && made === 2, { made, res });
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} 结缘护持回归：PASS ${pass}  FAIL ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("测试异常：", e && (e.stack || e.message || e)); process.exit(1); });
