/* 封神修道录 · 六抽屉独立渲染单元：洞府（design/19.0 G2，A4-②）
 * 由 ui.js renderLogPanel 逐字迁出，逻辑零改（test/ui-regression.test.js 黄金快照钉死口径）。
 * 运行时依赖（全局符号，调用时解析）：ui.js note/popupButton/closePanelSheet/drainPopupQueue/renderPanelBody/renderFactionSystem；realm-manager.js getFactionRow/RealmManager；GoalManager；UnlockManager/DataManager/ActionManager；gameplay-engine.js CraftMinigame；constants.js CARD_DEFS/PILL_DEFS；ui-constants.js NPC_ICONS；game.js Game；utils.js int/num/str/todayString/formatInt。
 */

"use strict";

// 洞府面板
function renderLogPanel(body, state) {
  body.appendChild(note(`入道第 ${UnlockManager.currentDay(state)} 天`));

  // P2 网状叙事·洞府手札：当前卷的因果线（可循/已经历/雾中），非任务清单
  const journal = GoalManager.getChapterThreads(state);
  if (journal.chapter) {
    const done = journal.list.filter((t) => t.status === "done");
    const open = journal.list.filter((t) => t.status === "open");
    const fog = journal.list.filter((t) => t.status === "fog");
    body.appendChild(note(`${journal.chapterName} · 手札：可循 ${open.length} 线｜已经历 ${done.length}｜雾中 ${fog.length}`));
    for (const t of open) {
      const card = document.createElement("div"); card.className = "card";
      const info = document.createElement("div"); info.className = "card-info";
      const name = document.createElement("div"); name.className = "card-name"; name.textContent = `可循·${t.goal.goal_name}`;
      const hint = document.createElement("div"); hint.className = "card-desc"; hint.textContent = t.hint || "";
      info.append(name, hint); card.appendChild(info); body.appendChild(card);
    }
    for (const t of done) {
      const card = document.createElement("div"); card.className = "card selected";
      const info = document.createElement("div"); info.className = "card-info";
      const name = document.createElement("div"); name.className = "card-name"; name.textContent = `✓ ${t.goal.goal_name}`;
      const hint = document.createElement("div"); hint.className = "card-desc"; hint.textContent = t.hint || "";
      info.append(name, hint); card.appendChild(info); body.appendChild(card);
    }
    for (const t of fog) {
      const card = document.createElement("div"); card.className = "card"; card.style.opacity = "0.6";
      const info = document.createElement("div"); info.className = "card-info";
      const name = document.createElement("div"); name.className = "card-name"; name.textContent = "雾中因果";
      const hint = document.createElement("div"); hint.className = "card-desc"; hint.textContent = t.hint || "";
      info.append(name, hint); card.appendChild(info); body.appendChild(card);
    }
  }

  const faction = getFactionRow(state);
  if (Object.keys(faction).length) {
    const card = document.createElement("div"); card.className = "card selected";
    const glyph = document.createElement("span"); glyph.className = "choice-glyph"; glyph.textContent = faction.glyph || "门";
    const info = document.createElement("div"); info.className = "card-info";
    const name = document.createElement("div"); name.className = "card-name"; name.textContent = `${faction.faction_name}（${faction.dojo}）`;
    const desc = document.createElement("div"); desc.className = "card-desc"; desc.textContent = faction.card_desc || "";
    const passive = document.createElement("div"); passive.className = "card-cost";
    passive.textContent = `护持·${faction.passive_name}：${faction.passive_desc}`;
    info.append(name, desc, passive); card.append(glyph, info);
    body.appendChild(card);
    const task = DataManager.getById("action_table", String(faction.task_action_id || ""));
    if (Object.keys(task).length) {
      const taskCard = document.createElement("div"); taskCard.className = "card";
      const tInfo = document.createElement("div"); tInfo.className = "card-info";
      const tName = document.createElement("div"); tName.className = "card-name"; tName.textContent = `师门任务：${task.action_name}（${task.duration_sec}息）`;
      const tDesc = document.createElement("div"); tDesc.className = "card-desc"; tDesc.textContent = task.description || "";
      const tCost = document.createElement("div"); tCost.className = "card-cost";
      const remain = ActionManager.remainingToday(state, task); tCost.textContent = remain >= 0 ? `今日剩余 ${remain} 次` : "不限次";
      tInfo.append(tName, tDesc, tCost);
      const goBtn = document.createElement("button"); goBtn.className = "card-btn";
      const avail = ActionManager.getAvailability(state, task); goBtn.textContent = avail.ok ? "前往" : avail.reason; goBtn.disabled = !avail.ok;
      goBtn.addEventListener("click", () => { closePanelSheet(); Game.startAction(String(task.action_id)); });
      taskCard.append(tInfo, goBtn); body.appendChild(taskCard);
      }
      // 势力完整独有系统（design/7.2 v0.2）——按势力分发完整系统 UI
      renderFactionSystem(body, state);
    } else if (RealmManager.isCapped(state)) {
    body.appendChild(note("地仙之后无散修。你已立身天仙之境，尚未择势力入局。"));
    body.appendChild(popupButton("择势力入局", false, () => { closePanelSheet(); Game._maybeQueueFactionChoice(); drainPopupQueue(); }));
  }

  // 道友区（P1 阵容：上场位管理，最多 3 位）
  const companions = state.companions || {};
  const bonded = Object.keys(companions).filter((id) => companions[id].bonded);
  if (bonded.length) {
    const lineup = Array.isArray(state.lineup) ? state.lineup : [];
    body.appendChild(note(`道友阵容（上场 ${lineup.length}/3）：上场道友的「结缘护持」实时生效——收灵材带哪吒，杀阵破阵带姜子牙，闭关修行带杨戬。`));
    for (const cid of bonded) {
      const row = DataManager.getById("companion_table", cid);
      if (!Object.keys(row).length) continue;
      const on = lineup.includes(cid);
      const card = document.createElement("div"); card.className = "card" + (on ? " selected" : "");
      let glyph;
      if (NPC_ICONS[cid]) { glyph = document.createElement("img"); glyph.className = "npc-portrait"; glyph.src = NPC_ICONS[cid]; glyph.alt = ""; }
      else { glyph = document.createElement("span"); glyph.className = "choice-glyph"; glyph.textContent = row.glyph || "友"; }
      const info = document.createElement("div"); info.className = "card-info";
      const name = document.createElement("div"); name.className = "card-name"; name.textContent = `${row.name || cid}${on ? " ★上场" : ""}`;
      const desc = document.createElement("div"); desc.className = "card-desc"; desc.textContent = row.bond_passive_desc || "";
      const cardName = CARD_DEFS[String(row.bond_card)]?.name || row.bond_card || "";
      const cardLine = document.createElement("div"); cardLine.className = "card-cost"; cardLine.textContent = `专属斗法牌：${cardName}`;
      info.append(name, desc, cardLine);
      const btn = document.createElement("button"); btn.className = "card-btn";
      btn.textContent = on ? "撤下" : "上场";
      btn.addEventListener("click", () => {
        const r = Game.toggleLineup(cid);
        if (!r.ok && r.reason) Game.toast("阵容", r.reason);
        renderPanelBody("log");
      });
      card.append(glyph, info, btn); body.appendChild(card);
    }
  }

  // 丹房区（rq_07 解锁）—— P1 生活技艺：炼丹控火候 / 画符蓄力 / 占卜
  if (Game.isAlchemyUnlocked()) {
    const craftBoost = Game.hasDivinationBoost("craft_boost");
    body.appendChild(note("丹房：炉火常明。炼丹画符皆看火候——光标行至中段停手得上品，偏外则中品、下品。" + (craftBoost ? "（今日占卜得签，火候易得。）" : "")));

    // 炼丹（控火候）
    for (const def of PILL_DEFS) {
      const pillCard = document.createElement("div"); pillCard.className = "card";
      const pInfo = document.createElement("div"); pInfo.className = "card-info";
      const pName = document.createElement("div"); pName.className = "card-name"; pName.textContent = `${def.name}——${def.desc}`;
      const costLine = document.createElement("div"); costLine.className = "card-cost";
      costLine.textContent = `耗：${Object.keys(def.cost).map((rid) => { const rn = DataManager.getById("resource_table", rid).resource_name || rid; return `${rn} ${formatInt(def.cost[rid])}`; }).join("，")}｜${def.effectText(Game.state)}`;
      pInfo.append(pName, costLine);
      const craftBtn = document.createElement("button"); craftBtn.className = "card-btn";
      craftBtn.textContent = "开炉";
      const canAfford = Object.keys(def.cost).every((rid) => num(Game.state.resources[rid]) >= num(def.cost[rid]));
      craftBtn.disabled = !canAfford;
      craftBtn.addEventListener("click", () => {
        CraftMinigame.open({ title: `炼丹·${def.name}`, prompt: "看准火候，停在中段得上品", boost: craftBoost }, (quality) => {
          Game.brewPillWithQuality(def.id, quality);
          renderPanelBody("log");
        });
      });
      pillCard.append(pInfo, craftBtn); body.appendChild(pillCard);
    }

    // 替身符（21.1 §1.6，数据驱动自 pill_table）：破劫败局符代你受榜文一笔，败转胜，唯名位不授。
    // 显示门：榜上留过名或已有符者方见炼法——与留名弧线同步揭示（一次只教一件事），新号丹房不增信息负担。
    const tishenRow = Game.getTishanRow();
    if (Object.keys(tishenRow).length && (int(Game.state.list_marks) > 0 || int(Game.state.pills.tishen) > 0)) {
      const tCost = tishenRow.cost || {};
      const tGate = UnlockManager.conditionMet(Game.state, String(tishenRow.unlock_realm || ""));
      const tToday = todayString();
      const tDailyHit = str(Game.state.pills.tishen_day, "") === tToday && int(Game.state.pills.tishen_today) >= int(tishenRow.daily_limit, 1);
      const tAfford = Object.keys(tCost).every((rid) => num(Game.state.resources[rid]) >= num(tCost[rid]));
      const tCard = document.createElement("div"); tCard.className = "card";
      const tInfo = document.createElement("div"); tInfo.className = "card-info";
      const tName = document.createElement("div"); tName.className = "card-name"; tName.textContent = `${tishenRow.pill_name}——${tishenRow.effect_desc}`;
      const tSub = document.createElement("div"); tSub.className = "card-cost";
      tSub.textContent = tGate
        ? `耗：${Object.keys(tCost).map((rid) => { const rn = DataManager.getById("resource_table", rid).resource_name || rid; return `${rn} ${formatInt(tCost[rid])}`; }).join("，")}｜存 ${int(Game.state.pills.tishen)} 张${tDailyHit ? "｜今日炉火已熄" : ""}`
        : `需${String(DataManager.getRealm(String(tishenRow.unlock_realm)).realm_name || "更高境界")}方可炼制`;
      tInfo.append(tName, tSub);
      const tBtn = document.createElement("button"); tBtn.className = "card-btn"; tBtn.textContent = "炼符";
      tBtn.disabled = !(tGate && tAfford && !tDailyHit);
      tBtn.addEventListener("click", () => { Game.craftTishan(); renderPanelBody("log"); });
      tCard.append(tInfo, tBtn); body.appendChild(tCard);
    }

    // 画符（蓄力）
    const talismans = Game.state.talismans || [];
    const tCount = (t) => talismans.filter((x) => x.type === t).length;
    body.appendChild(note(`画符（朱砂 3｜法力 2000）：符成可带入斗法，打出即焚。现有 火符 ${tCount("fire")}｜雷符 ${tCount("thunder")}｜护身符 ${tCount("guard")}。`));
    const talismanTypes = [
      { type: "fire", name: "火符", desc: "火伤 + 燃烧" },
      { type: "thunder", name: "雷符", desc: "雷伤 + 雷殛标记" },
      { type: "guard", name: "护身符", desc: "罡气 + 圣盾" },
    ];
    for (const tt of talismanTypes) {
      const tCard = document.createElement("div"); tCard.className = "card";
      const tInfo = document.createElement("div"); tInfo.className = "card-info";
      const tName = document.createElement("div"); tName.className = "card-name"; tName.textContent = `${tt.name}——${tt.desc}`;
      const tSub = document.createElement("div"); tSub.className = "card-cost"; tSub.textContent = "上品得 2 枚（lv3）｜中品 1 枚（lv2）｜下品 1 枚（lv1）";
      tInfo.append(tName, tSub);
      const drawBtn = document.createElement("button"); drawBtn.className = "card-btn"; drawBtn.textContent = "画";
      const canDraw = num(Game.state.resources.spell_page) >= 3 && num(Game.state.resources.mana) >= 2000;
      drawBtn.disabled = !canDraw;
      drawBtn.addEventListener("click", () => {
        CraftMinigame.open({ title: `画符·${tt.name}`, prompt: "笔走龙蛇，蓄力停在中段得上品", boost: craftBoost }, (quality) => {
          Game.drawTalisman(tt.type, quality);
          renderPanelBody("log");
        });
      });
      tCard.append(tInfo, drawBtn); body.appendChild(tCard);
    }

    // 占卜（给线索，非数字）
    const div = Game.state.divination || {};
    const divined = str(div.last_day, "") === todayString();
    body.appendChild(note("占卜：焚香摇签，每日一签。签文给的是线索，不是数字——信则灵。"));
    const divCard = document.createElement("div"); divCard.className = "card";
    const divInfo = document.createElement("div"); divInfo.className = "card-info";
    const divName = document.createElement("div"); divName.className = "card-name"; divName.textContent = "焚香占卜";
    const divSub = document.createElement("div"); divSub.className = "card-desc";
    divSub.textContent = divined ? "今日已占。天机不可屡窥，明日再来。" : "求一签，看看明日气运。";
    divInfo.append(divName, divSub);
    const divBtn = document.createElement("button"); divBtn.className = "card-btn"; divBtn.textContent = "摇签";
    divBtn.disabled = divined;
    divBtn.addEventListener("click", () => { Game.divine(); renderPanelBody("log"); });
    divCard.append(divInfo, divBtn); body.appendChild(divCard);
  }

  // 历世录
  const rb = state.rebirth || {};
  if (int(rb.count) > 0) {
    body.appendChild(note(`历世录（${rb.count} 世）：`));
    for (const line of rb.log || []) { const d = document.createElement("div"); d.className = "log-line"; d.textContent = line; body.appendChild(d); }
  }

  // 见闻录（21.3 §3.3 E4）：众生见证，领信息不领资源；空则整区不渲染（新号零负担）
  const witnessed = Array.isArray(state.witnessed) ? state.witnessed : [];
  if (witnessed.length) {
    const rows = witnessed.map((id) => DataManager.getById("witness_table", String(id))).filter((r) => Object.keys(r).length);
    const byKind = {};
    for (const r of rows) { (byKind[String(r.kind_label || "见闻")] = byKind[String(r.kind_label || "见闻")] || []).push(r); }
    const summary = Object.keys(byKind).map((k) => `${k} ${byKind[k].length}`).join("｜");
    body.appendChild(note(`见闻录（${rows.length} 条）：${summary}——大劫众生，谁死谁活，皆入你眼。`));
    for (const r of rows) {
      const card = document.createElement("div"); card.className = "card";
      const info = document.createElement("div"); info.className = "card-info";
      const name = document.createElement("div"); name.className = "card-name"; name.textContent = `${r.kind_label}·${r.lore_anchor}`;
      const desc = document.createElement("div"); desc.className = "card-desc"; desc.textContent = String(r.witness_text || "");
      info.append(name, desc); card.appendChild(info); body.appendChild(card);
    }
  }

  if (!state.logs.length) body.appendChild(note("修行日志空空如也。"));
  for (const line of state.logs) { const d = document.createElement("div"); d.className = "log-line"; d.textContent = line; body.appendChild(d); }
  // 21.6 L2 榜上留书：外链反馈入口（不做界内输入框）
  body.appendChild(popupButton("榜上留书（寄语与反馈）", true, () => { Game.openFeedbackForm(); }));
  body.appendChild(popupButton("重入轮回（清空存档）", true, () => { if (confirm("确定要重入轮回？当前修行进度将全部清空。")) { closePanelSheet(); Game.resetSave(); } }));
}

window.PANEL_UNITS = window.PANEL_UNITS || {};
window.PANEL_UNITS.log = { title: "洞府", render: renderLogPanel };
