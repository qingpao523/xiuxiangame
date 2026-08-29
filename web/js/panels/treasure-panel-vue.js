/* 封神修道录 · G3 面板迁 Vue 样板：本命法宝（design/19.0 A4-③）
 * 合同：逻辑零改（渲染口径由 test/ui-regression.test.js 黄金快照钉死，与 treasure-panel.js 命令式版本逐字一致）；
 *       Game 不进组件——组件只读传入的 state（props），事件回调在模块作用域调用全局方法（与命令式版本相同）；
 *       不给 .card 加全局副作用（类名/结构逐字复刻）。
 * 依赖：全局 Vue（web/js/vendor/vue.global.prod.js，global build 含模板编译器，无构建）；
 *       全局符号：Game/UnlockManager/ContentDirector/TREASURE_ICONS/int/num/formatInt/closePanelSheet/drainPopupQueue/renderPanelBody。
 * 兜底：Vue 不可用时 ui.js renderPanelBody 自动回落 window.PANEL_UNITS.treasure（命令式版本）。
 */

"use strict";

const TreasurePanelVue = {
  props: { state: { type: Object, required: true } },
  setup(props) {
    // 每次挂载即一次全量渲染（与命令式 renderTreasurePanel 语义一致），显示模型现算不缓存。
    const state = props.state;
    const pendingChoice = Game.hasPendingTreasureChoice();
    const opening = typeof ContentDirector !== "undefined" && ContentDirector.isOpening(state);
    const treasures = UnlockManager.getAvailableTreasures(state).map((treasure) => {
      const id = String(treasure.treasure_id); const tState = Game.getTreasureState(id);
      const level = int(tState.level), maxLevel = int(treasure.max_level_mvp, 5), nextLevel = level + 1;
      const cost = nextLevel <= maxLevel ? Game.getTreasureUpgradeCost(treasure, nextLevel) : null;
      return {
        id, level,
        selected: level > 0,
        icon: TREASURE_ICONS[id] || "",
        nameLine: `${treasure.treasure_name}　${level > 0 ? `${level}重` : "未炼化"}｜${treasure.skill_name || ""}`,
        desc: treasure.origin_desc || "",
        costLine: cost ? `${nextLevel === 1 ? "炼化" : `温养至${nextLevel}重`}：碎片 ${formatInt(cost.treasure_shard_cost)}｜法力 ${formatInt(cost.mana_cost)}` : "已温养至极",
        btnLabel: level === 0 ? "炼化" : "温养",
        disabled: !cost || num(state.resources.treasure_shard) < num(cost?.treasure_shard_cost) || num(state.resources.mana) < num(cost?.mana_cost),
      };
    });
    const chooseMaster = () => { closePanelSheet(); Game.queuePopup({ kind: "treasure_choice" }); drainPopupQueue(); };
    const openSynth = () => { closePanelSheet(); Game.queuePopup({ kind: "fragment_synth" }); drainPopupQueue(); };
    const upgrade = (id) => { Game.upgradeTreasure(id); renderPanelBody("treasure"); };
    return { pendingChoice, opening, treasures, chooseMaster, openSynth, upgrade };
  },
  template: `
<div v-if="pendingChoice" class="panel-note">破劫成真人后，你的气机引动三件残宝，静待择主。</div>
<button v-if="pendingChoice" class="popup-btn" @click="chooseMaster">本命法宝择主</button>
<template v-if="!pendingChoice">
  <div class="panel-note">法宝不是普通装备，而是护道根基。以法宝碎片与法力温养之。</div>
  <button v-if="!opening" class="popup-btn" @click="openSynth">碎片合成</button>
  <div v-for="t in treasures" :key="t.id" class="card" :class="{ selected: t.selected }">
    <img :src="t.icon" alt="">
    <div class="card-info">
      <div class="card-name">{{ t.nameLine }}</div>
      <div class="card-desc">{{ t.desc }}</div>
      <div class="card-cost">{{ t.costLine }}</div>
    </div>
    <button class="card-btn" :disabled="t.disabled" @click="upgrade(t.id)">{{ t.btnLabel }}</button>
  </div>
</template>
`,
};

window.PANEL_VUE_UNITS = window.PANEL_VUE_UNITS || {};
window.PANEL_VUE_UNITS.treasure = { title: "本命法宝", component: TreasurePanelVue };
