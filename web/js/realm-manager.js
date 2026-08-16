"use strict";

function getPhase(realm) {
  const minor = int(realm.minor_level, 1);
  for (const tier of PHASE_TIERS) {
    if (minor <= tier.maxMinor) return tier;
  }
  return PHASE_TIERS[0];
}

// R1-B 洪荒正统境界显示映射层：realm_id 与数据表一律不动，仅显示改名。
function getPhaseRealmName(realm) {
  const id = String(realm.realm_id || "");
  const minor = int(realm.minor_level, 1);
  if (id.startsWith("rq_")) {
    if (minor <= 3) return `炼精化气·${minor}重`;
    if (minor <= 6) return `炼气化神·${minor}重`;
    if (minor <= 9) return `炼神还虚·${minor}重`;
    return "炼虚合道·凡境圆满";
  }
  if (id.startsWith("zr_")) {
    if (minor <= 3) return `地仙·初期·${minor}重`;
    if (minor <= 6) return `地仙·中期·${minor}重`;
    if (minor <= 9) return `地仙·后期·${minor}重`;
    return `地仙·圆满·${minor}重`;
  }
  if (id.startsWith("dx_")) return "天仙·初期";
  const major = String(realm.major_realm || "");
  return `${major}${getPhase(realm).label}·${minor}重`;
}

function getRealmLifespan(realm) {
  const id = String(realm.realm_id || "");
  if (id.startsWith("dx_")) return "十万载";
  if (id.startsWith("zr_")) return "一万载";
  return "数百年";
}

function getRaceShortName(state) {
  const row = DataManager.getById("race_table", str(state.race_id, ""));
  return String(row.short_name || "");
}

function getFactionRow(state) {
  return DataManager.getById("faction_table", str(state.faction_id, ""));
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
