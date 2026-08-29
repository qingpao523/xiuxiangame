/* 封神修道录 · G3 面板迁 Vue：境界（design/19.0 A4-③）
 * 合同：逻辑零改（黄金快照钉死口径，与 realm-panel.js 命令式版本一致）；Game 不进组件（只读 props.state）；
 *       不给 .card 加全局副作用。事件回调在模块作用域调全局方法（与命令式版本相同）。
 * 兜底：Vue 不可用时 ui.js renderPanelBody 自动回落 window.PANEL_UNITS.realm。
 */

"use strict";

const RealmPanelVue = {
  props: { state: { type: Object, required: true } },
  setup(props) {
    const state = props.state;
    // 显示模型现算（与命令式 renderRealmPanel 语义一致，每次 mount 全量重渲染）。
    const realm = RealmManager.getCurrentRealm(state);
    const progress = RealmManager.getProgress(state);
    const raceTag = getRaceShortName(state);
    const faction = getFactionRow(state);
    const rb = state.rebirth || {};
    const rebirthLine = int(rb.count) > 0 ? `\n历世：第${rb.count + 1}世｜道痕 ${int(rb.daohen)}｜宿慧 +${Math.round(int(rb.daohen) * 3 + (rb.races_seen || []).length)}%` : "";
    const factionLine = Object.keys(faction).length ? `势力：${faction.faction_name}（${faction.dojo}）\n护持：${faction.passive_name}——${faction.passive_desc}` : (RealmManager.isCapped(state) ? "势力：尚未入局——你已立身天仙之境，四方皆在等你落子。" : "势力：未入局（立身天仙之境后，须择一方势力）");
    // 真灵上榜：已得神位
    let seatText = "";
    if (state.god_seats?.length) {
      const seatNames = state.god_seats.map((id) => { const s = GOD_SEATS.find((g) => g.id === id); return s ? s.name + "：" + s.desc : ""; });
      seatText = `\n真灵上榜：\n${seatNames.join("\n")}`;
    }
    const mainNote = `${getPhaseRealmName(realm)}｜${raceTag ? `${raceTag}·` : ""}${getTitle(state)}\n寿元：${getRealmLifespan(realm)}\n${factionLine}${rebirthLine}${seatText}\n\n${realm.visual_state || ""}\n\n${realm.lore_text || ""}\n\n道行 ${formatInt(progress.current)} / ${formatInt(progress.required)}　战力 ${formatInt(RealmManager.getCombatPower(state))}`;
    const breakthrough = BreakthroughManager.getAvailable(state);
    const model = {
      mainNote,
      hasBreakthrough: !!Object.keys(breakthrough).length,
      pressureNote: "", breakthroughLabel: "",
      canLevel: false,
      capped: false, cappedNote: "", needFaction: false, canReincarnate: false, preview: null, phaseName: getPhaseRealmName(realm),
      nextNote: "",
    };
    if (model.hasBreakthrough) {
      model.pressureNote = `${breakthrough.pressure_label || "劫将至"}：${breakthrough.breakthrough_lore || ""}`;
      model.breakthroughLabel = `${breakthrough.display_name}（${Math.round(BreakthroughManager.getSuccessRate(state) * 100)}%）`;
    } else if (RealmManager.canLevelUp(state)) {
      model.canLevel = true;
    } else if (RealmManager.isCapped(state)) {
      model.capped = true;
      model.cappedNote = `你已至${getPhaseRealmName(realm)}，当前版本修行暂止。`;
      model.needFaction = !str(state.faction_id, "");
      model.canReincarnate = Game.canReincarnate();
      if (model.canReincarnate) model.preview = Game.getRebirthPreview();
    } else {
      model.nextNote = `下一境：${getPhaseRealmName(RealmManager.getNextRealm(state))}\n继续闭关或修行，积累道行。`;
    }
    const doBreakthrough = () => { closePanelSheet(); Game.requestBreakthrough(); };
    const doLevelUp = () => { closePanelSheet(); playLevelUpFx(() => Game.levelUp()); };
    const doFaction = () => { closePanelSheet(); Game._maybeQueueFactionChoice(); drainPopupQueue(); };
    const doCapNotice = () => { closePanelSheet(); Game.showCapNotice(); };
    const doReincarnate = () => {
      closePanelSheet();
      Game.queuePopup({
        kind: "text", style: "breakthrough", title: "应劫转世？",
        body: `此生修至${model.phaseName}。\n\n转世之后：境界、资源、术法、法宝尽数重走；\n此生凝作道痕 +${model.preview.gain}（共 ${model.preview.daohenAfter} 点）——每点道痕，来世收益 +3%；\n此生跟脚${model.preview.raceNew ? "将录入图鉴，来世再添 +1%" : "已入图鉴"}。\n历世记录与操作偏好保留。`,
        buttons: [{ label: "应劫转世", action: "reincarnate" }, { label: "暂不转世" }],
      });
      drainPopupQueue();
    };
    return { model, doBreakthrough, doLevelUp, doFaction, doCapNotice, doReincarnate };
  },
  template: `
<div class="panel-note">{{ model.mainNote }}</div>
<template v-if="model.hasBreakthrough">
  <div class="panel-note">{{ model.pressureNote }}</div>
  <button class="popup-btn" @click="doBreakthrough">{{ model.breakthroughLabel }}</button>
</template>
<button v-else-if="model.canLevel" class="popup-btn" @click="doLevelUp">道行已满，升重</button>
<template v-else-if="model.capped">
  <div class="panel-note">{{ model.cappedNote }}</div>
  <button v-if="model.needFaction" class="popup-btn" @click="doFaction">择势力入局</button>
  <button class="popup-btn" @click="doCapNotice">查看天仙篇预告</button>
  <button v-if="model.canReincarnate" class="popup-btn" @click="doReincarnate">应劫转世（凝此生为道痕）</button>
</template>
<div v-else class="panel-note">{{ model.nextNote }}</div>
`,
};

window.PANEL_VUE_UNITS = window.PANEL_VUE_UNITS || {};
window.PANEL_VUE_UNITS.realm = { title: "境界", component: RealmPanelVue };
