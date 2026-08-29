/* 封神修道录 · 六抽屉独立渲染单元：机缘（design/19.0 G2，A4-②）
 * 由 ui.js renderChancePanel 逐字迁出，逻辑零改（test/ui-regression.test.js 黄金快照钉死口径）。
 * 运行时依赖（全局符号，调用时解析）：ui.js note/popupButton/closePanelSheet/drainPopupQueue/eventHeadline/eventNarrative/mountEventChoices；DataManager/UnlockManager/ActionManager/EventManager；game.js Game；utils.js int。
 */

"use strict";

// 机缘面板
function renderChancePanel(body, state) {
  if (state.pending_event_id) {
    const ew = Game.getPendingEvent();
    if (!ew || !Object.keys(ew).length) {
      body.appendChild(note("这段机缘已散。"));
      state.pending_event_id = "";
      Game.eventPopupActive = false;
      return;
    }
    body.appendChild(note(eventHeadline(ew)));
    const story = document.createElement("div");
    story.className = "card-desc event-story";
    story.textContent = eventNarrative(ew);
    body.appendChild(story);
    mountEventChoices(body, ew, () => closePanelSheet());
    return;
  }
  body.appendChild(note("天边榜文碎光初现，天地灵机开始动荡。\n闭关、游历、升重、破劫时，都可能遇到机缘。\n普通七成、精良二成五、稀有四厘五、天命五毫。每日首次闭关必有普通或精良；连续两日无稀有，第三日首次必升稀有。"));
  const observeRow = DataManager.getById("action_table", "observe_seal");
  if (Object.keys(observeRow).length && UnlockManager.conditionMet(state, String(observeRow.unlock_realm))) {
    const avail = ActionManager.getAvailability(state, observeRow);
    body.appendChild(popupButton(avail.ok ? "观榜悟道" : `观榜悟道（${avail.reason}）`, !avail.ok, () => { if (!avail.ok) return; closePanelSheet(); Game.startAction("observe_seal"); }));
  }
  const used = typeof EventManager !== "undefined" ? EventManager._todayCount(state) : Object.values(state.event_counts_today).reduce((a, b) => a + int(b), 0);
  const cap = typeof EventManager !== "undefined" ? EventManager._dailyCap(state) : 5;
  const pity = state.event_pity || {};
  const need = Math.max(0, 2 - int(pity.days_without_rare));
  const pityLine = pity.got_rare_today ? "今日已遇稀有或天命。" : (need <= 0 ? "下次机缘必升稀有（保底已满）。" : `再 ${need} 日无稀有，则保底升稀有。`);
  body.appendChild(note(`今日机缘 ${used} / ${cap}。${pityLine}`));
}

window.PANEL_UNITS = window.PANEL_UNITS || {};
window.PANEL_UNITS.chance = { title: "机缘", render: renderChancePanel };
