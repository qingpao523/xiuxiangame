/* 封神修道录 · 网页版 v2 UI
 * 背景叠加式主界面、唯一主行动按钮、底部导航、弹窗队列、天象前奏、破劫演出。
 */

"use strict";

const ICON_PATHS = {
  daoxing: "assets/resources/resource_daoxing.png",
  mana: "assets/resources/resource_mana.png",
  merit: "assets/resources/resource_merit.png",
  calamity: "assets/resources/resource_calamity.png",
  spell_page: "assets/resources/resource_spell_page.png",
  artifact_shard: "assets/resources/resource_treasure_shard.png",
  treasure_shard: "assets/resources/resource_treasure_shard.png",
  refine_material: "assets/resources/resource_refine_material.png",
};

const BACKGROUND_PATHS = {
  mountain_cave: "assets/backgrounds/bg_mountain_cave.png",
  chentang_far: "assets/backgrounds/bg_chentang_pass.png",
  kulou_edge: "assets/backgrounds/bg_bone_mountain_edge.png",
};

const CHARACTER_PATHS = {
  炼气士: "assets/characters/char_cultivator.png",
  真人: "assets/characters/char_realman.png",
  地仙: "assets/characters/char_earth_immortal.png",
};

const SPELL_ICONS = {
  spell_thunder_01: "assets/spells/spell_palm_thunder.png",
  spell_fire_01: "assets/spells/spell_spirit_fire.png",
  spell_weapon_01: "assets/spells/spell_artifact_control.png",
};

const TREASURE_ICONS = {
  treasure_001: "assets/treasures/treasure_lightwood_sword.png",
  treasure_002: "assets/treasures/treasure_spirit_gourd.png",
  treasure_003: "assets/treasures/treasure_xuanhuang_protective_talisman.png",
  treasure_004: "assets/treasures/treasure_subduing_demon_bell.png",
  treasure_005: "assets/treasures/treasure_windfire_meditation_mat.png",
  treasure_006: "assets/treasures/treasure_bronze_soul_mirror.png",
  treasure_007: "assets/treasures/treasure_gold_light_seal.png",
  treasure_008: "assets/treasures/treasure_calm_jade_pendant.png",
};

const MAP_ACTION = {
  map_001: "wild_travel",
  map_002: "chentang_patrol",
  map_003: "kulou_explore",
};

const NAV_UNLOCK = {
  realm: { check: () => true },
  map: { check: (s) => UnlockManager.isUnlocked(s, "travel"), hint: "炼气士三重解锁游历" },
  spell: { check: (s) => UnlockManager.isUnlocked(s, "spell_system"), hint: "炼气士四重解锁术法" },
  treasure: { check: (s) => UnlockManager.isUnlocked(s, "treasure_system"), hint: "真人一重解锁法宝" },
  chance: { check: (s) => UnlockManager.isUnlocked(s, "event_system") || !!s.pending_event_id, hint: "炼气士六重解锁机缘" },
  log: { check: () => true },
};

// 修行心得流文案池
const INSIGHT_LINES = {
  generic: [
    "灵气如丝，缓缓入体。",
    "呼吸渐深，心湖无波。",
    "远处山风掠过洞府，松涛低回。",
    "丹田微暖，道行又深一分。",
    "杂念沉底，神识渐渐清明。",
    "周天流转，气机在经脉中低鸣。",
  ],
  short_meditation: [
    "你的呼吸渐渐与山息合一。",
    "识海深处，似有一点微光明灭。",
    "洞外虫鸣忽远忽近，你充耳不闻。",
  ],
  wild_travel: [
    "黑雾在林间游走，你按剑缓行。",
    "残符的气息从荒庙方向飘来。",
    "几声妖啸自山坳传出，又归于寂静。",
  ],
  chentang_patrol: [
    "潮雾深处雷声滚动，海风带着腥咸。",
    "巡海妖兵的残影在浪尖一闪而没。",
    "陈塘关的灯火在雨幕中明明灭灭。",
  ],
  kulou_explore: [
    "白骨阴火在山道两侧幽幽而燃。",
    "地脉深处传来极缓的搏动声。",
    "阴云低垂，照魂碎玉在土中微光闪烁。",
  ],
};

// 灵光与心得流的运行时状态
let sparkleEl = null;
let nextSparkleAt = 0;
let nextInsightAt = 0;
let insightShowing = false;

const $ = (id) => document.getElementById(id);

let currentPopup = null;
let preludeActive = false;
let openPanel = "";
let lastRev = -1;

window.SAVE_REV = 0;
const _origSave = SaveManager.save.bind(SaveManager);
SaveManager.save = (state) => {
  window.SAVE_REV++;
  _origSave(state);
};

// ---------------- 主渲染 ----------------

