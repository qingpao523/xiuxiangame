/* 封神修道录 · UI — 渲染、弹窗、面板、启动 */

"use strict";

// 存档变更追踪
window.SAVE_REV = 0;
const _origSave = SaveManager.save.bind(SaveManager);
SaveManager.save = (state) => { window.SAVE_REV++; _origSave(state); };

// ---------------- 运行时状态 ----------------

let sparkleEl = null, nextSparkleAt = 0, nextInsightAt = 0, insightShowing = false;
let currentPopup = null, preludeActive = false, openPanel = "", lastRev = -1;
let sparkleCombo = 0, battleTimer = null;
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
  const threads = GoalManager.getChapterThreads(state);
  if (threads.chapter) {
    const openThreads = threads.list.filter((t) => t.status === "open");
    const first = openThreads[0];
    $("goal-text").textContent = threads.chapterName;
    $("goal-reward").textContent = (first ? `可循：${first.goal.goal_name} ｜ ` : "") + `手札共 ${openThreads.length} 线（洞府查看）`;
  } else {
    $("goal-text").textContent = "卷三已尽·等待天仙篇";
    $("goal-reward").textContent = "可继续：骷髅山边界游历，收集祭炼材料";
  }
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
      if (key === "spell" && (hasAffordableSpell(state) || hasAffordableSkill(state))) need = true;
      if (key === "treasure" && (Game.hasPendingTreasureChoice() || hasAffordableTreasure(state))) need = true;
      if (key === "map" && hasChallengeableBoss(state)) need = true;
    }
    btn.classList.toggle("attention", need);
    if (need && !dot) { dot = document.createElement("span"); dot.className = "red-dot"; btn.appendChild(dot); }
    else if (!need && dot) dot.remove();
  });
}

function hasAffordableSpell(state) { return UnlockManager.getAvailableSpells(state).some((spell) => { const level = int(Game.getSpellState(String(spell.spell_id)).level), nextLevel = level + 1; if (nextLevel > Game.getSpellMaxLevel(spell)) return false; const cost = Game.getSpellUpgradeCost(spell, nextLevel); return cost && num(state.resources.spell_page) >= num(cost.spell_page_cost) && num(state.resources.mana) >= num(cost.mana_cost); }); }
function hasAffordableSkill(state) { const unlocked = state.unlocked_skills || []; return UnlockManager.getAvailableSkills(state).some((skill) => { const id = String(skill.id); if (!unlocked.includes(id)) return false; const level = Math.max(1, Game.getSkillLevel(id)), nextLevel = level + 1; if (nextLevel > Game.getSkillMaxLevel(skill)) return false; const cost = Game.getSkillUpgradeCost(skill, nextLevel); return cost && num(state.resources.spell_page) >= num(cost.spell_page_cost) && num(state.resources.mana) >= num(cost.mana_cost); }); }
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
  else if (popup.kind === "battle_v2") { title.textContent = "斗法"; BattleUIV2.renderBattlePopup(panel, popup.battle, Game.state); }
  else if (popup.kind === "slot_config") { title.textContent = "斗法栏·配招"; BattleUIV2.renderSlotConfig(body, Game.state, () => { closePopup(); }, { tutorial: !!popup.tutorial }); }
  else if (popup.kind === "treasure_choice") renderTreasureChoicePopup(panel, title, body, buttons);
  else if (popup.kind === "race_choice") renderRaceChoicePopup(panel, title, body, buttons);
  else if (popup.kind === "benming_choice") renderBenmingChoicePopup(panel, title, body, buttons);
  else if (popup.kind === "faction_choice") renderFactionChoicePopup(panel, title, body, buttons);
  else if (popup.kind === "breakthrough_confirm") renderBreakthroughConfirmPopup(panel, title, body, buttons, popup.breakthroughId);
  else if (popup.kind === "rest") renderRestPopup(panel, title, body, buttons, popup.payload || {});
  else if (popup.kind === "insight") renderInsightPopup(panel, title, body, buttons, popup.payload || {});
  else if (popup.kind === "audio_settings") { title.textContent = "声音设置"; renderAudioSettings(panel, body, buttons); }
}

