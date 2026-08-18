/* 封神修道录 · UI — 渲染、弹窗、面板、启动 */

"use strict";

// 存档变更追踪
window.SAVE_REV = 0;
const _origSave = SaveManager.save.bind(SaveManager);
SaveManager.save = (state) => { window.SAVE_REV++; _origSave(state); };

// ---------------- 运行时状态 ----------------

let sparkleEl = null, nextSparkleAt = 0, nextInsightAt = 0, insightShowing = false;
let currentPopup = null, preludeActive = false, openPanel = "", lastRev = -1;
let sparkleCombo = 0, battleTimer = null, battleTargeting = null;
let toastShownId = null, toastTimer = null;

// ---------------- 主渲染 ----------------

function render() {
  const state = Game.state;
  if (!state || !state.realm_id) return;
  const realm = RealmManager.getCurrentRealm(state);
  const ui = realm.ui || {};
  $("bg").style.backgroundImage = `url("${BACKGROUND_PATHS[ui.background_phase] || BACKGROUND_PATHS.mountain_cave}")`;
  $("fx-seal").classList.toggle("lit", DataManager.isRealmAtLeast(state.realm_id, "rq_06"));
  $("char-img").src = CHARACTER_PATHS[ui.character_phase] || CHARACTER_PATHS["炼气士"];
  const raceTag = getRaceShortName(state);
  $("identity-line").textContent = `${getPhaseRealmName(realm)}｜${raceTag ? `${raceTag}·` : ""}${getTitle(state)}｜战力 ${formatInt(RealmManager.getCombatPower(state))}`;
  $("weather-line").textContent = `天象：${getWeather(state)}`;
  const omen = getTodayOmen();
  $("omen-line").textContent = `今日异象：${omen.name}——${omen.desc}`;
  const pressure = WorldScroll.getSealPressure(state);
  $("seal-pressure-fill").style.width = `${pressure.value}%`;
  $("seal-pressure-state").textContent = pressure.label;
  $("seal-pressure").title = pressure.tip;
  $("seal-pressure").dataset.level = pressure.value >= 75 ? "high" : pressure.value >= 55 ? "mid" : "low";
  const orb = $("treasure-orb");
  if (state.first_treasure_id) {
    orb.classList.remove("hidden");
    if (!orb.dataset.tid || orb.dataset.tid !== state.first_treasure_id) {
      orb.dataset.tid = state.first_treasure_id; orb.innerHTML = "";
      const img = document.createElement("img"); img.src = TREASURE_ICONS[state.first_treasure_id] || ""; img.alt = ""; orb.appendChild(img);
    }
  } else { orb.classList.add("hidden"); }
  const goal = GoalManager.getCurrent(state);
  if (Object.keys(goal).length) { $("goal-text").textContent = goal.display_text || `当前目标：${goal.goal_name}`; $("goal-reward").textContent = goal.reward_preview || ""; }
  else { $("goal-text").textContent = "当前目标：等待天仙篇开启"; $("goal-reward").textContent = "可继续：骷髅山边界游历，收集祭炼材料"; }
  const progress = RealmManager.getProgress(state);
  $("progress-fill").style.width = `${Math.round(progress.ratio * 100)}%`;
  $("progress-label").textContent = `道行 ${formatInt(progress.current)} / ${formatInt(progress.required)}`;
  if (!insightShowing) { $("status-line").classList.remove("insight"); $("status-line").textContent = state.logs[0] ? state.logs[0].replace(/^\[\d+:\d+\]\s*/, "") : ""; }
  renderToast();
  renderMainButton(state); renderNav(state);
  const autoBtn = $("auto-toggle"); const autoOn = !!state.flags.auto_repeat;
  autoBtn.textContent = `连续修行：${autoOn ? "开" : "关"}`; autoBtn.classList.toggle("on", autoOn);
  if (window.SAVE_REV !== lastRev) { lastRev = window.SAVE_REV; renderResources(state); if (openPanel) renderPanelBody(openPanel); }
  drainPopupQueue();
}

function renderToast() {
  const msg = Game.toastMessage;
  const el = $("action-toast");
  if (!el || !msg || msg.id === toastShownId) return;
  toastShownId = msg.id;
  el.innerHTML = "";
  const title = document.createElement("div");
  title.className = "action-toast-title";
  title.textContent = msg.title || "";
  const body = document.createElement("div");
  body.className = "action-toast-body";
  body.textContent = msg.body || "";
  el.append(title, body);
  el.classList.remove("hidden");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), int(msg.duration, 2400));
}

function renderResources(state) {
  const strip = $("resource-strip"); strip.innerHTML = "";
  for (const row of UnlockManager.getVisibleResources(state)) {
    const id = String(row.resource_id);
    const chip = document.createElement("div"); chip.className = "res-chip"; chip.title = row.resource_name || id;
    const img = document.createElement("img"); img.src = ICON_PATHS[id] || ""; img.alt = "";
    const name = document.createElement("span"); name.className = "res-name"; name.textContent = row.resource_name || id;
    const value = document.createElement("span"); value.className = "res-value"; value.textContent = formatInt(state.resources[id] || 0);
    chip.append(img, name, value); strip.appendChild(chip);
  }
}

function renderMainButton(state) {
  const main = Game.getMainAction();
  const btn = $("main-btn"), label = $("main-btn-label"), bar = $("main-btn-progress"), stage = $("stage");
  if (main.type === "acting") {
    const action = state.current_action, row = main.row || {};
    const total = num(action.end_time_ms) - num(action.start_time_ms || action.end_time_ms - 1000);
    const remainMs = Math.max(0, num(action.end_time_ms) - nowMs());
    const ratio = total > 0 ? 1 - remainMs / total : 1;
    bar.style.width = `${Math.round(ratio * 100)}%`;
    label.textContent = `${row.action_name || "修行"}中… ${Math.ceil(remainMs / 1000)}息`;
    btn.classList.add("acting"); btn.classList.toggle("beat", Game.isInBeatWindow());
    stage.classList.add("acting");
    tickSparkle(String(row.action_id || "")); tickInsight(String(row.action_id || ""));
  } else {
    bar.style.width = "0%"; label.textContent = main.label;
    btn.classList.remove("acting"); stage.classList.remove("acting"); clearSparkle();
    if (insightShowing) { insightShowing = false; $("status-line").classList.remove("insight"); }
    nextSparkleAt = nowMs() + 2500; nextInsightAt = nowMs() + 2000;
  }
  btn.dataset.type = main.type; btn.dataset.actionId = main.actionId || "";
  renderActionHints(state, main);
}

function renderActionHints(state, main) {
  const box = $("action-hints");
  if (!box) return;
  if (main.type !== "action" && main.type !== "claim" && main.type !== "idle") { box.classList.add("hidden"); box.innerHTML = ""; return; }
  const recs = Game.getSecondaryRecommendations(state);
  if (!recs.length) { box.classList.add("hidden"); box.innerHTML = ""; return; }
  box.innerHTML = "";
  box.classList.remove("hidden");
  for (const rec of recs) {
    const b = document.createElement("button");
    b.className = "hint-btn" + (rec.id === "boss" ? " boss" : "");
    b.textContent = rec.label;
    b.addEventListener("click", () => {
      if (rec.id === "boss") { openPanelSheet("map"); return; }
      if (rec.id === "goal_action" && rec.actionId) { Game.startAction(rec.actionId); }
    });
    box.appendChild(b);
  }
}

// ---------------- 修行灵光 ----------------

function sparkleDelay() {
  let delay = getTodayOmen().sparkleFast ? randInt(2500, 5000) : randInt(4000, 8000);
  if (str(Game.state.race_id, "") === "qilin") delay = Math.max(1200, Math.round(delay * 0.7));
  return delay;
}

