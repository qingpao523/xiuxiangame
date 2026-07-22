/* 封神修道录 · 网页版 v2 逻辑核心
 * 依据 design/1.8 沉浸交互全链路设计：
 * 在线短回合修行(ActionManager)、目标链(GoalManager)、Boss挑战(BossManager)、
 * 主按钮状态机、天象/称号、法宝择主、破劫确认流、地仙封顶、修行日志、弹窗队列。
 */

"use strict";

// ---------------- DataManager ----------------

const ID_FIELDS = {
  realm_table: "realm_id",
  resource_table: "resource_id",
  map_table: "map_id",
  spell_table: "spell_id",
  treasure_table: "treasure_id",
  event_table: "event_id",
  breakthrough_table: "breakthrough_id",
  boss_table: "boss_id",
  unlock_table: "unlock_id",
  action_table: "action_id",
  chapter_goal_table: "goal_id",
  encounter_table: "encounter_id",
};

// resource_table.unlock_condition 使用中文境界名
const REALM_NAME_TO_ID = {
  开局: "open",
  炼气士四重: "rq_04",
  炼气士七重: "rq_07",
  真人一重: "zr_01",
  真人五重: "zr_05",
  地仙一重: "dx_01",
};

const DataManager = {
  tables: {},
  rowsById: {},
  realmOrder: {},
  sortedRealmIds: [],

  async loadAll() {
    const index = await (await fetch("data/data_index.json")).json();
    const payloads = await Promise.all(
      index.tables.map((file) => fetch(`data/${file}`).then((r) => r.json()))
    );
    for (const payload of payloads) {
      const name = payload.table;
      this.tables[name] = payload;
      const idField = ID_FIELDS[name];
      if (!idField) continue;
      const byId = {};
      for (const row of payload.rows || []) {
        if (row && row[idField] != null) byId[String(row[idField])] = row;
      }
      this.rowsById[name] = byId;
    }
    const realms = [...(this.tables.realm_table?.rows || [])].sort(
      (a, b) => (a.sort_order || 0) - (b.sort_order || 0)
    );
    realms.forEach((row, i) => {
      const id = String(row.realm_id);
      this.sortedRealmIds.push(id);
      this.realmOrder[id] = i;
    });
  },

  getRows(name) {
    return this.tables[name]?.rows || [];
  },

  getConfig(name) {
    return this.tables[name]?.config || {};
  },

  getById(name, id) {
    return this.rowsById[name]?.[String(id)] || {};
  },

  getRealm(id) {
    return this.getById("realm_table", id);
  },

  getNextRealmId(id) {
    const i = this.sortedRealmIds.indexOf(id);
    return i >= 0 && i + 1 < this.sortedRealmIds.length ? this.sortedRealmIds[i + 1] : "";
  },

  isRealmAtLeast(currentId, requiredId) {
    if (!requiredId || requiredId === "open" || requiredId === "开局") return true;
    if (!(currentId in this.realmOrder) || !(requiredId in this.realmOrder)) return false;
    return this.realmOrder[currentId] >= this.realmOrder[requiredId];
  },

  getResourceIds() {
    return this.getRows("resource_table").map((r) => String(r.resource_id));
  },
};

// ---------------- SaveManager ----------------

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
      current_action: null,
      current_goal_id: "goal_001",
      completed_goals: [],
      seen_resources: ["daoxing", "mana"],
      seen_unlock_popups: [],
      flags: {},
      logs: [],
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
    state.action_counts_today = state.action_counts_today || {};
    state.current_action = state.current_action || null;
    state.current_goal_id = str(state.current_goal_id, "goal_001");
    state.completed_goals = state.completed_goals || [];
    state.seen_resources = state.seen_resources || ["daoxing", "mana"];
    state.seen_unlock_popups = state.seen_unlock_popups || [];
    state.flags = state.flags || {};
    state.logs = state.logs || [];
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

// ---------------- UnlockManager ----------------

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
  },
};

// ---------------- RewardManager ----------------

const RewardManager = {
  calculateOfflineReward(state) {
    const now = nowUnix();
    const elapsed = now - int(state.last_claim_time, now);
    if (elapsed < 0) {
      return { minutes: 0, resources: {}, event_id: "", warning: "本机时间回退，本次不产生闭关收益。" };
    }
    const minutes = Math.floor(elapsed / 60);
    const effective = this._clampOfflineMinutes(state, minutes);
    if (effective <= 0) return { minutes: 0, resources: {}, event_id: "", warning: "" };

    const reward = this.calculateRewardForMinutes(state, effective, { includeMap: true });
    const config = DataManager.getConfig("offline_config");
    const interval = int(config.event_check_interval_minutes, 30);
    if (!state.pending_event_id && effective >= interval) {
      reward.event_id = EventManager.rollEvent(state, "offline");
    } else {
      reward.event_id = "";
    }
    reward.warning = "";
    return reward;
  },

  calculateRewardForMinutes(state, minutes, opts = {}) {
    const includeMap = opts.includeMap !== false;
    const omen = getTodayOmen();
    const realm = DataManager.getRealm(state.realm_id);
    const map = includeMap ? DataManager.getById("map_table", opts.mapId || state.current_map_id) : {};
    let daoxingPerMin = num(realm.base_daoxing_per_min);
    let manaPerMin = num(realm.base_mana_per_min);
    if (Object.keys(map).length) {
      daoxingPerMin += num(map.daoxing_per_min);
      manaPerMin += num(map.mana_per_min);
    }
    let mult = this._effectiveMultiplier(state);
    mult *= includeMap ? num(omen.journeyMult, 1) : num(omen.gainMult, 1);
    const resources = {
      daoxing: Math.max(1, Math.floor(daoxingPerMin * minutes * mult)),
      mana: Math.floor(manaPerMin * minutes * mult * num(omen.manaMult, 1)),
    };
    if (Object.keys(map).length) {
      mergeResources(resources, this._rollMapDrops(state, map, minutes));
    }
    return { minutes, resources, event_id: "" };
  },

  _clampOfflineMinutes(state, minutes) {
    const config = DataManager.getConfig("offline_config");
    if (minutes < int(config.min_offline_minutes, 1)) return 0;
    const realm = DataManager.getRealm(state.realm_id);
    const major = String(realm.major_realm || "炼气士");
    const limits = config.default_limit_minutes_by_major_realm || {};
    let limit = int(limits[major], 240);
    const hoursSinceCreated = (nowUnix() - int(state.created_at, nowUnix())) / 3600;
    if (hoursSinceCreated <= num(config.new_player_bonus_duration_hours, 24)) {
      limit = Math.max(limit, int(config.new_player_bonus_limit_minutes, limit));
    }
    limit = Math.min(limit, int(config.time_cheat?.max_single_claim_minutes, limit));
    return Math.min(minutes, limit);
  },

  _effectiveMultiplier(state) {
    const config = DataManager.getConfig("offline_config");
    const merit = num(state.resources.merit);
    const calamity = num(state.resources.calamity);
    const meritBonus = Math.min(
      Math.floor(merit / 100) * num(config.merit_bonus_per_100),
      num(config.merit_bonus_cap)
    );
    const calamityPenalty = Math.min(
      Math.floor(calamity / 100) * num(config.calamity_penalty_per_100),
      num(config.calamity_penalty_cap)
    );
    const calamityBonus = Math.min(
      Math.floor(calamity / 100) * num(config.calamity_reward_bonus_per_100),
      num(config.calamity_reward_bonus_cap)
    );
    return Math.max(0.1, 1 + meritBonus + calamityBonus - calamityPenalty);
  },

  _rollMapDrops(state, map, minutes) {
    const config = DataManager.getConfig("offline_config");
    const interval = int(map.drop_roll_interval_minutes, int(config.drop_roll_interval_minutes_default, 10));
    if (interval <= 0) return {};
    const rolls = Math.min(80, Math.max(1, Math.floor(minutes / interval)));
    const result = {};
    for (let i = 0; i < rolls; i++) {
      for (const drop of map.drop_table || []) {
        if (!UnlockManager.conditionMet(state, String(drop.unlock_condition || "open"))) continue;
        if (Math.random() <= num(drop.chance) * num(getTodayOmen().dropMult, 1)) {
          const id = String(drop.resource_id || "");
          const amount = randInt(int(drop.min, 1), int(drop.max, 1));
          result[id] = num(result[id]) + amount;
        }
      }
    }
    return result;
  },
};