function render() {
  const state = Game.state;
  if (!state || !state.realm_id) return;

  const realm = RealmManager.getCurrentRealm(state);
  const ui = realm.ui || {};
  $("bg").style.backgroundImage = `url("${BACKGROUND_PATHS[ui.background_phase] || BACKGROUND_PATHS.mountain_cave}")`;
  $("fx-seal").classList.toggle("lit", DataManager.isRealmAtLeast(state.realm_id, "rq_06"));
  $("char-img").src = CHARACTER_PATHS[ui.character_phase] || CHARACTER_PATHS["炼气士"];

  $("identity-line").textContent = `${getPhaseRealmName(realm)}｜${getTitle(state)}｜战力 ${formatInt(RealmManager.getCombatPower(state))}`;
  $("weather-line").textContent = `天象：${getWeather(state)}`;
  const omen = getTodayOmen();
  $("omen-line").textContent = `今日异象：${omen.name}——${omen.desc}`;

  // 本命法宝悬浮
  const orb = $("treasure-orb");
  if (state.first_treasure_id) {
    orb.classList.remove("hidden");
    if (!orb.dataset.tid || orb.dataset.tid !== state.first_treasure_id) {
      orb.dataset.tid = state.first_treasure_id;
      orb.innerHTML = "";
      const img = document.createElement("img");
      img.src = TREASURE_ICONS[state.first_treasure_id] || "";
      img.alt = "";
      orb.appendChild(img);
    }
  } else {
    orb.classList.add("hidden");
  }

  // 目标面板
  const goal = GoalManager.getCurrent(state);
  if (Object.keys(goal).length) {
    $("goal-text").textContent = goal.display_text || `当前目标：${goal.goal_name}`;
    $("goal-reward").textContent = goal.reward_preview || "";
  } else {
    $("goal-text").textContent = "当前目标：等待天仙篇开启";
    $("goal-reward").textContent = "可继续：骷髅山边界游历，收集祭炼材料";
  }

  // 道行进度
  const progress = RealmManager.getProgress(state);
  $("progress-fill").style.width = `${Math.round(progress.ratio * 100)}%`;
  $("progress-label").textContent = `道行 ${formatInt(progress.current)} / ${formatInt(progress.required)}`;

  // 状态行：修行中滚动心得，闲时显示最新日志
  if (!insightShowing) {
    $("status-line").classList.remove("insight");
    $("status-line").textContent = state.logs[0] ? state.logs[0].replace(/^\[\d+:\d+\]\s*/, "") : "";
  }

  renderMainButton(state);
  renderNav(state);
  renderHintBar(state);

  // 连续修行开关
  const autoBtn = $("auto-toggle");
  const autoOn = !!state.flags.auto_repeat;
  autoBtn.textContent = `连续修行：${autoOn ? "开" : "关"}`;
  autoBtn.classList.toggle("on", autoOn);

  // 版本变化时重建资源栏 / 面板 / 弹窗队列
  if (window.SAVE_REV !== lastRev) {
    lastRev = window.SAVE_REV;
    renderResources(state);
    if (openPanel) renderPanelBody(openPanel);
  }
  drainPopupQueue();
}

function renderResources(state) {
  const strip = $("resource-strip");
  strip.innerHTML = "";
  for (const row of UnlockManager.getVisibleResources(state)) {
    const id = String(row.resource_id);
    const chip = document.createElement("div");
    chip.className = "res-chip";
    chip.title = row.resource_name || id;
    const img = document.createElement("img");
    img.src = ICON_PATHS[id] || "";
    img.alt = "";
    const name = document.createElement("span");
    name.className = "res-name";
    name.textContent = row.resource_name || id;
    const value = document.createElement("span");
    value.className = "res-value";
    value.textContent = formatInt(state.resources[id] || 0);
    chip.append(img, name, value);
    strip.appendChild(chip);
  }
}

function renderMainButton(state) {
  const main = Game.getMainAction();
  const btn = $("main-btn");
  const label = $("main-btn-label");
  const bar = $("main-btn-progress");
  const stage = $("stage");

  if (main.type === "acting") {
    const action = state.current_action;
    const row = main.row || {};
    const total = num(action.end_time_ms) - num(action.start_time_ms || action.end_time_ms - 1000);
    const remainMs = Math.max(0, num(action.end_time_ms) - nowMs());
    const ratio = total > 0 ? 1 - remainMs / total : 1;
    bar.style.width = `${Math.round(ratio * 100)}%`;
    label.textContent = `${row.action_name || "修行"}中… ${Math.ceil(remainMs / 1000)}息`;
    btn.classList.add("acting");
    btn.classList.toggle("beat", Game.isInBeatWindow());
    stage.classList.add("acting");
    tickSparkle(String(row.action_id || ""));
    tickInsight(String(row.action_id || ""));
  } else {
    bar.style.width = "0%";
    label.textContent = main.label;
    btn.classList.remove("acting");
    stage.classList.remove("acting");
    clearSparkle();
    if (insightShowing) {
      insightShowing = false;
      $("status-line").classList.remove("insight");
    }
    nextSparkleAt = nowMs() + 2500;
    nextInsightAt = nowMs() + 2000;
  }
  btn.dataset.type = main.type;
  btn.dataset.actionId = main.actionId || "";
}

// ---------------- 修行灵光（倒计时期间的可点击奖励） ----------------

const SPARKLE_TYPES = [
  { type: "daoxing", weight: 55, cls: "", name: "道行灵光" },
  { type: "mana", weight: 30, cls: "mana", name: "法力灵光" },
  { type: "tianji", weight: 15, cls: "tianji", name: "天机灵光" },
];

let sparkleCombo = 0;

function sparkleDelay() {
  return getTodayOmen().sparkleFast ? randInt(2500, 5000) : randInt(4000, 8000);
}

function rollSparkleType() {
  const total = SPARKLE_TYPES.reduce((a, t) => a + t.weight, 0);
  let pick = Math.random() * total;
  for (const t of SPARKLE_TYPES) {
    pick -= t.weight;
    if (pick <= 0) return t;
  }
  return SPARKLE_TYPES[0];
}

