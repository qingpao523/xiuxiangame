"use strict";
/* 封神修道录 · liupai-manager.js 单元测试（CLAUDE.md #4 对抗审查）
 * 运行：node tests/liupai-manager.test.js
 * 实现 design/11.1 §三 canUseSpell 断言表 + ensureState/getPassives/nativeSpellTypes 验证。
 * 数据：装载真实 web/data/liupai_table.json（四修 qi/ti/hun/jie）；境界门以可控 reached 集合桩替。
 * 批次2 埋点回归基线：试验期（chosen=null）canUseSpell 恒 true，不影响前期。
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// ---- 装载真实流派表 + 桩替 DataManager / RealmManager ----
const liupaiData = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "web", "data", "liupai_table.json"), "utf8"));
const liupaiRows = Array.isArray(liupaiData) ? liupaiData : liupaiData.rows;
const reached = new Set(); // 可控境界门：reached.has(realmId) → _realmReached 真
const DataManager = { getRows: (t) => (t === "liupai_table" ? liupaiRows : []) };
const RealmManager = { isRealmAtLeast: (state, realmId) => reached.has(String(realmId)) };

const sandbox = { DataManager, RealmManager };
vm.createContext(sandbox);
const src = fs.readFileSync(path.join(__dirname, "..", "web", "js", "liupai-manager.js"), "utf8");
vm.runInContext(src + "\n;this.LiupaiManager = LiupaiManager;", sandbox);
const LM = sandbox.LiupaiManager;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log("  ✗ FAIL: " + msg); } }
function eq(a, b, msg) { ok(a === b, `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }
function section(name) { console.log("\n[" + name + "]"); }
function mkState(liupai) { return liupai === undefined ? {} : { liupai }; }

// ============ 1. ensureState 归一化 ============
section("ensureState 归一化（design/11.0 §六 line220）");
{
  const s = mkState(); LM.ensureState(s);
  eq(s.liupai.chosen, null, "空存档 chosen=null");
  eq(s.liupai.chosen_at_realm, null, "chosen_at_realm=null");
  eq(s.liupai.branch, null, "branch=null");
  ok(Array.isArray(s.liupai.prestige) && s.liupai.prestige.length === 0, "prestige=[]");
}
{
  const s = mkState({ chosen: "qi" }); LM.ensureState(s);
  eq(s.liupai.chosen, "qi", "保留 chosen=qi");
  eq(s.liupai.branch, null, "缺省 branch=null");
  ok(Array.isArray(s.liupai.prestige), "缺省 prestige 归一为数组");
}

// ============ 2. isChosen ============
section("isChosen");
eq(LM.isChosen(mkState()), false, "试验期 isChosen=false");
eq(LM.isChosen(mkState({ chosen: "qi" })), true, "择派后 isChosen=true");

// ============ 3. canUseSpell 试验期（chosen=null 恒 true）============
section("canUseSpell 试验期（批次2 埋点：不影响前期）");
{
  const s = mkState();
  eq(LM.canUseSpell(s, "weapon"), true, "试验期 weapon 可用");
  eq(LM.canUseSpell(s, "soul"), true, "试验期 soul 可用");
  eq(LM.canUseSpell(s, "calamity"), true, "试验期 calamity 可用");
}

// ============ 4. canUseSpell 器修主系 ============
section("canUseSpell 器修（主系 weapon）");
{
  const s = mkState({ chosen: "qi" });
  eq(LM.canUseSpell(s, "weapon"), true, "器修主系 weapon 可用");
  eq(LM.canUseSpell(s, "soul"), false, "器修非 native soul 不可用");
  eq(LM.canUseSpell(s, "body"), false, "器修未解锁 prestige 前 body 不可用");
}

// ============ 5. canUseSpell 器修五行分支（境界门）============
section("canUseSpell 器修·五行分支（C3 正五行，realm 门 jx_01）");
{
  reached.clear(); reached.add("jx_01");
  const s = mkState({ chosen: "qi" });
  eq(LM.canUseSpell(s, "thunder"), true, "达 jx_01 五行分支→thunder 可用");
  eq(LM.canUseSpell(s, "fire"), true, "达 jx_01 五行分支→fire 可用");
  reached.clear();
  eq(LM.canUseSpell(s, "thunder"), false, "未达 jx_01→thunder 不可用");
  eq(LM.canUseSpell(s, "fire"), false, "未达 jx_01→fire 不可用");
}

// ============ 6. canUseSpell prestige 修体（C5 器↔体）============
section("canUseSpell 器修·修体 prestige（C5 器↔体，杨戬锚点）");
{
  const s1 = mkState({ chosen: "qi", prestige: ["xiuti"] });
  eq(LM.canUseSpell(s1, "body"), true, "prestige 含 xiuti→body 可用");
  const s2 = mkState({ chosen: "qi", prestige: [] });
  eq(LM.canUseSpell(s2, "body"), false, "prestige 未含→body 不可用");
}

// ============ 7. canUseSpell 魂修/劫修/体修 + prestige ============
section("canUseSpell 魂修/劫修/体修 + prestige 跨系");
{
  const hun = mkState({ chosen: "hun" });
  eq(LM.canUseSpell(hun, "soul"), true, "魂修主系 soul 可用");
  eq(LM.canUseSpell(hun, "calamity"), false, "魂修未 prestige→calamity 不可用");
  const hunP = mkState({ chosen: "hun", prestige: ["xiujie"] });
  eq(LM.canUseSpell(hunP, "calamity"), true, "魂修 prestige xiujie→calamity 可用（魂↔劫）");
  const jie = mkState({ chosen: "jie" });
  eq(LM.canUseSpell(jie, "calamity"), true, "劫修主系 calamity 可用");
  eq(LM.canUseSpell(jie, "soul"), false, "劫修未 prestige→soul 不可用");
  const jieP = mkState({ chosen: "jie", prestige: ["xiuhun"] });
  eq(LM.canUseSpell(jieP, "soul"), true, "劫修 prestige xiuhun→soul 可用（魂↔劫）");
  const tiP = mkState({ chosen: "ti", prestige: ["xiuqi"] });
  eq(LM.canUseSpell(tiP, "weapon"), true, "体修 prestige xiuqi→weapon 可用（器↔体，哪吒锚点）");
}

// ============ 8. getPassives 被动聚合 ============
section("getPassives 修被动 + 分支被动聚合");
{
  const qi = mkState({ chosen: "qi" });
  const p = LM.getPassives(qi);
  eq(p.weapon_damage_bonus, 0.15, "器修被动 器系伤+15%");
  eq(p.treasure_slot_bonus, 1, "器修被动 法宝槽+1");
  eq(p.refine_success_bonus, 0.1, "器修被动 炼器成功率+10%");
  // 分支被动：需 branch 激活 + 境界门
  reached.clear(); reached.add("jx_01");
  const qiWx = mkState({ chosen: "qi", branch: "wuxing" });
  eq(LM.getPassives(qiWx).wuxing_treasure_damage_bonus, 0.1, "五行分支激活+达境→正五行法宝伤+10%");
  reached.clear();
  eq(LM.getPassives(qiWx).wuxing_treasure_damage_bonus, undefined, "未达境→五行分支被动不生效");
  // prestige 分支被动（无需 realm 门，按 prestige 列表）
  const qiP = mkState({ chosen: "qi", prestige: ["xiuti"] });
  const pp = LM.getPassives(qiP);
  eq(pp.body_reflect_bonus, 0.15, "修体 prestige→体反伤+15%");
  eq(pp.hp_bonus, 0.1, "修体 prestige→生命+10%");
  // C4 毒归魂修：du 分支被动
  reached.clear(); reached.add("jx_01");
  const hunDu = mkState({ chosen: "hun", branch: "du" });
  const hp = LM.getPassives(hunDu);
  eq(hp.poison_dot_bonus, 0.15, "魂修·毒分支→毒系持续伤+15%（C4 吕岳瘟部锚点）");
  eq(hp.poison_attack_debuff, 0.1, "魂修·毒分支→侵蚀削弱目标攻击-10%");
}

// ============ 9. nativeSpellTypes 集合 ============
section("nativeSpellTypes 可用系集合");
{
  reached.clear(); reached.add("jx_01");
  const s = mkState({ chosen: "qi", prestige: ["xiuti"] });
  const set = LM.nativeSpellTypes(s).sort();
  eq(set.join(","), ["body", "fire", "thunder", "weapon"].sort().join(","),
    "器修(主系weapon+五行thunder/fire+prestige修体body)");
  reached.clear();
  eq(LM.nativeSpellTypes(mkState({ chosen: "qi" })).join(","), "weapon", "器修未解锁仅主系 weapon");
  eq(LM.nativeSpellTypes(mkState()).length, 0, "试验期 chosen=null→空集合");
}

// ============ 10. getById / getBranch ============
section("getById / getBranch");
{
  eq(LM.getById("qi").name, "器修", "getById(qi).name=器修");
  eq(LM.getById("nonexistent"), null, "getById 不存在→null");
  const qiRow = LM.getById("qi");
  eq(LM.getBranch(qiRow, "wuxing").unlock_realm, "jx_01", "getBranch wuxing.unlock_realm=jx_01");
  eq(LM.getBranch(qiRow, "xiuti").prestige, true, "getBranch xiuti.prestige=true");
  eq(LM.getBranch(qiRow, "nope"), null, "getBranch 不存在→null");
}

console.log(`\n========================================`);
console.log(`PASS ${pass}  FAIL ${fail}`);
console.log(`========================================`);
process.exit(fail === 0 ? 0 : 1);