function closePopup() { currentPopup = null; $("popup-layer").classList.add("hidden"); drainPopupQueue(); render(); }

function popupButton(label, secondary, handler, extraClass = "") {
  const btn = document.createElement("button");
  btn.className = `popup-btn${secondary ? " secondary" : ""}${extraClass ? " " + extraClass : ""}`;
  btn.textContent = label; btn.addEventListener("click", handler);
  return btn;
}

// ---------------- 声音设置弹窗 ----------------
function renderAudioSettings(panel, body, buttons) {
  const S = AudioManager.settings;
  const persist = () => { AudioManager.writeSettings(Game.state); SaveManager.save(Game.state); };

  const row = document.createElement("div"); row.className = "audio-row";
  const mkSlider = (label, key, setter) => {
    const wrap = document.createElement("div"); wrap.className = "audio-slider";
    const lab = document.createElement("label"); lab.textContent = label;
    const val = document.createElement("span"); val.className = "audio-val";
    val.textContent = Math.round(num(S[key], 0) * 100);
    const input = document.createElement("input");
    input.type = "range"; input.min = "0"; input.max = "100"; input.step = "1";
    input.value = String(Math.round(num(S[key], 0) * 100));
    input.addEventListener("input", () => {
      const v = int(input.value, 0) / 100;
      setter(v); val.textContent = input.value; persist();
    });
    lab.appendChild(val); wrap.appendChild(lab); wrap.appendChild(input);
    return wrap;
  };

  row.appendChild(mkSlider("主音量", "master", (v) => AudioManager.setMasterVolume(v)));
  row.appendChild(mkSlider("音效", "sfx", (v) => AudioManager.setSfxVolume(v)));
  row.appendChild(mkSlider("环境音", "ambient", (v) => AudioManager.setAmbientVolume(v)));
  row.appendChild(mkSlider("音乐", "music", (v) => AudioManager.setMusicVolume(v)));
  body.appendChild(row);

  const muteRow = document.createElement("div"); muteRow.className = "audio-mute";
  const mute = document.createElement("label"); mute.className = "audio-mute-label";
  const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = !!S.muted;
  cb.addEventListener("change", () => { AudioManager.setMuted(cb.checked); persist(); });
  mute.appendChild(cb); mute.appendChild(document.createTextNode("静音"));
  muteRow.appendChild(mute);
  const testBtn = document.createElement("button"); testBtn.className = "popup-btn secondary audio-test";
  testBtn.textContent = "试听"; testBtn.addEventListener("click", () => AudioManager.playSfx("ui_click"));
  muteRow.appendChild(testBtn);
  body.appendChild(muteRow);

  if (AudioManager.reducedMotion) {
    const note = document.createElement("div"); note.className = "audio-note";
    note.textContent = "检测到「减弱动效」偏好：环境音的周期闪烁（滴水/雷声/阴火）已自动关闭，仅保留稳定音床。";
    body.appendChild(note);
  }
  if (!AudioManager.isReady()) {
    const note = document.createElement("div"); note.className = "audio-note";
    note.textContent = "音频引擎将在你首次点击/按键后启动（浏览器自动播放策略）。";
    body.appendChild(note);
  }

  buttons.appendChild(popupButton("完成", false, () => closePopup()));
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

// ---------------- 机缘事件弹窗 ----------------

function renderEventPopup(panel, title, body, buttons) {
  const eventRow = Game.getPendingEvent();
  if (!Object.keys(eventRow).length) { closePopup(); return; }
  panel.classList.add("style-chance"); title.textContent = `机缘触发：${eventRow.event_name || ""}`;
  const tag = eventRow.fengshen_tag ? `封神锚点：${eventRow.fengshen_tag}\n\n` : "";
  body.textContent = `${tag}${eventRow.narrative_text || eventRow.body || ""}`;
  const isChoice = eventRow.merit_or_calamity === "choice";
  const evOptions = eventRow.options || eventRow.choices || [];
  evOptions.forEach((option, index) => {
    const btn = document.createElement("button"); btn.className = "popup-btn" + (isChoice ? (index === 0 ? " merit" : " calamity") : "");
    btn.innerHTML = "<span>" + (option.text || option.label || "选择") + '</span><span class="popup-option-sub">' + describeEventReward(option) + "</span>";
    btn.addEventListener("click", () => { closePopup(); Game.chooseEventOption(index); });
    buttons.appendChild(btn);
  });
}

function describeEventReward(option) {
  const parts = []; const reward = option.reward || option.result || {};
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
  body.textContent = "巫妖大战落幕，人族初兴，三界秩序未稳。\n投胎灵光将落未落之际——你先想清楚，这一世做什么生灵。";
  const rb = Game.state.rebirth || {};
  const rows = DataManager.getRows("race_table");
  const openRows = rows.filter((r) => r.open === true);
  const lockedRows = rows.filter((r) => r.open !== true);
  const PROFILE_LABELS = [
    ["growth", "成长方向"],
    ["early", "前期体验"],
    ["ceiling", "后期天花板"],
  ];
  let picked = null;

  // 命运确认按钮（二步确认：先点种族选中，再点此确认，强化不可逆仪式感）
  const confirmBtn = document.createElement("button");
  confirmBtn.className = "popup-btn race-confirm-btn";
  confirmBtn.style.display = "none";
  confirmBtn.addEventListener("click", () => {
    if (!picked) return;
    closePopup();
    Game.chooseRace(String(picked));
  });
  buttons.appendChild(confirmBtn);

  for (const row of openRows) {
    const btn = document.createElement("button"); btn.className = "popup-btn treasure-pick choice-pick";
    const glyph = document.createElement("span"); glyph.className = "choice-glyph"; glyph.textContent = row.glyph || "命";
    const info = document.createElement("span"); info.className = "choice-info";
    const name = document.createElement("span"); name.className = "choice-name";
    const seen = rb.races_seen?.includes(String(row.race_id));
    name.textContent = `${row.race_name}｜天赋·${row.talent_name}${seen ? "（前世）" : ""}`;
    const sub = document.createElement("span");
    sub.className = "popup-option-sub";
    sub.textContent = `${row.card_desc}\n${row.effect_desc}`;
    info.append(name, sub);
    // 决策依据三行（成长方向/前期体验/后期天花板）——预留结构，详细差异待数值定稿后填充
    if (row.profile) {
      const prof = document.createElement("div"); prof.className = "race-profile";
      for (const [key, label] of PROFILE_LABELS) {
        if (!row.profile[key]) continue;
        const line = document.createElement("div"); line.className = "race-profile-line";
        const lab = document.createElement("span"); lab.className = "race-profile-label"; lab.textContent = label;
        const val = document.createElement("span"); val.className = "race-profile-value"; val.textContent = row.profile[key];
        line.append(lab, val); prof.appendChild(line);
      }
      info.appendChild(prof);
    }
    btn.append(glyph, info);
    btn.addEventListener("click", () => {
      picked = row.race_id;
      buttons.querySelectorAll(".choice-pick").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      confirmBtn.style.display = "";
      confirmBtn.textContent = `立此为命：${row.short_name || row.race_name} —— 此念既定，道途不再回头`;
    });
    buttons.appendChild(btn);
  }

  // 未开放种族：折叠为一条剪影带，不再逐个占半屏
  if (lockedRows.length) {
    const strip = document.createElement("div"); strip.className = "race-locked-strip";
    const glyphs = document.createElement("span"); glyphs.className = "race-locked-glyphs";
    glyphs.textContent = lockedRows.map((r) => r.glyph || "？").join(" ");
    const hint = document.createElement("span"); hint.className = "race-locked-hint";
    hint.textContent = `${lockedRows.length} 方跟脚尚未觉醒 · 未开放`;
    strip.append(glyphs, hint);
    buttons.appendChild(strip);
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

// ---------------- 势力完整独有系统 UI（design/7.2 v0.2）----------------

function _resName(rid) { const r = DataManager.getById("resource_table", rid); return (r && r.resource_name) ? r.resource_name : rid; }
function _costText(cost) { return Object.keys(cost || {}).map((rid) => `${_resName(rid)} ${formatInt(num(cost[rid]))}`).join("，"); }
function _canAfford(state, cost) { return Object.keys(cost || {}).every((rid) => num(state.resources[rid]) >= num(cost[rid])); }
function _factionSysHeader(body, title, desc) {
  const h = document.createElement("div"); h.className = "card faction-sys-header";
  const t = document.createElement("div"); t.className = "card-name"; t.textContent = title;
  const d = document.createElement("div"); d.className = "card-desc"; d.textContent = desc;
  h.append(t, d); body.appendChild(h);
}

function renderFactionSystem(body, state) {
  const fid = str(state.faction_id, "");
  if (fid === "chan") renderChanSynth(body, state);
  else if (fid === "jie") renderJieArray(body, state);
  else if (fid === "tianting") renderTiantingEdict(body, state);
  else if (fid === "wuzhuang") renderWuzhuangFeast(body, state);
}

// 阐教·玉虚炼器：配方列表 → 开炉（火候时机条）→ 品质定产出法宝品级
function renderChanSynth(body, state) {
  const craftBoost = Game.hasDivinationBoost("craft_boost");
  _factionSysHeader(body, "玉虚炼器（合成）",
    "以法宝碎片为骨、法力为魂，炉火纯青处合成高阶法宝。火候停在中段得上品——上品初成 3 重、中品 2 重、下品 1 重；已炼成则淬炼 +1 重。合成法宝入法宝之列，可继续温养。" + (craftBoost ? "（今日占卜得签，火候易得。）" : ""));
  const recipes = Game.getSynthRecipes();
  if (!recipes.length) { body.appendChild(note("尚无可用配方（提升境界以解锁更多炼器之法）。")); return; }
  for (const r of recipes) {
    const out = DataManager.getById("treasure_table", String(r.output_treasure));
    const tState = Game.getTreasureState(String(r.output_treasure));
    const owned = int(tState.level) > 0;
    const card = document.createElement("div"); card.className = "card";
    const info = document.createElement("div"); info.className = "card-info";
    const name = document.createElement("div"); name.className = "card-name";
    name.textContent = `${r.recipe_name} → ${out.treasure_name || r.output_treasure}${owned ? `（已炼成 ${int(tState.level)} 重）` : ""}`;
    const desc = document.createElement("div"); desc.className = "card-desc"; desc.textContent = r.intro || "";
    const cost = document.createElement("div"); cost.className = "card-cost";
    cost.textContent = `耗：${_costText(r.cost)}｜产出：${out.treasure_name || ""}（${out.main_effect || "高阶法宝"}）`;
    info.append(name, desc, cost);
    const btn = document.createElement("button"); btn.className = "card-btn";
    btn.textContent = owned ? "淬炼" : "开炉";
    const chk = Game.canCraftSynth(String(r.recipe_id));
    btn.disabled = !chk.ok;
    btn.addEventListener("click", () => {
      CraftMinigame.open({ title: `玉虚炼器·${r.recipe_name}`, prompt: "看准火候，停在中段得上品", boost: craftBoost }, (quality) => {
        Game.craftSynthFinish(String(r.recipe_id), quality);
        renderPanelBody("log");
      });
    });
    card.append(info, btn); body.appendChild(card);
  }
}

// 截教·万仙阵法：阵法卡（学习 / 温养升级 / 携带入栏），斗法首回合敌方全体受伤加成
function renderJieArray(body, state) {
  const slots = Game.arraySlots();
  const equipped = state.array_equipped || [];
  const totalBonus = Game.getArrayFirstRoundBonus(state);
  _factionSysHeader(body, "万仙阵法（阵法卡）",
    `悟阵耗功德与劫气，可携入阵法栏（${equipped.length}/${slots} 位）。携入之阵于斗法首回合使敌方全体受伤加成${totalBonus > 0 ? `（当前 +${Math.round(totalBonus * 100)}%）` : ""}。地仙（zr_06）后阵法栏 +1。`);
  const cards = Game.getArrayCards();
  if (!cards.length) { body.appendChild(note("尚无可用阵法卡（提升境界以解锁更多大阵）。")); return; }
  for (const c of cards) {
    const lv = Game.arrayCardLevel(String(c.card_id));
    const learned = lv > 0;
    const isEq = equipped.includes(String(c.card_id));
    const card = document.createElement("div"); card.className = "card" + (isEq ? " selected" : "");
    const info = document.createElement("div"); info.className = "card-info";
    const name = document.createElement("div"); name.className = "card-name";
    name.textContent = `${c.card_name}${learned ? `（${lv} 级·受伤 +${Math.round(Game.arrayCardBonus(c, lv) * 100)}%）` : ""}${isEq ? " ★携行" : ""}`;
    const desc = document.createElement("div"); desc.className = "card-desc"; desc.textContent = c.desc || "";
    const cost = document.createElement("div"); cost.className = "card-cost";
    cost.textContent = learned
      ? (lv >= int(c.max_level, 5) ? "已悟至极" : `温养耗：${_costText(c.upgrade_cost)}`)
      : `悟阵耗：${_costText(c.learn_cost)}`;
    info.append(name, desc, cost);
    const btnWrap = document.createElement("div"); btnWrap.className = "card-btn-col";
    if (!learned) {
      const b = document.createElement("button"); b.className = "card-btn"; b.textContent = "悟阵";
      b.disabled = !_canAfford(state, c.learn_cost);
      b.addEventListener("click", () => { Game.learnArrayCard(String(c.card_id)); renderPanelBody("log"); });
      btnWrap.appendChild(b);
    } else {
      const up = document.createElement("button"); up.className = "card-btn"; up.textContent = "温养";
      up.disabled = lv >= int(c.max_level, 5) || !_canAfford(state, c.upgrade_cost);
      up.addEventListener("click", () => { Game.upgradeArrayCard(String(c.card_id)); renderPanelBody("log"); });
      const eq = document.createElement("button"); eq.className = "card-btn"; eq.textContent = isEq ? "撤下" : "携行";
      eq.addEventListener("click", () => { Game.toggleArrayEquip(String(c.card_id)); renderPanelBody("log"); });
      btnWrap.append(up, eq);
    }
    card.append(info, btnWrap); body.appendChild(card);
  }
}

// 天庭·功德敕令：每日领敕入库（上限 3）→ 发敕指定行动 → 该行动下一次收益 ×2
function renderTiantingEdict(body, state) {
  const count = int(state.edict_count);
  const target = state.edict_target ? EDICT_TARGETS.find((t) => t.scope === state.edict_target) : null;
  _factionSysHeader(body, "功德敕令（库存）",
    `每日可领一道敕令入库（存 ${count}/${EDICT_MAX} 道）。发敕指定一项行动，其下一次收益 ×2。${target ? `当前敕令所指：「${target.name}」。` : "尚未发敕。"}`);
  const claimCard = document.createElement("div"); claimCard.className = "card";
  const cInfo = document.createElement("div"); cInfo.className = "card-info";
  const cName = document.createElement("div"); cName.className = "card-name"; cName.textContent = "领敕令";
  const cDesc = document.createElement("div"); cDesc.className = "card-desc";
  const claimedToday = str(state.edict_last_claim, "") === todayString();
  cDesc.textContent = claimedToday ? "今日已领，明日再来。" : "领一道天庭敕令入库。";
  cInfo.append(cName, cDesc);
  const cBtn = document.createElement("button"); cBtn.className = "card-btn"; cBtn.textContent = "领敕";
  cBtn.disabled = claimedToday || count >= EDICT_MAX;
  cBtn.addEventListener("click", () => { Game.edictClaim(); renderPanelBody("log"); });
  claimCard.append(cInfo, cBtn); body.appendChild(claimCard);
  body.appendChild(note("发敕令：指定下一项行动，收益 ×2（同时只能指定一项；新发敕令会替换旧指定）。"));
  for (const t of EDICT_TARGETS) {
    const card = document.createElement("div"); card.className = "card" + (target && target.scope === t.scope ? " selected" : "");
    const info = document.createElement("div"); info.className = "card-info";
    const name = document.createElement("div"); name.className = "card-name";
    name.textContent = `敕令·${t.name}${target && target.scope === t.scope ? " ★已指定" : ""}`;
    const desc = document.createElement("div"); desc.className = "card-desc"; desc.textContent = t.desc;
    info.append(name, desc);
    const btn = document.createElement("button"); btn.className = "card-btn"; btn.textContent = "发敕";
    btn.disabled = count <= 0;
    btn.addEventListener("click", () => { Game.edictDesignate(t.scope); renderPanelBody("log"); });
    card.append(info, btn); body.appendChild(card);
  }
}

// 五庄观·人参果会：每周赴会全属性 +10% 持续 1 天，果会期间炼丹产出 ×2
function renderWuzhuangFeast(body, state) {
  const now = nowUnix();
  const active = Game.factionBuffActive("feast");
  const alchemy = Game.feastAlchemyActive(state);
  _factionSysHeader(body, "人参果会（果会 + 炼丹）",
    "七日一开果会，赴会则全属性 +10% 持续 1 天；果会余韵期间，炼丹产出 ×2。" + (active ? "（果会余韵中）" : "") + (alchemy ? "（炼丹 ×2 生效中）" : ""));
  const card = document.createElement("div"); card.className = "card";
  const info = document.createElement("div"); info.className = "card-info";
  const name = document.createElement("div"); name.className = "card-name"; name.textContent = "赴人参果会";
  const desc = document.createElement("div"); desc.className = "card-desc";
  const cd = int(state.faction_feast_cooldown);
  if (active) desc.textContent = "果会余韵犹在，七日后再赴。";
  else if (cd > now) desc.textContent = `果会七日一开，距下次约 ${Math.ceil((cd - now) / 86400)} 天。`;
  else desc.textContent = "果会已开，可赴。";
  info.append(name, desc);
  const btn = document.createElement("button"); btn.className = "card-btn"; btn.textContent = "赴会";
  btn.disabled = active || cd > now;
  btn.addEventListener("click", () => { Game.factionFeast(); renderPanelBody("log"); });
  card.append(info, btn); body.appendChild(card);
  body.appendChild(note("炼丹产出 ×2 仅在果会余韵（赴会后 1 天）内生效；可于丹房炼丹时享用。"));
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

// 术法面板
function renderSpellPanel(body, state) {
  // ===== 斗法栏·配招入口 =====
  const v2box = document.createElement("div"); v2box.className = "card v2-entry";
  const v2title = document.createElement("div"); v2title.className = "card-name";
  v2title.textContent = "斗法栏·连锁制";
  const v2desc = document.createElement("div"); v2desc.className = "card-desc";
  v2desc.textContent = "配招5分钟，斗法全自动。同系相邻触发共鸣×1.3，三连触发终极神通。";
  const v2btns = document.createElement("div"); v2btns.className = "v2-btns";
  const cfgBtn = document.createElement("button"); cfgBtn.className = "card-btn";
  cfgBtn.textContent = "配置斗法栏";
  cfgBtn.addEventListener("click", () => { closePanelSheet(); Game.openSlotConfig(); drainPopupQueue(); });
  v2btns.append(cfgBtn);
  v2box.append(v2title, v2desc, v2btns);
  body.appendChild(v2box);

  // ===== 练气术法（V2 skill_table，30术法六系） =====
  renderSkillV2Section(body, state);

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

// 练气术法V2：30术法六系，按系分组，境界到了即悟得，可升重
const SKILL_TYPE_LABEL = { body: "体", thunder: "雷", fire: "火", weapon: "器", soul: "魂", calamity: "劫" };
const SKILL_TYPE_ORDER = ["body", "thunder", "fire", "weapon", "soul", "calamity"];
const RARITY_LABEL = { common: "凡", uncommon: "灵", rare: "玄" };
function skillIcon(id, spellType) {
  if (SPELL_ICONS[id]) return SPELL_ICONS[id];
  const legacy = "spell_" + spellType + "_01";
  return SPELL_ICONS[legacy] || "";
}
function renderSkillV2Section(body, state) {
  const available = UnlockManager.getAvailableSkills(state);
  const unlocked = state.unlocked_skills || [];
  body.appendChild(note("练气唯术法，无法宝、无神通、无势力。境界到了即悟得，残页与法力可升重。种族之别，仅在被动加成。"));
  for (const type of SKILL_TYPE_ORDER) {
    const rows = available.filter((r) => str(r.spell_type, "") === type);
    if (!rows.length) continue;
    const header = document.createElement("div"); header.className = "card-name v2-skill-header";
    header.textContent = "【" + (SKILL_TYPE_LABEL[type] || type) + "系】";
    body.appendChild(header);
    for (const skill of rows) {
      const id = String(skill.id);
      const isUnlocked = unlocked.includes(id);
      const level = Math.max(isUnlocked ? 1 : 0, Game.getSkillLevel(id));
      const maxLevel = Game.getSkillMaxLevel(skill);
      const nextLevel = level + 1;
      const cost = isUnlocked && nextLevel <= maxLevel ? Game.getSkillUpgradeCost(skill, nextLevel) : null;
      const card = document.createElement("div"); card.className = "card" + (level > 0 ? " selected" : "");
      const img = document.createElement("img"); img.src = skillIcon(id, str(skill.spell_type, "")); img.alt = "";
      const info = document.createElement("div"); info.className = "card-info";
      const name = document.createElement("div"); name.className = "card-name";
      name.textContent = skill.name + " " + (RARITY_LABEL[str(skill.rarity, "common")] || "") + " " + (level > 0 ? level + "重" : "未悟");
      const desc = document.createElement("div"); desc.className = "card-desc";
      desc.textContent = (skill.lore_text || "") + (skill.source_chapter ? "（" + skill.source_chapter + "）" : "");
      const dmgLine = document.createElement("div"); dmgLine.className = "card-cost";
      const lv = Math.max(1, level);
      dmgLine.textContent = "威力 " + (num(skill.damage_base) + num(skill.damage_growth) * (lv - 1)) + "（每重+" + num(skill.damage_growth) + "）";
      const costLine = document.createElement("div"); costLine.className = "card-cost";
      if (!isUnlocked) costLine.textContent = "未至参悟境界";
      else costLine.textContent = cost ? "升至" + nextLevel + "重：残页 " + formatInt(cost.spell_page_cost) + "｜法力 " + formatInt(cost.mana_cost) : "已至圆满";
      info.append(name, desc, dmgLine, costLine);
      const btn = document.createElement("button"); btn.className = "card-btn";
      btn.textContent = "升重";
      btn.disabled = !cost || num(state.resources.spell_page) < num(cost.spell_page_cost) || num(state.resources.mana) < num(cost.mana_cost);
      btn.addEventListener("click", () => { Game.upgradeSkill(id); renderPanelBody("spell"); });
      card.append(img, info, btn); body.appendChild(card);
    }
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
    const audioBtn = $("audio-settings-btn");
    if (audioBtn) audioBtn.addEventListener("click", () => { if (typeof AudioManager !== "undefined") AudioManager.playSfx("ui_click"); Game.queuePopup({ kind: "audio_settings" }); drainPopupQueue(); });
  Game.onChange = render;
  Game.init();
  if (Game.debug) { $("debug-bar").classList.remove("hidden"); $("debug-ff").addEventListener("click", () => Game.fastForward(360)); $("debug-res").addEventListener("click", () => Game.debugAddResources()); }
  setInterval(() => Game.tick(), 250);
}

boot();
