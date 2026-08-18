"use strict";

const ID_FIELDS = {
  realm_table: "realm_id",
  resource_table: "resource_id",
  map_table: "map_id",
  spell_table: "spell_id",
  treasure_table: "treasure_id",
  event_table: "event_id",
  breakthrough_table: "breakthrough_id",
  boss_table: "boss_id",
  unlock_table: "unlock_id",
  action_table: "action_id",
  chapter_goal_table: "goal_id",
  encounter_table: "encounter_id",
  race_table: "race_id",
  faction_table: "faction_id",
  array_table: "array_id",
  companion_table: "companion_id",
};

const REALM_NAME_TO_ID = {
  开局: "open",
  炼气士四重: "rq_04",
  炼气士七重: "rq_07",
  真人一重: "zr_01",
  真人五重: "zr_05",
  地仙一重: "dx_01",
};

const PHASE_TIERS = [
  { maxMinor: 3, label: "前期", qiMult: 1 },
  { maxMinor: 6, label: "中期", qiMult: 1.5 },
  { maxMinor: 9, label: "后期", qiMult: 2 },
  { maxMinor: 99, label: "圆满", qiMult: 2.5 },
];

const CARD_DEFS = {
  spell_thunder_01: { name: "掌心雷", kind: "attack", element: "thunder", target: "enemy", text: (lv, m = 1) => `${(8 + 4 * lv) * m} 雷伤，附加雷殛标记` },
  spell_fire_01: { name: "灵火术", kind: "attack", element: "fire", target: "enemy", text: (lv, m = 1) => `${(5 + 2 * lv) * m} 伤害，燃烧 ${(3 + lv) * m}` },
  spell_weapon_01: { name: "御器术", kind: "attack_all", element: "weapon", target: "none", text: (lv, m = 1) => `全体 ${(4 + lv) * m} 伤害，罡气 +${(6 + 2 * lv) * m}` },
  charm_strike: { name: "符咒·镇妖", kind: "attack", element: "charm", target: "enemy", text: (lv, m = 1) => `${6 * lv * m} 伤害` },
  charm_guard: { name: "符咒·护体", kind: "defend", element: "charm", target: "none", text: (lv, m = 1) => `罡气 +${(6 + 2 * lv) * m}` },
  charm_focus: { name: "符咒·凝神", kind: "skill", element: "charm", target: "none", text: () => "真气 +2" },
  treasure_skill: { name: "法宝技", kind: "treasure", element: "treasure", target: "enemy", text: () => "依本命法宝而定，每战 1 次" },
  merit_gold: {
    name: "功德金光",
    kind: "attack",
    element: "merit",
    target: "enemy",
    cost: { resource: "merit", amount: 50 },
    text: (lv, m = 1, s) => `耗 50 功德：${(10 + Math.floor(num(s?.resources?.merit) / 100)) * m} 伤害，净化虚弱`,
  },
  calamity_edge: {
    name: "劫气纵横",
    kind: "attack",
    element: "calamity",
    target: "enemy",
    text: (lv, m = 1, s) => `引劫入体：${(12 + Math.floor(num(s?.resources?.calamity) / 100)) * m} 伤害，自损 5%，劫气 +30`,
  },
  nezha_spear: { name: "火尖枪", kind: "attack", element: "fire", target: "enemy", text: (lv, m = 1) => `${(14 + 4 * lv) * m} 伤害，燃烧 ${(4 + lv) * m}` },
  yangjian_blade: { name: "三尖两刃", kind: "attack_all", element: "weapon", target: "none", text: (lv, m = 1) => `全体 ${(8 + 2 * lv) * m} 伤害` },
  ziya_whip: { name: "打神鞭", kind: "attack", element: "merit", target: "enemy", text: (lv, m = 1) => `${(12 + 3 * lv) * m} 伤害，对榜文与阵法残影威力 +50%` },
  // --- P0.5 新增术法卡 ---
  spell_thunder_02: { name: "五雷术", kind: "attack", element: "thunder", target: "enemy", text: (lv, m = 1) => `${(12 + 5 * lv) * m} 雷伤，标记≥3 引爆 +${8 * m}` },
  spell_thunder_03: { name: "雷部敕令", kind: "attack", element: "thunder", target: "enemy", text: (lv, m = 1) => `${(16 + 6 * lv) * m} 雷伤，眩晕 1 回合` },
  spell_fire_02: { name: "赤火术", kind: "attack", element: "fire", target: "enemy", text: (lv, m = 1) => `${(8 + 3 * lv) * m} 伤害，燃烧 ${(5 + lv) * m}，扩散 +2` },
  spell_fire_03: { name: "三昧真火", kind: "attack", element: "fire", target: "enemy", text: (lv, m = 1) => `${(12 + 4 * lv) * m} 伤害，燃烧 ${(8 + lv) * m}（不可净化）` },
  spell_weapon_02: { name: "御剑术", kind: "attack", element: "weapon", target: "enemy", text: (lv, m = 1) => `${(10 + 4 * lv) * m} 伤害，破罡 30%` },
  spell_weapon_03: { name: "斩妖剑气", kind: "attack", element: "weapon", target: "enemy", text: (lv, m = 1) => `${(16 + 5 * lv) * m} 伤害，克妖 +40%，破阵 +20%` },
  spell_soul_01: { name: "摄魂咒", kind: "attack", element: "soul", target: "enemy", text: (lv, m = 1) => `${(6 + 2 * lv) * m} 真伤（无视罡气），虚弱 1 回合` },
  spell_soul_02: { name: "落魂术", kind: "attack", element: "soul", target: "enemy", text: (lv, m = 1) => `${(10 + 3 * lv) * m} 真伤，敌攻 -15% 持续 2 回合` },
  spell_calamity_01: { name: "劫火入体", kind: "attack", element: "calamity", target: "enemy", text: (lv, m = 1) => `${(12 + 3 * lv) * m} 伤害，自损 5%，劫气 +20` },
  spell_calamity_02: { name: "杀劫缠身", kind: "attack", element: "calamity", target: "enemy", text: (lv, m = 1) => `${(16 + 5 * lv) * m} 伤害，自损 8%，本场增伤 +15%（叠加）` },
  // --- P0.5 新增道友卡 ---
  tuxingsun_drill: { name: "地行术", kind: "skill", element: "earth", target: "none", text: () => "闪避下次攻击（遁入地底）" },
  huangtianhua_sword: { name: "莫邪剑", kind: "attack", element: "weapon", target: "enemy", text: (lv, m = 1) => `${(20 + 6 * lv) * m} 伤害，30% 暴击（×2）` },
  leizhenzi_wing: { name: "风雷翅", kind: "skill", element: "thunder", target: "none", text: (lv, m = 1) => `本回合雷系伤害 +50%` },
  // --- P1/P2/P3 道友卡 ---
  yinjiao_seal: { name: "番天印（残）", kind: "attack", element: "treasure", target: "enemy", text: (lv, m = 1) => `${(18 + 5 * lv) * m} 伤害，镇压 1 回合（Boss 跳过行动）` },
  shengongbao_whip: { name: "黑虎鞭", kind: "skill", element: "calamity", target: "enemy", text: () => "偷取敌方 1 个增益状态（罡气/圣盾/燃烧）" },
  zhaogongming_pearl: { name: "定海珠", kind: "attack", element: "treasure", target: "enemy", text: (lv, m = 1) => `连击 3 次，每次 ${(8 + 2 * lv) * m} 伤害` },
  yunxiao_dou: { name: "混元金斗", kind: "skill", element: "treasure", target: "enemy", text: () => "削境：敌方战力 -10% 持续 2 回合" },
  duobao_banner: { name: "六魂幡（影）", kind: "attack", element: "calamity", target: "enemy", text: (lv, m = 1) => `${(15 + 4 * lv) * m} 伤害，清除敌方全部增益` },
  guangchengzi_seal: { name: "番天印", kind: "attack", element: "treasure", target: "enemy", text: (lv, m = 1) => `${(22 + 7 * lv) * m} 伤害，破罡 50%` },
  randeng_pearls: { name: "定海珠（全）", kind: "attack", element: "treasure", target: "enemy", text: (lv, m = 1) => `连击 5 次，每次 ${(6 + 2 * lv) * m} 伤害` },
  kongxuan_light: { name: "五色神光", kind: "skill", element: "treasure", target: "enemy", text: () => "禁用敌方 1 个技能 2 回合（随机）" },
  luya_blade: { name: "斩仙飞刀", kind: "attack", element: "weapon", target: "enemy", text: (lv, m = 1) => `${(35 + 10 * lv) * m} 伤害，HP<25% 斩杀` },
  tongtian_sword: { name: "诛仙剑意", kind: "attack", element: "weapon", target: "enemy", text: (lv, m = 1) => `${(50 + 15 * lv) * m} 伤害，破罡 + 破阵` },
  yuanshi_banner: { name: "盘古幡（影）", kind: "attack", element: "treasure", target: "enemy", text: (lv, m = 1) => `${(60 + 20 * lv) * m} 伤害，无视一切防御` },
  nuwa_picture: { name: "山河社稷图", kind: "skill", element: "treasure", target: "none", text: () => "本场战斗全收益 +10%（被动生效）" },
  laojun_chart: { name: "太极图（影）", kind: "skill", element: "treasure", target: "none", text: () => "免疫下次控制效果（眩晕/虚弱/锁定）" },
};