function rollSparkleType() {
  const total = SPARKLE_TYPES.reduce((a, t) => a + t.weight, 0);
  let pick = Math.random() * total;
  for (const t of SPARKLE_TYPES) { pick -= t.weight; if (pick <= 0) return t; }
  return SPARKLE_TYPES[0];
}

function tickSparkle(actionId) {
  if (sparkleEl || nowMs() < nextSparkleAt) return;
  document.querySelectorAll("#stage .sparkle").forEach((el) => el.remove());
  const firstTime = !Game.state.flags.sparkle_guide_seen;
  const stage = $("stage");
  const t = firstTime ? SPARKLE_TYPES[0] : rollSparkleType();
  const orb = document.createElement("div");
  orb.className = `sparkle${t.cls ? " " + t.cls : ""}`;
  orb.style.left = `${randInt(12, 78)}%`; orb.style.top = `${randInt(10, 72)}%`;
  if (firstTime) { const tip = document.createElement("span"); tip.className = "sparkle-label"; tip.textContent = "点击拾取"; orb.appendChild(tip); }
  orb.addEventListener("click", (e) => {
    e.stopPropagation(); sparkleCombo += 1;
    const gain = Game.collectSparkle(t.type, sparkleCombo);
    if (gain) {
      const float = document.createElement("div"); float.className = "sparkle-float";
      float.style.left = orb.style.left; float.style.top = orb.style.top;
      const parts = [];
      for (const id of Object.keys(gain)) { const row = DataManager.getById("resource_table", id); parts.push(`${row.resource_name || id} +${formatInt(gain[id])}`); }
      float.textContent = `${parts.join("　")}${sparkleCombo > 1 ? `　连拾×${sparkleCombo}` : ""}`;
      stage.appendChild(float); setTimeout(() => float.remove(), 1300);
    }
    orb.remove(); clearSparkle(); nextSparkleAt = nowMs() + sparkleDelay();
  });
  stage.appendChild(orb); sparkleEl = orb;
  if (firstTime) Game.sparkleGuide();
  if (!firstTime) { setTimeout(() => { if (sparkleEl === orb) { sparkleCombo = 0; clearSparkle(); nextSparkleAt = nowMs() + sparkleDelay(); } }, 3500); }
}

function clearSparkle() { document.querySelectorAll("#stage .sparkle").forEach((el) => el.remove()); sparkleEl = null; }

// ---------------- 修行心得流 ----------------

function tickInsight(actionId) {
  if (nowMs() < nextInsightAt) return;
  const pool = [...(INSIGHT_LINES[actionId] || []), ...INSIGHT_LINES.generic];
  const line = pool[randInt(0, pool.length - 1)];
  const el = $("status-line"); el.classList.remove("insight"); void el.offsetWidth;
  el.classList.add("insight"); el.textContent = line;
  insightShowing = true; nextInsightAt = nowMs() + randInt(4500, 6500);
}

// ---------------- 底部导航 ----------------

function renderNav(state) {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    const key = btn.dataset.panel, cfg = NAV_UNLOCK[key], unlocked = cfg.check(state);
    btn.classList.toggle("locked", !unlocked);
    let dot = btn.querySelector(".red-dot");
    let need = false;
    if (unlocked) {
      if (key === "chance" && state.pending_event_id) need = true;
      if (key === "realm" && (RealmManager.canLevelUp(state) || BreakthroughManager.canAttempt(state) || Game.canReincarnate())) need = true;
      if (key === "spell" && hasAffordableSpell(state)) need = true;
      if (key === "treasure" && (Game.hasPendingTreasureChoice() || hasAffordableTreasure(state))) need = true;
      if (key === "map" && hasChallengeableBoss(state)) need = true;
    }
    btn.classList.toggle("attention", need);
    if (need && !dot) { dot = document.createElement("span"); dot.className = "red-dot"; btn.appendChild(dot); }
    else if (!need && dot) dot.remove();
  });
}

function hasAffordableSpell(state) { return UnlockManager.getAvailableSpells(state).some((spell) => { const level = int(Game.getSpellState(String(spell.spell_id)).level), nextLevel = level + 1; if (nextLevel > Game.getSpellMaxLevel(spell)) return false; const cost = Game.getSpellUpgradeCost(spell, nextLevel); return cost && num(state.resources.spell_page) >= num(cost.spell_page_cost) && num(state.resources.mana) >= num(cost.mana_cost); }); }
function hasAffordableTreasure(state) { return UnlockManager.getAvailableTreasures(state).some((treasure) => { const level = int(Game.getTreasureState(String(treasure.treasure_id)).level), nextLevel = level + 1; if (nextLevel > int(treasure.max_level_mvp, 5)) return false; const cost = Game.getTreasureUpgradeCost(treasure, nextLevel); return cost && num(state.resources.treasure_shard) >= num(cost.treasure_shard_cost) && num(state.resources.mana) >= num(cost.mana_cost); }); }
function hasChallengeableBoss(state) { return BossManager.getBosses(state).some((boss) => BossManager.canChallenge(state, String(boss.boss_id)) && BossManager.getWinRate(state, boss) >= 0.5); }

// ---------------- 主按钮点击 ----------------

function onMainButtonClick() {
  if (preludeActive) return;
  const btn = $("main-btn"), type = btn.dataset.type;
  switch (type) {
    case "acting": if (Game.registerBeat()) { const f = document.createElement("div"); f.className = "sparkle-float"; f.style.left = "50%"; f.style.top = "80%"; f.textContent = "完美吐纳！"; $("stage").appendChild(f); setTimeout(() => f.remove(), 1300); } break;
    case "event": if (currentPopup && currentPopup.kind === "event") break; Game.openPendingEvent(); break;
    case "treasure_choice": Game.queuePopup({ kind: "treasure_choice" }); drainPopupQueue(); break;
    case "faction_choice": Game._maybeQueueFactionChoice(); drainPopupQueue(); break;
    case "breakthrough": Game.requestBreakthrough(); break;
    case "level_up": playLevelUpFx(() => Game.levelUp()); break;
    case "spell_up": openPanelSheet("spell"); break;
    case "treasure_up": openPanelSheet("treasure"); break;
    case "boss_fight": openPanelSheet("map"); break;
    case "claim": Game.claimOfflineReward(); break;
    case "action": Game.startAction(btn.dataset.actionId); break;
    default: Game.queuePopup({ kind: "text", title: "闭关", body: "你继续在洞府中闭关。\n山中灵气会随时间缓缓汇入体内，离开页面也不会中断。\n\n稍后回来「出关领取」即可。", buttons: [{ label: "静心闭关" }] }); drainPopupQueue();
  }
}

// ---------------- 弹窗系统 ----------------

function drainPopupQueue() {
  if (currentPopup || preludeActive) return;
  if (!Game.popupQueue.length) return;
  const popup = Game.popupQueue.shift();
  if (popup.kind === "prologue") {
    currentPopup = popup;
    WorldScroll.playPrologue(() => {
      currentPopup = null;
      render();
      drainPopupQueue();
    });
    return;
  }
  if (popup.kind === "world_map") {
    currentPopup = popup;
    WorldMap.open(() => {
      currentPopup = null;
      render();
      drainPopupQueue();
    });
    return;
  }
  if (popup.kind === "event" && popup.prelude) { preludeActive = true; $("prelude").classList.remove("hidden"); setTimeout(() => { $("prelude").classList.add("hidden"); preludeActive = false; showPopup(popup); }, 700); return; }
  showPopup(popup);
}

