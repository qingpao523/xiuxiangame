"use strict";

const GoalManager = {
  getCurrent(state) {
    if (!state.current_goal_id) return {};
    return DataManager.getById("chapter_goal_table", state.current_goal_id);
  },

  isMet(state, goal) {
    const c = goal.complete_condition || {};
    const res = state.resources;
    switch (c.type) {
      case "action_complete":
        return int(state.action_counts_total[String(c.action_id)]) >= int(c.count, 1);
      case "realm_reached":
        return DataManager.isRealmAtLeast(state.realm_id, String(c.realm_id));
      case "resource_reached":
        return num(res[String(c.resource_id)]) >= num(c.amount, 1);
      case "spell_unlocked_any":
        return Object.values(state.spells).filter((s) => int(s.level) > 0).length >= int(c.count, 1);
      case "treasure_equipped_any":
        return Object.values(state.treasures).filter((t) => int(t.level) > 0).length >= int(c.count, 1);
      case "treasure_level_reached":
        return Object.values(state.treasures).some((t) => int(t.level) >= int(c.level, 2));
      case "event_completed":
        return state.seen_events.includes(String(c.event_id));
      case "boss_cleared":
        return int(state.boss_clears[String(c.boss_id)]) > 0;
      case "merit_or_calamity_any":
        return num(res.merit) > 0 || num(res.calamity) > 0;
      case "cap_notice_seen":
        return !!state.flags.cap_notice_seen;
      default:
        return false;
    }
  },

  // 返回本次完成的目标行数组（可能连锁完成多个）
  check(state) {
    const completed = [];
    let guard = 0;
    while (state.current_goal_id && guard++ < 30) {
      const goal = this.getCurrent(state);
      if (!Object.keys(goal).length) break;
      if (!this.isMet(state, goal)) break;
      state.completed_goals.push(String(goal.goal_id));
      completed.push(goal);
      state.current_goal_id = String(goal.next_goal_id || "");
    }
    return completed;
  },
};
