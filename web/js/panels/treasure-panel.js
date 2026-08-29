/* 封神修道录 · 六抽屉独立渲染单元：本命法宝（design/19.0 G2，A4-②）
 * 由 ui.js renderTreasurePanel 逐字迁出，逻辑零改（test/ui-regression.test.js 黄金快照钉死口径）。
 * 运行时依赖（全局符号，调用时解析）：ui.js note/popupButton/closePanelSheet/drainPopupQueue/renderPanelBody；UnlockManager；content-director.js ContentDirector；game.js Game；ui-constants.js TREASURE_ICONS；utils.js int/num/formatInt。
 */

"use strict";

function renderTreasurePanel(body, state) {
  if (Game.hasPendingTreasureChoice()) { body.appendChild(note("破劫成真人后，你的气机引动三件残宝，静待择主。")); body.appendChild(popupButton("本命法宝择主", false, () => { closePanelSheet(); Game.queuePopup({ kind: "treasure_choice" }); drainPopupQueue(); })); return; }
  const treasures = UnlockManager.getAvailableTreasures(state);
  body.appendChild(note("法宝不是普通装备，而是护道根基。以法宝碎片与法力温养之。"));
  if (!(typeof ContentDirector !== "undefined" && ContentDirector.isOpening(state))) {
    body.appendChild(popupButton("碎片合成", false, () => { closePanelSheet(); Game.queuePopup({ kind: "fragment_synth" }); drainPopupQueue(); }));
  }
  for (const treasure of treasures) {
    const id = String(treasure.treasure_id); const tState = Game.getTreasureState(id);
    const level = int(tState.level), maxLevel = int(treasure.max_level_mvp, 5), nextLevel = level + 1;
    const cost = nextLevel <= maxLevel ? Game.getTreasureUpgradeCost(treasure, nextLevel) : null;
    const card = document.createElement("div"); card.className = "card" + (level > 0 ? " selected" : "");
    const img = document.createElement("img"); img.src = TREASURE_ICONS[id] || ""; img.alt = "";
    const info = document.createElement("div"); info.className = "card-info";
    const name = document.createElement("div"); name.className = "card-name";
    name.textContent = `${treasure.treasure_name}　${level > 0 ? `${level}重` : "未炼化"}｜${treasure.skill_name || ""}`;
    const desc = document.createElement("div"); desc.className = "card-desc"; desc.textContent = treasure.origin_desc || "";
    const costLine = document.createElement("div"); costLine.className = "card-cost";
    costLine.textContent = cost ? `${nextLevel === 1 ? "炼化" : `温养至${nextLevel}重`}：碎片 ${formatInt(cost.treasure_shard_cost)}｜法力 ${formatInt(cost.mana_cost)}` : "已温养至极";
    info.append(name, desc, costLine);
    const btn = document.createElement("button"); btn.className = "card-btn";
    btn.textContent = level === 0 ? "炼化" : "温养";
    btn.disabled = !cost || num(state.resources.treasure_shard) < num(cost?.treasure_shard_cost) || num(state.resources.mana) < num(cost?.mana_cost);
    btn.addEventListener("click", () => { Game.upgradeTreasure(id); renderPanelBody("treasure"); });
    card.append(img, info, btn); body.appendChild(card);
  }
}

window.PANEL_UNITS = window.PANEL_UNITS || {};
window.PANEL_UNITS.treasure = { title: "本命法宝", render: renderTreasurePanel };
