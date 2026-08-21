"use strict";
/* 封神修道录 · boss-mechanics-v2.js 机制单元测试（CLAUDE.md #4 对抗审查）
 * 运行：node tests/boss-mechanics.test.js
 * 验证 design/8.1 v1.3 终稿 9 机制行为；引擎接线（battle-engine-v2.js）deferred 批次0。
 * 随机机制（张桂芳槽位选择/罗宣法宝选择）仅断言结构性结果。
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// ---- 装载被测模块 + int() 依赖（web/js/utils.js:25）到沙箱 ----
function int(value, fallback = 0) { const n = parseInt(value, 10); return Number.isFinite(n) ? n : fallback; }
const sandbox = { int, Math, console };
vm.createContext(sandbox);
const src = fs.readFileSync(path.join(__dirname, "..", "web", "js", "boss-mechanics-v2.js"), "utf8");
vm.runInContext(src + "\n;this.BossMechanicsV2 = BossMechanicsV2;", sandbox);
const BM = sandbox.BossMechanicsV2;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log("  ✗ FAIL: " + msg); } }
function eq(a, b, msg) { ok(a === b, `${msg} (got ${a}, want ${b})`); }
function section(name) { console.log("\n[" + name + "]"); }

// ---- 工厂：构造最小 battle/boss ----
function mkBattle(mechanic, opts = {}) {
  const hpMax = opts.hpMax || 10000;
  const boss = { name: opts.bossName || "Boss", hp: opts.hp != null ? opts.hp : hpMax, hpMax,
    power: opts.power || 1000, block: 0, defMult: 1, atkMult: 1, attacksPerTurn: 2,
    statuses: {}, resistance: {}, weakness: {} };
  return {
    mechanic, enemies: [boss], slots: opts.slots || [],
    playerHp: opts.playerHp || 5000, playerHpMax: opts.playerHpMax || 5000,
    playerStatuses: { invincible: 0, shield: 0, reflect: 0, burn: 0, weak: 0 },
    mechanicState: { turnCount: 0 }, spellDmgReduction: 0, stats: { taken: 0 },
  };
}
function mkSlots(n) { return Array.from({ length: n }, (_, i) => ({ name: "术法" + (i + 1), cooldown: 2, _cd: 0 })); }
// 引擎契约：handler.call(BossMechanicsV2, state, battle, events) —— 用 .call(BM,...) 镜像，this 指向顶层单例
function ts(key, b, ev) { return BM.turnStart[key].call(BM, {}, b, ev); }
function ep(key, b, ev) { return BM.enemyPhase[key].call(BM, {}, b, ev); }

// ============ 1. init 铺底 ============
section("init 按机制铺 mechanicState");
{
  const b = mkBattle("zhangguifang_interrupt"); BM.init({}, b);
  eq(b.mechanicState.interruptEvery, 3, "张桂芳 interruptEvery=3");
}
{
  const b = mkBattle("shiji_parasol", { hpMax: 10000 }); BM.init({}, b);
  eq(b.mechanicState.parasolEvery, 4, "石矶 parasolEvery=4");
  eq(b.mechanicState.parasolHpMax, 1500, "石矶 parasolHpMax=15%Boss血量(10000→1500)");
}
{
  const b = mkBattle("mo_lishou_armor", { hpMax: 10000 }); BM.init({}, b);
  eq(b.enemies[0].block, 3000, "花狐貂护甲=30%Boss血量(10000→3000)");
  eq(b.mechanicState.armorActive, true, "armorActive=true");
}
{
  const b = mkBattle("huoling_burnstack"); BM.init({}, b);
  eq(b.mechanicState.burnDetonateAt, 5, "火灵引爆阈值=5层");
}
{
  const b = mkBattle("luoxuan_fivefire"); BM.init({}, b);
  eq(b.mechanicState.fireBag.length, 5, "罗宣五宝");
  eq(b.mechanicState.fireUsed.length, 0, "fireUsed 初始空");
}

// ============ 2. 张桂芳·呼名落马 ============
section("zhangguifang_interrupt 呼名落马");
{
  const b = mkBattle("zhangguifang_interrupt", { slots: mkSlots(3), hp: 10000, hpMax: 10000 });
  BM.init({}, b);
  b.mechanicState.turnCount = 1; const ev1 = []; ts('zhangguifang_interrupt', b, ev1);
  eq(ev1.length, 0, "第1回合(非3倍数)不打断");
  b.mechanicState.turnCount = 3; const ev3 = []; ts('zhangguifang_interrupt', b, ev3);
  eq(ev3.length, 1, "第3回合打断");
  ok(b.slots.some((s) => s._interrupted === true), "有一槽被标记 _interrupted");
  ok(b.slots.some((s) => (s._cd || 0) >= 2), "被断槽冷却重置(>=2)");
  // hp<30% → 每2回合
  const b2 = mkBattle("zhangguifang_interrupt", { slots: mkSlots(3), hp: 2000, hpMax: 10000 });
  BM.init({}, b2); b2.mechanicState.turnCount = 2; const ev = []; ts('zhangguifang_interrupt', b2, ev);
  eq(ev.length, 1, "hp<30%时第2回合即打断(频率加密)");
}

// ============ 3. 敖丙·化龙形 ============
section("aobing_transform 化龙形");
{
  const b = mkBattle("aobing_transform", { hp: 6000, hpMax: 10000 }); BM.init({}, b);
  const ev1 = []; ep('aobing_transform', b, ev1);
  eq(ev1.length, 0, "hp60%不变身");
  b.enemies[0].hp = 4000; const ev2 = []; ep('aobing_transform', b, ev2);
  eq(ev2.length, 1, "hp<50%变身");
  eq(b.enemies[0].defMult, 2, "防御×2");
  eq(b.enemies[0].attacksPerTurn, 1, "攻击次数2→1");
  const ev3 = []; ep('aobing_transform', b, ev3);
  eq(ev3.length, 0, "一次性，不重复变身");
}

// ============ 4. 石矶·八卦云光帕 ============
section("shiji_parasol 八卦云光帕");
{
  const b = mkBattle("shiji_parasol", { hpMax: 10000 }); BM.init({}, b);
  b.mechanicState.turnCount = 4; const ev = []; ts('shiji_parasol', b, ev);
  eq(b.mechanicState.parasolTurns, 2, "第4回合展帕2回合");
  eq(b.spellDmgReduction, 0.40, "术法伤害-40%");
  // 玩家累积伤害破罩（parasolHpMax=1500）
  const evb = []; BM.onPlayerDamageDealt({}, b, b.enemies[0], 2000, evb);
  eq(b.mechanicState.parasolTurns, 0, "累积2000>1500破罩");
  eq(b.spellDmgReduction, 0, "破罩后减伤恢复");
  ok(evb.some((e) => e.mechanic === "shiji_parasol_break"), "破罩事件");
}

// ============ 5. 魔礼青·青云剑 ============
section("mo_liqing_sword 青云剑");
{
  const b = mkBattle("mo_liqing_sword", { hp: 10000, hpMax: 10000, power: 1000 }); BM.init({}, b);
  b.mechanicState.turnCount = 5; const ev = []; ep('mo_liqing_sword', b, ev);
  eq(b.mechanicState.swordTurns, 2, "第5回合出剑3回合→执行后剩2");
  ok(ev.some((e) => e.mechanic === "mo_liqing_sword"), "剑伤事件");
  ok(b.stats.taken > 0, "飞剑造成真伤(无视护盾)");
}

// ============ 6. 魔礼海·四弦乱心 ============
section("mo_lihai_strings 四弦乱心");
{
  const b = mkBattle("mo_lihai_strings", { slots: mkSlots(2), hp: 10000, hpMax: 10000 }); BM.init({}, b);
  b.mechanicState.turnCount = 1; ts('mo_lihai_strings', b, []);
  eq(b._mechAtkMult, 0.85, "一弦：玩家攻击-15%");
  b.mechanicState.turnCount = 2; ts('mo_lihai_strings', b, []);
  eq(b._mechDefMult, 0.85, "二弦：玩家防御-15%");
  const cdBefore = b.slots[0]._cd || 0; b.mechanicState.turnCount = 3; ts('mo_lihai_strings', b, []);
  eq(b.slots[0]._cd, cdBefore + 1, "三弦：术法CD+1");
  b.mechanicState.turnCount = 4; ts('mo_lihai_strings', b, []);
  eq(b.mechanicState.stringStackTurns, 2, "四弦齐鸣：全叠加2回合");
}

// ============ 7. 魔礼寿·花狐貂护甲 ============
section("mo_lishou_armor 花狐貂护甲");
{
  const b = mkBattle("mo_lishou_armor", { hpMax: 10000 }); BM.init({}, b);
  eq(b.enemies[0].block, 3000, "初始护甲3000");
  b.enemies[0].block = 0; const ev = []; BM.onPlayerDamageDealt({}, b, b.enemies[0], 100, ev);
  eq(b.mechanicState.armorActive, false, "护甲破→armorActive=false");
  eq(b.mechanicState.enraged, true, "暴怒");
  eq(b.enemies[0].defMult, 1, "减伤消失");
  eq(b.enemies[0].atkMult, 2, "攻击力×2");
}

// ============ 8. 魔礼红·混元珍珠伞 ============
section("mo_lihong_umbrella 混元珍珠伞");
{
  const b = mkBattle("mo_lihong_umbrella"); BM.init({}, b);
  b.mechanicState.turnCount = 1; const ev = []; ep('mo_lihong_umbrella', b, ev);
  eq(b.spellDmgReduction, 0.25, "开场第1回合术法-25%");
  eq(b.mechanicState.umbrellaOpen, true, "伞已展");
  b.mechanicState.turnCount = 2; ep('mo_lihong_umbrella', b, []);
  eq(b.spellDmgReduction, 0.25, "整场不可解除(第2回合不叠加)");
}

// ============ 9. 火灵·金霞冠灼烧 ============
section("huoling_burnstack 金霞冠灼烧蔓延");
{
  const b = mkBattle("huoling_burnstack", { hp: 10000, hpMax: 10000, playerHpMax: 5000 }); BM.init({}, b);
  const enemy = b.enemies[0];
  b.mechanicState.turnCount = 1; BM.onEnemyAttack({}, b, enemy, []);
  eq(b.mechanicState.burnStacks, 1, "第1次攻击叠1层");
  // 叠到满5层引爆
  b.mechanicState.turnCount = 2; BM.onEnemyAttack({}, b, enemy, []);
  b.mechanicState.turnCount = 4; BM.onEnemyAttack({}, b, enemy, []);
  b.mechanicState.turnCount = 5; BM.onEnemyAttack({}, b, enemy, []);
  const takenBefore = b.stats.taken;
  b.mechanicState.turnCount = 7; BM.onEnemyAttack({}, b, enemy, []); // 达5层引爆
  eq(b.mechanicState.burnStacks, 0, "引爆后清零");
  ok(b.stats.taken > takenBefore, "引爆造成真伤(最大生命25%)");
  // 灼烧tick
  b.mechanicState.burnStacks = 3; const ev = []; ts('huoling_burnstack', b, ev);
  ok(ev.some((e) => e.mechanic === "huoling_burnstack_tick"), "灼烧每回合tick");
}

// ============ 10. 罗宣·五宝连锁 ============
section("luoxuan_fivefire 五宝连锁");
{
  const b = mkBattle("luoxuan_fivefire", { hp: 10000, hpMax: 10000, power: 1000, playerHpMax: 5000 }); BM.init({}, b);
  for (let i = 0; i < 5; i++) ep('luoxuan_fivefire', b, []);
  eq(b.mechanicState.fireUsed.length, 5, "5件法宝各祭1次");
  const takenBefore = b.stats.taken; const ev = []; ep('luoxuan_fivefire', b, ev);
  ok(ev.some((e) => e.mechanic === "luoxuan_fivefire_burn_city"), "第6次触发焚城");
  eq(b.stats.taken - takenBefore, 2500, "焚城=最大生命50%(5000→2500)");
  eq(b.mechanicState.fireUsed.length, 0, "焚城后重置循环");
}

// ============ 11. _trueDamagePlayer 无敌守卫 ============
section("_trueDamagePlayer 无敌守卫");
{
  const b = mkBattle("huoling_burnstack"); b.playerStatuses.invincible = 1; b.playerHp = 5000;
  const dmg = BM._trueDamagePlayer({}, b, 1000, [], "测试");
  eq(dmg, 0, "无敌时真伤=0");
  eq(b.playerHp, 5000, "无敌不扣血");
  b.playerStatuses.invincible = 0;
  const dmg2 = BM._trueDamagePlayer({}, b, 1000, [], "测试");
  eq(dmg2, 1000, "非无敌真伤生效");
  eq(b.playerHp, 4000, "扣血");
}

console.log(`\n========================================`);
console.log(`PASS ${pass}  FAIL ${fail}`);
console.log(`========================================`);
process.exit(fail === 0 ? 0 : 1);
