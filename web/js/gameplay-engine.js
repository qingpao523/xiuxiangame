"use strict";

// 玩法引擎（design/1.10 / 1.12）：表定义玩法，渲染注册，统一结算。
const GameplayEngine = {
  _renderers: {},
  pendingBattle: null,

  registerRenderer(kind, fn) {
    this._renderers[String(kind)] = fn;
  },

  getRenderer(kind) {
    return this._renderers[String(kind)] || null;
  },

  trigger(minigameId) {
    const def = DataManager.getById("minigame_table", minigameId);
    if (!Object.keys(def).length) return false;
    const fsm = def.fsm || [];
    if (!fsm.length) return false;
    if (typeof Game === "undefined") return false;
    Game.queuePopup({
      kind: "minigame",
      minigameId: String(minigameId),
      stateId: String(fsm[0].state || "choose"),
    });
    return true;
  },

  choose(minigameId, optionId) {
    const def = DataManager.getById("minigame_table", minigameId);
    if (!Object.keys(def).length) return;
    const node = (def.fsm || [])[0] || {};
    const opt = (node.options || []).find((o) => String(o.id) === String(optionId));
    if (!opt) return;
    const rewards = opt.rewards || {};
    if (Object.keys(rewards).length) Game._applyResourceDelta(rewards);
    if (opt.flag) Game.state.flags[String(opt.flag)] = true;
    Game._log(String(opt.log || def.settle_log || "机缘已定。"));
    if (opt.toast) Game.toast(String(def.title || "机缘"), String(opt.toast));
    Game._afterMutated();
  },
};