function tickSparkle(actionId) {
  if (sparkleEl || nowMs() < nextSparkleAt) return;
  const firstTime = !Game.state.flags.sparkle_guide_seen;
  if (firstTime) Game.sparkleGuide();

  const stage = $("stage");
  const t = firstTime ? SPARKLE_TYPES[0] : rollSparkleType();
  const orb = document.createElement("div");
  orb.className = `sparkle${t.cls ? " " + t.cls : ""}`;
  orb.style.left = `${randInt(12, 78)}%`;
  orb.style.top = `${randInt(10, 72)}%`;
  if (firstTime) {
    const tip = document.createElement("span");
    tip.className = "sparkle-label";
    tip.textContent = "点击拾取";
    orb.appendChild(tip);
  }
  orb.addEventListener("click", (e) => {
    e.stopPropagation();
    sparkleCombo += 1;
    const gain = Game.collectSparkle(t.type, sparkleCombo);
    if (gain) {
      const float = document.createElement("div");
      float.className = "sparkle-float";
      float.style.left = orb.style.left;
      float.style.top = orb.style.top;
      const parts = [];
      for (const id of Object.keys(gain)) {
        const row = DataManager.getById("resource_table", id);
        parts.push(`${row.resource_name || id} +${formatInt(gain[id])}`);
      }
      float.textContent = `${parts.join("　")}${sparkleCombo > 1 ? `　连拾×${sparkleCombo}` : ""}`;
      stage.appendChild(float);
      setTimeout(() => float.remove(), 1300);
    }
    clearSparkle();
    nextSparkleAt = nowMs() + sparkleDelay();
  });
  stage.appendChild(orb);
  sparkleEl = orb;
  // 3.5 秒不点自动散去（首次引导灵光不消失，断连拾）
  if (!firstTime) {
    setTimeout(() => {
      if (sparkleEl === orb) {
        sparkleCombo = 0;
        clearSparkle();
        nextSparkleAt = nowMs() + sparkleDelay();
      }
    }, 3500);
  }
}

function clearSparkle() {
  if (sparkleEl) {
    sparkleEl.remove();
    sparkleEl = null;
  }
}

// ---------------- 修行心得流 ----------------

function tickInsight(actionId) {
  if (nowMs() < nextInsightAt) return;
  const pool = [...(INSIGHT_LINES[actionId] || []), ...INSIGHT_LINES.generic];
  const line = pool[randInt(0, pool.length - 1)];
  const el = $("status-line");
  el.classList.remove("insight");
  void el.offsetWidth; // 重新触发入场动画
  el.classList.add("insight");
  el.textContent = line;
  insightShowing = true;
  nextInsightAt = nowMs() + randInt(4500, 6500);
}

function renderNav(state) {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    const key = btn.dataset.panel;
    const cfg = NAV_UNLOCK[key];
    const unlocked = cfg.check(state);
    btn.classList.toggle("locked", !unlocked);
    let dot = btn.querySelector(".red-dot");
    let need = false;
    if (unlocked) {
      if (key === "chance" && state.pending_event_id) need = true;
      if (key === "realm" && (RealmManager.canLevelUp(state) || BreakthroughManager.canAttempt(state))) need = true;
      if (key === "spell" && hasAffordableSpell(state)) need = true;
      if (key === "treasure" && (Game.hasPendingTreasureChoice() || hasAffordableTreasure(state))) need = true;
      if (key === "map" && hasChallengeableBoss(state)) need = true;
    }
    btn.classList.toggle("attention", need);
    if (need && !dot) {
      dot = document.createElement("span");
      dot.className = "red-dot";
      btn.appendChild(dot);
    } else if (!need && dot) {
      dot.remove();
    }
  });
}

// 可操作提示条：比红点更强的引导，点击直达面板
function getSuggestion(state) {
  if (hasAffordableSpell(state)) {
    const anyLearned = Object.values(state.spells).some((s) => int(s.level) > 0);
    return { panel: "spell", text: anyLearned ? "残页已足，可精进术法 ›" : "残页已足，可参悟第一门术法 ›" };
  }
  if (!Game.hasPendingTreasureChoice() && hasAffordableTreasure(state)) {
    return { panel: "treasure", text: "材料已备，可温养本命法宝 ›" };
  }
  if (hasChallengeableBoss(state)) {
    const boss = BossManager.getBosses(state).find(
      (b) => BossManager.canChallenge(state, String(b.boss_id)) && BossManager.getWinRate(state, b) >= 0.5
    );
    return { panel: "map", text: `${boss.boss_name}现身，可前往斗法 ›` };
  }
  return null;
}

let currentSuggestion = null;

function renderHintBar(state) {
  const bar = $("hint-bar");
  const suggestion = getSuggestion(state);
  currentSuggestion = suggestion;
  if (!suggestion) {
    bar.classList.add("hidden");
    return;
  }
  bar.classList.remove("hidden");
  if (bar.textContent !== suggestion.text) bar.textContent = suggestion.text;
}

function hasAffordableSpell(state) {
  return UnlockManager.getAvailableSpells(state).some((spell) => {
    const level = int(Game.getSpellState(String(spell.spell_id)).level);
    const nextLevel = level + 1;
    if (nextLevel > Game.getSpellMaxLevel(spell)) return false;
    const cost = Game.getSpellUpgradeCost(spell, nextLevel);
    return (
      cost &&
      num(state.resources.spell_page) >= num(cost.spell_page_cost) &&
      num(state.resources.mana) >= num(cost.mana_cost)
    );
  });
}

function hasAffordableTreasure(state) {
  return UnlockManager.getAvailableTreasures(state).some((treasure) => {
    const level = int(Game.getTreasureState(String(treasure.treasure_id)).level);
    const nextLevel = level + 1;
    if (nextLevel > int(treasure.max_level_mvp, 5)) return false;
    const cost = Game.getTreasureUpgradeCost(treasure, nextLevel);
    return (
      cost &&
      num(state.resources.treasure_shard) >= num(cost.treasure_shard_cost) &&
      num(state.resources.mana) >= num(cost.mana_cost)
    );
  });
}

