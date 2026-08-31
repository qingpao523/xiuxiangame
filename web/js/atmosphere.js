/* 封神修道录 · Atmosphere — 三层反馈体系（画卷感受）
 *
 * 第一层 微反馈：每次行动给一句"气韵"，数字退为次级。
 * 第二层 小仪式：每 3 重（阶段转换）一个 2-3 秒的呼吸时刻，零交互。
 * 第三层 大画卷：破劫 + 关键叙事，完整沉浸演出（ScrollScene 驱动）。
 *
 * 原则：稀有的才珍贵。数字在底层照算，但玩家读到的第一反馈永远是感受。
 *
 * 文案来源（design/21.2 L1-2 数据化）：本文件不再内嵌文案池，
 * 全部内容经 FeedbackRenderer 读自 web/data/feedback_table.json
 * （qiyun_* / ritual_* / bt_scene_* 三族条目）。
 */
"use strict";

// ---------------- API ----------------

const Atmosphere = {
  // 第一层：取一句气韵（按行动；文案在 feedback_table 的 qiyun_* 条目）
  actionLine(actionId, state) {
    return FeedbackRenderer.line("qiyun_" + actionId) || FeedbackRenderer.line("qiyun_default");
  },

  // 第二层：判断是否阶段转换（每 3 重的边界：3→4, 6→7, 9→10）
  isPhaseTransition(fromRealm, toRealm) {
    if (!fromRealm || !toRealm) return false;
    if (String(fromRealm.major_realm) !== String(toRealm.major_realm)) return false; // 跨大境走破劫画卷
    const to = int(toRealm.minor_level);
    return to === 4 || to === 7 || to === 10;
  },

  // 第二层：取阶段仪式文案（feedback_table 的 ritual_* 条目）
  phaseRitual(realmId) {
    return FeedbackRenderer.line("ritual_" + realmId);
  },

  // 第二层：播放小仪式（2.8 秒呼吸时刻，零交互，自动消散）
  playRitual(text, doneCb) {
    const el = $("ritual-layer");
    if (!el) { if (doneCb) doneCb(); return; }
    $("ritual-text").textContent = text;
    el.classList.remove("hidden");
    void el.offsetWidth;
    el.classList.add("on");
    setTimeout(() => {
      el.classList.remove("on");
      setTimeout(() => { el.classList.add("hidden"); if (doneCb) doneCb(); }, 1100);
    }, 2800);
  },

  // 第三层：取破劫画卷脚本（feedback_table 的 bt_scene_* 条目）
  breakthroughScene(btId) {
    const beats = FeedbackRenderer.scene("bt_scene_" + btId);
    return beats ? { beats } : null;
  },

  // 第三层：播放破劫大画卷
  playBreakthrough(btId, doneCb) {
    const script = this.breakthroughScene(btId);
    if (!script) { if (doneCb) doneCb(); return; }
      // SFX-04 破劫演出：劫云压顶环境音床 + 开场劫雷；结束后恢复境界环境音床。
      if (typeof AudioManager !== "undefined") {
        AudioManager.playAmbient("amb_tribulation");
        AudioManager.playSfx("tribulation_rumble", { dur: 2.2 });
        AudioManager.playSfx("seal_hum");
      }
      const _btDone = doneCb;
      doneCb = () => {
        if (typeof Game !== "undefined" && Game.updateAmbient) Game.updateAmbient();
        if (_btDone) _btDone();
      };
    ScrollScene.play(script, doneCb);
  },
};
