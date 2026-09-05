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
  const mapBg = (typeof MAP_BACKGROUNDS !== "undefined" && state.current_map_id) ? MAP_BACKGROUNDS[state.current_map_id] : null;
  $("bg").style.backgroundImage = `url("${mapBg || BACKGROUND_PATHS[ui.background_phase] || BACKGROUND_PATHS.mountain_cave}")`;
  $("fx-seal").classList.toggle("lit", DataManager.isRealmAtLeast(state.realm_id, "rq_06"));
  // B-诊断修复：src 未变时不重设（no-store 下每次 render 都会真实重拉图片）
  const charPath = getCharacterPath(state);
  if ($("char-img").getAttribute("src") !== charPath) $("char-img").src = charPath;
  const raceTag = getRaceShortName(state);
  $(".ui-identity").textContent = `${getPhaseRealmName(realm)}｜${raceTag ? `${raceTag}·` : ""}${getTitle(state)}｜战力 ${formatInt(RealmManager.getCombatPower(state))}`;
  const _calTier = getCalamityPressureTier(state);
  $(".ui-weather").textContent = `天象：${getWeather(state)}${_calTier.level >= 25 ? `｜杀劫·${_calTier.label}` : ""}`;
  const omen = getTodayOmen();
  $(".ui-omen").textContent = `今日异象：${omen.name}——${omen.desc}`;
  const pressure = WorldScroll.getSealPressure(state);
  $(".ui-seal-fill").style.width = `${pressure.value}%`;
  $(".ui-seal-state").textContent = pressure.label;
  $(".ui-seal").title = pressure.tip;
  $(".ui-seal").dataset.level = pressure.value >= 75 ? "high" : pressure.value >= 55 ? "mid" : "low";
  const orb = $("treasure-orb");
  if (state.first_treasure_id) {
    orb.classList.remove("hidden");
    if (!orb.dataset.tid || orb.dataset.tid !== state.first_treasure_id) {
      orb.dataset.tid = state.first_treasure_id; orb.innerHTML = "";
      const img = document.createElement("img"); img.src = TREASURE_ICONS[state.first_treasure_id] || ""; img.alt = ""; orb.appendChild(img);
    }
  } else { orb.classList.add("hidden"); }
  const threads = GoalManager.getChapterThreads(state);
  const goalText = $(".ui-goal-text");
  const goalReward = $(".ui-goal-reward");
  if (goalText && goalReward) {
    if (threads.chapter) {
      const openThreads = threads.list.filter((t) => t.status === "open");
      const first = openThreads[0];
      goalText.textContent = threads.chapterName;
      goalReward.textContent = (first ? `可循：${first.goal.goal_name} ｜ ` : "") + `手札共 ${openThreads.length} 线（洞府查看）`;
    } else {
      goalText.textContent = "卷三已尽·等待天仙篇";
      goalReward.textContent = "可继续：骷髅山边界游历，收集祭炼材料";
    }
  }
  const progress = RealmManager.getProgress(state);
  $(".ui-dao-fill").style.width = `${Math.round(progress.ratio * 100)}%`;
  $(".ui-dao-label").textContent = `道行 ${formatInt(progress.current)} / ${formatInt(progress.required)}`;
  if (!insightShowing) { $(".ui-status").classList.remove("insight"); $(".ui-status").textContent = state.logs[0] ? state.logs[0].replace(/^\[\d+:\d+\]\s*/, "") : ""; }
  renderToast();
  renderMainButton(state); renderNav(state);
  const autoBtn = document.querySelector(".ui-autotoggle"); const autoOn = !!state.flags.auto_repeat;
  autoBtn.textContent = `连续修行：${autoOn ? "开" : "关"}`; autoBtn.classList.toggle("on", autoOn);
  if (window.SAVE_REV !== lastRev) { lastRev = window.SAVE_REV; renderResources(state); if (openPanel) renderPanelBody(openPanel); }
  drainPopupQueue();
}

function renderToast() {
  const msg = Game.toastMessage;
  const el = $(".ui-action-toast");
  if (!el || !msg || msg.id === toastShownId) return;
  toastShownId = msg.id;
  el.innerHTML = "";
  el.className = "action-toast kind-" + (msg.kind || "plain");
  const title = document.createElement("div");
  title.className = "action-toast-title";
  title.textContent = msg.title || "";
  const body = document.createElement("div");
  body.className = "action-toast-body";
  body.textContent = msg.body || "";
  el.append(title, body);
  el.classList.remove("hidden");
  if (msg.kind === "world") {
    const fx = $("fx-seal");
    if (fx) { fx.classList.add("lit", "burst"); setTimeout(() => fx.classList.remove("burst"), 1600); }
  }
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), int(msg.duration, 2400));
}