function hasChallengeableBoss(state) {
  return BossManager.getBosses(state).some(
    (boss) => BossManager.canChallenge(state, String(boss.boss_id)) && BossManager.getWinRate(state, boss) >= 0.5
  );
}

// ---------------- 主按钮点击 ----------------

function onMainButtonClick() {
  const btn = $("main-btn");
  const type = btn.dataset.type;
  switch (type) {
    case "acting": {
      // 吐纳节拍：金光窗口内点击记完美吐纳
      if (Game.registerBeat()) {
        const float = document.createElement("div");
        float.className = "sparkle-float";
        float.style.left = "50%";
        float.style.top = "80%";
        float.textContent = "完美吐纳！";
        $("stage").appendChild(float);
        setTimeout(() => float.remove(), 1300);
      }
      break;
    }
    case "event":
      Game.openPendingEvent();
      break;
    case "treasure_choice":
      Game.queuePopup({ kind: "treasure_choice" });
      drainPopupQueue();
      break;
    case "breakthrough":
      Game.requestBreakthrough();
      break;
    case "level_up":
      Game.levelUp();
      break;
    case "claim":
      Game.claimOfflineReward();
      break;
    case "action":
      Game.startAction(btn.dataset.actionId);
      break;
    default:
      Game.queuePopup({
        kind: "text",
        title: "闭关",
        body: "你继续在洞府中闭关。\n山中灵气会随时间缓缓汇入体内，离开页面也不会中断。\n\n稍后回来「出关领取」即可。",
        buttons: [{ label: "静心闭关" }],
      });
      drainPopupQueue();
  }
}

// ---------------- 弹窗系统 ----------------

