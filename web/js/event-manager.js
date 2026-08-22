"use strict";

const EventManager = {
  rollEvent(state, source = "manual") {
    if (!this._sourceUnlocked(state, source)) return "";
    if (this._todayCount(state) >= this._dailyCap(state)) return "";
    const candidates = this._getCandidates(state, source).filter((row) => this._lotteryWeight(row) > 0);
    if (!candidates.length) return "";
    let total = 0;
    for (const row of candidates) total += this._lotteryWeight(row);
    if (total <= 0) return "";
    let pick = Math.random() * total;
    for (const row of candidates) {
      pick -= this._lotteryWeight(row);
      if (pick <= 0) return String(row.event_id || "");
    }
    return String(candidates[0].event_id || "");
  },

  // 表内 weight：缺省/0 = 脚本机缘（探索点、入局、首通），不进抽签；
  // 0~1 = 出现率（新机缘）；>1 = 旧彩票权重。两套标尺混抽会永远抽到旧的。
  _lotteryWeight(row) {
    if (row.weight == null || row.weight === "") return 0;
    const w = num(row.weight, 0);
    if (w <= 0) return 0;
    if (w <= 1) return Math.max(1, Math.round(w * 1000));
    return w;
  },

  _sourceUnlocked(state, source) {
    if (UnlockManager.isUnlocked(state, "event_system")) return true;
    return source === "offline" || source === "travel";
  },

  _dailyCap(state) {
    const rule = (DataManager.tables.event_table || {}).daily_limit_rule || {};
    const day = UnlockManager.currentDay(state);
    if (day <= 1) return int(rule.day_1, 3);
    if (day === 2) return int(rule.day_2, 4);
    return int(rule.day_3_plus, 5);
  },

  _todayCount(state) {
    const counts = state.event_counts_today || {};
    let n = 0;
    for (const k of Object.keys(counts)) n += int(counts[k]);
    return n;
  },

  // 无 weight 的脚本机缘：升重/登录每次只吐一条，避免一次弹一串。
  nextScripted(state, sources) {
    const want = Array.isArray(sources) ? sources : [sources];
    for (const row of DataManager.getRows("event_table")) {
      if (this._lotteryWeight(row) > 0) continue;
      const src = row.trigger_source || [];
      if (!src.some((s) => want.includes(s))) continue;
      if (!this._eligible(state, row, "")) continue;
      return String(row.event_id || "");
    }
    return "";
  },

  markSeen(state, eventId) {
    state.event_counts_today[eventId] = int(state.event_counts_today[eventId]) + 1;
    if (!state.seen_events.includes(eventId)) state.seen_events.push(eventId);
  },

  getEvent(eventId) {
    return DataManager.getById("event_table", eventId);
  },

  canOffer(state, eventId) {
    const row = this.getEvent(eventId);
    if (!Object.keys(row).length) return false;
    return this._eligible(state, row, "");
  },

  _eligible(state, row, source) {
    const id = String(row.event_id || "");
    if (!id) return false;
    if (!UnlockManager.conditionMet(state, String(row.unlock_condition || ""))) return false;
    if (source && source !== "manual" && !(row.trigger_source || []).includes(source)) return false;
    const daily = int(row.daily_limit, 1);
    if (daily > 0 && int(state.event_counts_today[id]) >= daily) return false;
    const life = int(row.lifetime_limit, 0);
    if (life > 0 && (state.seen_events || []).includes(id)) return false;
    return true;
  },

  _getCandidates(state, source) {
    return DataManager.getRows("event_table").filter((row) => this._eligible(state, row, source));
  },
};
