/* 封神修道录 · G3 面板迁 Vue：洞府（design/19.0 A4-③）
 * 合同：逻辑零改（黄金快照钉死口径，与 log-panel.js 命令式版本一致）；Game 不进组件（只读 props.state）；
 *       不给 .card 加全局副作用。事件回调在模块作用域调全局方法（与命令式版本相同）。
 * 势力完整系统（design/7.2）renderFactionSystem + 其 4 子系统（阐教炼器/截教阵法/天庭榜文/五庄宴）
 * 依赖链过深，重写违背逻辑零改——onMounted 时复用全局命令式 renderFactionSystem 挂到 #faction-system-slot，
 * 位置对齐命令式版本（势力卡/师门任务之后、道友区之前）。雾中因果卡行内 opacity 用 :style 逐字保留。
 * 兜底：Vue 不可用时 ui.js renderPanelBody 自动回落 window.PANEL_UNITS.log。
 */

"use strict";

const LogPanelVue = {
  props: { state: { type: Object, required: true } },
  setup(props) {
    const { onMounted } = Vue;
    const state = props.state;
    // 显示模型现算（与命令式 renderLogPanel 语义一致，每次 mount 全量重渲染）。
    const dayLine = `入道第 ${UnlockManager.currentDay(state)} 天`;
    // P2 网状叙事·洞府手札：当前卷的因果线（可循/已经历/雾中），非任务清单
    const journal = GoalManager.getChapterThreads(state);
    const jm = { has: !!journal.chapter, headLine: "", open: [], done: [], fog: [] };
    if (journal.chapter) {
      jm.open = journal.list.filter((t) => t.status === "open").map((t) => ({ name: `可循·${t.goal.goal_name}`, hint: t.hint || "" }));
      jm.done = journal.list.filter((t) => t.status === "done").map((t) => ({ name: `✓ ${t.goal.goal_name}`, hint: t.hint || "" }));
      jm.fog = journal.list.filter((t) => t.status === "fog").map((t) => ({ name: "雾中因果", hint: t.hint || "" }));
      jm.headLine = `${journal.chapterName} · 手札：可循 ${jm.open.length} 线｜已经历 ${jm.done.length}｜雾中 ${jm.fog.length}`;
    }
    // 势力
    const faction = getFactionRow(state);
    const hasFaction = !!Object.keys(faction).length;
    const factionCard = hasFaction ? {
      glyph: faction.glyph || "门", name: `${faction.faction_name}（${faction.dojo}）`,
      desc: faction.card_desc || "", passive: `护持·${faction.passive_name}：${faction.passive_desc}`,
    } : null;
    let task = null;
    if (hasFaction) {
      const t = DataManager.getById("action_table", String(faction.task_action_id || ""));
      if (Object.keys(t).length) {
        const remain = ActionManager.remainingToday(state, t);
        const avail = ActionManager.getAvailability(state, t);
        task = {
          id: String(t.action_id), name: `师门任务：${t.action_name}（${t.duration_sec}息）`,
          desc: t.description || "", cost: remain >= 0 ? `今日剩余 ${remain} 次` : "不限次",
          label: avail.ok ? "前往" : avail.reason, disabled: !avail.ok,
        };
      }
    }
    const cappedNoFaction = !hasFaction && RealmManager.isCapped(state);
    // 势力系统插槽：有势力即渲染（对齐命令式版本——renderFactionSystem 在 faction 分支内、task 判断外）
    const showFactionSystem = hasFaction;
    // 道友区（P1 阵容：上场位管理，最多 3 位）
    const companions = state.companions || {};
    const bonded = Object.keys(companions).filter((id) => companions[id].bonded);
    const lineup = Array.isArray(state.lineup) ? state.lineup : [];
    const companionCards = bonded.map((cid) => {
      const row = DataManager.getById("companion_table", cid);
      if (!Object.keys(row).length) return null;
      const on = lineup.includes(cid);
      const cardName = CARD_DEFS[String(row.bond_card)]?.name || row.bond_card || "";
      return {
        id: cid, selected: on,
        icon: NPC_ICONS[cid] || "", glyph: row.glyph || "友",
        name: `${row.name || cid}${on ? " ★上场" : ""}`,
        desc: row.bond_passive_desc || "", cardLine: `专属斗法牌：${cardName}`,
        btnLabel: on ? "撤下" : "上场",
      };
    }).filter(Boolean);
    const companionNote = bonded.length ? `道友阵容（上场 ${lineup.length}/3）：上场道友的「结缘护持」实时生效——收灵材带哪吒，杀阵破阵带姜子牙，闭关修行带杨戬。` : "";
    // 丹房区（rq_07 解锁）—— P1 生活技艺：炼丹控火候 / 画符蓄力 / 占卜
    const alchemyUnlocked = Game.isAlchemyUnlocked();
    const craftBoost = alchemyUnlocked ? Game.hasDivinationBoost("craft_boost") : false;
    const alchemyNote = alchemyUnlocked ? "丹房：炉火常明。炼丹画符皆看火候——光标行至中段停手得上品，偏外则中品、下品。" + (craftBoost ? "（今日占卜得签，火候易得。）" : "") : "";
    const pillCards = alchemyUnlocked ? PILL_DEFS.map((def) => ({
      id: def.id, name: `${def.name}——${def.desc}`,
      cost: `耗：${Object.keys(def.cost).map((rid) => { const rn = DataManager.getById("resource_table", rid).resource_name || rid; return `${rn} ${formatInt(def.cost[rid])}`; }).join("，")}｜${def.effectText(Game.state)}`,
      disabled: !Object.keys(def.cost).every((rid) => num(Game.state.resources[rid]) >= num(def.cost[rid])),
    })) : [];
    const talismans = alchemyUnlocked ? (Game.state.talismans || []) : [];
    const tCount = (t) => talismans.filter((x) => x.type === t).length;
    const talismanNote = alchemyUnlocked ? `画符（朱砂 3｜法力 2000）：符成可带入斗法，打出即焚。现有 火符 ${tCount("fire")}｜雷符 ${tCount("thunder")}｜护身符 ${tCount("guard")}。` : "";
    const talismanCards = alchemyUnlocked ? [
      { type: "fire", name: "火符", desc: "火伤 + 燃烧" },
      { type: "thunder", name: "雷符", desc: "雷伤 + 雷殛标记" },
      { type: "guard", name: "护身符", desc: "罡气 + 圣盾" },
    ].map((tt) => ({
      type: tt.type, name: `${tt.name}——${tt.desc}`,
      disabled: !(num(Game.state.resources.spell_page) >= 3 && num(Game.state.resources.mana) >= 2000),
    })) : [];
    const div = alchemyUnlocked ? (Game.state.divination || {}) : {};
    const divined = alchemyUnlocked && str(div.last_day, "") === todayString();
    const divCard = alchemyUnlocked ? {
      sub: divined ? "今日已占。天机不可屡窥，明日再来。" : "求一签，看看明日气运。", disabled: divined,
    } : null;
    // 历世录
    const rb = state.rebirth || {};
    const rebirth = int(rb.count) > 0 ? { head: `历世录（${rb.count} 世）：`, log: rb.log || [] } : null;
    const logsEmpty = !state.logs.length;
    onMounted(() => {
      // 势力完整系统（design/7.2）：复用命令式 renderFactionSystem 挂到插槽（位置对齐命令式版本）。
      if (showFactionSystem) {
        const slot = document.getElementById("faction-system-slot");
        if (slot) renderFactionSystem(slot, state);
      }
    });
    const pickFaction = () => { closePanelSheet(); Game._maybeQueueFactionChoice(); drainPopupQueue(); };
    const startTask = (id) => { closePanelSheet(); Game.startAction(id); };
    const toggleLineup = (cid) => { const r = Game.toggleLineup(cid); if (!r.ok && r.reason) Game.toast("阵容", r.reason); renderPanelBody("log"); };
    const brewPill = (id) => { CraftMinigame.open({ title: `炼丹·${(PILL_DEFS.find((d) => d.id === id) || {}).name}`, prompt: "看准火候，停在中段得上品", boost: craftBoost }, (quality) => { Game.brewPillWithQuality(id, quality); renderPanelBody("log"); }); };
    const drawTalisman = (type, name) => { CraftMinigame.open({ title: `画符·${name}`, prompt: "笔走龙蛇，蓄力停在中段得上品", boost: craftBoost }, (quality) => { Game.drawTalisman(type, quality); renderPanelBody("log"); }); };
    const divine = () => { Game.divine(); renderPanelBody("log"); };
    const resetSave = () => { if (confirm("确定要重入轮回？当前修行进度将全部清空。")) { closePanelSheet(); Game.resetSave(); } };
    return {
      dayLine, jm, hasFaction, factionCard, task, cappedNoFaction, showFactionSystem,
      companionNote, companionCards, alchemyUnlocked, alchemyNote, pillCards, talismanNote, talismanCards, divCard,
      rebirth, logsEmpty, logs: state.logs,
      pickFaction, startTask, toggleLineup, brewPill, drawTalisman, divine, resetSave,
    };
  },
  template: `
<div class="panel-note">{{ dayLine }}</div>
<template v-if="jm.has">
  <div class="panel-note">{{ jm.headLine }}</div>
  <div v-for="(t, i) in jm.open" :key="'o' + i" class="card"><div class="card-info"><div class="card-name">{{ t.name }}</div><div class="card-desc">{{ t.hint }}</div></div></div>
  <div v-for="(t, i) in jm.done" :key="'d' + i" class="card selected"><div class="card-info"><div class="card-name">{{ t.name }}</div><div class="card-desc">{{ t.hint }}</div></div></div>
  <div v-for="(t, i) in jm.fog" :key="'f' + i" class="card" :style="{ opacity: '0.6' }"><div class="card-info"><div class="card-name">{{ t.name }}</div><div class="card-desc">{{ t.hint }}</div></div></div>
</template>
<template v-if="hasFaction">
  <div class="card selected">
    <span class="choice-glyph">{{ factionCard.glyph }}</span>
    <div class="card-info"><div class="card-name">{{ factionCard.name }}</div><div class="card-desc">{{ factionCard.desc }}</div><div class="card-cost">{{ factionCard.passive }}</div></div>
  </div>
  <div v-if="task" class="card">
    <div class="card-info"><div class="card-name">{{ task.name }}</div><div class="card-desc">{{ task.desc }}</div><div class="card-cost">{{ task.cost }}</div></div>
    <button class="card-btn" :disabled="task.disabled" @click="startTask(task.id)">{{ task.label }}</button>
  </div>
  <div id="faction-system-slot"></div>
</template>
<template v-else-if="cappedNoFaction">
  <div class="panel-note">地仙之后无散修。你已立身天仙之境，尚未择势力入局。</div>
  <button class="popup-btn" @click="pickFaction">择势力入局</button>
</template>
<template v-if="companionCards.length">
  <div class="panel-note">{{ companionNote }}</div>
  <div v-for="c in companionCards" :key="c.id" class="card" :class="{ selected: c.selected }">
    <img v-if="c.icon" class="npc-portrait" :src="c.icon" alt="">
    <span v-else class="choice-glyph">{{ c.glyph }}</span>
    <div class="card-info"><div class="card-name">{{ c.name }}</div><div class="card-desc">{{ c.desc }}</div><div class="card-cost">{{ c.cardLine }}</div></div>
    <button class="card-btn" @click="toggleLineup(c.id)">{{ c.btnLabel }}</button>
  </div>
</template>
<template v-if="alchemyUnlocked">
  <div class="panel-note">{{ alchemyNote }}</div>
  <div v-for="p in pillCards" :key="p.id" class="card">
    <div class="card-info"><div class="card-name">{{ p.name }}</div><div class="card-cost">{{ p.cost }}</div></div>
    <button class="card-btn" :disabled="p.disabled" @click="brewPill(p.id)">开炉</button>
  </div>
  <div class="panel-note">{{ talismanNote }}</div>
  <div v-for="t in talismanCards" :key="t.type" class="card">
    <div class="card-info"><div class="card-name">{{ t.name }}</div><div class="card-cost">上品得 2 枚（lv3）｜中品 1 枚（lv2）｜下品 1 枚（lv1）</div></div>
    <button class="card-btn" :disabled="t.disabled" @click="drawTalisman(t.type, t.name.split('——')[0])">画</button>
  </div>
  <div class="panel-note">占卜：焚香摇签，每日一签。签文给的是线索，不是数字——信则灵。</div>
  <div class="card">
    <div class="card-info"><div class="card-name">焚香占卜</div><div class="card-desc">{{ divCard.sub }}</div></div>
    <button class="card-btn" :disabled="divCard.disabled" @click="divine">摇签</button>
  </div>
</template>
<template v-if="rebirth">
  <div class="panel-note">{{ rebirth.head }}</div>
  <div v-for="(line, i) in rebirth.log" :key="'r' + i" class="log-line">{{ line }}</div>
</template>
<div v-if="logsEmpty" class="panel-note">修行日志空空如也。</div>
<div v-for="(line, i) in logs" :key="'l' + i" class="log-line">{{ line }}</div>
<button class="popup-btn secondary" @click="resetSave">重入轮回（清空存档）</button>
`,
};

window.PANEL_VUE_UNITS = window.PANEL_VUE_UNITS || {};
window.PANEL_VUE_UNITS.log = { title: "洞府", component: LogPanelVue };
