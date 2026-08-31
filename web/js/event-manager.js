"use strict";

const EventManager = {
  RARITY_ORDER: ["common", "rare", "epic", "fate"],
  RARITY_CN: { common: "普通", rare: "精良", epic: "稀有", fate: "天命" },
  ROOT_PITY_EVENT: "event_006",
  TREASURE_PITY_EVENT: "event_201",

  rollEvent(state, source = "manual") {
    if (!this._sourceUnlocked(state, source)) return "";
    if (this._todayCount(state) >= this._dailyCap(state)) return "";
    this._ensurePity(state);
    const forced = this._pityForce(state, source);
    if (forced && forced.eventId && this.canOffer(state, forced.eventId)) {
      this._notePityRoll(state, this.getEvent(forced.eventId));
      return forced.eventId;
    }
    const candidates = this._getCandidates(state, source).filter((row) => this._lotteryWeight(row) > 0);
    if (!candidates.length) return "";
    let rarity = forced && forced.rarity ? forced.rarity : this._rollRarity(candidates);
    let pool = candidates.filter((row) => this._rarity(row) === rarity);
    if (!pool.length) {
      const idx = this.RARITY_ORDER.indexOf(rarity);
      for (let i = idx - 1; i >= 0; i--) {
        pool = candidates.filter((row) => this._rarity(row) === this.RARITY_ORDER[i]);
        if (pool.length) { rarity = this.RARITY_ORDER[i]; break; }
      }
    }
    if (!pool.length) pool = candidates;
    const picked = this._weightedPick(pool);
    if (picked) this._notePityRoll(state, this.getEvent(picked));
    return picked;
  },

  _weightedPick(rows) {
    let total = 0;
    for (const row of rows) total += this._lotteryWeight(row);
    if (total <= 0) return String(rows[0].event_id || "");
    let pick = Math.random() * total;
    for (const row of rows) {
      pick -= this._lotteryWeight(row);
      if (pick <= 0) return String(row.event_id || "");
    }
    return String(rows[0].event_id || "");
  },

  _lotteryWeight(row) {
    if (row.weight == null || row.weight === "") return 0;
    const w = num(row.weight, 0);
    if (w <= 0) return 0;
    if (w <= 1) return Math.max(1, Math.round(w * 1000));
    return w;
  },

  _rarity(row) {
    const r = String(row.rarity || "common");
    return this.RARITY_ORDER.includes(r) ? r : "common";
  },

  rarityLabel(row) {
    return this.RARITY_CN[this._rarity(row)] || "普通";
  },

  _rollRarity(candidates) {
    const cfg = (DataManager.tables.event_table || {}).rarity_config || {};
    const present = {};
    for (const row of candidates) present[this._rarity(row)] = true;
    const parts = [];
    let total = 0;
    for (const id of this.RARITY_ORDER) {
      if (!present[id]) continue;
      const p = num((cfg[id] || {}).base_rate, id === "common" ? 0.7 : 0);
      if (p <= 0) continue;
      parts.push({ id, p });
      total += p;
    }
    if (!parts.length) return "common";
    let pick = Math.random() * total;
    for (const x of parts) {
      pick -= x.p;
      if (pick <= 0) return x.id;
    }
    return parts[parts.length - 1].id;
  },

  _pityForce(state, source) {
    const rule = (DataManager.tables.event_table || {}).pity_rule || {};
    const pity = state.event_pity || {};
    const day = UnlockManager.currentDay(state);
    const range = rule.first_root_event_day_range || [3, 5];
    if (day >= int(range[0], 3) && day <= int(range[1], 5) && !(state.seen_events || []).includes(this.ROOT_PITY_EVENT) && this.canOffer(state, this.ROOT_PITY_EVENT)) {
      return { eventId: this.ROOT_PITY_EVENT };
    }
    // 21.1 §1.5 榜上留名保底（对齐 ROOT_PITY 写法）：留名达机缘门槛后，每添一缕新名重新武装一次保底——
    // 下一次闭关/游历必出天庭差事（unlock_condition 带 list_marks_min: 的行即差事池，数据自描述，不硬编码 id）。
    // armed 旗记在 flags.errand_pity_marks（上次保底兑现时的缕数）；日次数封顶时 rollEvent 提前返回、旗不消耗，次日补上。
    if ((source === "offline" || source === "travel") && int(state.list_marks) > int(state.flags && state.flags.errand_pity_marks)) {
      for (const row of DataManager.getRows("event_table")) {
        const cond = String(row.unlock_condition || "");
        if (!cond.startsWith("list_marks_min:")) continue;
        if (int(state.list_marks) < parseInt(cond.slice(15), 10)) continue;
        if (!(row.trigger_source || []).includes(source)) continue;
        if (!this.canOffer(state, String(row.event_id))) continue;
        if (state.flags) state.flags.errand_pity_marks = int(state.list_marks);
        return { eventId: String(row.event_id) };
      }
    }
    if (int(pity.days_without_rare) >= Math.max(1, int(rule.rare_pity_days, 3) - 1) && this._todayCount(state) === 0) {
      return { rarity: "epic" };
    }
    if (rule.first_daily_claim_guaranteed && source === "offline" && this._todayCount(state) === 0) {
      return { rarity: Math.random() < 0.74 ? "common" : "rare" };
    }
    return null;
  },

  _ensurePity(state) {
    if (!state.event_pity || typeof state.event_pity !== "object") {
      state.event_pity = { days_without_rare: 0, got_rare_today: false };
    }
  },

  _notePityRoll(state, row) {
    this._ensurePity(state);
    const rar = this._rarity(row);
    if (rar === "epic" || rar === "fate") state.event_pity.got_rare_today = true;
  },

  onDailyReset(state) {
    this._ensurePity(state);
    if (state.event_pity.got_rare_today) state.event_pity.days_without_rare = 0;
    else state.event_pity.days_without_rare = int(state.event_pity.days_without_rare) + 1;
    state.event_pity.got_rare_today = false;
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
    this._notePityRoll(state, this.getEvent(eventId));
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
