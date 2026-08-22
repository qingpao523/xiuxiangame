/* 封神修道录 · UI 常量与路径映射 */

"use strict";

const ICON_PATHS = {
  daoxing: "assets/resources/resource_daoxing.jpg",
  mana: "assets/resources/resource_mana.jpg",
  merit: "assets/resources/resource_merit.jpg",
  calamity: "assets/resources/resource_calamity.jpg",
  spell_page: "assets/resources/resource_spell_page.jpg",
  artifact_shard: "assets/resources/resource_treasure_shard.jpg",
  treasure_shard: "assets/resources/resource_treasure_shard.jpg",
  refine_material: "assets/resources/resource_refine_material.jpg",
};

// 背景：每个境界阶段(background_phase)映射到一张底图，无专属美术的阶段回退到相近场景
const BACKGROUND_PATHS = {
  mountain_cave: "assets/backgrounds/bg_mountain_cave.jpg",       // 炼气士·山野洞府
  chentang_far: "assets/backgrounds/bg_chentang_pass.jpg",        // 真人·陈塘关
  kulou_edge: "assets/backgrounds/bg_bone_mountain_edge.jpg",     // 地仙·骷髅山
  xichi_far: "assets/backgrounds/bg_xiqi_field.jpg",              // 天仙·西岐战场
  shijue_far: "assets/backgrounds/bg_xiqi_field.jpg",             // 十绝阵外围（回退战场）
  wanxian_far: "assets/backgrounds/bg_xiqi_field.jpg",            // 万仙阵外围（回退战场）
  huanghe_far: "assets/backgrounds/bg_bone_mountain_edge.jpg",    // 九曲黄河残域（回退暗色）
  fengsheng_far: "assets/backgrounds/bg_fengshen_platform.jpg",   // 封神台
  duobao_far: "assets/backgrounds/bg_fengshen_platform.jpg",      // 多宝道人（回封神台）
  hunyuan_daochang: "assets/backgrounds/bg_hunyuan_field.jpg",    // 混元道场
};

const CHARACTER_PATHS = {
  炼气士: "assets/characters/char_cultivator.jpg",
  真人: "assets/characters/char_realman.jpg",
  地仙: "assets/characters/char_earth_immortal.jpg",
};

// 术法图标：四阶/五阶神通暂无专属图，回退到本系最高阶图标
const SPELL_ICONS = {
  spell_thunder_01: "assets/spells/spell_palm_thunder.jpg",
  spell_thunder_02: "assets/spells/spell_thunder_02.jpg",
  spell_thunder_03: "assets/spells/spell_thunder_03.jpg",
  spell_thunder_04: "assets/spells/spell_thunder_03.jpg",
  spell_thunder_05: "assets/spells/spell_thunder_03.jpg",
  spell_fire_01: "assets/spells/spell_spirit_fire.jpg",
  spell_fire_02: "assets/spells/spell_fire_02.jpg",
  spell_fire_03: "assets/spells/spell_fire_03.jpg",
  spell_fire_04: "assets/spells/spell_fire_04.jpg",
  spell_fire_05: "assets/spells/spell_fire_04.jpg",
  spell_fire_shenhuozhao_legacy: "assets/spells/spell_fire_04.jpg",
  spell_weapon_01: "assets/spells/spell_artifact_control.jpg",
  spell_weapon_02: "assets/spells/spell_weapon_02.jpg",
  spell_weapon_03: "assets/spells/spell_weapon_03.jpg",
  spell_weapon_04: "assets/spells/spell_weapon_03.jpg",
  spell_weapon_05: "assets/spells/spell_weapon_03.jpg",
  spell_soul_01: "assets/spells/spell_soul_01.jpg",
  spell_soul_02: "assets/spells/spell_soul_02.jpg",
  spell_soul_03: "assets/spells/spell_soul_03.jpg",
  spell_soul_04: "assets/spells/spell_soul_03.jpg",
  spell_soul_05: "assets/spells/spell_soul_03.jpg",
  spell_calamity_01: "assets/spells/spell_calamity_01.jpg",
  spell_calamity_02: "assets/spells/spell_calamity_02.jpg",
  spell_calamity_04: "assets/spells/spell_calamity_02.jpg",
  spell_calamity_05: "assets/spells/spell_calamity_02.jpg",
  spell_earth_01: "assets/spells/spell_earth_01.jpg",
  spell_water_01: "assets/spells/spell_water_01.jpg",
  spell_sword_01: "assets/spells/spell_sword_01.jpg",
};

