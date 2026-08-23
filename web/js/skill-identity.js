"use strict";

// 术法/神通身份（共鸣扩展 §2.1 + skill_table advanced_names / shentong_name）
// 炼气·真人·地仙 = 术法（名随境改）；天仙/真仙 = 神通觉醒。
const SkillIdentity = {
  TIXI: [
    { id: "ti", title: "体", blurb: "肉身成道。雷法归体，与体系无互克。", types: ["body", "thunder"] },
    { id: "qi", title: "器", blurb: "器是法宝，本身无招式。五行只做器的二级，驱动共鸣。御器、火术是法术，不是器。", types: ["weapon", "fire"], treasures: true },
    { id: "hun", title: "魂", blurb: "元神摄魂，落魄夺魄。", types: ["soul"] },
    { id: "jie", title: "劫", blurb: "杀劫气运，趋吉避凶。", types: ["calamity"] },
  ],
  WUXING: { wood: "木", fire: "火", earth: "土", metal: "金", water: "水" },
  RARITY: { common: "凡", uncommon: "灵", rare: "玄" },

  major(state) {
    if (!state || typeof RealmManager === "undefined") return "炼气士";
    return String(RealmManager.getCurrentRealm(state).major_realm || "炼气士");
  },

  isShentong(state) {
    const m = this.major(state);
    return m === "天仙" || m === "真仙";
  },

  displayName(skill, state) {
    if (!skill) return "";
    if (skill.category === "treasure") return String(skill.name || skill.treasure_name || "");
    const names = skill.advanced_names || {};
    const major = this.major(state);
    if (major === "天仙" || major === "真仙") return String(skill.shentong_name || names["真仙_后续"] || skill.name || "");
    if (major === "地仙") return String(names["地仙"] || skill.name || "");
    if (major === "真人") return String(names["真人"] || skill.name || "");
    return String(skill.name || "");
  },

  skillClass(skill, state) {
    if (!skill) return "法术";
    if (skill.category === "treasure") return "法宝";
    return this.isShentong(state) ? "神通" : "法术";
  },

  tixiOf(spellType) {
    const e = String(spellType || "");
    if (e === "body" || e === "thunder") return "ti";
    if (e === "weapon" || e === "fire") return "qi";
    if (e === "soul") return "hun";
    if (e === "calamity") return "jie";
    return "";
  },
};
