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
    this._refreshSkills(state);
    this._ensureDefaultMap(state);
  },

  _refreshSkills(state) {
    if (!Array.isArray(state.unlocked_skills)) state.unlocked_skills = [];
    if (!state.skill_levels || typeof state.skill_levels !== "object") state.skill_levels = {};
    for (const row of this.getAvailableSkills(state)) {
      const id = String(row.id || "");
      if (id && !state.unlocked_skills.includes(id)) state.unlocked_skills.push(id);
    }
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

  // F3（design/15.0 v0.2）：境界主锁（unlock_realm）+ 前置节点弱锁（prev_map 链）。
  // 部洲开放门隐含于链中：跨部洲地图（东胜神洲/须弥昆仑中枢）的 prev_map 均在南赡部洲，
  // 须先打通南赡部洲伐纣链方可进入，无需额外硬门。
  getAvailableMaps(state) {
    const rows = DataManager.getRows("map_table");
    const byId = {};
    for (const r of rows) byId[String(r.map_id)] = r;
    const cache = {};
    const available = (row) => {
      const id = String(row.map_id);
      if (id in cache) return cache[id];
      cache[id] = false; // 防环守卫
      let ok = this.conditionMet(state, String(row.unlock_realm || "")); // 境界主锁
      if (ok && row.prev_map) {
        const prev = byId[String(row.prev_map)];
        ok = prev ? available(prev) : true; // 前置节点弱锁
      }
      cache[id] = ok;
      return ok;
    };
    return rows.filter((row) => available(row))
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  },

  getAvailableSpells(state) {
    return DataManager.getRows("spell_table").filter((row) =>
      this.conditionMet(state, String(row.unlock_realm || ""))
    );
  },

  getAvailableSkills(state) {
    return DataManager.getRows("skill_table").filter((row) =>
      this.conditionMet(state, String(row.unlock_realm || ""))
    );
  },

  getAvailableTreasures(state) {
    const fid = str(state.faction_id, "");
    return DataManager.getRows("treasure_table").filter((row) => {
      if (!this.conditionMet(state, String(row.unlock_realm || ""))) return false;
      // 势力限定法宝：非本势力不可见（design/7.2 v0.2）
      if (row.faction_lock && str(row.faction_lock, "") !== fid) return false;
      // 合成法宝（craft_only）：仅合成后（已拥有）才在列表中显示
      if (row.craft_only && int((state.treasures[String(row.treasure_id)] || {}).level) <= 0) return false;
      return true;
    });
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