function drainPopupQueue() {
  if (currentPopup || preludeActive) return;
  if (!Game.popupQueue.length) return;
  const popup = Game.popupQueue.shift();
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

function showPopup(popup) {
  currentPopup = popup;
  const layer = $("popup-layer");
  const panel = $("popup-panel");
  const title = $("popup-title");
  const body = $("popup-body");
  const buttons = $("popup-buttons");
  panel.className = "";
  body.innerHTML = "";
  buttons.innerHTML = "";

  if (popup.kind === "text") {
    if (popup.style) panel.classList.add(`style-${popup.style}`);
    title.textContent = popup.title || "";
    body.textContent = popup.body || "";
    for (const cfg of popup.buttons || [{ label: "确定" }]) {
      buttons.appendChild(popupButton(cfg.label, cfg.secondary, () => {
        closePopup();
        if (cfg.action === "claim_offline") Game.claimOfflineReward();
      }));
    }
  } else if (popup.kind === "event") {
    renderEventPopup(panel, title, body, buttons);
  } else if (popup.kind === "encounter") {
    renderEncounterPopup(panel, title, body, buttons, popup.encounterId);
  } else if (popup.kind === "battle") {
    renderBattlePopup(panel, title, body, buttons, popup.battle);
  } else if (popup.kind === "treasure_choice") {
    renderTreasureChoicePopup(panel, title, body, buttons);
  } else if (popup.kind === "breakthrough_confirm") {
    renderBreakthroughConfirmPopup(panel, title, body, buttons, popup.breakthroughId);
  }

  layer.classList.remove("hidden");
}

function closePopup() {
  currentPopup = null;
  $("popup-layer").classList.add("hidden");
  drainPopupQueue();
  render();
}

function popupButton(label, secondary, handler, extraClass = "") {
  const btn = document.createElement("button");
  btn.className = `popup-btn${secondary ? " secondary" : ""}${extraClass ? " " + extraClass : ""}`;
  btn.textContent = label;
  btn.addEventListener("click", handler);
  return btn;
}

// ---------------- 遭遇弹窗 ----------------

function renderEncounterPopup(panel, title, body, buttons, encounterId) {
  const enc = DataManager.getById("encounter_table", encounterId);
  if (!Object.keys(enc).length) {
    closePopup();
    return;
  }
  panel.classList.add("style-chance");
  title.textContent = `遭遇：${enc.name}`;
  body.textContent = enc.narrative || "";
  const state = Game.state;
  (enc.options || []).forEach((option, index) => {
    const btn = document.createElement("button");
    btn.className = "popup-btn" + (option.kind === "battle" ? " calamity" : "");
    const main = document.createElement("span");
    main.textContent = option.text || "选择";
    const sub = document.createElement("span");
    sub.className = "popup-option-sub";
    if (option.kind === "battle") {
      const map = DataManager.getById("map_table", String(enc.map_id));
      const enemyPower = Math.max(50, Math.round(num(map.recommended_power, 300) * num(option.enemy_power_ratio, 0.25) * num(getTodayOmen().enemyMult, 1)));
      sub.textContent = `斗法 · 敌方战力约 ${formatInt(enemyPower)}（你 ${formatInt(RealmManager.getCombatPower(state))}）`;
    } else if (option.kind === "check") {
      let chance = num(option.chance, 0.6) + num(getTodayOmen().checkBonus, 0);
      if (option.bonus_spell_type) {
        for (const row of DataManager.getRows("spell_table")) {
          if (String(row.spell_type) !== String(option.bonus_spell_type)) continue;
          chance += int(state.spells[String(row.spell_id)]?.level) * num(option.bonus_per_level, 0.05);
        }
      }
      sub.textContent = `成算约 ${Math.round(clamp(chance, 0.05, 0.95) * 100)}%`;
    } else {
      sub.textContent = "稳妥之选";
    }
    btn.append(main, sub);
    btn.addEventListener("click", () => {
      closePopup();
      Game.resolveEncounter(encounterId, index);
    });
    buttons.appendChild(btn);
  });
}

// ---------------- 斗法弹窗（回合制） ----------------

let battleTimer = null;

function renderBattlePopup(panel, title, body, buttons, battle) {
  panel.classList.add("style-breakthrough");
  title.textContent = `斗法：${battle.name}`;

  const bars = document.createElement("div");
  bars.className = "battle-bars";
  const mkRow = (label, cls) => {
    const row = document.createElement("div");
    row.className = "hp-row";
    const name = document.createElement("span");
    name.className = "hp-name";
    name.textContent = label;
    const bar = document.createElement("div");
    bar.className = "hp-bar";
    const fill = document.createElement("div");
    fill.className = `hp-fill ${cls}`;
    bar.appendChild(fill);
    const numEl = document.createElement("span");
    numEl.className = "hp-num";
    row.append(name, bar, numEl);
    return { row, fill, numEl };
  };
  const playerRow = mkRow("你", "player");
  const enemyRow = mkRow(battle.name, "enemy");
  bars.append(playerRow.row, enemyRow.row);

  const logBox = document.createElement("div");
  logBox.className = "battle-log";
  body.append(bars, logBox);

  const updateBars = () => {
    playerRow.fill.style.width = `${Math.round((battle.playerHp / battle.playerHpMax) * 100)}%`;
    enemyRow.fill.style.width = `${Math.round((battle.enemyHp / battle.enemyHpMax) * 100)}%`;
    playerRow.numEl.textContent = formatInt(battle.playerHp);
    enemyRow.numEl.textContent = formatInt(battle.enemyHp);
  };
  updateBars();
  appendBattleLine(logBox, `你与${battle.name}对上了气机，斗法开始！`);

  const boostBtn = popupButton(`催法（余 ${3 - battle.boostsUsed} 次 · 耗法力 ${formatInt(BattleEngine.boostCost(Game.state))}）`, false, () => {
    if (Game.battleBoost(battle)) {
      appendBattleLine(logBox, "你咬破舌尖催动法力，下一击威能大增！");
      boostBtn.textContent = `催法（余 ${3 - battle.boostsUsed} 次 · 耗法力 ${formatInt(BattleEngine.boostCost(Game.state))}）`;
    } else {
      appendBattleLine(logBox, "法力不济或次数已尽，催法未成。");
    }
  }, "calamity");
  buttons.appendChild(boostBtn);

  if (battleTimer) clearInterval(battleTimer);
  battleTimer = setInterval(() => {
    const events = Game.battleRound(battle);
    for (const e of events) appendBattleLine(logBox, e.text);
    updateBars();
    if (battle.done) {
      clearInterval(battleTimer);
      battleTimer = null;
      boostBtn.disabled = true;
      const endBtn = popupButton(battle.win ? "收取战果" : "退出战圈", false, () => {
        closePopup();
        Game.finishBattle(battle);
      });
      buttons.appendChild(endBtn);
    }
  }, 900);
}

function appendBattleLine(logBox, text) {
  const line = document.createElement("div");
  line.className = "battle-line";
  line.textContent = text;
  logBox.appendChild(line);
  logBox.scrollTop = logBox.scrollHeight;
}

function renderEventPopup(panel, title, body, buttons) {
  const eventRow = Game.getPendingEvent();
  if (!Object.keys(eventRow).length) {
    closePopup();
    return;
  }
  panel.classList.add("style-chance");
  title.textContent = `机缘触发：${eventRow.event_name || ""}`;
  const tag = eventRow.fengshen_tag ? `封神锚点：${eventRow.fengshen_tag}\n\n` : "";
  body.textContent = `${tag}${eventRow.narrative_text || ""}`;
  const isChoice = eventRow.merit_or_calamity === "choice";
  (eventRow.options || []).forEach((option, index) => {
    const rewardText = describeEventReward(option);
    const btn = document.createElement("button");
    btn.className = "popup-btn" + (isChoice ? (index === 0 ? " merit" : " calamity") : "");
    btn.innerHTML = "";
    const main = document.createElement("span");
    main.textContent = option.text || "选择";
    const sub = document.createElement("span");
    sub.className = "popup-option-sub";
    sub.textContent = rewardText;
    btn.append(main, sub);
    btn.addEventListener("click", () => {
      closePopup();
      Game.chooseEventOption(index);
    });
    buttons.appendChild(btn);
  });
}

function describeEventReward(option) {
  const parts = [];
  const reward = option.reward || {};
  for (const id of Object.keys(reward.resources || {})) {
    const row = DataManager.getById("resource_table", id);
    parts.push(`${row.resource_name || id} +${formatInt(reward.resources[id])}`);
  }
  if (reward.spell_pages_by_type) {
    let total = 0;
    for (const k of Object.keys(reward.spell_pages_by_type)) total += num(reward.spell_pages_by_type[k]);
    parts.push(`术法残页 +${total}`);
  }
  if (reward.treasure_shards_by_id) {
    let total = 0;
    for (const k of Object.keys(reward.treasure_shards_by_id)) total += num(reward.treasure_shards_by_id[k]);
    parts.push(`法宝碎片 +${total}`);
  }
  if (reward.root_progress) parts.push(`道行 +${formatInt(reward.root_progress)}`);
  if (reward.breakthrough_bonus) parts.push("破劫气运上升");
  if (reward.breakthrough_pressure_reduce) parts.push("劫气消散");
  if (reward.random_bonus) parts.push("或有意外之喜");
  return parts.join("，") || "一缕气机入体";
}

function renderTreasureChoicePopup(panel, title, body, buttons) {
  if (!Game.hasPendingTreasureChoice()) {
    closePopup();
    return;
  }
  panel.classList.add("style-treasure");
  title.textContent = "本命法宝择主";
  body.textContent =
    "破劫成真人后，你的气机引动三件残宝。\n它们皆非真正先天灵宝，却各有封神因果。\n选择其一，作为你的第一件本命法宝。";
  for (const id of FIRST_TREASURE_CHOICES) {
    const row = DataManager.getById("treasure_table", id);
    const btn = document.createElement("button");
    btn.className = "popup-btn treasure-pick";
    const img = document.createElement("img");
    img.src = TREASURE_ICONS[id] || "";
    img.alt = "";
    const info = document.createElement("span");
    const name = document.createElement("span");
    name.textContent = row.treasure_name || id;
    const sub = document.createElement("span");
    sub.className = "popup-option-sub";
    sub.textContent = `${row.origin_desc || ""}\n法宝技：${row.skill_name || ""} — ${row.skill_desc || ""}`;
    info.append(name, sub);
    btn.append(img, info);
    btn.addEventListener("click", () => {
      closePopup();
      Game.chooseFirstTreasure(id);
    });
    buttons.appendChild(btn);
  }
}

function renderBreakthroughConfirmPopup(panel, title, body, buttons, breakthroughId) {
  const data = DataManager.getById("breakthrough_table", breakthroughId);
  if (!Object.keys(data).length) {
    closePopup();
    return;
  }
  panel.classList.add("style-breakthrough");
  const fromRealm = DataManager.getRealm(data.from_realm);
  const toRealm = DataManager.getRealm(data.to_realm);
  title.textContent = `破劫：${fromRealm.realm_name || ""} → ${toRealm.realm_name || ""}`;
  const b = BreakthroughManager.getRateBreakdown(Game.state, data);
  const pct = (v) => `${Math.round(v * 100)}%`;
  body.textContent =
    `${data.breakthrough_lore || ""}\n\n成功率：${pct(b.rate)}\n\n` +
    `基础成功率：${pct(b.base)}\n功德护持：+${pct(b.meritBonus)}\n失败补偿：+${pct(b.failBonus)}\n榜文牵引：-${pct(b.calamityPenalty)}\n\n` +
    `消耗道行：${formatInt(data.required_daoxing)}\n${data.pressure_label || ""}`;
  buttons.appendChild(
    popupButton("开始破劫", false, () => {
      closePopup();
      playTribulation(() => Game.confirmBreakthrough());
    })
  );
  buttons.appendChild(popupButton("暂缓闭关", true, () => closePopup()));
}

function playTribulation(done) {
  const fx = $("tribulation-fx");
  fx.classList.remove("hidden");
  preludeActive = true;
  setTimeout(() => {
    fx.classList.add("hidden");
    preludeActive = false;
    done();
  }, 1600);
}

// ---------------- 功能面板 ----------------

function openPanelSheet(key) {
  const state = Game.state;
  const cfg = NAV_UNLOCK[key];
  if (!cfg.check(state)) {
    Game.queuePopup({ kind: "text", title: "尚未开启", body: `${cfg.hint || "此功能尚未开启"}。`, buttons: [{ label: "知道了" }] });
    drainPopupQueue();
    return;
  }
  openPanel = key;
  renderPanelBody(key);
  $("panel-layer").classList.remove("hidden");
}

function closePanelSheet() {
  openPanel = "";
  $("panel-layer").classList.add("hidden");
}

function renderPanelBody(key) {
  const titles = { realm: "境界", map: "游历", spell: "术法", treasure: "本命法宝", chance: "机缘", log: "洞府" };
  $("panel-title").textContent = titles[key] || "";
  const body = $("panel-body");
  body.innerHTML = "";
  const state = Game.state;
  if (key === "realm") renderRealmPanel(body, state);
  if (key === "map") renderMapPanel(body, state);
  if (key === "spell") renderSpellPanel(body, state);
  if (key === "treasure") renderTreasurePanel(body, state);
  if (key === "chance") renderChancePanel(body, state);
  if (key === "log") renderLogPanel(body, state);
}

function note(text) {
  const div = document.createElement("div");
  div.className = "panel-note";
  div.textContent = text;
  return div;
}

function renderRealmPanel(body, state) {
  const realm = RealmManager.getCurrentRealm(state);
  const progress = RealmManager.getProgress(state);
  body.appendChild(
    note(
      `${realm.realm_name}｜${getTitle(state)}\n${realm.visual_state || ""}\n\n${realm.lore_text || ""}\n\n道行 ${formatInt(
        progress.current
      )} / ${formatInt(progress.required)}　战力 ${formatInt(RealmManager.getCombatPower(state))}`
    )
  );
  const breakthrough = BreakthroughManager.getAvailable(state);
  if (Object.keys(breakthrough).length) {
    body.appendChild(note(`${breakthrough.pressure_label || "劫将至"}：${breakthrough.breakthrough_lore || ""}`));
    const btn = popupButton(
      `${breakthrough.display_name}（${Math.round(BreakthroughManager.getSuccessRate(state) * 100)}%）`,
      false,
      () => {
        closePanelSheet();
        Game.requestBreakthrough();
      }
    );
    body.appendChild(btn);
  } else if (RealmManager.canLevelUp(state)) {
    body.appendChild(
      popupButton("道行已满，升重", false, () => {
        closePanelSheet();
        Game.levelUp();
      })
    );
  } else if (RealmManager.isCapped(state)) {
    body.appendChild(note("你已至地仙一重，当前版本修行暂止。"));
    body.appendChild(
      popupButton("查看天仙篇预告", false, () => {
        closePanelSheet();
        Game.showCapNotice();
      })
    );
  } else {
    const next = RealmManager.getNextRealm(state);
    body.appendChild(note(`下一境：${next.realm_name || "未知"}\n继续闭关或修行，积累道行。`));
  }
}

function renderMapPanel(body, state) {
  const maps = UnlockManager.getAvailableMaps(state);
  const power = RealmManager.getCombatPower(state);
  if (!maps.length) {
    body.appendChild(note("暂无可游历之地。"));
    return;
  }
  for (const map of maps) {
    const id = String(map.map_id);
    const card = document.createElement("div");
    card.className = "card" + (state.current_map_id === id ? " selected" : "");
    const info = document.createElement("div");
    info.className = "card-info";
    const name = document.createElement("div");
    name.className = "card-name";
    name.textContent = `${map.map_name}${state.current_map_id === id ? "（驻留中）" : ""}`;
    const desc = document.createElement("div");
    desc.className = "card-desc";
    desc.textContent = map.entry_text || map.narrative_desc || "";
    const cost = document.createElement("div");
    cost.className = "card-cost";
    cost.textContent = `推荐战力 ${formatInt(map.recommended_power)}｜你的战力 ${formatInt(power)}`;
    info.append(name, desc, cost);
    card.appendChild(info);

    const btnBox = document.createElement("div");
    btnBox.style.display = "flex";
    btnBox.style.flexDirection = "column";
    btnBox.style.gap = "6px";
    if (state.current_map_id !== id) {
      const selectBtn = document.createElement("button");
      selectBtn.className = "card-btn";
      selectBtn.textContent = "驻留此地";
      selectBtn.addEventListener("click", () => Game.selectMap(id));
      btnBox.appendChild(selectBtn);
    }
    const actionId = MAP_ACTION[id];
    if (actionId) {
      const actionRow = DataManager.getById("action_table", actionId);
      if (Object.keys(actionRow).length && UnlockManager.conditionMet(state, String(actionRow.unlock_realm))) {
        const goBtn = document.createElement("button");
        goBtn.className = "card-btn";
        goBtn.textContent = `${actionRow.action_name}（${actionRow.duration_sec}息）`;
        goBtn.disabled = !ActionManager.getAvailability(state, actionRow).ok;
        goBtn.addEventListener("click", () => {
          closePanelSheet();
          Game.startAction(actionId);
        });
        btnBox.appendChild(goBtn);
      }
    }
    card.appendChild(btnBox);
    body.appendChild(card);

    // Boss 卡
    const bossId = String(map.boss_id || "");
    const boss = DataManager.getById("boss_table", bossId);
    if (Object.keys(boss).length && UnlockManager.conditionMet(state, String(boss.unlock_condition || ""))) {
      const bossCard = document.createElement("div");
      bossCard.className = "card";
      const bossInfo = document.createElement("div");
      bossInfo.className = "card-info";
      const bossName = document.createElement("div");
      bossName.className = "card-name";
      const cleared = int(state.boss_clears[bossId]) > 0;
      bossName.textContent = `挑战：${boss.boss_name}${cleared ? "（已伏）" : ""}`;
      const bossDesc = document.createElement("div");
      bossDesc.className = "card-desc";
      bossDesc.textContent = boss.lore_text || "";
      const bossCost = document.createElement("div");
      bossCost.className = "card-cost";
      const rate = Math.round(BossManager.getWinRate(state, boss) * 100);
      const remain = Math.max(0, 3 - int(state.boss_counts_today[bossId]));
      bossCost.textContent = `推荐战力 ${formatInt(boss.recommended_power)}｜胜率 ${rate}%｜今日可挑战 ${remain} 次`;
      bossInfo.append(bossName, bossDesc, bossCost);
      bossCard.appendChild(bossInfo);
      const fightBtn = document.createElement("button");
      fightBtn.className = "card-btn";
      fightBtn.textContent = "斗法";
      fightBtn.disabled = remain <= 0;
      fightBtn.addEventListener("click", () => {
        closePanelSheet();
        Game.startBossBattle(bossId);
      });
      bossCard.appendChild(fightBtn);
      body.appendChild(bossCard);
    }
  }
}

function renderSpellPanel(body, state) {
  const spells = UnlockManager.getAvailableSpells(state);
  if (!spells.length) {
    body.appendChild(note("术法尚未开启。炼气士四重可观残符悟法。"));
    return;
  }
  body.appendChild(note("真仙之前，你所修仍是术法，不是神通。"));
  for (const spell of spells) {
    const id = String(spell.spell_id);
    const spellState = Game.getSpellState(id);
    const level = int(spellState.level);
    const maxLevel = Game.getSpellMaxLevel(spell);
    const nextLevel = level + 1;
    const cost = nextLevel <= maxLevel ? Game.getSpellUpgradeCost(spell, nextLevel) : null;
    const card = document.createElement("div");
    card.className = "card" + (level > 0 ? " selected" : "");
    const img = document.createElement("img");
    img.src = SPELL_ICONS[id] || "";
    img.alt = "";
    const info = document.createElement("div");
    info.className = "card-info";
    const name = document.createElement("div");
    name.className = "card-name";
    name.textContent = `${spell.spell_name}　${level > 0 ? `${level}重` : "未习得"}`;
    const desc = document.createElement("div");
    desc.className = "card-desc";
    desc.textContent = spell.lore_text || "";
    const costLine = document.createElement("div");
    costLine.className = "card-cost";
    costLine.textContent = cost
      ? nextLevel === 1
        ? "参悟：无需材料"
        : `升至${nextLevel}重：残页 ${formatInt(cost.spell_page_cost)}｜法力 ${formatInt(cost.mana_cost)}`
      : "已至当前境界上限";
    info.append(name, desc, costLine);
    const btn = document.createElement("button");
    btn.className = "card-btn";
    btn.textContent = level === 0 ? "参悟" : "升重";
    btn.disabled =
      !cost ||
      num(state.resources.spell_page) < num(cost?.spell_page_cost) ||
      num(state.resources.mana) < num(cost?.mana_cost);
    btn.addEventListener("click", () => {
      Game.upgradeSpell(id);
      renderPanelBody("spell");
    });
    card.append(img, info, btn);
    body.appendChild(card);
  }
}

function renderTreasurePanel(body, state) {
  if (Game.hasPendingTreasureChoice()) {
    body.appendChild(note("破劫成真人后，你的气机引动三件残宝，静待择主。"));
    body.appendChild(
      popupButton("本命法宝择主", false, () => {
        closePanelSheet();
        Game.queuePopup({ kind: "treasure_choice" });
        drainPopupQueue();
      })
    );
    return;
  }
  const treasures = UnlockManager.getAvailableTreasures(state);
  body.appendChild(note("法宝不是普通装备，而是护道根基。以法宝碎片与法力温养之。"));
  for (const treasure of treasures) {
    const id = String(treasure.treasure_id);
    const tState = Game.getTreasureState(id);
    const level = int(tState.level);
    const maxLevel = int(treasure.max_level_mvp, 5);
    const nextLevel = level + 1;
    const cost = nextLevel <= maxLevel ? Game.getTreasureUpgradeCost(treasure, nextLevel) : null;
    const card = document.createElement("div");
    card.className = "card" + (level > 0 ? " selected" : "");
    const img = document.createElement("img");
    img.src = TREASURE_ICONS[id] || "";
    img.alt = "";
    const info = document.createElement("div");
    info.className = "card-info";
    const name = document.createElement("div");
    name.className = "card-name";
    name.textContent = `${treasure.treasure_name}　${level > 0 ? `${level}重` : "未炼化"}｜${treasure.skill_name || ""}`;
    const desc = document.createElement("div");
    desc.className = "card-desc";
    desc.textContent = treasure.origin_desc || "";
    const costLine = document.createElement("div");
    costLine.className = "card-cost";
    costLine.textContent = cost
      ? `${nextLevel === 1 ? "炼化" : `温养至${nextLevel}重`}：碎片 ${formatInt(cost.treasure_shard_cost)}｜法力 ${formatInt(cost.mana_cost)}`
      : "已温养至极";
    info.append(name, desc, costLine);
    const btn = document.createElement("button");
    btn.className = "card-btn";
    btn.textContent = level === 0 ? "炼化" : "温养";
    btn.disabled =
      !cost ||
      num(state.resources.treasure_shard) < num(cost?.treasure_shard_cost) ||
      num(state.resources.mana) < num(cost?.mana_cost);
    btn.addEventListener("click", () => {
      Game.upgradeTreasure(id);
      renderPanelBody("treasure");
    });
    card.append(img, info, btn);
    body.appendChild(card);
  }
}

function renderChancePanel(body, state) {
  if (state.pending_event_id) {
    const eventRow = Game.getPendingEvent();
    body.appendChild(note(`有一段机缘尚未抉择：「${eventRow.event_name || ""}」`));
    body.appendChild(
      popupButton("查看机缘", false, () => {
        closePanelSheet();
        Game.openPendingEvent();
      })
    );
    return;
  }
  body.appendChild(note("天边榜文碎光初现，天地灵机开始动荡。\n闭关、游历、升重、破劫时，都可能遇到机缘。"));
  const observeRow = DataManager.getById("action_table", "observe_seal");
  if (Object.keys(observeRow).length && UnlockManager.conditionMet(state, String(observeRow.unlock_realm))) {
    const avail = ActionManager.getAvailability(state, observeRow);
    const btn = popupButton(avail.ok ? "观榜悟道" : `观榜悟道（${avail.reason}）`, !avail.ok, () => {
      if (!avail.ok) return;
      closePanelSheet();
      Game.startAction("observe_seal");
    });
    body.appendChild(btn);
  }
  const seenToday = Object.values(state.event_counts_today).reduce((a, b) => a + int(b), 0);
  body.appendChild(note(`今日已得机缘 ${seenToday} 次。机缘随天时流转，明日又是新机。`));
}

function renderLogPanel(body, state) {
  body.appendChild(note(`入道第 ${UnlockManager.currentDay(state)} 天`));
  if (!state.logs.length) {
    body.appendChild(note("修行日志空空如也。"));
  }
  for (const line of state.logs) {
    const div = document.createElement("div");
    div.className = "log-line";
    div.textContent = line;
    body.appendChild(div);
  }
  const resetBtn = popupButton("重入轮回（清空存档）", true, () => {
    if (confirm("确定要重入轮回？当前修行进度将全部清空。")) {
      closePanelSheet();
      Game.resetSave();
    }
  });
  body.appendChild(resetBtn);
}

// ---------------- 启动 ----------------

async function boot() {
  await DataManager.loadAll();

  $("main-btn").addEventListener("click", onMainButtonClick);
  $("auto-toggle").addEventListener("click", () => Game.toggleAutoRepeat());
  $("hint-bar").addEventListener("click", () => {
    if (currentSuggestion) openPanelSheet(currentSuggestion.panel);
  });
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => openPanelSheet(btn.dataset.panel));
  });
  $("panel-close").addEventListener("click", closePanelSheet);
  $("panel-layer").addEventListener("click", (e) => {
    if (e.target === $("panel-layer")) closePanelSheet();
  });

  Game.onChange = render;
  Game.init();

  if (Game.debug) {
    $("debug-bar").classList.remove("hidden");
    $("debug-ff").addEventListener("click", () => Game.fastForward(360));
    $("debug-res").addEventListener("click", () => Game.debugAddResources());
  }

  setInterval(() => Game.tick(), 250);
}

boot();
