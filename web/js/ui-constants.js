/* 封神修道录 · UI 常量与路径映射 */

"use strict";

const ICON_PATHS = {
  daoxing: "assets/resources/resource_daoxing.png",
  mana: "assets/resources/resource_mana.png",
  merit: "assets/resources/resource_merit.png",
  calamity: "assets/resources/resource_calamity.png",
  spell_page: "assets/resources/resource_spell_page.png",
  artifact_shard: "assets/resources/resource_treasure_shard.png",
  treasure_shard: "assets/resources/resource_treasure_shard.png",
  refine_material: "assets/resources/resource_refine_material.png",
};

const BACKGROUND_PATHS = {
  mountain_cave: "assets/backgrounds/bg_mountain_cave.png",
  chentang_far: "assets/backgrounds/bg_chentang_pass.png",
  kulou_edge: "assets/backgrounds/bg_bone_mountain_edge.png",
};

const CHARACTER_PATHS = { 炼气士: "assets/characters/char_cultivator.png", 真人: "assets/characters/char_realman.png", 地仙: "assets/characters/char_earth_immortal.png" };
const SPELL_ICONS = { spell_thunder_01: "assets/spells/spell_palm_thunder.png", spell_fire_01: "assets/spells/spell_spirit_fire.png", spell_weapon_01: "assets/spells/spell_artifact_control.png" };

const TREASURE_ICONS = {
  treasure_001: "assets/treasures/treasure_lightwood_sword.png", treasure_002: "assets/treasures/treasure_spirit_gourd.png",
  treasure_003: "assets/treasures/treasure_xuanhuang_protective_talisman.png", treasure_004: "assets/treasures/treasure_subduing_demon_bell.png",
  treasure_005: "assets/treasures/treasure_windfire_meditation_mat.png", treasure_006: "assets/treasures/treasure_bronze_soul_mirror.png",
  treasure_007: "assets/treasures/treasure_gold_light_seal.png", treasure_008: "assets/treasures/treasure_calm_jade_pendant.png",
  treasure_009: "assets/treasures/treasure_subduing_demon_bell.png",
};

const MAP_ACTION = { map_001: "wild_travel", map_002: "chentang_patrol", map_003: "kulou_explore" };

const NAV_UNLOCK = {
  realm: { check: () => true },
  map: { check: (s) => UnlockManager.isUnlocked(s, "travel"), hint: "炼气士三重解锁游历" },
  spell: { check: (s) => UnlockManager.isUnlocked(s, "spell_system"), hint: "炼气士四重解锁术法" },
  treasure: { check: (s) => UnlockManager.isUnlocked(s, "treasure_system") || int(s.treasures?.treasure_009?.level) > 0, hint: "真人一重解锁法宝" },
  chance: { check: (s) => UnlockManager.isUnlocked(s, "event_system") || !!s.pending_event_id, hint: "炼气士六重解锁机缘" },
  log: { check: () => true },
};

const INSIGHT_LINES = {
  generic: ["灵气如丝，缓缓入体。", "呼吸渐深，心湖无波。", "远处山风掠过洞府，松涛低回。", "丹田微暖，道行又深一分。", "杂念沉底，神识渐渐清明。", "周天流转，气机在经脉中低鸣。"],
  short_meditation: ["你的呼吸渐渐与山息合一。", "识海深处，似有一点微光明灭。", "洞外虫鸣忽远忽近，你充耳不闻。"],
  wild_travel: ["黑雾在林间游走，你按剑缓行。", "残符的气息从荒庙方向飘来。", "几声妖啸自山坳传出，又归于寂静。"],
  chentang_patrol: ["潮雾深处雷声滚动，海风带着腥咸。", "巡海妖兵的残影在浪尖一闪而没。", "陈塘关的灯火在雨幕中明明灭灭。"],
  kulou_explore: ["白骨阴火在山道两侧幽幽而燃。", "地脉深处传来极缓的搏动声。", "阴云低垂，照魂碎玉在土中微光闪烁。"],
};

const SPARKLE_TYPES = [
  { type: "daoxing", weight: 55, cls: "", name: "道行灵光" },
  { type: "mana", weight: 30, cls: "mana", name: "法力灵光" },
  { type: "tianji", weight: 15, cls: "tianji", name: "天机灵光" },
];

const ELEMENT_COLORS = { thunder: "#6fb7ff", fire: "#ff9c5b", weapon: "#e8c96a", charm: "#9fb4a8", treasure: "#c89aff", merit: "#ffd97a", calamity: "#ff6b6b" };
const STATUS_LABELS = { burn: (v) => `燃烧${v}`, weak: (v) => `虚弱${v}`, vuln: (v) => `易伤${v}`, mark: (v) => `雷殛${v}`, shield: (v) => `圣盾${v}` };