function renderResources(state) {
  const strip = $(".ui-resources"); strip.innerHTML = "";
  const rows = UnlockManager.getVisibleResources(state);
  strip.dataset.count = String(rows.length);
  for (const row of rows) {
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
  const btn = document.querySelector(".ui-mainbtn"), label = $(".ui-mainbtn-label"), bar = $(".ui-mainbtn-progress"), stage = $(".ui-stage");
  if (main.type === "acting") {
    const action = state.current_action, row = main.row || {};
    const total = num(action.end_time_ms) - num(action.start_time_ms || action.end_time_ms - 1000);
    const remainMs = Math.max(0, num(action.end_time_ms) - nowMs());
    const ratio = total > 0 ? 1 - remainMs / total : 1;
    bar.style.width = `${Math.round(ratio * 100)}%`;
    label.textContent = `${row.action_name || "修行"}中… ${Math.ceil(remainMs / 1000)}息`;
    btn.classList.add("acting"); btn.classList.remove("ready");
    btn.classList.toggle("beat", Game.isInBeatWindow());
    stage.classList.add("acting");
    tickSparkle(String(row.action_id || "")); tickInsight(String(row.action_id || ""));
  } else {
    bar.style.width = "0%"; label.textContent = main.label;
    btn.classList.remove("acting");
    btn.classList.toggle("ready", main.type === "level_up" || main.type === "breakthrough");
    stage.classList.remove("acting"); clearSparkle();
    if (insightShowing) { insightShowing = false; $(".ui-status").classList.remove("insight"); }
    nextSparkleAt = nowMs() + 2500; nextInsightAt = nowMs() + 2000;
  }
  btn.dataset.type = main.type; btn.dataset.actionId = main.actionId || "";
  renderActionHints(state, main);
}

function renderActionHints(state, main) {
  const box = $(".ui-hints");
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
  const stage = $(".ui-stage");
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
      const ids = Object.keys(gain);
      const parts = [];
      for (const id of ids) { const row = DataManager.getById("resource_table", id); parts.push(`${row.resource_name || id} +${formatInt(gain[id])}`); }
      const numText = `${parts.join("　")}${sparkleCombo > 1 ? `　连拾×${sparkleCombo}` : ""}`;
      const qLine = FeedbackRenderer.line(ids.length > 1 ? "sparkle_multi" : "sparkle_" + ids[0]);
      if (qLine) {
        const q = document.createElement("span"); q.className = "sparkle-qi"; q.textContent = qLine;
        const n = document.createElement("span"); n.className = "sparkle-num"; n.textContent = numText;
        float.appendChild(q); float.appendChild(n);
      } else {
        float.textContent = numText;
      }
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
  const line = FeedbackRenderer.line("insight_" + actionId) || FeedbackRenderer.line("insight_generic");
  if (!line) return;
  const el = $(".ui-status"); el.classList.remove("insight"); void el.offsetWidth;
  el.classList.add("insight"); el.textContent = line;
  insightShowing = true; nextInsightAt = nowMs() + randInt(4500, 6500);
}

// ---------------- 底部导航 ----------------

function renderNav(state) {
  document.querySelectorAll(".ui-navbtn").forEach((btn) => {
    const key = btn.dataset.panel, cfg = NAV_UNLOCK[key], unlocked = cfg.check(state);
    btn.classList.toggle("locked", !unlocked);
    let dot = btn.querySelector(".ui-red-dot");
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

function hasAffordableSpell(state) { return hasAffordableSkill(state); }
function hasAffordableSkill(state) { const unlocked = state.unlocked_skills || []; return UnlockManager.getAvailableSkills(state).some((skill) => { const id = String(skill.id); if (!unlocked.includes(id)) return false; const level = Math.max(1, Game.getSkillLevel(id)), nextLevel = level + 1; if (nextLevel > Game.getSkillMaxLevel(skill)) return false; const cost = Game.getSkillUpgradeCost(skill, nextLevel); return cost && num(state.resources.spell_page) >= num(cost.spell_page_cost) && num(state.resources.mana) >= num(cost.mana_cost); }); }
function hasAffordableTreasure(state) { return UnlockManager.getAvailableTreasures(state).some((treasure) => { const level = int(Game.getTreasureState(String(treasure.treasure_id)).level), nextLevel = level + 1; if (nextLevel > int(treasure.max_level_mvp, 5)) return false; const cost = Game.getTreasureUpgradeCost(treasure, nextLevel); return cost && num(state.resources.treasure_shard) >= num(cost.treasure_shard_cost) && num(state.resources.mana) >= num(cost.mana_cost); }); }
function hasChallengeableBoss(state) { return BossManager.getBosses(state).some((boss) => BossManager.canChallenge(state, String(boss.boss_id)) && BossManager.getWinRate(state, boss) >= 0.5); }

// ---------------- 主按钮点击 ----------------

function onMainButtonClick() {
  if (preludeActive) return;
  const btn = document.querySelector(".ui-mainbtn"), type = btn.dataset.type;
  switch (type) {
    case "acting": if (Game.registerBeat()) { const f = document.createElement("div"); f.className = "sparkle-float"; f.style.left = "50%"; f.style.top = "80%"; f.textContent = "完美吐纳！"; $(".ui-stage").appendChild(f); setTimeout(() => f.remove(), 1300); } break;
    case "event":
      if (currentPopup && currentPopup.kind === "event") {
        const layer = $("popup-layer");
        if (layer && !layer.classList.contains("hidden")) { ensurePopupDismiss(); break; }
        releaseModal();
      }
      Game.openPendingEvent();
      drainPopupQueue();
      break;
    case "treasure_choice": Game.queuePopup({ kind: "treasure_choice" }); drainPopupQueue(); break;
    case "faction_choice": Game._maybeQueueFactionChoice(); drainPopupQueue(); break;
    case "breakthrough": Game.requestBreakthrough(); break;
    case "level_up": playLevelUpFx(() => Game.levelUp()); break;
    case "spell_up": openPanelSheet("spell"); break;
    case "treasure_up": openPanelSheet("treasure"); break;
    case "boss_fight": openPanelSheet("map"); break;
    case "claim": Game.claimOfflineReward(); break;
    case "action": Game.startAction(btn.dataset.actionId); break;
    default:
      if (Game.startPreferredCultivation()) break;
      Game.queuePopup({ kind: "text", title: "闭关", body: "你继续在洞府中闭关。\n山中灵气会随时间缓缓汇入体内，离开页面也不会中断。\n\n稍后回来「出关领取」即可。", buttons: [{ label: "静心闭关" }] });
      drainPopupQueue();
  }
}

// ---------------- 弹窗系统 ----------------

function popupLayerHidden() {
  const layer = $("popup-layer");
  return !layer || layer.classList.contains("hidden");
}

function releaseStaleModal() {
  if (!currentPopup || preludeActive) return;
  if (currentPopup.kind === "prologue" || currentPopup.kind === "world_map") return;
  if (currentPopup.kind === "battle_v2" && typeof BattleUIV2 !== "undefined" && BattleUIV2._session) return;
  if (currentPopup.kind === "slot_config" && typeof BattleUIV2 !== "undefined" && BattleUIV2._formCtx) return;
  if (!popupLayerHidden()) return;
  currentPopup = null;
  if (typeof Game !== "undefined") Game.eventPopupActive = false;
}

function drainPopupQueue() {
  releaseStaleModal();
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
  if (popup.kind === "event" && popup.prelude) {
    preludeActive = true;
    $("prelude").classList.remove("hidden");
    setTimeout(() => {
      $("prelude").classList.add("hidden");
      preludeActive = false;
      showPopup(popup);
    }, 700);
    return;
  }
  showPopup(popup);
}

function resetPopupPanel() {
  const panel = $("popup-panel");
  if (!panel) return;
  const mk = (id, tag) => {
    let el = $(id);
    if (!el) { el = document.createElement(tag); el.id = id; }
    return el;
  };
  const title = mk("popup-title", "div");
  const body = mk("popup-body", "div");
  const buttons = mk("popup-buttons", "div");
  const keep = new Set(["popup-title", "popup-body", "popup-buttons"]);
  Array.from(panel.children).forEach((el) => { if (!keep.has(el.id)) el.remove(); });
  panel.append(title, body, buttons);
  title.textContent = "";
  body.innerHTML = "";
  buttons.innerHTML = "";
  panel.className = "";
}

function releaseModal() {
  const wasEvent = currentPopup && currentPopup.kind === "event";
  if (typeof BattleUIV2 !== "undefined" && BattleUIV2.closeLayers) BattleUIV2.closeLayers();
  currentPopup = null;
  resetPopupPanel();
  const layer = $("popup-layer");
  if (layer) layer.classList.add("hidden");
  if (wasEvent && typeof Game !== "undefined" && Game.state && Game.state.pending_event_id) {
    Game.eventPopupActive = false;
  }
}

function ensurePopupDismiss() {
  const layer = $("popup-layer");
  if (!layer || layer.classList.contains("hidden")) return;
  const buttons = $("popup-buttons");
  if (!buttons) return;
  if (buttons.querySelector("button")) return;
  buttons.appendChild(popupButton("知道了", false, () => closePopup()));
}

function showPopup(popup) {
  currentPopup = popup;
  resetPopupPanel();
  if (popup.kind === "battle_v2") {
    $("popup-layer").classList.add("hidden");
    BattleUIV2.openBattle(popup.battle, Game.state);
    return;
  }
  if (popup.kind === "slot_config") {
    $("popup-layer").classList.add("hidden");
    BattleUIV2.openFormation(Game.state, () => { closePopup(); }, { tutorial: !!popup.tutorial });
    return;
  }
  const panel = $("popup-panel"), title = $("popup-title"), body = $("popup-body"), buttons = $("popup-buttons");
  $("popup-layer").classList.remove("hidden");
  const fn = (typeof GameplayEngine !== "undefined") ? GameplayEngine.getRenderer(popup.kind) : null;
  if (fn) {
    try { fn(panel, title, body, buttons, popup); }
    catch (err) {
      console.error("popup render", popup.kind, err);
      if (title && !title.textContent) title.textContent = "天机有变";
      if (body && !body.textContent) body.textContent = "这段机缘未能展开。再点一次即可。";
    }
    ensurePopupDismiss();
    return;
  }
  panel.classList.add("plaque");
  title.textContent = popup.title || "";
  body.textContent = popup.body || "";
  buttons.appendChild(popupButton("知道了", false, () => closePopup()));
}

function registerPopupRenderers() {
  if (typeof GameplayEngine === "undefined") return;
  GameplayEngine.registerRenderer("text", (panel, title, body, buttons, popup) => {
    panel.classList.add("plaque");
    if (popup.style) panel.classList.add(`style-${popup.style}`);
    title.textContent = popup.title || ""; body.textContent = popup.body || "";
    for (const cfg of popup.buttons || [{ label: "确定" }]) buttons.appendChild(popupButton(cfg.label, cfg.secondary, () => { closePopup(); if (cfg.action === "claim_offline") Game.claimOfflineReward(); if (cfg.action === "reincarnate") Game.reincarnate(); if (cfg.action === "open_scroll") WorldScroll.open(); if (cfg.action === "tower_next") Game._nextTowerFloor(); if (cfg.action === "tower_stop") Game._endTowerRun(false); if (cfg.action === "chain_next") Game._nextChainBoss(); if (cfg.action === "chain_stop") Game._stopChain(); if (cfg.action === "visit_option") Game.chooseVisitOption(cfg.visit); if (cfg.action === "ending_choice") Game.chooseEnding(cfg.endingId); if (cfg.action === "feedback_form") Game.openFeedbackForm(); /* ending_defer：仅关闭（暂缓，下次会话/毕业再议） */ }));
  });
  GameplayEngine.registerRenderer("event", (panel, title, body, buttons) => renderEventPopup(panel, title, body, buttons));
  GameplayEngine.registerRenderer("encounter", (panel, title, body, buttons, popup) => renderEncounterPopup(panel, title, body, buttons, popup.encounterId));
  GameplayEngine.registerRenderer("battle_v2", (panel, title, body, buttons, popup) => { title.textContent = "斗法"; BattleUIV2.renderBattlePopup(panel, popup.battle, Game.state); });
  GameplayEngine.registerRenderer("slot_config", (panel, title, body, buttons, popup) => { title.textContent = "斗法栏·配招"; BattleUIV2.renderSlotConfig(body, Game.state, () => { closePopup(); }, { tutorial: !!popup.tutorial }); });
  GameplayEngine.registerRenderer("treasure_choice", (panel, title, body, buttons) => renderTreasureChoicePopup(panel, title, body, buttons));
  GameplayEngine.registerRenderer("race_choice", (panel, title, body, buttons) => renderRaceChoicePopup(panel, title, body, buttons));
  GameplayEngine.registerRenderer("benming_choice", (panel, title, body, buttons) => renderBenmingChoicePopup(panel, title, body, buttons));
  GameplayEngine.registerRenderer("liupai_choice", (panel, title, body, buttons) => renderLiupaiChoicePopup(panel, title, body, buttons));
  GameplayEngine.registerRenderer("faction_choice", (panel, title, body, buttons) => renderFactionChoicePopup(panel, title, body, buttons));
  GameplayEngine.registerRenderer("breakthrough_confirm", (panel, title, body, buttons, popup) => renderBreakthroughConfirmPopup(panel, title, body, buttons, popup.breakthroughId));
  GameplayEngine.registerRenderer("rest", (panel, title, body, buttons, popup) => renderRestPopup(panel, title, body, buttons, popup.payload || {}));
  GameplayEngine.registerRenderer("insight", (panel, title, body, buttons, popup) => renderInsightPopup(panel, title, body, buttons, popup.payload || {}));
  GameplayEngine.registerRenderer("audio_settings", (panel, title, body, buttons) => { title.textContent = "声音设置"; renderAudioSettings(panel, body, buttons); });
  GameplayEngine.registerRenderer("fragment_synth", (panel, title, body, buttons) => renderFragmentSynthPopup(panel, title, body, buttons));
  GameplayEngine.registerRenderer("minigame", renderMinigamePopup);
}

function renderMinigamePopup(panel, title, body, buttons, popup) {
  const def = DataManager.getById("minigame_table", popup.minigameId);
  panel.classList.add("style-chance");
  title.textContent = def.title || "机缘";
  body.textContent = def.body || "";
  const node = (def.fsm || []).find((n) => String(n.state) === String(popup.stateId)) || (def.fsm || [])[0] || {};
  (node.options || []).forEach((opt) => {
    const btn = document.createElement("button");
    btn.className = "popup-btn";
    const main = document.createElement("span"); main.textContent = opt.label || "选择";
    const sub = document.createElement("span"); sub.className = "popup-option-sub"; sub.textContent = opt.sub || "";
    btn.append(main, sub);
    btn.addEventListener("click", () => {
      closePopup();
      GameplayEngine.choose(popup.minigameId, opt.id);
    });
    buttons.appendChild(btn);
  });
}

function closePopup() { releaseModal(); drainPopupQueue(); render(); }

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
  const forceBattle = !state.flags.first_travel_battle_done;
  (enc.options || []).forEach((option, index) => {
    if (forceBattle && option.kind !== "battle") return;
    const btn = document.createElement("button"); btn.className = "popup-btn" + (option.kind === "battle" ? " calamity" : "");
    const main = document.createElement("span"); main.textContent = option.text || "选择";
    const sub = document.createElement("span"); sub.className = "popup-option-sub";
    if (option.kind === "battle") {
      const map = DataManager.getById("map_table", String(enc.map_id));
      sub.textContent = `斗法 · 敌方战力约 ${formatInt(Math.max(50, Math.round(num(map.recommended_power, 300) * num(option.enemy_power_ratio, 0.25) * num(getTodayOmen().enemyMult, 1))))}（你 ${formatInt(RealmManager.getCombatPower(state))}）`;
    } else if (option.kind === "check") {
      let chance = num(option.chance, 0.6) + num(getTodayOmen().checkBonus, 0);
      for (const row of DataManager.getRows("skill_table")) { if (String(row.spell_type) === String(option.bonus_spell_type)) chance += int(state.skill_levels[String(row.id)]) * num(option.bonus_per_level, 0.05); }
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

function eventHeadline(eventRow) {
  const rar = (typeof EventManager !== "undefined") ? EventManager.rarityLabel(eventRow) : "";
  const name = eventRow.event_name || eventRow.title || "机缘";
  return rar ? `机缘·${rar}：${name}` : `机缘触发：${name}`;
}

function eventNarrative(eventRow) {
  const tag = eventRow.fengshen_tag ? `封神锚点：${eventRow.fengshen_tag}\n\n` : "";
  return `${tag}${eventRow.narrative_text || eventRow.body || "天机一闪，需你当场抉择。"}`;
}

function eventOptionTone(option, index, isChoice) {
  const res = ((option && (option.reward || option.result)) || {}).resources || {};
  if (num(res.merit) > 0 && num(res.calamity) <= 0) return "merit";
  if (num(res.calamity) > 0 && num(res.merit) <= 0) return "calamity";
  if (isChoice) return index === 0 ? "merit" : "calamity";
  return "";
}

function eventOptionButton(label, sub, tone, handler) {
  const btn = document.createElement("button");
  btn.className = "popup-btn" + (tone ? " " + tone : "");
  const main = document.createElement("span");
  main.textContent = label || "选择";
  btn.appendChild(main);
  if (sub) {
    const s = document.createElement("span");
    s.className = "popup-option-sub";
    s.textContent = sub;
    btn.appendChild(s);
  }
  btn.addEventListener("click", handler);
  return btn;
}

function mountEventChoices(buttonsEl, eventRow, afterPick) {
  const isChoice = eventRow.merit_or_calamity === "choice";
  const evOptions = Array.isArray(eventRow.options) ? eventRow.options
    : Array.isArray(eventRow.choices) ? eventRow.choices : [];
  if (!evOptions.length) {
    buttonsEl.appendChild(eventOptionButton("记下", describeEventReward({ reward: eventRow.reward || {} }), "", () => {
      afterPick();
      Game.chooseEventOption(-1);
    }));
    return;
  }
  evOptions.forEach((option, index) => {
    const tone = eventOptionTone(option, index, isChoice);
    buttonsEl.appendChild(eventOptionButton(option.text || option.label || "选择", describeEventReward(option), tone, () => {
      afterPick();
      Game.chooseEventOption(index);
    }));
  });
}

function renderEventPopup(panel, title, body, buttons) {
  const eventRow = Game.getPendingEvent();
  panel.classList.add("style-chance");
  if (!eventRow || !Object.keys(eventRow).length) {
    title.textContent = "机缘已散";
    body.textContent = "这段天机已经消散。若榜文再动，会重新浮现。";
    buttons.appendChild(popupButton("知道了", false, () => {
      closePopup();
      if (Game.state) { Game.state.pending_event_id = ""; Game.eventPopupActive = false; }
    }));
    return;
  }
  title.textContent = eventHeadline(eventRow);
  body.textContent = eventNarrative(eventRow);
  mountEventChoices(buttons, eventRow, () => closePopup());
}

function describeEventReward(option) {
  const parts = [];
  const reward = (option && (option.reward || option.result)) || {};
  for (const id of Object.keys(reward.resources || {})) {
    const row = DataManager.getById("resource_table", id);
    const amt = num(reward.resources[id]);
    if (!amt) continue;
    parts.push(`${(row && row.resource_name) || id} ${amt > 0 ? "+" : ""}${formatInt(amt)}`);
  }
  if (reward.spell_pages_by_type) { let t = 0; for (const k of Object.keys(reward.spell_pages_by_type)) t += num(reward.spell_pages_by_type[k]); if (t) parts.push(`术法残页 +${t}`); }
  if (reward.treasure_shards_by_id) { let t = 0; for (const k of Object.keys(reward.treasure_shards_by_id)) t += num(reward.treasure_shards_by_id[k]); if (t) parts.push(`法宝碎片 +${t}`); }
  if (reward.root_progress) parts.push(`道行 +${formatInt(reward.root_progress)}`);
  if (reward.breakthrough_bonus) parts.push("破劫气运上升");
  if (reward.breakthrough_pressure_reduce) parts.push("劫气消散");
  if (reward.buffs) parts.push("气机长留");
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
  panel.classList.add("style-seal", "race-full");
  title.textContent = "择跟脚：你自何处来";
  body.innerHTML = "";
  const lead = document.createElement("p");
  lead.className = "race-lead";
  lead.textContent = "灵光将落未落。这一世，你是洞府里醒来的哪一种生灵。";
  body.appendChild(lead);

  const rb = Game.state.rebirth || {};
  const rows = DataManager.getRows("race_table");
  const openRows = rows.filter((r) => r.open === true);
  const lockedRows = rows.filter((r) => r.open !== true);
  let picked = null;

  const confirmBtn = document.createElement("button");
  confirmBtn.className = "popup-btn race-confirm-btn";
  confirmBtn.style.display = "none";
  confirmBtn.addEventListener("click", () => {
    if (!picked) return;
    closePopup();
    Game.chooseRace(String(picked));
  });

  const grid = document.createElement("div");
  grid.className = "race-grid";
  for (const row of openRows) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "popup-btn choice-pick race-card";
    const art = document.createElement("img");
    art.className = "race-card-art";
    const pack = (typeof CHARACTER_PATHS !== "undefined" && CHARACTER_PATHS[row.race_id]) ? CHARACTER_PATHS[row.race_id] : null;
    art.src = (pack && pack["炼气士"]) || "";
    art.alt = "";
    const name = document.createElement("span");
    name.className = "choice-name";
    const seen = rb.races_seen && rb.races_seen.includes(String(row.race_id));
    name.textContent = `${row.short_name || row.race_name}${seen ? "（前世）" : ""}`;
    const talent = document.createElement("span");
    talent.className = "race-card-talent";
    talent.textContent = row.talent_name || "";
    const sub = document.createElement("span");
    sub.className = "popup-option-sub";
    sub.textContent = row.talent_desc || row.card_desc || "";
    btn.append(art, name, talent, sub);
    btn.addEventListener("click", () => {
      picked = row.race_id;
      grid.querySelectorAll(".choice-pick").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      confirmBtn.style.display = "";
      confirmBtn.textContent = `立此为命：${row.short_name || row.race_name} —— 此念既定，道途不再回头`;
    });
    grid.appendChild(btn);
  }
  body.appendChild(grid);

  if (lockedRows.length) {
    const fog = document.createElement("section");
    fog.className = "race-fog";
    const fogHead = document.createElement("div");
    fogHead.className = "race-fog-head";
    fogHead.innerHTML = "<b>雾中未醒</b><span>大劫之后，他们才会落到你手里。先点开看看。</span>";
    fog.appendChild(fogHead);
    const row = document.createElement("div");
    row.className = "race-fog-row";
    const tease = document.createElement("div");
    tease.className = "race-fog-tease";
    tease.textContent = "点一尊剪影。此刻还轮不到你。";
    const ROOT_ART = {
      xiantian: "assets/opening/root_xiantian.jpg",
      qilin: "assets/opening/root_qilin.jpg",
      wu: "assets/opening/root_wu.jpg",
      mo: "assets/opening/root_mo.jpg",
      long: "assets/opening/root_long.jpg",
      feng: "assets/opening/root_feng.jpg",
      hongmeng: "assets/opening/root_shou.jpg",
    };
    for (const rowData of lockedRows) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "race-fog-card";
      const img = document.createElement("img");
      img.src = ROOT_ART[rowData.race_id] || "";
      img.alt = "";
      const nm = document.createElement("span");
      nm.textContent = rowData.short_name || rowData.race_name;
      card.append(img, nm);
      card.addEventListener("click", () => {
        row.querySelectorAll(".race-fog-card").forEach((c) => c.classList.remove("on"));
        card.classList.add("on");
        tease.textContent = (rowData.lock_hint || "尚未觉醒") + " 先走完这一世。";
      });
      row.appendChild(card);
    }
    fog.append(row, tease);
    body.appendChild(fog);
  }

  buttons.appendChild(confirmBtn);
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

function renderLiupaiChoicePopup(panel, title, body, buttons) {
  panel.classList.add("style-breakthrough"); title.textContent = "择派：四修择一，走到黑";
  body.textContent = "真仙劫后，你的道开始有了形状。\n四修在面前展开——器、体、魂、劫。\n\n择一修，它将与你性命相系，神通可至五阶，威力更增五成。\n其余诸道，自此封顶三阶。\n\n此选择不可逆（唯转世可重定）。";
  const rows = (typeof LiupaiManager !== "undefined") ? LiupaiManager.getRows() : [];
  const glyphMap = { qi: "器", ti: "体", hun: "魂", jie: "劫" };
  for (const row of rows) {
    const btn = document.createElement("button"); btn.className = "popup-btn treasure-pick choice-pick";
    const glyph = document.createElement("span"); glyph.className = "choice-glyph"; glyph.textContent = glyphMap[row.liupai_id] || row.name;
    const info = document.createElement("span"); info.className = "choice-info";
    const name = document.createElement("span"); name.className = "choice-name"; name.textContent = `${row.name} · ${row.fantasy || ""}`;
    const sub = document.createElement("span"); sub.className = "popup-option-sub";
    sub.textContent = (row.lore_anchor ? `锚点：${row.lore_anchor}\n` : "") + Object.entries(row.passive || {}).map(([k, v]) => `${k} +${v}`).join(" / ");
    info.append(name, sub); btn.append(glyph, info);
    btn.addEventListener("click", () => { closePopup(); Game.chooseLiupai(row.liupai_id); });
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
  const lore = document.createElement("div"); lore.textContent = `${getCalamityPressureTier(Game.state).mood}\n${data.breakthrough_lore || ""}`; body.appendChild(lore);
  const failCount = int(Game.state.breakthrough_fail_counts[String(data.breakthrough_id)]);
  const rows = [
    { label: "基础成功率", value: b.base, base: true, hint: "劫数本身的成色" },
    { label: "剧情节点", value: b.storyBonus, hint: "历过榜文碎光/榜文压顶者 +5%" },
    { label: "功德护持", value: b.meritBonus, hint: "功德每满百 +0.5%，有上限" },
    { label: "法宝护身", value: b.treasureBonus, hint: "最高法宝等级 ×2%，上限 12%" },
    { label: "地脉之力", value: b.pulseBonus, hint: "地仙劫且历榜外地脉者 +10%" },
    { label: "失败补偿", value: b.failBonus, hint: `劫火淬体，此劫已败 ${failCount} 次` },
    { label: "先天道体", value: b.raceBonus, hint: "人族跟脚，破劫底子 +3%" },
    { label: "天庭敕令", value: b.factionBonus, hint: "天庭阵营庇护 +5%" },
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
  // 21.1 §1.3 保底兑现状态行：败绩已达 guarantee_after_fail → 榜文钝了（phase 敌 HP×0.7，battle-engine-v2.js PHASE_GUARANTEE_MULT）
  const guarantee = int(num(data.guarantee_after_fail, 99));
  if (guarantee < 99 && failCount >= guarantee) {
    const dull = document.createElement("div"); dull.className = "rate-total";
    dull.textContent = "屡败之后，榜文似已钝了几分。此劫劫数，钝了三成。";
    body.appendChild(dull);
  }
  // 21.1 §1.6 替身符持有行：仅持有时显示（弹窗克制；无符不提示，避免开局期信息负担）
  const tishenN = int(Game.state.pills && Game.state.pills.tishen);
  if (tishenN > 0) {
    const ts = document.createElement("div"); ts.className = "rate-total";
    ts.textContent = `袖中有替身符 ${tishenN} 张：此劫若败，符燃代受一笔，败可转胜——唯新境名位不授。`;
    body.appendChild(ts);
  }
  const hint = document.createElement("div"); hint.className = "rate-hint-block";
  hint.textContent = "此劫以斗法论胜负：榜文将显化劫数与你相持。\n以上因果护持会凝成你开局的罡气：功德愈深，罡气愈厚；劫气愈重，护持愈薄。\n若屡败于此劫，榜文钝了，劫数也随之而钝。";
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
  // design/19.0 G2：六抽屉拆为独立渲染单元（web/js/panels/*.js），本函数只做标题+分发。
  // 渲染单元逻辑由原 ui.js 逐字迁出（逻辑零改）；各单元注册 window.PANEL_UNITS[key] = { title, render(body, state) }。
  // design/19.0 G3：已迁 Vue 的单元注册 window.PANEL_VUE_UNITS[key] = { title, component }；
  // Vue 可用则走 Vue 渲染（VuePanelMount），否则自动回落命令式单元（逻辑零改，口径由黄金快照钉死）。
  const unit = (window.PANEL_UNITS || {})[key];
  const vunit = (window.PANEL_VUE_UNITS || {})[key];
  const useVue = vunit && typeof VuePanelMount !== "undefined" && VuePanelMount.available();
  const active = useVue ? vunit : unit;
  $("panel-title").textContent = active ? active.title : "";
  // G3：清屏时机——Vue 路径必须先卸载旧 app（其卸载会移除自己的 DOM），再清屏挂载；
  // 若在 unmount 前就 innerHTML=""，Vue 卸载会走到脱离文档的节点上抛错。命令式单元自带清屏。
  const body = $("panel-body");
  const state = Game.state;
  if (useVue) VuePanelMount.mount(vunit.component, body, state);
  else { body.innerHTML = ""; if (unit) unit.render(body, state); }
}

function note(text) { const div = document.createElement("div"); div.className = "panel-note"; div.textContent = text; return div; }

// 法宝面板
// ---------------- 碎片合成弹窗（design/16.0：专属定向 + 通用抽奖）----------------
function renderFragmentSynthPopup(panel, title, body, buttons) {
  panel.classList.add("style-treasure"); title.textContent = "碎片合成";
  body.textContent = "通用碎片可炉火抽奖，随机得宝；专属碎片集满则定向合成那件法宝。";
  const state = Game.state;
  const frag = state.treasure_fragments || {};
  // 通用碎片抽奖
  const lotCard = document.createElement("div"); lotCard.className = "card";
  const lotInfo = document.createElement("div"); lotInfo.className = "card-info";
  const lotName = document.createElement("div"); lotName.className = "card-name"; lotName.textContent = "通用碎片·炉火抽奖";
  const lotDesc = document.createElement("div"); lotDesc.className = "card-desc";
  lotDesc.textContent = `耗通用碎片（法宝碎片）15 枚，随机凝得一件法宝。当前持有：${formatInt(num(state.resources.treasure_shard))} 枚。按境界段奖池加权，高价值极低。`;
  lotInfo.append(lotName, lotDesc); lotCard.appendChild(lotInfo);
  const lotBtn = document.createElement("button"); lotBtn.className = "card-btn";
  const canLot = num(state.resources.treasure_shard) >= 15;
  lotBtn.textContent = canLot ? "抽奖（15 碎片）" : "碎片不足";
  lotBtn.disabled = !canLot;
  lotBtn.addEventListener("click", () => { Game.synthLottery(); drainPopupQueue(); });
  lotCard.appendChild(lotBtn);
  body.appendChild(lotCard);
  // 专属碎片定向合成
  const need = { fan: 10, ling: 20, xian: 35, shen: 50 };
  for (const row of DataManager.getRows("treasure_table")) {
    const id = String(row.treasure_id);
    const tier = Game._treasureTier(id);
    const n = need[tier] || 20;
    const have = int(frag[id]);
    const card = document.createElement("div"); card.className = "card";
    const info = document.createElement("div"); info.className = "card-info";
    const nm = document.createElement("div"); nm.className = "card-name"; nm.textContent = `${row.treasure_name}（${{fan:"凡品",ling:"灵品",xian:"仙品",shen:"神品"}[tier] || tier}）`;
    const desc = document.createElement("div"); desc.className = "card-desc"; desc.textContent = `专属碎片 ${have}/${n}｜${row.main_effect || row.skill_desc || ""}`;
    info.append(nm, desc); card.appendChild(info);
    const btn = document.createElement("button"); btn.className = "card-btn";
    const can = have >= n;
    btn.textContent = can ? "合成" : `${have}/${n}`;
    btn.disabled = !can;
    btn.addEventListener("click", () => { Game.synthDedicated(id); drainPopupQueue(); });
    card.appendChild(btn);
    body.appendChild(card);
  }
}

// ---------------- 启动 ----------------

async function boot() {
  await DataManager.loadAll();
  // —— 20.0 Step5：网游化通信层 auth 门 ——
  // 未登录 → 跳登录页；已登录 → 拉服务端 state 作唯一真相，SaveManager 后端切到 ApiSaveManager。
  if (typeof ApiClient !== "undefined") {
    if (!ApiClient.isLoggedIn()) { window.location.href = "login.html"; return; }
    try {
      const resp = await ApiClient.getState();
      ApiSaveManager.setInitial(resp.state);
      SaveManager.useBackend(ApiSaveManager);
      window.addEventListener("beforeunload", () => ApiSaveManager.flushNow());
    } catch (err) {
      console.error("[boot] 拉取服务端存档失败：", err);
      window.location.href = "login.html";
      return;
    }
  }
  document.querySelector(".ui-mainbtn").addEventListener("click", onMainButtonClick);
  document.querySelector(".ui-autotoggle").addEventListener("click", () => Game.toggleAutoRepeat());
  document.querySelectorAll(".ui-navbtn").forEach((btn) => btn.addEventListener("click", () => openPanelSheet(btn.dataset.panel)));
  $("panel-close").addEventListener("click", closePanelSheet);
  $("panel-layer").addEventListener("click", (e) => { if (e.target === $("panel-layer")) closePanelSheet(); });
  $("world-scroll-btn").addEventListener("click", () => WorldScroll.open());
  document.querySelector(".ui-title").addEventListener("click", () => WorldScroll.open());
  $("world-scroll-close").addEventListener("click", () => WorldScroll.close());
  $("world-scroll-layer").addEventListener("click", (e) => { if (e.target === $("world-scroll-layer")) WorldScroll.close(); });
  $("world-map-btn").addEventListener("click", () => WorldMap.open());
  $("world-map-close").addEventListener("click", () => WorldMap.close());
  $("world-map-layer").addEventListener("click", (e) => { if (e.target === $("world-map-layer")) WorldMap.close(); });
    const audioBtn = $("audio-settings-btn");
    if (audioBtn) audioBtn.addEventListener("click", () => { if (typeof AudioManager !== "undefined") AudioManager.playSfx("ui_click"); Game.queuePopup({ kind: "audio_settings" }); drainPopupQueue(); });
  registerPopupRenderers();
  Game.onChange = render;
  Game.init();
  if (Game.debug) {
    $("debug-bar").classList.remove("hidden");
    $("debug-ff").addEventListener("click", () => Game.fastForward(360));
    $("debug-res").addEventListener("click", () => Game.debugAddResources());
    const db = $("debug-battle");
    if (db) db.addEventListener("click", () => Game.debugStartBattle());
  }
  setInterval(() => Game.tick(), 250);
}

boot();
