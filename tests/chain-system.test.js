"use strict";
/* 封神修道录 · 完整锁链框架（G5）单元测试
 * 运行：node tests/chain-system.test.js
 * 覆盖：①内置五行回落（无数据表）②真实 chain_table.json 数据驱动等价
 *       ③多链并存（被克只是链的一环；链间倍率相乘）④payload 脏检查重建
 *       ⑤接线：data_index.json 注册 + ID_FIELDS.chain_id
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; } else { fail++; console.error("FAIL:", msg); }
}
function near(a, b) { return Math.abs(a - b) < 1e-9; }

const ROOT = path.join(__dirname, "..");
const chainData = JSON.parse(fs.readFileSync(path.join(ROOT, "web", "data", "chain_table.json"), "utf8"));

// ---- vm 沙箱装载 resonance-system.js（可控 DataManager）----
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(ROOT, "web", "js", "resonance-system.js"), "utf8") +
  "\n;this.ResonanceSystem = ResonanceSystem;",
  sandbox
);
const RS = sandbox.ResonanceSystem;

// ============ ① 内置五行回落（无 DataManager/无数据表）============
ok(RS.ke("wood", "earth"), "回落：木克土");
ok(RS.ke("metal", "wood"), "回落：金克木");
ok(!RS.ke("wood", "fire"), "回落：木不克火");
ok(RS.sheng("wood", "fire"), "回落：木生火");
ok(RS.sheng("water", "wood"), "回落：水生木");
ok(!RS.sheng("wood", "earth"), "回落：木不生土");
ok(RS.ke(null, "wood") === false && RS.sheng("wood", null) === false, "回落：null 端点安全");

let r = RS.evaluate({ leftWuxing: "earth", middleWuxing: "wood" }); // 木克土 → 被克
ok(near(r.mult, 1.0) && r.broken && !r.enhanced, "回落：被克 ×1.0 且 broken");
r = RS.evaluate({ leftWuxing: "fire", middleWuxing: "wood" });      // 木生火 → 得生
ok(near(r.mult, 1.6) && !r.broken && r.enhanced, "回落：得生 ×1.6 且 enhanced");
r = RS.evaluate({ leftWuxing: "wood", middleWuxing: "wood" });      // 同链无克生 → base
ok(near(r.mult, 1.3), "回落：同链基础 ×1.3");
r = RS.evaluate({ leftWuxing: null, middleWuxing: "wood" });        // 缺端点 → 无通道
ok(near(r.mult, 1.0) && r.results.length === 0, "回落：缺端点 ×1.0 无结果");
ok(RS.wuxingLabel("metal") === "金" && RS.wuxingColor("wood") === "#66BB6A", "回落：节点展示");

// ============ ② 真实 chain_table.json 数据驱动（与回落逐项等价）============
sandbox.DataManager = { tables: { chain_table: chainData } };
r = RS.evaluate({ leftWuxing: "earth", middleWuxing: "wood" });
ok(near(r.mult, 1.0) && r.broken, "数据：木克土 ×1.0（等价回落）");
ok(r.results[0] && r.results[0].channel === "chain" && r.results[0].hits[0].channel === "wuxing",
  "数据：hits 记链 id=wuxing");
r = RS.evaluate({ leftWuxing: "fire", middleWuxing: "wood" });
ok(near(r.mult, 1.6) && r.enhanced, "数据：木生火 ×1.6（等价回落）");
r = RS.evaluate({ leftWuxing: "wood", middleWuxing: "wood" });
ok(near(r.mult, 1.3), "数据：同链 ×1.3（等价回落）");
ok(RS.ke("water", "fire") && RS.sheng("metal", "water"), "数据：ke/sheng 向后兼容 API");
ok(Object.keys(RS.chains).length === 1 && RS.chains.wuxing.nodes.water.name === "水",
  "数据：装载 1 条链 wuxing，节点名可读");

// ============ ③ 多链并存：被克只是链的一环，链间倍率相乘 ============
// 注入第二条链（纯数据行，引擎零改）：test2 链只有 wood/fire 两节点，wood 克 fire
const multi = {
  table: "chain_table",
  rows: chainData.rows.concat([{
    chain_id: "test2", name: "试验链", enabled: true,
    nodes: [{ node_id: "wood", name: "木", color: "#000" }, { node_id: "fire", name: "火", color: "#111" }],
    relations: [{ type: "ke", ring: ["wood", "fire"] }],
    mults: { base: 1.2, broken: 0.9, enhanced: 1.4 },
  }]),
};
sandbox.DataManager = { tables: { chain_table: multi } };
r = RS.evaluate({ leftWuxing: "fire", middleWuxing: "wood" });
// wuxing 链：木生火 → ×1.6 enhanced；test2 链：木克火 → ×0.9 broken。相乘 = 1.44
ok(near(r.mult, 1.6 * 0.9), "多链：链间倍率相乘 1.6×0.9=1.44，实得 " + r.mult);
ok(r.broken && r.enhanced, "多链：broken 与 enhanced 可同时为真（各自成环）");
ok(r.results[0].reason === "multi" && r.results[0].hits.length === 2, "多链：hits 逐链明细 ×2");
// 独立端点：只落 yinyang 类新链的端点不受五行链干扰
sandbox.DataManager = { tables: { chain_table: { table: "chain_table", rows: chainData.rows.concat([{
  chain_id: "yinyang", name: "阴阳链", enabled: true,
  nodes: [{ node_id: "yin", name: "阴" }, { node_id: "yang", name: "阳" }],
  relations: [{ type: "ke", ring: ["yin", "yang"] }],
  mults: { base: 1.1, broken: 0.8, enhanced: 1.5 },
}] ) } } };
r = RS.evaluate({ leftWuxing: "yang", middleWuxing: "yin" }); // 阴克阳 → ×0.8，五行链不参与
ok(near(r.mult, 0.8) && r.results[0].hits.length === 1 && r.results[0].hits[0].channel === "yinyang",
  "多链：新链（阴阳）独立发声 ×0.8，五行=一类链而非唯一链");
ok(RS.wuxingLabel("yin") === "阴", "多链：任意链节点可查展示名");
// 禁用链不发声
sandbox.DataManager = { tables: { chain_table: { table: "chain_table", rows: [{
  chain_id: "yinyang", name: "阴阳链", enabled: false,
  nodes: [{ node_id: "yin", name: "阴" }, { node_id: "yang", name: "阳" }],
  relations: [{ type: "ke", ring: ["yin", "yang"] }],
}] } } };
r = RS.evaluate({ leftWuxing: "yang", middleWuxing: "yin" });
ok(near(r.mult, 1.0), "多链：enabled=false 的链不参与求值");

// ============ ④ payload 脏检查：换表即重建 ============
sandbox.DataManager = { tables: { chain_table: chainData } }; // 换回真实表（新对象引用）
RS._ensureChains(); // 懒重建：下一次求值/查询时按 payload 引用脏检查
ok(Object.keys(RS.chains).length === 1 && RS.chains.wuxing, "脏检查：payload 引用变化后重建为真实表");
const before = RS.chains;
RS.evaluate({ leftWuxing: "wood", middleWuxing: "wood" });
ok(RS.chains === before, "脏检查：payload 未变不重建");

// ============ ⑤ 接线：data_index.json 注册 + ID_FIELDS ============
const index = JSON.parse(fs.readFileSync(path.join(ROOT, "web", "data", "data_index.json"), "utf8"));
ok(index.tables.includes("chain_table.json"), "接线：data_index.json 含 chain_table.json");
const sb2 = {};
vm.createContext(sb2);
vm.runInContext(
  fs.readFileSync(path.join(ROOT, "web", "js", "constants.js"), "utf8") +
  "\n;this.ID_FIELDS = ID_FIELDS;",
  sb2
);
ok(sb2.ID_FIELDS.chain_table === "chain_id", "接线：ID_FIELDS.chain_table = chain_id");

console.log(`chain-system: PASS ${pass} FAIL ${fail}`);
process.exit(fail ? 1 : 0);
