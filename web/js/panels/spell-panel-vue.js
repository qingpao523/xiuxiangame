/* 封神修道录 · G3 面板迁 Vue：术法（design/19.0 A4-③）
 * 合同：逻辑零改（黄金快照钉死口径，与 spell-panel.js 命令式版本一致）；Game 不进组件（只读 props.state）；
 *       不给 .card 加全局副作用。事件回调在模块作用域调全局方法（与命令式版本相同）。
 * RARITY_LABEL/skillIcon 为本面板私有纯函数（与命令式版本同文逐字），组件内复用。
 * 兜底：Vue 不可用时 ui.js renderPanelBody 自动回落 window.PANEL_UNITS.spell。
 */

"use strict";

const SpellPanelVue = (() => {
  const RARITY_LABEL = { common: "凡", uncommon: "灵", rare: "玄" };
  function skillIcon(id, spellType) {
    if (SPELL_ICONS[id]) return SPELL_ICONS[id];
    const legacy = "spell_" + spellType + "_01";
    return SPELL_ICONS[legacy] || "";
  }

  return {
    props: { state: { type: Object, required: true } },
    setup(props) {
      const state = props.state;
      // 显示模型现算（与命令式 renderSpellPanel/renderSixiuSection 语义一致，每次 mount 全量重渲染）。
      const awoken = typeof SkillIdentity !== "undefined" && SkillIdentity.isShentong(state);
      const v2Desc = awoken
        ? "栏中已是神通。同体系相邻共鸣，三连触发终极。"
        : "配招后斗法全自动。体系=体/器/魂/劫（无互克）；五行只在器（法宝）上驱动共鸣。天仙后术法觉醒为神通。";
      const sixiuNote = awoken
        ? "天仙境开，斗法栏所书已是神通。器仍是法宝，无招式。"
        : "四修：体 / 器 / 魂 / 劫。练气至地仙只称术法；天仙后觉醒为神通。器=法宝，御器与火术是法术不是器。";
      const available = UnlockManager.getAvailableSkills(state);
      const unlocked = state.unlocked_skills || [];
      const groups = ((typeof SkillIdentity !== "undefined") ? SkillIdentity.TIXI : []).map((g) => {
        const sec = { title: g.title, blurb: g.blurb, treasures: [], noTreasureNote: false, spellNote: false, skills: [] };
        if (g.treasures) {
          const owned = UnlockManager.getAvailableTreasures(state).filter((t) => int((state.treasures[String(t.treasure_id)] || {}).level) > 0);
          sec.noTreasureNote = !owned.length;
          sec.treasures = owned.map((tr) => {
            const wx = (typeof SkillIdentity !== "undefined" && SkillIdentity.WUXING[tr.wuxing]) || "";
            return {
              icon: (typeof TREASURE_ICONS !== "undefined" && TREASURE_ICONS[tr.treasure_id]) || "",
              name: `${tr.treasure_name}　器·法宝${wx ? "｜五行" + wx : ""}`,
              desc: tr.origin_desc || tr.skill_desc || "法宝无招式，绑在斗法栏格上以成器势。",
            };
          });
        }
        const rows = available.filter((r) => g.types.includes(str(r.spell_type, "")));
        sec.spellNote = !!g.treasures && !!rows.length;
        sec.skills = rows.map((skill) => {
          const id = String(skill.id);
          const isUnlocked = unlocked.includes(id);
          const level = Math.max(isUnlocked ? 1 : 0, Game.getSkillLevel(id));
          const maxLevel = Game.getSkillMaxLevel(skill);
          const nextLevel = level + 1;
          const cost = isUnlocked && nextLevel <= maxLevel ? Game.getSkillUpgradeCost(skill, nextLevel) : null;
          const shown = (typeof SkillIdentity !== "undefined") ? SkillIdentity.displayName(skill, state) : skill.name;
          const klass = (typeof SkillIdentity !== "undefined") ? SkillIdentity.skillClass(skill, state) : "法术";
          const lv = Math.max(1, level);
          let dmgLine = "威力 " + (num(skill.damage_base) + num(skill.damage_growth) * (lv - 1)) + "（每重+" + num(skill.damage_growth) + "）";
          if (!awoken && skill.shentong_name) dmgLine += "　天仙觉醒：" + skill.shentong_name;
          return {
            id,
            selected: level > 0,
            icon: skillIcon(id, str(skill.spell_type, "")),
            name: shown + " ·" + klass + " " + (RARITY_LABEL[str(skill.rarity, "common")] || "") + " " + (level > 0 ? level + "重" : "未悟"),
            desc: (skill.lore_text || "") + (skill.source_chapter ? "（" + skill.source_chapter + "）" : ""),
            dmgLine,
            costLine: !isUnlocked ? "未至参悟境界" : (cost ? "升至" + nextLevel + "重：残页 " + formatInt(cost.spell_page_cost) + "｜法力 " + formatInt(cost.mana_cost) : "已至圆满"),
            disabled: !cost || num(state.resources.spell_page) < num(cost.spell_page_cost) || num(state.resources.mana) < num(cost.mana_cost),
          };
        });
        return sec;
      });
      const openSlotConfig = () => { closePanelSheet(); Game.openSlotConfig(); drainPopupQueue(); };
      const upgrade = (id) => { Game.upgradeSkill(id); renderPanelBody("spell"); };
      return { awoken, v2Desc, sixiuNote, groups, openSlotConfig, upgrade };
    },
    template: `
<div class="card v2-entry">
  <div class="card-info">
    <div class="card-name">斗法栏·连锁制</div>
    <div class="card-desc">{{ v2Desc }}</div>
  </div>
  <button class="card-btn" @click="openSlotConfig">配置斗法栏</button>
</div>
<div class="panel-note">{{ sixiuNote }}</div>
<template v-for="g in groups" :key="g.title">
  <div class="card-name v2-skill-header">{{ "【" + g.title + "修】" }}</div>
  <div class="panel-note">{{ g.blurb }}</div>
  <div v-if="g.noTreasureNote" class="panel-note">尚未炼化法宝。器修的五行，在法宝上，不在招式上。</div>
  <div v-for="(tr, ti) in g.treasures" :key="'t' + ti" class="card selected">
    <img v-if="tr.icon" :src="tr.icon" alt="">
    <div class="card-info">
      <div class="card-name">{{ tr.name }}</div>
      <div class="card-desc">{{ tr.desc }}</div>
    </div>
  </div>
  <div v-if="g.spellNote" class="panel-note">以下是术法（御器、火象），不是器。</div>
  <div v-for="s in g.skills" :key="s.id" class="card" :class="{ selected: s.selected }">
    <img v-if="s.icon" :src="s.icon" alt="">
    <div class="card-info">
      <div class="card-name">{{ s.name }}</div>
      <div class="card-desc">{{ s.desc }}</div>
      <div class="card-cost">{{ s.dmgLine }}</div>
      <div class="card-cost">{{ s.costLine }}</div>
    </div>
    <button class="card-btn" :disabled="s.disabled" @click="upgrade(s.id)">升重</button>
  </div>
</template>
`,
  };
})();

window.PANEL_VUE_UNITS = window.PANEL_VUE_UNITS || {};
window.PANEL_VUE_UNITS.spell = { title: "术法", component: SpellPanelVue };
