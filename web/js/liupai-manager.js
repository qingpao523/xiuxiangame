"use strict";

// ===== 流派系统管理器（design/11.0 v0.2，落地锁定决策 D3/C1-C9）=====
// 四修（器/体/魂/劫）= 输出/生存/控制/机制四 build 轴。
// 批次2 = 埋接口：本文件自含 canUseSpell / ensureLiupaiState / 被动聚合，
//   试验期（chosen=null，真仙破劫 zx 之前）canUseSpell 恒 true，不影响前期。
// 批次5 = 上线：game.js 择派仪式 + 修被动结算 + 门控（C1 重构五选一→四修）；
//   battle-engine-v2.js _applyGlobalMult 链挂修被动 mult；ui.js 择派弹窗；
//   battle-ui-v2.js renderSlotConfig 非 native 系灰显 + 流派徽章。
// 批次6 = 转世重选（清空 state.liupai）。
// 数值为初版基线〔待校准〕，权威台账见 design/数值规划与平衡待办 v0.1.md §五。

const LiupaiManager = {
  // ---------- 数据获取 ----------

  getRows() {
    return typeof DataManager !== "undefined" ? DataManager.getRows("liupai_table") : [];
  },

  getById(liupaiId) {
    if (!liupaiId) return null;
    return this.getRows().find((r) => String(r.liupai_id) === String(liupaiId)) || null;
  },

  // ---------- state 归一化 ----------

  // 确保 state.liupai 结构完整（save-manager.js 加载时调用；批次2 埋点）。
  // state.liupai = { chosen, chosen_at_realm, branch, prestige }（design/11.0 §六 line220）
  ensureState(state) {
    const lp = state.liupai || {};
    state.liupai = {
      chosen: lp.chosen || null, // null | 'qi' | 'ti' | 'hun' | 'jie'
      chosen_at_realm: lp.chosen_at_realm || null, // 择派时的境界（如 'zx_01'），一世不可逆
      branch: lp.branch || null, // 当前激活的内部分支 branch_id（进阶/高阶）
      prestige: Array.isArray(lp.prestige) ? lp.prestige : [], // 已解锁的 prestige 跨系 branch_id 列表
    };
    return state.liupai;
  },

  isChosen(state) {
    return !!(state.liupai && state.liupai.chosen);
  },

  // ---------- 门控核心：canUseSpell ----------

  // 某流派当前可用的 spell_type 集合 = 主系 ∪ 已解锁分支系 ∪ 已解锁 prestige 系。
  // 分支解锁判定（批次2 仅按 realm 门做轻量判定；完整 unlock_req 校验在批次5）：
  //   - 进阶/高阶分支：境界 >= unlock_realm 视为可达（详细 unlock_req 批次5 校验）。
  //   - prestige 分支：必须在 state.liupai.prestige 中显式解锁（高门槛，C5）。
  nativeSpellTypes(state) {
    const lp = this.ensureState(state);
    const row = this.getById(lp.chosen);
    if (!row) return [];
    const set = new Set([String(row.primary_element)]);
    for (const br of row.branches || []) {
      const unlocked = br.prestige
        ? lp.prestige.includes(String(br.branch_id))
        : this._realmReached(state, br.unlock_realm);
      if (!unlocked) continue;
      for (const el of br.unlock_elements || []) set.add(String(el));
    }
    return [...set];
  },

  // 试验期（chosen=null）恒 true；择派后仅 native 系可配/可放。
  canUseSpell(state, spellType) {
    const lp = this.ensureState(state);
    if (!lp.chosen) return true; // 试验期无门控（炼气→真仙破劫前）
    return this.nativeSpellTypes(state).includes(String(spellType));
  },

  // ---------- 被动聚合（供 battle-engine-v2.js _applyGlobalMult 链消费，批次5 接线）----------

  // 返回择派即得的修被动 + 已解锁分支被动（浅合并，后者覆盖前者同名键）。
  getPassives(state) {
    const lp = this.ensureState(state);
    const row = this.getById(lp.chosen);
    if (!row) return {};
    const merged = { ...(row.passive || {}) };
    for (const br of row.branches || []) {
      const unlocked = br.prestige
        ? lp.prestige.includes(String(br.branch_id))
        : (lp.branch === String(br.branch_id) && this._realmReached(state, br.unlock_realm));
      if (unlocked && br.passive) Object.assign(merged, br.passive);
    }
    return merged;
  },

  // ---------- 内部 ----------

  // 轻量境界门判定：复用 RealmManager.isRealmAtLeast（若可用）；否则保守返回 false。
  _realmReached(state, realmId) {
    if (!realmId) return true;
    if (typeof RealmManager !== "undefined" && typeof RealmManager.isRealmAtLeast === "function") {
      return RealmManager.isRealmAtLeast(state, String(realmId));
    }
    if (typeof DataManager !== "undefined" && typeof DataManager.isRealmAtLeast === "function") {
      return DataManager.isRealmAtLeast(state, String(realmId));
    }
    return false;
  },

  getBranch(row, branchId) {
    if (!row || !branchId) return null;
    return (row.branches || []).find((b) => String(b.branch_id) === String(branchId)) || null;
  },
};
