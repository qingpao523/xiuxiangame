"use strict";

const UnlockManager = {
  refresh(state) {
    this._resetDailyIfNeeded(state);
    const unlocked = state.unlocked_ids;
    for (const row of DataManager.getRows("unlock_table")) {
      const id = String(row.unlock_id || "");
      if (this.conditionMet(state, String(row.unlock_realm || "")) && !unlocked.includes(id)) {
        unlocked.push(id);
      }
    }
    const realm = DataManager.getRealm(state.realm_id);
    for (const id of realm.unlock_ids || []) {
      if (!unlocked.includes(String(id))) unlocked.push(String(id));
    }
    this._ensureDefaultMap(state);
  },

  add(state, ids) {
    for (const id of ids || []) {
      if (!state.unlocked_ids.includes(String(id))) state.unlocked_ids.push(String(id));
    }
  },

  isUnlocked(state, id) {
    return state.unlocked_ids.includes(id);
  },

  conditionMet(state, condition) {
    if (!condition || condition === "open" || condition === "开局") return true;
    if (REALM_NAME_TO_ID[condition]) condition = REALM_NAME_TO_ID[condition];
    if (condition === "open") return true;
    if (condition in DataManager.realmOrder) {
      return DataManager.isRealmAtLeast(state.realm_id, condition);
    }
    if (condition.startsWith("race_")) {
      return str(state.race_id, "") === condition.slice(5);
    }
    if (condition.startsWith("day_")) {
      return this.currentDay(state) >= parseInt(condition.slice(4), 10);
    }
    if (state.unlocked_ids.includes(condition)) return true;
    if (state.current_map_id === condition) return true;
    return false;
  },

  getAvailableMaps(state) {
    return DataManager.getRows("map_table")
      .filter((row) => this.conditionMet(state, String(row.unlock_realm || "")))
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  },

  getAvailableSpells(state) {
    return DataManager.getRows("spell_table").filter((row) =>
      this.conditionMet(state, String(row.unlock_realm || ""))
    );
  },

  getAvailableTreasures(state) {
    return DataManager.getRows("treasure_table").filter((row) =>
      this.conditionMet(state, String(row.unlock_realm || ""))
    );
  },

  getVisibleResources(state) {
    return DataManager.getRows("resource_table").filter((row) =>
      this.conditionMet(state, String(row.unlock_condition || "开局"))
    );
  },

  currentDay(state) {
    const elapsed = Math.max(0, nowUnix() - int(state.created_at, nowUnix()));
    return Math.floor(elapsed / 86400) + 1;
  },

  _ensureDefaultMap(state) {
    if (state.current_map_id) return;
    const maps = this.getAvailableMaps(state);
    if (maps.length) state.current_map_id = String(maps[0].map_id || "");
  },

  _resetDailyIfNeeded(state) {
    const today = todayString();
    if (state.last_daily_reset_day === today) return;
    state.last_daily_reset_day = today;
    state.event_counts_today = {};
    state.action_counts_today = {};
    state.boss_counts_today = {};
    state.array_counts_today = {};
  },
};
