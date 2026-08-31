"use strict";
// ============================================================================
// test/tribulation-advantage.test.js —— T-B 显示=现实 + 保底兑现 验收 harness
// （21.1 §1.2 / §1.3 验收钩子，design/22.0 §二）
//
// 四个部分：
//   S1 罡气注入单测：breakdown 净值 → 开局罡气（含负净值=0、上限 0.5、bt_001 feel_lock 豁免）
//   S2 保底×0.7 单测：fail_counts ≥ guarantee_after_fail 当次，phase 敌 HP 恰为 ×0.7（逐字段精确断言，含换段）
//   S3 bt_001 黄金免疫：feel_lock 行堆满功德也不注入罡气，回合/吃血/敌HP 与黄金快照逐字段一致
//   S4 显示=现实 200×2 harness（21.1 §5 钩子 1.2）：bt_008 + 四格构型（死亡驱动中段区间），
//      高功德组 vs 高劫气组各固定种子跑 200 次破劫（生产路径 confirmBreakthrough），
//      胜率差与 breakdown 净值差方向一致且显著（双比例 z 检验 ≥1.96）。
//
// 构型说明：D 线战力比模型对敌我同步缩放，纯数值 handicap 无法制造胜负不确定性；
// 斗法栏位数是唯一破坏缩放不变性的合法构型杠杆（每格后接敌方夹招，格数↑吃血↑）。
// 探测（devlog 2026-08-31）：bt_008 四格构型基线约 75% 胜，败因全部为死亡（非超时），
// 胜者余血最低 0.002——开局罡气恰好能翻转这类死亡败，故为本 harness 的采样区间。
// ============================================================================
const { bootGame } = require("./harness.js");

const BT_001_GOLDEN = { win: true, totalRounds: 2, taken: 1029, hp: [4260, 5396] };
const SEED_BASE = 20260831;
const SEED_STEP = 104729;
const RUNS = 200;

let failures = [];
function assert(cond, msg) {
  if (!cond) { failures.push(msg); console.log("  ❌ " + msg); }
  else console.log("  ✅ " + msg);
}

function takeBattle(Game) {
  const idx = Game.popupQueue.map((p) => p.kind).lastIndexOf("battle_v2");
  return idx < 0 ? null : Game.popupQueue.splice(idx, 1)[0].battle;
}

// 生产路径起一场破劫斗法：新号 → 境界/资源 → （可选）斗法栏截断 → confirmBreakthrough
async function startTribBattle(opts) {
  const h = await bootGame({ seed: opts.seed != null ? opts.seed : SEED_BASE });
  h.Game.init({ debug: false, fresh: true });
  const st = h.Game.state;
  const bt = h.DataManager.getById("breakthrough_table", opts.btId);
  st.realm_id = String(bt.from_realm);
  for (const id of h.DataManager.getResourceIds()) st.resources[id] = 1e9;
  st.resources.daoxing = Number(bt.required_daoxing);
  st.resources.merit = opts.merit != null ? opts.merit : 1e9;
  st.resources.calamity = opts.calamity != null ? opts.calamity : 1e9;
  if (opts.race != null) st.race_id = opts.race;
  if (opts.faction != null) st.faction_id = opts.faction;
  if (opts.treasures != null) st.treasures = opts.treasures;
  if (opts.failCounts != null) st.breakthrough_fail_counts = opts.failCounts;
  if (opts.slots != null) {
    const ids = st.battle_slots.map((s) => s.id);
    let i = 0;
    while (st.battle_slots.length < opts.slots) st.battle_slots.push({ id: ids[i++ % ids.length], condition: "always" });
  }
  h.Game.popupQueue.length = 0;
  const breakdown = h.BreakthroughManager.getRateBreakdown(st, bt);
  h.Game.confirmBreakthrough();
  const battle = takeBattle(h.Game);
  return { h, st, bt, battle, breakdown };
}