const RELIC_EFFECTS = {
  treasure_001: { firstThunderBonus: 3, desc: "雷纹：每回合第一张雷牌 +3 伤害" },
  treasure_002: { turnHealRatio: 0.02, desc: "聚灵：每回合开始回复 2% 气血" },
  treasure_003: { startShield: 1, desc: "玄黄：开局获得 1 层圣盾" },
  treasure_004: { dmgBonus: 0.05, desc: "镇妖：全部伤害 +5%" },
  treasure_005: { burnBonus: 1, desc: "风火：燃烧 +1 层" },
  treasure_006: { dmgBonus: 0.05, desc: "照魂：全部伤害 +5%" },
  treasure_007: { dmgBonus: 0.1, desc: "金印：全部伤害 +10%" },
  treasure_008: { blockBonus: 2, desc: "清心：每张防御牌额外 +2 罡气" },
};

const TREASURE_SKILLS = {
  treasure_001: { name: "雷纹斩", element: "thunder", text: (lv, m = 1) => `${(10 + 5 * lv) * m} 雷伤` },
  treasure_002: { name: "聚灵", element: "treasure", text: (lv, m = 1) => `回复 ${(8 + 4 * lv) * m} 气血` },
  treasure_003: { name: "护劫", element: "treasure", text: (lv, m = 1) => `圣盾 1 层，罡气 +${(3 + 2 * lv) * m}` },
  treasure_004: { name: "镇妖", element: "treasure", text: (lv, m = 1) => `${(6 + 3 * lv) * m} 伤害，虚弱 2 回合` },
  treasure_005: { name: "风火参玄", element: "fire", text: (lv, m = 1) => `全体燃烧 ${(3 + lv) * m}` },
  treasure_006: { name: "照魂", element: "treasure", text: (lv, m = 1) => `易伤 2 回合，${(4 + 2 * lv) * m} 伤害` },
  treasure_007: { name: "金印镇山", element: "treasure", text: (lv, m = 1) => `${(12 + 6 * lv) * m} 伤害` },
  treasure_008: { name: "清心", element: "treasure", text: (lv, m = 1) => `回复 ${(5 + lv) * m} 气血，净化燃烧与虚弱` },
};

