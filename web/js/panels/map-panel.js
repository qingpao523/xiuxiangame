/* 封神修道录 · 六抽屉独立渲染单元：游历（design/19.0 G2，A4-②）
 * 由 ui.js renderMapPanel 逐字迁出，逻辑零改（test/ui-regression.test.js 黄金快照钉死口径）。
 * 运行时依赖（全局符号，调用时解析）：ui.js note/popupButton/closePanelSheet；game.js getTodayArray/Game；DataManager/UnlockManager/ActionManager/BossManager/RealmManager；ui-constants.js BOSS_ICONS/MAP_ACTION；world-map.js WorldMap；content-director.js ContentDirector；utils.js int/num/formatInt。
 */

"use strict";

// 游历面板
function renderMapPanel(body, state) {
  body.appendChild(popupButton("展开封神山河图", false, () => { closePanelSheet(); WorldMap.open(); }));
  const opening = typeof ContentDirector !== "undefined" && ContentDirector.isOpening(state);
  // 镇魔塔：开局主路径不推（design/1.12）
  UnlockManager._resetTowerCycleIfNeeded(state);
  const tw = state.tower || { tickets: 0, best_floor_this_cycle: 0 };
  const twCard = document.createElement("div"); twCard.className = "card";
  const twInfo = document.createElement("div"); twInfo.className = "card-info";
  const twName = document.createElement("div"); twName.className = "card-name"; twName.textContent = "镇魔塔·层层斩将";
  const twDesc = document.createElement("div"); twDesc.className = "card-desc";
  twDesc.textContent = `本期登塔令 ${int(tw.tickets)} 枚｜本期最高 第${int(tw.best_floor_this_cycle)}层｜历史最高 第${int(state.tower_best_floor_ever)}层`;
  const twCost = document.createElement("div"); twCost.className = "card-cost"; twCost.textContent = "两日一期·每期三令·斩将得宝，层越高宝越珍";
  twInfo.append(twName, twDesc, twCost); twCard.appendChild(twInfo);
  const twBtn = document.createElement("button"); twBtn.className = "card-btn";
  const twHas = int(tw.tickets) > 0;
  twBtn.textContent = twHas ? "登塔" : "登塔令已尽";
  twBtn.disabled = !twHas;
  twBtn.addEventListener("click", () => { closePanelSheet(); Game.startTowerRun(); });
  twCard.appendChild(twBtn);
  if (!opening) body.appendChild(twCard);
  // 今日杀劫大阵
  const todayArr = getTodayArray();
  if (Object.keys(todayArr).length && UnlockManager.conditionMet(state, String(todayArr.unlock_realm || ""))) {
    const arrAvail = Game.getArrayAvailability();
    const arrCard = document.createElement("div"); arrCard.className = "card" + (arrAvail.ok ? "" : "");
    const arrInfo = document.createElement("div"); arrInfo.className = "card-info";
    const arrName = document.createElement("div"); arrName.className = "card-name";
    arrName.textContent = `今日杀劫：${todayArr.array_name}`;
    const arrDesc = document.createElement("div"); arrDesc.className = "card-desc";
    arrDesc.textContent = todayArr.narrative_desc || "";
    const cost = document.createElement("div"); cost.className = "card-cost";
    cost.textContent = arrAvail.ok ? `三段阵势，今日可闯 ${arrAvail.remain} 次｜败北亦有真灵上榜之机缘` : arrAvail.reason;
    arrInfo.append(arrName, arrDesc, cost);
    arrCard.appendChild(arrInfo);
    if (arrAvail.ok) {
      const goBtn = document.createElement("button"); goBtn.className = "card-btn"; goBtn.textContent = "闯阵";
      goBtn.addEventListener("click", () => { closePanelSheet(); Game.startArrayBattle(); });
      arrCard.appendChild(goBtn);
    }
    body.appendChild(arrCard);
  }

  const maps = UnlockManager.getAvailableMaps(state);
  const power = RealmManager.getCombatPower(state);
  if (!maps.length) { body.appendChild(note("暂无可游历之地。")); return; }
  for (const map of maps) {
    const id = String(map.map_id);
    const card = document.createElement("div"); card.className = "card" + (state.current_map_id === id ? " selected" : "");
    const info = document.createElement("div"); info.className = "card-info";
    const name = document.createElement("div"); name.className = "card-name";
    name.textContent = `${map.map_name}${state.current_map_id === id ? "（驻留中）" : ""}`;
    const desc = document.createElement("div"); desc.className = "card-desc"; desc.textContent = map.entry_text || map.narrative_desc || "";
    const cost = document.createElement("div"); cost.className = "card-cost";
    cost.textContent = `推荐战力 ${formatInt(map.recommended_power)}｜你的战力 ${formatInt(power)}`;
    info.append(name, desc, cost); card.appendChild(info);
    const btnBox = document.createElement("div"); btnBox.className = "card-btn-col";
    if (state.current_map_id !== id) { const sb = document.createElement("button"); sb.className = "card-btn"; sb.textContent = "驻留此地"; sb.addEventListener("click", () => Game.selectMap(id)); btnBox.appendChild(sb); }

    // M3 投放层（design/15.0 §五）：按 boss_table.map_id 聚合渲染本图全部 Boss，
    // 取代旧"单代表 Boss(map.boss_id)"——解锁 22 个无入口 Boss（含九 Boss boss_023-031）。
    const mapBosses = DataManager.getRows("boss_table")
      .filter((b) => String(b.map_id) === id && UnlockManager.conditionMet(state, String(b.unlock_condition || "")))
      .sort((a, b) => (String(a.boss_id) === String(map.boss_id) ? -1 : String(b.boss_id) === String(map.boss_id) ? 1 : 0) || (num(a.recommended_power) - num(b.recommended_power)));
    for (const boss of mapBosses) {
      const bossId = String(boss.boss_id);
      const bossCard = document.createElement("div"); bossCard.className = "card";
      if (BOSS_ICONS[bossId]) { const bImg = document.createElement("img"); bImg.src = BOSS_ICONS[bossId]; bImg.alt = ""; bossCard.appendChild(bImg); }
      const bInfo = document.createElement("div"); bInfo.className = "card-info";
      const bName = document.createElement("div"); bName.className = "card-name";
      const cleared = int(state.boss_clears[bossId]) > 0;
      bName.textContent = `挑战：${boss.boss_name}${cleared ? "（已伏）" : ""}`;
      const bDesc = document.createElement("div"); bDesc.className = "card-desc"; bDesc.textContent = boss.lore_text || "";
      const bCost = document.createElement("div"); bCost.className = "card-cost";
      const rate = Math.round(BossManager.getWinRate(state, boss) * 100);
      const remain = Math.max(0, 3 - int(state.boss_counts_today[bossId]));
      bCost.textContent = `推荐战力 ${formatInt(boss.recommended_power)}｜胜率 ${rate}%｜今日可挑战 ${remain} 次`;
      bInfo.append(bName, bDesc, bCost);
      // P0-B: 弱点提示
      if (boss.weakness && boss.weakness.length) {
        const elName = { thunder: "雷", fire: "火", weapon: "剑", soul: "魂", calamity: "劫" };
        const wLine = document.createElement("div"); wLine.className = "card-cost";
        wLine.style.color = "#d9a441";
        wLine.textContent = `弱点：${boss.weakness.map(w => elName[w] || w).join("·")}系（命中 +30% 伤害）`;
        bInfo.appendChild(wLine);
      }
      bossCard.appendChild(bInfo);
      const fightBtn = document.createElement("button"); fightBtn.className = "card-btn"; fightBtn.textContent = "斗法"; fightBtn.disabled = remain <= 0;
      fightBtn.addEventListener("click", () => { closePanelSheet(); Game.startBossBattle(bossId); });
      bossCard.appendChild(fightBtn);
      body.appendChild(bossCard);
    }

    const actionId = MAP_ACTION[id];
    if (actionId) {
      const actionRow = DataManager.getById("action_table", actionId);
      if (Object.keys(actionRow).length && UnlockManager.conditionMet(state, String(actionRow.unlock_realm))) {
        const goBtn = document.createElement("button"); goBtn.className = "card-btn"; goBtn.textContent = `${actionRow.action_name}（${actionRow.duration_sec}息）`;
        goBtn.disabled = !ActionManager.getAvailability(state, actionRow).ok;
        goBtn.addEventListener("click", () => { closePanelSheet(); Game.startAction(actionId); });
        btnBox.appendChild(goBtn);
      }
    }
    card.appendChild(btnBox);
    body.appendChild(card);

    // 可探索空间（design/6.0 第三层）：此地图的探索点（已发现 + 未至之境）
    const epAll = DataManager.getRows("explore_point_table").filter((p) => String(p.map_id) === id);
    if (epAll.length) {
      const epDone = epAll.filter((p) => (state.explored_points || []).includes(String(p.point_id)));
      const epFog = epAll.length - epDone.length;
      body.appendChild(note(`此地秘境：已发现 ${epDone.length}/${epAll.length} 处${epFog > 0 ? `，尚有 ${epFog} 处未至之境` : "，已尽览"}`));
      for (const p of epDone) {
        const pCard = document.createElement("div"); pCard.className = "card selected";
        const pInfo = document.createElement("div"); pInfo.className = "card-info";
        const pName = document.createElement("div"); pName.className = "card-name"; pName.textContent = `◆ ${p.name}`;
        const pFlavor = document.createElement("div"); pFlavor.className = "card-desc"; pFlavor.textContent = p.flavor || "";
        pInfo.append(pName, pFlavor); pCard.appendChild(pInfo); body.appendChild(pCard);
      }
    }
  }
}

window.PANEL_UNITS = window.PANEL_UNITS || {};
window.PANEL_UNITS.map = { title: "游历", render: renderMapPanel };
