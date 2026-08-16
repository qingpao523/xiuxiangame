"use strict";

const BreakthroughManager = {
  getAvailable(state) {
    const realm = DataManager.getRealm(state.realm_id || "rq_01");
    const id = realm.breakthrough_id_to_next;
    if (!id) return {};
    return DataManager.getById("breakthrough_table", String(id));
  },

  // R2-A 破劫因果链：前置因果的总决算，逐行明细。
  getRateBreakdown(state, data) {
    data = data || this.getAvailable(state);
    if (!Object.keys(data).length) return null;
    const id = String(data.breakthrough_id || "");
    const failCount = int(state.breakthrough_fail_counts[id]);
    const merit = num(state.resources.merit);
    const calamity = num(state.resources.calamity);
    const base = num(data.base_success_rate);
    // 剧情节点：已历 event_001（榜文碎光）或 event_017（榜文压顶）者 +5%
    const storyBonus =
      state.seen_events.includes("event_001") || state.seen_events.includes("event_017") ? 0.05 : 0;
    const meritBonus = Math.min(Math.floor(merit / 100) * 0.005, num(data.merit_bonus_cap, 0.2));
    // 法宝护身：最高法宝等级 ×2%，上限 12%
    let maxTreasureLevel = 0;
    for (const t of Object.values(state.treasures || {})) {
      maxTreasureLevel = Math.max(maxTreasureLevel, int(t.level));
    }
    const treasureBonus = Math.min(0.12, maxTreasureLevel * 0.02);
    // 地脉之力：仅地仙劫（bt_002）且已历 event_020（榜外地脉）者 +10%
    const pulseBonus = id === "bt_002" && state.seen_events.includes("event_020") ? 0.1 : 0;
    const failBonus = failCount * num(data.fail_bonus);
    const calamityPenalty = Math.min(Math.floor(calamity / 100) * 0.003, num(data.calamity_penalty_cap, 0.15));
    // 先天道体：人族破劫基础率 +3%
    const raceBonus = str(state.race_id, "") === "human" ? 0.03 : 0;
    const rate = clamp(
      base + storyBonus + meritBonus + treasureBonus + pulseBonus + failBonus + raceBonus - calamityPenalty,
      num(data.min_success_rate),
      num(data.max_success_rate, 1)
    );
    return { base, storyBonus, meritBonus, treasureBonus, pulseBonus, failBonus, calamityPenalty, raceBonus, rate };
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

  // 破劫斗法胜利：扣道行、入新境、解锁
  applyVictory(state, data) {
    const required = num(data.required_daoxing);
    state.resources.daoxing = Math.max(0, num(state.resources.daoxing) - required);
    state.realm_id = String(data.to_realm || state.realm_id);
    state.breakthrough_fail_counts[String(data.breakthrough_id)] = 0;
    UnlockManager.add(state, data.success_rewards?.unlock_ids || []);
  },

  // 破劫斗法失利：劫火淬体（失败补偿累计）+ 法力小补，道行不散
  applyDefeat(state, data) {
    const id = String(data.breakthrough_id || "");
    state.breakthrough_fail_counts[id] = int(state.breakthrough_fail_counts[id]) + 1;
    const manaPercent = num(data.fail_rewards?.mana_percent);
    if (manaPercent > 0) {
      state.resources.mana = num(state.resources.mana) + Math.max(100, num(state.resources.mana) * manaPercent);
    }
  },
};