function showPopup(popup) {
  currentPopup = popup;
  const panel = $("popup-panel"), title = $("popup-title"), body = $("popup-body"), buttons = $("popup-buttons");
  panel.className = ""; body.innerHTML = ""; buttons.innerHTML = ""; $("popup-layer").classList.remove("hidden");
  if (popup.kind === "text") {
    if (popup.style) panel.classList.add(`style-${popup.style}`);
    title.textContent = popup.title || ""; body.textContent = popup.body || "";
    for (const cfg of popup.buttons || [{ label: "确定" }]) buttons.appendChild(popupButton(cfg.label, cfg.secondary, () => { closePopup(); if (cfg.action === "claim_offline") Game.claimOfflineReward(); if (cfg.action === "reincarnate") Game.reincarnate(); if (cfg.action === "open_scroll") WorldScroll.open(); }));
  } else if (popup.kind === "event") renderEventPopup(panel, title, body, buttons);
  else if (popup.kind === "encounter") renderEncounterPopup(panel, title, body, buttons, popup.encounterId);
  else if (popup.kind === "battle") renderBattlePopup(panel, title, body, buttons, popup.battle);
  else if (popup.kind === "treasure_choice") renderTreasureChoicePopup(panel, title, body, buttons);
  else if (popup.kind === "race_choice") renderRaceChoicePopup(panel, title, body, buttons);
  else if (popup.kind === "benming_choice") renderBenmingChoicePopup(panel, title, body, buttons);
  else if (popup.kind === "faction_choice") renderFactionChoicePopup(panel, title, body, buttons);
  else if (popup.kind === "breakthrough_confirm") renderBreakthroughConfirmPopup(panel, title, body, buttons, popup.breakthroughId);
  else if (popup.kind === "rest") renderRestPopup(panel, title, body, buttons, popup.payload || {});
  else if (popup.kind === "insight") renderInsightPopup(panel, title, body, buttons, popup.payload || {});
}

function closePopup() { currentPopup = null; $("popup-layer").classList.add("hidden"); drainPopupQueue(); render(); }

function popupButton(label, secondary, handler, extraClass = "") {
  const btn = document.createElement("button");
  btn.className = `popup-btn${secondary ? " secondary" : ""}${extraClass ? " " + extraClass : ""}`;
  btn.textContent = label; btn.addEventListener("click", handler);
  return btn;
}

// ---------------- 遭遇弹窗 ----------------

function renderEncounterPopup(panel, title, body, buttons, encounterId) {
  const enc = DataManager.getById("encounter_table", encounterId);
  if (!Object.keys(enc).length) { closePopup(); return; }
  // --- New format ---
  if (enc.encounter_type) {
    renderNewEncounterPopup(panel, title, body, buttons, enc);
    return;
  }
  // --- Old format ---
  panel.classList.add("style-chance"); title.textContent = `遭遇：${enc.name}`; body.textContent = enc.narrative || "";
  const state = Game.state;
  (enc.options || []).forEach((option, index) => {
    const btn = document.createElement("button"); btn.className = "popup-btn" + (option.kind === "battle" ? " calamity" : "");
    const main = document.createElement("span"); main.textContent = option.text || "选择";
    const sub = document.createElement("span"); sub.className = "popup-option-sub";
    if (option.kind === "battle") {
      const map = DataManager.getById("map_table", String(enc.map_id));
      sub.textContent = `斗法 · 敌方战力约 ${formatInt(Math.max(50, Math.round(num(map.recommended_power, 300) * num(option.enemy_power_ratio, 0.25) * num(getTodayOmen().enemyMult, 1))))}（你 ${formatInt(RealmManager.getCombatPower(state))}）`;
    } else if (option.kind === "check") {
      let chance = num(option.chance, 0.6) + num(getTodayOmen().checkBonus, 0);
      for (const row of DataManager.getRows("spell_table")) { if (String(row.spell_type) === String(option.bonus_spell_type)) chance += int(state.spells[String(row.spell_id)]?.level) * num(option.bonus_per_level, 0.05); }
      sub.textContent = `成算约 ${Math.round(clamp(chance, 0.05, 0.95) * 100)}%`;
    } else sub.textContent = "稳妥之选";
    btn.append(main, sub);
    btn.addEventListener("click", () => { closePopup(); Game.resolveEncounter(encounterId, index); });
    buttons.appendChild(btn);
  });
}

function renderNewEncounterPopup(panel, title, body, buttons, enc) {
  const type = String(enc.encounter_type);
  const name = String(enc.encounter_name || "遭遇");
  const state = Game.state;
  panel.classList.add(type === "battle" ? "style-breakthrough" : "style-chance");
  title.textContent = `遭遇：${name}`;
  body.textContent = String(enc.text || "");
  if (type === "battle") {
    const cfg = enc.battle_config || {};
    const map = DataManager.getById("map_table", String(enc.map_id));
    const ratio = num(cfg.power_ratio, 0.2);
    const enemyPower = Math.max(50, Math.round(num(map.recommended_power, 300) * ratio * num(getTodayOmen().enemyMult, 1)));
    const btn = document.createElement("button"); btn.className = "popup-btn calamity";
    const main = document.createElement("span"); main.textContent = "应战";
    const sub = document.createElement("span"); sub.className = "popup-option-sub";
    sub.textContent = `斗法 · ${cfg.enemy_name || name} · 战力约 ${formatInt(enemyPower)}（你 ${formatInt(RealmManager.getCombatPower(state))}）`;
    btn.append(main, sub);
    btn.addEventListener("click", () => { closePopup(); Game.resolveEncounter(enc.encounter_id, 0); });
    buttons.appendChild(btn);
  } else if (type === "choice") {
    (enc.choices || []).forEach((choice, index) => {
      const btn = document.createElement("button"); btn.className = "popup-btn";
      const main = document.createElement("span"); main.textContent = choice.label || "选择";
      btn.appendChild(main);
      btn.addEventListener("click", () => { closePopup(); Game.resolveEncounter(enc.encounter_id, index); });
      buttons.appendChild(btn);
    });
  } else if (type === "gather") {
    const btn = document.createElement("button"); btn.className = "popup-btn";
    btn.textContent = "采集";
    btn.addEventListener("click", () => { closePopup(); Game.resolveEncounter(enc.encounter_id, 0); });
    buttons.appendChild(btn);
  } else {
    // narrative
    const btn = document.createElement("button"); btn.className = "popup-btn";
    btn.textContent = "继续赶路";
    btn.addEventListener("click", () => { closePopup(); Game.resolveEncounter(enc.encounter_id, 0); });
    buttons.appendChild(btn);
  }
}

// ---------------- 斗法弹窗 v2 ----------------