const TRIBULATION_INTENT_POOLS = {
  suiguang: [
    { type: "attack", w: 50, ratio: [0.16, 0.22], label: "金光扫落", short: "金光" },
    { type: "block", w: 20, ratio: 0.08, label: "榜文凝聚", short: "凝聚" },
    { type: "curse_weak", w: 30, label: "照影摄魂", short: "摄魂" },
  ],
  jinying: [
    { type: "attack", w: 45, ratio: [0.2, 0.26], label: "金鞭抽魂", short: "金鞭" },
    { type: "charge", w: 20, label: "真灵牵引，雷霆将落", short: "牵引" },
    { type: "curse_burn", w: 20, ratio: 0.03, label: "劫火焚身", short: "劫火" },
    { type: "block", w: 15, ratio: 0.1, label: "榜文护持", short: "护持" },
  ],
  yipie: [
    { type: "attack", w: 45, ratio: [0.22, 0.3], label: "封神一瞥", short: "一瞥" },
    { type: "charge", w: 20, label: "真灵牵引，雷霆将落", short: "牵引" },
    { type: "curse_burn", w: 25, ratio: 0.04, label: "留名之厄", short: "留名" },
    { type: "block", w: 10, ratio: 0.12, label: "榜文垂光", short: "垂光" },
  ],
};

