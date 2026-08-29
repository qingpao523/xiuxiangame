/* 封神修道录 · G3 面板迁 Vue：游历（design/19.0 A4-③）
 * 合同：逻辑零改（黄金快照钉死口径，与 map-panel.js 命令式版本一致）；Game 不进组件（只读 props.state）；
 *       不给 .card 加全局副作用。事件回调在模块作用域调全局方法（与命令式版本相同）。
 * 弱点行的行内色 style.color=#d9a441 逐字保留（:style 绑定，不加全局 CSS 副作用）。
 * 兜底：Vue 不可用时 ui.js renderPanelBody 自动回落 window.PANEL_UNITS.map。
 */

"use strict";

const MapPanelVue = {
  props: { state: { type: Object, required: true } },
  setup(props) {
    const state = props.state;
    // 显示模型现算（与命令式 renderMapPanel 语义一致，每次 mount 全量重渲染）。
    const opening = typeof ContentDirector !== "undefined" && ContentDirector.isOpening(state);
    // 镇魔塔：开局主路径不推（design/1.12）
    UnlockManager._resetTowerCycleIfNeeded(state);
    const tw = state.tower || { tickets: 0, best_floor_this_cycle: 0 };
    const tower = {
      show: !opening,
      desc: `本期登塔令 ${int(tw.tickets)} 枚｜本期最高 第${int(tw.best_floor_this_cycle)}层｜历史最高 第${int(state.tower_best_floor_ever)}层`,
      has: int(tw.tickets) > 0,
    };
    // 今日杀劫大阵
    let array = null;
    const todayArr = getTodayArray();
    if (Object.keys(todayArr).length && UnlockManager.conditionMet(state, String(todayArr.unlock_realm || ""))) {
      const arrAvail = Game.getArrayAvailability();
      array = {
        name: `今日杀劫：${todayArr.array_name}`,
        desc: todayArr.narrative_desc || "",
        cost: arrAvail.ok ? `三段阵势，今日可闯 ${arrAvail.remain} 次｜败北亦有真灵上榜之机缘` : arrAvail.reason,
        ok: arrAvail.ok,
      };
    }
    const maps = UnlockManager.getAvailableMaps(state);
    const power = RealmManager.getCombatPower(state);
    const elName = { thunder: "雷", fire: "火", weapon: "剑", soul: "魂", calamity: "劫" };
    const mapModels = maps.map((map) => {
      const id = String(map.map_id);
      const m = {
        id,
        selected: state.current_map_id === id,
        name: `${map.map_name}${state.current_map_id === id ? "（驻留中）" : ""}`,
        desc: map.entry_text || map.narrative_desc || "",
        cost: `推荐战力 ${formatInt(map.recommended_power)}｜你的战力 ${formatInt(power)}`,
        bosses: [], action: null, exploreNote: "", exploredPoints: [],
      };
      // M3 投放层（design/15.0 §五）：按 boss_table.map_id 聚合渲染本图全部 Boss，
      // 取代旧"单代表 Boss(map.boss_id)"——解锁 22 个无入口 Boss（含九 Boss boss_023-031）。
      const mapBosses = DataManager.getRows("boss_table")
        .filter((b) => String(b.map_id) === id && UnlockManager.conditionMet(state, String(b.unlock_condition || "")))
        .sort((a, b) => (String(a.boss_id) === String(map.boss_id) ? -1 : String(b.boss_id) === String(map.boss_id) ? 1 : 0) || (num(a.recommended_power) - num(b.recommended_power)));
      m.bosses = mapBosses.map((boss) => {
        const bossId = String(boss.boss_id);
        const cleared = int(state.boss_clears[bossId]) > 0;
        const rate = Math.round(BossManager.getWinRate(state, boss) * 100);
        const remain = Math.max(0, 3 - int(state.boss_counts_today[bossId]));
        return {
          id: bossId,
          icon: BOSS_ICONS[bossId] || "",
          name: `挑战：${boss.boss_name}${cleared ? "（已伏）" : ""}`,
          desc: boss.lore_text || "",
          cost: `推荐战力 ${formatInt(boss.recommended_power)}｜胜率 ${rate}%｜今日可挑战 ${remain} 次`,
          // P0-B: 弱点提示
          weak: (boss.weakness && boss.weakness.length) ? `弱点：${boss.weakness.map(w => elName[w] || w).join("·")}系（命中 +30% 伤害）` : "",
          disabled: remain <= 0,
        };
      });
      const actionId = MAP_ACTION[id];
      if (actionId) {
        const actionRow = DataManager.getById("action_table", actionId);
        if (Object.keys(actionRow).length && UnlockManager.conditionMet(state, String(actionRow.unlock_realm))) {
          m.action = {
            id: actionId,
            label: `${actionRow.action_name}（${actionRow.duration_sec}息）`,
            disabled: !ActionManager.getAvailability(state, actionRow).ok,
          };
        }
      }
      // 可探索空间（design/6.0 第三层）：此地图的探索点（已发现 + 未至之境）
      const epAll = DataManager.getRows("explore_point_table").filter((p) => String(p.map_id) === id);
      if (epAll.length) {
        const epDone = epAll.filter((p) => (state.explored_points || []).includes(String(p.point_id)));
        const epFog = epAll.length - epDone.length;
        m.exploreNote = `此地秘境：已发现 ${epDone.length}/${epAll.length} 处${epFog > 0 ? `，尚有 ${epFog} 处未至之境` : "，已尽览"}`;
        m.exploredPoints = epDone.map((p) => ({ id: String(p.point_id), name: `◆ ${p.name}`, flavor: p.flavor || "" }));
      }
      return m;
    });
    const openWorldMap = () => { closePanelSheet(); WorldMap.open(); };
    const startTower = () => { closePanelSheet(); Game.startTowerRun(); };
    const startArray = () => { closePanelSheet(); Game.startArrayBattle(); };
    const selectMap = (id) => Game.selectMap(id);
    const fightBoss = (bossId) => { closePanelSheet(); Game.startBossBattle(bossId); };
    const startAction = (actionId) => { closePanelSheet(); Game.startAction(actionId); };
    return { tower, array, maps: mapModels, noMaps: !maps.length, openWorldMap, startTower, startArray, selectMap, fightBoss, startAction };
  },
  template: `
<button class="popup-btn" @click="openWorldMap">展开封神山河图</button>
<div v-if="tower.show" class="card">
  <div class="card-info">
    <div class="card-name">镇魔塔·层层斩将</div>
    <div class="card-desc">{{ tower.desc }}</div>
    <div class="card-cost">两日一期·每期三令·斩将得宝，层越高宝越珍</div>
  </div>
  <button class="card-btn" :disabled="!tower.has" @click="startTower">{{ tower.has ? "登塔" : "登塔令已尽" }}</button>
</div>
<div v-if="array" class="card">
  <div class="card-info">
    <div class="card-name">{{ array.name }}</div>
    <div class="card-desc">{{ array.desc }}</div>
    <div class="card-cost">{{ array.cost }}</div>
  </div>
  <button v-if="array.ok" class="card-btn" @click="startArray">闯阵</button>
</div>
<div v-if="noMaps" class="panel-note">暂无可游历之地。</div>
<template v-for="m in maps" :key="m.id">
  <!-- 口径对齐命令式版：同一张图内先出全部 Boss 卡，再出地图卡（含驻留/游历按钮），最后秘境注记。 -->
  <div v-for="b in m.bosses" :key="b.id" class="card">
    <img v-if="b.icon" :src="b.icon" alt="">
    <div class="card-info">
      <div class="card-name">{{ b.name }}</div>
      <div class="card-desc">{{ b.desc }}</div>
      <div class="card-cost">{{ b.cost }}</div>
      <div v-if="b.weak" class="card-cost" :style="{ color: '#d9a441' }">{{ b.weak }}</div>
    </div>
    <button class="card-btn" :disabled="b.disabled" @click="fightBoss(b.id)">斗法</button>
  </div>
  <div class="card" :class="{ selected: m.selected }">
    <div class="card-info">
      <div class="card-name">{{ m.name }}</div>
      <div class="card-desc">{{ m.desc }}</div>
      <div class="card-cost">{{ m.cost }}</div>
    </div>
    <div class="card-btn-col">
      <button v-if="!m.selected" class="card-btn" @click="selectMap(m.id)">驻留此地</button>
      <button v-if="m.action" class="card-btn" :disabled="m.action.disabled" @click="startAction(m.action.id)">{{ m.action.label }}</button>
    </div>
  </div>
  <template v-if="m.exploreNote">
    <div class="panel-note">{{ m.exploreNote }}</div>
    <div v-for="p in m.exploredPoints" :key="p.id" class="card selected">
      <div class="card-info">
        <div class="card-name">{{ p.name }}</div>
        <div class="card-desc">{{ p.flavor }}</div>
      </div>
    </div>
  </template>
</template>
`,
};

window.PANEL_VUE_UNITS = window.PANEL_VUE_UNITS || {};
window.PANEL_VUE_UNITS.map = { title: "游历", component: MapPanelVue };