function renderBattlePopup(panel, title, body, buttons, battle) {
  panel.classList.add("style-breakthrough"); battleTargeting = null;
  const zone = document.createElement("div"); zone.className = "battle-zone"; body.appendChild(zone);
  const logBox = document.createElement("div"); logBox.className = "battle-log"; body.appendChild(logBox);
  appendBattleLine(logBox, `你与${battle.name}对上了气机，斗法开始！`);
  for (const t of battle.pendingEvents.splice(0)) appendBattleLine(logBox, t);

  const cardName = (card) => {
    const def = CARD_DEFS[card.id];
    if (!def) return card.id;
    if (def.kind === "treasure") return TREASURE_SKILLS[Game.state.first_treasure_id]?.name || def.name;
    return def.name;
  };

  const intentText = (e) => {
    if (e.charged) return { icon: "怒", text: "雷霆将落" };
    const it = e.intent || {};
    if (it.type === "attack") return { icon: "剑", text: `${it.short || "击"} ${formatInt(it.value)}` };
    if (it.type === "charge") return { icon: "怒", text: it.short || "蓄势" };
    if (it.type === "block") return { icon: "盾", text: `${it.short || "守"} ${formatInt(it.value)}` };
    return { icon: "咒", text: it.short || "施咒" };
  };
  const statusChips = (statuses) => {
    const frag = document.createElement("span"); frag.className = "status-chips";
    for (const key of Object.keys(statuses)) { const v = statuses[key]; if (v > 0 && STATUS_LABELS[key]) { const chip = document.createElement("span"); chip.className = `status-chip st-${key}`; chip.textContent = STATUS_LABELS[key](v); frag.appendChild(chip); } }
    return frag;
  };

  const render = () => {
    zone.innerHTML = "";
    const label = battle.bannerLabel || "劫数";
    if (battle.phases) { const banner = document.createElement("div"); banner.className = "phase-banner"; const nums = ["其一", "其二", "其三", "其四", "其五"]; banner.textContent = `${label}·${nums[battle.phaseIndex] || battle.phaseIndex + 1}｜${battle.phases[battle.phaseIndex].name}`; zone.appendChild(banner); }
    const enemyZone = document.createElement("div"); enemyZone.className = "enemy-zone";
    battle.enemies.forEach((e) => {
      if (e.hp <= 0) return;
      const card = document.createElement("div"); card.className = "enemy-card" + (battleTargeting != null ? " targetable" : "");
      const head = document.createElement("div"); head.className = "enemy-head";
      const nm = document.createElement("span"); nm.className = "enemy-name"; nm.textContent = e.name;
      const it = intentText(e); const intent = document.createElement("span"); intent.className = "intent-icon"; intent.textContent = `${it.icon} ${it.text}`;
      head.append(nm, intent);
      const hpBar = document.createElement("div"); hpBar.className = "hp-bar"; const fill = document.createElement("div"); fill.className = "hp-fill enemy"; fill.style.width = `${Math.round((e.hp / e.hpMax) * 100)}%`; hpBar.appendChild(fill);
      const foot = document.createElement("div"); foot.className = "enemy-foot";
      const hpNum = document.createElement("span"); hpNum.textContent = `${formatInt(e.hp)} / ${formatInt(e.hpMax)}`; foot.appendChild(hpNum);
      if (e.block > 0) { const b = document.createElement("span"); b.className = "block-chip"; b.textContent = `罡气 ${formatInt(e.block)}`; foot.appendChild(b); }
      foot.appendChild(statusChips(e.statuses)); card.append(head, hpBar, foot);
      if (battleTargeting != null) card.addEventListener("click", () => { const alive = battle.enemies.filter((x) => x.hp > 0); const idx = alive.indexOf(e); playManualCard(battleTargeting, Math.max(0, idx)); });
      enemyZone.appendChild(card);
    });
    zone.appendChild(enemyZone);

    const playerRow = document.createElement("div"); playerRow.className = "player-zone";
    const php = document.createElement("div"); php.className = "hp-row";
    const pbar = document.createElement("div"); pbar.className = "hp-bar"; const pfill = document.createElement("div"); pfill.className = "hp-fill player"; pfill.style.width = `${Math.round((battle.playerHp / battle.playerHpMax) * 100)}%`; pbar.appendChild(pfill);
    const pnum = document.createElement("span"); pnum.className = "hp-num"; pnum.textContent = formatInt(battle.playerHp);
    php.append(pbar, pnum);
    const pmeta = document.createElement("div"); pmeta.className = "player-meta";
    const apBox = document.createElement("span"); apBox.className = "ap-box";
    for (let i = 0; i < 3; i++) { const dot = document.createElement("span"); dot.className = "ap-dot" + (i < battle.ap ? " on" : ""); apBox.appendChild(dot); }
    pmeta.appendChild(apBox);
    if (battle.playerBlock > 0) { const b = document.createElement("span"); b.className = "block-chip"; b.textContent = `罡气 ${formatInt(battle.playerBlock)}`; pmeta.appendChild(b); }
    pmeta.appendChild(statusChips(battle.playerStatuses));
    const turnNum = document.createElement("span"); turnNum.className = "turn-num"; turnNum.textContent = `第 ${battle.turn} 回合`; pmeta.appendChild(turnNum);
    playerRow.append(php, pmeta); zone.appendChild(playerRow);

    if (battle.manual && !battle.done) {
      const hint = document.createElement("div"); hint.className = "battle-flow-hint";
      hint.textContent = "点卡即出招：攻击牌自动锁定气血最低的敌人，三招出满自动进入敌方回合。";
      zone.appendChild(hint);
    }

    const hand = document.createElement("div"); hand.className = "card-hand";
    battle.hand.forEach((card, i) => {
      const def = CARD_DEFS[card.id];
      const lackResource = def.cost && num(Game.state.resources[def.cost.resource]) < num(def.cost.amount);
      const locked = (def.kind === "treasure" && battle.treasureUsed) || lackResource;
      const el = document.createElement("div"); el.className = `battle-card element-${def.element}${card.used ? " used" : ""}${locked ? " locked" : ""}`;
      el.style.borderColor = ELEMENT_COLORS[def.element] || "#888";
      const nm = document.createElement("div"); nm.className = "bc-name";
      nm.textContent = cardName(card);
      const lv = document.createElement("div"); lv.className = "bc-lv"; lv.textContent = card.level > 1 ? `Lv.${card.level}` : "1 真气";
      const txt = document.createElement("div"); txt.className = "bc-text";
      const skill = def.kind === "treasure" ? TREASURE_SKILLS[Game.state.first_treasure_id] : null;
      const mult = BattleEngine._powerMult(battle);
      txt.textContent = skill ? skill.text(card.level, mult) : def.text(card.level, mult, Game.state);
      if (lackResource) txt.textContent = `${DataManager.getById("resource_table", def.cost.resource).resource_name || def.cost.resource}不足 ${def.cost.amount}，难以施展\n` + txt.textContent;
      el.append(nm, lv, txt);
      if (battle.manual && !battle.done && !card.used && !locked && battle.ap > 0) {
        el.classList.add("playable");
        el.addEventListener("click", () => playCardNow(i));
      }
      hand.appendChild(el);
    });
    zone.appendChild(hand);
  };

  const appendEvents = (events) => { for (const t of events) appendBattleLine(logBox, t); };

  const finishUp = () => {
    if (battleTimer) { clearInterval(battleTimer); battleTimer = null; }
    [refreshBtn, endTurnBtn, toggleBtn].forEach((b) => { if (b) b.disabled = true; });
    const endBtn = popupButton(battle.win ? "收取战果" : "退出战圈", false, () => { closePopup(); Game.finishBattle(battle); });
    buttons.appendChild(endBtn);
    appendBattleLine(logBox, battle.win ? `${battle.name}溃散！` : "你护住灵台，且战且退。");
  };

  const updateControls = () => {
    if (battle.done) return;
    const manual = battle.manual;
    refreshBtn.classList.toggle("hidden", !manual);
    endTurnBtn.classList.toggle("hidden", !manual);
    refreshBtn.textContent = battle.refreshUsed ? "刷新卡牌（已用）" : "刷新卡牌";
    refreshBtn.disabled = battle.refreshUsed || !manual || battle.ap <= 0;
    endTurnBtn.textContent = battle.ap >= 3 ? "结束回合" : `结束回合（剩 ${battle.ap} 气）`;
    endTurnBtn.disabled = battle.ap >= 3;
    toggleBtn.textContent = manual ? "自动托管" : "手动出招";
  };

  const playCardNow = (handIndex) => {
    if (battle.done || !battle.manual || battle.ap <= 0) return;
    const card = battle.hand[handIndex];
    if (!card || card.used) return;
    const def = CARD_DEFS[card.id];
    if (!def) return;
    if (def.kind === "treasure" && battle.treasureUsed) return;
    if (def.cost && num(Game.state.resources[def.cost.resource]) < num(def.cost.amount)) return;
    const alive = battle.enemies.filter((e) => e.hp > 0);
    const targetIndex = alive.length > 1 ? alive.reduce((best, e, idx) => (e.hp < alive[best].hp ? idx : best), 0) : 0;
    appendEvents(Game.battlePlayCard(battle, handIndex, targetIndex));
    render();
    if (battle.done) { finishUp(); return; }
    if (battle.ap <= 0) {
      appendBattleLine(logBox, "你三招已尽，对手趁势而动。");
      appendEvents(Game.battleEndTurn(battle));
      render();
      if (battle.done) finishUp();
    } else {
      updateControls();
    }
  };

  const endTurnNow = () => {
    if (battle.done) return;
    appendEvents(Game.battleEndTurn(battle));
    render();
    if (battle.done) finishUp();
  };

  const refreshBtn = popupButton("刷新卡牌", false, () => {
    if (battle.done) return;
    const result = Game.battleRefreshHand(battle);
    if (result.ok) { appendEvents(result.events); updateControls(); render(); }
  }, "secondary");
  const endTurnBtn = popupButton("结束回合", false, endTurnNow, "secondary");
  const toggleBtn = popupButton(battle.manual ? "自动托管" : "手动出招", false, () => {
    Game.battleToggleManual(battle);
    updateControls(); render();
  });
  buttons.append(refreshBtn, endTurnBtn, toggleBtn);
  updateControls(); render();
  if (battleTimer) clearInterval(battleTimer);
  battleTimer = setInterval(() => {
    if (battle.done) { clearInterval(battleTimer); battleTimer = null; return; }
    if (battle.manual) return;
    const result = Game.battleAutoStep(battle);
    if (result.acted) { for (const t of result.events) appendBattleLine(logBox, t); render(); if (battle.done) finishUp(); return; }
    const events = Game.battleEndTurn(battle); for (const t of events) appendBattleLine(logBox, t); render(); if (battle.done) finishUp();
  }, 850);
}

