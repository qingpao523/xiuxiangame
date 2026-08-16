"use strict";

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
    // 新手护持：凡境（炼气士）收益 +50%，入真人境后消退
    if (String(realm.major_realm || "") === "炼气士") mult *= 1.5;
    // 培元丹：药效期间收益 +15%
    if (nowUnix() < int(state.pills?.peiyuan_until)) mult *= 1.15;
    // 轮回宿慧：每点道痕 +3%，每个已历世跟脚 +1%（账号级永久乘区）
    const rb = state.rebirth || {};
    mult *= 1 + 0.03 * int(rb.daohen) + 0.01 * (rb.races_seen || []).length;
    // R2-B：五庄观被动——闭关/离线收益 +10%
    if (str(state.faction_id, "") === "wuzhuang") mult *= 1.1;
    // R1-A：人族天赋——道行类收益 +5%；杨戬结缘讲道 +5%
    const daoxingRaceMult = (str(state.race_id, "") === "human" ? 1.05 : 1) * (state.companions?.yangjian?.bonded ? 1.05 : 1);
    const resources = {
      daoxing: Math.max(1, Math.floor(daoxingPerMin * minutes * mult * daoxingRaceMult)),
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
    // R2-B：截教被动——地图掉落几率 +15%；哪吒结缘 +5%
    const factionDropMult = (str(state.faction_id, "") === "jie" ? 1.15 : 1) * (state.companions?.nezha?.bonded ? 1.05 : 1);
    const result = {};
    for (let i = 0; i < rolls; i++) {
      for (const drop of map.drop_table || []) {
        if (!UnlockManager.conditionMet(state, String(drop.unlock_condition || "open"))) continue;
        if (Math.random() <= num(drop.chance) * num(getTodayOmen().dropMult, 1) * factionDropMult) {
          const id = String(drop.resource_id || "");
          const amount = randInt(int(drop.min, 1), int(drop.max, 1));
          result[id] = num(result[id]) + amount;
        }
      }
    }
    return result;
  },
};
