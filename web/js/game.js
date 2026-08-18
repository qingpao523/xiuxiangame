/* 封神修道录 · Game — 聚合入口 & 主按钮状态机 */

"use strict";

// ---------------- 真灵上榜（斗法失败化神位加持） ----------------

const GOD_SEATS = [
  { id: "leibu", name: "雷部正神位", desc: "斗法伤害 +5%", effects: { dmgBonus: 0.05 } },
  { id: "huobu", name: "火部正神位", desc: "燃烧层数 +2", effects: { burnBonus: 2 } },
  { id: "doubu", name: "斗部正神位", desc: "斗法开局罡气 +8%", effects: { startBlockRatio: 0.08 } },
  { id: "shuibu", name: "水部正神位", desc: "每回合回复 1.5% 气血", effects: { turnHealRatio: 0.015 } },
  { id: "wenbu", name: "瘟部正神位", desc: "敌方攻击 -5%", effects: { enemyWeaken: 0.05 } },
  { id: "caibu", name: "财部正神位", desc: "斗法战利 +10%", effects: { lootBonus: 0.1 } },
];

function godSeat(state, key) {
  let total = 0;
  for (const id of state.god_seats || []) {
    const seat = GOD_SEATS.find((s) => s.id === id);
    total += num(seat?.effects?.[key]);
  }
  return total;
}

// (INSIGHT_CHOICES + rollInsights defined in constants.js)

// ---------------- 天象 / 称号 ----------------

function getWeather(state) {
  const realm = RealmManager.getCurrentRealm(state);
  const major = String(realm.major_realm || "炼气士");
  if (major === "地仙") return "榜文照身，未曾留名";
  if (major === "真人") {
    if (DataManager.isRealmAtLeast(state.realm_id, "zr_08")) return "榜文垂光，真灵受牵";
    if (num(state.resources.merit) > 0 || num(state.resources.calamity) > 0) return "功德与劫气并现";
    return "陈塘风雷，远潮渐起";
  }
  if (DataManager.isRealmAtLeast(state.realm_id, "rq_06")) return "榜文碎光，初照山野";
  return "山野清寂，大劫未近";
}

function getTitle(state) {
  const major = String(RealmManager.getCurrentRealm(state).major_realm || "炼气士");
  if (major === "地仙" || UnlockManager.isUnlocked(state, "title_榜外散修")) return "榜外散修";
  if (major === "真人") return "初成真人";
  return "无名散修";
}

// 今日当值大阵（按真实星期轮转）
function getTodayArray() {
  const weekday = new Date().getDay();
  return DataManager.getRows("array_table").find((row) => (row.weekdays || []).includes(weekday)) || {};
}

// ---------------- Game 聚合入口 ----------------

