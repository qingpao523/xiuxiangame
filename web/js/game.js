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

const FACTION_JOIN_EVENT = { chan: "event_316", jie: "event_317", tianting: "event_318", wuzhuang: "event_319" };
const ARRAY_WIN_EVENT = { tianjue: "event_321", huanghe: "event_322", zhuxian: "event_323", wanxian: "event_324" };

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

// 21.3 §3.4 S2 杀劫压力世界值（含 21.1 §2.1 降级接线，C3 口径归本实现）：
// 纯派生不自存 state——驱动源全部来自既有存档（章节进度/账号日/杀阵胜场/境界），
// 数据为体，无同步漂移；只驱动环境文本（天象/破劫面板氛围），不碰离线收益与机缘掉率。
function getCalamityPressure(state) {
  let p = 0;
  const stage = String((GoalManager.getCurrent(state) || {}).stage || "");
  if (stage === "第2天") p += 50; else if (stage === "第1天") p += 30; else p += 10;
  p += Math.min(20, int(UnlockManager.currentDay(state)) * 2); // 驻世越久，卷入越深
  const arrayTotal = Object.values(state.array_wins || {}).reduce((s, n) => s + int(n), 0);
  p += Math.min(30, arrayTotal * 6); // 杀阵破阵：走入杀劫深处，榜文愈发照见
  const majors = ["炼气士", "真人", "地仙", "天仙", "真仙", "金仙", "太乙", "大罗", "准圣", "混元"];
  const mi = majors.indexOf(String(RealmManager.getCurrentRealm(state).major_realm || ""));
  if (mi > 2) p += (mi - 2) * 4; // 境界越高，榜文照得越亮
  return Math.max(0, Math.min(100, p));
}

// 杀劫压力四档：label 入天象行，mood 入破劫确认面板首行氛围语（21.1 §2.1 消费点）
function getCalamityPressureTier(state) {
  const p = getCalamityPressure(state);
  if (p >= 75) return { level: p, label: "榜文全力压制", mood: "杀劫之气如焚。榜文的金光，已日夜不离你的真灵。" };
  if (p >= 50) return { level: p, label: "杀劫已深", mood: "榜文自九天垂落，光一日近过一日。" };
  if (p >= 25) return { level: p, label: "榜文牵引", mood: "榜文微光里，似有目光扫过山河，在寻找谁。" };
  return { level: p, label: "榜文微照", mood: "榜文碎光远照，如星子悬在天边，不来也不去。" };
}