const TRIBULATION_PHASES = {
  bt_001: [
    { name: "榜文碎光", power_ratio: 0.75, intro: "天边榜文碎光凝聚，化作一轮金影，遥遥照住你的灵台。", pool: TRIBULATION_INTENT_POOLS.suiguang },
    { name: "金影照灵", power_ratio: 0.95, intro: "碎光重聚，榜文化作金影——一笔一划，皆似要写下你的名字。", pool: TRIBULATION_INTENT_POOLS.jinying },
  ],
  bt_002: [
    { name: "榜文碎光", power_ratio: 0.6, intro: "榜文碎光自九天垂落，劫云在你顶门凝成漩涡。", pool: TRIBULATION_INTENT_POOLS.suiguang },
    { name: "金影照灵", power_ratio: 0.75, intro: "碎光重聚，榜文化作金影——一笔一划，皆似要写下你的名字。", pool: TRIBULATION_INTENT_POOLS.jinying },
    { name: "封神一瞥", power_ratio: 0.9, intro: "榜文尽头金光大盛，似有一双眼睛抬起，朝你看来。", pool: TRIBULATION_INTENT_POOLS.yipie },
  ],
};

const OMENS = [
  {
    omen_id: "qingming",
    name: "清明灵日",
    desc: "天朗气清，吐纳入定收益 +20%",
    gainMult: 1.2,
  },
  {
    omen_id: "leiyu",
    name: "雷雨压山",
    desc: "雷云滚滚，斗法中雷法伤害 +25%，游历道行 +10%",
    battleSpellType: "thunder",
    battleSpellBonus: 0.25,
    journeyMult: 1.1,
  },
  {
    omen_id: "shanwu",
    name: "山雾弥漫",
    desc: "雾锁山径，游历掉落几率 +25%，遭遇判定 +10%",
    dropMult: 1.25,
    checkBonus: 0.1,
  },
  {
    omen_id: "xueyue",
    name: "血月当空",
    desc: "妖气大盛——遭遇之敌更强三成，战利 +50%",
    enemyMult: 1.3,
    lootMult: 1.5,
  },
  {
    omen_id: "lingchao",
    name: "灵潮涌动",
    desc: "地脉灵潮上涌，法力产出 +30%，灵光更频",
    manaMult: 1.3,
    sparkleFast: true,
  },
];

const RESOURCE_UNLOCK_TEXT = {
  spell_page: "术法残页出现！\n\n残破符纸与前人心得，可用于提升你的护道术法。\n真仙之前，你所修仍为术法，还未成神通。",
  artifact_shard: "法器碎片出现！\n\n大劫外溢，山野旧器残片被震落。\n收集足够残片后，你将有机会获得第一件本命法宝。",
  treasure_shard: "法宝碎片出现！\n\n你已成真人，普通法器难以承载你的气机。\n此后所得残片，可用于强化本命法宝。",
  merit: "功德出现！\n\n这不是普通善恶值。\n封神大劫中，功德可以护住真灵，降低榜文牵引。\n破劫时，功德会提高成功率。",
  calamity: "劫气出现！\n\n劫气是封神大劫外溢的杀伐之力。\n炼化劫气可以让你更快变强，但也更容易被封神榜感应。",
  refine_material: "祭炼材料出现！\n\n你已成地仙，可借地脉阴火与白骨残玉继续温养法宝。\n当前版本只开放祭炼入口，完整祭炼将在后续版本开启。",
};

const FEATURE_UNLOCK_TEXT = {
  travel: { name: "山野游历", body: "封神大劫虽未真正降临，但山中已有黑雾游走。\n部分妖物受劫气驱使，开始伤人。\n\n你现在可以离开洞府，在山野边缘拾取机缘。" },
  spell_system: { name: "术法", body: "真仙之前，你所修仍是术法，不是神通。\n术法虽浅，却足以护你穿过封神大劫最边缘的余波。" },
  event_system: { name: "机缘", body: "天边榜文碎光初现，天地灵机开始动荡。\n从此闭关、游历、破劫时，都可能遇到机缘。" },
  treasure_system: { name: "本命法宝", body: "你已成真人，气机足以承载本命法宝。\n法宝不是普通装备，而是护道根基。" },
  merit_calamity: { name: "功德 / 劫气", body: "功德可以护住真灵，降低榜文牵引。\n劫气可以让你更快变强，但更容易被封神榜感应。" },
  boss_001: { name: "山野妖首", body: "山中黑雾凝聚，一头妖首受劫气驱使，盘踞荒庙。\n若能将其击败，你将获得更多道行与法器碎片。" },
  boss_002: { name: "巡海妖将", body: "东海怨潮中浮现巡海妖将残影，受封神劫气驱使而来。\n前往陈塘关外围，可试与之一战。" },
};

