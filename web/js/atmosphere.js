/* 封神修道录 · Atmosphere — 三层反馈体系（画卷感受）
 *
 * 第一层 微反馈：每次行动给一句"气韵"，数字退为次级。
 * 第二层 小仪式：每 3 重（阶段转换）一个 2-3 秒的呼吸时刻，零交互。
 * 第三层 大画卷：破劫 + 关键叙事，完整沉浸演出（ScrollScene 驱动）。
 *
 * 原则：稀有的才珍贵。数字在底层照算，但玩家读到的第一反馈永远是感受。
 */
"use strict";

// ---------------- 第一层：气韵文案（按行动） ----------------

const QIYUN = {
  breath_cycle: [
    "一轮周天运转完毕。指尖微暖，像握住一缕将散未散的阳光。",
    "气息沉入丹田。你听见自己的心跳，比平日慢了一拍。",
    "收功时，你呼出一口浊气——它比从前长了半息。",
    "灵气顺着经脉走了一圈，回到原处时，已温顺了许多。",
  ],
  short_meditation: [
    "入定醒来，洞外的风声远了。你的神识，比方才清亮一分。",
    "你睁开眼。石壁上的纹路，你看得比昨日更细了。",
    "这一坐，不知过了多久。洞口的天光，挪了半寸。",
  ],
  wild_travel: [
    "你从山野归来，衣角沾着露水与草屑。山里的妖气，今日淡了些。",
    "归途中你回头望了一眼。黑雾还在，但已不敢近你三尺。",
    "山风灌满衣袖。你走得比来时更远，也更稳。",
  ],
  chentang_patrol: [
    "陈塘关外海风腥咸。你巡行一圈，雷声在潮雾深处滚了又滚。",
    "归时，你袖中多了几缕风雷残机，还有一身洗不掉的海腥味。",
  ],
  kulou_explore: [
    "骷髅山边界阴云低垂。你采得几簇阴火，指尖凉到心里。",
    "探幽归来，你总觉得身后有目光。回头时，只有白骨与风。",
  ],
  observe_seal: [
    "你凝望天边那页金光，看了很久。收回目光时，眼眶发酸。",
  ],
  _default: [
    "修行告一段落。洞中一如往常，只是你已不同。",
    "你睁开眼。气机在体内静静流转，比方才沉了一分。",
  ],
};

// ---------------- 第二层：阶段转换小仪式（按新阶段起始 realm_id） ----------------

const PHASE_RITUALS = {
  rq_04: "你感到气不再是气。它有了形状，在经脉里缓缓流转。",
  rq_07: "你的神识，第一次探出了洞壁。外面的风，你『看』见了。",
  rq_10: "虚与实的边界，在你眼里模糊了。你离『真』，只差一劫。",
  zr_04: "道基渐固。你站在这里，山的风要绕着你走。",
  zr_07: "你的呼吸，能带动洞里的尘埃了。它们绕着你，缓缓旋转。",
  zr_10: "真人圆满。你抬头，那页榜文比任何时候都近。它在等你。",
  dx_04: "你站在云下，第一次觉得，云也可以踩在脚下。",
  dx_07: "地脉的灵机，主动向你涌来。你已是这片山的主人。",
  tx_04: "腾云而起。人间兵火，在你脚下成了一幅小小的画。",
  tx_07: "你在云端打坐。风从四面来，又向四面去，不敢扰你。",
  zx_04: "顶上三花，有一朵微微颤动。它快开了。",
  zx_07: "三花已开其二。你的道，开始有了自己的颜色。",
  jx_04: "五气在五脏里奔流，隐隐要朝头顶汇聚。",
  jx_07: "五气朝元之兆已显。你周身光华流转，不复凡俗。",
};

// ---------------- 第三层：破劫大画卷（按 breakthrough_id） ----------------

