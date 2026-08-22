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
        liupai: { chosen: null, chosen_at_realm: null, branch: null, prestige: [] },
        tower: { cycle_index: 0, tickets: 3, current_floor: 0, best_floor_this_cycle: 0, in_run: false },
        tower_best_floor_ever: 0,
        tower_total_kills: 0,
        tower_floor_clears: {},
        devour_stacks: 0,
        faction_buff: null,
        faction_edict_day: "",
        faction_feast_until: 0,
        faction_feast_cooldown: 0,
          array_cards: {},
          array_equipped: [],
          edict_count: 0,
          edict_last_claim: "",
          edict_target: null,
      current_action: null,
      current_goal_id: "goal_001",
      completed_goals: [],
      explored_points: [],
      seen_resources: ["daoxing", "mana"],
      seen_unlock_popups: [],
      flags: {},
      logs: [],
      rebirth: { count: 0, daohen: 0, races_seen: [], log: [] },
      pills: {},
      god_seats: [],
      array_counts_today: {},
      array_wins: {},
      companions: {},
        lineup: [],
        talismans: [],
        divination: {},
      card_upgrades: {},
      battle_blessing: null,
      // ===== 斗法栏连锁制 =====
      battle_slots: [],
      unlocked_skills: [],
      skill_levels: {},
      // ===== 音频设置（AudioManager，音效需求.md §4）=====
      audio: { master: 0.8, sfx: 0.85, ambient: 0.45, music: 0.6, muted: false },
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
    if (typeof LiupaiManager !== "undefined") LiupaiManager.ensureState(state); else if (!("liupai" in state)) state.liupai = { chosen: null, chosen_at_realm: null, branch: null, prestige: [] };
    if (!("tower" in state) || typeof state.tower !== "object" || state.tower === null) state.tower = {};
    if (!("cycle_index" in state.tower)) state.tower.cycle_index = 0;
    if (!("tickets" in state.tower)) state.tower.tickets = 3;
    if (!("current_floor" in state.tower)) state.tower.current_floor = 0;
    if (!("best_floor_this_cycle" in state.tower)) state.tower.best_floor_this_cycle = 0;
    if (!("in_run" in state.tower)) state.tower.in_run = false;
    if (!("tower_best_floor_ever" in state)) state.tower_best_floor_ever = 0;
    if (!("tower_total_kills" in state)) state.tower_total_kills = 0;
    if (!("tower_floor_clears" in state)) state.tower_floor_clears = {};
    state.devour_stacks = int(state.devour_stacks);
    if (!("faction_buff" in state)) state.faction_buff = null;
    state.faction_edict_day = str(state.faction_edict_day, "");
    state.faction_feast_until = int(state.faction_feast_until);
    state.faction_feast_cooldown = int(state.faction_feast_cooldown);
    // ===== 4 势力完整系统（design/7.2 v0.2）存档迁移 =====
    state.array_cards = state.array_cards || {};
    state.array_equipped = Array.isArray(state.array_equipped) ? state.array_equipped : [];
    state.edict_count = int(state.edict_count);
    state.edict_last_claim = str(state.edict_last_claim, "");
    if (!("edict_target" in state)) state.edict_target = null;
    state.action_counts_today = state.action_counts_today || {};
    state.current_action = state.current_action || null;
    state.current_goal_id = str(state.current_goal_id, "goal_001");
    state.completed_goals = state.completed_goals || [];
    state.explored_points = state.explored_points || [];
    state.seen_resources = state.seen_resources || ["daoxing", "mana"];
    state.seen_unlock_popups = state.seen_unlock_popups || [];
    state.flags = state.flags || {};
    state.logs = state.logs || [];
    state.race_id = str(state.race_id, "");
    state.faction_id = str(state.faction_id, "");
    // 战后休整：单卡永久淬炼等级 / 调息祝福（下 N 场斗法开局护持）
    state.card_upgrades = state.card_upgrades || {};
    state.battle_blessing = state.battle_blessing || null;
    // ===== 战斗系统V2：斗法栏连锁制 存档迁移 =====
    state.battle_slots = state.battle_slots || [];
    // 条件触发系统：斗法栏条目归一为 {id, condition}（兼容旧字符串数组）
    state.battle_slots = state.battle_slots.map((e) => (e && typeof e === "object") ? { id: String(e.id), condition: String(e.condition || "always") } : { id: String(e), condition: "always" });
    state.unlocked_skills = state.unlocked_skills || [];
    state.skill_levels = state.skill_levels || {};
    // ===== 音频设置迁移（AudioManager）=====
    state.audio = state.audio || {};
    if (state.audio.master == null) state.audio.master = 0.8;
    if (state.audio.sfx == null) state.audio.sfx = 0.85;
    if (state.audio.ambient == null) state.audio.ambient = 0.45;
    if (state.audio.music == null) state.audio.music = 0.6;
    if (state.audio.muted == null) state.audio.muted = false;
    if (!state.flags.battle_v2_migrated) {
      state.flags.battle_v2_migrated = true;
      const starter = ["skill_body_01", "skill_body_02", "skill_body_03"];
      for (const id of starter) {
        if (!state.unlocked_skills.includes(id)) state.unlocked_skills.push(id);
        if (!state.skill_levels[id]) state.skill_levels[id] = 1;
      }
      const spellToSkill = {
        spell_thunder_01: "skill_thunder_01", spell_thunder_02: "skill_thunder_02", spell_thunder_03: "skill_thunder_03",
        spell_fire_01: "skill_fire_01", spell_fire_02: "skill_fire_02", spell_fire_03: "skill_fire_03",
        spell_weapon_01: "skill_weapon_01", spell_weapon_02: "skill_weapon_02", spell_weapon_03: "skill_weapon_03",
        spell_soul_01: "skill_soul_01", spell_soul_02: "skill_soul_02",
        spell_calamity_01: "skill_calamity_01", spell_calamity_02: "skill_calamity_02",
      };
      for (const sid of Object.keys(state.spells || {})) {
        if (int(state.spells[sid]?.level) > 0 && spellToSkill[sid]) {
          const vid = spellToSkill[sid];
          if (!state.unlocked_skills.includes(vid)) state.unlocked_skills.push(vid);
          state.skill_levels[vid] = Math.max(int(state.skill_levels[vid], 1), int(state.spells[sid].level));
        }
      }
      if (state.battle_slots.length === 0) state.battle_slots = starter.map((id) => ({ id, condition: "always" }));
    }
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
    // P1 生活技艺：符咒存货（[{type,lv}]）/ 占卜记录
    if (!Array.isArray(state.talismans)) state.talismans = [];
    state.divination = state.divination || {};
    // P1 阵容：上场道友（最多 3）。仅旧档迁移（无此字段）时自动补齐前 3 位已结缘道友；
    // 已有阵容则尊重玩家选择（含主动撤下），只过滤失效项与超上限。
    const hadLineup = Array.isArray(state.lineup);
    if (!hadLineup) state.lineup = [];
    state.lineup = state.lineup.filter((id) => state.companions[id] && state.companions[id].bonded).slice(0, 3);
    if (!hadLineup && state.lineup.length < 3) {
      const bonded = Object.keys(state.companions).filter((id) => state.companions[id].bonded);
      for (const id of bonded) { if (state.lineup.length >= 3) break; if (!state.lineup.includes(id)) state.lineup.push(id); }
    }
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
