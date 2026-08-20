// 开局种族开放限定 测试（Node harness，design/7.4）
// 验证：仅 human/yao 开放；chooseRace 拒绝锁定族（纵深防御）；开放族正常；转世重开选择后锁定仍生效。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const WEB = path.join(__dirname, "web");
const ctx = {
  console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  Math, JSON, Date, Object, Array, String, Number, parseInt, parseFloat,
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  document: { createElement: () => ({ append(){}, appendChild(){}, addEventListener(){}, setAttribute(){}, classList:{add(){}}, style:{}, textContent:"" }), body:{appendChild(){}}, querySelector:()=>null, getElementById:()=>null },
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
function run(s) { return vm.runInContext(s, ctx); }

(async () => {
  await run(`DataManager.loadAll()`);

  let pass = 0, fail = 0;
  function check(name, cond) { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✗ FAIL: " + name); } }

  function freshState() {
    const state = run(`SaveManager.normalize(SaveManager.createDefault())`);
    return state;
  }
  function bind(state) {
    ctx.__state = state;
    vm.runInContext(`
      Game.state = globalThis.__state;
      Game.queuePopup = function(){};
      Game._log = function(){};
      Game._afterMutated = function(){};
      Game._emit = function(){};
      Game._applyResourceDelta = function(){};
      Game._formatResourceDelta = function(){ return ""; };
    `, ctx);
  }

  console.log("\n=== 1. 数据层：开放标记 ===");
  {
    const rows = run(`DataManager.getRows("race_table")`);
    check("race_table 共 9 族", rows.length === 9);
    const open = rows.filter(r => r.open === true).map(r => r.race_id).sort();
    check("仅 human/yao 开放", JSON.stringify(open) === JSON.stringify(["human","yao"]));
    const locked = rows.filter(r => r.open !== true);
    check("其余 7 族锁定", locked.length === 7);
    check("锁定族均有 lock_hint 钩子", locked.every(r => typeof r.lock_hint === "string" && r.lock_hint.length > 0));
    check("锁定族 open 字段显式为 false（非缺省）", locked.every(r => r.open === false));
  }

  console.log("\n=== 2. isRaceOpen 辅助 ===");
  {
    bind(freshState());
    check("human 开放", run(`Game.isRaceOpen("human")`) === true);
    check("yao 开放", run(`Game.isRaceOpen("yao")`) === true);
    for (const rid of ["xiantian","qilin","wu","mo","long","feng","hongmeng"]) {
      check(`${rid} 锁定`, run(`Game.isRaceOpen("${rid}")`) === false);
    }
    check("不存在的种族视为锁定", run(`Game.isRaceOpen("nonexistent")`) === false);
  }

  console.log("\n=== 3. chooseRace 纵深防御（逻辑层强制）===");
  {
    // 锁定族不可写入 race_id
    for (const rid of ["xiantian","qilin","wu","mo","long","feng","hongmeng"]) {
      const st = freshState(); bind(st);
      run(`Game.chooseRace("${rid}")`);
      check(`chooseRace(${rid}) 被拒绝（race_id 未写入）`, String(st.race_id || "") === "" && st.flags.race_choice_done !== true);
    }
    // 开放族正常写入
    const stH = freshState(); bind(stH);
    run(`Game.chooseRace("human")`);
    check("chooseRace(human) 成功写入", String(stH.race_id) === "human" && stH.flags.race_choice_done === true);
    const stY = freshState(); bind(stY);
    run(`Game.chooseRace("yao")`);
    check("chooseRace(yao) 成功写入", String(stY.race_id) === "yao" && stY.flags.race_choice_done === true);
    // 先天生灵伴生灵宝逻辑不受损（虽锁定，但验证开放路径的副作用代码仍在）——此处验证锁定下不触发
    const stX = freshState(); bind(stX);
    run(`Game.chooseRace("xiantian")`);
    check("锁定的 xiantian 不触发伴生灵宝", !stX.treasures.treasure_009);
  }

  console.log("\n=== 4. 转世重开选择后锁定仍生效 ===");
  {
    // 模拟：先选 human，转世重置 race_id，再尝试选锁定族仍被拒
    const st = freshState(); bind(st);
    run(`Game.chooseRace("human")`);
    check("首世选 human 成功", String(st.race_id) === "human");
    // 转世会 createDefault 重置 race_id/race_choice_done（见 game.js reincarnate）
    st.race_id = ""; st.flags.race_choice_done = false;
    bind(st);
    run(`Game.chooseRace("mo")`);
    check("转世重开后选锁定族 mo 仍被拒", String(st.race_id || "") === "");
    run(`Game.chooseRace("yao")`);
    check("转世重开后选开放族 yao 成功", String(st.race_id) === "yao");
  }

  console.log("\n========================================");
  console.log("通过 " + pass + " / 失败 " + fail);
  console.log("========================================");
  process.exit(fail === 0 ? 0 : 1);
})();