// 法宝图标：残影/影系列回退到本体或相近法宝
const TREASURE_ICONS = {
  treasure_001: "assets/treasures/treasure_lightwood_sword.jpg",
  treasure_002: "assets/treasures/treasure_spirit_gourd.jpg",
  treasure_003: "assets/treasures/treasure_xuanhuang_protective_talisman.jpg",
  treasure_004: "assets/treasures/treasure_subduing_demon_bell.jpg",
  treasure_005: "assets/treasures/treasure_windfire_meditation_mat.jpg",
  treasure_006: "assets/treasures/treasure_bronze_soul_mirror.jpg",
  treasure_007: "assets/treasures/treasure_gold_light_seal.jpg",
  treasure_008: "assets/treasures/treasure_calm_jade_pendant.jpg",
  treasure_009: "assets/treasures/treasure_seven_treasure_tree.jpg",
  treasure_010: "assets/treasures/treasure_qiankun_ring.jpg",
  treasure_011: "assets/treasures/treasure_huntian_sash.jpg",
  treasure_012: "assets/treasures/treasure_windfire_wheels.jpg",
  treasure_013: "assets/treasures/treasure_xiantian_sword.jpg",
  treasure_014: "assets/treasures/treasure_wuse_stone.jpg",
  treasure_015: "assets/treasures/treasure_seven_treasure_tree.jpg",
  treasure_016: "assets/treasures/treasure_golden_dragon_scissors.jpg",
  treasure_017: "assets/treasures/treasure_dragon_soul_whip.jpg",
  treasure_018: "assets/treasures/treasure_xuanyuan_mirror.jpg",
  treasure_019: "assets/treasures/icon_treasure_019.png",
  treasure_020: "assets/treasures/treasure_huntian_sash.jpg",
  treasure_021: "assets/treasures/icon_treasure_021.png",
  treasure_022: "assets/treasures/treasure_xuanyuan_mirror.jpg",
  treasure_023: "assets/treasures/icon_treasure_019.png",
  treasure_024: "assets/treasures/treasure_wuse_stone.jpg",
  treasure_025: "assets/treasures/treasure_golden_dragon_scissors.jpg",
  treasure_026: "assets/treasures/treasure_spirit_gourd.jpg",
  treasure_027: "assets/treasures/icon_treasure_027.png",
  treasure_028: "assets/treasures/icon_treasure_021.png",
  treasure_029: "assets/treasures/treasure_xuanyuan_mirror.jpg",
  treasure_030: "assets/treasures/icon_treasure_030.png",
};

// Boss 立绘（暂无专属图的 Boss 不显示立绘）
const BOSS_ICONS = {
  boss_001: "assets/bosses/boss_001_shanye_yaoshou.png",
  boss_005: "assets/bosses/boss_005_donghai_longbing.png",
  boss_014: "assets/bosses/boss_014_baijian.png",
  boss_015: "assets/bosses/boss_015_tongtian_canying.png",
  boss_017: "assets/bosses/boss_017_nuwa_canying.png",
  boss_018: "assets/bosses/boss_018_laojun_canying.png",
};

// 封神人物立绘（道友结缘卡）
const NPC_ICONS = {
  nezha: "assets/characters/npc_nezha.png",
  yangjian: "assets/characters/npc_yangjian.png",
  ziya: "assets/characters/npc_ziya.png",
  tongtian: "assets/characters/npc_tongtian.png",
};