function getTitle(state) {
  // 21.3 §3.3 E2 终局身份：结局一经择定，名位即结局之名（永久身份，转世方重开）。
  const endingId = str(state.ending_id, "");
  if (endingId && typeof DataManager !== "undefined") {
    const endRow = DataManager.getById("unlock_table", "ending_" + endingId);
    if (Object.keys(endRow).length) return String(endRow.unlock_name || "");
  }
  // 21.1 §1.6 名位：破劫 success_rewards.title 授予 title_* 解锁（替身代形者不授）。
  // 已授名位优先显示，取最近一枚（高阶名位覆盖低阶）；地仙"榜外散修"经 realm unlock_ids 授予，同归此路。
  const granted = (state.unlocked_ids || []).filter((id) => String(id).startsWith("title_"));
  if (granted.length) return String(granted[granted.length - 1]).slice(6);
  const major = String(RealmManager.getCurrentRealm(state).major_realm || "炼气士");
  if (major === "地仙") return "榜外散修";
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

  init(opts = {}) {
    opts = opts || {};
    this.debug = opts.debug != null ? !!opts.debug
      : (typeof location !== "undefined" && new URLSearchParams(location.search).get("debug") === "1");
    const fresh = opts.fresh != null ? !!opts.fresh : !SaveManager.hasSave();
    this.state = SaveManager.loadOrCreate();
    UnlockManager.refresh(this.state);
    this._refreshPendingReward();
    const showPrologue = fresh || (!this.state.flags.prologue_seen && this._isUnstartedRun());
    if (showPrologue) this.queuePopup({ kind: "prologue" });
    if (fresh) {
      this._log("你于山野洞府中睁开眼。先认跟脚，再吐纳。");
      this.queuePopup({ kind: "race_choice" });
    } else if (!str(this.state.race_id, "") && !this.state.flags.race_choice_done) {
      this.queuePopup({ kind: "race_choice" });
    } else if (int(this.pendingOfflineReward.minutes) >= 5) {
      this.queuePopup({ kind: "text", style: "seal", title: "出关",
        body: `你已闭关 ${formatDuration(int(this.pendingOfflineReward.minutes))}。\n山中灵气渐渐汇入周身，可以出关收束道行了。`,
        buttons: [{ label: "出关领取", action: "claim_offline" }, { label: "继续闭关" }] });
    }
    this._checkWorldMapReveal();
    // ===== 音频初始化（AudioManager，音效需求.md）=====
    // 自动播放合规：AudioContext 仅在首次用户手势后启动；设置从存档恢复；环境音床随境界。
    if (typeof AudioManager !== "undefined") {
      AudioManager.bindGestures();
      AudioManager.loadSettings(this.state);
      const self = this;
      AudioManager.onUnmute = function () { self.updateAmbient(); }; // 取消静音时恢复境界环境音
      this.updateAmbient();
    }
    // 21.3 §3.3 E2：回档的混元圆满玩家，载入时补发终局三选（门未开则静默；每会话至多一次）
    this._maybeQueueEndingChoice();
    SaveManager.save(this.state);
    if (typeof ContentDirector !== "undefined" && this.state.flags.prologue_seen) ContentDirector.pulse("login");
    this._emit();
  },

  // 按当前境界切换环境音床（山野/陈塘/骷髅山）。供境界变化/场景切换调用。
  updateAmbient() {
    if (typeof AudioManager === "undefined") return;
    AudioManager.playAmbient(AudioManager.ambientForRealm(this.state.realm_id));
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
    if (typeof ContentDirector !== "undefined") ContentDirector.pulse("login");
    this._emit();
  },

  queuePopup(popup) { this.popupQueue.push(popup); this._emit(); },

  toast(title, body, duration = 2400, kind = "") {
    this.toastMessage = { id: Date.now() + Math.random(), title, body, duration, kind: String(kind || "") };
    this._emit();
  },

  tick() {
    // 21.6 L1 三问卡：在线时长累计（按墙钟 delta，单次钳 ≤5s 防后台挂起跳变）
    const _nowTick = nowMs();
    if (this._lastTickMs) this.state.play_seconds = int(this.state.play_seconds) + Math.min(5, Math.max(0, Math.round((_nowTick - this._lastTickMs) / 1000)));
    this._lastTickMs = _nowTick;
    let changed = false;
    const action = this.state.current_action;
    if (action && action.encounters) {
      for (const enc of action.encounters) {
        if (!enc.fired && nowMs() >= num(enc.at)) { enc.fired = true; this.queuePopup({ kind: "encounter", encounterId: enc.id }); changed = true; }
      }
    }
    if (action && nowMs() >= num(action.end_time_ms)) { this._finishAction(); changed = true; }
    // P0-#2 修复：idle + auto_repeat 且无 pending 事件/升重时，自动恢复修行，避免停摆。
    if (!this.state.current_action && this.state.flags.auto_repeat && !this.state.pending_event_id
        && !RealmManager.canLevelUp(this.state) && !BreakthroughManager.canAttempt(this.state)
        && !this.hasPendingTreasureChoice() && int(this.pendingOfflineReward.minutes) < 5) {
      const resume = this._getFallbackCultivationAction();
      if (resume) {
        this.state.current_action = { action_id: String(resume.action_id), start_time_ms: nowMs(), end_time_ms: nowMs() + int(resume.duration_sec) * 1000 };
        this._setupActionExtras(resume, this.state.current_action);
        changed = true;
      }
    }
    this._refreshPendingReward();
    if (changed) this._afterMutated();
    this._maybeShowThreeQ(); // 21.6 L1：在线满 30 分钟触发一次三问（每账号一次）
    this._emit();
  },

  // ---------- 21.6 反馈入口（L1 三问卡 / L2 榜上留书） ----------

  // L1 三问卡：在线满 30 分钟（或首次出关）弹一次，每账号一次、可跳过。
  // 三问=验收工具也是反馈模板（1.9 §6.4 口述三问）：这游戏在讲什么/我为什么修行/下一步能做什么。
  _maybeShowThreeQ(force) {
    const s = this.state;
    if (s.flags.three_q_shown) return;
    const hitOnline = int(s.play_seconds) >= 1800;
    if (!force && !hitOnline) return;
    s.flags.three_q_shown = true;
    this.queuePopup({ kind: "text", style: "seal", title: "三问",
      body: "榜文垂光，且问三句——\n一、这游戏在讲什么？\n二、你现在为什么修行？\n三、下一步，你可以选择做什么？\n\n（心中作答即可。若有一句想对我们说，榜上留书。）",
      buttons: [{ label: "榜上留书", action: "feedback_form" }, { label: "记下了" }] });
  },

  // L2 榜上留书：外链反馈表单（不做界内输入框）；未配置时气韵提示。
  openFeedbackForm() {
    const url = str(typeof FEEDBACK_FORM_URL !== "undefined" ? FEEDBACK_FORM_URL : "", "");
    if (url && typeof window !== "undefined" && window.open) { window.open(url, "_blank"); return; }
    this.toast("榜上留书", "留言的榜还未张挂。你的每一句，都会有人读。", 3200);
  },

  // ---------- 在线动作 ----------

  isOpeningStage() {
    if (typeof ContentDirector !== "undefined") return ContentDirector.isOpening(this.state);
    const g = GoalManager.getCurrent(this.state);
    return String(g.stage || "") === "前30分钟";
  },

  startAction(actionId) {
    const row = DataManager.getById("action_table", actionId);
    if (!Object.keys(row).length) return;
    const avail = ActionManager.getAvailability(this.state, row);
    if (!avail.ok) { this.queuePopup({ kind: "text", title: row.action_name, body: avail.reason + "。", buttons: [{ label: "知道了" }] }); return; }
    // P1-#3 修复：行动开始后自动收起面板，避免面板遮挡主按钮区。
    if (typeof closePanelSheet === "function") closePanelSheet();
    let duration = int(row.duration_sec);
    // C 线·土行孙结缘护持：游历类行动耗时 -10%（上场道友生效）
    if (str(row.reward_type, "") === "map_equivalent") {
      const tt = bondPassiveSum(this.state, "travel_time");
      if (tt > 0) duration = Math.max(1, Math.round(duration * (1 - tt)));
    }
    if (duration <= 0) { this.state.current_action = { action_id: actionId, end_time_ms: nowMs() }; this._finishAction(); this._afterMutated(); return; }
    this.state.current_action = { action_id: actionId, start_time_ms: nowMs(), end_time_ms: nowMs() + duration * 1000 };
    this._setupActionExtras(row, this.state.current_action);
    this._log(String(row.start_text || `你开始${row.action_name}。`));
    SaveManager.save(this.state);
    this._emit();
  },

  _setupActionExtras(row, action) {
    let duration = int(row.duration_sec);
    // C 线·土行孙结缘护持：游历类行动耗时 -10%（与 startAction 口径一致）
    if (str(row.reward_type, "") === "map_equivalent") {
      const tt = bondPassiveSum(this.state, "travel_time");
      if (tt > 0) duration = Math.max(1, Math.round(duration * (1 - tt)));
    }
    if (row.map_id) {
      const firstTravel = String(row.action_id) === "wild_travel" && !this.state.flags.first_travel_battle_done;
      const tide = !!this.state.flags.spirit_tide_venture;
      let pool = DataManager.getRows("encounter_table").filter((e) => {
        if (String(e.map_id) !== String(row.map_id)) return false;
        const rp = e.requires_point;
        if (rp && !(this.state.explored_points || []).includes(String(rp))) return false;
        return true;
      });
      if (firstTravel || tide) {
        const battlePool = pool.filter((e) => (e.options || []).some((o) => o.kind === "battle") || String(e.encounter_type) === "battle");
        if (battlePool.length) pool = battlePool;
        const named = pool.find((e) => String(e.encounter_id) === "enc_wild_01");
        if (named) pool = [named, ...pool.filter((e) => e !== named)];
      }
      const picked = []; const copy = [...pool];
      if (firstTravel && copy.length) picked.push(copy.shift());
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
      // 天庭·功德敕令：指定行动收益 ×2（design/7.2 v0.2，按行动类型匹配 scope）
      const edictScope = row.reward_type === "map_equivalent" ? "travel" : "offline";
      const edictMult = this.consumeEdict(edictScope);
      if (edictMult > 1) {
        for (const rid of Object.keys(reward.resources)) reward.resources[rid] = Math.round(num(reward.resources[rid]) * edictMult);
      }
      this._applyResourceDelta(reward.resources);
      // 麒麟·瑞兽感应：游历感应隐藏灵机，30% 额外道行（design/7.0 身份层）
      if (str(this.state.race_id, "") === "qilin" && row.map_id && num(reward.resources.daoxing) > 0 && Math.random() < 0.3) {
        const qb = Math.round(num(reward.resources.daoxing) * 0.3);
        this._applyResourceDelta({ daoxing: qb });
        this._log(`瑞兽感应：你感应到一处隐藏灵机，额外获得道行 +${formatInt(qb)}。`);
      }
      rewardText = this._formatResourceDelta(reward.resources);
    }
    let extraRewardText = "";
    if (row.reward_resources && Object.keys(row.reward_resources).length) {
      const fixed = {};
      for (const rid of Object.keys(row.reward_resources)) fixed[rid] = num(row.reward_resources[rid]);
      this._applyResourceDelta(fixed); extraRewardText = this._formatResourceDelta(fixed);
    }
    let eventTriggered = !!this.state.pending_event_id;
    if (!this.state.pending_event_id && typeof ContentDirector !== "undefined") ContentDirector.pulse("action");
    if (this.state.pending_event_id) eventTriggered = true;
    else {
      let eventChance = num(row.event_chance) * (str(this.state.race_id, "") === "qilin" ? 1.3 : 1);
      if (this.state.flags.insight_event_boost) { eventChance *= 2; delete this.state.flags.insight_event_boost; }
      if (this.hasDivinationBoost("event_boost")) eventChance *= 1.8; // P1 占卜「明日机缘」
      const shengEvent = bondPassiveSum(this.state, "event_chance");
      if (shengEvent > 0) eventChance *= (1 + shengEvent); // C 线·申公豹结缘护持：机缘 +8%
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
      // P0-#1 修复：道行已满时自动链"让行"，不续作，让主按钮切为升重入口。
      if (RealmManager.canLevelUp(this.state)) {
        this._log("连续修行暂停：道行已满，可升重。");
      } else {
        // 挂机放置准则：主页「连续修行」即纯修炼循环，只在修炼类动作间续作，
        // 绝不跳去游历/探幽（map 类）。目标动作保留在「修行指引」次级按钮，由玩家手动触发。
        const chainRow = this._getAutoChainAction(row);
        const avail = ActionManager.getAvailability(this.state, chainRow);
        if (avail.ok) { this.state.current_action = { action_id: String(chainRow.action_id), start_time_ms: nowMs(), end_time_ms: nowMs() + int(chainRow.duration_sec) * 1000 }; chained = true; }
        else {
          // P0-#2 修复：链式续作失败时，自动回落到可用的修炼类动作，避免停摆。
          const fallback = this._getFallbackCultivationAction();
          if (fallback) {
            const fbAvail = ActionManager.getAvailability(this.state, fallback);
            if (fbAvail.ok) { this.state.current_action = { action_id: String(fallback.action_id), start_time_ms: nowMs(), end_time_ms: nowMs() + int(fallback.duration_sec) * 1000 }; chained = true; this._log(`连续修行：${avail.reason}，转为${fallback.action_name}。`); }
            else { this._log(`连续修行停歇：${avail.reason}。`); }
          } else { this._log(`连续修行停歇：${avail.reason}。`); }
        }
      }
    }
    const completionBody = `${row.complete_text || ""}${allRewardText ? `\n\n获得：\n${allRewardText}` : ""}${blessText}`;
    const firstBreath = id === "breath_cycle" && int(this.state.action_counts_total[id]) === 1;
    if (firstBreath) {
      this.queuePopup({ kind: "text", style: "seal", title: "你听见了风",
        body: `洞外松风过了一息。你这口气，比睁眼时长了三寸。\n\n${allRewardText}${blessText}`,
        buttons: [{ label: "收下这一息" }] });
    } else if (chained) {
      this._log(`连续修行：${completionBody.replace(/\n/g, " ")}`);
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
    if (type === "mana") { gain.mana = Math.max(8, Math.round(num(realm.base_mana_per_min) * 2 * comboMult)); }
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
      this.startBattleV2({ name: String(option.enemy_name || enc.name), enemy_power: enemyPower, source: "encounter", payload: { encounterId, optionIndex } });
      return;
    }
    if (option.kind === "safe") { this._applyEncounterOutcome(enc, option.success, true); return; }
    let chance = num(option.chance, 0.6) + num(getTodayOmen().checkBonus, 0);
    if (option.bonus_spell_type) {
      for (const row of DataManager.getRows("skill_table")) {
        if (String(row.spell_type) !== String(option.bonus_spell_type)) continue;
        chance += int(this.state.skill_levels[String(row.id)]) * num(option.bonus_per_level, 0.05);
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
      this.startBattleV2({ name: String(cfg.enemy_name || name), enemy_power: enemyPower, source: "encounter", payload: { encounterId: enc.encounter_id, optionIndex } });
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

  // ---------- 斗法（统一走斗法栏连锁制 V2） ----------

  startBossBattle(bossId) { return this.startBossBattleV2(bossId); },

  // ---------- 镇魔塔（D5：周期推塔活动，design/12.0）----------
  startTowerRun() {
    UnlockManager._resetTowerCycleIfNeeded(this.state);
    if (int(this.state.tower.tickets) <= 0) { this.queuePopup({ kind: "text", title: "镇魔塔", body: "登塔令已尽。\n每期（两日）刷新三枚登塔令，本期已用完，且待下期。", buttons: [{ label: "知道了" }] }); return; }
    this.state.tower.tickets = int(this.state.tower.tickets) - 1;
    this.state.tower.in_run = true;
    this.state.tower.current_floor = 0;
    this._log("你持登塔令，踏入镇魔塔。塔门在身后合拢，层层妖气自下而上。");
    this._nextTowerFloor();
    this._afterMutated();
  },
  _towerFloorRealm(floor) {
    const duan = Math.floor((int(floor) - 1) / 10) * 10 + 1; // 段首层（每10层一段）
    const row = DataManager.getRows("tower_table").find((r) => int(r.floor) === duan);
    return row ? str(row.unlock_realm, "") : "";
  },
  _nextTowerFloor() {
    const floor = int(this.state.tower.current_floor) + 1;
    const row = DataManager.getRows("tower_table").find((r) => int(r.floor) === floor);
    if (!row) { this._endTowerRun(false); return; } // 已登顶
    const realm = this._towerFloorRealm(floor);
    if (realm && !UnlockManager.conditionMet(this.state, realm)) { this._endTowerRun(false); return; } // 境界不足
    const boss = DataManager.getById("boss_table", str(row.boss_id, ""));
    if (!Object.keys(boss).length) { this._endTowerRun(false); return; }
    this._log(`镇魔塔第${floor}层：${row.entry_text || (boss.boss_name + "拦路。")}`);
    const cfg = { name: String(boss.boss_name), enemy_power: num(boss.recommended_power) * num(row.power_mult, 1),
      adds: [], source: "tower", mechanic: boss.mechanics ? String(boss.mechanics).split(":")[0].trim() : null,
      weakness: boss.weakness || null, payload: { floor, bossId: str(row.boss_id, "") } };
    this.startBattleV2(cfg);
    this._afterMutated();
  },
  _endTowerRun(defeated) {
    this.state.tower.in_run = false;
    const best = int(this.state.tower.best_floor_this_cycle);
    const ever = int(this.state.tower_best_floor_ever);
    const kills = int(this.state.tower_total_kills);
    this._log(defeated ? `镇魔塔之行止步于第${best}层。` : `镇魔塔本期登顶第${best}层。`);
    this.queuePopup({ kind: "text", style: "breakthrough", title: "镇魔塔·本期战报",
      body: `${defeated ? "你被守关者击退，本期登塔就此定格。" : "本期塔层已尽收脚下。"}\n\n本期最高：第${best}层\n历史最高：第${ever}层\n累计斩将：${kills}`,
      buttons: [{ label: "收功" }] });
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
    const phases = (arr.phases || []).map((p) => ({ name: String(p.name), power_ratio: num(p.power_ratio, 0.7), intro: String(p.intro || ""), pool: null })); // ARRAY_INTENTS 已删除，phases 暂用通用意图池
    this.startBattleV2({ name: arr.array_name, source: "array", phases, bannerLabel: "阵势", payload: { arrayId: id } });
    this._afterMutated();
  },

  openSlotConfig() {
    this.queuePopup({ kind: "slot_config" });
    this._emit();
  },

  setBattleSlots(slotIds) {
    const max = BattleEngineV2.getSlotCount(this.state);
    this.state.battle_slots = (slotIds || []).slice(0, max);
    SaveManager.save(this.state);
    this._emit();
  },

  startBattleV2(cfg) {
    if (cfg && cfg.source === "encounter") this.state.flags.first_travel_battle_done = true;
    if (!this.state.flags.battle_v2_tutorial_done && !(cfg.payload && cfg.payload.tutorial)) {
      if (typeof GameplayEngine !== "undefined") GameplayEngine.pendingBattle = cfg;
      if (typeof BattleUIV2 !== "undefined" && BattleUIV2.startTutorial) {
        BattleUIV2.startTutorial(this.state);
        this._emit();
        return null;
      }
    }
    const battle = BattleEngineV2.create(this.state, cfg);
    this.queuePopup({ kind: "battle_v2", battle });
    this._emit();
    return battle;
  },

  startBossBattleV2(bossId) {
    const boss = DataManager.getById("boss_table", bossId);
    if (!Object.keys(boss).length) return;
    if (!BossManager.canChallenge(this.state, bossId)) { this.queuePopup({ kind: "text", title: "挑战", body: "此地妖气未聚，明日再来。", buttons: [{ label: "知道了" }] }); return; }
    this.state.boss_counts_today[bossId] = int(this.state.boss_counts_today[bossId]) + 1;
    this._log(`你踏入${boss.boss_name}的巢穴，妖气扑面而来。`);
    const adds = { boss_002: [{ name: "巡海残兵", power: num(boss.recommended_power) * 0.2 }],
      boss_003: [{ name: "白骨阴火", power: num(boss.recommended_power) * 0.12 }, { name: "白骨阴火", power: num(boss.recommended_power) * 0.12 }],
      boss_020: [{ name: "碧霄", power: num(boss.recommended_power) * 0.5 }, { name: "琼霄", power: num(boss.recommended_power) * 0.5 }] }[bossId] || [];
    const mechanic = boss.mechanics ? String(boss.mechanics).split(":")[0].trim() : null;
    // V2：Boss抗性/弱点从boss_table读取（resistance/weakness对象 或 weakness数组）
    const cfg = { name: String(boss.boss_name), enemy_power: num(boss.recommended_power), adds, source: "boss", mechanic, weakness: boss.weakness || null, payload: { bossId } };
    this.startBattleV2(cfg);
    this._afterMutated();
  },

  finishBattle(battle) {
    if (!battle) return;
    const omen = getTodayOmen();
    if (battle.source === "debug") {
      this.queuePopup({
        kind: "text",
        title: battle.win ? "调试·胜" : "调试·负",
        body: `${battle.name} 已结束。\n会话 ${battle.sessionId || "—"}\n回合 ${int(battle.round)}\n输出 ${formatInt(battle.stats && battle.stats.dealt)}`,
        buttons: [{ label: "关闭" }],
      });
      this._afterMutated();
      return;
    }
    if (battle.source === "breakthrough") { /* 破劫结算 */
      const btId = String(battle.payload.breakthroughId || "");
      const data = DataManager.getById("breakthrough_table", btId);
      if (!Object.keys(data).length) return;
      const before = new Set(this.state.unlocked_ids);
      // 21.1 §1.6 替身符（三条破劫路的"代形"路）：持符败局 → 燃符代受一笔，败转胜，但 success_rewards 名位不授。
      // _tishenDone 幂等护栏：同一场斗法只燃一张，重复触发结算不二次消耗。
      let viaTishen = false;
      if (!battle.win && !battle._tishenDone && int(this.state.pills?.tishen) > 0) {
        battle._tishenDone = true;
        this.state.pills.tishen = int(this.state.pills.tishen) - 1;
        battle.win = true;
        viaTishen = true;
      }
      if (battle.win) {
          BreakthroughManager.applyVictory(this.state, data, { skipTitle: viaTishen }); UnlockManager.refresh(this.state);
          this._log(String(data.success_text || "破劫成功。"));
          this._witness(btId + "_win"); // 21.3 §3.3 E4 见闻录：破劫成败写入结构（无数据行→静默，不硬凑）
          const titleName = str(data.success_rewards?.title, "");
          if (viaTishen) {
            this._log(String(DataManager.getById("pill_table", "tishen").use_text || "袖中替身符无火自燃，替你受了榜文一笔。"));
            if (titleName) this._log(`骗过定数，骗不过自己的道——名位「${titleName}」未授。`);
          } else if (titleName) {
            this._log(`破劫功成，得授名位：「${titleName}」。`);
          }
          if (typeof AudioManager !== "undefined") AudioManager.playSfx("tribulation_success"); // SFX-04 破劫成功清越音
          // 替身代形结算文案（21.1 §1.6）：不进新模态，沿用既有 text 弹窗；文本出自 pill_table.use_text（数据为体）
          const tishenBody = () => {
            const row = DataManager.getById("pill_table", "tishen");
            return `${String(row.use_text || "袖中替身符无火自燃，替你受了榜文一笔。")}\n\n${titleName ? `新境名位「${titleName}」未授。` : ""}袖中余符 ${int(this.state.pills?.tishen)} 张。`;
          };
          // 第三层·大画卷：破劫是质变，给一整幅沉浸演出；机械结算延后到画卷结束（design/6.0）
          const afterScene = () => {
            if (viaTishen) this.queuePopup({ kind: "text", style: "breakthrough", title: `${FeedbackRenderer.line("popup_breakthrough_win") || "劫过，榜未留名"}·替身代形`, body: tishenBody(), buttons: [{ label: "踏入新境" }] });
            this._queueNewUnlockPopups(before);
            this._maybeTriggerBenming(btId);
            // 先天生灵·大道遗泽：破劫后伴生灵宝自动升 1 级（design/7.0 身份层）
            if (str(this.state.race_id, "") === "xiantian") {
              const tb = this.state.treasures["treasure_009"];
              if (tb && int(tb.level) > 0) { tb.level = int(tb.level) + 1; this._log(`大道遗泽：破劫之后，伴生灵宝自行升华为 ${int(tb.level)} 重。`); }
            }
            if (this.hasPendingTreasureChoice()) this.queuePopup({ kind: "treasure_choice" });
            if (String(this.state.realm_id) === "dx_01") this.showCapNotice();
            this._afterMutated();
          };
          if (Atmosphere.breakthroughScene(btId)) {
            Atmosphere.playBreakthrough(btId, afterScene);
            return;
          }
          this.queuePopup({ kind: "text", style: "breakthrough", title: viaTishen ? `${FeedbackRenderer.line("popup_breakthrough_win") || "劫过，榜未留名"}·替身代形` : (FeedbackRenderer.line("popup_breakthrough_win") || "劫过，榜未留名"), body: viaTishen ? tishenBody() : String(data.success_text || "破劫成功。"), buttons: [{ label: "踏入新境" }] });
          this._queueNewUnlockPopups(before);
          this._maybeTriggerBenming(btId);
          if (this.hasPendingTreasureChoice()) this.queuePopup({ kind: "treasure_choice" });
          if (String(this.state.realm_id) === "dx_01") this.showCapNotice();
        } else {
        BreakthroughManager.applyDefeat(this.state, data); // 21.1 §1.4：其内部 list_marks +1（榜上留名，榜文亲笔）
        this._log(String(data.fail_text || "破劫未成，但道心更稳。"));
        this._witness(btId + "_lose"); // 21.3 §3.3 E4 见闻录：破劫成败写入结构（无数据行→静默，不硬凑）
        // 21.1 §1.4 留名浮字：非阻断 toast + 日志，呼应 T-B fail_text"多看一眼"伏笔；弹窗克制，不新增模态
        const marks = int(this.state.list_marks);
        this._log(`榜文似将你的真灵记了一笔——榜上留名 ${marks} 缕。`);
        this.toast("榜上留名", `榜文似将你的真灵记了一笔。留名 ${marks} 缕，天庭的差事说不定已在路上。`, 3200, "world");
        this.queuePopup({ kind: "text", style: "breakthrough", title: "破劫失败",
          body: `${data.fail_text || "破劫未成。"}\n\n获得：劫火淬体\n下次破劫，因果护持更深一寸；屡败之后，榜文也会钝上几分。\n法力小幅补偿\n\n道行未散。`,
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
        const edictLoot = this.consumeEdict("boss"); // 天庭·功德敕令·斩妖 ×2（design/7.2 v0.2）
        const bondLoot = 1 + bondPassiveSum(this.state, "loot_bonus"); // C 线·赵公明结缘护持：战利 +15%
        for (const id of Object.keys(rewards)) rewards[id] = Math.round(num(rewards[id]) * omenLoot * raceLoot * seatLoot * edictLoot * bondLoot);
        this._applyResourceDelta(rewards);
        const firstClear = int(this.state.boss_clears[bossId]) === 0;
        this.state.boss_clears[bossId] = int(this.state.boss_clears[bossId]) + 1;
        this._log(`你击败了${boss.boss_name}。`);
        if (firstClear) this._witness("boss_" + bossId); // 21.3 §3.3 E4 见闻录：具名 Boss 首杀见证（seen 去重，同一条目二世不触发）
        // 妖族·吞噬：击败 Boss 吞噬精血，永久对妖伤害 +3%（design/7.0 身份层）
        if (str(this.state.race_id, "") === "yao") {
          this.state.devour_stacks = int(this.state.devour_stacks) + 1;
          this._log(`万灵之体·吞噬：你吞噬${boss.boss_name}精血，对妖伤害永久 +3%（累计 ${int(this.state.devour_stacks) * 3}%）。`);
        }
        const lootLines = [];
        if (omenLoot > 1) lootLines.push(`${omen.name}：战利 +${Math.round((omenLoot - 1) * 100)}%`);
        if (raceLoot > 1) lootLines.push(`万灵之体·吞噬：战利 +${Math.round((raceLoot - 1) * 100)}%`);
        if (edictLoot > 1) lootLines.push(`功德敕令·斩妖：战利 ×${edictLoot}`);
        this.queuePopup({ kind: "text", style: "breakthrough", title: FeedbackRenderer.line("popup_boss_win") || "妖邪已伏",
          body: `${boss.victory_text || ""}\n\n获得：\n${this._formatResourceDelta(rewards)}${lootLines.length ? `\n\n${lootLines.join("\n")}` : ""}`,
          buttons: [{ label: "收取战利" }] });
        if (firstClear) this._offerEvent(boss.first_clear_event);
        // 连战 auto-advance（design/16.0 批次0 §1.4）：chain_id 存在且有下一 chain_order → 直接续战，跳过休整
        const nextChain = this._nextChainBossId(bossId);
        if (nextChain) {
          this._pendingChainBossId = bossId; // 供 ui.js chain_next 动作读取（transient，不入存档）
          this.queuePopup({ kind: "text", style: "breakthrough", title: "连战！",
            body: `${boss.boss_name}既败，下一阵妖气已起。\n\n（魔家四将·连战 ${int(boss.chain_order)}/4）`,
            buttons: [{ label: "继续连战", action: "chain_next" }, { label: "就此收手", action: "chain_stop" }] });
        } else {
          this._queueRestPopup(bossId);
        }
      } else {
        this._pendingChainBossId = null; // 连战中断：斗法失利，清链路游标
        const consolation = Math.floor(num(boss.reward_mana) * 0.1);
        this.state.resources.mana = num(this.state.resources.mana) + consolation;
        const seatText = this.awardGodSeat();
        this._log(`你与${boss.boss_name}斗法失利，暂退回府。`);
        this.queuePopup({ kind: "text", title: FeedbackRenderer.line("popup_boss_lose") || "且战且退",
          body: `${boss.boss_name}妖气正盛，你且战且退，未伤根本。\n\n拾得游离灵气：法力 +${formatInt(consolation)}\n${seatText}\n\n再积累些道行与术法，改日再来。`,
          buttons: [{ label: "暂且退去" }] });
      }
      this._afterMutated(); return;
    }
    if (battle.source === "tower") { /* 镇魔塔结算（D5） */
      const floor = int(battle.payload.floor);
      const row = DataManager.getRows("tower_table").find((r) => int(r.floor) === floor);
      if (battle.win) {
        const boss = DataManager.getById("boss_table", str(row?.boss_id, ""));
        const rewards = { ...(row?.reward || {}), ...(row?.milestone_reward || {}) };
        this._applyResourceDelta(rewards);
        this.state.tower.current_floor = floor;
        this.state.tower.best_floor_this_cycle = Math.max(int(this.state.tower.best_floor_this_cycle), floor);
        this.state.tower_best_floor_ever = Math.max(int(this.state.tower_best_floor_ever), floor);
        this.state.tower_total_kills = int(this.state.tower_total_kills) + 1;
        this.state.tower_floor_clears[floor] = int(this.state.tower_floor_clears[floor]) + 1;
        this._log(`镇魔塔第${floor}层，${boss?.boss_name || "守关者"}伏诛。`);
        this.queuePopup({ kind: "text", style: "breakthrough", title: `镇魔塔·第${floor}层`,
          body: `${row?.entry_text || ""}\n\n${boss?.victory_text || "守关者伏诛。"}\n\n获得：\n${this._formatResourceDelta(rewards)}${row?.milestone_reward && Object.keys(row.milestone_reward).length ? "\n\n（含里程碑奖励）" : ""}`,
          buttons: [{ label: "继续登塔", action: "tower_next" }, { label: "就此收手", action: "tower_stop" }] });
      } else {
        this._endTowerRun(true);
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
        // 截教·万仙阵法：杀阵奖励 ×1.5（design/7.2 v0.2）
        const jieMult = str(this.state.faction_id, "") === "jie" ? 1.5 : 1;
        const edictArray = this.consumeEdict("array"); // 天庭·功德敕令·破阵 ×2
        const ziyaMult = 1 + bondPassiveSum(this.state, "array_reward"); // C 线·姜子牙结缘护持：杀劫大阵奖励 +10%
        for (const id of Object.keys(rewards)) rewards[id] = Math.round(num(rewards[id]) * jieMult * edictArray * ziyaMult);
        this._applyResourceDelta(rewards);
        const arrLines = [];
        if (jieMult > 1) arrLines.push(`万仙阵法·杀阵：奖励 ×${jieMult}`);
        if (edictArray > 1) arrLines.push(`功德敕令·破阵：奖励 ×${edictArray}`);
        this._log(`你破阵而出：${this._formatResourceDelta(rewards)}。`);
        this.queuePopup({ kind: "text", style: "breakthrough", title: "破阵而出！",
          body: `阵纹消散，杀劫暂退。\n\n获得：\n${this._formatResourceDelta(rewards)}${arrLines.length ? `\n\n${arrLines.join("\n")}` : ""}${firstWin ? "\n\n首通之阵，法宝碎片落入囊中。" : ""}`,
          buttons: [{ label: "收功" }] });
        if (firstWin) this._offerEvent("event_320");
        if (!this.state.pending_event_id) {
          const tied = ARRAY_WIN_EVENT[arrId];
          if (!this._offerEvent(tied)) {
            const rolled = EventManager.rollEvent(this.state, "array");
            if (rolled) this._offerEvent(rolled);
          }
        }
      } else {
        const seatText = this.awardGodSeat();
        this._log(`你被${battle.name}击退，阵势余波将你震出。`);
        this.queuePopup({ kind: "text", title: "败阵", body: `你被阵势余波震出，虽败不伤。\n${seatText}\n\n待修为再进，可重闯此阵。`, buttons: [{ label: "暂且退去" }] });
      }
      this._afterMutated(); return;
    }
    /* 新手教学斗法结算（design/8.0 三层引导） */
    if (battle.payload && battle.payload.tutorial) {
      if (battle.win) {
        this.queuePopup({ kind: "text", title: "悟", body: "你悟到：同系道法相邻施展，气机共鸣，威力倍增。\n此乃——道法共鸣。", buttons: [{ label: "妙哉" }] });
      } else {
        this.queuePopup({ kind: "text", title: "教学", body: "山野妖猪皮糙肉厚，这一战未能取胜。\n不妨调整斗法栏，让同系道法相邻，再试一次。", buttons: [{ label: "知道了" }] });
      }
      this._afterMutated(); return;
    }
    /* 道友回访·并肩斗法结算（21.4 §3.2：胜有叙事收获，败零惩罚） */
    if (battle.source === "visit") { this._finishVisitBattle(battle); return; }
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
    // 21.4 §3.2：快照本次变更前的结缘集合——刚在本轮结缘的道友不立刻回访（"结缘后"回访），
    // 也保证未结缘者全程零引用。
    const bondedBefore = new Set();
    for (const row of DataManager.getRows("companion_table")) {
      const id = String(row.companion_id);
      if (!UnlockManager.conditionMet(this.state, String(row.unlock_realm || ""))) continue;
      if (!this.state.companions[id]) this.state.companions[id] = { stage: 0, bonded: false, visit_ptr: 0, favor: 0, last_visit_day: 0, pending_visit: "" };
      const c = this.state.companions[id];
      if (c.bonded) bondedBefore.add(id);
      const stages = row.stages || [];
      let guard = 0;
      while (!c.bonded && guard++ < 10) {
        if (c.stage >= stages.length) { this._bondCompanion(row); break; }
        const st = stages[c.stage];
        if (!this._companionConditionMet(st.condition)) break;
        c.stage += 1;
        this._log(`因缘·${row.name}：${st.title}。`);
        this._witness("stage_" + id + "_" + c.stage); // 21.3 §3.3 E4 见闻录：同伴弧关键节点写入结构（首批覆盖结缘，stage 条目留扩展位）
        this.queuePopup({ kind: "text", style: "seal", title: `因缘·${row.name}｜${st.title}`, body: String(st.text || ""), buttons: [{ label: "继续" }] });
        if (c.stage >= stages.length) this._bondCompanion(row);
      }
    }
    this._checkCompanionVisits(bondedBefore);
  },

  _companionConditionMet(cond = {}) {
    const s = this.state;
    // 21.4 §3.2.1 数据形状兼容：visits 条件是裸 {all_of:[...]} 对象（无 type 字段），
    // 与带 type 的 stage 条件并存；裸 all_of 空数组视为不满足，防无条件回访。
    if (cond.type === undefined && Array.isArray(cond.all_of)) {
      return cond.all_of.length > 0 && cond.all_of.every((sub) => this._companionConditionMet(sub));
    }
    switch (cond.type) {
      case "auto": return true;
      case "realm": return DataManager.isRealmAtLeast(s.realm_id, String(cond.realm_id));
      case "boss_cleared": {
        const clears = int(s.boss_clears[String(cond.boss_id)]);
        return clears >= int(cond.count, 1);
      }
      // 21.4 §3.2：多条件与包装器（visits 富条件入口）；空 all_of 视为不满足，防无条件回访
      case "all_of": return Array.isArray(cond.all_of) && cond.all_of.length > 0 && cond.all_of.every((sub) => this._companionConditionMet(sub));
      // 破关总数门（21.4 §3.4 赵公明「破关五阵」）：口径同 array_win_count 的求和写法
      case "boss_clears_total": {
        const total = Object.values(s.boss_clears || {}).reduce((sum, n) => sum + int(n), 0);
        return total >= int(cond.value, 1);
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
        const school = String(cond.spell_school || cond.spell_type || "");
        const need = int(cond.level, 1);
        return DataManager.getRows("skill_table").some((row) => {
          if (String(row.spell_type || "") !== school && String(row.spell_school || "") !== school) return false;
          return int((s.skill_levels || {})[row.id]) >= need;
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
    this._witness("bond_" + id); // 21.3 §3.3 E4 见闻录：同伴结缘见证（首批 19 人逐条挂锚点）
    // P1 阵容：结缘后若上场位未满（<3），自动补位
    if (!Array.isArray(this.state.lineup)) this.state.lineup = [];
    if (this.state.lineup.length < 3 && !this.state.lineup.includes(id)) this.state.lineup.push(id);
    this._log(`道友结缘：${row.name}——${row.bond_passive_desc}。`);
    this.queuePopup({ kind: "text", style: "goal", title: `道友结缘：${row.name}`, body: `${row.bond_text || ""}\n\n护持：${row.bond_passive_desc}\n专属斗法牌已就绪，可在洞府「道友阵容」安排上场（最多 3 位）。`, buttons: [{ label: "志同道合" }] });
  },

  // ---------- 结缘后回访（design/21.4 §3.2 低代码档：visits 评估器） ----------
  // 数据为体：stance/visits 全在 companion_table.json，此处只是评估器。
  // 三重频控：一次 _afterMutated 至多 1 条 / 每位道友冷却 ≥7 天 / 全局每周 ≤2 条；
  // 开局总闸：开局阶段或境界 < zr_06 一律不触发（前 30 分钟零新增负担）；
  // 导演纪律：pending_event_id 被机缘占用即让位（对齐 content-director.js:41）。

  _visitDay() { // 账号日（同 ContentDirector.accountDay 口径：floor((now-created)/86400)）
    return Math.max(0, Math.floor((nowUnix() - int(this.state.created_at, nowUnix())) / 86400));
  },

  _checkCompanionVisits(bondedBefore = new Set()) {
    const s = this.state;
    const day = this._visitDay();
    // 先兑过去选择的延迟风味浮字（纯 _log，不弹窗；只可能由已结缘者的选项产生）
    for (const row of DataManager.getRows("companion_table")) {
      const c = s.companions[String(row.companion_id)];
      if (c && c.pending_log && day >= int(c.pending_log.day)) {
        this._log(String(c.pending_log.text || ""));
        c.pending_log = null;
      }
    }
    // 开局总闸：开局阶段或境界 < zr_06 → 一律不触发
    if (this.isOpeningStage() || !DataManager.isRealmAtLeast(s.realm_id, "zr_06")) return;
    // 导演纪律：机缘占用弹窗即让位
    if (s.pending_event_id) return;
    // 全局每周 ≤2（按账号周滚动）
    const week = Math.floor(day / 7);
    if (int(s.visit_week, -1) !== week) { s.visit_week = week; s.visit_week_count = 0; }
    if (int(s.visit_week_count) >= 2) return;
    for (const row of DataManager.getRows("companion_table")) {
      const id = String(row.companion_id);
      const visits = Array.isArray(row.visits) ? row.visits : [];
      if (!visits.length) continue;
      const c = s.companions[id];
      if (!c || !c.bonded || !bondedBefore.has(id)) continue; // 未结缘/本轮刚结缘 → 全程零引用
      const v = visits[int(c.visit_ptr)]; // visit_ptr 单向推进，只评估当下一条
      if (!v) continue;
      if (!this._companionConditionMet(v.condition || {})) continue; // 条件不满足 → 全程零引用该人物
      const cd = Math.max(7, int(v.cooldown_days, 7));
      if (int(c.last_visit_day) > 0 && day - int(c.last_visit_day) < cd) continue; // last_visit_day=0 表"从未回访"
      this._fireCompanionVisit(row, v, day);
      break; // 一次变更至多 1 条 visit（离线收菜结算批次视同一次）
    }
  },

  _fireCompanionVisit(row, v, day) {
    const s = this.state;
    const c = s.companions[String(row.companion_id)];
    c.visit_ptr = int(c.visit_ptr) + 1;
    c.last_visit_day = Math.max(1, day);
    s.visit_week_count = int(s.visit_week_count) + 1;
    this._log(`道友回访·${row.name}：${String(v.title || "")}。`);
    // 选项可带条件（如劫气门槛显现的"态度之变"），当场过滤
    const options = (Array.isArray(v.options) ? v.options : []).filter((o) => !o.condition || this._companionConditionMet(o.condition));
    // 带选项回访置"待选中标记"：chooseVisitOption 凭它核对身份并防重复结算；
    // 无选项回访（纯风味"记下了"）无需结算，不置标记。
    if (options.length) c.pending_visit = String(v.visit_id || "");
    this.queuePopup({
      kind: "text", style: "seal", // 同 stage 弹窗规格，视觉零新增
      title: `道友回访·${row.name}｜${String(v.title || "")}`,
      body: String(v.text || ""),
      buttons: options.length
        ? options.map((o, i) => ({ label: String(o.text || "……"), action: "visit_option", visit: { id: String(row.companion_id), visit_id: String(v.visit_id || ""), index: i } }))
        : [{ label: "记下了" }],
    });
  },

  chooseVisitOption(sel = {}) {
    const s = this.state;
    const id = String(sel.id || "");
    const row = DataManager.getById("companion_table", id);
    const c = s.companions[id];
    const visits = Array.isArray(row.visits) ? row.visits : [];
    // 凭 pending_visit 标记核对身份：触发时置位、结算后清空——
    // 重复调用/跨回访伪造的 visit_id 对不上标记，直接拒绝（防重复发奖）。
    if (!c || !c.bonded || String(c.pending_visit || "") !== String(sel.visit_id || "")) return { ok: false };
    const v = visits[int(c.visit_ptr) - 1];
    if (!v || String(v.visit_id || "") !== String(sel.visit_id || "")) return { ok: false };
    const options = (Array.isArray(v.options) ? v.options : []).filter((o) => !o.condition || this._companionConditionMet(o.condition));
    const o = options[int(sel.index)];
    if (!o) return { ok: false };
    c.pending_visit = "";
    const reward = this._applyEventReward(o.reward || {}); // 奖励走机缘同一口径（resources/log 语法复用）
    const eff = o.effect || {};
    if (int(eff.favor)) c.favor = int(c.favor) + int(eff.favor); // favor 只开新事件、不开/关旧收益，不进数值面板
    if (eff.flag) s.flags[String(eff.flag)] = true;
    let settleText = "";
    if (num(eff.settle_loot_pct) > 0) {
      // 「一成照付」：当前战利（道行）一次性结算，两路皆赚，非惩罚分支
      const pay = Math.floor(num(s.resources.daoxing) * num(eff.settle_loot_pct));
      s.resources.daoxing = Math.max(0, num(s.resources.daoxing) - pay);
      settleText = `\n\n战利一次性结算：道行 -${formatInt(pay)}。`;
    }
    if (eff.delayed_log) {
      c.pending_log = { day: this._visitDay() + Math.max(1, int(eff.delayed_log.delay_days, 7)), text: String(eff.delayed_log.text || "") };
    }
    this._log(`道友回访·${row.name}｜${String(v.title || "")}：${String(o.text || "")}。`);
    const deltaText = this._formatResourceDelta(reward.resources || {});
    if (!eff.battle) this.toast(`道友回访·${row.name}`, `${String(o.log || "")}${settleText}${deltaText ? "\n\n" + deltaText : ""}`, 3200);
    if (eff.battle) this._startVisitBattle(row, v, eff.battle);
    this._afterMutated();
    return { ok: true };
  },

  _startVisitBattle(row, v, cfg) {
    // 敌力按境界缩放：复用现成 境界→地图 recommended_power 强度阶梯（同游历遭遇口径，不新造数值模型）
    let base = 300;
    for (const m of DataManager.getRows("map_table")) {
      if (DataManager.isRealmAtLeast(this.state.realm_id, String(m.unlock_realm || "rq_01"))) base = Math.max(base, num(m.recommended_power));
    }
    const enemyPower = Math.max(50, Math.round(base * num(cfg.power_ratio, 0.25)));
    this.startBattleV2({
      name: String(cfg.name || row.name),
      enemy_power: enemyPower,
      source: "visit",
      payload: { visit: { companion_id: String(row.companion_id), visit_id: String(v.visit_id || ""), win_log: String(cfg.win_log || ""), fail_log: String(cfg.fail_log || ""), win_effect: cfg.win_effect || {} } },
    });
  },

  _finishVisitBattle(battle) {
    const info = (battle.payload && battle.payload.visit) || {};
    const id = String(info.companion_id || "");
    const row = DataManager.getById("companion_table", id);
    const c = this.state.companions[id];
    const name = Object.keys(row).length ? String(row.name) : id;
    if (battle.win) {
      const eff = info.win_effect || {};
      if (c && int(eff.favor)) c.favor = int(c.favor) + int(eff.favor);
      if (eff.flag) this.state.flags[String(eff.flag)] = true;
      this._log(String(info.win_log || ""));
      this.toast(`道友回访·${name}`, String(info.win_log || ""), 3200);
      this._companionVisitGrowth(id);
    } else {
      // 败亦零惩罚：不扣进程与资源，只留叙事余味（21.4 §4 R2）
      this._log(String(info.fail_log || ""));
      this.toast(`道友回访·${name}`, String(info.fail_log || ""), 3200);
    }
    this._afterMutated();
  },

  // 21.4 §3.3 S1 预留接口：回访并肩斗法胜利后，该道友护持成长台阶 +1。
  // S1（bond_passive 成长、只增不减）属第 2 批系统级，立项前此处为命名接缝，不落任何状态。
  _companionVisitGrowth(_companionId) { /* S1 预留 */ },

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
    if (owned.length === 1) this._offerEvent("event_328");
    if (seat.id === "leibu") this._offerEvent("event_329");
    if (owned.length >= GOD_SEATS.length) this._offerEvent("event_330");
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
    // 炼丹产出倍率：五庄观果会 ×2（pillOutputMult）· 天庭敕令·炼丹 ×2（consumeEdict，消耗库存指定）
    // C 线·太上老君结缘护持：炼丹产出 ×2（上场道友生效）
    const laojunMult = bondPassiveSum(this.state, "alchemy_double") > 0 ? 2 : 1;
    const outMult = this.pillOutputMult() * this.consumeEdict("alchemy") * laojunMult;
    const boostNote = outMult > 1 ? `（产出 ×${outMult}）` : "";
    if (pillId === "due") { const n = (q === "shang" ? 2 : 1) * outMult; this.state.pills.due = int(this.state.pills.due) + n; this._log(`炉火纯青，炼成${qname}渡厄丹 ${n} 枚${boostNote}（存 ${this.state.pills.due}）。`); }
    else if (pillId === "peiyuan") { const hours = (q === "shang" ? 3 : q === "xia" ? 1.5 : 2) * outMult; this.state.pills.peiyuan_until = nowUnix() + Math.round(hours * 3600); this._log(`服下${qname}培元丹，丹田暖意流转——${hours} 时辰内收益 +15%${boostNote}。`); }
    else if (pillId === "ningfa") { const mins = (q === "shang" ? 45 : q === "xia" ? 20 : 30) * outMult; const g = { daoxing: num(RewardManager.calculateRewardForMinutes(this.state, mins, { includeMap: false }).resources.daoxing) }; this._applyResourceDelta(g); this._log(`${qname}凝法丹化开，法力转为道行 +${formatInt(g.daoxing)}${boostNote}。`); }
    this._offerEvent("event_325");
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
    // 炼丹产出倍率：五庄观果会 ×2 · 天庭敕令·炼丹 ×2（design/7.2 v0.2）
    // C 线·太上老君结缘护持：炼丹产出 ×2（上场道友生效）
    const laojunMult = bondPassiveSum(this.state, "alchemy_double") > 0 ? 2 : 1;
    const outMult = this.pillOutputMult() * this.consumeEdict("alchemy") * laojunMult;
    const boostNote = outMult > 1 ? `（产出 ×${outMult}）` : "";
    if (pillId === "due") { const n = 1 * outMult; this.state.pills.due = int(this.state.pills.due) + n; this._log(`你炼成渡厄丹 ${n} 枚${boostNote}（存 ${this.state.pills.due} 枚）——破劫斗法开局得护持。`); }
    else if (pillId === "peiyuan") { const hours = 2 * outMult; this.state.pills.peiyuan_until = nowUnix() + Math.round(hours * 3600); this._log(`你服下培元丹，丹田暖意流转——${hours} 时辰内闭关与行动收益 +15%${boostNote}。`); }
    else if (pillId === "ningfa") { const mins = 30 * outMult; const g = { daoxing: num(RewardManager.calculateRewardForMinutes(this.state, mins, { includeMap: false }).resources.daoxing) }; this._applyResourceDelta(g); this._log(`你炼化凝法丹，法力转为道行 +${formatInt(g.daoxing)}${boostNote}。`); }
    this._afterMutated();
  },

  // ---------- 战后休整 ----------

  _restCardPool() {
    const pool = ["charm_strike", "charm_guard"];
    for (const id of Object.keys(this.state.skill_levels || {})) { if (int(this.state.skill_levels[id]) > 0) pool.push(id); }
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

  // 连战 auto-advance（design/16.0 批次0 §1.4）：同 chain_id 下找 chain_order+1 的下一阵
  _nextChainBossId(bossId) {
    const cur = DataManager.getById("boss_table", bossId);
    const chainId = str(cur.chain_id, "");
    if (!chainId) return null;
    const order = int(cur.chain_order);
    const next = DataManager.getRows("boss_table").find((r) => str(r.chain_id, "") === chainId && int(r.chain_order) === order + 1);
    return next ? str(next.boss_id, "") : null;
  },

  // 连战续战：读 _pendingChainBossId → 推进游标 → 绕过每日限次直接开下一阵
  _nextChainBoss() {
    const curId = str(this._pendingChainBossId, "");
    const nextId = this._nextChainBossId(curId);
    if (!nextId) { this._stopChain(); return; }
    const boss = DataManager.getById("boss_table", nextId);
    if (!Object.keys(boss).length) { this._stopChain(); return; }
    this._pendingChainBossId = nextId;
    this.state.boss_counts_today[nextId] = int(this.state.boss_counts_today[nextId]) + 1;
    this._log(`连战：${boss.boss_name}接阵而来！`);
    const adds = { boss_002: [{ name: "巡海残兵", power: num(boss.recommended_power) * 0.2 }],
      boss_003: [{ name: "白骨阴火", power: num(boss.recommended_power) * 0.12 }, { name: "白骨阴火", power: num(boss.recommended_power) * 0.12 }],
      boss_020: [{ name: "碧霄", power: num(boss.recommended_power) * 0.5 }, { name: "琼霄", power: num(boss.recommended_power) * 0.5 }] }[nextId] || [];
    const mechanic = boss.mechanics ? String(boss.mechanics).split(":")[0].trim() : null;
    const cfg = { name: String(boss.boss_name), enemy_power: num(boss.recommended_power), adds, source: "boss", mechanic, weakness: boss.weakness || null, payload: { bossId: nextId } };
    this.startBattleV2(cfg);
    this._afterMutated();
  },

  // 连战收手：清游标 → 回到正常休整
  _stopChain() {
    const curId = str(this._pendingChainBossId, "");
    this._pendingChainBossId = null;
    this._queueRestPopup(curId);
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
    this.queuePopup({ kind: "text", style: "seal", title: FeedbackRenderer.line("popup_offline_done") || "出关",
      body: `你在洞中参玄悟道 ${formatDuration(int(reward.minutes))}。\n山中灵气渐渐汇入周身，封神榜碎光在远天一闪而没。\n\n获得：\n${this._formatResourceDelta(reward.resources || {})}${RealmManager.canLevelUp(this.state) ? "\n\n道行已满，可提升境界。" : ""}${eventTriggered ? "\n\n天象有变，似有机缘浮现。" : ""}`,
      buttons: [{ label: "收下" }] });
    this._afterMutated();
    if (eventTriggered) this._queueEventPopup();
    // 21.6 L1"首次退出"触发：真实游玩过（在线累计 ≥5 分钟）且未弹过三问 → 出关时补发
    if (int(this.state.play_seconds) >= 300) this._maybeShowThreeQ(true);
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
    if (typeof AudioManager !== "undefined") AudioManager.playSfx("realm_up"); // SFX-06 升重清越音
    this.updateAmbient(); // 境界变化 → 切换环境音床（山野/陈塘/骷髅山）
      // 第二层·小仪式：阶段转换（每3重）给呼吸时刻；普通升重只给气韵，不弹窗（design/6.0）
      const ritualText = Atmosphere.phaseRitual(String(to.realm_id));
      if (Atmosphere.isPhaseTransition(from, to) && ritualText) {
        Atmosphere.playRitual(ritualText);
        this._log(`【境界】${ritualText}`);
      } else {
        this.toast(`突破至${getPhaseRealmName(to)}`, to.lore_text || "你吐纳周天，法力更进一步。", 3200, "world");
      }
      this._queueNewUnlockPopups(before);
    if (!this.state.pending_event_id) { const eventId = EventManager.rollEvent(this.state, "level_up"); if (eventId) { this._setPendingEvent(eventId); this._queueEventPopup(); } }
    if (typeof ContentDirector !== "undefined") ContentDirector.pulse("realm");
    if (String(from.major_realm) !== "天仙" && String(to.major_realm) === "天仙") this._awakenShentong(false);
    this._maybeQueueEndingChoice(true); // 21.3 §3.3 E2：hy_10 毕业自动入队三选一（一世一次，弹窗克制）
    this._afterMutated();
  },

  // ---------- 丹房·替身符（21.1 §1.6，三条破劫路的"代形"路） ----------
  // 数据为体：成本/境界门/每日限/文案全部读 pill_table 行（DataManager.getById），代码不存第二份。

  getTishanRow() { return DataManager.getById("pill_table", "tishen"); },

  craftTishan() {
    const row = this.getTishanRow();
    if (!Object.keys(row).length || !this.isAlchemyUnlocked()) return { ok: false };
    if (!UnlockManager.conditionMet(this.state, String(row.unlock_realm || ""))) {
      this.queuePopup({ kind: "text", title: String(row.pill_name || "替身符"), body: "境界未至，此符不认功德。真人境后，方可借榜文留名炼符。", buttons: [{ label: "知道了" }] });
      return { ok: false };
    }
    const today = todayString();
    const daily = int(row.daily_limit, 1);
    if (daily > 0 && str(this.state.pills.tishen_day, "") === today && int(this.state.pills.tishen_today) >= daily) {
      this.queuePopup({ kind: "text", title: String(row.pill_name || "替身符"), body: "今日炉火已为此符熄过一次。功德为引，不可强炼。", buttons: [{ label: "知道了" }] });
      return { ok: false };
    }
    const cost = row.cost || {};
    for (const rid of Object.keys(cost)) {
      if (num(this.state.resources[rid]) < num(cost[rid])) { this.queuePopup({ kind: "text", title: String(row.pill_name || "替身符"), body: "功德或炼材不足，符胎难成。", buttons: [{ label: "知道了" }] }); return { ok: false }; }
    }
    for (const rid of Object.keys(cost)) this.state.resources[rid] = num(this.state.resources[rid]) - num(cost[rid]);
    if (str(this.state.pills.tishen_day, "") !== today) { this.state.pills.tishen_day = today; this.state.pills.tishen_today = 0; }
    this.state.pills.tishen_today = int(this.state.pills.tishen_today) + 1;
    this.state.pills.tishen = int(this.state.pills.tishen) + 1;
    this._log(`功德为引，炼材为骨——${row.pill_name}成。破劫若败，它替你受榜文一笔（存 ${int(this.state.pills.tishen)} 张）。`);
    this._afterMutated();
    return { ok: true };
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
    // 21.1 §1.2 显示=现实：breakdown 净值（剧情+功德+法宝+地脉+屡败+跟脚+阵营−劫气）→ 开局罡气，
    // 由 battle-engine-v2.js create 处按 TRIB_ADV_K 兑现为战斗优势；面板承诺的因果护持不再是空头数字。
    // （T-D 口径对齐：story/pulse 并入兑现，面板行与净值双向一致；bondTrib 由 trib_shield 独立兑现，不重复计入。）
    const advNet = breakdown
      ? breakdown.storyBonus + breakdown.meritBonus + breakdown.treasureBonus + breakdown.pulseBonus + breakdown.failBonus + breakdown.raceBonus + breakdown.factionBonus - breakdown.calamityPenalty
      : 0;
    // 21.1 §1.1 数据归一：breakthrough_table.phases 是劫战阶段的唯一数据源（constants 硬编码已删）。
    // pool 为意图池键，解析自 constants.TRIBULATION_INTENT_POOLS；字段缺失即无专属意图池。
    const phases = (Array.isArray(data.phases) ? data.phases : [])
      .map((p) => ({ name: String(p?.name || ""), power_ratio: num(p?.power_ratio, 0.8), intro: String(p?.intro || ""), pool: TRIBULATION_INTENT_POOLS[String(p?.pool || "")] || null }))
      .filter((p) => p.name);
    this._log(`榜文垂光，${data.display_name}的劫数显化而出。`);
    // 回合上限按目标带上沿×段数放宽（防多段劫超时判负）；feel_lock（bt_001 黄金快照）保持默认 20 不动。
    const feelLock = !!data.feel_lock;
    const maxRounds = feelLock ? undefined : Math.max(20, 8 * (phases.length || 1));
    this.startBattleV2({ name: "封神榜文", source: "breakthrough", phases: phases.length ? phases : null, feelLock, maxRounds, payload: { breakthroughId: id, rate: num(breakdown?.rate), failCount: int(this.state.breakthrough_fail_counts[id]), guarantee: int(data.guarantee_after_fail, 99), advantage: num(advNet) } });
  },

  // ---------- 机缘 ----------

  openPendingEvent() {
    if (!this.state.pending_event_id) return;
    this.eventPopupActive = false;
    this.popupQueue = (this.popupQueue || []).filter((p) => p.kind !== "event");
    if (typeof releaseStaleModal === "function") releaseStaleModal();
    this.state.pending_event_prelude = false;
    this._queueEventPopup();
    if (typeof drainPopupQueue === "function") drainPopupQueue();
  },

  chooseEventOption(optionIndex) {
    const eventId = this.state.pending_event_id;
    const eventRow = EventManager.getEvent(eventId);
    if (!Object.keys(eventRow).length) {
      this.state.pending_event_id = "";
      this.eventPopupActive = false;
      return { ok: false };
    }
    const options = eventRow.options || eventRow.choices || [];
    const narrative = !options.length;
    if (!narrative && (optionIndex < 0 || optionIndex >= options.length)) return { ok: false };
    const option = narrative ? null : options[optionIndex];
    const reward = this._applyEventReward(narrative ? (eventRow.reward || {}) : (option.reward || option.result || {}));
    EventManager.markSeen(this.state, eventId);
    this.state.pending_event_id = ""; this.eventPopupActive = false;
    const deltaText = this._formatResourceDelta(reward.resources || {});
    if (typeof AudioManager !== "undefined") AudioManager.playSfx("fortune");
    if (narrative) {
      this._log(`机缘「${eventRow.event_name}」已入心。`);
      this.toast(String(eventRow.event_name || "机缘"), deltaText || "记下这一缕气机。", 2600);
    } else {
      this._log(`机缘「${eventRow.event_name}」：${option.text || option.label}。`);
      const flavor = (option.reward && option.reward.log) || (option.result && option.result.log) || `你选择了「${option.text || option.label}」。`;
      this.queuePopup({ kind: "text", style: "chance", title: String(eventRow.event_name || "机缘"), body: `${flavor}${deltaText ? `\n\n获得：\n${deltaText}` : ""}`, buttons: [{ label: "收下机缘" }] });
    }
    this._afterMutated();
    return { ok: true };
  },

  // ---------- 种族与势力 ----------

  isRaceOpen(raceId) {
    const row = DataManager.getById("race_table", raceId);
    if (!Object.keys(row).length) return false;
    return row.open === true; // 缺省（无 open 字段）视为锁定
  },

  chooseRace(raceId) {
    const row = DataManager.getById("race_table", raceId);
    if (!Object.keys(row).length) return;
    if (this.state.flags.race_choice_done) return;
    if (row.open !== true) return; // 暂未开放的种族不可选（纵深防御，转世重开选择亦生效）
    this.state.race_id = String(raceId); this.state.flags.race_choice_done = true;
    if (String(raceId) === "xiantian" && !this.state.treasures.treasure_009) this.state.treasures.treasure_009 = { level: 1, owned: true };
    this._log(`你觉醒了跟脚：${row.race_name}。`);
    this.queuePopup({ kind: "text", style: "seal", title: `跟脚已定：${row.race_name}`, body: String(row.choose_text || row.talent_desc || "") + "\n\n——此念既定，道途不再回头。", buttons: [{ label: "踏入修行" }] });
    this._afterMutated();
  },

  chooseFaction(factionId) {
    const row = DataManager.getById("faction_table", factionId);
    if (!Object.keys(row).length) return;
    if (this.state.faction_id) return;
    this.state.faction_id = String(factionId);
    this._log(`你投身${row.faction_name}（${row.dojo}），自此入局。`);
    this.queuePopup({ kind: "text", style: "seal", title: `入局：${row.faction_name}`, body: String(row.join_text || ""), buttons: [{ label: "领受护持" }] });
    this._offerEvent(FACTION_JOIN_EVENT[factionId]);
    this._afterMutated();
  },

  _maybeQueueFactionChoice() { if (this.state.faction_id) return; if (this.popupQueue.some((p) => p.kind === "faction_choice")) return; this.queuePopup({ kind: "faction_choice" }); },

  // ---------- 势力完整独有系统（design/7.2 v0.2 完整范围）----------

  // ===== 阐教·玉虚炼器（炼器合成系统）=====
  // 流程：择配方 → 消耗法宝碎片+法力 → 火候时机条（CraftMinigame）→ 品质定产出法宝初始品级。
  // 产出物为合成高阶法宝（treasure_syn_*），入法宝系统（state.treasures），可继续温养。

  getSynthRecipes() {
    const fid = str(this.state.faction_id, "");
    return DataManager.getRows("synth_recipe_table").filter((r) =>
      fid === "chan" && DataManager.isRealmAtLeast(this.state.realm_id, String(r.unlock_realm || ""))
    );
  },

  // 炼器第一步（UI 调用）：校验材料与势力，返回是否可开炉（实际开炉由 UI 触发 CraftMinigame）
  canCraftSynth(recipeId) {
    if (str(this.state.faction_id, "") !== "chan") return { ok: false, reason: "非阐教弟子" };
    const recipe = DataManager.getById("synth_recipe_table", recipeId);
    if (!Object.keys(recipe).length) return { ok: false, reason: "无此配方" };
    for (const rid of Object.keys(recipe.cost || {})) {
      if (num(this.state.resources[rid]) < num(recipe.cost[rid])) return { ok: false, reason: "材料不足" };
    }
    return { ok: true, recipe };
  },

  // 炼器第二步（火候停手后回调）：消耗材料，按品质产出法宝
  craftSynthFinish(recipeId, quality) {
    const check = this.canCraftSynth(recipeId);
    if (!check.ok) { this.queuePopup({ kind: "text", title: "玉虚炼器", body: check.reason, buttons: [{ label: "知道了" }] }); return { ok: false }; }
    const recipe = check.recipe;
    const outId = String(recipe.output_treasure);
    const outRow = DataManager.getById("treasure_table", outId);
    for (const rid of Object.keys(recipe.cost || {})) this.state.resources[rid] = num(this.state.resources[rid]) - num(recipe.cost[rid]);
    const q = String(quality || "zhong");
    const qname = (typeof CRAFT_QUALITY !== "undefined" && CRAFT_QUALITY[q]) ? CRAFT_QUALITY[q].name : "中品";
    const tState = this.getTreasureState(outId);
    const alreadyOwned = int(tState.level) > 0;
    // 品质定初始品级：上品=3 重 / 中品=2 重 / 下品=1 重；已炼成则在此基础上淬炼 +1 重（不超上限）
    let newLevel;
    if (!alreadyOwned) {
      newLevel = q === "shang" ? 3 : q === "xia" ? 1 : 2;
    } else {
      newLevel = Math.min(int(tState.level) + 1, int(outRow.max_level_mvp, 5));
    }
    tState.level = newLevel; tState.owned = true;
    if (!alreadyOwned) {
      this._log(`玉虚炼器·${qname}：炉火纯青，「${outRow.treasure_name}」炼成，初成 ${newLevel} 重。`);
      this.queuePopup({ kind: "text", style: "treasure", title: `玉虚炼器·${qname}`, body: `炉火停于${qname}之处，宝光凝聚成形。\n\n炼成「${outRow.treasure_name}」（${newLevel} 重）。\n此宝已入你的法宝之列，可于法宝面板继续温养。`, buttons: [{ label: "收宝" }] });
    } else {
      this._log(`玉虚炼器·${qname}：「${outRow.treasure_name}」淬炼至 ${newLevel} 重。`);
      this.queuePopup({ kind: "text", style: "treasure", title: `玉虚炼器·${qname}`, body: `你以炉火淬炼旧宝。\n\n「${outRow.treasure_name}」${int(tState.level) - 1} 重 → ${newLevel} 重。`, buttons: [{ label: "收功" }] });
    }
    this._afterMutated();
    return { ok: true, quality: q, level: newLevel };
  },

  // ===== 碎片系统（design/16.0：专属碎片定向合成 + 通用碎片抽奖）=====

  // 法宝品阶（由 unlock_realm 段推导；treasure_table.rarity 字段未填充）🔴待校准
  _treasureTier(treasureId) {
    const row = DataManager.getById("treasure_table", treasureId);
    const prefix = str(row.unlock_realm, "").split("_")[0];
    if (prefix === "rq" || prefix === "zr") return "fan";   // 凡品
    if (prefix === "dx" || prefix === "tx") return "ling";  // 灵品
    if (prefix === "zx" || prefix === "jx") return "xian";  // 仙品
    return "shen"; // ty/dl/zs/hy 神品
  },

  // 专属碎片·定向合成：集满 N 个某法宝碎片 → 直接合成该法宝（确定性）
  synthDedicated(treasureId) {
    const row = DataManager.getById("treasure_table", treasureId);
    if (!Object.keys(row).length) return { ok: false, reason: "无此法宝" };
    const tier = this._treasureTier(treasureId);
    const need = { fan: 10, ling: 20, xian: 35, shen: 50 }[tier] || 20;
    if (!this.state.treasure_fragments) this.state.treasure_fragments = {};
    const have = int(this.state.treasure_fragments[treasureId]);
    if (have < need) return { ok: false, reason: `「${row.treasure_name}」专属碎片不足（${have}/${need}）。` };
    this.state.treasure_fragments[treasureId] = have - need;
    const tState = this.getTreasureState(treasureId);
    const alreadyOwned = int(tState.level) > 0;
    tState.level = alreadyOwned ? Math.min(int(tState.level) + 1, int(row.max_level_mvp, 5)) : 1;
    tState.owned = true;
    this._log(`专属碎片凝聚：「${row.treasure_name}」${alreadyOwned ? "淬炼至 " + tState.level + " 重" : "炼成"}。`);
    this.queuePopup({ kind: "text", style: "treasure", title: "碎片合成", body: `${need} 枚「${row.treasure_name}」专属碎片凝聚成形。\n\n「${row.treasure_name}」${alreadyOwned ? "淬炼至 " + tState.level + " 重" : "炼成，初入你的法宝之列"}。`, buttons: [{ label: "收宝" }] });
    this._afterMutated();
    return { ok: true, level: tState.level };
  },

  // 通用碎片·抽奖：消耗 15 个通用碎片（treasure_shard）→ 按境界段奖池加权随机得一件法宝
  synthLottery() {
    const cost = 15;
    if (num(this.state.resources.treasure_shard) < cost) return { ok: false, reason: `通用碎片不足（${int(this.state.resources.treasure_shard)}/${cost}）。` };
    const tierOrder = ["rq", "zr", "dx", "tx", "zx", "jx", "ty", "dl", "zs", "hy"];
    const maxIdx = Math.max(0, tierOrder.indexOf(str(this.state.realm_id, "").split("_")[0]));
    const pool = DataManager.getRows("treasure_table").filter((r) => tierOrder.indexOf(str(r.unlock_realm, "").split("_")[0]) <= maxIdx);
    if (!pool.length) return { ok: false, reason: "奖池为空。" };
    const weight = { fan: 60, ling: 28, xian: 10, shen: 2 }; // 高价值极低 🔴待校准
    const weighted = pool.map((r) => ({ row: r, w: weight[this._treasureTier(r.treasure_id)] || 30 }));
    const total = weighted.reduce((s, x) => s + x.w, 0);
    let roll = Math.random() * total, pick = weighted[0].row;
    for (const x of weighted) { roll -= x.w; if (roll <= 0) { pick = x.row; break; } }
    this.state.resources.treasure_shard = num(this.state.resources.treasure_shard) - cost;
    const tState = this.getTreasureState(pick.treasure_id);
    const alreadyOwned = int(tState.level) > 0;
    tState.level = alreadyOwned ? Math.min(int(tState.level) + 1, int(pick.max_level_mvp, 5)) : 1;
    tState.owned = true;
    this._log(`通用碎片抽奖：宝光随机凝聚，「${pick.treasure_name}」${alreadyOwned ? "淬炼至 " + tState.level + " 重" : "炼成"}。`);
    this.queuePopup({ kind: "text", style: "treasure", title: "碎片抽奖", body: `${cost} 枚通用碎片投入炉中，宝光随机凝聚。\n\n抽得「${pick.treasure_name}」${alreadyOwned ? "（淬炼至 " + tState.level + " 重）" : "（炼成）"}。`, buttons: [{ label: "收宝" }] });
    this._afterMutated();
    return { ok: true, treasure: pick.treasure_id, level: tState.level };
  },

  // ===== 截教·万仙阵法（阵法卡系统）=====
  // 可学习（耗功德/劫气）、可携带（装备入阵法栏，有栏位上限）、战斗中生效（首回合敌方全体受伤加成）。

  getArrayCards() {
    const fid = str(this.state.faction_id, "");
    return DataManager.getRows("array_card_table").filter((r) =>
      fid === "jie" && DataManager.isRealmAtLeast(this.state.realm_id, String(r.unlock_realm || ""))
    );
  },

  arraySlots() {
    // 阵法栏位：基础 1，地仙（zr_06）后 +1
    return DataManager.isRealmAtLeast(this.state.realm_id, "zr_06") ? 2 : 1;
  },

  arrayCardLevel(cardId) { return int(this.state.array_cards[String(cardId)]); },

  arrayCardBonus(cardRow, level) {
    return num(cardRow.base_bonus) + num(cardRow.growth_per_level) * (int(level) - 1);
  },

  learnArrayCard(cardId) {
    if (str(this.state.faction_id, "") !== "jie") return;
    const card = DataManager.getById("array_card_table", cardId);
    if (!Object.keys(card).length) return;
    if (this.arrayCardLevel(cardId) > 0) { this.queuePopup({ kind: "text", title: card.card_name, body: "此阵已悟，可于阵中温养。", buttons: [{ label: "知道了" }] }); return; }
    const cost = card.learn_cost || {};
    for (const rid of Object.keys(cost)) {
      if (num(this.state.resources[rid]) < num(cost[rid])) { this.queuePopup({ kind: "text", title: card.card_name, body: "功德与劫气不足，难以悟阵。", buttons: [{ label: "知道了" }] }); return; }
    }
    for (const rid of Object.keys(cost)) this.state.resources[rid] = num(this.state.resources[rid]) - num(cost[rid]);
    this.state.array_cards[String(cardId)] = 1;
    this._log(`万仙阵法：你于碧游宫阵图中悟得「${card.card_name}」。`);
    this.queuePopup({ kind: "text", style: "seal", title: "悟阵", body: `阵图展开，你于其中悟得「${card.card_name}」。\n可携入阵法栏，斗法首回合敌方全体受伤 +${Math.round(this.arrayCardBonus(card, 1) * 100)}%。`, buttons: [{ label: "记下了" }] });
    this._afterMutated();
  },

  upgradeArrayCard(cardId) {
    if (str(this.state.faction_id, "") !== "jie") return;
    const card = DataManager.getById("array_card_table", cardId);
    if (!Object.keys(card).length) return;
    const lv = this.arrayCardLevel(cardId);
    if (lv <= 0) return;
    if (lv >= int(card.max_level, 5)) { this.queuePopup({ kind: "text", title: card.card_name, body: "此阵已悟至极。", buttons: [{ label: "知道了" }] }); return; }
    const cost = card.upgrade_cost || {};
    for (const rid of Object.keys(cost)) {
      if (num(this.state.resources[rid]) < num(cost[rid])) { this.queuePopup({ kind: "text", title: card.card_name, body: "功德与劫气不足，难以精进。", buttons: [{ label: "知道了" }] }); return; }
    }
    for (const rid of Object.keys(cost)) this.state.resources[rid] = num(this.state.resources[rid]) - num(cost[rid]);
    this.state.array_cards[String(cardId)] = lv + 1;
    this._log(`万仙阵法：「${card.card_name}」精进至 ${lv + 1} 级。`);
    this._afterMutated();
  },

  toggleArrayEquip(cardId) {
    if (str(this.state.faction_id, "") !== "jie") return;
    if (this.arrayCardLevel(cardId) <= 0) return;
    const equipped = this.state.array_equipped;
    const idx = equipped.indexOf(String(cardId));
    if (idx >= 0) { equipped.splice(idx, 1); }
    else {
      if (equipped.length >= this.arraySlots()) { this.queuePopup({ kind: "text", title: "阵法栏", body: `阵法栏已满（${this.arraySlots()} 位）。先撤下一阵，再携新阵。`, buttons: [{ label: "知道了" }] }); return; }
      equipped.push(String(cardId));
    }
    this._afterMutated();
  },

  // 截教已携带阵法卡的首回合总加成（供 battle-engine 调用）
  getArrayFirstRoundBonus(state) {
    if (str(state.faction_id, "") !== "jie") return 0;
    let bonus = 0;
    for (const cardId of (state.array_equipped || [])) {
      const card = DataManager.getById("array_card_table", cardId);
      const lv = int(state.array_cards[String(cardId)]);
      if (Object.keys(card).length && lv > 0) bonus += this.arrayCardBonus(card, lv);
    }
    return bonus;
  },

  // ===== 天庭·功德敕令（敕令库存 + 可指定行动）=====

  edictClaim() {
    if (str(this.state.faction_id, "") !== "tianting") return;
    const today = todayString();
    if (str(this.state.edict_last_claim, "") === today) { this.queuePopup({ kind: "text", title: "功德敕令", body: "今日已领过敕令，明日再来。", buttons: [{ label: "知道了" }] }); return; }
    if (int(this.state.edict_count) >= EDICT_MAX) { this.queuePopup({ kind: "text", title: "功德敕令", body: `敕令库存已满（${EDICT_MAX} 道）。先发敕令，再领新敕。`, buttons: [{ label: "知道了" }] }); return; }
    this.state.edict_last_claim = today;
    this.state.edict_count = int(this.state.edict_count) + 1;
    this._log(`功德敕令：你领一道天庭敕令入库（存 ${this.state.edict_count} 道）。`);
    this._afterMutated();
  },

  edictDesignate(scope) {
    if (str(this.state.faction_id, "") !== "tianting") return;
    if (int(this.state.edict_count) <= 0) { this.queuePopup({ kind: "text", title: "功德敕令", body: "库存无敕令。先领敕令。", buttons: [{ label: "知道了" }] }); return; }
    const target = EDICT_TARGETS.find((t) => t.scope === scope);
    if (!target) return;
    this.state.edict_count = int(this.state.edict_count) - 1;
    this.state.edict_target = scope;
    this._log(`功德敕令：你发一道敕令，指定「${target.name}」——下一次${target.name}收益 ×2。`);
    this.queuePopup({ kind: "text", style: "seal", title: "功德敕令", body: `你发一道敕令，指定「${target.name}」。\n${target.desc}。`, buttons: [{ label: "领敕" }] });
    this._afterMutated();
  },

  // 消耗敕令：若当前指定行动匹配 scope，返回 ×2 并清除指定；否则返回 1
  consumeEdict(scope) {
    if (str(this.state.faction_id, "") !== "tianting") return 1;
    if (str(this.state.edict_target, "") === scope) {
      this.state.edict_target = null;
      this._log("功德敕令生效：此次行动收益 ×2。");
      return 2;
    }
    return 1;
  },

  // ===== 五庄观·人参果会（果会 + 炼丹加成）=====

  factionFeast() {
    if (str(this.state.faction_id, "") !== "wuzhuang") return;
    const now = nowUnix();
    if (int(this.state.faction_feast_cooldown) > now && int(this.state.faction_feast_until) <= now) { this.queuePopup({ kind: "text", title: "人参果会", body: "果会七日一开，时日未到。", buttons: [{ label: "知道了" }] }); return; }
    if (int(this.state.faction_feast_until) > now) { this.queuePopup({ kind: "text", title: "人参果会", body: "果会余韵犹在，七日后再赴。", buttons: [{ label: "知道了" }] }); return; }
    this.state.faction_feast_until = now + 86400;
    this.state.faction_feast_cooldown = now + 86400 * 7;
    this.state.faction_buff = { type: "feast", until: now + 86400 };
    this._log("人参果会：你赴五庄观果会，全属性 +10% 持续 1 天，期间炼丹产出 ×2。");
    this.queuePopup({ kind: "text", style: "seal", title: "人参果会", body: "清风明月引你入座，人参果入口生津。\n全属性 +10%，持续 1 天；\n果会期间，炼丹产出 ×2。", buttons: [{ label: "谢过镇元子" }] });
    this._afterMutated();
  },

  // 五庄观果会炼丹加成是否生效
  feastAlchemyActive(state) {
    return str((state || this.state).faction_id, "") === "wuzhuang" && int((state || this.state).faction_feast_until) > nowUnix();
  },

  // 炼丹产出倍率（五庄观果会 ×2；天庭敕令·炼丹另在 brew 中消耗）
  pillOutputMult() {
    return this.feastAlchemyActive(this.state) ? 2 : 1;
  },

  // 势力 buff 是否激活（供 UI/逻辑查询；现主要用于果会）
  factionBuffActive(type) {
    const fb = this.state.faction_buff;
    if (type === "feast") return int(this.state.faction_feast_until) > nowUnix();
    if (!fb || fb.type !== type) return false;
    return true;
  },

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
    const pity = (DataManager.tables.event_table || {}).pity_rule || {};
    if (pity.first_treasure_event_story_guaranteed) this._offerEvent(EventManager.TREASURE_PITY_EVENT);
    this._afterMutated();
  },

  // ---------- 术法 ----------

  getSpellState(spellId) { if (!this.state.spells[spellId]) this.state.spells[spellId] = { level: 0, unlocked: false }; return this.state.spells[spellId]; },
  getSpellUpgradeCost(spellRow, toLevel) {
    // 人族·苦修之躯：术法升级消耗 -15%（练气终稿种族被动）
    const humanDisc = str(this.state.race_id, "") === "human" ? 0.85 : 1;
    if (toLevel <= 1) {
      // 第一门术法免费；之后每多参悟一门，都要消耗残页与法力——玩家自由选择，不强制学满。
      const learned = Object.values(this.state.spells).filter((s) => int(s.level) > 0).length;
      if (learned === 0) return { spell_page_cost: 0, mana_cost: 0 };
      return { spell_page_cost: Math.round((2 + learned * 2) * humanDisc), mana_cost: Math.round(250 * learned * humanDisc) };
    }
    for (const cost of spellRow.upgrade_costs || []) { if (int(cost.to_level) === toLevel) return { spell_page_cost: Math.round(num(cost.spell_page_cost) * humanDisc), mana_cost: Math.round(num(cost.mana_cost) * humanDisc) }; }
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
      if (!bm) { this.queuePopup({ kind: "text", title: spellRow.spell_name, body: "四阶神通，需先择道统。\n（真仙破劫后，于四修中择一修走到黑。）", buttons: [{ label: "知道了" }] }); return { ok: false }; }
      const _canUse = (typeof LiupaiManager !== "undefined") ? LiupaiManager.canUseSpell(this.state, str(spellRow.spell_type, "")) : (String(spellRow.spell_school) === bm);
      if (!_canUse) { this.queuePopup({ kind: "text", title: spellRow.spell_name, body: `你已择道统「${(typeof SCHOOL_NAME !== "undefined" && SCHOOL_NAME[bm]) || bm}」。\n非本修神通，封顶三阶，此路不通。`, buttons: [{ label: "知道了" }] }); return { ok: false }; }
    }
    const cost = this.getSpellUpgradeCost(spellRow, nextLevel);
    if (!cost) return { ok: false };
    if (num(this.state.resources.spell_page) < num(cost.spell_page_cost) || num(this.state.resources.mana) < num(cost.mana_cost)) return { ok: false, message: "材料不足" };
    this.state.resources.spell_page -= num(cost.spell_page_cost); this.state.resources.mana -= num(cost.mana_cost);
    spellState.level = nextLevel; spellState.unlocked = true;
    if (nextLevel === 1) {
      this._log(`你悟得术法「${spellRow.spell_name}」。`);
      this._equipFirstSpellToSlots(spellRow);
      this.queuePopup({ kind: "text", style: "seal", title: `悟得术法：${spellRow.spell_name}`, body: `${spellRow.lore_text || ""}\n\n此术已列入斗法栏。下一场，用它。`, buttons: [{ label: "谨记于心" }] });
    }
    else { this._log(`「${spellRow.spell_name}」提升至${nextLevel}重。`); }
    this._afterMutated(); return { ok: true };
  },

  _equipFirstSpellToSlots(spellRow) {
    const type = String(spellRow.spell_type || "");
    const map = { thunder: "skill_thunder_01", fire: "skill_fire_01", weapon: "skill_weapon_01", body: "skill_body_01", soul: "skill_soul_01", calamity: "skill_calamity_01" };
    const skillId = map[type];
    if (!skillId) return;
    this.state.unlocked_skills = this.state.unlocked_skills || [];
    if (!this.state.unlocked_skills.includes(skillId)) this.state.unlocked_skills.push(skillId);
    this.state.skill_levels = this.state.skill_levels || {};
    if (!this.state.skill_levels[skillId]) this.state.skill_levels[skillId] = 1;
    const max = (typeof BattleEngineV2 !== "undefined") ? BattleEngineV2.getSlotCount(this.state) : 3;
    const slots = (this.state.battle_slots || []).slice();
    const has = slots.some((s) => String(s && s.id || s) === skillId);
    if (!has) {
      if (slots.length < max) slots.push({ id: skillId, condition: "always" });
      else slots[slots.length - 1] = { id: skillId, condition: "always" };
      this.state.battle_slots = slots;
    }
    this._log("此术已列入斗法栏。");
  },

  // ---------- 练气术法（V2 skill_table，30术法六系） ----------

  getSkillLevel(skillId) { return int(this.state.skill_levels?.[skillId], 0); },

  getSkillUpgradeCost(skillRow, toLevel) {
    // 人族·苦修之躯：术法升级消耗 -15%（练气终稿种族被动）
    const humanDisc = str(this.state.race_id, "") === "human" ? 0.85 : 1;
    if (toLevel <= 1) return { spell_page_cost: 0, mana_cost: 0 }; // 境界到了即悟得，base 1重免费
    const rarityMult = { common: 1, uncommon: 1.3, rare: 1.7 }[str(skillRow.rarity, "common")] || 1;
    return {
      spell_page_cost: Math.round(3 * toLevel * rarityMult * humanDisc),
      mana_cost: Math.round(200 * toLevel * rarityMult * humanDisc),
    };
  },

  getSkillMaxLevel(skillRow) { return int(skillRow.max_level, 5); },

  upgradeSkill(skillId) {
    const skillRow = DataManager.getById("skill_table", skillId);
    if (!Object.keys(skillRow).length) return { ok: false };
    if (!(this.state.unlocked_skills || []).includes(skillId)) { this.queuePopup({ kind: "text", title: skillRow.name, body: "此术尚未到你参悟的境界。", buttons: [{ label: "知道了" }] }); return { ok: false }; }
    const curLevel = Math.max(1, this.getSkillLevel(skillId));
    const nextLevel = curLevel + 1;
    if (nextLevel > this.getSkillMaxLevel(skillRow)) { this.queuePopup({ kind: "text", title: skillRow.name, body: "此术已至圆满，待破境后再求精进。", buttons: [{ label: "知道了" }] }); return { ok: false }; }
    const cost = this.getSkillUpgradeCost(skillRow, nextLevel);
    if (num(this.state.resources.spell_page) < num(cost.spell_page_cost) || num(this.state.resources.mana) < num(cost.mana_cost)) return { ok: false, message: "材料不足" };
    this.state.resources.spell_page -= num(cost.spell_page_cost); this.state.resources.mana -= num(cost.mana_cost);
    if (!this.state.skill_levels || typeof this.state.skill_levels !== "object") this.state.skill_levels = {};
    this.state.skill_levels[skillId] = nextLevel;
    const shown = (typeof SkillIdentity !== "undefined") ? SkillIdentity.displayName(skillRow, this.state) : skillRow.name;
    this._log("「" + shown + "」精进至" + nextLevel + "重。");
    this._afterMutated(); return { ok: true };
  },

  _awakenShentong(silent) {
    if (this.state.flags.shentong_awoken) return;
    if (typeof SkillIdentity === "undefined" || !SkillIdentity.isShentong(this.state)) return;
    this.state.flags.shentong_awoken = true;
    const lines = [];
    for (const id of this.state.unlocked_skills || []) {
      const row = DataManager.getById("skill_table", id);
      if (!row.name) continue;
      const neu = SkillIdentity.displayName(row, this.state);
      if (neu && neu !== row.name) lines.push(`${row.name} → ${neu}`);
    }
    this._log("天仙境开，术法觉醒为神通。");
    if (!silent && lines.length) {
      this.queuePopup({
        kind: "text", style: "seal", title: "术法觉醒·神通",
        body: `榜文垂照，你昔日术法脱去凡胎。\n\n${lines.join("\n")}\n\n此后斗法栏所书，已是神通。先天神通（八九玄功、三头八臂）仍随化身因缘，不在此列。`,
        buttons: [{ label: "领受" }],
      });
    }
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

  // 流派择派（D3/C1：四修器体魂劫；C7 本命与流派合一）——真仙破劫后择一修，不可逆（唯转世可重选）
  chooseLiupai(liupaiId) {
    if (typeof LiupaiManager === "undefined" || LiupaiManager.isChosen(this.state)) return; // 不可逆
    const row = LiupaiManager.getById(liupaiId);
    if (!row) return;
    const lp = LiupaiManager.ensureState(this.state);
    lp.chosen = String(liupaiId);
    lp.chosen_at_realm = str(this.state.realm_id, "");
    // C7 本命与流派合一：本命系恒=流派主系，复用既有本命门控与×1.5加成
    this.state.benming_school = str(row.primary_element, "");
    const sysName = (typeof SCHOOL_NAME !== "undefined" && SCHOOL_NAME[str(row.primary_element, "")]) || row.name;
    this._log(`你择定道统：${row.name}。${row.fantasy || ""}——自此${sysName}之道，与你性命相系。`);
    this.queuePopup({ kind: "text", style: "breakthrough", title: "择派",
      body: `你在四修中，选了「${row.name}」。\n\n${row.fantasy || ""}\n\n自此，${sysName}系神通可精进至五阶，威力更增五成；其余诸道，封顶三阶。\n这条路，走到黑。`,
      buttons: [{ label: "踏入此道" }] });
    this._afterMutated();
  },

  // 真仙破劫（bt_003）后触发本命选择
  _maybeTriggerBenming(btId) {
    if (String(btId) !== "bt_003") return;
    if (this.hasBenming()) return;
    this.queuePopup({ kind: "liupai_choice" });
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
      if (typeof AudioManager !== "undefined") AudioManager.playSfx("secret_found"); // SFX-07 发现秘境提示
      // 探索点接事件（design/6.6）：发现深层秘境触发 tied 事件（seen 去重）
      this._offerEvent(p.trigger_event);
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
    if (BreakthroughManager.canAttempt(state) && !this.isOpeningStage()) {
      const data = BreakthroughManager.getAvailable(state);
      return { type: "breakthrough", label: `榜文垂光，${data.display_name || "破劫"}` };
    }
    if (RealmManager.canLevelUp(state)) {
      return { type: "level_up", label: "道行已满，可升重" };
    }
    if (int(this.pendingOfflineReward.minutes) >= 5) {
      return { type: "claim", label: `出关领取\n闭关 ${formatDuration(int(this.pendingOfflineReward.minutes))}` };
    }
    // 主按钮只走洞府修行（入定/吐纳/师门功课）。游历、巡行、探幽在游历页手动点，绝不占主钮。
    const preferred = this._preferredCultivationAction(state);
    if (preferred) {
      return { type: "action", label: preferred.action_name, actionId: String(preferred.action_id) };
    }
    return { type: "idle", label: "继续闭关" };
  },

  startPreferredCultivation() {
    const row = this._preferredCultivationAction(this.state) || this._getFallbackCultivationAction();
    if (!row) return false;
    this.startAction(String(row.action_id));
    return true;
  },

  _preferredCultivationAction(state) {
    const actions = ActionManager.getActions(state);
    const order = ["short_meditation", "breath_cycle", "chan_task", "jie_task", "tianting_task", "wuzhuang_task"];
    for (const id of order) {
      const row = actions.find((r) => String(r.action_id) === id);
      if (row && this._loopAvailable(row)) return row;
    }
    return actions.find((r) => this._loopAvailable(r)) || null;
  },

  // 挂机放置准则：修炼类动作 = 无地图、offline_equivalent 产出（吐纳/入定/各势力任务）。
  // 游历/探幽（map_equivalent + map_id）属于主动内容，绝不进挂机循环。
  _isCultivationAction(row) {
    return !!row && !row.map_id && String(row.reward_type) === "offline_equivalent" && int(row.duration_sec) > 0;
  },

  // 吐纳/入定是洞府主循环，不限每日次数；师门功课仍走表内日限。
  _loopAvailable(row) {
    if (!row || !this._isCultivationAction(row)) return false;
    const id = String(row.action_id);
    if (id === "breath_cycle" || id === "short_meditation") {
      if (this.state.current_action) return false;
      return UnlockManager.conditionMet(this.state, String(row.unlock_realm || ""));
    }
    return ActionManager.getAvailability(this.state, row).ok;
  },

  // 连续修行链式续作：只续修炼类动作。当前动作是修炼且可用则续它；否则回落首选修炼动作。
  // 绝不续游历/探幽——主页挂机就是修炼（参考所有挂机放置手游设定）。
  _getAutoChainAction(currentRow) {
    if (this._loopAvailable(currentRow)) return currentRow;
    return this._getFallbackCultivationAction();
  },

  // P0-#2：链式续作失败后，回落到可用的修炼类动作（breath_cycle 优先），避免挂机停摆。
  _getFallbackCultivationAction() {
    const fallbackOrder = ["breath_cycle", "short_meditation", "chan_task", "jie_task", "tianting_task", "wuzhuang_task"];
    const actions = ActionManager.getActions(this.state);
    for (const id of fallbackOrder) {
      const row = actions.find((r) => String(r.action_id) === id);
      if (this._loopAvailable(row)) return row;
    }
    return actions.find((r) => this._loopAvailable(r)) || null;
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
    if (boss) list.push({ id: "boss", label: `⚔ ${boss.boss_name}现身，可斗法`, bossId: String(boss.boss_id) });
    return list.slice(0, 2);
  },

  _hasAffordableSpell(state) {
    const unlocked = state.unlocked_skills || [];
    return UnlockManager.getAvailableSkills(state).some((skill) => {
      const id = String(skill.id);
      if (!unlocked.includes(id)) return false;
      const level = Math.max(1, this.getSkillLevel(id));
      const nextLevel = level + 1;
      if (nextLevel > this.getSkillMaxLevel(skill)) return false;
      const cost = this.getSkillUpgradeCost(skill, nextLevel);
      return cost && num(state.resources.spell_page) >= num(cost.spell_page_cost) && num(state.resources.mana) >= num(cost.mana_cost);
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
    const order = [factionTask, "observe_seal", "short_meditation", "breath_cycle"];
    for (const id of order) {
      const match = available.find((row) => String(row.action_id) === id && this._isCultivationAction(row));
      if (match) return match;
    }
    return this._preferredCultivationAction(state);
  },

  // ---------- 轮回转生 ----------

  canReincarnate() { return RealmManager.isCapped(this.state); },

  getRebirthPreview() {
    const realm = RealmManager.getCurrentRealm(this.state);
    // 21.3 §3.3 E3 道痕结算修复：天仙及以上不再一律 1 点——"前世修到混元和修到地仙差不多"是病。
    // 梯度沿既有 1/3/5 斜率（每大境 +2）延续，修得越深道痕越凝，不做爆炸外推。
    const majorGain = { 炼气士: 1, 真人: 3, 地仙: 5, 天仙: 7, 真仙: 9, 金仙: 11, 太乙: 13, 大罗: 15, 准圣: 17, 混元: 19 }[String(realm.major_realm || "")] || 1;
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
    // 21.3 §3.4 S1 历世神位：神位是真灵所证，档案跨世累积（buff 机制仍按世重置，只并档案不动机制）
    rb.god_seats_seen = Array.from(new Set([...(rb.god_seats_seen || []), ...(state.god_seats || [])]));
    // 21.3 §3.3 E3 历世录升级：档案记本世结局与名位（榜上留名缕数），不止"修至何处"。
    const endingRow = str(state.ending_id, "") ? DataManager.getById("unlock_table", "ending_" + str(state.ending_id, "")) : {};
    const endingNote = Object.keys(endingRow).length ? `，终局「${endingRow.unlock_name}」` : "";
    const markNote = int(state.list_marks) > 0 ? `，榜上留名 ${int(state.list_marks)} 缕` : "";
    rb.log.unshift(`第${nums[rb.count - 1] || rb.count}世：${getRaceShortName(state) || "无名"}，修至${getPhaseRealmName(realm)}${endingNote}${markNote}，凝道痕 ${preview.gain}。`);
    if (rb.log.length > 9) rb.log.length = 9;
    const fresh = SaveManager.createDefault();
    fresh.rebirth = rb;
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

  // ---------- 见闻录（21.3 §3.3 E4：众生见证，领信息不领资源） ----------

  // 写入一条见证：witness_table 无对应行 → 静默（结构先行，内容按批填充）；
  // seen 去重（同一条目不二次触发）；反馈走日志+非阻断 toast，不弹窗（守则 4）。
  _witness(witnessId) {
    const row = DataManager.getById("witness_table", String(witnessId));
    if (!Object.keys(row).length) return;
    if (!Array.isArray(this.state.witnessed)) this.state.witnessed = [];
    if (this.state.witnessed.includes(String(witnessId))) return;
    this.state.witnessed.push(String(witnessId));
    this._log(`见闻·${row.lore_anchor}：${row.witness_text}`);
    this.toast(`见闻录·${row.lore_anchor}`, String(row.witness_text || ""), 3200);
  },

  // ---------- 终局三选（21.3 §3.3 E2：受封天庭/肉身成圣/混元逍遥） ----------

  // 结局门：混元圆满（hy_10 cap）且 ending_choice 已解锁且本世未择结局。
  _endingGateOpen() {
    const s = this.state;
    if (str(s.ending_id, "")) return false;
    if (!RealmManager.isCapped(s)) return false;
    return UnlockManager.isUnlocked(s, "ending_choice");
  },

  // 结局条件（any_of 多维可替代，守则 5：任何一条都不是唯一必走路径）。
  _endingConditionMet(cond = {}) {
    const s = this.state;
    const subs = Array.isArray(cond.any_of) ? cond.any_of : [];
    if (!subs.length) return false;
    return subs.some((c) => {
      if (c.list_marks_min != null) return int(s.list_marks) >= int(c.list_marks_min);
      if (c.merit_min != null) return num(s.resources.merit) >= num(c.merit_min);
      if (c.boss_first_kills_min != null) {
        const firstKills = Object.values(s.boss_clears || {}).filter((v) => int(v) > 0).length;
        return firstKills >= int(c.boss_first_kills_min);
      }
      if (c.witnessed_min != null) return (s.witnessed || []).length >= int(c.witnessed_min);
      if (c.rebirth_count_min != null) return int(s.rebirth.count) >= int(c.rebirth_count_min);
      return false;
    });
  },

  // 入队终局抉择弹窗（一世一次/每会话至多一次，弹窗克制）。
  _maybeQueueEndingChoice(force) {
    if (!this._endingGateOpen()) return;
    if (this._endingOfferedThisSession && !force) return;
    this._endingOfferedThisSession = true;
    const rows = DataManager.getRows("unlock_table")
      .filter((r) => r.feature_type === "ending")
      .sort((a, b) => int(a.sort_order) - int(b.sort_order));
    const lines = rows.map((r) => `◆ ${r.unlock_name}（${r.player_type}）\n　${r.choice_desc}\n　达成：${r.cond_desc}`);
    const buttons = rows.map((r) => ({ label: r.unlock_name, action: "ending_choice", endingId: r.unlock_id }));
    buttons.push({ label: "再看看这片天地", action: "ending_defer" });
    this.queuePopup({ kind: "text", style: "breakthrough", title: "终局·三条路",
      body: `混元道果已成。榜文垂光，三条路摆在你面前——这一次，由你自选。\n\n${lines.join("\n\n")}\n\n（择定后世界依旧开放；转世之后，亦可另择他路。）`,
      buttons });
  },

  // 择定结局：条件达成 → ending_id 永久身份 + 授予结局解锁 + 终局文案；未达 → 提示路径（不强制）。
  chooseEnding(unlockId) {
    const s = this.state;
    const row = DataManager.getById("unlock_table", String(unlockId));
    if (!Object.keys(row).length || row.feature_type !== "ending") return { ok: false };
    if (str(s.ending_id, "")) return { ok: false };
    if (!this._endingConditionMet(row.ending_condition)) {
      this.toast("机缘未至", `${row.unlock_name}之路尚未走通——${row.cond_desc}。`, 3200);
      return { ok: false };
    }
    s.ending_id = String(row.ending_key);
    if (!s.unlocked_ids.includes(String(unlockId))) s.unlocked_ids.push(String(unlockId));
    this._log(`终局择定·${row.unlock_name}。自此，你的名位有了归处。`);
    this.queuePopup({ kind: "text", style: "breakthrough", title: `终局·${row.unlock_name}`,
      body: String(row.ending_text || ""), buttons: [{ label: "道果已成" }] });
    this._afterMutated();
    return { ok: true };
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

  debugStartBattle() {
    if (!this.debug) return;
    this.state.flags.battle_v2_tutorial_done = true;
    if (typeof BattleUIV2 !== "undefined" && BattleUIV2.closeLayers) BattleUIV2.closeLayers();
    if (typeof releaseModal === "function") releaseModal();
    this.popupQueue = (this.popupQueue || []).filter((p) => p.kind !== "battle_v2");
    this._debugBattleN = int(this._debugBattleN) + 1;
    const names = ["山魈", "夜枭", "岩蜥", "雾狸"];
    const n = names[(this._debugBattleN - 1) % names.length];
    this.startBattleV2({
      name: "调试·" + n,
      enemy_power: 90,
      source: "debug",
      payload: { debug: true },
    });
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

  _offerEvent(eventId) {
    const id = String(eventId || "");
    if (!id || this.state.pending_event_id) return false;
    if (typeof EventManager === "undefined" || !EventManager.canOffer(this.state, id)) return false;
    this._setPendingEvent(id);
    this._queueEventPopup();
    return true;
  },

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
      const info = FeedbackRenderer.entry("unlock_feature_" + id);
      if (!info || this.state.seen_unlock_popups.includes(id)) continue;
      // 机缘系统的「开启」就是第一段机缘弹窗，不再叠一块功能说明。
      if (id === "event_system") { this.state.seen_unlock_popups.push(id); continue; }
      this.state.seen_unlock_popups.push(id);
      // 山野游历首次解锁时，直接展开封神山河图：地图感是这个节点的主菜，不是附注。
      if (id === "travel" && !this.state.flags.world_map_seen) {
        this.state.flags.world_map_seen = true;
        this.queuePopup({ kind: "world_map" });
        continue;
      }
      this.queuePopup({ kind: "text", style: "seal", title: `新机缘开启：${info.title}`, body: (info.lines || [])[0] || "", buttons: [{ label: "知道了" }] });
    }
  },

  _checkResourceReveals() {
    for (const row of UnlockManager.getVisibleResources(this.state)) {
      const id = String(row.resource_id);
      if (this.state.seen_resources.includes(id)) continue;
      this.state.seen_resources.push(id);
      const text = FeedbackRenderer.line("unlock_resource_" + id);
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
      this.toast(FeedbackRenderer.line("toast_goal_done") || "道途更进一步", `${goal.goal_name}。${goal.complete_text || ""}${rewardText}`);
    }
    this._checkChapterReveals();
    this._checkCompanions();
    this._checkWorldMapReveal();
    this._refreshPendingReward();
    if (typeof SkillIdentity !== "undefined" && SkillIdentity.isShentong(this.state)) this._awakenShentong(true);
    if (typeof ContentDirector !== "undefined") ContentDirector.pulse("action");
    SaveManager.save(this.state);
    this._emit();
  },

  _refreshPendingReward() { this.pendingOfflineReward = RewardManager.calculateOfflineReward(this.state); },
  _applyResourceDelta(delta) {
    // C 线·女娲结缘护持：全收益 +10%（仅正增量，消耗扣减不受影响；上场道友生效）
    const nuwaGain = bondPassiveSum(this.state, "all_gain");
    for (const id of Object.keys(delta)) {
      let v = num(delta[id]);
      if (v > 0 && nuwaGain > 0) v = Math.round(v * (1 + nuwaGain));
      this.state.resources[id] = Math.max(0, num(this.state.resources[id]) + v);
    }
  },

  _applyEventReward(payload) {
    const resources = {};
    mergeResources(resources, payload.resources || {});
    if (payload.random_bonus && Math.random() <= num(payload.random_bonus.chance)) mergeResources(resources, payload.random_bonus.resources || {});
    if (payload.spell_pages_by_type) { let total = 0; for (const k of Object.keys(payload.spell_pages_by_type)) total += num(payload.spell_pages_by_type[k]); resources.spell_page = num(resources.spell_page) + total; }
    if (payload.treasure_shards_by_id) { let total = 0; for (const k of Object.keys(payload.treasure_shards_by_id)) total += num(payload.treasure_shards_by_id[k]); resources.treasure_shard = num(resources.treasure_shard) + total; }
    if (payload.root_progress) resources.daoxing = num(resources.daoxing) + num(payload.root_progress);
    if (payload.breakthrough_bonus) resources.merit = num(resources.merit) + Math.round(num(payload.breakthrough_bonus) * 2000);
    if (payload.breakthrough_pressure_reduce) resources.calamity = num(resources.calamity) - Math.ceil(num(this.state.resources.calamity) * num(payload.breakthrough_pressure_reduce)) - 50;
    // 21.1 §1.5 天庭差事可授丹房存货（如代班司榜得替身符）：白名单只许存货计数键
    if (payload.pills) {
      for (const pid of Object.keys(payload.pills)) {
        if (pid === "due" || pid === "tishen") this.state.pills[pid] = int(this.state.pills[pid]) + int(payload.pills[pid]);
      }
    }
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
