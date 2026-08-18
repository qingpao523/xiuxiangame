// 实现完整性审计：检查"数据有但实现无"的致命模式是否在别处存在
const fs = require("fs");
const load = (f) => JSON.parse(fs.readFileSync("web/data/" + f, "utf8")).rows;
const constants = fs.readFileSync("web/js/constants.js", "utf8");
const be = fs.readFileSync("web/js/battle-engine.js", "utf8");
const gameJs = fs.readFileSync("web/js/game.js", "utf8");

const spells = load("spell_table.json");
const companions = load("companion_table.json");
const bosses = load("boss_table.json");

const problems = [];

// === 1. 所有可能进牌库的卡牌：CARD_DEFS 定义 + playCard case ===
// buildDeck 会加入的卡牌 ID 全集
const deckCardIds = new Set();
for (const s of spells) deckCardIds.add(s.spell_id);              // 术法
for (const c of companions) if (c.bond_card) deckCardIds.add(c.bond_card); // 道友卡
["charm_strike", "charm_guard", "charm_focus", "merit_gold", "calamity_edge", "treasure_skill"].forEach(id => deckCardIds.add(id));
["talisman_fire", "talisman_thunder", "talisman_guard"].forEach(id => deckCardIds.add(id)); // 符咒

console.log("=== 1. 牌库卡牌实现完整性 ===");
let cardGap = 0;
for (const id of [...deckCardIds].sort()) {
  const inDefs = new RegExp(`(^|\\n)\\s*${id}:`).test(constants) || constants.includes(`  ${id}:`);
  const hasCase = be.includes(`case "${id}"`);
  if (!inDefs || !hasCase) {
    problems.push(`卡牌 ${id}: CARD_DEFS=${inDefs ? "✓" : "✗缺"} playCard=${hasCase ? "✓" : "✗缺"}`);
    cardGap++;
  }
}
console.log(`  检查 ${deckCardIds.size} 张卡牌，缺口 ${cardGap} 处`);
if (cardGap === 0) console.log("  ✓ 所有牌库卡牌均有定义+战斗处理");

// === 2. CARD_DEFS 中定义的卡牌是否都有 playCard case（无孤儿定义）===
console.log("\n=== 2. CARD_DEFS 孤儿定义检查 ===");
// 只解析 CARD_DEFS 对象内部（避免误匹配 CRAFT_QUALITY/SCHOOL_PASSIVES/FEATURE_UNLOCK_TEXT）
const cardDefsBody = (constants.match(/const CARD_DEFS = \{([\s\S]*?)\n\};/) || [, ""])[1];
const defIds = [...cardDefsBody.matchAll(/^  ([a-z_0-9]+): \{/gm)].map(m => m[1]);
let orphan = 0;
for (const id of defIds) {
  if (!be.includes(`case "${id}"`)) {
    problems.push(`孤儿定义 ${id}: 有 CARD_DEFS 但无 playCard case`);
    orphan++;
  }
}
console.log(`  CARD_DEFS 定义 ${defIds.length} 张，孤儿 ${orphan} 处`);
if (orphan === 0) console.log("  ✓ 无孤儿定义");

// === 3. Boss mechanics 是否都有战斗处理 ===
console.log("\n=== 3. Boss 机制实现完整性 ===");
const mechanics = new Set();
for (const b of bosses) {
  const m = b.mechanics;
  if (m) mechanics.add(String(m).split(":")[0].trim());
}
let mechGap = 0;
for (const mech of [...mechanics].sort()) {
  const handled = be.includes(mech) || gameJs.includes(mech); // 机制可在 battle-engine（专用处理）或 game（adds）中实现
  if (!handled) {
    problems.push(`Boss 机制 ${mech}: 无战斗处理`);
    mechGap++;
  }
}
console.log(`  Boss 机制 ${mechanics.size} 种: ${[...mechanics].sort().join(", ")}`);
console.log(`  未处理 ${mechGap} 种`);
if (mechGap === 0) console.log("  ✓ 所有 Boss 机制均有处理");

// === 报告 ===
console.log("\n=== 审计结论 ===");
if (problems.length === 0) {
  console.log("✓ 零缺口：无'数据有但实现无'的致命模式");
} else {
  console.log(`✗ 发现 ${problems.length} 处缺口：`);
  problems.forEach(p => console.log("  - " + p));
}
