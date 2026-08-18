"use strict";

// P2 网状叙事：章节名（由 stage 派生）
const CHAPTER_NAMES = {
  "前30分钟": "卷一·山野炼气",
  "第1天": "卷二·陈塘风雷",
  "第2天": "卷三·榜外散修",
};

const GoalManager = {
  getCurrent(state) {
    if (!state.current_goal_id) return {};
    return DataManager.getById("chapter_goal_table", state.current_goal_id);
  },

  // P2 网状叙事：当前卷的因果线（done/open/fog），进程门槛仍由 next_goal_id 静默推进
  getChapterThreads(state) {
    const current = this.getCurrent(state);
    if (!Object.keys(current).length) return { chapter: null, chapterName: "", list: [] };
    const stage = String(current.stage || "");
    const chapterName = CHAPTER_NAMES[stage] || stage;
    const goals = DataManager.getRows("chapter_goal_table").filter((g) => String(g.stage || "") === stage);
    const completed = state.completed_goals || [];
    const list = goals.map((goal) => {
      const gid = String(goal.goal_id);
      let status, hint;
      if (completed.includes(gid)) {
        status = "done";
        hint = goal.complete_text || "";
      } else if (DataManager.isRealmAtLeast(state.realm_id, String(goal.gate_realm || "rq_01"))) {
        status = "open";
        hint = goal.reward_preview || goal.display_text || "";
      } else {
        status = "fog";
        hint = this._fogHint(goal);
      }
      return { goal, status, hint };
    });
    return { chapter: stage, chapterName, list };
  },

  // 雾中因果线的悬念提示（不剧透具体目标）
  _fogHint(goal) {
    const type = String((goal.complete_condition || {}).type || "");
    if (type === "realm_reached") return "雾中：道行深处，此线自现。";
    if (type === "boss_cleared") return "雾中：似有一场恶战在前。";
    if (type === "event_completed") return "雾中：天机未至，静候其变。";
    if (type === "treasure_equipped_any" || type === "treasure_level_reached") return "雾中：法宝因缘，尚在后方。";
    if (type === "action_complete") return "雾中：此行未启，且待时机。";
    return "雾中：机缘未至。";
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