const BREAKTHROUGH_SCENES = {
  // 破真人劫 —— 洗（rq_10 → zr_01）
  bt_001: {
    beats: [
      { t: "black", lines: ["你闭上眼。", "凡尘的浊气，缠了你二十年。"] },
      { t: "scene", bg: "cave", fx: "mist", lines: ["它沉积在经脉里，像一层洗不掉的灰。"] },
      { t: "scene", bg: "gold", fx: "glow", lines: ["榜文的金光，从九天垂落。", "它照住你的灵台，在找你的名字。"] },
      { t: "hold", bg: "cave", prompt: "按住，引清气洗身", hold: 3000, lines: ["你引动周天清气，一寸寸，洗过经脉。"] },
      { t: "scene", bg: "dawn", fx: "cleanse", lines: ["浊气褪了。", "像褪去一件穿了二十年的旧衣。"] },
      { t: "scene", bg: "dawn", fx: "glow", lines: ["你睁开眼。", "山还是那座山。", "但你听见了——它的呼吸。"] },
      { t: "end", word: "真人", sub: "自此，你不再是凡人。" },
    ],
  },
  // 破地仙劫 —— 抗（zr_10 → dx_01）
  bt_002: {
    beats: [
      { t: "black", lines: ["这一次，榜文不是路过。", "它停在了你的头顶。"] },
      { t: "scene", bg: "gold", fx: "glow", lines: ["金光凝成一支笔。", "它要写下你的名字。"] },
      { t: "scene", bg: "gold", lines: ["你感到真灵被一股大力牵引，往那页金纸上拽。"] },
      { t: "hold", bg: "void", prompt: "按住，守住灵台", hold: 3500, lines: ["你咬紧牙关，把真灵死死按在丹田。"] },
      { t: "scene", bg: "dawn", fx: "flash", lines: ["笔尖触到金纸的一瞬——", "你挡了回去。"] },
      { t: "scene", bg: "dawn", lines: ["金光退了。", "那页榜文上，你的名字墨迹未干，却终究没有成形。"] },
      { t: "end", word: "地仙", sub: "榜外散修。榜文照身，未曾留名。" },
    ],
  },
  // 破真仙劫 —— 升（tx_10 → zx_01）
  bt_003: {
    beats: [
      { t: "black", lines: ["杀劫初临。", "这一劫，不在天上，在你脚下的大地。"] },
      { t: "scene", bg: "gold", fx: "glow", lines: ["地脉震动，劫气从裂缝里涌出，缠上你的脚踝。"] },
      { t: "hold", bg: "void", prompt: "按住，腾身而起", hold: 3200, lines: ["你引清气灌顶，身子一轻。"] },
      { t: "scene", bg: "vista", fx: "rise", lines: ["你升起来了。", "劫气在脚下翻涌，再也够不到你。"] },
      { t: "scene", bg: "vista", lines: ["你第一次，站在云的上面。", "人间在山下，很小，很安静。"] },
      { t: "end", word: "真仙", sub: "腾云入天。大劫的边缘，向你展开。" },
    ],
  },
  // 破金仙劫 —— 开·三花初现（zx_10 → jx_01）
  bt_004: {
    beats: [
      { t: "black", lines: ["三花试心。", "你的精、气、神，要在今夜分出高下。"] },
      { t: "scene", bg: "void", fx: "glow", lines: ["三道光，从你体内升起，在头顶盘旋。"] },
      { t: "hold", bg: "void", prompt: "按住，催动三花", hold: 3200, lines: ["你心神合一，引三道光，向顶门汇聚。"] },
      { t: "scene", bg: "dawn", fx: "converge", lines: ["第一朵花，开了。", "接着是第二朵。第三朵。"] },
      { t: "scene", bg: "dawn", lines: ["三花在你顶上，静静绽放。", "你的道，从此有了形状。"] },
      { t: "end", word: "金仙", sub: "三花聚顶。术法自此，可称神通。" },
    ],
  },
  // 破太乙劫 —— 聚·五气朝元（jx_10 → ty_01）
  bt_005: {
    beats: [
      { t: "black", lines: ["五气朝元。", "这是仙道根基，圆满前的最后一关。"] },
      { t: "scene", bg: "void", fx: "converge", lines: ["心、肝、脾、肺、肾——", "五脏之气，各呈一色，在你体内奔涌。"] },
      { t: "hold", bg: "void", prompt: "按住，引五气归元", hold: 3500, lines: ["你引导五色之气，向丹田汇聚。"] },
      { t: "scene", bg: "gold", fx: "glow", lines: ["五色相撞，没有崩裂——", "它们融成了一轮圆满的光。"] },
      { t: "scene", bg: "gold", lines: ["太乙道果，初成。", "封神榜上，你的名字开始发光。但你没让它写下去。"] },
      { t: "end", word: "太乙", sub: "三花聚顶，五气朝元。" },
    ],
  },
  // 大罗劫 —— 问·大道试问（ty_10 → dl_01）
  bt_006: {
    beats: [
      { t: "black", lines: ["没有雷，没有火。", "只有一个声音。"] },
      { t: "scene", bg: "void", lines: ["它问你：", { text: "『你的道，是什么？』", cls: "gold" }] },
      { t: "hold", bg: "void", prompt: "按住，作答", hold: 3000, lines: ["你闭上眼。这一路走来的山、水、人、劫，一一闪过。"] },
      { t: "scene", bg: "dawn", lines: ["你答了。", "声音沉默了很久。"] },
      { t: "scene", bg: "dawn", fx: "glow", lines: ["然后它说：『好。』", "大道无言，但你知道，它听见了。"] },
      { t: "end", word: "大罗", sub: "因果之线，一根根断裂。你跳出了因果。" },
    ],
  },
  // 准圣劫 —— 闪·因果反噬（dl_10 → zs_01）
  bt_007: {
    beats: [
      { t: "black", lines: ["你跳出因果的那一刻——", "所有被你斩断的因果，同时回来了。"] },
      { t: "scene", bg: "void", fx: "flash", lines: ["过去、现在、未来，三世化为一击，朝你砸来。"] },
      { t: "hold", bg: "void", prompt: "按住，承住三世", hold: 3500, lines: ["你没有躲。你站着，承下了。"] },
      { t: "scene", bg: "dawn", lines: ["因果碎尽。", "你走过的路、杀过的妖、救过的人，都成了你。"] },
      { t: "end", word: "准圣", sub: "万劫不磨。因果不沾，轮回不入。" },
    ],
  },
  // 混元劫 —— 对·封神终试（zs_10 → hy_01）
  bt_008: {
    beats: [
      { t: "black", lines: ["最后一劫。", "封神榜，亲自来了。"] },
      { t: "scene", bg: "gold", fx: "glow", lines: ["它不再是天边的一页纸。", "它化成一只巨手，要把你按回棋盘里。"] },
      { t: "hold", bg: "void", prompt: "按住，站着别动", hold: 4000, lines: ["巨手压下来。天都暗了。", "你站着。没有动。"] },
      { t: "scene", bg: "dawn", fx: "cleanse", lines: ["巨手停了。", "它发现，按不动你。"] },
      { t: "scene", bg: "dawn", lines: ["榜文上，你的名字，彻底消失了。", "从今往后，你是三界之外的存在。"] },
      { t: "end", word: "混元", sub: "不入封神榜，不受天庭缚。自成大道，逍遥不灭。" },
    ],
  },
};

