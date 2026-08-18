"use strict";

const SAVE_KEY = "fengshen_web_save_v2";

const SaveManager = {
  loadOrCreate() {
    try {
      const text = localStorage.getItem(SAVE_KEY);
      if (text) {
        const state = JSON.parse(text);
        if (state && typeof state === "object") return this.normalize(state);
      }
    } catch (e) {
      console.error("存档读取失败", e);
    }
    return this.normalize(this.createDefault());
  },

  createDefault() {
    const now = nowUnix();
    const resources = {};
    for (const id of DataManager.getResourceIds()) resources[id] = 0;
    return {
      version: 2,
      created_at: now,
      last_claim_time: now,
      last_daily_reset_day: todayString(),
      realm_id: "rq_01",
      race_id: "",
      faction_id: "",
      current_map_id: "",
      resources,
      unlocked_ids: [],
      spells: {},
      treasures: {},
      first_treasure_id: "",
      breakthrough_fail_counts: {},
      event_counts_today: {},
      seen_events: [],
      pending_event_id: "",
      pending_event_prelude: false,
      claimed_bosses: [],
      boss_clears: {},
      boss_counts_today: {},
      action_counts_total: {},
      action_counts_today: {},
        map_explores: {},
        benming_school: null,
      current_action: null,
      current_goal_id: "goal_001",
      completed_goals: [],
      seen_resources: ["daoxing", "mana"],
      seen_unlock_popups: [],
      flags: { battle_manual: true },
      logs: [],
      rebirth: { count: 0, daohen: 0, races_seen: [], log: [] },
      pills: {},
      god_seats: [],
      array_counts_today: {},
      array_wins: {},
      companions: {},
      card_upgrades: {},
      battle_blessing: null,
    };
  },

  normalize(state) {
    const now = nowUnix();
    state.version = 2;
    state.created_at = int(state.created_at, now);
    state.last_claim_time = int(state.last_claim_time, now);
    state.last_daily_reset_day = str(state.last_daily_reset_day, todayString());
    state.realm_id = str(state.realm_id, "rq_01");
    state.current_map_id = str(state.current_map_id, "");
    state.unlocked_ids = state.unlocked_ids || [];
    state.spells = state.spells || {};
    state.treasures = state.treasures || {};
    state.first_treasure_id = str(state.first_treasure_id, "");
    state.breakthrough_fail_counts = state.breakthrough_fail_counts || {};
    state.event_counts_today = state.event_counts_today || {};
    state.seen_events = state.seen_events || [];
    state.pending_event_id = str(state.pending_event_id, "");
    state.pending_event_prelude = !!state.pending_event_prelude;
    state.claimed_bosses = state.claimed_bosses || [];
    state.boss_clears = state.boss_clears || {};
    state.boss_counts_today = state.boss_counts_today || {};
    state.action_counts_total = state.action_counts_total || {};
    state.map_explores = state.map_explores || {};
    if (!("benming_school" in state)) state.benming_school = null;
    state.action_counts_today = state.action_counts_today || {};
    state.current_action = state.current_action || null;
    state.current_goal_id = str(state.current_goal_id, "goal_001");
    state.completed_goals = state.completed_goals || [];
    state.seen_resources = state.seen_resources || ["daoxing", "mana"];
    state.seen_unlock_popups = state.seen_unlock_popups || [];
    state.flags = state.flags || {};
    // 默认手动排序出招：战斗是前 30 分钟的核心交互，不能开场就全自动。
    if (state.flags.battle_manual == null) state.flags.battle_manual = true;
    state.logs = state.logs || [];
    state.race_id = str(state.race_id, "");
    state.faction_id = str(state.faction_id, "");
    // 战后休整：单卡永久淬炼等级 / 调息祝福（下 N 场斗法开局护持）
    state.card_upgrades = state.card_upgrades || {};
    state.battle_blessing = state.battle_blessing || null;
    // 丹房：渡厄丹存货 / 培元丹药效截止时间
    state.pills = state.pills || {};
    state.pills.due = int(state.pills.due);
    state.pills.peiyuan_until = int(state.pills.peiyuan_until);
    // 真灵上榜：已得神位
    state.god_seats = state.god_seats || [];
    // 轮回转生：历世记录（账号级，不随转世重置）
    state.rebirth = state.rebirth || {};
    state.rebirth.count = int(state.rebirth.count);
    state.rebirth.daohen = int(state.rebirth.daohen);
    state.rebirth.races_seen = state.rebirth.races_seen || [];
    state.rebirth.log = state.rebirth.log || [];
    // 杀劫大阵：今日闯阵次数 / 各阵累计破阵次数
    state.array_counts_today = state.array_counts_today || {};
    state.array_wins = state.array_wins || {};
    // 封神人物因缘
    state.companions = state.companions || {};
    // 旧档兼容：无种族的老存档默认人族
    if (state.race_id === "" && nowUnix() - int(state.created_at, now) > 120) {
      state.race_id = "human";
      if (!state.flags.race_legacy_logged) {
        state.flags.race_legacy_logged = true;
        state.logs.unshift(
          `[${new Date().toTimeString().slice(0, 5)}] 轮回续缘：前世跟脚已泯，此世以人族先天道体再踏修行路。`
        );
        if (state.logs.length > 30) state.logs.length = 30;
      }
    }
    const resources = state.resources || {};
    for (const id of DataManager.getResourceIds()) {
      if (!(id in resources)) resources[id] = 0;
    }
    state.resources = resources;
    return state;
  },

  save(state) {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  },

  wipe() {
    localStorage.removeItem(SAVE_KEY);
  },
};