function appendBattleLine(logBox, text) { const line = document.createElement("div"); line.className = "battle-line"; line.textContent = text; logBox.appendChild(line); logBox.scrollTop = logBox.scrollHeight; }

// ---------------- 机缘事件弹窗 ----------------

function renderEventPopup(panel, title, body, buttons) {
  const eventRow = Game.getPendingEvent();
  if (!Object.keys(eventRow).length) { closePopup(); return; }
  panel.classList.add("style-chance"); title.textContent = `机缘触发：${eventRow.event_name || ""}`;
  const tag = eventRow.fengshen_tag ? `封神锚点：${eventRow.fengshen_tag}\n\n` : "";
  body.textContent = `${tag}${eventRow.narrative_text || ""}`;
  const isChoice = eventRow.merit_or_calamity === "choice";
  (eventRow.options || []).forEach((option, index) => {
    const btn = document.createElement("button"); btn.className = "popup-btn" + (isChoice ? (index === 0 ? " merit" : " calamity") : "");
    btn.innerHTML = "<span>" + (option.text || "选择") + '</span><span class="popup-option-sub">' + describeEventReward(option) + "</span>";
    btn.addEventListener("click", () => { closePopup(); Game.chooseEventOption(index); });
    buttons.appendChild(btn);
  });
}

function describeEventReward(option) {
  const parts = []; const reward = option.reward || {};
  for (const id of Object.keys(reward.resources || {})) { const row = DataManager.getById("resource_table", id); parts.push(`${row.resource_name || id} +${formatInt(reward.resources[id])}`); }
  if (reward.spell_pages_by_type) { let t = 0; for (const k of Object.keys(reward.spell_pages_by_type)) t += num(reward.spell_pages_by_type[k]); parts.push(`术法残页 +${t}`); }
  if (reward.treasure_shards_by_id) { let t = 0; for (const k of Object.keys(reward.treasure_shards_by_id)) t += num(reward.treasure_shards_by_id[k]); parts.push(`法宝碎片 +${t}`); }
  if (reward.root_progress) parts.push(`道行 +${formatInt(reward.root_progress)}`);
  if (reward.breakthrough_bonus) parts.push("破劫气运上升");
  if (reward.breakthrough_pressure_reduce) parts.push("劫气消散");
  if (reward.random_bonus) parts.push("或有意外之喜");
  return parts.join("，") || "一缕气机入体";
}

// ---------------- 本命法宝择主弹窗 ----------------

function renderTreasureChoicePopup(panel, title, body, buttons) {
  if (!Game.hasPendingTreasureChoice()) { closePopup(); return; }
  panel.classList.add("style-treasure"); title.textContent = "本命法宝择主"; body.textContent = "破劫成真人后，你的气机引动三件残宝。\n它们皆非真正先天灵宝，却各有封神因果。\n选择其一，作为你的第一件本命法宝。";
  for (const id of FIRST_TREASURE_CHOICES) {
    const row = DataManager.getById("treasure_table", id);
    if (!Object.keys(row).length) continue;
    const btn = document.createElement("button"); btn.className = "popup-btn treasure-pick";
    const img = document.createElement("img"); img.src = TREASURE_ICONS[id] || ""; img.alt = "";
    const info = document.createElement("span");
    const name = document.createElement("span"); name.textContent = row.treasure_name || id;
    const sub = document.createElement("span"); sub.className = "popup-option-sub";
    sub.textContent = `${row.origin_desc || ""}\n法宝技：${row.skill_name || ""} — ${row.skill_desc || ""}`;
    info.append(name, sub); btn.append(img, info);
    btn.addEventListener("click", () => { closePopup(); Game.chooseFirstTreasure(id); });
    buttons.appendChild(btn);
  }
}

// ---------------- 种族四选一弹窗 ----------------

function renderRaceChoicePopup(panel, title, body, buttons) {
  panel.classList.add("style-seal"); title.textContent = "择跟脚：你自何处来";
  body.textContent = "巫妖大战落幕，人族初兴，三界秩序未稳。\n投胎灵光将落未落之际——你先想清楚，这一世做什么生灵。\n\n跟脚一选定终身，不可更改。";
  const rb = Game.state.rebirth || {};
  for (const row of DataManager.getRows("race_table")) {
    const btn = document.createElement("button"); btn.className = "popup-btn treasure-pick choice-pick";
    const glyph = document.createElement("span"); glyph.className = "choice-glyph"; glyph.textContent = row.glyph || "命";
    const info = document.createElement("span"); info.className = "choice-info";
    const name = document.createElement("span"); name.className = "choice-name";
    const seen = rb.races_seen?.includes(String(row.race_id));
    name.textContent = `${row.race_name}｜天赋·${row.talent_name}${seen ? "（前世）" : ""}`;
    const sub = document.createElement("span"); sub.className = "popup-option-sub";
    sub.textContent = `${row.card_desc}\n${row.effect_desc}`;
    info.append(name, sub); btn.append(glyph, info);
    btn.addEventListener("click", () => { closePopup(); Game.chooseRace(String(row.race_id)); });
    buttons.appendChild(btn);
  }
}

// ---------------- 本命流派五选一弹窗（P0-A） ----------------

function renderBenmingChoicePopup(panel, title, body, buttons) {
  panel.classList.add("style-breakthrough"); title.textContent = "定本命：择一道走到黑";
  body.textContent = "真仙劫后，你的道开始有了形状。\n五条路在面前展开——雷、火、剑、魂、劫。\n\n选一条，它将与你性命相系，神通可至五阶，威力更增五成。\n其余四道，自此封顶三阶。\n\n此选择不可逆（唯转世可重定）。";
  for (const sc of SCHOOL_LIST) {
    const p = SCHOOL_PASSIVES[sc];
    const btn = document.createElement("button"); btn.className = "popup-btn treasure-pick choice-pick";
    const glyph = document.createElement("span"); glyph.className = "choice-glyph"; glyph.textContent = SCHOOL_NAME[sc];
    const info = document.createElement("span"); info.className = "choice-info";
    const name = document.createElement("span"); name.className = "choice-name"; name.textContent = p.name;
    const sub = document.createElement("span"); sub.className = "popup-option-sub"; sub.textContent = p.desc;
    info.append(name, sub); btn.append(glyph, info);
    btn.addEventListener("click", () => { closePopup(); Game.chooseBenmingSchool(sc); });
    buttons.appendChild(btn);
  }
}