// 山河图地点图标（design/9.2 风格锁 v2 新美术，key=map_id；缺失时 world-map.js 回退文字 glyph）
const MAP_NODE_ICONS = {
  map_001: "assets/map/nodes/icon_map_001.png",
  map_002: "assets/map/nodes/icon_map_002.png",
  map_003: "assets/map/nodes/icon_map_003.png",
  map_004: "assets/map/nodes/icon_map_004.png",
  map_005: "assets/map/nodes/icon_map_005.png",
  map_006: "assets/map/nodes/icon_map_006.png",
  map_007: "assets/map/nodes/icon_map_007.png",
  map_008: "assets/map/nodes/icon_map_008.png",
  map_009: "assets/map/nodes/icon_map_009.png",
};

// 雾中地标剪影图标（key=FLAVOR_LANDMARKS id；lm_cave 为常驻洞府，全彩）
const LANDMARK_ICONS = {
  lm_chaoge: "assets/map/landmarks/lm_chaoge.png",
  lm_qingqiu: "assets/map/landmarks/lm_qingqiu.png",
  lm_muye: "assets/map/landmarks/lm_muye.png",
  lm_yuxu: "assets/map/landmarks/lm_yuxu.png",
  lm_lingshan: "assets/map/landmarks/lm_lingshan.png",
  lm_yinglong: "assets/map/landmarks/lm_yinglong.png",
  lm_huaguo: "assets/map/landmarks/lm_huaguo.png",
  lm_zhulong: "assets/map/landmarks/lm_zhulong.png",
  lm_jingwei: "assets/map/landmarks/lm_jingwei.png",
  lm_yaozu: "assets/map/landmarks/lm_yaozu.png",
  lm_cave: "assets/map/landmarks/lm_cave.png",
};

const MAP_ACTION = { map_001: "wild_travel", map_002: "chentang_patrol", map_003: "kulou_explore", map_004: "xiqi_patrol", map_005: "shijue_probe", map_006: "huanghe_wade", map_007: "wanxian_walk", map_008: "fengshen_climb", map_009: "hunyuan_contemplate" };

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
  xiqi_patrol: ["旌旗蔽日，两军阵脚在远处缓缓移动。", "功德金光与劫气黑雾在战场上空交缠。", "你压低气息，沿战场外围拾取遗落的气机。"],
  shijue_probe: ["脚下阵纹忽明忽暗，似在试探你的斤两。", "一缕剑意自虚空斩落，你侧身堪堪避过。", "劫气与阵旗残料散落在残阵眼之间。"],
  huanghe_wade: ["浊浪翻涌，体内法力被一丝丝削去。", "水底金光一闪，是混元金斗的残骸。", "削境之力最烈处，反藏着三霄遗落的机缘。"],
  wanxian_walk: ["虚空中无数道目光投来，万仙残影未散。", "阵旗如林，海雾里隐隐传来碧游宫的钟声。", "你以神识摄来漂浮的万仙遗宝，抽身而退。"],
  fengshen_climb: ["头顶榜文金光大盛，真灵被照得发烫。", "神位碎屑如金粉自九天飘落。", "柏鉴的旧影一闪而没，封神功德暗生。"],
  hunyuan_contemplate: ["无量清光入体，一身尘垢尽洗。", "此处榜文照不到，天庭管不到，唯你与道相对。", "道气氤氲，自成天地，逍遥之意自来。"],
};

const SPARKLE_TYPES = [
  { type: "daoxing", weight: 55, cls: "", name: "道行灵光" },
  { type: "mana", weight: 30, cls: "mana", name: "法力灵光" },
  { type: "tianji", weight: 15, cls: "tianji", name: "天机灵光" },
];

const ELEMENT_COLORS = { thunder: "#6fb7ff", fire: "#ff9c5b", weapon: "#e8c96a", charm: "#9fb4a8", treasure: "#c89aff", merit: "#ffd97a", calamity: "#ff6b6b" };
const STATUS_LABELS = { burn: (v) => `燃烧${v}`, weak: (v) => `虚弱${v}`, vuln: (v) => `易伤${v}`, mark: (v) => `雷殛${v}`, shield: (v) => `圣盾${v}` };