// ---------------- RealmManager ----------------

// 境界段落：1-3重 前期 / 4-6重 中期 / 7-9重 后期 / 10重 圆满。
// 炼气士阶段按段落放缓道行需求（目标：第一天到真人劫）。
const PHASE_TIERS = [
  { maxMinor: 3, label: "前期", qiMult: 1 },
  { maxMinor: 6, label: "中期", qiMult: 2 },
  { maxMinor: 9, label: "后期", qiMult: 2.5 },
  { maxMinor: 99, label: "圆满", qiMult: 3 },
];

function getPhase(realm) {
  const minor = int(realm.minor_level, 1);
  for (const tier of PHASE_TIERS) {
    if (minor <= tier.maxMinor) return tier;
  }
  return PHASE_TIERS[0];
}

function getPhaseRealmName(realm) {
  const major = String(realm.major_realm || "");
  const minor = int(realm.minor_level, 1);
  return `${major}${getPhase(realm).label}·${minor}重`;
}

const RealmManager = {
  getCurrentRealm(state) {
    return DataManager.getRealm(state.realm_id || "rq_01");
  },

  getNextRealm(state) {
    const nextId = DataManager.getNextRealmId(state.realm_id || "rq_01");
    return nextId ? DataManager.getRealm(nextId) : {};
  },

  getRequiredDaoxing(realm) {
    const base = num(realm.required_daoxing_to_next, 1);
    if (String(realm.major_realm || "") !== "炼气士") return base;
    return Math.round(base * getPhase(realm).qiMult);
  },

  getProgress(state) {
    const realm = this.getCurrentRealm(state);
    const current = num(state.resources.daoxing);
    const required = this.getRequiredDaoxing(realm);
    return { current, required, ratio: clamp(current / Math.max(1, required), 0, 1) };
  },

  isCapped(state) {
    return !Object.keys(this.getNextRealm(state)).length;
  },

  canLevelUp(state) {
    const realm = this.getCurrentRealm(state);
    if (!Object.keys(realm).length) return false;
    if (realm.breakthrough_id_to_next != null) return false;
    if (this.isCapped(state)) return false;
    return num(state.resources.daoxing) >= this.getRequiredDaoxing(realm);
  },

  levelUp(state) {
    if (!this.canLevelUp(state)) {
      return { ok: false, message: "道行尚浅，还需继续闭关。" };
    }
    const current = this.getCurrentRealm(state);
    const next = this.getNextRealm(state);
    const cost = this.getRequiredDaoxing(current);
    state.resources.daoxing = Math.max(0, num(state.resources.daoxing) - cost);
    state.realm_id = String(next.realm_id || state.realm_id);
    return { ok: true, from: current, to: next };
  },

  getCombatPower(state) {
    const realm = this.getCurrentRealm(state);
    let power = num(realm.combat_power_base);
    for (const id of Object.keys(state.spells)) power += 60 * int(state.spells[id]?.level);
    for (const id of Object.keys(state.treasures)) power += 240 * int(state.treasures[id]?.level);
    return Math.round(power);
  },
};

// ---------------- BreakthroughManager ----------------

const BreakthroughManager = {
  getAvailable(state) {
    const realm = DataManager.getRealm(state.realm_id || "rq_01");
    const id = realm.breakthrough_id_to_next;
    if (!id) return {};
    return DataManager.getById("breakthrough_table", String(id));
  },

  getRateBreakdown(state, data) {
    data = data || this.getAvailable(state);
    if (!Object.keys(data).length) return null;
    const failCount = int(state.breakthrough_fail_counts[String(data.breakthrough_id || "")]);
    const merit = num(state.resources.merit);
    const calamity = num(state.resources.calamity);
    const meritBonus = Math.min(Math.floor(merit / 100) * 0.005, num(data.merit_bonus_cap, 0.2));
    const calamityPenalty = Math.min(Math.floor(calamity / 100) * 0.003, num(data.calamity_penalty_cap, 0.15));
    const failBonus = failCount * num(data.fail_bonus);
    const base = num(data.base_success_rate);
    const rate = clamp(base + meritBonus + failBonus - calamityPenalty, num(data.min_success_rate), num(data.max_success_rate, 1));
    return { base, meritBonus, calamityPenalty, failBonus, rate };
  },

  getSuccessRate(state, data) {
    const b = this.getRateBreakdown(state, data);
    return b ? b.rate : 0;
  },

  canAttempt(state) {
    const data = this.getAvailable(state);
    if (!Object.keys(data).length) return false;
    return num(state.resources.daoxing) >= num(data.required_daoxing);
  },

  try(state) {
    const data = this.getAvailable(state);
    if (!Object.keys(data).length) return { ok: false, message: "当前境界暂无破劫。" };
    const required = num(data.required_daoxing);
    if (num(state.resources.daoxing) < required) {
      return { ok: false, message: "破劫道行不足，还需闭关积累。" };
    }
    const id = String(data.breakthrough_id || "");
    const failCount = int(state.breakthrough_fail_counts[id]);
    const guarantee = int(data.guarantee_after_fail, 99);
    const rate = this.getSuccessRate(state, data);
    const success = failCount >= guarantee || Math.random() <= rate;

    if (success) {
      state.resources.daoxing = Math.max(0, num(state.resources.daoxing) - required);
      state.realm_id = String(data.to_realm || state.realm_id);
      state.breakthrough_fail_counts[id] = 0;
      UnlockManager.add(state, data.success_rewards?.unlock_ids || []);
      return { ok: true, success: true, rate, data };
    }

    state.breakthrough_fail_counts[id] = failCount + 1;
    const manaPercent = num(data.fail_rewards?.mana_percent);
    if (manaPercent > 0) {
      state.resources.mana = num(state.resources.mana) + Math.max(100, num(state.resources.mana) * manaPercent);
    }
    return { ok: true, success: false, rate, data };
  },
};

// ---------------- EventManager ----------------

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

// ---------------- ActionManager（在线短回合修行） ----------------