const Game = {
  state: {},
  pendingOfflineReward: {},
  popupQueue: [],
  onChange: null,
  debug: false,
  eventPopupActive: false,
  toastMessage: null,

  init() {
    this.debug = new URLSearchParams(location.search).get("debug") === "1";
    const fresh = !localStorage.getItem(SAVE_KEY);
    this.state = SaveManager.loadOrCreate();
    UnlockManager.refresh(this.state);
    this._refreshPendingReward();
    const showPrologue = fresh || (!this.state.flags.prologue_seen && this._isUnstartedRun());
    if (showPrologue) this.queuePopup({ kind: "prologue" });
    if (fresh) {
      this._log("你于山野洞府中睁开眼，开始修行。");
      this.queuePopup({ kind: "race_choice" });
      this.queuePopup({ kind: "text", style: "seal", title: "封神修道录",
        body: "商周兵火尚远，封神榜未显。\n你只是山野洞府中一名无名炼气士。\n若想在将来的大劫中活下去，先从吐纳一轮周天开始。",
        buttons: [{ label: "开始修行" }] });
      this.queuePopup({ kind: "text", style: "chance", title: "榜文远眺",
        body: "吐纳之余，你登岩远眺——\n极东天际，悬着一页残破的金色榜文，日月之光都要绕它而行。\n\n哪吒尚未闹海，姜子牙尚未下山，但那页榜文已开始收拢天下的气数。\n山中妖物一日比一日躁动，像是被什么东西催着赶路。\n\n你不知道那是什么。\n只知道从今往后，修行不只是为了长生——是为了在榜文照到你之前，有护住自己的本钱。",
        buttons: [{ label: "回洞修行" }] });
    } else if (!str(this.state.race_id, "") && !this.state.flags.race_choice_done) {
      this.queuePopup({ kind: "race_choice" });
    } else if (int(this.pendingOfflineReward.minutes) >= 5) {
      this.queuePopup({ kind: "text", style: "seal", title: "出关",
        body: `你已闭关 ${formatDuration(int(this.pendingOfflineReward.minutes))}。\n山中灵气渐渐汇入周身，可以出关收束道行了。`,
        buttons: [{ label: "出关领取", action: "claim_offline" }, { label: "继续闭关" }] });
    }
    this._checkWorldMapReveal();
    SaveManager.save(this.state);
    this._emit();
  },

  _checkWorldMapReveal() {
    if (!DataManager.isRealmAtLeast(this.state.realm_id, "rq_03")) return;
    if (this.state.flags.world_map_seen) return;
    this.state.flags.world_map_seen = true;
    this.queuePopup({ kind: "world_map" });
  },

  _isUnstartedRun() {
    const s = this.state;
    const actions = Object.values(s.action_counts_total || {}).reduce((sum, n) => sum + int(n), 0);
    return String(s.realm_id || "") === "rq_01" && int(s.completed_goals.length) === 0 && actions === 0;
  },

  markPrologueSeen() {
    if (this.state.flags.prologue_seen) return;
    this.state.flags.prologue_seen = true;
    SaveManager.save(this.state);
    this._emit();
  },

  queuePopup(popup) { this.popupQueue.push(popup); this._emit(); },

  toast(title, body, duration = 2400) {
    this.toastMessage = { id: Date.now() + Math.random(), title, body, duration };
    this._emit();
  },

  tick() {
    let changed = false;
    const action = this.state.current_action;
    if (action && action.encounters) {
      for (const enc of action.encounters) {
        if (!enc.fired && nowMs() >= num(enc.at)) { enc.fired = true; this.queuePopup({ kind: "encounter", encounterId: enc.id }); changed = true; }
      }
    }
    if (action && nowMs() >= num(action.end_time_ms)) { this._finishAction(); changed = true; }
    this._refreshPendingReward();
    if (changed) this._afterMutated();
    this._emit();
  },

  // ---------- 在线动作 ----------

  startAction(actionId) {
    const row = DataManager.getById("action_table", actionId);
    if (!Object.keys(row).length) return;
    const avail = ActionManager.getAvailability(this.state, row);
    if (!avail.ok) { this.queuePopup({ kind: "text", title: row.action_name, body: avail.reason + "。", buttons: [{ label: "知道了" }] }); return; }
    const duration = int(row.duration_sec);
    if (duration <= 0) { this.state.current_action = { action_id: actionId, end_time_ms: nowMs() }; this._finishAction(); this._afterMutated(); return; }
    this.state.current_action = { action_id: actionId, start_time_ms: nowMs(), end_time_ms: nowMs() + duration * 1000 };
    this._setupActionExtras(row, this.state.current_action);
    this._log(String(row.start_text || `你开始${row.action_name}。`));
    SaveManager.save(this.state);
    this._emit();
  },

  _setupActionExtras(row, action) {
    const duration = int(row.duration_sec);
    if (row.map_id) {
      const pool = DataManager.getRows("encounter_table").filter((e) => {
        if (String(e.map_id) !== String(row.map_id)) return false;
        const rp = e.requires_point; // 探索点接遭遇（design/6.6）：未发现该秘境则不刷出
        if (rp && !(this.state.explored_points || []).includes(String(rp))) return false;
        return true;
      });
      const picked = []; const copy = [...pool];
      while (copy.length && picked.length < 2) picked.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
      action.encounters = picked.map((e, i) => ({ id: String(e.encounter_id), at: num(action.start_time_ms) + (i === 0 ? 8000 : 20000), fired: false }));
    }
    if (String(row.action_id) === "breath_cycle" && duration >= 9) {
      action.beat_windows = [3000, 6000, 9000].map((off) => ({ off, hit: false })); action.beats = 0;
    }
  },

  _finishAction() {
    const current = this.state.current_action;
    this.state.current_action = null;
    if (!current) return;
    const row = DataManager.getById("action_table", String(current.action_id));
    if (!Object.keys(row).length) return;
    const id = String(row.action_id);
    this.state.action_counts_total[id] = int(this.state.action_counts_total[id]) + 1;
    this.state.action_counts_today[id] = int(this.state.action_counts_today[id]) + 1;
      if (row.map_id) { if (!this.state.map_explores) this.state.map_explores = {}; this.state.map_explores[String(row.map_id)] = int(this.state.map_explores[String(row.map_id)]) + 1; this._checkExploreDiscovery(String(row.map_id)); }
    let rewardText = "", blessText = "";
    const minutes = int(row.reward_minutes_equivalent);
    if (minutes > 0) {
      const reward = RewardManager.calculateRewardForMinutes(this.state, minutes, { includeMap: row.reward_type === "map_equivalent", mapId: row.map_id || undefined });
      const caught = int(current.caught); const beats = int(current.beats);
      if (caught > 0 || beats > 0) {
        const b = Math.min(0.75, caught * 0.15 + beats * 0.15);
        for (const rid of Object.keys(reward.resources)) reward.resources[rid] = Math.round(num(reward.resources[rid]) * (1 + b));
        const parts = []; if (caught > 0) parts.push(`拾得 ${caught} 缕灵光`); if (beats > 0) parts.push(`完美吐纳 ${beats} 次`);
        blessText = `\n气机加持：${parts.join("，")}，收益 +${Math.round(b * 100)}%`;
      }
      this._applyResourceDelta(reward.resources);
      rewardText = this._formatResourceDelta(reward.resources);
    }
    let extraRewardText = "";
    if (row.reward_resources && Object.keys(row.reward_resources).length) {
      const fixed = {};
      for (const rid of Object.keys(row.reward_resources)) fixed[rid] = num(row.reward_resources[rid]);
      this._applyResourceDelta(fixed); extraRewardText = this._formatResourceDelta(fixed);
    }
    let eventTriggered = false;
    if (!this.state.pending_event_id) {
      let eventChance = num(row.event_chance) * (str(this.state.race_id, "") === "qilin" ? 1.3 : 1);
      if (this.state.flags.insight_event_boost) { eventChance *= 2; delete this.state.flags.insight_event_boost; }
        if (this.hasDivinationBoost("event_boost")) eventChance *= 1.8; // P1 占卜「明日机缘」
      if (row.force_event && EventManager.canOffer(this.state, String(row.force_event))) {
        this._setPendingEvent(String(row.force_event)); eventTriggered = true;
      } else if (eventChance > 0 && Math.random() <= eventChance) {
        const source = row.reward_type === "map_equivalent" ? "travel" : "offline";
        const eventId = EventManager.rollEvent(this.state, source);
        if (eventId) { this._setPendingEvent(eventId); eventTriggered = true; }
      }
    }
    this._log(String(row.complete_text || `${row.action_name}结束。`));
    const allRewardText = [rewardText, extraRewardText].filter(Boolean).join("\n");
    const autoOn = !!this.state.flags.auto_repeat && int(row.duration_sec) > 0;
    let chained = false;
    if (autoOn && !eventTriggered) {
      const avail = ActionManager.getAvailability(this.state, row);
      if (avail.ok) { this.state.current_action = { action_id: id, start_time_ms: nowMs(), end_time_ms: nowMs() + int(row.duration_sec) * 1000 }; chained = true; }
      else { this._log(`连续修行停歇：${avail.reason}。`); }
    }
    const completionBody = `${row.complete_text || ""}${allRewardText ? `\n\n获得：\n${allRewardText}` : ""}${blessText}`;
    const firstBreath = id === "breath_cycle" && int(this.state.action_counts_total[id]) === 1;
    if (chained) {
      this._log(`连续修行：${completionBody.replace(/\n/g, " ")}`);
    } else if (firstBreath) {
      this.queuePopup({ kind: "text", style: "seal", title: "吐纳完成！",
        body: `你盘膝吐纳，运转一轮小周天。\n山中灵气被缓缓牵引，化作一缕道行归入体内。\n\n获得：\n${allRewardText}${blessText}\n\n体内气机已动，可以提升境界了。`,
        buttons: [{ label: "收功" }] });
    } else {
      // 第一层·微反馈：气韵为主，数字退为次级（design/6.0）
        const qiyun = Atmosphere.actionLine(id, this.state);
        const compact = [allRewardText, blessText].filter(Boolean).join(" ").replace(/\n/g, " ");
        this.toast(qiyun, compact);
    }
    if (eventTriggered) this._queueEventPopup();
  },

  applyInsight(choiceId, payload = {}) {
    const snap = payload.rewardSnapshot || {};
    switch (choiceId) {
      case "gain": {
        const bonus = {};
        for (const id of Object.keys(snap)) bonus[id] = Math.max(1, Math.round(num(snap[id]) * 0.1));
        if (Object.keys(bonus).length) { this._applyResourceDelta(bonus); this._log(`心得·灵气归元：收益再添一成（${this._formatResourceDelta(bonus)}）。`); }
        else { this._log("心得·灵气归元：本轮本无所得，心法默运一周天。"); }
        break;
      }
      case "event": this.state.flags.insight_event_boost = true; this._log("心得·神识外放：你凝神感应天地，下一次行动更易遭遇机缘。"); break;
      case "battle": this.state.battle_blessing = { block_ratio: 0.08, shield: 1, battles: 1 }; this._log("心得·筋骨淬炼：下一场斗法开局罡气 +8%、圣盾 1 层。"); break;
      case "daoxing": { const g = { daoxing: num(RewardManager.calculateRewardForMinutes(this.state, 2, { includeMap: false }).resources.daoxing) }; this._applyResourceDelta(g); this._log(`心得·明心见性：道行 +${formatInt(g.daoxing)}。`); break; }
      case "mana": { const g = { mana: num(RewardManager.calculateRewardForMinutes(this.state, 3, { includeMap: false }).resources.mana) }; this._applyResourceDelta(g); this._log(`心得·引气入体：法力 +${formatInt(g.mana)}。`); break; }
      default: return;
    }
    this._afterMutated();
  },

  toggleAutoRepeat() {
    this.state.flags.auto_repeat = !this.state.flags.auto_repeat;
    this._log(this.state.flags.auto_repeat ? "你决意连续修行，不问昼夜。" : "你放缓节奏，随缘修行。");
    SaveManager.save(this.state); this._emit();
  },

  collectSparkle(type = "daoxing", combo = 1) {
    if (!this.state.current_action) return null;
    const realm = RealmManager.getCurrentRealm(this.state);
    const comboMult = Math.min(2, 1 + 0.25 * (Math.max(1, combo) - 1));
    const daoxingRaceMult = str(this.state.race_id, "") === "human" ? 1.05 : 1;
    const gain = {};
    if (type === "mana") { gain.mana = Math.max(20, Math.round(num(realm.base_mana_per_min) * 4 * comboMult)); }
    else if (type === "tianji") {
      if (this.state.seen_resources.includes("spell_page")) { gain.spell_page = combo >= 3 ? 2 : 1; }
      else { gain.daoxing = Math.max(2, Math.round(num(realm.base_daoxing_per_min) * 6 * comboMult * daoxingRaceMult)); }
    } else { gain.daoxing = Math.max(1, Math.round(num(realm.base_daoxing_per_min) * 3 * comboMult * daoxingRaceMult)); }
    this._applyResourceDelta(gain);
    this.state.current_action.caught = int(this.state.current_action.caught) + 1;
    SaveManager.save(this.state); this._emit();
    return gain;
  },

  sparkleGuide() {
    if (this.state.flags.sparkle_guide_seen) return false;
    this.state.flags.sparkle_guide_seen = true;
    this._log("修行之际，天地灵机第一次凝成灵光。");
    this.queuePopup({ kind: "text", style: "seal", title: "灵光初现",
      body: "修行入定之际，天地灵机偶尔会在你身周凝成一点金色灵光。\n\n看到灵光浮现时，伸手点它，即可额外拾得一缕道行与法力。\n\n灵光稍纵即逝，不点则散。第一缕灵光会等你来取。",
      buttons: [{ label: "伸手一试" }] });
    SaveManager.save(this.state); this._emit();
    return true;
  },

  registerBeat() {
    const action = this.state.current_action;
    if (!action || !action.beat_windows) return false;
    const elapsed = nowMs() - num(action.start_time_ms);
    for (const w of action.beat_windows) {
      if (!w.hit && Math.abs(elapsed - num(w.off)) <= 800) { w.hit = true; action.beats = int(action.beats) + 1; SaveManager.save(this.state); this._emit(); return true; }
    }
    return false;
  },

  isInBeatWindow() {
    const action = this.state.current_action;
    if (!action || !action.beat_windows) return false;
    const elapsed = nowMs() - num(action.start_time_ms);
    return action.beat_windows.some((w) => !w.hit && Math.abs(elapsed - num(w.off)) <= 800);
  },

  // ---------- 游历遭遇 ----------

  resolveEncounter(encounterId, optionIndex) {
    const enc = DataManager.getById("encounter_table", encounterId);
    if (!Object.keys(enc).length) return;
    // --- New format (encounter_type field) ---
    if (enc.encounter_type) {
      this._resolveNewEncounter(enc, optionIndex);
      return;
    }
    // --- Old format (options array) ---
    const option = (enc.options || [])[optionIndex];
    if (!option) return;
    if (option.kind === "battle") {
      const map = DataManager.getById("map_table", String(enc.map_id));
      const enemyPower = Math.max(50, Math.round(num(map.recommended_power, 300) * num(option.enemy_power_ratio, 0.25)));
      this.startBattle({ name: String(option.enemy_name || enc.name), enemy_power: enemyPower, source: "encounter", payload: { encounterId, optionIndex } });
      return;
    }
    if (option.kind === "safe") { this._applyEncounterOutcome(enc, option.success, true); return; }
    let chance = num(option.chance, 0.6) + num(getTodayOmen().checkBonus, 0);
    if (option.bonus_spell_type) {
      for (const row of DataManager.getRows("spell_table")) {
        if (String(row.spell_type) !== String(option.bonus_spell_type)) continue;
        chance += int(this.state.spells[String(row.spell_id)]?.level) * num(option.bonus_per_level, 0.05);
      }
    }
    const ok = Math.random() <= clamp(chance, 0.05, 0.95);
    this._applyEncounterOutcome(enc, ok ? option.success : option.fail, ok);
  },

  _resolveNewEncounter(enc, optionIndex) {
    const type = String(enc.encounter_type);
    const name = String(enc.encounter_name || "遭遇");
    if (type === "battle") {
      const cfg = enc.battle_config || {};
      const map = DataManager.getById("map_table", String(enc.map_id));
      const ratio = num(cfg.power_ratio, 0.2);
      const enemyPower = Math.max(50, Math.round(num(map.recommended_power, 300) * ratio));
      this.startBattle({ name: String(cfg.enemy_name || name), enemy_power: enemyPower, source: "encounter", payload: { encounterId: enc.encounter_id, optionIndex } });
      return;
    }
    if (type === "choice") {
      const choices = enc.choices || [];
      const choice = choices[optionIndex];
      if (!choice) return;
      const result = choice.result || {};
      const resources = { ...(result.resources || {}) };
      this._applyFactionMeritBonus(resources);
      if (Object.keys(resources).length) this._applyResourceDelta(resources);
      const deltaText = this._formatResourceDelta(resources);
      this._log(`遭遇「${name}」：${choice.label}。`);
      this.toast(`遭遇·${name}`, `${result.log || ""}${deltaText ? "\n\n获得：\n" + deltaText : ""}`);
      this._afterMutated();
      return;
    }
    if (type === "gather") {
      const reward = enc.gather_reward || {};
      const resources = {};
      for (const k of Object.keys(reward)) { if (k !== "log") resources[k] = num(reward[k]); }
      this._applyFactionMeritBonus(resources);
      if (Object.keys(resources).length) this._applyResourceDelta(resources);
      const deltaText = this._formatResourceDelta(resources);
      this._log(`遭遇「${name}」：采集。`);
      this.toast(`遭遇·${name}`, `${reward.log || ""}${deltaText ? "\n\n获得：\n" + deltaText : ""}`);
      this._afterMutated();
      return;
    }
    if (type === "narrative") {
      this._log(`遭遇「${name}」。`);
      this._afterMutated();
      return;
    }
  },

  _applyEncounterOutcome(enc, outcome, ok) {
    outcome = outcome || {};
    const resources = { ...(outcome.resources || {}) };
    if (outcome.chance_extra && Math.random() <= num(outcome.chance_extra.chance)) mergeResources(resources, outcome.chance_extra.resources || {});
    this._applyFactionMeritBonus(resources);
    if (Object.keys(resources).length) this._applyResourceDelta(resources);
    const deltaText = this._formatResourceDelta(resources);
    this._log(`遭遇「${enc.name}」：${ok ? "有惊无险" : "小挫而退"}。`);
    this.queuePopup({ kind: "text", style: ok ? "goal" : "chance", title: `遭遇·${enc.name}`,
      body: `${outcome.text || ""}${deltaText ? `\n\n${ok ? "获得" : "损失"}：\n${deltaText}` : ""}`, buttons: [{ label: "继续赶路" }] });
    this._afterMutated();
  },

  // ---------- 斗法 ----------

  startBattle(cfg) { const battle = BattleEngine.create(this.state, cfg); this.queuePopup({ kind: "battle", battle }); this._emit(); return battle; },

  startBossBattle(bossId) {
    const boss = DataManager.getById("boss_table", bossId);
    if (!Object.keys(boss).length) return;
    if (!BossManager.canChallenge(this.state, bossId)) { this.queuePopup({ kind: "text", title: "挑战", body: "此地妖气未聚，明日再来。", buttons: [{ label: "知道了" }] }); return; }
    this.state.boss_counts_today[bossId] = int(this.state.boss_counts_today[bossId]) + 1;
    this._log(`你踏入${boss.boss_name}的巢穴，妖气扑面而来。`);
    const adds = { boss_002: [{ name: "巡海残兵", power: num(boss.recommended_power) * 0.2 }],
      boss_003: [{ name: "白骨阴火", power: num(boss.recommended_power) * 0.12 }, { name: "白骨阴火", power: num(boss.recommended_power) * 0.12 }] }[bossId] || [];
    const mechanic = boss.mechanics ? String(boss.mechanics).split(":")[0].trim() : null;
    this.startBattle({ name: String(boss.boss_name), enemy_power: num(boss.recommended_power), adds, source: "boss", mechanic, weakness: boss.weakness || null, payload: { bossId } });
    this._afterMutated();
  },

  getArrayAvailability() {
    const today = getTodayArray();
    if (!Object.keys(today).length) return { ok: false, reason: "今日无杀阵开启。大劫未至，阵势敛息。" };
    if (!UnlockManager.conditionMet(this.state, String(today.unlock_realm || ""))) return { ok: false, reason: "境界不足，阵门不启。" };
    const id = String(today.array_id);
    const remain = 2 - int(this.state.array_counts_today[id]);
    if (remain <= 0) return { ok: false, reason: "今日此阵已闯过两遭，阵势自闭。" };
    return { ok: true, array: today, remain };
  },

  startArrayBattle() {
    const avail = this.getArrayAvailability();
    if (!avail.ok) { this.queuePopup({ kind: "text", title: "杀劫大阵", body: avail.reason, buttons: [{ label: "知道了" }] }); return; }
    const arr = avail.array;
    const id = String(arr.array_id);
    this.state.array_counts_today[id] = int(this.state.array_counts_today[id]) + 1;
    this._log(`你踏入${arr.array_name}，杀劫阵势轰然合拢。`);
    const phases = (arr.phases || []).map((p) => ({ name: String(p.name), power_ratio: num(p.power_ratio, 0.7), intro: String(p.intro || ""), pool: ARRAY_INTENTS[String(p.pool)] || ARRAY_INTENTS.zhenshi }));
    this.startBattle({ name: arr.array_name, source: "array", phases, bannerLabel: "阵势", payload: { arrayId: id } });
    this._afterMutated();
  },

  battlePlayCard(battle, handIndex, targetIndex = 0) { const events = BattleEngine.playCard(this.state, battle, handIndex, targetIndex); this._emit(); return events; },
  battleEndTurn(battle) { const events = BattleEngine.endPlayerTurn(this.state, battle); this._emit(); return events; },
  battleAutoStep(battle) { const result = BattleEngine.autoStep(this.state, battle); this._emit(); return result; },
  battleToggleManual(battle) { BattleEngine.toggleManual(this.state, battle); this._emit(); return battle.manual; },
  battleRefreshHand(battle) { const result = BattleEngine.refreshHand(this.state, battle); this._emit(); return result; },

  finishBattle(battle) {
    const omen = getTodayOmen();
    if (battle.source === "breakthrough") { /* 破劫结算 */
      const btId = String(battle.payload.breakthroughId || "");
      const data = DataManager.getById("breakthrough_table", btId);
      if (!Object.keys(data).length) return;
      const before = new Set(this.state.unlocked_ids);
      if (battle.win) {
          BreakthroughManager.applyVictory(this.state, data); UnlockManager.refresh(this.state);
          this._log(String(data.success_text || "破劫成功。"));
          // 第三层·大画卷：破劫是质变，给一整幅沉浸演出；机械结算延后到画卷结束（design/6.0）
          const afterScene = () => {
            this._queueNewUnlockPopups(before);
            this._maybeTriggerBenming(btId);
            if (this.hasPendingTreasureChoice()) this.queuePopup({ kind: "treasure_choice" });
            if (String(this.state.realm_id) === "dx_01") this.showCapNotice();
            this._afterMutated();
          };
          if (Atmosphere.breakthroughScene(btId)) {
            Atmosphere.playBreakthrough(btId, afterScene);
            return;
          }
          this.queuePopup({ kind: "text", style: "breakthrough", title: "破劫成功！", body: String(data.success_text || "破劫成功。"), buttons: [{ label: "踏入新境" }] });
          this._queueNewUnlockPopups(before);
          this._maybeTriggerBenming(btId);
          if (this.hasPendingTreasureChoice()) this.queuePopup({ kind: "treasure_choice" });
          if (String(this.state.realm_id) === "dx_01") this.showCapNotice();
        } else {
        BreakthroughManager.applyDefeat(this.state, data);
        this._log(String(data.fail_text || "破劫未成，但道心更稳。"));
        this.queuePopup({ kind: "text", style: "breakthrough", title: "破劫失败",
          body: `${data.fail_text || "破劫未成。"}\n\n获得：劫火淬体\n下次破劫因果护持更深（成功率 +${Math.round(num(data.fail_bonus) * 100)}%），屡败之后劫火淬体\n法力小幅补偿\n\n道行未散。`,
          buttons: [{ label: "稳住道心" }] });
      }
      this._afterMutated(); return;
    }
    if (battle.source === "boss") { /* Boss 结算 */
      const bossId = String(battle.payload.bossId || "");
      const boss = DataManager.getById("boss_table", bossId);
      if (battle.win) {
        const rewards = { daoxing: num(boss.reward_daoxing), mana: num(boss.reward_mana) };
        mergeResources(rewards, boss.reward_items || {});
        const omenLoot = num(omen.lootMult, 1);
        const raceLoot = str(this.state.race_id, "") === "yao" ? 1.25 : 1;
        const seatLoot = 1 + godSeat(this.state, "lootBonus");
        for (const id of Object.keys(rewards)) rewards[id] = Math.round(num(rewards[id]) * omenLoot * raceLoot * seatLoot);
        this._applyResourceDelta(rewards);
        const firstClear = int(this.state.boss_clears[bossId]) === 0;
        this.state.boss_clears[bossId] = int(this.state.boss_clears[bossId]) + 1;
        this._log(`你击败了${boss.boss_name}。`);
        const lootLines = [];
        if (omenLoot > 1) lootLines.push(`${omen.name}：战利 +${Math.round((omenLoot - 1) * 100)}%`);
        if (raceLoot > 1) lootLines.push(`万灵之体·吞噬：战利 +${Math.round((raceLoot - 1) * 100)}%`);
        this.queuePopup({ kind: "text", style: "breakthrough", title: "挑战胜利！",
          body: `${boss.victory_text || ""}\n\n获得：\n${this._formatResourceDelta(rewards)}${lootLines.length ? `\n\n${lootLines.join("\n")}` : ""}`,
          buttons: [{ label: "收取战利" }] });
        if (firstClear && boss.first_clear_event && !this.state.pending_event_id) {
          if (EventManager.canOffer(this.state, String(boss.first_clear_event))) { this._setPendingEvent(String(boss.first_clear_event)); this._queueEventPopup(); }
        }
        this._queueRestPopup(bossId);
      } else {
        const consolation = Math.floor(num(boss.reward_mana) * 0.1);
        this.state.resources.mana = num(this.state.resources.mana) + consolation;
        const seatText = this.awardGodSeat();
        this._log(`你与${boss.boss_name}斗法失利，暂退回府。`);
        this.queuePopup({ kind: "text", title: "斗法失利",
          body: `${boss.boss_name}妖气正盛，你且战且退，未伤根本。\n\n拾得游离灵气：法力 +${formatInt(consolation)}\n${seatText}\n\n再积累些道行与术法，改日再来。`,
          buttons: [{ label: "暂且退去" }] });
      }
      this._afterMutated(); return;
    }
    if (battle.source === "array") { /* 杀阵结算 */
      const arrId = String(battle.payload.arrayId || "");
      if (battle.win) {
        const realm = RealmManager.getCurrentRealm(this.state);
        const daoxingReward = Math.round(num(realm.base_daoxing_per_min) * 30 * (0 + 3 * int(realm.minor_level)) * (1 + godSeat(this.state, "dmgBonus")));
        const firstWin = !this.state.array_wins[arrId];
        this.state.array_wins[arrId] = int(this.state.array_wins[arrId]) + 1;
        const rewards = { daoxing: daoxingReward, merit: 30 + (firstWin ? 50 : 0), calamity: 20 };
        if (firstWin) rewards.treasure_shard = 5;
        this._applyResourceDelta(rewards);
        this._log(`你破阵而出：${this._formatResourceDelta(rewards)}。`);
        this.queuePopup({ kind: "text", style: "breakthrough", title: "破阵而出！",
          body: `阵纹消散，杀劫暂退。\n\n获得：\n${this._formatResourceDelta(rewards)}${firstWin ? "\n\n首通之阵，法宝碎片落入囊中。" : ""}`,
          buttons: [{ label: "收功" }] });
      } else {
        const seatText = this.awardGodSeat();
        this._log(`你被${battle.name}击退，阵势余波将你震出。`);
        this.queuePopup({ kind: "text", title: "败阵", body: `你被阵势余波震出，虽败不伤。\n${seatText}\n\n待修为再进，可重闯此阵。`, buttons: [{ label: "暂且退去" }] });
      }
      this._afterMutated(); return;
    }
    /* 遭遇斗法结算 */
    const enc = DataManager.getById("encounter_table", String(battle.payload.encounterId || ""));
    const option = (enc.options || [])[int(battle.payload.optionIndex)];
    if (enc && option) {
      const outcome = { ...(battle.win ? option.success : option.fail) };
      if (!battle.win) outcome.text = String(outcome.text || "") + this.awardGodSeat();
      const omenLoot = battle.win ? num(omen.lootMult, 1) : 1;
      const raceLoot = battle.win && str(this.state.race_id, "") === "yao" ? 1.25 : 1;
      if (outcome && outcome.resources && omenLoot * raceLoot > 1) {
        const boosted = {};
        for (const id of Object.keys(outcome.resources)) boosted[id] = Math.round(num(outcome.resources[id]) * omenLoot * raceLoot);
        let text = String(outcome.text || "");
        if (raceLoot > 1) text += "\n万灵之体·吞噬：战利 +25%。";
        this._applyEncounterOutcome(enc, { ...outcome, resources: boosted, text }, battle.win);
      } else { this._applyEncounterOutcome(enc, outcome, battle.win); }
    }
  },

  // ---------- 封神人物因缘 ----------

  _checkCompanions() {
    for (const row of DataManager.getRows("companion_table")) {
      const id = String(row.companion_id);
      if (!UnlockManager.conditionMet(this.state, String(row.unlock_realm || ""))) continue;
      if (!this.state.companions[id]) this.state.companions[id] = { stage: 0, bonded: false };
      const c = this.state.companions[id];
      const stages = row.stages || [];
      let guard = 0;
      while (!c.bonded && guard++ < 10) {
        if (c.stage >= stages.length) { this._bondCompanion(row); break; }
        const st = stages[c.stage];
        if (!this._companionConditionMet(st.condition)) break;
        c.stage += 1;
        this._log(`因缘·${row.name}：${st.title}。`);
        this.queuePopup({ kind: "text", style: "seal", title: `因缘·${row.name}｜${st.title}`, body: String(st.text || ""), buttons: [{ label: "继续" }] });
        if (c.stage >= stages.length) this._bondCompanion(row);
      }
    }
  },

  _companionConditionMet(cond = {}) {
    const s = this.state;
    switch (cond.type) {
      case "auto": return true;
      case "realm": return DataManager.isRealmAtLeast(s.realm_id, String(cond.realm_id));
      case "boss_cleared": {
        const clears = int(s.boss_clears[String(cond.boss_id)]);
        return clears >= int(cond.count, 1);
      }
      case "array_win": return Object.values(s.array_wins).some((n) => int(n) > 0);
      case "array_win_count": {
        const total = Object.values(s.array_wins).reduce((sum, n) => sum + int(n), 0);
        return total >= int(cond.value, 1);
      }
      case "event_seen": return s.seen_events.includes(String(cond.event_id));
      // --- P0.5/P1/P2/P3 new condition types ---
      case "action_count": return int(s.action_counts_total[String(cond.action_id)]) >= int(cond.count, 1);
      case "map_explore": return int((s.map_explores || {})[String(cond.map_id)]) >= int(cond.count, 1);
      case "spell_level": {
        const school = String(cond.spell_school);
        return Object.entries(s.spells || {}).some(([sid, st]) => {
          const row = DataManager.getById("spell_table", sid);
          return String(row.spell_school || "") === school && int(st.level) >= int(cond.level, 1);
        });
      }
      case "faction": return String(s.faction_id || "") === String(cond.faction_id);
      case "no_faction": return !str(s.faction_id, "");
      case "calamity_min": return num(s.resources.calamity) >= num(cond.value, 0);
      case "merit_min": return num(s.resources.merit) >= num(cond.value, 0);
      case "race": return String(s.race_id || "") === String(cond.race_id);
      default: return false;
    }
  },

  _bondCompanion(row) {
    const id = String(row.companion_id);
    const c = this.state.companions[id];
    if (!c || c.bonded) return;
    c.bonded = true;
    // P1 阵容：结缘后若上场位未满（<3），自动补位
    if (!Array.isArray(this.state.lineup)) this.state.lineup = [];
    if (this.state.lineup.length < 3 && !this.state.lineup.includes(id)) this.state.lineup.push(id);
    this._log(`道友结缘：${row.name}——${row.bond_passive_desc}。`);
    this.queuePopup({ kind: "text", style: "goal", title: `道友结缘：${row.name}`, body: `${row.bond_text || ""}\n\n护持：${row.bond_passive_desc}\n专属斗法牌已就绪，可在洞府「道友阵容」安排上场（最多 3 位）。`, buttons: [{ label: "志同道合" }] });
  },

  // P1 阵容：切换某位道友上场/下场（上限 3 位，仅已结缘可选）
  toggleLineup(companionId) {
    const id = String(companionId);
    if (!this.state.companions[id]?.bonded) return { ok: false, reason: "尚未结缘" };
    if (!Array.isArray(this.state.lineup)) this.state.lineup = [];
    const idx = this.state.lineup.indexOf(id);
    if (idx >= 0) {
      this.state.lineup.splice(idx, 1);
      this._afterMutated();
      return { ok: true, on: false };
    }
    if (this.state.lineup.length >= 3) return { ok: false, reason: "上场位已满（3 位），请先撤下一位" };
    this.state.lineup.push(id);
    this._afterMutated();
    return { ok: true, on: true };
  },

  // ---------- 真灵上榜 ----------

  awardGodSeat() {
    const owned = this.state.god_seats;
    const pool = GOD_SEATS.filter((s) => !owned.includes(s.id));
    if (!pool.length) return "";
    const seat = pool[Math.floor(Math.random() * pool.length)];
    owned.push(seat.id);
    this._log(`一缕真灵被榜文照过——得「${seat.name}」护持：${seat.desc}。`);
    return `\n一缕真灵被榜文照过——得「${seat.name}」护持：${seat.desc}`;
  },

  // ---------- 丹房 ----------

  isAlchemyUnlocked() { return DataManager.isRealmAtLeast(this.state.realm_id, "rq_07"); },

  // ---------- P1 生活技艺：炼丹火候 / 画符 / 占卜 ----------

  // 炼丹（火候品质版）：quality 由 UI 时机条决定（shang/zhong/xia），影响产出/药效
  brewPillWithQuality(pillId, quality) {
    if (!this.isAlchemyUnlocked()) return { ok: false };
    const def = PILL_DEFS.find((p) => p.id === pillId);
    if (!def) return { ok: false };
    for (const rid of Object.keys(def.cost)) {
      if (num(this.state.resources[rid]) < num(def.cost[rid])) { this.queuePopup({ kind: "text", title: def.name, body: "炉火虽在，材料不足。", buttons: [{ label: "知道了" }] }); return { ok: false }; }
    }
    for (const rid of Object.keys(def.cost)) this.state.resources[rid] = num(this.state.resources[rid]) - num(def.cost[rid]);
    const q = String(quality || "zhong");
    const qname = (typeof CRAFT_QUALITY !== "undefined" && CRAFT_QUALITY[q]) ? CRAFT_QUALITY[q].name : "中品";
    if (pillId === "due") { const n = q === "shang" ? 2 : 1; this.state.pills.due = int(this.state.pills.due) + n; this._log(`炉火纯青，炼成${qname}渡厄丹 ${n} 枚（存 ${this.state.pills.due}）。`); }
    else if (pillId === "peiyuan") { const hours = q === "shang" ? 3 : q === "xia" ? 1.5 : 2; this.state.pills.peiyuan_until = nowUnix() + Math.round(hours * 3600); this._log(`服下${qname}培元丹，丹田暖意流转——${hours} 时辰内收益 +15%。`); }
    else if (pillId === "ningfa") { const mins = q === "shang" ? 45 : q === "xia" ? 20 : 30; const g = { daoxing: num(RewardManager.calculateRewardForMinutes(this.state, mins, { includeMap: false }).resources.daoxing) }; this._applyResourceDelta(g); this._log(`${qname}凝法丹化开，法力转为道行 +${formatInt(g.daoxing)}。`); }
    this._afterMutated();
    return { ok: true, quality: q };
  },

  // 画符：quality 决定符咒等级（上=3/中=2/下=1）与数量
  drawTalisman(type, quality) {
    if (!this.isAlchemyUnlocked()) return { ok: false };
    if (!["fire", "thunder", "guard"].includes(type)) return { ok: false };
    const cost = { spell_page: 3, mana: 2000 };
    for (const rid of Object.keys(cost)) {
      if (num(this.state.resources[rid]) < num(cost[rid])) { this.queuePopup({ kind: "text", title: "画符", body: "朱砂与法力不足，难以成符。", buttons: [{ label: "知道了" }] }); return { ok: false }; }
    }
    for (const rid of Object.keys(cost)) this.state.resources[rid] = num(this.state.resources[rid]) - num(cost[rid]);
    const q = String(quality || "zhong");
    const lv = q === "shang" ? 3 : q === "xia" ? 1 : 2;
    const n = q === "shang" ? 2 : 1;
    if (!Array.isArray(this.state.talismans)) this.state.talismans = [];
    for (let i = 0; i < n; i++) this.state.talismans.push({ type, lv });
    const tname = { fire: "火符", thunder: "雷符", guard: "护身符" }[type];
    const qname = (typeof CRAFT_QUALITY !== "undefined" && CRAFT_QUALITY[q]) ? CRAFT_QUALITY[q].name : "中品";
    this._log(`笔走龙蛇，画成${qname}${tname} ${n} 枚，收入袖中。`);
    this._afterMutated();
    return { ok: true, quality: q, count: n };
  },

  // 占卜：每日一次，给谶语线索（非数字），并设隐性引导
  divine() {
    if (!this.isAlchemyUnlocked()) return { ok: false };
    const today = todayString();
    if (str(this.state.divination.last_day, "") === today) { this.queuePopup({ kind: "text", title: "占卜", body: "今日已占过一签。天机不可屡窥，明日再来。", buttons: [{ label: "知道了" }] }); return { ok: false }; }
    const clues = (typeof DIVINATION_CLUES !== "undefined") ? DIVINATION_CLUES : [];
    if (!clues.length) return { ok: false };
    const clue = clues[Math.floor(Math.random() * clues.length)];
    this.state.divination = { last_day: today, effect: clue.effect, target: clue.target || "" };
    this._log(`你焚香摇签，得一句谶语：${clue.text}`);
    this.queuePopup({ kind: "text", style: "chance", title: "占卜·谶语", body: `炉烟袅袅，签上写着——\n\n「${clue.text}」\n\n（${clue.desc}）`, buttons: [{ label: "记下了" }] });
    this._afterMutated();
    return { ok: true, clue };
  },

  // 占卜「明日机缘」buff 是否生效（次日有效）
  hasDivinationBoost(effect) {
    const d = this.state.divination || {};
    if (str(d.effect, "") !== effect) return false;
    return true; // 占卜效果持续生效，直到下次占卜覆盖（每日仅可占一次）
  },

  brewPill(pillId) {
    if (!this.isAlchemyUnlocked()) return;
    const def = PILL_DEFS.find((p) => p.id === pillId);
    if (!def) return;
    for (const rid of Object.keys(def.cost)) {
      if (num(this.state.resources[rid]) < num(def.cost[rid])) { this.queuePopup({ kind: "text", title: def.name, body: "炉火虽在，材料不足。", buttons: [{ label: "知道了" }] }); return; }
    }
    for (const rid of Object.keys(def.cost)) this.state.resources[rid] = num(this.state.resources[rid]) - num(def.cost[rid]);
    if (pillId === "due") { this.state.pills.due = int(this.state.pills.due) + 1; this._log(`你炼成一枚渡厄丹（存 ${this.state.pills.due} 枚）——破劫斗法开局得护持。`); }
    else if (pillId === "peiyuan") { this.state.pills.peiyuan_until = nowUnix() + 7200; this._log("你服下培元丹，丹田暖意流转——2 时辰内闭关与行动收益 +15%。"); }
    else if (pillId === "ningfa") { const g = { daoxing: num(RewardManager.calculateRewardForMinutes(this.state, 30, { includeMap: false }).resources.daoxing) }; this._applyResourceDelta(g); this._log(`你炼化凝法丹，法力转为道行 +${formatInt(g.daoxing)}。`); }
    this._afterMutated();
  },

  // ---------- 战后休整 ----------

  _restCardPool() {
    const pool = ["charm_strike", "charm_guard"];
    for (const row of DataManager.getRows("spell_table")) { if (int(this.state.spells[String(row.spell_id)]?.level) > 0) pool.push(String(row.spell_id)); }
    if (this.state.first_treasure_id && int(this.state.treasures[this.state.first_treasure_id]?.level) > 0) pool.push("treasure_skill");
    for (const cid of ["nezha_spear", "yangjian_blade", "ziya_whip"]) {
      const companion = { nezha_spear: "nezha", yangjian_blade: "yangjian", ziya_whip: "ziya" }[cid];
      if (this.state.companions?.[companion]?.bonded) pool.push(cid);
    }
    return pool;
  },

  _queueRestPopup(bossId) {
    const copy = this._restCardPool();
    const picks = [];
    while (copy.length && picks.length < 3) picks.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
    this.queuePopup({ kind: "rest", payload: { bossId, cardPicks: picks } });
  },

  applyRestChoice(choice, cardId) {
    if (choice === "heal") { this.state.battle_blessing = { block_ratio: 0.15, shield: 1, battles: 2 }; this._log("你饮露调息，气机完满——下两场斗法开局得罡气与圣盾护持。"); }
    else if (choice === "upgrade" && cardId && this._restCardPool().includes(cardId)) { this.state.card_upgrades[cardId] = int(this.state.card_upgrades[cardId]) + 1; this._log(`你淬炼符箓，「${getCardDisplayName(this.state, cardId)}」更为精妙（斗法中等级 +1）。`); }
    else { this._log("你敛气收藏，径自回山。"); }
    this._afterMutated();
  },

  cancelAction() {
    if (!this.state.current_action) return;
    this.state.current_action = null;
    this._log("你收束心神，中断了这次修行。");
    SaveManager.save(this.state); this._emit();
  },

  // ---------- 闭关收益 ----------

  claimOfflineReward() {
    const reward = this.pendingOfflineReward;
    if (int(reward.minutes) <= 0) { this.queuePopup({ kind: "text", title: "闭关", body: "闭关未满一刻，暂无可领取收益。", buttons: [{ label: "继续闭关" }] }); return; }
    this._applyResourceDelta(reward.resources || {});
    this.state.last_claim_time = nowUnix();
    let eventTriggered = false;
    if (reward.event_id) { this._setPendingEvent(reward.event_id); eventTriggered = true; }
    this._log(`闭关 ${formatDuration(int(reward.minutes))}，收束道行归体。`);
    this.queuePopup({ kind: "text", style: "seal", title: "闭关结束！",
      body: `你在洞中参玄悟道 ${formatDuration(int(reward.minutes))}。\n山中灵气渐渐汇入周身，封神榜碎光在远天一闪而没。\n\n获得：\n${this._formatResourceDelta(reward.resources || {})}${RealmManager.canLevelUp(this.state) ? "\n\n道行已满，可提升境界。" : ""}${eventTriggered ? "\n\n天象有变，似有机缘浮现。" : ""}`,
      buttons: [{ label: "收下" }] });
    this._afterMutated();
    if (eventTriggered) this._queueEventPopup();
  },

  // ---------- 升重 ----------

  levelUp() {
    if (RealmManager.isCapped(this.state)) { this.showCapNotice(); return; }
    const before = new Set(this.state.unlocked_ids);
    const result = RealmManager.levelUp(this.state);
    if (!result.ok) { this.queuePopup({ kind: "text", title: "升重", body: result.message, buttons: [{ label: "继续修行" }] }); return; }
    UnlockManager.refresh(this.state);
    const from = result.from; const to = result.to;
    const powerGain = num(to.combat_power_base) - num(from.combat_power_base);
    const tips = (to.feature_tips || []).map((t) => `解锁：${t}`).join("\n");
    this._log(`你突破至${getPhaseRealmName(to)}。`);
      // 第二层·小仪式：阶段转换（每3重）给呼吸时刻；普通升重只给气韵，不弹窗（design/6.0）
      const ritualText = Atmosphere.phaseRitual(String(to.realm_id));
      if (Atmosphere.isPhaseTransition(from, to) && ritualText) {
        Atmosphere.playRitual(ritualText);
        this._log(`【境界】${ritualText}`);
      } else {
        this.toast(`突破至${getPhaseRealmName(to)}`, to.lore_text || "你吐纳周天，法力更进一步。");
      }
      this._queueNewUnlockPopups(before);
    if (!this.state.pending_event_id) { const eventId = EventManager.rollEvent(this.state, "level_up"); if (eventId) { this._setPendingEvent(eventId); this._queueEventPopup(); } }
    this._afterMutated();
  },

  // ---------- 破劫 ----------

  requestBreakthrough() {
    const data = BreakthroughManager.getAvailable(this.state);
    if (!Object.keys(data).length) return;
    if (!BreakthroughManager.canAttempt(this.state)) { this.queuePopup({ kind: "text", title: String(data.display_name || "破劫"), body: `破劫需道行 ${formatInt(data.required_daoxing)}。\n道行不足，还需闭关积累。`, buttons: [{ label: "继续修行" }] }); return; }
    if (String(data.breakthrough_id) === "bt_002" && !this.state.seen_events.includes("event_020") && !this.state.pending_event_id && EventManager.canOffer(this.state, "event_020")) {
      this._setPendingEvent("event_020"); this._afterMutated(); this._queueEventPopup(); return;
    }
    this.queuePopup({ kind: "breakthrough_confirm", breakthroughId: String(data.breakthrough_id) }); this._emit();
  },

  confirmBreakthrough() {
    const data = BreakthroughManager.getAvailable(this.state);
    if (!Object.keys(data).length) { this.queuePopup({ kind: "text", title: "破劫", body: "当前境界暂无破劫。", buttons: [{ label: "继续修行" }] }); return; }
    if (!BreakthroughManager.canAttempt(this.state)) { this.queuePopup({ kind: "text", title: String(data.display_name || "破劫"), body: "破劫道行不足，还需闭关积累。", buttons: [{ label: "继续修行" }] }); return; }
    const id = String(data.breakthrough_id);
    const breakdown = BreakthroughManager.getRateBreakdown(this.state, data);
    const phases = TRIBULATION_PHASES[id] || TRIBULATION_PHASES.bt_001;
    this._log(`榜文垂光，${data.display_name}的劫数显化而出。`);
    this.startBattle({ name: "封神榜文", source: "breakthrough", phases, payload: { breakthroughId: id, rate: num(breakdown?.rate), failCount: int(this.state.breakthrough_fail_counts[id]), guarantee: int(data.guarantee_after_fail, 99) } });
  },

  // ---------- 机缘 ----------

  openPendingEvent() { if (!this.state.pending_event_id) return; this._queueEventPopup(); this._emit(); },

  chooseEventOption(optionIndex) {
    const eventId = this.state.pending_event_id;
    const eventRow = EventManager.getEvent(eventId);
    if (!Object.keys(eventRow).length) return { ok: false };
    const options = eventRow.options || [];
    if (optionIndex < 0 || optionIndex >= options.length) return { ok: false };
    const option = options[optionIndex];
    const reward = this._applyEventReward(option.reward || {});
    EventManager.markSeen(this.state, eventId);
    this.state.pending_event_id = ""; this.eventPopupActive = false;
    const deltaText = this._formatResourceDelta(reward.resources || {});
    this._log(`机缘「${eventRow.event_name}」：${option.text}。`);
    this.queuePopup({ kind: "text", style: "chance", title: String(eventRow.event_name || "机缘"), body: `你选择了「${option.text}」。${deltaText ? `\n\n获得：\n${deltaText}` : "\n\n一缕气机悄然入体。"}`, buttons: [{ label: "收下机缘" }] });
    this._afterMutated();
    return { ok: true };
  },

  // ---------- 种族与势力 ----------

  chooseRace(raceId) {
    const row = DataManager.getById("race_table", raceId);
    if (!Object.keys(row).length) return;
    if (this.state.flags.race_choice_done) return;
    this.state.race_id = String(raceId); this.state.flags.race_choice_done = true;
    if (String(raceId) === "xiantian" && !this.state.treasures.treasure_009) this.state.treasures.treasure_009 = { level: 1, owned: true };
    this._log(`你觉醒了跟脚：${row.race_name}。`);
    this.queuePopup({ kind: "text", style: "seal", title: `跟脚已定：${row.race_name}`, body: String(row.choose_text || row.talent_desc || ""), buttons: [{ label: "踏入修行" }] });
    this._afterMutated();
  },

  chooseFaction(factionId) {
    const row = DataManager.getById("faction_table", factionId);
    if (!Object.keys(row).length) return;
    if (this.state.faction_id) return;
    this.state.faction_id = String(factionId);
    this._log(`你投身${row.faction_name}（${row.dojo}），自此入局。`);
    this.queuePopup({ kind: "text", style: "seal", title: `入局：${row.faction_name}`, body: String(row.join_text || ""), buttons: [{ label: "领受护持" }] });
    this._afterMutated();
  },

  _maybeQueueFactionChoice() { if (this.state.faction_id) return; if (this.popupQueue.some((p) => p.kind === "faction_choice")) return; this.queuePopup({ kind: "faction_choice" }); },

  // ---------- 本命法宝择主 ----------

  hasPendingTreasureChoice() {
    if (!UnlockManager.isUnlocked(this.state, "treasure_system")) return false;
    return !Object.keys(this.state.treasures).some((id) => id !== "treasure_009" && int(this.state.treasures[id].level) > 0);
  },

  chooseFirstTreasure(treasureId) {
    if (!this.hasPendingTreasureChoice()) return;
    if (!FIRST_TREASURE_CHOICES.includes(treasureId)) return;
    const row = DataManager.getById("treasure_table", treasureId);
    if (!Object.keys(row).length) return;
    this.state.treasures[treasureId] = { level: 1, owned: true }; this.state.first_treasure_id = treasureId;
    this._log(`本命法宝「${row.treasure_name}」与你气机相合。`);
    this.queuePopup({ kind: "text", style: "treasure", title: "本命法宝入体！", body: `${row.treasure_name}与你气机相合，化作一道灵光悬于身侧。\n从此你不再只是空手施术的山野小修。\n\n${row.origin_desc || ""}\n\n战力大幅提升\n解锁法宝技：${row.skill_name || ""}`, buttons: [{ label: "护道随身" }] });
    this._afterMutated();
  },

  // ---------- 术法 ----------

  getSpellState(spellId) { if (!this.state.spells[spellId]) this.state.spells[spellId] = { level: 0, unlocked: false }; return this.state.spells[spellId]; },
  getSpellUpgradeCost(spellRow, toLevel) {
    if (toLevel <= 1) {
      // 第一门术法免费；之后每多参悟一门，都要消耗残页与法力——玩家自由选择，不强制学满。
      const learned = Object.values(this.state.spells).filter((s) => int(s.level) > 0).length;
      if (learned === 0) return { spell_page_cost: 0, mana_cost: 0 };
      return { spell_page_cost: 2 + learned * 2, mana_cost: 250 * learned };
    }
    for (const cost of spellRow.upgrade_costs || []) { if (int(cost.to_level) === toLevel) return cost; }
    return null;
  },
  getSpellMaxLevel(spellRow) { const major = String(RealmManager.getCurrentRealm(this.state).major_realm || "炼气士"); return int(spellRow.max_level_by_realm?.[major], 5); },

  upgradeSpell(spellId) {
    const spellRow = DataManager.getById("spell_table", spellId);
    if (!Object.keys(spellRow).length) return { ok: false };
    const spellState = this.getSpellState(spellId);
    const nextLevel = int(spellState.level) + 1;
    if (nextLevel > this.getSpellMaxLevel(spellRow)) { this.queuePopup({ kind: "text", title: spellRow.spell_name, body: "此术在当前境界已至上限，破境后可再精进。", buttons: [{ label: "知道了" }] }); return { ok: false }; }
    // P0-A: 本命流派——四阶以上神通需先定本命；非本命流派封顶三阶
    if (nextLevel === 1 && int(spellRow.tier) >= 4) {
      const bm = str(this.state.benming_school, "");
      if (!bm) { this.queuePopup({ kind: "text", title: spellRow.spell_name, body: "四阶神通，需先定本命流派。\n（真仙破劫后，于五条道中选一条走到黑。）", buttons: [{ label: "知道了" }] }); return { ok: false }; }
      if (String(spellRow.spell_school) !== bm) { this.queuePopup({ kind: "text", title: spellRow.spell_name, body: `你已定本命「${SCHOOL_NAME[bm]}」。\n非本命流派，封顶三阶，此路不通。`, buttons: [{ label: "知道了" }] }); return { ok: false }; }
    }
    const cost = this.getSpellUpgradeCost(spellRow, nextLevel);
    if (!cost) return { ok: false };
    if (num(this.state.resources.spell_page) < num(cost.spell_page_cost) || num(this.state.resources.mana) < num(cost.mana_cost)) return { ok: false, message: "材料不足" };
    this.state.resources.spell_page -= num(cost.spell_page_cost); this.state.resources.mana -= num(cost.mana_cost);
    spellState.level = nextLevel; spellState.unlocked = true;
    if (nextLevel === 1) { this._log(`你悟得术法「${spellRow.spell_name}」。`); this.queuePopup({ kind: "text", style: "seal", title: `悟得术法：${spellRow.spell_name}`, body: `${spellRow.lore_text || ""}\n\n此术虽浅，却已能惊退山野妖邪。`, buttons: [{ label: "谨记于心" }] }); }
    else { this._log(`「${spellRow.spell_name}」提升至${nextLevel}重。`); }
    this._afterMutated(); return { ok: true };
  },

  // ---------- P0-A 本命流派 ----------

  hasBenming() { return !!str(this.state.benming_school, ""); },

  chooseBenmingSchool(school) {
    if (this.hasBenming()) return; // 不可逆
    if (!SCHOOL_PASSIVES[school]) return;
    this.state.benming_school = school;
    const p = SCHOOL_PASSIVES[school];
    this._log(`你定下本命：${p.name}。自此${SCHOOL_NAME[school]}之一道，与你性命相系。`);
    this.queuePopup({ kind: "text", style: "breakthrough", title: `本命·${p.name}`,
      body: `你在五条道中，选了「${SCHOOL_NAME[school]}」。\n\n${p.desc}\n\n自此，${SCHOOL_NAME[school]}系神通可精进至五阶，威力更增五成；其余四道，封顶三阶。\n这条路，走到黑。`,
      buttons: [{ label: "就是它了" }] });
    this._afterMutated();
  },

  // 真仙破劫（bt_003）后触发本命选择
  _maybeTriggerBenming(btId) {
    if (String(btId) !== "bt_003") return;
    if (this.hasBenming()) return;
    this.queuePopup({ kind: "benming_choice" });
  },

  // ---------- 法宝温养 ----------

  getTreasureState(treasureId) { if (!this.state.treasures[treasureId]) this.state.treasures[treasureId] = { level: 0, owned: false }; return this.state.treasures[treasureId]; },

  getTreasureUpgradeCost(treasureRow, toLevel) {
    const id = String(treasureRow.treasure_id);
    let cost = null;
    if (toLevel === 1 && id !== this.state.first_treasure_id) { cost = { treasure_shard_cost: 20, mana_cost: 10000 }; }
    else { for (const row of treasureRow.level_growth || []) { if (int(row.level) === toLevel) { cost = row; break; } } }
    if (!cost) return null;
    if (str(this.state.faction_id, "") === "chan") { cost = { ...cost, treasure_shard_cost: Math.round(num(cost.treasure_shard_cost) * 0.8), mana_cost: Math.round(num(cost.mana_cost) * 0.8) }; }
    return cost;
  },

  upgradeTreasure(treasureId) {
    const treasureRow = DataManager.getById("treasure_table", treasureId);
    if (!Object.keys(treasureRow).length) return { ok: false };
    const treasureState = this.getTreasureState(treasureId);
    const nextLevel = int(treasureState.level) + 1;
    if (nextLevel > int(treasureRow.max_level_mvp, 5)) { this.queuePopup({ kind: "text", title: treasureRow.treasure_name, body: "此宝已温养至极，祭炼之法待天仙篇开启。", buttons: [{ label: "知道了" }] }); return { ok: false }; }
    const cost = this.getTreasureUpgradeCost(treasureRow, nextLevel);
    if (!cost) return { ok: false };
    if (num(this.state.resources.treasure_shard) < num(cost.treasure_shard_cost) || num(this.state.resources.mana) < num(cost.mana_cost)) return { ok: false, message: "材料不足" };
    this.state.resources.treasure_shard -= num(cost.treasure_shard_cost); this.state.resources.mana -= num(cost.mana_cost);
    treasureState.level = nextLevel; treasureState.owned = true;
    if (nextLevel === 1) { this._log(`你炼化了法宝「${treasureRow.treasure_name}」。`); }
    else { this._log(`「${treasureRow.treasure_name}」温养至${nextLevel}重。`); this.queuePopup({ kind: "text", style: "treasure", title: "法宝强化成功！", body: `${treasureRow.treasure_name} Lv.${nextLevel - 1} → Lv.${nextLevel}\n\n宝光更盛，悬于身侧。\n你能明显感觉到，术法运转比从前更顺。`, buttons: [{ label: "继续温养" }] }); }
    this._afterMutated(); return { ok: true };
  },

  // ---------- 地图 ----------

  selectMap(mapId) {
    const maps = UnlockManager.getAvailableMaps(this.state);
    if (!maps.some((m) => String(m.map_id) === mapId)) return;
    this.state.current_map_id = mapId;
    const row = DataManager.getById("map_table", mapId);
    this._log(`你移居${row.map_name}一带修行。`);
    this._afterMutated();
  },

  // 可探索空间（design/6.0 第三层）：地图行动结算时，按游历次数逐步发现探索点
  _checkExploreDiscovery(mapId) {
    if (!mapId) return;
    if (!Array.isArray(this.state.explored_points)) this.state.explored_points = [];
    const explores = int(this.state.map_explores?.[mapId]);
    const mapName = DataManager.getById("map_table", mapId).map_name || "此地";
    const points = DataManager.getRows("explore_point_table").filter((p) => String(p.map_id) === String(mapId));
    for (const p of points) {
      const pid = String(p.point_id);
      if (this.state.explored_points.includes(pid)) continue;
      if (explores < int(p.discover_after, 1)) continue;
      this.state.explored_points.push(pid);
      const reward = p.reward || {};
      if (Object.keys(reward).length) this._applyResourceDelta(reward);
      const rewardText = this._formatResourceDelta(reward);
      this._log(`你在${mapName}发现了「${p.name}」。`);
      this.toast(`发现·${p.name}`, `${p.flavor || ""}${rewardText ? `\n\n（${rewardText}）` : ""}`);
      // 探索点接事件（design/6.6）：发现深层秘境触发 tied 事件（seen 去重）
      if (p.trigger_event && !this.state.seen_events.includes(String(p.trigger_event))) {
        this._setPendingEvent(String(p.trigger_event));
        this._queueEventPopup();
      }
    }
  },

  // ---------- 封顶 ----------

  showCapNotice() {
    this.state.flags.cap_notice_seen = true;
    this.queuePopup({ kind: "text", style: "seal", title: "修行暂止", body: CAP_NOTICE_TEXT, buttons: [{ label: "继续收集" }] });
    this._maybeQueueFactionChoice();
    this._afterMutated();
  },

  // ---------- 主按钮状态机 ----------

  getMainAction() {
    const state = this.state;
    if (state.current_action) {
      const row = DataManager.getById("action_table", String(state.current_action.action_id));
      return { type: "acting", label: `${row.action_name || "修行"}中…`, row };
    }
    if (state.pending_event_id) {
      return { type: "event", label: "天象有变，查看机缘" };
    }
    if (this.hasPendingTreasureChoice()) {
      return { type: "treasure_choice", label: "本命法宝择主" };
    }
    if (RealmManager.isCapped(state) && !str(state.faction_id, "")) {
      return { type: "faction_choice", label: "择一方势力入局" };
    }
    if (BreakthroughManager.canAttempt(state)) {
      const data = BreakthroughManager.getAvailable(state);
      return { type: "breakthrough", label: `榜文垂光，${data.display_name || "破劫"}` };
    }
    if (RealmManager.canLevelUp(state)) {
      return { type: "level_up", label: "道行已满，可升重" };
    }
    if (int(this.pendingOfflineReward.minutes) >= 5) {
      return { type: "claim", label: `出关领取\n闭关 ${formatDuration(int(this.pendingOfflineReward.minutes))}` };
    }
    // 主按钮永远保留一条“继续修行”的默认路；Boss/目标行动只做次级推荐，绝不阻断修行。
    const preferred = this._preferredCultivationAction(state);
    if (preferred) {
      return { type: "action", label: preferred.action_name, actionId: String(preferred.action_id) };
    }
    if (RealmManager.isCapped(state)) {
      return { type: "action", label: "骷髅山探幽", actionId: "kulou_explore" };
    }
    return { type: "idle", label: "继续闭关" };
  },

  _preferredCultivationAction(state) {
    const actions = ActionManager.getActions(state);
    const available = actions.filter((row) => ActionManager.getAvailability(state, row).ok);
    if (!available.length) return null;
    const order = ["short_meditation", "breath_cycle", "wild_travel", "chentang_patrol", "kulou_explore"];
    for (const id of order) {
      const match = available.find((row) => String(row.action_id) === id);
      if (match) return match;
    }
    return available[0];
  },

  getSecondaryRecommendations(state) {
    const list = [];
    const primary = this._preferredCultivationAction(state);
    const primaryId = primary ? String(primary.action_id) : "";
    const goal = GoalManager.getCurrent(state);
    const c = goal.complete_condition || {};
    if (c.type === "action_complete") {
      const available = ActionManager.getActions(state).filter((row) => ActionManager.getAvailability(state, row).ok);
      const match = available.find((row) => String(row.action_id) === String(c.action_id));
      if (match && String(match.action_id) !== primaryId) {
        list.push({ id: "goal_action", label: `${match.action_name}（修行指引）`, actionId: String(match.action_id) });
      }
    }
    const boss = this._challengeableBoss(state);
    if (boss) list.push({ id: "boss", label: `${boss.boss_name}现身，可挑战`, bossId: String(boss.boss_id) });
    return list.slice(0, 2);
  },

  _hasAffordableSpell(state) {
    return UnlockManager.getAvailableSpells(state).some((spell) => {
      const level = int(this.getSpellState(String(spell.spell_id)).level);
      const nextLevel = level + 1;
      if (nextLevel > this.getSpellMaxLevel(spell)) return false;
      const cost = this.getSpellUpgradeCost(spell, nextLevel);
      return (cost && num(state.resources.spell_page) >= num(cost.spell_page_cost) && num(state.resources.mana) >= num(cost.mana_cost));
    });
  },

  _hasAffordableTreasure(state) {
    if (this.hasPendingTreasureChoice()) return false;
    return UnlockManager.getAvailableTreasures(state).some((treasure) => {
      const level = int(this.getTreasureState(String(treasure.treasure_id)).level);
      const nextLevel = level + 1;
      if (nextLevel > int(treasure.max_level_mvp, 5)) return false;
      const cost = this.getTreasureUpgradeCost(treasure, nextLevel);
      return (cost && num(state.resources.treasure_shard) >= num(cost.treasure_shard_cost) && num(state.resources.mana) >= num(cost.mana_cost));
    });
  },

  _challengeableBoss(state) {
    return BossManager.getBosses(state).find(
      (boss) => BossManager.canChallenge(state, String(boss.boss_id)) && BossManager.getWinRate(state, boss) >= 0.5
    );
  },

  _recommendedAction() {
    const state = this.state;
    const actions = ActionManager.getActions(state);
    const available = actions.filter((row) => ActionManager.getAvailability(state, row).ok);
    if (!available.length) return null;
    const goal = GoalManager.getCurrent(state);
    const c = goal.complete_condition || {};
    if (c.type === "action_complete") {
      const match = available.find((row) => String(row.action_id) === String(c.action_id));
      if (match) return match;
    }
    const factionTask = String(getFactionRow(state).task_action_id || "");
    const order = [factionTask, "observe_seal", "short_meditation", "breath_cycle", "wild_travel", "chentang_patrol", "kulou_explore"];
    for (const id of order) {
      const match = available.find((row) => String(row.action_id) === id);
      if (match) return match;
    }
    return available[0];
  },

  // ---------- 轮回转生 ----------

  canReincarnate() { return RealmManager.isCapped(this.state); },

  getRebirthPreview() {
    const realm = RealmManager.getCurrentRealm(this.state);
    const majorGain = { 炼气士: 1, 真人: 3, 地仙: 5 }[String(realm.major_realm || "")] || 1;
    const rb = this.state.rebirth;
    return { gain: majorGain, daohenAfter: int(rb.daohen) + majorGain, raceNew: str(this.state.race_id, "") && !rb.races_seen.includes(str(this.state.race_id, "")), countAfter: int(rb.count) + 1 };
  },

  reincarnate() {
    if (!this.canReincarnate()) return;
    const state = this.state;
    const realm = RealmManager.getCurrentRealm(state);
    const preview = this.getRebirthPreview();
    const rb = state.rebirth;
    rb.count = preview.countAfter; rb.daohen = preview.daohenAfter;
    if (str(state.race_id, "") && !rb.races_seen.includes(str(state.race_id, ""))) rb.races_seen.push(str(state.race_id, ""));
    const nums = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
    rb.log.unshift(`第${nums[rb.count - 1] || rb.count}世：${getRaceShortName(state) || "无名"}，修至${getPhaseRealmName(realm)}，凝道痕 ${preview.gain}。`);
    if (rb.log.length > 9) rb.log.length = 9;
    const fresh = SaveManager.createDefault();
    fresh.rebirth = rb;
    fresh.flags.battle_manual = !!state.flags.battle_manual;
    fresh.flags.auto_repeat = !!state.flags.auto_repeat;
    this.state = SaveManager.normalize(fresh);
    UnlockManager.refresh(this.state);
    this._refreshPendingReward();
    this._log(`第${nums[rb.count - 1] || rb.count}世开启：道痕 ${rb.daohen}，宿慧 +${Math.round(rb.daohen * 3 + rb.races_seen.length)}%。`);
    SaveManager.save(this.state);
    this.queuePopup({ kind: "text", style: "breakthrough", title: "应劫转世",
      body: `榜文照落，你此生真灵投入轮回。\n\n此生修为凝作道痕 ${preview.gain} 点（共 ${rb.daohen} 点）——每点道痕，来世收益 +3%。\n${preview.raceNew ? "此生跟脚已录入图鉴，来世收益再添 +1%。\n" : ""}\n新一世，你可以重新选择跟脚。`,
      buttons: [{ label: "再入轮回" }] });
    this.queuePopup({ kind: "race_choice" });
    this._emit();
  },

  // ---------- Debug ----------

  fastForward(minutes = 360) {
    if (!this.debug) return;
    this.state.last_claim_time = int(this.state.last_claim_time, nowUnix()) - Math.max(1, minutes) * 60;
    this._refreshPendingReward();
    this._log(`【调试】时间快进${minutes}分钟，当前节奏不代表正式体验。`);
    SaveManager.save(this.state); this._emit();
  },

  debugAddResources() {
    if (!this.debug) return;
    for (const id of DataManager.getResourceIds()) this.state.resources[id] = num(this.state.resources[id]) + 5000;
    this._log("【调试】资源 +5000。"); this._afterMutated();
  },

  resetSave() {
    SaveManager.wipe(); this.popupQueue = [];
    this.state = SaveManager.normalize(SaveManager.createDefault());
    UnlockManager.refresh(this.state); this._refreshPendingReward();
    this._log("你重入轮回，再踏修行路。");
    this.queuePopup({ kind: "race_choice" }); SaveManager.save(this.state); this._emit();
  },

  getPendingEvent() { return EventManager.getEvent(this.state.pending_event_id); },

  // ---------- 内部 ----------

  _setPendingEvent(eventId) { this.state.pending_event_id = eventId; this.state.pending_event_prelude = true; },

  _queueEventPopup() {
    if (!this.state.pending_event_id) return;
    if (this.eventPopupActive) return;
    if (this.popupQueue.some((p) => p.kind === "event")) return;
    this.eventPopupActive = true;
    this.queuePopup({ kind: "event", prelude: this.state.pending_event_prelude });
    this.state.pending_event_prelude = false;
  },

  _queueNewUnlockPopups(beforeSet) {
    for (const id of this.state.unlocked_ids) {
      if (beforeSet.has(id)) continue;
      const info = FEATURE_UNLOCK_TEXT[id];
      if (!info || this.state.seen_unlock_popups.includes(id)) continue;
      this.state.seen_unlock_popups.push(id);
      // 山野游历首次解锁时，直接展开封神山河图：地图感是这个节点的主菜，不是附注。
      if (id === "travel" && !this.state.flags.world_map_seen) {
        this.state.flags.world_map_seen = true;
        this.queuePopup({ kind: "world_map" });
        continue;
      }
      this.queuePopup({ kind: "text", style: "seal", title: `新机缘开启：${info.name}`, body: info.body, buttons: [{ label: "知道了" }] });
    }
  },

  _checkResourceReveals() {
    for (const row of UnlockManager.getVisibleResources(this.state)) {
      const id = String(row.resource_id);
      if (this.state.seen_resources.includes(id)) continue;
      this.state.seen_resources.push(id);
      const text = RESOURCE_UNLOCK_TEXT[id];
      if (text) this.queuePopup({ kind: "text", style: "seal", title: `${row.resource_name}`, body: text, buttons: [{ label: "知道了" }] });
    }
  },

  _checkChapterReveals() {
    const goal = GoalManager.getCurrent(this.state);
    if (!Object.keys(goal).length) return;
    const stage = String(goal.stage || "");
    if (!stage || stage === "前30分钟") return;
    const key = `chapter_revealed_${stage}`;
    if (this.state.flags[key]) return;
    this.state.flags[key] = true;
    const meta = (typeof WorldScroll !== "undefined" && WorldScroll.getChapterReveal)
      ? WorldScroll.getChapterReveal(stage)
      : null;
    if (!meta) return;
    this.queuePopup({
      kind: "text", style: "breakthrough",
      title: `新卷展开：${meta.chapter} · ${meta.title}`,
      body: `${meta.place}\n\n${meta.subtitle}\n\n封神图卷上，新的山河道途已经亮起。`,
      buttons: [{ label: "展开此卷", action: "open_scroll" }, { label: "继续修行", secondary: true }],
    });
  },

  _afterMutated() {
    this.state = SaveManager.normalize(this.state);
    UnlockManager.refresh(this.state);
    this._checkResourceReveals();
    const completedGoals = GoalManager.check(this.state);
    for (const goal of completedGoals) {
      if (goal.reward?.resources) this._applyResourceDelta(goal.reward.resources);
      this._log(`目标达成：${goal.goal_name}。`);
      const rewardText = goal.reward?.resources && Object.keys(goal.reward.resources).length ? `\n\n获得：\n${this._formatResourceDelta(goal.reward.resources)}` : "";
      this.toast(`目标达成：${goal.goal_name}`, `${goal.complete_text || ""}${rewardText}`);
    }
    this._checkChapterReveals();
    this._checkCompanions();
    this._refreshPendingReward();
    SaveManager.save(this.state);
    this._emit();
  },

  _refreshPendingReward() { this.pendingOfflineReward = RewardManager.calculateOfflineReward(this.state); },
  _applyResourceDelta(delta) { for (const id of Object.keys(delta)) this.state.resources[id] = Math.max(0, num(this.state.resources[id]) + num(delta[id])); },

  _applyEventReward(payload) {
    const resources = {};
    mergeResources(resources, payload.resources || {});
    if (payload.random_bonus && Math.random() <= num(payload.random_bonus.chance)) mergeResources(resources, payload.random_bonus.resources || {});
    if (payload.spell_pages_by_type) { let total = 0; for (const k of Object.keys(payload.spell_pages_by_type)) total += num(payload.spell_pages_by_type[k]); resources.spell_page = num(resources.spell_page) + total; }
    if (payload.treasure_shards_by_id) { let total = 0; for (const k of Object.keys(payload.treasure_shards_by_id)) total += num(payload.treasure_shards_by_id[k]); resources.treasure_shard = num(resources.treasure_shard) + total; }
    if (payload.root_progress) resources.daoxing = num(resources.daoxing) + num(payload.root_progress);
    if (payload.breakthrough_bonus) resources.merit = num(resources.merit) + Math.round(num(payload.breakthrough_bonus) * 2000);
    if (payload.breakthrough_pressure_reduce) resources.calamity = num(resources.calamity) - Math.ceil(num(this.state.resources.calamity) * num(payload.breakthrough_pressure_reduce)) - 50;
    this._applyFactionMeritBonus(resources);
    this._applyResourceDelta(resources);
    return { resources };
  },

  _applyFactionMeritBonus(resources) { if (str(this.state.faction_id, "") === "tianting" && num(resources.merit) > 0) resources.merit = Math.round(num(resources.merit) * 1.2); },
  _log(message) { const stamp = new Date().toTimeString().slice(0, 5); this.state.logs.unshift(`[${stamp}] ${message}`); if (this.state.logs.length > 30) this.state.logs.length = 30; },
  _emit() { if (typeof this.onChange === "function") this.onChange(); },

  _formatResourceDelta(resources) {
    const parts = [];
    for (const id of Object.keys(resources)) {
      const amount = num(resources[id]);
      if (amount === 0) continue;
      const row = DataManager.getById("resource_table", id);
      parts.push(`${row.resource_name || id} ${amount > 0 ? "+" : ""}${formatInt(amount)}`);
    }
    return parts.join("\n");
  },
};
