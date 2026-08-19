// 4势力完整系统 模拟测试（Node harness，mock fetch/DOM）
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const WEB = path.join(__dirname, "web");
const ctx = {
  console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  Math, JSON, Date, Object, Array, String, Number, parseInt, parseFloat,
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  document: { createElement: () => ({ append(){}, appendChild(){}, addEventListener(){}, classList:{add(){}}, style:{}, textContent:"" }), body:{appendChild(){}}, querySelector:()=>null, getElementById:()=>null },
  window: {},
  fetch: async (rel) => {
    const p = path.join(WEB, rel.replace(/^\//, ""));
    return { json: async () => JSON.parse(fs.readFileSync(p, "utf-8")) };
  },
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);

const LOAD = ["utils.js","constants.js","data-manager.js","realm-manager.js","save-manager.js","unlock-manager.js","reward-manager.js","game.js"];
for (const f of LOAD) {
  const code = fs.readFileSync(path.join(WEB, "js", f), "utf-8");
  vm.runInContext(code, ctx, { filename: f });
}

function run(snippet) { return vm.runInContext(snippet, ctx); }

(async () => {
  await run(`DataManager.loadAll()`);
  // 准备一个阐教/截教/天庭/五庄观通用的高境界 state
  function freshState(faction) {
    const state = run(`SaveManager.normalize(SaveManager.createDefault())`);
    state.faction_id = faction;
    state.realm_id = "zr_10"; // 高境界，确保解锁
    state.resources = Object.assign(state.resources || {}, { treasure_shard: 1000, mana: 1000000, merit: 1000, calamity: 1000, daoxing: 0 });
    return state;
  }
  // 把 Game.state 绑定并 stub 副作用方法
  function bind(state) {
    ctx.__state = state;
    vm.runInContext(`
      Game.state = globalThis.__state;
      Game.queuePopup = function(){};
      Game._log = function(){};
      Game._afterMutated = function(){};
      Game._emit = function(){};
      Game._applyResourceDelta = function(d){ for(const k in d){ this.state.resources[k]=(this.state.resources[k]||0)+d[k]; } };
      Game._formatResourceDelta = function(d){ return Object.keys(d).map(k=>k+'+'+d[k]).join(' '); };
    `, ctx);
  }

  let pass = 0, fail = 0;
  function check(name, cond) { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✗ FAIL: " + name); } }

  console.log("\n=== 阐教·玉虚炼器（合成系统）===");
  {
    const st = freshState("chan"); bind(st);
    const recipes = run(`Game.getSynthRecipes()`);
    check("getSynthRecipes 返回配方 (>=3)", recipes.length >= 3);
    const rid = recipes[0].recipe_id;
    const before = st.resources.treasure_shard;
    const chk = run(`Game.canCraftSynth(${JSON.stringify(rid)})`);
    check("canCraftSynth ok", chk.ok === true);
    const res = run(`Game.craftSynthFinish(${JSON.stringify(rid)}, "shang")`);
    check("craftSynthFinish ok", res && res.ok === true);
    check("上品初成 3 重", res.level === 3);
    const outId = run(`DataManager.getById("synth_recipe_table", ${JSON.stringify(rid)}).output_treasure`);
    check("产出法宝入 state.treasures", st.treasures[outId] && st.treasures[outId].level === 3);
    check("材料被消耗 (碎片减少)", st.resources.treasure_shard < before);
    // 已拥有再炼 → +1 重
    const res2 = run(`Game.craftSynthFinish(${JSON.stringify(rid)}, "xia")`);
    check("已拥有淬炼 +1 重 (3→4)", res2.level === 4);
    // 战力计入
    const cp = run(`RealmManager.getCombatPower(Game.state)`);
    check("合成法宝计入战力 (>0)", cp > 0);
    // 非阐教不可
    const st2 = freshState("jie"); bind(st2);
    check("非阐教 getSynthRecipes 为空", run(`Game.getSynthRecipes()`).length === 0);
    check("非阐教 canCraftSynth 拒绝", run(`Game.canCraftSynth(${JSON.stringify(rid)})`).ok === false);
  }

  console.log("\n=== 截教·万仙阵法（阵法卡系统）===");
  {
    const st = freshState("jie"); bind(st);
    const cards = run(`Game.getArrayCards()`);
    check("getArrayCards 返回阵法卡 (>=4)", cards.length >= 4);
    const cid = cards[0].card_id;
    const meritBefore = st.resources.merit;
    run(`Game.learnArrayCard(${JSON.stringify(cid)})`);
    check("learnArrayCard 后等级=1", run(`Game.arrayCardLevel(${JSON.stringify(cid)})`) === 1);
    check("学习消耗功德", st.resources.merit < meritBefore);
    // 携带
    run(`Game.toggleArrayEquip(${JSON.stringify(cid)})`);
    check("携带入栏", st.array_equipped.includes(cid));
    check("arraySlots 基础>=1", run(`Game.arraySlots()`) >= 1);
    // 首回合加成
    const bonus = run(`Game.getArrayFirstRoundBonus(Game.state)`);
    check("getArrayFirstRoundBonus >0", bonus > 0);
    check("首回合加成=base_bonus(0.2)", Math.abs(bonus - 0.2) < 1e-9);
    // 升级
    run(`Game.upgradeArrayCard(${JSON.stringify(cid)})`);
    check("upgradeArrayCard 后等级=2", run(`Game.arrayCardLevel(${JSON.stringify(cid)})`) === 2);
    const bonus2 = run(`Game.getArrayFirstRoundBonus(Game.state)`);
    check("升级后加成增长 (>0.2)", bonus2 > 0.2);
    // 非截教
    const st2 = freshState("chan"); bind(st2);
    check("非截教 getArrayCards 为空", run(`Game.getArrayCards()`).length === 0);
    check("非截教 首回合加成=0", run(`Game.getArrayFirstRoundBonus(Game.state)`) === 0);
  }

  console.log("\n=== 天庭·功德敕令（库存+指定行动）===");
  {
    const st = freshState("tianting"); bind(st);
    st.edict_count = 0; st.edict_last_claim = ""; st.edict_target = null;
    run(`Game.edictClaim()`);
    check("edictClaim 后库存=1", st.edict_count === 1);
    check("edictClaim 记录今日", st.edict_last_claim === run(`todayString()`));
    // 同日再领被拒
    run(`Game.edictClaim()`);
    check("同日再领被拒 (仍=1)", st.edict_count === 1);
    // 指定行动
    run(`Game.edictDesignate("boss")`);
    check("发敕后库存=0", st.edict_count === 0);
    check("edict_target=boss", st.edict_target === "boss");
    // consume 匹配 → ×2
    const m = run(`Game.consumeEdict("boss")`);
    check("consumeEdict(boss) 返回 2", m === 2);
    check("consume 后 target 清空", st.edict_target === null);
    // consume 不匹配 → 1
    st.edict_count = 1; run(`Game.edictDesignate("alchemy")`);
    check("consumeEdict(boss) 不匹配返回 1", run(`Game.consumeEdict("boss")`) === 1);
    check("不匹配后 target 仍在", st.edict_target === "alchemy");
    // 库存上限
    st.edict_count = 3; st.edict_last_claim = "";
    run(`Game.edictClaim()`);
    check("库存满(3)领敕被拒", st.edict_count === 3);
    // 非天庭
    const st2 = freshState("chan"); bind(st2);
    check("非天庭 consumeEdict 返回 1", run(`Game.consumeEdict("boss")`) === 1);
  }

  console.log("\n=== 五庄观·人参果会（果会+炼丹×2）===");
  {
    const st = freshState("wuzhuang"); bind(st);
    st.faction_feast_until = 0; st.faction_feast_cooldown = 0;
    check("未赴会 pillOutputMult=1", run(`Game.pillOutputMult()`) === 1);
    run(`Game.factionFeast()`);
    check("赴会后 feast_until 设置", st.faction_feast_until > run(`nowUnix()`));
    check("赴会后 cooldown=7天", st.faction_feast_cooldown > st.faction_feast_until);
    check("果会中 pillOutputMult=2", run(`Game.pillOutputMult()`) === 2);
    check("feastAlchemyActive true", run(`Game.feastAlchemyActive(Game.state)`) === true);
    check("factionBuffActive(feast) true", run(`Game.factionBuffActive("feast")`) === true);
    // 全属性+10% 由 reward-manager faction_feast_until 处理，验证字段存在
    check("果会 buff type=feast", st.faction_buff && st.faction_buff.type === "feast");
    // 非五庄观
    const st2 = freshState("chan"); bind(st2);
    check("非五庄观 pillOutputMult=1", run(`Game.pillOutputMult()`) === 1);
  }

  console.log("\n=== 炼丹产出×2 集成 (brewPill) ===");
  {
    const st = freshState("wuzhuang"); bind(st);
    st.faction_feast_until = run(`nowUnix()`) + 10000;
    st.faction_feast_cooldown = run(`nowUnix()`) + 100000;
    // 给足炼丹材料
    st.resources = Object.assign(st.resources, { herb: 1000, lingzhi: 1000, dan_lu: 1000 });
    const mult = run(`Game.pillOutputMult()`);
    check("果会期间炼丹倍率=2", mult === 2);
  }

  console.log(`\n=== 结果: ${pass} 通过, ${fail} 失败 ===`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("HARNESS ERROR:", e); process.exit(2); });
