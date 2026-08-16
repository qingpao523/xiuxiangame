"use strict";

const ActionManager = {
  getActions(state) {
    return DataManager.getRows("action_table").filter((row) => {
      if (!UnlockManager.conditionMet(state, String(row.unlock_realm || ""))) return false;
      // R2-B：师门任务仅本势力可见
      if (row.faction_id && String(row.faction_id) !== str(state.faction_id, "")) return false;
      return true;
    });
  },

  getAvailability(state, row) {
    const id = String(row.action_id);
    if (!UnlockManager.conditionMet(state, String(row.unlock_realm || ""))) {
      return { ok: false, reason: "尚未开启" };
    }
    if (row.faction_id && String(row.faction_id) !== str(state.faction_id, "")) {
      return { ok: false, reason: "非本门之法" };
    }
    if (state.current_action) return { ok: false, reason: "行动进行中" };
    if (row.only_major_realm) {
      const major = String(RealmManager.getCurrentRealm(state).major_realm || "");
      if (major !== row.only_major_realm) return { ok: false, reason: `仅${row.only_major_realm}阶段可用` };
    }
    if (int(row.lifetime_limit, -1) > 0 && int(state.action_counts_total[id]) >= int(row.lifetime_limit)) {
      return { ok: false, reason: "机缘已尽" };
    }
    if (int(row.daily_limit, -1) > 0 && int(state.action_counts_today[id]) >= int(row.daily_limit)) {
      return { ok: false, reason: "今日次数已尽" };
    }
    if (row.force_event && !EventManager.canOffer(state, String(row.force_event))) {
      return { ok: false, reason: "今日榜文已观" };
    }
    if (row.force_event && state.pending_event_id) {
      return { ok: false, reason: "有机缘未决" };
    }
    return { ok: true, reason: "" };
  },

  remainingToday(state, row) {
    const daily = int(row.daily_limit, -1);
    if (daily <= 0) return -1;
    return Math.max(0, daily - int(state.action_counts_today[String(row.action_id)]));
  },
};