const ActionManager = {
  getActions(state) {
    return DataManager.getRows("action_table").filter((row) =>
      UnlockManager.conditionMet(state, String(row.unlock_realm || ""))
    );
  },

  getAvailability(state, row) {
    const id = String(row.action_id);
    if (!UnlockManager.conditionMet(state, String(row.unlock_realm || ""))) {
      return { ok: false, reason: "尚未开启" };
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

// ---------------- GoalManager（目标链） ----------------

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

// ---------------- BossManager ----------------

const BOSS_DAILY_LIMIT = 3;

const BossManager = {
  getBosses(state) {
    return DataManager.getRows("boss_table").filter((row) =>
      UnlockManager.conditionMet(state, String(row.unlock_condition || ""))
    );
  },

  getWinRate(state, boss) {
    const power = RealmManager.getCombatPower(state);
    const recommended = Math.max(1, num(boss.recommended_power, 1));
    if (power >= recommended) return 1;
    return clamp(Math.pow(power / recommended, 1.5), 0.05, 1);
  },

  canChallenge(state, bossId) {
    return int(state.boss_counts_today[bossId]) < BOSS_DAILY_LIMIT;
  },
};

// ---------------- 天象 / 称号 ----------------

function getWeather(state) {
  const realm = RealmManager.getCurrentRealm(state);
  const major = String(realm.major_realm || "炼气士");
  if (major === "地仙") return "榜文照身，未曾留名";
  if (major === "真人") {
    if (DataManager.isRealmAtLeast(state.realm_id, "zr_08")) return "榜文垂光，真灵受牵";
    if (num(state.resources.merit) > 0 || num(state.resources.calamity) > 0) return "功德与劫气并现";
    return "陈塘风雷，远潮渐起";
  }
  if (DataManager.isRealmAtLeast(state.realm_id, "rq_06")) return "榜文碎光，初照山野";
  return "山野清寂，大劫未近";
}

function getTitle(state) {
  const major = String(RealmManager.getCurrentRealm(state).major_realm || "炼气士");
  if (major === "地仙" || UnlockManager.isUnlocked(state, "title_榜外散修")) return "榜外散修";
  if (major === "真人") return "初成真人";
  return "无名散修";
}

// ---------------- 每日山中异象 ----------------

const OMENS = [
  {
    omen_id: "qingming",
    name: "清明灵日",
    desc: "天朗气清，吐纳入定收益 +20%",
    gainMult: 1.2,
  },
  {
    omen_id: "leiyu",
    name: "雷雨压山",
    desc: "雷云滚滚，斗法中雷法伤害 +25%，游历道行 +10%",
    battleSpellType: "thunder",
    battleSpellBonus: 0.25,
    journeyMult: 1.1,
  },
  {
    omen_id: "shanwu",
    name: "山雾弥漫",
    desc: "雾锁山径，游历掉落几率 +25%，遭遇判定 +10%",
    dropMult: 1.25,
    checkBonus: 0.1,
  },
  {
    omen_id: "xueyue",
    name: "血月当空",
    desc: "妖气大盛——遭遇之敌更强三成，战利 +50%",
    enemyMult: 1.3,
    lootMult: 1.5,
  },
  {
    omen_id: "lingchao",
    name: "灵潮涌动",
    desc: "地脉灵潮上涌，法力产出 +30%，灵光更频",
    manaMult: 1.3,
    sparkleFast: true,
  },
];

function hashString(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (h * 31 + text.charCodeAt(i)) >>> 0;
  }
  return h;
}

function getTodayOmen() {
  return OMENS[hashString(todayString()) % OMENS.length];
}

// ---------------- 斗法引擎（回合制） ----------------

const BattleEngine = {
  create(state, cfg) {
    const omen = getTodayOmen();
    const playerPower = RealmManager.getCombatPower(state);
    const enemyPower = Math.round(num(cfg.enemy_power) * num(omen.enemyMult, 1));
    return {
      name: String(cfg.name || "妖物"),
      source: cfg.source,
      payload: cfg.payload || {},
      playerPower,
      enemyPower,
      playerHp: playerPower,
      playerHpMax: playerPower,
      enemyHp: enemyPower,
      enemyHpMax: enemyPower,
      round: 0,
      maxRounds: 5,
      boostsUsed: 0,
      boostPending: 0,
      done: false,
      win: false,
    };
  },

  // 玩家已修的术法中是否有异象加成的类型
  _omenBattleBonus(state) {
    const omen = getTodayOmen();
    if (!omen.battleSpellType) return 0;
    for (const row of DataManager.getRows("spell_table")) {
      if (String(row.spell_type) !== omen.battleSpellType) continue;
      if (int(state.spells[String(row.spell_id)]?.level) > 0) return num(omen.battleSpellBonus);
    }
    return 0;
  },

  // 执行一个回合，返回本回合双方动作记录
  playRound(state, battle) {
    if (battle.done) return [];
    battle.round += 1;
    const events = [];
    const bonus = this._omenBattleBonus(state);
    let mult = 1 + bonus;
    if (battle.boostPending > 0) {
      mult *= 1 + 0.4 * battle.boostPending;
      events.push({ actor: "player", type: "boost", text: `你催动法力，术法威能大涨！` });
      battle.boostPending = 0;
    }
    const playerDmg = Math.max(1, Math.round(battle.playerPower * (0.28 + Math.random() * 0.12) * mult));
    battle.enemyHp = Math.max(0, battle.enemyHp - playerDmg);
    events.push({ actor: "player", type: "hit", dmg: playerDmg, text: `你施术击中${battle.name}，造成 ${formatInt(playerDmg)} 伤害。` });
    if (battle.enemyHp <= 0) {
      battle.done = true;
      battle.win = true;
      events.push({ actor: "system", type: "end", text: `${battle.name}溃散！` });
      return events;
    }
    const enemyDmg = Math.max(1, Math.round(battle.enemyPower * (0.2 + Math.random() * 0.1)));
    battle.playerHp = Math.max(0, battle.playerHp - enemyDmg);
    events.push({ actor: "enemy", type: "hit", dmg: enemyDmg, text: `${battle.name}反扑，你气血震荡 ${formatInt(enemyDmg)}。` });
    if (battle.playerHp <= 0 || battle.round >= battle.maxRounds) {
      battle.done = true;
      battle.win = false;
      events.push({ actor: "system", type: "end", text: battle.playerHp <= 0 ? "你护住灵台，且战且退。" : "妖气未衰，你见好便收，退出战圈。" });
    }
    return events;
  },

  boostCost(state) {
    const realm = RealmManager.getCurrentRealm(state);
    return Math.max(100, Math.round(num(realm.base_mana_per_min) * 5));
  },

  boost(state, battle) {
    if (battle.done || battle.boostsUsed >= 3) return false;
    const cost = this.boostCost(state);
    if (num(state.resources.mana) < cost) return false;
    state.resources.mana -= cost;
    battle.boostsUsed += 1;
    battle.boostPending += 1;
    return true;
  },
};

// ---------------- 解锁/资源出现说明文案（design/1.8 §6.2 §24.4） ----------------

const RESOURCE_UNLOCK_TEXT = {
  spell_page: "术法残页出现！\n\n残破符纸与前人心得，可用于提升你的护道术法。\n真仙之前，你所修仍为术法，还未成神通。",
  artifact_shard: "法器碎片出现！\n\n大劫外溢，山野旧器残片被震落。\n收集足够残片后，你将有机会获得第一件本命法宝。",
  treasure_shard: "法宝碎片出现！\n\n你已成真人，普通法器难以承载你的气机。\n此后所得残片，可用于强化本命法宝。",
  merit: "功德出现！\n\n这不是普通善恶值。\n封神大劫中，功德可以护住真灵，降低榜文牵引。\n破劫时，功德会提高成功率。",
  calamity: "劫气出现！\n\n劫气是封神大劫外溢的杀伐之力。\n炼化劫气可以让你更快变强，但也更容易被封神榜感应。",
  refine_material: "祭炼材料出现！\n\n你已成地仙，可借地脉阴火与白骨残玉继续温养法宝。\n当前版本只开放祭炼入口，完整祭炼将在后续版本开启。",
};

const FEATURE_UNLOCK_TEXT = {
  travel: {
    name: "山野游历",
    body: "封神大劫虽未真正降临，但山中已有黑雾游走。\n部分妖物受劫气驱使，开始伤人。\n\n你现在可以离开洞府，在山野边缘拾取机缘。",
  },
  spell_system: {
    name: "术法",
    body: "真仙之前，你所修仍是术法，不是神通。\n术法虽浅，却足以护你穿过封神大劫最边缘的余波。",
  },
  event_system: {
    name: "机缘",
    body: "天边榜文碎光初现，天地灵机开始动荡。\n从此闭关、游历、破劫时，都可能遇到机缘。",
  },
  treasure_system: {
    name: "本命法宝",
    body: "你已成真人，气机足以承载本命法宝。\n法宝不是普通装备，而是护道根基。",
  },
  merit_calamity: {
    name: "功德 / 劫气",
    body: "功德可以护住真灵，降低榜文牵引。\n劫气可以让你更快变强，但更容易被封神榜感应。",
  },
  boss_001: {
    name: "山野妖首",
    body: "山中黑雾凝聚，一头妖首受劫气驱使，盘踞荒庙。\n若能将其击败，你将获得更多道行与法器碎片。",
  },
  boss_002: {
    name: "巡海妖将",
    body: "东海怨潮中浮现巡海妖将残影，受封神劫气驱使而来。\n前往陈塘关外围，可试与之一战。",
  },
};

const FIRST_TREASURE_CHOICES = ["treasure_001", "treasure_002", "treasure_003"];

const CAP_NOTICE_TEXT =
  "你已破开地仙劫，暂时挣脱榜文牵引。\n再往前，便是天仙之路。\n\n天仙篇将开启：\n· 真正进入封神大劫\n· 术法进阶为神通\n· 法宝祭炼深化\n· 封神榜残影挑战\n· 骷髅山深处与陈塘因果\n\n当前版本暂时开放至地仙一重。\n你仍可继续游历骷髅山边界，收集祭炼材料与法宝碎片。";

// ---------------- Game 聚合入口 ----------------

const Game = {
  state: {},
  pendingOfflineReward: {},
  popupQueue: [],
  onChange: null,
  debug: false,

  init() {
    this.debug = new URLSearchParams(location.search).get("debug") === "1";
    const fresh = !localStorage.getItem(SAVE_KEY);
    this.state = SaveManager.loadOrCreate();
    UnlockManager.refresh(this.state);
    this._refreshPendingReward();
    if (fresh) {
      this._log("你于山野洞府中睁开眼，开始修行。");
      this.queuePopup({
        kind: "text",
        style: "seal",
        title: "封神修道录",
        body: "商周兵火尚远，封神榜未显。\n你只是山野洞府中一名无名炼气士。\n若想在将来的大劫中活下去，先从吐纳一轮周天开始。",
        buttons: [{ label: "开始修行" }],
      });
    } else if (int(this.pendingOfflineReward.minutes) >= 5) {
      this.queuePopup({
        kind: "text",
        style: "seal",
        title: "出关",
        body: `你已闭关 ${formatDuration(int(this.pendingOfflineReward.minutes))}。\n山中灵气渐渐汇入周身，可以出关收束道行了。`,
        buttons: [{ label: "出关领取", action: "claim_offline" }, { label: "继续闭关" }],
      });
    }
    SaveManager.save(this.state);
    this._emit();
  },

  queuePopup(popup) {
    this.popupQueue.push(popup);
    this._emit();
  },

  // 每 tick 调用：动作完成检测 + 遭遇触发 + 收益刷新
  tick() {
    let changed = false;
    const action = this.state.current_action;
    if (action && action.encounters) {
      for (const enc of action.encounters) {
        if (!enc.fired && nowMs() >= num(enc.at)) {
          enc.fired = true;
          this.queuePopup({ kind: "encounter", encounterId: enc.id });
          changed = true;
        }
      }
    }
    if (action && nowMs() >= num(action.end_time_ms)) {
      this._finishAction();
      changed = true;
    }
    this._refreshPendingReward();
    if (changed) this._afterMutated();
    this._emit();
  },

  // ---------- 在线动作 ----------

  startAction(actionId) {
    const row = DataManager.getById("action_table", actionId);
    if (!Object.keys(row).length) return;
    const avail = ActionManager.getAvailability(this.state, row);
    if (!avail.ok) {
      this.queuePopup({ kind: "text", title: row.action_name, body: avail.reason + "。", buttons: [{ label: "知道了" }] });
      return;
    }
    const duration = int(row.duration_sec);
    if (duration <= 0) {
      this.state.current_action = { action_id: actionId, end_time_ms: nowMs() };
      this._finishAction();
      this._afterMutated();
      return;
    }
    this.state.current_action = {
      action_id: actionId,
      start_time_ms: nowMs(),
      end_time_ms: nowMs() + duration * 1000,
    };
    this._setupActionExtras(row, this.state.current_action);
    this._log(String(row.start_text || `你开始${row.action_name}。`));
    SaveManager.save(this.state);
    this._emit();
  },

  // 游历遭遇与吐纳节拍窗口
  _setupActionExtras(row, action) {
    const duration = int(row.duration_sec);
    if (row.map_id) {
      const pool = DataManager.getRows("encounter_table").filter((e) => String(e.map_id) === String(row.map_id));
      const picked = [];
      const copy = [...pool];
      while (copy.length && picked.length < 2) {
        picked.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
      }
      action.encounters = picked.map((e, i) => ({
        id: String(e.encounter_id),
        at: num(action.start_time_ms) + (i === 0 ? 8000 : 20000),
        fired: false,
      }));
    }
    if (String(row.action_id) === "breath_cycle" && duration >= 9) {
      action.beat_windows = [3000, 6000, 9000].map((off) => ({ off, hit: false }));
      action.beats = 0;
    }
  },

  _finishAction() {
    const current = this.state.current_action;
    this.state.current_action = null;
    if (!current) return;
    const row = DataManager.getById("action_table", String(current.action_id));
    if (!Object.keys(row).length) return;
    const id = String(row.action_id);
    this.state.action_counts_total[id] = int(this.state.action_counts_total[id]) + 1;
    this.state.action_counts_today[id] = int(this.state.action_counts_today[id]) + 1;

    let rewardText = "";
    let blessText = "";
    const minutes = int(row.reward_minutes_equivalent);
    if (minutes > 0) {
      const reward = RewardManager.calculateRewardForMinutes(this.state, minutes, {
        includeMap: row.reward_type === "map_equivalent",
        mapId: row.map_id || undefined,
      });
      // 灵光加持 + 完美吐纳：本轮拾取/节拍提升结算收益
      const caught = int(current.caught);
      const beats = int(current.beats);
      if (caught > 0 || beats > 0) {
        const bless = Math.min(0.75, caught * 0.15 + beats * 0.15);
        for (const rid of Object.keys(reward.resources)) {
          reward.resources[rid] = Math.round(num(reward.resources[rid]) * (1 + bless));
        }
        const parts = [];
        if (caught > 0) parts.push(`拾得 ${caught} 缕灵光`);
        if (beats > 0) parts.push(`完美吐纳 ${beats} 次`);
        blessText = `\n气机加持：${parts.join("，")}，收益 +${Math.round(bless * 100)}%`;
      }
      this._applyResourceDelta(reward.resources);
      rewardText = this._formatResourceDelta(reward.resources);
    }

    // 机缘：强制或概率
    let eventTriggered = false;
    if (!this.state.pending_event_id) {
      if (row.force_event && EventManager.canOffer(this.state, String(row.force_event))) {
        this._setPendingEvent(String(row.force_event));
        eventTriggered = true;
      } else if (num(row.event_chance) > 0 && Math.random() <= num(row.event_chance)) {
        const source = row.reward_type === "map_equivalent" ? "travel" : "offline";
        const eventId = EventManager.rollEvent(this.state, source);
        if (eventId) {
          this._setPendingEvent(eventId);
          eventTriggered = true;
        }
      }
    }

    this._log(String(row.complete_text || `${row.action_name}结束。`));

    // 连续修行：静默续做同一动作（有机缘则停下）
    const autoOn = !!this.state.flags.auto_repeat && int(row.duration_sec) > 0;
    let chained = false;
    if (autoOn && !eventTriggered) {
      const avail = ActionManager.getAvailability(this.state, row);
      if (avail.ok) {
        this.state.current_action = {
          action_id: id,
          start_time_ms: nowMs(),
          end_time_ms: nowMs() + int(row.duration_sec) * 1000,
        };
        chained = true;
      } else {
        this._log(`连续修行停歇：${avail.reason}。`);
      }
    }

    if (!chained) {
      this.queuePopup({
        kind: "text",
        style: "seal",
        title: `${row.action_name}完成！`,
        body: `${row.complete_text || ""}${rewardText ? `\n\n获得：\n${rewardText}` : ""}${blessText}${
          RealmManager.canLevelUp(this.state) ? "\n\n道行已满，可提升境界。" : ""
        }`,
        buttons: [{ label: "收功" }],
      });
    }
    if (eventTriggered) this._queueEventPopup();
  },

  toggleAutoRepeat() {
    this.state.flags.auto_repeat = !this.state.flags.auto_repeat;
    this._log(this.state.flags.auto_repeat ? "你决意连续修行，不问昼夜。" : "你放缓节奏，随缘修行。");
    SaveManager.save(this.state);
    this._emit();
  },

  // 修行灵光：动作进行中可点击拾取。
  // type: daoxing(金)/mana(蓝)/tianji(紫)；combo 连拾层数提高收益；
  // 每拾一颗还会为本轮修行结算叠加「灵光加持」（+15%/颗，上限+60%）。
  collectSparkle(type = "daoxing", combo = 1) {
    if (!this.state.current_action) return null;
    const realm = RealmManager.getCurrentRealm(this.state);
    const comboMult = Math.min(2, 1 + 0.25 * (Math.max(1, combo) - 1));
    const gain = {};
    if (type === "mana") {
      gain.mana = Math.max(20, Math.round(num(realm.base_mana_per_min) * 4 * comboMult));
    } else if (type === "tianji") {
      if (this.state.seen_resources.includes("spell_page")) {
        gain.spell_page = combo >= 3 ? 2 : 1;
      } else {
        gain.daoxing = Math.max(2, Math.round(num(realm.base_daoxing_per_min) * 6 * comboMult));
      }
    } else {
      gain.daoxing = Math.max(1, Math.round(num(realm.base_daoxing_per_min) * 3 * comboMult));
    }
    this._applyResourceDelta(gain);
    this.state.current_action.caught = int(this.state.current_action.caught) + 1;
    SaveManager.save(this.state);
    this._emit();
    return gain;
  },

  // 首次出现灵光时的一次性引导
  sparkleGuide() {
    if (this.state.flags.sparkle_guide_seen) return false;
    this.state.flags.sparkle_guide_seen = true;
    this._log("修行之际，天地灵机第一次凝成灵光。");
    this.queuePopup({
      kind: "text",
      style: "seal",
      title: "灵光初现",
      body: "修行入定之际，天地灵机偶尔会在你身周凝成一点金色灵光。\n\n看到灵光浮现时，伸手点它，即可额外拾得一缕道行与法力。\n\n灵光稍纵即逝，不点则散。第一缕灵光会等你来取。",
      buttons: [{ label: "伸手一试" }],
    });
    SaveManager.save(this.state);
    this._emit();
    return true;
  },

  // 吐纳节拍：在金光窗口内点击主按钮记一次完美吐纳
  registerBeat() {
    const action = this.state.current_action;
    if (!action || !action.beat_windows) return false;
    const elapsed = nowMs() - num(action.start_time_ms);
    for (const w of action.beat_windows) {
      if (!w.hit && Math.abs(elapsed - num(w.off)) <= 800) {
        w.hit = true;
        action.beats = int(action.beats) + 1;
        SaveManager.save(this.state);
        this._emit();
        return true;
      }
    }
    return false;
  },

  isInBeatWindow() {
    const action = this.state.current_action;
    if (!action || !action.beat_windows) return false;
    const elapsed = nowMs() - num(action.start_time_ms);
    return action.beat_windows.some((w) => !w.hit && Math.abs(elapsed - num(w.off)) <= 800);
  },

  // ---------- 游历遭遇 ----------

  resolveEncounter(encounterId, optionIndex) {
    const enc = DataManager.getById("encounter_table", encounterId);
    if (!Object.keys(enc).length) return;
    const option = (enc.options || [])[optionIndex];
    if (!option) return;
    if (option.kind === "battle") {
      const map = DataManager.getById("map_table", String(enc.map_id));
      const enemyPower = Math.max(50, Math.round(num(map.recommended_power, 300) * num(option.enemy_power_ratio, 0.25)));
      this.startBattle({
        name: String(option.enemy_name || enc.name),
        enemy_power: enemyPower,
        source: "encounter",
        payload: { encounterId, optionIndex },
      });
      return;
    }
    if (option.kind === "safe") {
      this._applyEncounterOutcome(enc, option.success, true);
      return;
    }
    // check：基础几率 + 术法加成 + 异象加成
    let chance = num(option.chance, 0.6) + num(getTodayOmen().checkBonus, 0);
    if (option.bonus_spell_type) {
      for (const row of DataManager.getRows("spell_table")) {
        if (String(row.spell_type) !== String(option.bonus_spell_type)) continue;
        chance += int(this.state.spells[String(row.spell_id)]?.level) * num(option.bonus_per_level, 0.05);
      }
    }
    const ok = Math.random() <= clamp(chance, 0.05, 0.95);
    this._applyEncounterOutcome(enc, ok ? option.success : option.fail, ok);
  },

  _applyEncounterOutcome(enc, outcome, ok) {
    outcome = outcome || {};
    const resources = { ...(outcome.resources || {}) };
    if (outcome.chance_extra && Math.random() <= num(outcome.chance_extra.chance)) {
      mergeResources(resources, outcome.chance_extra.resources || {});
    }
    if (Object.keys(resources).length) this._applyResourceDelta(resources);
    const deltaText = this._formatResourceDelta(resources);
    this._log(`遭遇「${enc.name}」：${ok ? "有惊无险" : "小挫而退"}。`);
    this.queuePopup({
      kind: "text",
      style: ok ? "goal" : "chance",
      title: `遭遇·${enc.name}`,
      body: `${outcome.text || ""}${deltaText ? `\n\n${ok ? "获得" : "损失"}：\n${deltaText}` : ""}`,
      buttons: [{ label: "继续赶路" }],
    });
    this._afterMutated();
  },

  // ---------- 斗法 ----------

  startBattle(cfg) {
    const battle = BattleEngine.create(this.state, cfg);
    this.queuePopup({ kind: "battle", battle });
    this._emit();
    return battle;
  },

  startBossBattle(bossId) {
    const boss = DataManager.getById("boss_table", bossId);
    if (!Object.keys(boss).length) return;
    if (!BossManager.canChallenge(this.state, bossId)) {
      this.queuePopup({ kind: "text", title: "挑战", body: "此地妖气未聚，明日再来。", buttons: [{ label: "知道了" }] });
      return;
    }
    this.state.boss_counts_today[bossId] = int(this.state.boss_counts_today[bossId]) + 1;
    this._log(`你踏入${boss.boss_name}的巢穴，妖气扑面而来。`);
    this.startBattle({
      name: String(boss.boss_name),
      enemy_power: num(boss.recommended_power),
      source: "boss",
      payload: { bossId },
    });
    this._afterMutated();
  },

  battleRound(battle) {
    const events = BattleEngine.playRound(this.state, battle);
    this._emit();
    return events;
  },

  battleBoost(battle) {
    const ok = BattleEngine.boost(this.state, battle);
    if (ok) SaveManager.save(this.state);
    this._emit();
    return ok;
  },

  finishBattle(battle) {
    const omen = getTodayOmen();
    if (battle.source === "boss") {
      const bossId = String(battle.payload.bossId || "");
      const boss = DataManager.getById("boss_table", bossId);
      if (battle.win) {
        const rewards = { daoxing: num(boss.reward_daoxing), mana: num(boss.reward_mana) };
        mergeResources(rewards, boss.reward_items || {});
        const loot = num(omen.lootMult, 1);
        for (const id of Object.keys(rewards)) rewards[id] = Math.round(num(rewards[id]) * loot);
        this._applyResourceDelta(rewards);
        const firstClear = int(this.state.boss_clears[bossId]) === 0;
        this.state.boss_clears[bossId] = int(this.state.boss_clears[bossId]) + 1;
        this._log(`你击败了${boss.boss_name}。`);
        this.queuePopup({
          kind: "text",
          style: "breakthrough",
          title: "挑战胜利！",
          body: `${boss.victory_text || ""}\n\n获得：\n${this._formatResourceDelta(rewards)}${loot > 1 ? `\n\n${omen.name}：战利 +${Math.round((loot - 1) * 100)}%` : ""}`,
          buttons: [{ label: "收取战利" }],
        });
        if (firstClear && boss.first_clear_event && !this.state.pending_event_id) {
          if (EventManager.canOffer(this.state, String(boss.first_clear_event))) {
            this._setPendingEvent(String(boss.first_clear_event));
            this._queueEventPopup();
          }
        }
      } else {
        const consolation = Math.floor(num(boss.reward_mana) * 0.1);
        this.state.resources.mana = num(this.state.resources.mana) + consolation;
        this._log(`你与${boss.boss_name}斗法失利，暂退回府。`);
        this.queuePopup({
          kind: "text",
          title: "斗法失利",
          body: `${boss.boss_name}妖气正盛，你且战且退，未伤根本。\n\n拾得游离灵气：法力 +${formatInt(consolation)}\n\n再积累些道行与术法，改日再来。`,
          buttons: [{ label: "暂且退去" }],
        });
      }
      this._afterMutated();
      return;
    }
    // 遭遇斗法
    const enc = DataManager.getById("encounter_table", String(battle.payload.encounterId || ""));
    const option = (enc.options || [])[int(battle.payload.optionIndex)];
    if (enc && option) {
      const outcome = battle.win ? option.success : option.fail;
      if (battle.win && num(omen.lootMult, 1) > 1 && outcome && outcome.resources) {
        const boosted = {};
        for (const id of Object.keys(outcome.resources)) {
          boosted[id] = Math.round(num(outcome.resources[id]) * num(omen.lootMult, 1));
        }
        this._applyEncounterOutcome(enc, { ...outcome, resources: boosted }, battle.win);
      } else {
        this._applyEncounterOutcome(enc, outcome, battle.win);
      }
    }
  },

  cancelAction() {
    if (!this.state.current_action) return;
    this.state.current_action = null;
    this._log("你收束心神，中断了这次修行。");
    SaveManager.save(this.state);
    this._emit();
  },

  // ---------- 闭关收益 ----------

  claimOfflineReward() {
    const reward = this.pendingOfflineReward;
    if (int(reward.minutes) <= 0) {
      this.queuePopup({ kind: "text", title: "闭关", body: "闭关未满一刻，暂无可领取收益。", buttons: [{ label: "继续闭关" }] });
      return;
    }
    this._applyResourceDelta(reward.resources || {});
    this.state.last_claim_time = nowUnix();
    let eventTriggered = false;
    if (reward.event_id) {
      this._setPendingEvent(reward.event_id);
      eventTriggered = true;
    }
    this._log(`闭关 ${formatDuration(int(reward.minutes))}，收束道行归体。`);
    this.queuePopup({
      kind: "text",
      style: "seal",
      title: "闭关结束！",
      body: `你在洞中参玄悟道 ${formatDuration(int(reward.minutes))}。\n山中灵气渐渐汇入周身，封神榜碎光在远天一闪而没。\n\n获得：\n${this._formatResourceDelta(
        reward.resources || {}
      )}${RealmManager.canLevelUp(this.state) ? "\n\n道行已满，可提升境界。" : ""}${eventTriggered ? "\n\n天象有变，似有机缘浮现。" : ""}`,
      buttons: [{ label: "收下" }],
    });
    this._afterMutated();
    if (eventTriggered) this._queueEventPopup();
  },

  // ---------- 升重 ----------

  levelUp() {
    if (RealmManager.isCapped(this.state)) {
      this.showCapNotice();
      return;
    }
    const before = new Set(this.state.unlocked_ids);
    const result = RealmManager.levelUp(this.state);
    if (!result.ok) {
      this.queuePopup({ kind: "text", title: "升重", body: result.message, buttons: [{ label: "继续修行" }] });
      return;
    }
    UnlockManager.refresh(this.state);
    const from = result.from;
    const to = result.to;
    const powerGain = num(to.combat_power_base) - num(from.combat_power_base);
    const tips = (to.feature_tips || []).map((t) => `解锁：${t}`).join("\n");
    this._log(`你突破至${to.realm_name}。`);
    this.queuePopup({
      kind: "text",
      style: "seal",
      title: "境界提升！",
      body: `${to.lore_text || "你吐纳周天，法力更进一步。"}\n\n${from.realm_name} → ${to.realm_name}\n\n战力 +${formatInt(
        powerGain
      )}\n闭关收益提升${tips ? "\n" + tips : ""}`,
      buttons: [{ label: "继续修行" }],
    });
    this._queueNewUnlockPopups(before);
    // 升重可能触发 level_up 机缘（榜文压顶）
    if (!this.state.pending_event_id) {
      const eventId = EventManager.rollEvent(this.state, "level_up");
      if (eventId) {
        this._setPendingEvent(eventId);
        this._queueEventPopup();
      }
    }
    this._afterMutated();
  },

  // ---------- 破劫（确认流） ----------

  requestBreakthrough() {
    const data = BreakthroughManager.getAvailable(this.state);
    if (!Object.keys(data).length) return;
    if (!BreakthroughManager.canAttempt(this.state)) {
      this.queuePopup({
        kind: "text",
        title: String(data.display_name || "破劫"),
        body: `破劫需道行 ${formatInt(data.required_daoxing)}。\n道行不足，还需闭关积累。`,
        buttons: [{ label: "继续修行" }],
      });
      return;
    }
    // 地仙劫前保底触发「榜外地脉」（event_020）
    if (
      String(data.breakthrough_id) === "bt_002" &&
      !this.state.seen_events.includes("event_020") &&
      !this.state.pending_event_id &&
      EventManager.canOffer(this.state, "event_020")
    ) {
      this._setPendingEvent("event_020");
      this._afterMutated();
      this._queueEventPopup();
      return;
    }
    this.queuePopup({ kind: "breakthrough_confirm", breakthroughId: String(data.breakthrough_id) });
    this._emit();
  },

  confirmBreakthrough() {
    const result = BreakthroughManager.try(this.state);
    if (!result.ok) {
      this.queuePopup({ kind: "text", title: "破劫", body: result.message, buttons: [{ label: "继续修行" }] });
      return;
    }
    const before = new Set(this.state.unlocked_ids);
    const data = result.data;
    if (result.success) {
      UnlockManager.refresh(this.state);
      this._log(String(data.success_text || "破劫成功。"));
      this.queuePopup({
        kind: "text",
        style: "breakthrough",
        title: "破劫成功！",
        body: String(data.success_text || "破劫成功。"),
        buttons: [{ label: "踏入新境" }],
      });
      this._queueNewUnlockPopups(before);
      // 真人一重 → 本命法宝择主
      if (this.hasPendingTreasureChoice()) {
        this.queuePopup({ kind: "treasure_choice" });
      }
      // 地仙一重 → 天仙篇预告
      if (String(this.state.realm_id) === "dx_01") {
        this.showCapNotice();
      }
    } else {
      this._log(String(data.fail_text || "破劫未成，但道心更稳。"));
      this.queuePopup({
        kind: "text",
        style: "breakthrough",
        title: "破劫失败",
        body: `${data.fail_text || "破劫未成。"}\n\n获得：劫火淬体\n下次破劫成功率 +${Math.round(num(data.fail_bonus) * 100)}%\n法力小幅补偿\n\n道行未散。`,
        buttons: [{ label: "稳住道心" }],
      });
    }
    this._afterMutated();
  },

  // ---------- 机缘 ----------

  openPendingEvent() {
    if (!this.state.pending_event_id) return;
    this._queueEventPopup();
    this._emit();
  },

  chooseEventOption(optionIndex) {
    const eventId = this.state.pending_event_id;
    const eventRow = EventManager.getEvent(eventId);
    if (!Object.keys(eventRow).length) return { ok: false };
    const options = eventRow.options || [];
    if (optionIndex < 0 || optionIndex >= options.length) return { ok: false };
    const option = options[optionIndex];
    const reward = this._applyEventReward(option.reward || {});
    EventManager.markSeen(this.state, eventId);
    this.state.pending_event_id = "";
    const deltaText = this._formatResourceDelta(reward.resources || {});
    this._log(`机缘「${eventRow.event_name}」：${option.text}。`);
    this.queuePopup({
      kind: "text",
      style: "chance",
      title: String(eventRow.event_name || "机缘"),
      body: `你选择了「${option.text}」。${deltaText ? `\n\n获得：\n${deltaText}` : "\n\n一缕气机悄然入体。"}`,
      buttons: [{ label: "收下机缘" }],
    });
    this._afterMutated();
    return { ok: true };
  },

  // ---------- 本命法宝择主 ----------

  hasPendingTreasureChoice() {
    if (!UnlockManager.isUnlocked(this.state, "treasure_system")) return false;
    return !Object.values(this.state.treasures).some((t) => int(t.level) > 0);
  },

  chooseFirstTreasure(treasureId) {
    if (!this.hasPendingTreasureChoice()) return;
    if (!FIRST_TREASURE_CHOICES.includes(treasureId)) return;
    const row = DataManager.getById("treasure_table", treasureId);
    if (!Object.keys(row).length) return;
    this.state.treasures[treasureId] = { level: 1, owned: true };
    this.state.first_treasure_id = treasureId;
    this._log(`本命法宝「${row.treasure_name}」与你气机相合。`);
    this.queuePopup({
      kind: "text",
      style: "treasure",
      title: "本命法宝入体！",
      body: `${row.treasure_name}与你气机相合，化作一道灵光悬于身侧。\n从此你不再只是空手施术的山野小修。\n\n${row.origin_desc || ""}\n\n战力大幅提升\n解锁法宝技：${row.skill_name || ""}`,
      buttons: [{ label: "护道随身" }],
    });
    this._afterMutated();
  },

  // ---------- 术法 ----------

  getSpellState(spellId) {
    if (!this.state.spells[spellId]) this.state.spells[spellId] = { level: 0, unlocked: false };
    return this.state.spells[spellId];
  },

  getSpellUpgradeCost(spellRow, toLevel) {
    if (toLevel <= 1) return { spell_page_cost: 0, mana_cost: 0 };
    for (const cost of spellRow.upgrade_costs || []) {
      if (int(cost.to_level) === toLevel) return cost;
    }
    return null;
  },

  getSpellMaxLevel(spellRow) {
    const major = String(RealmManager.getCurrentRealm(this.state).major_realm || "炼气士");
    return int(spellRow.max_level_by_realm?.[major], 5);
  },

  upgradeSpell(spellId) {
    const spellRow = DataManager.getById("spell_table", spellId);
    if (!Object.keys(spellRow).length) return { ok: false };
    const spellState = this.getSpellState(spellId);
    const nextLevel = int(spellState.level) + 1;
    if (nextLevel > this.getSpellMaxLevel(spellRow)) {
      this.queuePopup({ kind: "text", title: spellRow.spell_name, body: "此术在当前境界已至上限，破境后可再精进。", buttons: [{ label: "知道了" }] });
      return { ok: false };
    }
    const cost = this.getSpellUpgradeCost(spellRow, nextLevel);
    if (!cost) return { ok: false };
    const pageCost = num(cost.spell_page_cost);
    const manaCost = num(cost.mana_cost);
    if (num(this.state.resources.spell_page) < pageCost || num(this.state.resources.mana) < manaCost) {
      return { ok: false, message: "材料不足" };
    }
    this.state.resources.spell_page -= pageCost;
    this.state.resources.mana -= manaCost;
    spellState.level = nextLevel;
    spellState.unlocked = true;
    if (nextLevel === 1) {
      this._log(`你悟得术法「${spellRow.spell_name}」。`);
      this.queuePopup({
        kind: "text",
        style: "seal",
        title: `悟得术法：${spellRow.spell_name}`,
        body: `${spellRow.lore_text || ""}\n\n此术虽浅，却已能惊退山野妖邪。`,
        buttons: [{ label: "谨记于心" }],
      });
    } else {
      this._log(`「${spellRow.spell_name}」提升至${nextLevel}重。`);
    }
    this._afterMutated();
    return { ok: true };
  },

  // ---------- 法宝温养 ----------

  getTreasureState(treasureId) {
    if (!this.state.treasures[treasureId]) this.state.treasures[treasureId] = { level: 0, owned: false };
    return this.state.treasures[treasureId];
  },

  getTreasureUpgradeCost(treasureRow, toLevel) {
    const id = String(treasureRow.treasure_id);
    if (toLevel === 1 && id !== this.state.first_treasure_id) {
      // 非择主法宝需以碎片炼化
      return { treasure_shard_cost: 20, mana_cost: 10000 };
    }
    for (const cost of treasureRow.level_growth || []) {
      if (int(cost.level) === toLevel) return cost;
    }
    return null;
  },

  upgradeTreasure(treasureId) {
    const treasureRow = DataManager.getById("treasure_table", treasureId);
    if (!Object.keys(treasureRow).length) return { ok: false };
    const treasureState = this.getTreasureState(treasureId);
    const nextLevel = int(treasureState.level) + 1;
    if (nextLevel > int(treasureRow.max_level_mvp, 5)) {
      this.queuePopup({ kind: "text", title: treasureRow.treasure_name, body: "此宝已温养至极，祭炼之法待天仙篇开启。", buttons: [{ label: "知道了" }] });
      return { ok: false };
    }
    const cost = this.getTreasureUpgradeCost(treasureRow, nextLevel);
    if (!cost) return { ok: false };
    const shardCost = num(cost.treasure_shard_cost);
    const manaCost = num(cost.mana_cost);
    if (num(this.state.resources.treasure_shard) < shardCost || num(this.state.resources.mana) < manaCost) {
      return { ok: false, message: "材料不足" };
    }
    this.state.resources.treasure_shard -= shardCost;
    this.state.resources.mana -= manaCost;
    treasureState.level = nextLevel;
    treasureState.owned = true;
    if (nextLevel === 1) {
      this._log(`你炼化了法宝「${treasureRow.treasure_name}」。`);
    } else {
      this._log(`「${treasureRow.treasure_name}」温养至${nextLevel}重。`);
      this.queuePopup({
        kind: "text",
        style: "treasure",
        title: "法宝强化成功！",
        body: `${treasureRow.treasure_name} Lv.${nextLevel - 1} → Lv.${nextLevel}\n\n宝光更盛，悬于身侧。\n你能明显感觉到，术法运转比从前更顺。`,
        buttons: [{ label: "继续温养" }],
      });
    }
    this._afterMutated();
    return { ok: true };
  },

  // ---------- 地图 ----------

  selectMap(mapId) {
    const maps = UnlockManager.getAvailableMaps(this.state);
    if (!maps.some((m) => String(m.map_id) === mapId)) return;
    this.state.current_map_id = mapId;
    const row = DataManager.getById("map_table", mapId);
    this._log(`你移居${row.map_name}一带修行。`);
    this._afterMutated();
  },

  // ---------- 封顶 ----------

  showCapNotice() {
    this.state.flags.cap_notice_seen = true;
    this.queuePopup({
      kind: "text",
      style: "seal",
      title: "修行暂止",
      body: CAP_NOTICE_TEXT,
      buttons: [{ label: "继续收集" }],
    });
    this._afterMutated();
  },

  // ---------- 主按钮状态机（design/1.8 §23.1） ----------

  getMainAction() {
    const state = this.state;
    if (state.current_action) {
      const row = DataManager.getById("action_table", String(state.current_action.action_id));
      return { type: "acting", label: `${row.action_name || "修行"}中…`, row };
    }
    if (state.pending_event_id) {
      return { type: "event", label: "天象有变，查看机缘" };
    }
    if (this.hasPendingTreasureChoice()) {
      return { type: "treasure_choice", label: "本命法宝择主" };
    }
    if (BreakthroughManager.canAttempt(state)) {
      const data = BreakthroughManager.getAvailable(state);
      return { type: "breakthrough", label: `榜文垂光，${data.display_name || "破劫"}` };
    }
    if (RealmManager.canLevelUp(state)) {
      return { type: "level_up", label: "道行已满，可升重" };
    }
    if (int(this.pendingOfflineReward.minutes) >= 5) {
      return { type: "claim", label: `出关领取\n闭关 ${formatDuration(int(this.pendingOfflineReward.minutes))}` };
    }
    const recommended = this._recommendedAction();
    if (recommended) {
      return { type: "action", label: recommended.action_name, actionId: String(recommended.action_id) };
    }
    if (RealmManager.isCapped(state)) {
      return { type: "action", label: "骷髅山探幽", actionId: "kulou_explore" };
    }
    return { type: "idle", label: "继续闭关" };
  },

  _recommendedAction() {
    const state = this.state;
    const actions = ActionManager.getActions(state);
    const available = actions.filter((row) => ActionManager.getAvailability(state, row).ok);
    if (!available.length) return null;
    // 优先推荐当前目标要求的动作
    const goal = GoalManager.getCurrent(state);
    const c = goal.complete_condition || {};
    if (c.type === "action_complete") {
      const match = available.find((row) => String(row.action_id) === String(c.action_id));
      if (match) return match;
    }
    // 其次：观榜悟道（若目标是事件类）、入定、吐纳
    const order = ["observe_seal", "short_meditation", "breath_cycle", "wild_travel", "chentang_patrol", "kulou_explore"];
    for (const id of order) {
      const match = available.find((row) => String(row.action_id) === id);
      if (match) return match;
    }
    return available[0];
  },

  // ---------- Debug ----------

  fastForward(minutes = 360) {
    if (!this.debug) return;
    this.state.last_claim_time = int(this.state.last_claim_time, nowUnix()) - Math.max(1, minutes) * 60;
    this._refreshPendingReward();
    this._log(`【调试】时间快进${minutes}分钟，当前节奏不代表正式体验。`);
    SaveManager.save(this.state);
    this._emit();
  },

  debugAddResources() {
    if (!this.debug) return;
    for (const id of DataManager.getResourceIds()) {
      this.state.resources[id] = num(this.state.resources[id]) + 5000;
    }
    this._log("【调试】资源 +5000。");
    this._afterMutated();
  },

  resetSave() {
    SaveManager.wipe();
    this.popupQueue = [];
    this.state = SaveManager.normalize(SaveManager.createDefault());
    UnlockManager.refresh(this.state);
    this._refreshPendingReward();
    this._log("你重入轮回，再踏修行路。");
    SaveManager.save(this.state);
    this._emit();
  },

  getPendingEvent() {
    return EventManager.getEvent(this.state.pending_event_id);
  },

  // ---------- 内部 ----------

  _setPendingEvent(eventId) {
    this.state.pending_event_id = eventId;
    this.state.pending_event_prelude = true;
  },

  _queueEventPopup() {
    if (!this.state.pending_event_id) return;
    const alreadyQueued = this.popupQueue.some((p) => p.kind === "event");
    if (alreadyQueued) return;
    this.queuePopup({ kind: "event", prelude: this.state.pending_event_prelude });
    this.state.pending_event_prelude = false;
  },

  _queueNewUnlockPopups(beforeSet) {
    for (const id of this.state.unlocked_ids) {
      if (beforeSet.has(id)) continue;
      const info = FEATURE_UNLOCK_TEXT[id];
      if (!info || this.state.seen_unlock_popups.includes(id)) continue;
      this.state.seen_unlock_popups.push(id);
      this.queuePopup({
        kind: "text",
        style: "seal",
        title: `新机缘开启：${info.name}`,
        body: info.body,
        buttons: [{ label: "知道了" }],
      });
    }
  },

  _checkResourceReveals() {
    for (const row of UnlockManager.getVisibleResources(this.state)) {
      const id = String(row.resource_id);
      if (this.state.seen_resources.includes(id)) continue;
      this.state.seen_resources.push(id);
      const text = RESOURCE_UNLOCK_TEXT[id];
      if (text) {
        this.queuePopup({ kind: "text", style: "seal", title: `${row.resource_name}`, body: text, buttons: [{ label: "知道了" }] });
      }
    }
  },

  _afterMutated() {
    this.state = SaveManager.normalize(this.state);
    UnlockManager.refresh(this.state);
    this._checkResourceReveals();
    // 目标链推进
    const completedGoals = GoalManager.check(this.state);
    for (const goal of completedGoals) {
      if (goal.reward?.resources) this._applyResourceDelta(goal.reward.resources);
      this._log(`目标达成：${goal.goal_name}。`);
      this.queuePopup({
        kind: "text",
        style: "goal",
        title: `目标达成：${goal.goal_name}`,
        body: `${goal.complete_text || ""}${
          goal.reward?.resources && Object.keys(goal.reward.resources).length
            ? `\n\n获得：\n${this._formatResourceDelta(goal.reward.resources)}`
            : ""
        }`,
        buttons: [{ label: "再进一步" }],
      });
    }
    this._refreshPendingReward();
    SaveManager.save(this.state);
    this._emit();
  },

  _refreshPendingReward() {
    this.pendingOfflineReward = RewardManager.calculateOfflineReward(this.state);
  },

  _applyResourceDelta(delta) {
    for (const id of Object.keys(delta)) {
      this.state.resources[id] = Math.max(0, num(this.state.resources[id]) + num(delta[id]));
    }
  },

  _applyEventReward(payload) {
    const resources = {};
    mergeResources(resources, payload.resources || {});
    if (payload.random_bonus && Math.random() <= num(payload.random_bonus.chance)) {
      mergeResources(resources, payload.random_bonus.resources || {});
    }
    if (payload.spell_pages_by_type) {
      let total = 0;
      for (const key of Object.keys(payload.spell_pages_by_type)) total += num(payload.spell_pages_by_type[key]);
      resources.spell_page = num(resources.spell_page) + total;
    }
    if (payload.treasure_shards_by_id) {
      let total = 0;
      for (const key of Object.keys(payload.treasure_shards_by_id)) total += num(payload.treasure_shards_by_id[key]);
      resources.treasure_shard = num(resources.treasure_shard) + total;
    }
    if (payload.root_progress) {
      resources.daoxing = num(resources.daoxing) + num(payload.root_progress);
    }
    if (payload.breakthrough_bonus) {
      // buffs 系统未实现：破劫加成折算为功德
      resources.merit = num(resources.merit) + Math.round(num(payload.breakthrough_bonus) * 2000);
    }
    if (payload.breakthrough_pressure_reduce) {
      const calamity = num(this.state.resources.calamity);
      resources.calamity = num(resources.calamity) - Math.ceil(calamity * num(payload.breakthrough_pressure_reduce)) - 50;
    }
    this._applyResourceDelta(resources);
    return { resources };
  },

  _log(message) {
    const stamp = new Date().toTimeString().slice(0, 5);
    this.state.logs.unshift(`[${stamp}] ${message}`);
    if (this.state.logs.length > 30) this.state.logs.length = 30;
  },

  _emit() {
    if (typeof this.onChange === "function") this.onChange();
  },

  _formatResourceDelta(resources) {
    const parts = [];
    for (const id of Object.keys(resources)) {
      const amount = num(resources[id]);
      if (amount === 0) continue;
      const row = DataManager.getById("resource_table", id);
      parts.push(`${row.resource_name || id} ${amount > 0 ? "+" : ""}${formatInt(amount)}`);
    }
    return parts.join("\n");
  },
};

// ---------------- 工具函数 ----------------

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function nowMs() {
  return Date.now();
}

function todayString() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function int(value, fallback = 0) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function str(value, fallback = "") {
  return value == null ? fallback : String(value);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function mergeResources(target, source) {
  for (const id of Object.keys(source)) {
    target[id] = num(target[id]) + num(source[id]);
  }
}

function formatInt(value) {
  const n = num(value);
  const abs = Math.abs(n);
  if (abs >= 100000000) return (n / 100000000).toFixed(2) + "亿";
  if (abs >= 10000) return (n / 10000).toFixed(2) + "万";
  return String(Math.round(n));
}

function formatDuration(minutes) {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}时${m}分` : `${h}个时辰`;
  }
  return `${minutes}分钟`;
}
