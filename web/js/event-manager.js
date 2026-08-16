"use strict";

const EventManager = {
  rollEvent(state, source = "manual") {
    if (!UnlockManager.isUnlocked(state, "event_system") && source !== "offline") return "";
    const candidates = this._getCandidates(state, source);
    if (!candidates.length) return "";
    let total = 0;
    for (const row of candidates) total += num(row.weight, 1);
    let pick = Math.random() * total;
    for (const row of candidates) {
      pick -= num(row.weight, 1);
      if (pick <= 0) return String(row.event_id || "");
    }
    return String(candidates[0].event_id || "");
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
    if (!UnlockManager.conditionMet(state, String(row.unlock_condition || ""))) return false;
    return int(state.event_counts_today[eventId]) < int(row.daily_limit, 99);
  },

  _getCandidates(state, source) {
    return DataManager.getRows("event_table").filter((row) => {
      const id = String(row.event_id || "");
      if (!UnlockManager.conditionMet(state, String(row.unlock_condition || ""))) return false;
      if (source !== "manual" && !(row.trigger_source || []).includes(source)) return false;
      if (int(state.event_counts_today[id]) >= int(row.daily_limit, 99)) return false;
      return true;
    });
  },
};