// ---------------- 势力四选一弹窗 ----------------

function renderFactionChoicePopup(panel, title, body, buttons) {
  panel.classList.add("style-breakthrough"); title.textContent = "入局：择一方势力";
  body.textContent = "你已立身天仙之境，暂时挣脱榜文牵引。\n但洪荒棋局之上，无人能真正置身事外——地仙之后无散修。\n\n阐、截、天庭、五庄观，四方皆在落子。择一方入局，入局不悔。";
  for (const row of DataManager.getRows("faction_table")) {
    const btn = document.createElement("button"); btn.className = "popup-btn treasure-pick choice-pick";
    const glyph = document.createElement("span"); glyph.className = "choice-glyph"; glyph.textContent = row.glyph || "势";
    const info = document.createElement("span"); info.className = "choice-info";
    const name = document.createElement("span"); name.className = "choice-name"; name.textContent = `${row.faction_name}｜${row.dojo}`;
    const sub = document.createElement("span"); sub.className = "popup-option-sub";
    sub.textContent = `${row.card_desc}\n护持·${row.passive_name}：${row.passive_desc}`;
    info.append(name, sub); btn.append(glyph, info);
    btn.addEventListener("click", () => { closePopup(); Game.chooseFaction(String(row.faction_id)); });
    buttons.appendChild(btn);
  }
}

// ---------------- 战后休整弹窗 ----------------

function renderRestPopup(panel, title, body, buttons, payload) {
  panel.classList.add("style-treasure"); title.textContent = "战后休整"; body.textContent = "妖氛既散，山中灵息暂宁。\n你可在此稍作休整——调息养气、淬炼符箓，或敛气径自回山。";
  const makeOption = (main, sub, handler, secondary = false) => { const b = document.createElement("button"); b.className = "popup-btn" + (secondary ? " secondary" : ""); const m = document.createElement("span"); m.textContent = main; const s = document.createElement("span"); s.className = "popup-option-sub"; s.textContent = sub; b.append(m, s); b.addEventListener("click", () => { closePopup(); handler(); }); buttons.appendChild(b); };
  makeOption("调息养气", "饮露调息：下 2 场斗法开局罡气 +15%、圣盾 1 层", () => Game.applyRestChoice("heal"));
  for (const cardId of payload.cardPicks || []) { const lv = getCardBattleLevel(Game.state, cardId); makeOption(`淬炼符箓：${getCardDisplayName(Game.state, cardId)}`, `斗法中等级 Lv.${lv} → Lv.${lv + 1}（永久）`, () => Game.applyRestChoice("upgrade", cardId)); }
  makeOption("敛气而去", "不取分毫，径自回山", () => Game.applyRestChoice("skip"), true);
}

// ---------------- 修行心得三选一 + 升重演出 ----------------

function renderInsightPopup(panel, title, body, buttons, payload) {
  panel.classList.add("style-goal"); title.textContent = payload.title || "修行心得";
  body.textContent = `${payload.body || ""}\n\n——择一缕心得——`;
  for (const choice of payload.choices || []) {
    const btn = document.createElement("button"); btn.className = "popup-btn";
    const main = document.createElement("span"); main.textContent = choice.name;
    const sub = document.createElement("span"); sub.className = "popup-option-sub"; sub.textContent = choice.desc;
    btn.append(main, sub); btn.addEventListener("click", () => { closePopup(); Game.applyInsight(choice.id, payload); });
    buttons.appendChild(btn);
  }
}

function playLevelUpFx(done) {
  const fx = $("tribulation-fx"); const span = fx.querySelector("span"); const oldText = span.textContent;
  fx.classList.add("gold"); span.textContent = "金光灌顶"; fx.classList.remove("hidden"); preludeActive = true;
  setTimeout(() => { fx.classList.add("hidden"); fx.classList.remove("gold"); span.textContent = oldText; preludeActive = false; done(); }, 900);
}

// ---------------- 破劫确认弹窗 ----------------

function renderBreakthroughConfirmPopup(panel, title, body, buttons, breakthroughId) {
  const data = DataManager.getById("breakthrough_table", breakthroughId);
  if (!Object.keys(data).length) { closePopup(); return; }
  panel.classList.add("style-breakthrough");
  const fromRealm = DataManager.getRealm(data.from_realm), toRealm = DataManager.getRealm(data.to_realm);
  title.textContent = `破劫：${getPhaseRealmName(fromRealm)} → ${getPhaseRealmName(toRealm)}`;
  const b = BreakthroughManager.getRateBreakdown(Game.state, data); const pct = (v) => `${Math.round(v * 100)}%`;
  const lore = document.createElement("div"); lore.textContent = data.breakthrough_lore || ""; body.appendChild(lore);
  const failCount = int(Game.state.breakthrough_fail_counts[String(data.breakthrough_id)]);
  const rows = [
    { label: "基础成功率", value: b.base, base: true, hint: "劫数本身的成色" },
    { label: "剧情节点", value: b.storyBonus, hint: "历过榜文碎光/榜文压顶者 +5%" },
    { label: "功德护持", value: b.meritBonus, hint: "功德每满百 +0.5%，有上限" },
    { label: "法宝护身", value: b.treasureBonus, hint: "最高法宝等级 ×2%，上限 12%" },
    { label: "地脉之力", value: b.pulseBonus, hint: "地仙劫且历榜外地脉者 +10%" },
    { label: "失败补偿", value: b.failBonus, hint: `劫火淬体，此劫已败 ${failCount} 次` },
    { label: "先天道体", value: b.raceBonus, hint: "人族跟脚，破劫底子 +3%" },
    { label: "榜文牵引", value: -b.calamityPenalty, sign: "-", hint: "劫气每满百 -0.3%，有上限" },
  ];
  const table = document.createElement("div"); table.className = "rate-table";
  for (const r of rows) {
    const line = document.createElement("div"); line.className = "rate-row" + (r.value < 0 ? " negative" : !r.base && r.value === 0 ? " zero" : "");
    const name = document.createElement("span"); name.textContent = r.label;
    const hint = document.createElement("span"); hint.className = "rate-hint"; hint.textContent = r.hint;
    const value = document.createElement("span"); value.className = "rate-value";
    value.textContent = r.base ? pct(r.value) : `${r.sign || (r.value < 0 ? "-" : "+")}${pct(Math.abs(r.value))}`;
    line.append(name, hint, value); table.appendChild(line);
  }
  body.appendChild(table);
  const total = document.createElement("div"); total.className = "rate-total";
  total.textContent = `总成功率：${pct(b.rate)}（钳制于 ${pct(num(data.min_success_rate))} ~ ${pct(num(data.max_success_rate, 1))}）\n消耗道行：${formatInt(data.required_daoxing)}\n${data.pressure_label || ""}`;
  body.appendChild(total);
  const hint = document.createElement("div"); hint.className = "rate-hint-block";
  hint.textContent = "此劫以斗法论胜负：榜文将显化劫数与你相持。\n以上因果护持会化为你开局的气机罡气；若屡败于此劫，劫火淬体，榜文再难拿你。";
  body.appendChild(hint);
  buttons.appendChild(popupButton("应战劫数", false, () => { closePopup(); playTribulation(() => Game.confirmBreakthrough()); }));
  buttons.appendChild(popupButton("暂缓闭关", true, () => closePopup()));
}

function playTribulation(done) { const fx = $("tribulation-fx"); fx.classList.remove("hidden"); preludeActive = true; setTimeout(() => { fx.classList.add("hidden"); preludeActive = false; done(); }, 1600); }

// ---------------- 功能面板 ----------------

