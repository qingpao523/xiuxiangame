// 跨系统数据完整性审计
const fs = require("fs");
const load = (f) => JSON.parse(fs.readFileSync("web/data/" + f, "utf8")).rows;

const realms = load("realm_table.json");
const spells = load("spell_table.json");
const treasures = load("treasure_table.json");
const bosses = load("boss_table.json");
const maps = load("map_table.json");
const events = load("event_table.json");
const encounters = load("encounter_table.json");
const companions = load("companion_table.json");
const breakthroughs = load("breakthrough_table.json");
const explorePoints = load("explore_point_table.json");
const constants = fs.readFileSync("web/js/constants.js", "utf8");
const battleEngine = fs.readFileSync("web/js/battle-engine.js", "utf8");

const realmIds = new Set(realms.map(r => r.realm_id));
const spellIds = new Set(spells.map(r => r.spell_id));
const treasureIds = new Set(treasures.map(r => r.treasure_id));
const bossIds = new Set(bosses.map(r => r.boss_id));
const mapIds = new Set(maps.map(r => r.map_id));
const eventIds = new Set(events.map(r => r.event_id));
const encounterIds = new Set(encounters.map(r => r.encounter_id));
const pointIds = new Set(explorePoints.map(r => r.point_id));
const btIds = new Set(breakthroughs.map(r => r.breakthrough_id));

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

// 1. NPC bond_card 在 CARD_DEFS 且有 playCard case
for (const c of companions) {
  const bc = c.bond_card;
  if (!bc) { problems.push(`NPC ${c.companion_id} 无 bond_card`); continue; }
  ok(constants.includes(bc + ":"), `NPC ${c.companion_id} 的 bond_card '${bc}' 不在 CARD_DEFS`);
  ok(battleEngine.includes('case "' + bc + '"'), `NPC ${c.companion_id} 的 bond_card '${bc}' 无 playCard case`);
}

// 2. Boss weakness 元素合法
const validElements = ["thunder", "fire", "weapon", "soul", "calamity", "charm", "treasure", "merit"];
for (const b of bosses) {
  for (const w of (b.weakness || [])) ok(validElements.includes(w), `Boss ${b.boss_id} 弱点 '${w}' 非法`);
}

// 3. 探索点 trigger_event → event_table
for (const p of explorePoints) {
  if (p.trigger_event) ok(eventIds.has(p.trigger_event), `探索点 ${p.point_id} 的 trigger_event '${p.trigger_event}' 不存在`);
  if (p.unlock_encounter) ok(encounterIds.has(p.unlock_encounter), `探索点 ${p.point_id} 的 unlock_encounter '${p.unlock_encounter}' 不存在`);
}

// 4. 遭遇 requires_point → explore_point_table
for (const e of encounters) {
  if (e.requires_point) ok(pointIds.has(e.requires_point), `遭遇 ${e.encounter_id} 的 requires_point '${e.requires_point}' 不存在`);
  if (e.map_id) ok(mapIds.has(e.map_id), `遭遇 ${e.encounter_id} 的 map_id '${e.map_id}' 不存在`);
}

// 5. 术法 prerequisite 链
for (const s of spells) {
  if (s.prerequisite_spell) ok(spellIds.has(s.prerequisite_spell), `术法 ${s.spell_id} 的 prerequisite '${s.prerequisite_spell}' 不存在`);
  if (s.unlock_realm && !String(s.unlock_realm).startsWith("race_")) ok(realmIds.has(s.unlock_realm), `术法 ${s.spell_id} 的 unlock_realm '${s.unlock_realm}' 不存在`);
}

// 6. 境界 breakthrough 引用
for (const r of realms) {
  if (r.breakthrough_id_to_next) ok(btIds.has(r.breakthrough_id_to_next), `境界 ${r.realm_id} 的 breakthrough '${r.breakthrough_id_to_next}' 不存在`);
}

// 7. 破劫 from/to_realm
for (const bt of breakthroughs) {
  if (bt.from_realm) ok(realmIds.has(bt.from_realm), `破劫 ${bt.breakthrough_id} 的 from_realm '${bt.from_realm}' 不存在`);
  if (bt.to_realm) ok(realmIds.has(bt.to_realm), `破劫 ${bt.breakthrough_id} 的 to_realm '${bt.to_realm}' 不存在`);
}

// 8. 地图 boss_id
for (const m of maps) {
  if (m.boss_id) ok(bossIds.has(m.boss_id), `地图 ${m.map_id} 的 boss_id '${m.boss_id}' 不存在`);
}

// 9. 法宝引用（FIRST_TREASURE_CHOICES）
const ftcMatch = constants.match(/FIRST_TREASURE_CHOICES\s*=\s*\[([^\]]*)\]/);
if (ftcMatch) {
  const ids = ftcMatch[1].match(/"([^"]+)"/g).map(s => s.replace(/"/g, ""));
  for (const id of ids) ok(treasureIds.has(id), `FIRST_TREASURE_CHOICES 引用 '${id}' 不存在`);
}

// 10. 重复 ID 检查
function dupCheck(rows, field, name) {
  const seen = {};
  for (const r of rows) {
    const id = r[field];
    if (seen[id]) problems.push(`${name} 重复 ID: ${id}`);
    seen[id] = true;
  }
}
dupCheck(realms, "realm_id", "realm_table");
dupCheck(spells, "spell_id", "spell_table");
dupCheck(treasures, "treasure_id", "treasure_table");
dupCheck(bosses, "boss_id", "boss_table");
dupCheck(events, "event_id", "event_table");
dupCheck(encounters, "encounter_id", "encounter_table");
dupCheck(companions, "companion_id", "companion_table");
dupCheck(explorePoints, "point_id", "explore_point_table");
dupCheck(breakthroughs, "breakthrough_id", "breakthrough_table");

// 报告
console.log("=== 跨系统数据完整性审计 ===");
console.log(`审计范围: ${realms.length} 境界 / ${spells.length} 术法 / ${treasures.length} 法宝 / ${bosses.length} Boss / ${maps.length} 地图 / ${events.length} 事件 / ${encounters.length} 遭遇 / ${companions.length} NPC / ${breakthroughs.length} 破劫 / ${explorePoints.length} 探索点`);
console.log("");
if (problems.length === 0) {
  console.log("✓ 零问题：所有跨系统引用一致，无悬空引用，无重复 ID");
} else {
  console.log(`✗ 发现 ${problems.length} 个问题：`);
  problems.forEach(p => console.log("  - " + p));
}
