/* 封神修道录 · 六抽屉独立渲染单元：术法（design/19.0 G2，A4-②）
 * 由 ui.js renderSpellPanel 逐字迁出，逻辑零改（test/ui-regression.test.js 黄金快照钉死口径）。
 * 运行时依赖（全局符号，调用时解析）：ui.js note/closePanelSheet/drainPopupQueue/renderPanelBody；skill-identity.js SkillIdentity；UnlockManager；game.js Game；ui-constants.js SPELL_ICONS/TREASURE_ICONS；utils.js int/num/str/formatInt。
 * 含 RARITY_LABEL / skillIcon / renderSixiuSection（仅术法面板使用，一并迁出）。
 */

"use strict";

// 术法面板：四修（体/器/魂/劫）。旧 spell_table 已下线。
function renderSpellPanel(body, state) {
  const v2box = document.createElement("div"); v2box.className = "card v2-entry";
  const v2info = document.createElement("div"); v2info.className = "card-info";
  const v2title = document.createElement("div"); v2title.className = "card-name";
  v2title.textContent = "斗法栏·连锁制";
  const v2desc = document.createElement("div"); v2desc.className = "card-desc";
  const awoken = typeof SkillIdentity !== "undefined" && SkillIdentity.isShentong(state);
  v2desc.textContent = awoken
    ? "栏中已是神通。同体系相邻共鸣，三连触发终极。"
    : "配招后斗法全自动。体系=体/器/魂/劫（无互克）；五行只在器（法宝）上驱动共鸣。天仙后术法觉醒为神通。";
  v2info.append(v2title, v2desc);
  const cfgBtn = document.createElement("button"); cfgBtn.className = "card-btn";
  cfgBtn.textContent = "配置斗法栏";
  cfgBtn.addEventListener("click", () => { closePanelSheet(); Game.openSlotConfig(); drainPopupQueue(); });
  v2box.append(v2info, cfgBtn);
  body.appendChild(v2box);
  renderSixiuSection(body, state);
}

const RARITY_LABEL = { common: "凡", uncommon: "灵", rare: "玄" };
function skillIcon(id, spellType) {
  if (SPELL_ICONS[id]) return SPELL_ICONS[id];
  const legacy = "spell_" + spellType + "_01";
  return SPELL_ICONS[legacy] || "";
}
function renderSixiuSection(body, state) {
  const awoken = typeof SkillIdentity !== "undefined" && SkillIdentity.isShentong(state);
  body.appendChild(note(awoken
    ? "天仙境开，斗法栏所书已是神通。器仍是法宝，无招式。"
    : "四修：体 / 器 / 魂 / 劫。练气至地仙只称术法；天仙后觉醒为神通。器=法宝，御器与火术是法术不是器。"));
  const available = UnlockManager.getAvailableSkills(state);
  const unlocked = state.unlocked_skills || [];
  const groups = (typeof SkillIdentity !== "undefined") ? SkillIdentity.TIXI : [];
  for (const g of groups) {
    const header = document.createElement("div"); header.className = "card-name v2-skill-header";
    header.textContent = "【" + g.title + "修】";
    body.appendChild(header);
    body.appendChild(note(g.blurb));
    if (g.treasures) {
      const owned = UnlockManager.getAvailableTreasures(state).filter((t) => int((state.treasures[String(t.treasure_id)] || {}).level) > 0);
      if (!owned.length) body.appendChild(note("尚未炼化法宝。器修的五行，在法宝上，不在招式上。"));
      for (const tr of owned) {
        const card = document.createElement("div"); card.className = "card selected";
        const img = document.createElement("img"); img.src = (typeof TREASURE_ICONS !== "undefined" && TREASURE_ICONS[tr.treasure_id]) || ""; img.alt = "";
        const info = document.createElement("div"); info.className = "card-info";
        const name = document.createElement("div"); name.className = "card-name";
        const wx = (typeof SkillIdentity !== "undefined" && SkillIdentity.WUXING[tr.wuxing]) || "";
        name.textContent = `${tr.treasure_name}　器·法宝${wx ? "｜五行" + wx : ""}`;
        const desc = document.createElement("div"); desc.className = "card-desc";
        desc.textContent = tr.origin_desc || tr.skill_desc || "法宝无招式，绑在斗法栏格上以成器势。";
        info.append(name, desc);
        if (img.src) card.append(img, info); else card.append(info);
        body.appendChild(card);
      }
    }
    const rows = available.filter((r) => g.types.includes(str(r.spell_type, "")));
    if (g.treasures && rows.length) body.appendChild(note("以下是术法（御器、火象），不是器。"));
    for (const skill of rows) {
      const id = String(skill.id);
      const isUnlocked = unlocked.includes(id);
      const level = Math.max(isUnlocked ? 1 : 0, Game.getSkillLevel(id));
      const maxLevel = Game.getSkillMaxLevel(skill);
      const nextLevel = level + 1;
      const cost = isUnlocked && nextLevel <= maxLevel ? Game.getSkillUpgradeCost(skill, nextLevel) : null;
      const card = document.createElement("div"); card.className = "card" + (level > 0 ? " selected" : "");
      const src = skillIcon(id, str(skill.spell_type, ""));
      const img = src ? document.createElement("img") : null;
      if (img) { img.src = src; img.alt = ""; }
      const info = document.createElement("div"); info.className = "card-info";
      const shown = (typeof SkillIdentity !== "undefined") ? SkillIdentity.displayName(skill, state) : skill.name;
      const klass = (typeof SkillIdentity !== "undefined") ? SkillIdentity.skillClass(skill, state) : "法术";
      const name = document.createElement("div"); name.className = "card-name";
      name.textContent = shown + " ·" + klass + " " + (RARITY_LABEL[str(skill.rarity, "common")] || "") + " " + (level > 0 ? level + "重" : "未悟");
      const desc = document.createElement("div"); desc.className = "card-desc";
      desc.textContent = (skill.lore_text || "") + (skill.source_chapter ? "（" + skill.source_chapter + "）" : "");
      const dmgLine = document.createElement("div"); dmgLine.className = "card-cost";
      const lv = Math.max(1, level);
      dmgLine.textContent = "威力 " + (num(skill.damage_base) + num(skill.damage_growth) * (lv - 1)) + "（每重+" + num(skill.damage_growth) + "）";
      if (!awoken && skill.shentong_name) dmgLine.textContent += "　天仙觉醒：" + skill.shentong_name;
      const costLine = document.createElement("div"); costLine.className = "card-cost";
      if (!isUnlocked) costLine.textContent = "未至参悟境界";
      else costLine.textContent = cost ? "升至" + nextLevel + "重：残页 " + formatInt(cost.spell_page_cost) + "｜法力 " + formatInt(cost.mana_cost) : "已至圆满";
      info.append(name, desc, dmgLine, costLine);
      const btn = document.createElement("button"); btn.className = "card-btn";
      btn.textContent = "升重";
      btn.disabled = !cost || num(state.resources.spell_page) < num(cost.spell_page_cost) || num(state.resources.mana) < num(cost.mana_cost);
      btn.addEventListener("click", () => { Game.upgradeSkill(id); renderPanelBody("spell"); });
      if (img) card.append(img, info, btn); else card.append(info, btn);
      body.appendChild(card);
    }
  }
}

window.PANEL_UNITS = window.PANEL_UNITS || {};
window.PANEL_UNITS.spell = { title: "术法", render: renderSpellPanel };
