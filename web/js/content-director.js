"use strict";

// 内容导演（design/1.12）：开号第几天 × 境界 → 触发表玩法。
const ContentDirector = {
  accountDay(state) {
    const created = int(state.created_at, nowUnix());
    return Math.max(0, Math.floor((nowUnix() - created) / 86400));
  },

  isOpening(state) {
    if (typeof GoalManager === "undefined") return false;
    const g = GoalManager.getCurrent(state);
    return String(g.stage || "") === "前30分钟";
  },

  pulse(reason) {
    if (typeof Game === "undefined" || !Game.state) return;
    const state = Game.state;
    if (!state.flags.prologue_seen) return;
    const day = this.accountDay(state);
    const fired = state.flags.beats_fired || {};
    let hit = false;
    for (const beat of DataManager.getRows("beat_table")) {
      const id = String(beat.beat_id);
      if (fired[id]) continue;
      if (int(beat.day_min, 0) > day || int(beat.day_max, 99) < day) continue;
      if (beat.realm_min && !DataManager.isRealmAtLeast(state.realm_id, String(beat.realm_min))) continue;
      if (beat.realm_max) {
        const cur = DataManager.realmOrder[state.realm_id];
        const max = DataManager.realmOrder[String(beat.realm_max)];
        if (cur != null && max != null && cur > max) continue;
      }
      const trig = String(beat.trigger || "any");
      if (trig !== "any" && trig !== String(reason)) continue;
      if (beat.opening_only && !this.isOpening(state)) continue;
      const eventId = String(beat.event_id || "");
      const miniId = String(beat.minigame_id || "");
      if (!eventId && !miniId) continue;

      if (eventId) {
        if (state.pending_event_id) continue;
        if (typeof EventManager === "undefined" || !EventManager.canOffer(state, eventId)) {
          fired[id] = true;
          hit = true;
          continue;
        }
        fired[id] = true;
        hit = true;
        Game._setPendingEvent(eventId);
        Game._queueEventPopup();
        continue;
      }

      fired[id] = true;
      hit = true;
      if (miniId && typeof GameplayEngine !== "undefined") GameplayEngine.trigger(miniId);
    }

    // 无 weight 的脚本机缘只在登录/升重吐一条，不跟每一次吐纳抢弹窗。
    if (!state.pending_event_id && (reason === "login" || reason === "realm") && typeof EventManager !== "undefined") {
      const scripted = EventManager.nextScripted(state, ["offline"]);
      if (scripted) {
        Game._setPendingEvent(scripted);
        Game._queueEventPopup();
      }
    }

    if (hit) {
      state.flags.beats_fired = fired;
      SaveManager.save(state);
    }
  },
};