function openPanelSheet(key) {
  const cfg = NAV_UNLOCK[key];
  if (!cfg.check(Game.state)) { Game.queuePopup({ kind: "text", title: "尚未开启", body: `${cfg.hint || "此功能尚未开启"}。`, buttons: [{ label: "知道了" }] }); drainPopupQueue(); return; }
  openPanel = key; renderPanelBody(key); $("panel-layer").classList.remove("hidden");
}

function closePanelSheet() { openPanel = ""; $("panel-layer").classList.add("hidden"); }

function renderPanelBody(key) {
  const titles = { realm: "境界", map: "游历", spell: "术法", treasure: "本命法宝", chance: "机缘", log: "洞府" };
  $("panel-title").textContent = titles[key] || "";
  const body = $("panel-body"); body.innerHTML = "";
  const state = Game.state;
  if (key === "realm") renderRealmPanel(body, state);
  else if (key === "map") renderMapPanel(body, state);
  else if (key === "spell") renderSpellPanel(body, state);
  else if (key === "treasure") renderTreasurePanel(body, state);
  else if (key === "chance") renderChancePanel(body, state);
  else if (key === "log") renderLogPanel(body, state);
}

function note(text) { const div = document.createElement("div"); div.className = "panel-note"; div.textContent = text; return div; }

// 境界面板
function renderRealmPanel(body, state) {
  const realm = RealmManager.getCurrentRealm(state);
  const progress = RealmManager.getProgress(state);
  const raceTag = getRaceShortName(state);
  const faction = getFactionRow(state);
  const rb = state.rebirth || {};
  const rebirthLine = int(rb.count) > 0 ? `\n历世：第${rb.count + 1}世｜道痕 ${int(rb.daohen)}｜宿慧 +${Math.round(int(rb.daohen) * 3 + (rb.races_seen || []).length)}%` : "";
  const factionLine = Object.keys(faction).length ? `势力：${faction.faction_name}（${faction.dojo}）\n护持：${faction.passive_name}——${faction.passive_desc}` : (RealmManager.isCapped(state) ? "势力：尚未入局——你已立身天仙之境，四方皆在等你落子。" : "势力：未入局（立身天仙之境后，须择一方势力）");
  // 真灵上榜：已得神位
  let seatText = "";
  if (state.god_seats?.length) {
    const seatNames = state.god_seats.map((id) => { const s = GOD_SEATS.find((g) => g.id === id); return s ? s.name + "：" + s.desc : ""; });
    seatText = `\n真灵上榜：\n${seatNames.join("\n")}`;
  }
  body.appendChild(note(`${getPhaseRealmName(realm)}｜${raceTag ? `${raceTag}·` : ""}${getTitle(state)}\n寿元：${getRealmLifespan(realm)}\n${factionLine}${rebirthLine}${seatText}\n\n${realm.visual_state || ""}\n\n${realm.lore_text || ""}\n\n道行 ${formatInt(progress.current)} / ${formatInt(progress.required)}　战力 ${formatInt(RealmManager.getCombatPower(state))}`));
  const breakthrough = BreakthroughManager.getAvailable(state);
  if (Object.keys(breakthrough).length) {
    body.appendChild(note(`${breakthrough.pressure_label || "劫将至"}：${breakthrough.breakthrough_lore || ""}`));
    body.appendChild(popupButton(`${breakthrough.display_name}（${Math.round(BreakthroughManager.getSuccessRate(state) * 100)}%）`, false, () => { closePanelSheet(); Game.requestBreakthrough(); }));
  } else if (RealmManager.canLevelUp(state)) {
    body.appendChild(popupButton("道行已满，升重", false, () => { closePanelSheet(); playLevelUpFx(() => Game.levelUp()); }));
  } else if (RealmManager.isCapped(state)) {
    body.appendChild(note(`你已至${getPhaseRealmName(realm)}，当前版本修行暂止。`));
    if (!str(state.faction_id, "")) body.appendChild(popupButton("择势力入局", false, () => { closePanelSheet(); Game._maybeQueueFactionChoice(); drainPopupQueue(); }));
    body.appendChild(popupButton("查看天仙篇预告", false, () => { closePanelSheet(); Game.showCapNotice(); }));
    // 应劫转世
    if (Game.canReincarnate()) {
      const preview = Game.getRebirthPreview();
      body.appendChild(popupButton("应劫转世（凝此生为道痕）", false, () => {
        closePanelSheet();
        Game.queuePopup({
          kind: "text", style: "breakthrough", title: "应劫转世？",
          body: `此生修至${getPhaseRealmName(realm)}。\n\n转世之后：境界、资源、术法、法宝尽数重走；\n此生凝作道痕 +${preview.gain}（共 ${preview.daohenAfter} 点）——每点道痕，来世收益 +3%；\n此生跟脚${preview.raceNew ? "将录入图鉴，来世再添 +1%" : "已入图鉴"}。\n历世记录与操作偏好保留。`,
          buttons: [{ label: "应劫转世", action: "reincarnate" }, { label: "暂不转世" }],
        });
        drainPopupQueue();
      }));
    }
  } else {
    body.appendChild(note(`下一境：${getPhaseRealmName(RealmManager.getNextRealm(state))}\n继续闭关或修行，积累道行。`));
  }
}

// 游历面板
function renderMapPanel(body, state) {
  body.appendChild(popupButton("展开封神山河图", false, () => { closePanelSheet(); WorldMap.open(); }));
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
    const btnBox = document.createElement("div"); btnBox.style.display = "flex"; btnBox.style.flexDirection = "column"; btnBox.style.gap = "6px";
    if (state.current_map_id !== id) { const sb = document.createElement("button"); sb.className = "card-btn"; sb.textContent = "驻留此地"; sb.addEventListener("click", () => Game.selectMap(id)); btnBox.appendChild(sb); }

    const bossId = String(map.boss_id || "");
    const boss = DataManager.getById("boss_table", bossId);
    if (Object.keys(boss).length && UnlockManager.conditionMet(state, String(boss.unlock_condition || ""))) {
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
  }
}

// 术法面板
function renderSpellPanel(body, state) {
  const spells = UnlockManager.getAvailableSpells(state);
  if (!spells.length) { body.appendChild(note("术法尚未开启。炼气士四重可观残符悟法。")); return; }
  body.appendChild(note("真仙之前，你所修仍是术法，不是神通。"));
  // P0-A: 本命流派状态
  const bm = str(state.benming_school, "");
  if (bm) body.appendChild(note(`本命·${SCHOOL_PASSIVES[bm].name}：${SCHOOL_PASSIVES[bm].desc}。非本命流派封顶三阶。`));
  else body.appendChild(note("本命未定。真仙破劫后，于雷/火/剑/魂/劫五道中择一，走到黑。"));
  for (const spell of spells) {
    const id = String(spell.spell_id); const spellState = Game.getSpellState(id);
    const level = int(spellState.level), maxLevel = Game.getSpellMaxLevel(spell), nextLevel = level + 1;
    const cost = nextLevel <= maxLevel ? Game.getSpellUpgradeCost(spell, nextLevel) : null;
    const card = document.createElement("div"); card.className = "card" + (level > 0 ? " selected" : "");
    const img = document.createElement("img"); img.src = SPELL_ICONS[id] || ""; img.alt = "";
    const info = document.createElement("div"); info.className = "card-info";
    const name = document.createElement("div"); name.className = "card-name"; name.textContent = `${spell.spell_name}　${level > 0 ? `${level}重` : "未习得"}`;
    const desc = document.createElement("div"); desc.className = "card-desc"; desc.textContent = spell.lore_text || "";
    const costLine = document.createElement("div"); costLine.className = "card-cost";
    costLine.textContent = cost ? (nextLevel === 1 ? (num(cost.spell_page_cost) + num(cost.mana_cost) === 0 ? "参悟：首门术法，无需材料" : `参悟：残页 ${formatInt(cost.spell_page_cost)}｜法力 ${formatInt(cost.mana_cost)}`) : `升至${nextLevel}重：残页 ${formatInt(cost.spell_page_cost)}｜法力 ${formatInt(cost.mana_cost)}`) : "已至当前境界上限";
      // P0-A: 本命流派封顶
      const spellSchool = String(spell.spell_school || "");
      const schoolCapped = int(spell.tier) >= 4 && !!bm && spellSchool !== bm;
      const schoolLocked = int(spell.tier) >= 4 && !bm;
      if (schoolCapped) costLine.textContent = `非本命流派，封顶三阶（你的本命：${SCHOOL_NAME[bm]}）`;
      else if (schoolLocked) costLine.textContent = "四阶神通，需先定本命流派";
      if (bm && spellSchool === bm) name.textContent += " ★本命";
    info.append(name, desc, costLine);
    const btn = document.createElement("button"); btn.className = "card-btn";
    btn.textContent = level === 0 ? "参悟" : "升重";
      btn.disabled = schoolCapped || schoolLocked || !cost || num(state.resources.spell_page) < num(cost?.spell_page_cost) || num(state.resources.mana) < num(cost?.mana_cost);
    btn.addEventListener("click", () => { Game.upgradeSpell(id); renderPanelBody("spell"); });
    card.append(img, info, btn); body.appendChild(card);
  }
}