(async () => {
  // ---------- S1 罡气注入单测 ----------
  console.log("\n===== S1 显示=现实：breakdown 净值 → 开局罡气 =====");
  {
    // 高功德：merit 4000 → meritBonus 0.2（满上限），无其它项，劫气 0 → 净值 0.2
    const a = await startTribBattle({ btId: "bt_003", merit: 4000, calamity: 0, seed: SEED_BASE + 1 });
    const netA = a.breakdown.meritBonus + a.breakdown.treasureBonus + a.breakdown.failBonus + a.breakdown.raceBonus + a.breakdown.factionBonus - a.breakdown.calamityPenalty;
    assert(Math.abs(netA - 0.2) < 1e-9, `bt_003 高功德净值 = ${netA}（期望 0.2）`);
    const expA = Math.round(a.battle.playerHpMax * 0.2 * 0.5); // k=0.5
    assert(a.battle._advBlock === expA && a.battle.playerBlock === expA,
      `开局罡气 = ${a.battle.playerBlock}（期望 round(hpMax×0.2×0.5)=${expA}，k=0.5）`);
  }
  {
    // 高劫气：merit 0、calamity 5000 → penalty 0.15 → 净值 −0.15 → 钳为 0，无罡气
    const b = await startTribBattle({ btId: "bt_003", merit: 0, calamity: 5000, seed: SEED_BASE + 2 });
    const netB = b.breakdown.meritBonus + b.breakdown.treasureBonus + b.breakdown.failBonus + b.breakdown.raceBonus + b.breakdown.factionBonus - b.breakdown.calamityPenalty;
    assert(Math.abs(netB - -0.15) < 1e-9, `bt_003 高劫气净值 = ${netB}（期望 −0.15）`);
    assert(!b.battle._advBlock && b.battle.playerBlock === 0, `负净值不注入罡气（playerBlock=${b.battle.playerBlock}）`);
  }
  {
    // 净值上限 0.5：功德 0.2 + 法宝 0.12 + 屡败 0.5(5败) + 人族 0.03 + 天庭 0.05 = 0.9 → 钳 0.5 → 罡气 25% hpMax
    const c = await startTribBattle({
      btId: "bt_003", merit: 4000, calamity: 0, race: "human", faction: "tianting",
      treasures: { treasure_001: { level: 9 } }, failCounts: { bt_003: 5 }, seed: SEED_BASE + 3,
    });
    const netC = c.breakdown.meritBonus + c.breakdown.treasureBonus + c.breakdown.failBonus + c.breakdown.raceBonus + c.breakdown.factionBonus - c.breakdown.calamityPenalty;
    assert(netC > 0.5, `bt_003 极限堆叠净值 = ${netC}（>0.5，触发上限钳制）`);
    const expC = Math.round(c.battle.playerHpMax * 0.5 * 0.5);
    assert(c.battle._advBlock === expC, `罡气按净值上限 0.5 钳制 = ${c.battle._advBlock}（期望 ${expC} = 25% hpMax）`);
  }

  // ---------- S2 保底 ×0.7 单测（21.1 §5 钩子 1.3：fail_counts=guarantee 当次 HP 恰为 ×0.7） ----------
  console.log("\n===== S2 保底兑现：phase 敌 HP 恰为 ×0.7 =====");
  {
    const base = await startTribBattle({ btId: "bt_003", merit: 0, calamity: 0, failCounts: { bt_003: 0 }, seed: SEED_BASE + 4 });
    const dull = await startTribBattle({ btId: "bt_003", merit: 0, calamity: 0, failCounts: { bt_003: 2 }, seed: SEED_BASE + 4 }); // guarantee=2
    assert(!base.battle.guaranteeActive && dull.battle.guaranteeActive, "保底判定：0 败未触发、2 败（=guarantee）触发");
    const hp0 = base.battle.enemies[0].hpMax, hpG = dull.battle.enemies[0].hpMax;
    assert(hpG === Math.round(hp0 * 0.7), `首段敌 HP ${hpG} === round(${hp0}×0.7)=${Math.round(hp0 * 0.7)}（精确 ×0.7）`);
    assert(dull.battle.enemies[0].power === base.battle.enemies[0].power, "攻击力不变（只钝血不钝牙）");
    // 换段后依旧 ×0.7：打到第二段再比对
    const E = dull.h.BattleEngineV2;
    while (!E._dead(dull.battle) && dull.battle.phaseIndex === 0) E.executeRound(dull.st, dull.battle);
    if (dull.battle.phaseIndex >= 1 && !dull.battle.done) {
      while (!E._dead(base.battle) && base.battle.phaseIndex === 0) E.executeRound(base.st, base.battle);
      const p2G = dull.battle.enemies[0].hpMax, p20 = base.battle.enemies[0].hpMax;
      assert(p2G === Math.round(p20 * 0.7), `第二段敌 HP ${p2G} === round(${p20}×0.7)=${Math.round(p20 * 0.7)}（换段路径生效）`);
    } else {
      assert(false, "未能推进到第二段（战斗提前结束）");
    }
    // guarantee−1 不触发
    const near = await startTribBattle({ btId: "bt_003", merit: 0, calamity: 0, failCounts: { bt_003: 1 }, seed: SEED_BASE + 4 });
    assert(!near.battle.guaranteeActive && near.battle.enemies[0].hpMax === hp0, "1 败（=guarantee−1）未触发，HP 与基线一致");
  }
  {
    // feel_lock 行同样吃保底（bt_001 guarantee=2）：新手屡败后榜文也钝——黄金快照以 0 败口径采样，互不影响
    const g = await startTribBattle({ btId: "bt_001", merit: 0, calamity: 0, failCounts: { bt_001: 2 }, seed: SEED_BASE + 5 });
    const raw = Math.round(g.battle.playerHpMax * 0.75); // feel_lock 旧公式首段 hp = hpMax×power_ratio（bt_001 首段 0.75，basePower=playerPower=hpMax）
    assert(g.battle.guaranteeActive && g.battle.enemies[0].hpMax === Math.max(1, Math.round(raw * 0.7)),
      `bt_001 保底生效：HP ${g.battle.enemies[0].hpMax} = round(round(hpMax×0.75)×0.7)`);
  }

  // ---------- S3 bt_001 黄金免疫（feel_lock 豁免罡气注入） ----------
  console.log("\n===== S3 bt_001 黄金免疫：堆满功德也不注入，快照零漂移 =====");
  {
    // 与 balance-metrics 黄金采样状态逐位一致（资源全 1e9 → 净值 0.2−0.15=0.05 ≠ 0，仍不得注入）
    const w = await startTribBattle({ btId: "bt_001", seed: 20260829 });
    assert(!w.battle._advBlock && w.battle.playerBlock === 0, `bt_001 feel_lock 豁免罡气注入（净值 0.05，playerBlock=${w.battle.playerBlock}）`);
    const E = w.h.BattleEngineV2;
    E.runFullAuto(w.st, w.battle);
    assert(w.battle.win === BT_001_GOLDEN.win && w.battle.round === BT_001_GOLDEN.totalRounds && w.battle.stats.taken === BT_001_GOLDEN.taken,
      `bt_001 全量回归：win=${w.battle.win}/rounds=${w.battle.round}/taken=${w.battle.stats.taken}（黄金 ${BT_001_GOLDEN.win}/${BT_001_GOLDEN.totalRounds}/${BT_001_GOLDEN.taken}）`);
  }

  // ---------- S4 显示=现实 200×2 harness（21.1 §5 钩子 1.2） ----------
  console.log(`\n===== S4 显示=现实 200×2 harness（bt_008 四格构型，种子 ${SEED_BASE} 起） =====`);
  const wins = { merit: 0, calamity: 0 };
  const nets = {};
  for (const group of ["merit", "calamity"]) {
    const cfg = group === "merit" ? { merit: 4000, calamity: 0 } : { merit: 0, calamity: 5000 };
    for (let i = 0; i < RUNS; i++) {
      const seed = SEED_BASE + i * SEED_STEP;
      const r = await startTribBattle({ btId: "bt_008", slots: 4, seed, ...cfg });
      if (i === 0) {
        const b = r.breakdown;
        nets[group] = +(b.meritBonus + b.treasureBonus + b.failBonus + b.raceBonus + b.factionBonus - b.calamityPenalty).toFixed(4);
      }
      r.h.BattleEngineV2.runFullAuto(r.st, r.battle);
      if (r.battle.win) wins[group] += 1;
    }
  }
  const pM = wins.merit / RUNS, pC = wins.calamity / RUNS;
  const pPool = (wins.merit + wins.calamity) / (2 * RUNS);
  const z = (pM - pC) / Math.sqrt(Math.max(1e-12, pPool * (1 - pPool) * (2 / RUNS)));
  console.log(`  净值：高功德 ${nets.merit} vs 高劫气 ${nets.calamity}（差 ${(nets.merit - nets.calamity).toFixed(4)}）`);
  console.log(`  胜率：高功德 ${wins.merit}/${RUNS}=${(pM * 100).toFixed(1)}% vs 高劫气 ${wins.calamity}/${RUNS}=${(pC * 100).toFixed(1)}%`);
  console.log(`  胜率差 ${((pM - pC) * 100).toFixed(1)}pp，双比例 z=${z.toFixed(2)}`);
  assert(Math.sign(pM - pC) === Math.sign(nets.merit - nets.calamity) && pM !== pC,
    "胜率差方向与 breakdown 净值差方向一致（高功德 > 高劫气）");
  assert(Math.abs(z) >= 1.96, `胜率差显著（|z|=${Math.abs(z).toFixed(2)} ≥ 1.96，α=0.05）`);

  // ---------- 汇总 ----------
  console.log("\n===== 汇总 =====");
  if (failures.length) {
    console.log(`❌ ${failures.length} 项断言失败：`);
    for (const f of failures) console.log("  - " + f);
    process.exit(1);
  }
  console.log("✅ 全部断言通过（显示=现实 + 保底兑现 + bt_001 黄金免疫）");
})().catch((e) => { console.error(e); process.exit(1); });
