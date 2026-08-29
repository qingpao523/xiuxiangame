/* 封神修道录 · G3 面板迁 Vue：机缘（design/19.0 A4-③）
 * 合同：逻辑零改（黄金快照钉死口径，与 chance-panel.js 命令式版本一致）；Game 不进组件（只读 props.state）；
 *       不给 .card 加全局副作用。
 * 事件抉择按钮复用全局 mountEventChoices（依赖链 eventOptionButton/eventOptionTone/describeEventReward 过深，
 * 重写会违背逻辑零改），onMounted 时直接追加到宿主 body——与命令式版本 append 位置/顺序逐字一致。
 * 兜底：Vue 不可用时 ui.js renderPanelBody 自动回落 window.PANEL_UNITS.chance。
 */

"use strict";

const ChancePanelVue = {
  props: { state: { type: Object, required: true } },
  setup(props) {
    const { onMounted } = Vue;
    const state = props.state;
    // 显示模型现算（与命令式 renderChancePanel 语义一致，每次 mount 全量重渲染）。
    const model = { mode: "list", headline: "", story: "", ew: null, noteText: "", observe: null, countLine: "" };
    if (state.pending_event_id) {
      const ew = Game.getPendingEvent();
      if (!ew || !Object.keys(ew).length) {
        model.mode = "gone";
        state.pending_event_id = "";
        Game.eventPopupActive = false;
      } else {
        model.mode = "event"; model.ew = ew;
        model.headline = eventHeadline(ew);
        model.story = eventNarrative(ew);
      }
    } else {
      model.noteText = "天边榜文碎光初现，天地灵机开始动荡。\n闭关、游历、升重、破劫时，都可能遇到机缘。\n普通七成、精良二成五、稀有四厘五、天命五毫。每日首次闭关必有普通或精良；连续两日无稀有，第三日首次必升稀有。";
      const observeRow = DataManager.getById("action_table", "observe_seal");
      if (Object.keys(observeRow).length && UnlockManager.conditionMet(state, String(observeRow.unlock_realm))) {
        const avail = ActionManager.getAvailability(state, observeRow);
        model.observe = { ok: avail.ok, label: avail.ok ? "观榜悟道" : `观榜悟道（${avail.reason}）` };
      }
      const used = typeof EventManager !== "undefined" ? EventManager._todayCount(state) : Object.values(state.event_counts_today).reduce((a, b) => a + int(b), 0);
      const cap = typeof EventManager !== "undefined" ? EventManager._dailyCap(state) : 5;
      const pity = state.event_pity || {};
      const need = Math.max(0, 2 - int(pity.days_without_rare));
      const pityLine = pity.got_rare_today ? "今日已遇稀有或天命。" : (need <= 0 ? "下次机缘必升稀有（保底已满）。" : `再 ${need} 日无稀有，则保底升稀有。`);
      model.countLine = `今日机缘 ${used} / ${cap}。${pityLine}`;
    }
    onMounted(() => {
      // 事件抉择按钮：复用命令式辅助，直接追加到宿主 body（与命令式版本 DOM 位置一致）。
      if (model.mode === "event") mountEventChoices(document.getElementById("panel-body"), model.ew, () => closePanelSheet());
    });
    const pickObserve = () => { if (!model.observe.ok) return; closePanelSheet(); Game.startAction("observe_seal"); };
    return { model, pickObserve };
  },
  template: `
<div v-if="model.mode === 'gone'" class="panel-note">这段机缘已散。</div>
<template v-else-if="model.mode === 'event'">
  <div class="panel-note">{{ model.headline }}</div>
  <div class="card-desc event-story">{{ model.story }}</div>
</template>
<template v-else>
  <div class="panel-note">{{ model.noteText }}</div>
  <button v-if="model.observe" class="popup-btn" :class="{ secondary: !model.observe.ok }" @click="pickObserve">{{ model.observe.label }}</button>
  <div class="panel-note">{{ model.countLine }}</div>
</template>
`,
};

window.PANEL_VUE_UNITS = window.PANEL_VUE_UNITS || {};
window.PANEL_VUE_UNITS.chance = { title: "机缘", component: ChancePanelVue };