// ---------------- API ----------------

const Atmosphere = {
  // 第一层：取一句气韵（按行动 + 随机）
  actionLine(actionId, state) {
    let pool = QIYUN[actionId] || QIYUN._default;
    // 用今日 + 行动次数做伪随机，避免同一次修行连续重复
    const seed = (state.action_counts_total?.[actionId] || 0) + new Date().getDate();
    return pool[seed % pool.length];
  },

  // 第二层：判断是否阶段转换（每 3 重的边界：3→4, 6→7, 9→10）
  isPhaseTransition(fromRealm, toRealm) {
    if (!fromRealm || !toRealm) return false;
    if (String(fromRealm.major_realm) !== String(toRealm.major_realm)) return false; // 跨大境走破劫画卷
    const to = int(toRealm.minor_level);
    return to === 4 || to === 7 || to === 10;
  },

  // 第二层：取阶段仪式文案
  phaseRitual(realmId) {
    return PHASE_RITUALS[realmId] || null;
  },

  // 第二层：播放小仪式（2.8 秒呼吸时刻，零交互，自动消散）
  playRitual(text, doneCb) {
    const el = $("ritual-layer");
    if (!el) { if (doneCb) doneCb(); return; }
    $("ritual-text").textContent = text;
    el.classList.remove("hidden");
    void el.offsetWidth;
    el.classList.add("on");
    setTimeout(() => {
      el.classList.remove("on");
      setTimeout(() => { el.classList.add("hidden"); if (doneCb) doneCb(); }, 1100);
    }, 2800);
  },

  // 第三层：取破劫画卷脚本
  breakthroughScene(btId) {
    return BREAKTHROUGH_SCENES[btId] || null;
  },

  // 第三层：播放破劫大画卷
  playBreakthrough(btId, doneCb) {
    const script = this.breakthroughScene(btId);
    if (!script) { if (doneCb) doneCb(); return; }
    ScrollScene.play(script, doneCb);
  },
};