// 法宝面板
function renderTreasurePanel(body, state) {
  if (Game.hasPendingTreasureChoice()) { body.appendChild(note("破劫成真人后，你的气机引动三件残宝，静待择主。")); body.appendChild(popupButton("本命法宝择主", false, () => { closePanelSheet(); Game.queuePopup({ kind: "treasure_choice" }); drainPopupQueue(); })); return; }
  const treasures = UnlockManager.getAvailableTreasures(state);
  body.appendChild(note("法宝不是普通装备，而是护道根基。以法宝碎片与法力温养之。"));
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

// 机缘面板
function renderChancePanel(body, state) {
  if (state.pending_event_id) { const ew = Game.getPendingEvent(); body.appendChild(note(`有一段机缘尚未抉择：「${ew.event_name || ""}」`)); body.appendChild(popupButton("查看机缘", false, () => { closePanelSheet(); Game.openPendingEvent(); })); return; }
  body.appendChild(note("天边榜文碎光初现，天地灵机开始动荡。\n闭关、游历、升重、破劫时，都可能遇到机缘。"));
  const observeRow = DataManager.getById("action_table", "observe_seal");
  if (Object.keys(observeRow).length && UnlockManager.conditionMet(state, String(observeRow.unlock_realm))) {
    const avail = ActionManager.getAvailability(state, observeRow);
    body.appendChild(popupButton(avail.ok ? "观榜悟道" : `观榜悟道（${avail.reason}）`, !avail.ok, () => { if (!avail.ok) return; closePanelSheet(); Game.startAction("observe_seal"); }));
  }
  body.appendChild(note(`今日已得机缘 ${Object.values(state.event_counts_today).reduce((a, b) => a + int(b), 0)} 次。机缘随天时流转，明日又是新机。`));
}

// 洞府面板
function renderLogPanel(body, state) {
  body.appendChild(note(`入道第 ${UnlockManager.currentDay(state)} 天`));
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
  } else if (RealmManager.isCapped(state)) {
    body.appendChild(note("地仙之后无散修。你已立身天仙之境，尚未择势力入局。"));
    body.appendChild(popupButton("择势力入局", false, () => { closePanelSheet(); Game._maybeQueueFactionChoice(); drainPopupQueue(); }));
  }

  // 道友区（P1 阵容：上场位管理，最多 3 位）
  const companions = state.companions || {};
  const bonded = Object.keys(companions).filter((id) => companions[id].bonded);
  if (bonded.length) {
    const lineup = Array.isArray(state.lineup) ? state.lineup : [];
    body.appendChild(note(`道友阵容（上场 ${lineup.length}/3）：专属斗法牌只有上场道友才会带入战斗。对着内容选阵容——打火弱点带上哪吒，打榜文残影带上姜子牙。`));
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

  // 丹房区（rq_07 解锁）
  if (Game.isAlchemyUnlocked()) {
    body.appendChild(note("丹房：炉火常明，法力与材料在此化作丹药。"));
    for (const def of PILL_DEFS) {
      const pillCard = document.createElement("div"); pillCard.className = "card";
      const pInfo = document.createElement("div"); pInfo.className = "card-info";
      const pName = document.createElement("div"); pName.className = "card-name"; pName.textContent = `${def.name}——${def.desc}`;
      const costLine = document.createElement("div"); costLine.className = "card-cost";
      costLine.textContent = `耗：${Object.keys(def.cost).map((rid) => { const rn = DataManager.getById("resource_table", rid).resource_name || rid; return `${rn} ${formatInt(def.cost[rid])}`; }).join("，")}｜${def.effectText(Game.state)}`;
      pInfo.append(pName, costLine);
      const craftBtn = document.createElement("button"); craftBtn.className = "card-btn";
      craftBtn.textContent = def.id === "due" ? "开炉" : def.id === "peiyuan" ? "服用" : "炼化";
      const canAfford = Object.keys(def.cost).every((rid) => num(Game.state.resources[rid]) >= num(def.cost[rid]));
      craftBtn.disabled = !canAfford;
      craftBtn.addEventListener("click", () => { Game.brewPill(def.id); renderPanelBody("log"); });
      pillCard.append(pInfo, craftBtn); body.appendChild(pillCard);
    }
  }

  // 历世录
  const rb = state.rebirth || {};
  if (int(rb.count) > 0) {
    body.appendChild(note(`历世录（${rb.count} 世）：`));
    for (const line of rb.log || []) { const d = document.createElement("div"); d.className = "log-line"; d.textContent = line; body.appendChild(d); }
  }

  if (!state.logs.length) body.appendChild(note("修行日志空空如也。"));
  for (const line of state.logs) { const d = document.createElement("div"); d.className = "log-line"; d.textContent = line; body.appendChild(d); }
  body.appendChild(popupButton("重入轮回（清空存档）", true, () => { if (confirm("确定要重入轮回？当前修行进度将全部清空。")) { closePanelSheet(); Game.resetSave(); } }));
}

// ---------------- 启动 ----------------

async function boot() {
  await DataManager.loadAll();
  $("main-btn").addEventListener("click", onMainButtonClick);
  $("auto-toggle").addEventListener("click", () => Game.toggleAutoRepeat());
  document.querySelectorAll(".nav-btn").forEach((btn) => btn.addEventListener("click", () => openPanelSheet(btn.dataset.panel)));
  $("panel-close").addEventListener("click", closePanelSheet);
  $("panel-layer").addEventListener("click", (e) => { if (e.target === $("panel-layer")) closePanelSheet(); });
  $("world-scroll-btn").addEventListener("click", () => WorldScroll.open());
  $("game-title").addEventListener("click", () => WorldScroll.open());
  $("world-scroll-close").addEventListener("click", () => WorldScroll.close());
  $("world-scroll-layer").addEventListener("click", (e) => { if (e.target === $("world-scroll-layer")) WorldScroll.close(); });
  $("world-map-btn").addEventListener("click", () => WorldMap.open());
  $("world-map-close").addEventListener("click", () => WorldMap.close());
  $("world-map-layer").addEventListener("click", (e) => { if (e.target === $("world-map-layer")) WorldMap.close(); });
  Game.onChange = render;
  Game.init();
  if (Game.debug) { $("debug-bar").classList.remove("hidden"); $("debug-ff").addEventListener("click", () => Game.fastForward(360)); $("debug-res").addEventListener("click", () => Game.debugAddResources()); }
  setInterval(() => Game.tick(), 250);
}

boot();
