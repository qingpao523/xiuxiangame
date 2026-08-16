"use strict";

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