const FIRST_TREASURE_CHOICES = ["treasure_001", "treasure_002", "treasure_003"];

const CAP_NOTICE_TEXT = "你已破开地仙劫，立身天仙·初期，暂时挣脱榜文牵引。\n再往前，便是天仙中境之路。\n\n天仙篇将开启：\n· 真正进入封神大劫\n· 术法进阶为神通\n· 法宝祭炼深化\n· 封神榜残影挑战\n· 骷髅山深处与陈塘因果\n\n当前版本暂时开放至天仙·初期。\n你仍可继续游历骷髅山边界，收集祭炼材料与法宝碎片。";

const BOSS_DAILY_LIMIT = 3;


// P0-A: 本命流派战斗风格被动（真仙破劫时五选一，不可逆）
const SCHOOL_PASSIVES = {
  thunder: { name: "雷修·开局爆发", desc: "开局第一张雷系牌伤害 +50%", element: "thunder" },
  fire: { name: "火修·燎原", desc: "燃烧伤害 +30%，燃烧持续 +1 回合", element: "fire" },
  weapon: { name: "剑修·斩魂", desc: "剑系伤害 +25%", element: "weapon" },
  soul: { name: "魂修·摄心", desc: "真伤 +20%，控制持续 +1 回合", element: "soul" },
  calamity: { name: "劫修·噬劫", desc: "每出一张牌，本场后续所有牌伤害 +5%（叠加）", element: "calamity" },
};
const SCHOOL_LIST = ["thunder", "fire", "weapon", "soul", "calamity"];
const SCHOOL_NAME = { thunder: "雷", fire: "火", weapon: "剑", soul: "魂", calamity: "劫" };

const PILL_DEFS = [
  {
    id: "due",
    name: "渡厄丹",
    desc: "破劫斗法开局：圣盾 2 层、罡气 +20% 气血上限",
    cost: { mana: 5000, spell_page: 5 },
    stock: (state) => int(state.pills.due),
    effectText: (state) => `存 ${int(state.pills.due)} 枚`,
  },
  {
    id: "peiyuan",
    name: "培元丹",
    desc: "闭关与行动收益 +15%，持续 2 时辰",
    cost: { mana: 3000 },
    stock: (state) => (nowUnix() < int(state.pills.peiyuan_until) ? 1 : 0),
    effectText: (state) => {
      const remain = int(state.pills.peiyuan_until) - nowUnix();
      return remain > 0 ? `药效中，余 ${Math.ceil(remain / 3600)} 时辰` : "未服";
    },
  },
  {
    id: "ningfa",
    name: "凝法丹",
    desc: "立即炼化法力为道行（30 分钟闭关量）",
    cost: { mana: 8000, artifact_shard: 3 },
    stock: () => 0,
    effectText: () => "即炼即用",
  },
];

const INSIGHT_CHOICES = [
  { id: "gain", name: "灵气归元", desc: "本轮修行收益再添两成", weight: 3 },
  { id: "event", name: "神识外放", desc: "下一次行动更易遭遇机缘（几率翻倍）", weight: 3 },
  { id: "battle", name: "筋骨淬炼", desc: "下一场斗法开局罡气 +10%、圣盾 1 层", weight: 2 },
  { id: "daoxing", name: "明心见性", desc: "立即获得 3 分钟闭关道行", weight: 3 },
  { id: "mana", name: "引气入体", desc: "立即获得 5 分钟闭关法力", weight: 3 },
];

function rollInsights(n = 3) {
  const copy = [...INSIGHT_CHOICES];
  const picks = [];
  while (copy.length && picks.length < n) {
    let total = 0;
    for (const c of copy) total += num(c.weight, 1);
    let pick = Math.random() * total;
    let idx = 0;
    for (; idx < copy.length; idx++) {
      pick -= num(copy[idx].weight, 1);
      if (pick <= 0) break;
    }
    picks.push(copy.splice(Math.min(idx, copy.length - 1), 1)[0]);
  }
  return picks;
}

function hashString(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (h * 31 + text.charCodeAt(i)) >>> 0;
  }
  return h;
}

function getTodayOmen() {
  return OMENS[hashString(todayString()) % OMENS.length];
}
