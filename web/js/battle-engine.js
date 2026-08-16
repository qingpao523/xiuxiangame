"use strict";

// 封神人物因缘卡（道友结缘后入牌库）
const COMPANION_CARDS = {
  nezha: "nezha_spear",
  yangjian: "yangjian_blade",
  ziya: "ziya_whip",
};

// 杀劫周期大阵：阵法意图池
const ARRAY_INTENTS = {
  zhenshi: [
    { type: "attack", w: 45, ratio: [0.17, 0.23], label: "阵势压顶", short: "压顶" },
    { type: "block", w: 20, ratio: 0.09, label: "阵纹收拢", short: "阵纹" },
    { type: "curse_weak", w: 20, label: "阵法困神", short: "困神" },
    { type: "charge", w: 15, label: "阵雷蓄势", short: "蓄势" },
  ],
  zhenzhu: [
    { type: "attack", w: 50, ratio: [0.22, 0.28], label: "雷鞭抽落", short: "雷鞭" },
    { type: "charge", w: 20, label: "雷鼓轰鸣，天威将落", short: "雷鼓" },
    { type: "curse_burn", w: 20, ratio: 0.035, label: "雷火洗阵", short: "雷火" },
    { type: "block", w: 10, ratio: 0.12, label: "阵主护体", short: "护体" },
  ],
  heniu: [
    { type: "attack", w: 45, ratio: [0.18, 0.24], label: "河水拍岸", short: "拍岸" },
    { type: "curse_weak", w: 25, label: "河雾迷神", short: "迷神" },
    { type: "block", w: 20, ratio: 0.1, label: "水幕环护", short: "水幕" },
    { type: "charge", w: 10, label: "河曲回潮", short: "回潮" },
  ],
  sanxiao: [
    { type: "attack", w: 45, ratio: [0.2, 0.27], label: "金蛟剪落", short: "蛟剪" },
    { type: "curse_burn", w: 25, ratio: 0.03, label: "消花散气", short: "散气" },
    { type: "charge", w: 20, label: "三霄合力，黄河倒卷", short: "合力" },
    { type: "block", w: 10, ratio: 0.11, label: "混元金斗", short: "金斗" },
  ],
  jianqi: [
    { type: "attack", w: 50, ratio: [0.2, 0.26], label: "剑气穿空", short: "剑气" },
    { type: "curse_weak", w: 20, label: "杀气锁神", short: "锁神" },
    { type: "charge", w: 20, label: "剑鸣九霄", short: "剑鸣" },
    { type: "block", w: 10, ratio: 0.1, label: "剑幕垂光", short: "剑幕" },
  ],
  jianzhu: [
    { type: "attack", w: 50, ratio: [0.24, 0.3], label: "诛仙剑落", short: "剑落" },
    { type: "charge", w: 20, label: "四剑齐鸣，杀机毕露", short: "齐鸣" },
    { type: "curse_burn", w: 20, ratio: 0.04, label: "陷空剑火", short: "剑火" },
    { type: "block", w: 10, ratio: 0.12, label: "绝仙剑幕", short: "剑幕" },
  ],
};

const BattleEngine = {
  buildDeck(state) {
    const deck = [];
    // 战后休整「淬炼符箓」的永久等级加成（独立于术法/法宝系统，仅斗法生效）
    const ups = state.card_upgrades || {};
    for (const row of DataManager.getRows("spell_table")) {
      const id = String(row.spell_id);
      const lv = int(state.spells[id]?.level);
      if (lv > 0) deck.push({ id, level: lv + int(ups[id]) });
    }
    const firstId = state.first_treasure_id;
    if (firstId && int(state.treasures[firstId]?.level) > 0) {
      deck.push({ id: "treasure_skill", level: int(state.treasures[firstId].level) + int(ups.treasure_skill) });
    }
    deck.push(
      { id: "charm_strike", level: 1 + int(ups.charm_strike) },
      { id: "charm_strike", level: 1 + int(ups.charm_strike) },
      { id: "charm_guard", level: 1 + int(ups.charm_guard) },
      { id: "charm_guard", level: 1 + int(ups.charm_guard) },
      { id: "charm_focus", level: 1 }
    );
    // 功德/劫气主题卡：资源满百入牌库
    if (num(state.resources.merit) >= 100) deck.push({ id: "merit_gold", level: 1 });
    if (num(state.resources.calamity) >= 100) deck.push({ id: "calamity_edge", level: 1 });
    // 道友专属卡：封神人物结缘后入库
    if (state.companions?.nezha?.bonded) deck.push({ id: "nezha_spear", level: 1 + int(ups.nezha_spear) });
    if (state.companions?.yangjian?.bonded) deck.push({ id: "yangjian_blade", level: 1 + int(ups.yangjian_blade) });
    if (state.companions?.ziya?.bonded) deck.push({ id: "ziya_whip", level: 1 + int(ups.ziya_whip) });
    return deck;
  },

  relic(state, key) {
    let total = 0;
    for (const tid of Object.keys(state.treasures)) {
      if (int(state.treasures[tid]?.level) > 0) total += num(RELIC_EFFECTS[tid]?.[key]);
    }
    return total;
  },

  _mkEnemy(name, power, intentPool) {
    return {
      name,
      power,
      hp: power,
      hpMax: power,
      block: 0,
      charged: false,
      statuses: { burn: 0, weak: 0, vuln: 0, mark: 0 },
      intent: null,
      intentPool: intentPool || null,
    };
  },

  create(state, cfg) {
    const omen = getTodayOmen();
    const playerPower = RealmManager.getCombatPower(state);
    const phases = cfg.phases || null;
    const enemies = [];
    if (phases) {
      // 破劫多阶段：敌方气血按玩家战力比例换算，意图源自榜文
      enemies.push(this._mkEnemy(phases[0].name, Math.round(playerPower * num(phases[0].power_ratio, 0.8)), phases[0].pool));
    } else {
      enemies.push(this._mkEnemy(String(cfg.name || "妖物"), Math.round(num(cfg.enemy_power) * num(omen.enemyMult, 1))));
      for (const add of cfg.adds || []) {
        enemies.push(this._mkEnemy(String(add.name), Math.round(num(add.power) * num(omen.enemyMult, 1))));
      }
    }
    const battle = {
      name: String(cfg.name || "妖物"),
      source: cfg.source,
      payload: cfg.payload || {},
      playerHp: playerPower,
      playerHpMax: playerPower,
      playerBlock: 0,
      playerStatuses: { burn: 0, weak: 0, shield: 0 },
      enemies,
      deck: this.buildDeck(state),
      ap: 3,
      turn: 0,
      maxTurns: 12 + (phases ? 4 * (phases.length - 1) : 0),
      phases,
      phaseIndex: 0,
      bannerLabel: cfg.bannerLabel || "劫数",
      hand: [],
      treasureUsed: false,
      relicThunderUsed: false,
      guaranteeBuff: false,
      pendingEvents: [],
      manual: !!state.flags.battle_manual,
      done: false,
      win: false,
    };
    battle.playerStatuses.shield = this.relic(state, "startShield");
    this._startPlayerTurn(state, battle);
    // 以下护持类效果必须在 _startPlayerTurn 之后应用（回合开始会重置罡气）
    // 斗部正神位：斗法开局罡气 +8%
    const seatBlock = godSeat(state, "startBlockRatio");
    if (seatBlock > 0) battle.playerBlock += Math.round(battle.playerHpMax * seatBlock);
    // 战后休整「调息养气」：下 N 场斗法开局得罡气与圣盾
    const blessing = state.battle_blessing;
    if (blessing && int(blessing.battles) > 0) {
      battle.playerBlock += Math.round(battle.playerHpMax * num(blessing.block_ratio));
      battle.playerStatuses.shield += int(blessing.shield);
      battle.pendingEvents.push("调息之效犹在：你气机完满，开局便得护持。");
      blessing.battles = int(blessing.battles) - 1;
      if (blessing.battles <= 0) state.battle_blessing = null;
      SaveManager.save(state);
    }
    if (cfg.source === "breakthrough") {
      // 渡厄丹：破劫战前嗑药，开局圣盾与罡气
      if (int(state.pills?.due) > 0) {
        state.pills.due = int(state.pills.due) - 1;
        battle.playerStatuses.shield += 2;
        battle.playerBlock += Math.round(battle.playerHpMax * 0.2);
        battle.pendingEvents.push("你服下渡厄丹：圣盾 2 层，罡气护住周身大穴。");
        SaveManager.save(state);
      }
      // 破劫因果链决算：成功率化为你开局的气机护持
      const rate = num(cfg.payload?.rate);
      if (rate > 0) {
        const bless = Math.round(battle.playerHpMax * rate * 0.3);
        battle.playerBlock += bless;
        if (rate >= 0.75) battle.playerStatuses.shield += 1;
        battle.pendingEvents.push(`因果护持：开局罡气 +${formatInt(bless)}${rate >= 0.75 ? "，圣盾 1 层" : ""}。`);
      }
      // 屡败保底：劫火淬体，榜文再也拿不住你
      if (int(cfg.payload?.failCount) >= int(cfg.payload?.guarantee, 99)) {
        battle.guaranteeBuff = true;
        battle.playerStatuses.shield += 2;
        battle.pendingEvents.push("劫火淬体：此劫已数度失手，榜文再也拿不住你的真灵（圣盾 2 层，伤害 +25%）。");
      }
      if (phases[0]?.intro) battle.pendingEvents.push(phases[0].intro);
    }
    return battle;
  },

  _startPlayerTurn(state, battle) {
    battle.turn += 1;
    battle.ap = 3;
    battle.playerBlock = 0;
    battle.relicThunderUsed = false;
    battle.refreshUsed = false;
    const heal = Math.round(battle.playerHpMax * num(this.relic(state, "turnHealRatio") + godSeat(state, "turnHealRatio")));
    if (heal > 0) battle.playerHp = Math.min(battle.playerHpMax, battle.playerHp + heal);
    // 每回合抽 6 张（牌库不足时允许重复）；每回合可免费重洗一次
    this._drawHand(battle, 6);
    for (const e of battle.enemies) {
      if (e.hp > 0) e.intent = this._rollIntent(e);
    }
  },

  _drawHand(battle, count) {
    battle.hand = [];
    for (let i = 0; i < count; i++) {
      const pick = battle.deck[Math.floor(Math.random() * battle.deck.length)];
      battle.hand.push({ ...pick, used: false });
    }
  },

  refreshHand(state, battle) {
    if (battle.done || battle.refreshUsed || battle.deck.length === 0) {
      return { ok: false, events: [] };
    }
    battle.refreshUsed = true;
    this._drawHand(battle, 6);
    return { ok: true, events: ["你凝神运转天机，手中气机重新洗炼——六张新牌浮现在前。"] };
  },

  _rollIntent(enemy) {
    const pool = enemy.intentPool;
    if (pool && pool.length) {
      let total = 0;
      for (const p of pool) total += num(p.w, 1);
      let pick = Math.random() * total;
      for (const p of pool) {
        pick -= num(p.w, 1);
        if (pick <= 0) return this._mkIntent(enemy, p);
      }
    }
    const r = Math.random();
    if (r < 0.6) return { type: "attack", value: Math.max(1, Math.round(enemy.power * (0.18 + Math.random() * 0.06))), label: "扑击", short: "击" };
    if (r < 0.75) return { type: "charge", label: "凶光大盛，蓄势待发", short: "蓄势" };
    if (r < 0.9) return { type: "block", value: Math.max(1, Math.round(enemy.power * 0.08)), label: "鳞甲收紧", short: "守" };
    if (r < 0.95) return { type: "curse_burn", label: "喷吐邪火", short: "邪火" };
    return { type: "curse_weak", label: "嘶吼震魂", short: "震魂" };
  },

  _mkIntent(enemy, p) {
    if (p.type === "attack") {
      const lo = num(p.ratio?.[0], 0.18);
      const hi = num(p.ratio?.[1], 0.24);
      return { type: "attack", value: Math.max(1, Math.round(enemy.power * (lo + Math.random() * (hi - lo)))), label: p.label, short: p.short };
    }
    if (p.type === "block") {
      return { type: "block", value: Math.max(1, Math.round(enemy.power * num(p.ratio, 0.08))), label: p.label, short: p.short };
    }
    return { type: p.type, label: p.label, short: p.short, ratio: num(p.ratio, 0.03) };
  },

  _omenThunderBonus(state) {
    const omen = getTodayOmen();
    if (!omen.battleSpellType) return 0;
    for (const row of DataManager.getRows("spell_table")) {
      if (String(row.spell_type) !== omen.battleSpellType) continue;
      if (int(state.spells[String(row.spell_id)]?.level) > 0) return num(omen.battleSpellBonus);
    }
    return 0;
  },

  _powerMult(battle) {
    return Math.max(1, Math.round(battle.playerHpMax / 200));
  },

  _dealDamage(state, battle, enemy, base, element) {
    // 卡牌基础值很小，按玩家战力放大到与敌方血量同一量级
    let mult = this._powerMult(battle) * (1 + this.relic(state, "dmgBonus") + godSeat(state, "dmgBonus"));
    if (battle.guaranteeBuff) mult *= 1.25;
    if (element === "thunder") {
      mult += this._omenThunderBonus(state);
      if (!battle.relicThunderUsed && this.relic(state, "firstThunderBonus") > 0) {
        base += this.relic(state, "firstThunderBonus");
        battle.relicThunderUsed = true;
      }
      if (enemy.statuses.mark > 0) {
        mult += 0.25 * enemy.statuses.mark;
        enemy.statuses.mark = 0;
      }
    }
    if (enemy.statuses.vuln > 0) mult *= 1.5;
    let dmg = Math.max(1, Math.round(base * mult));
    if (enemy.block > 0) {
      const absorbed = Math.min(enemy.block, dmg);
      enemy.block -= absorbed;
      dmg -= absorbed;
    }
    enemy.hp = Math.max(0, enemy.hp - dmg);
    return dmg;
  },

  playCard(state, battle, handIndex, targetIndex = 0) {
    if (battle.done || battle.ap <= 0) return [];
    const card = battle.hand[handIndex];
    if (!card || card.used) return [];
    const def = CARD_DEFS[card.id];
    if (!def) return [];
    if (def.kind === "treasure" && battle.treasureUsed) return [];
    // 资源卡：打出即消耗全局资源
    if (def.cost && num(state.resources[def.cost.resource]) < num(def.cost.amount)) return [];
    const target = battle.enemies.filter((e) => e.hp > 0)[targetIndex] || battle.enemies.find((e) => e.hp > 0);
    if (def.target === "enemy" && !target) return [];

    if (def.cost) {
      state.resources[def.cost.resource] = num(state.resources[def.cost.resource]) - num(def.cost.amount);
      SaveManager.save(state);
    }
    battle.ap -= 1;
    card.used = true;
    if (def.kind === "treasure") battle.treasureUsed = true;
    const lv = int(card.level, 1);
    const events = [];

    const hit = (enemy, base, element, label) => {
      const dmg = this._dealDamage(state, battle, enemy, base, element);
      events.push(`${label}对${enemy.name}造成 ${dmg} 伤害。`);
    };

    switch (card.id) {
      case "spell_thunder_01":
        hit(target, 8 + 4 * lv, "thunder", "掌心雷");
        if (target.hp > 0) {
          target.statuses.mark += 1;
          events.push(`${target.name}身上烙下雷殛标记。`);
        }
        break;
      case "spell_fire_01":
        hit(target, 5 + 2 * lv, "fire", "灵火术");
        if (target.hp > 0) {
          target.statuses.burn += (3 + lv + this.relic(state, "burnBonus") + godSeat(state, "burnBonus")) * this._powerMult(battle);
          events.push(`${target.name}被灵火缠绕（燃烧 ${target.statuses.burn}）。`);
        }
        break;
      case "spell_weapon_01": {
        for (const e of battle.enemies.filter((x) => x.hp > 0)) hit(e, 4 + lv, "weapon", "御器术");
        const block = (6 + 2 * lv + this.relic(state, "blockBonus")) * this._powerMult(battle);
        battle.playerBlock += block;
        events.push(`你获得罡气 +${block}。`);
        break;
      }
      case "charm_strike":
        hit(target, 6 * lv, "charm", "符咒·镇妖");
        break;
      case "charm_guard": {
        const block = (6 + 2 * lv + this.relic(state, "blockBonus")) * this._powerMult(battle);
        battle.playerBlock += block;
        events.push(`你获得罡气 +${block}。`);
        break;
      }
      case "merit_gold": {
        hit(target, 10 + Math.floor(num(state.resources.merit) / 100), "merit", "功德金光");
        if (battle.playerStatuses.weak > 0) {
          battle.playerStatuses.weak = 0;
          events.push("功德金光绕体一周，滞涩尽去。");
        }
        break;
      }
      case "calamity_edge": {
        hit(target, 12 + Math.floor(num(state.resources.calamity) / 100), "calamity", "劫气纵横");
        const backlash = Math.max(1, Math.round(battle.playerHpMax * 0.05));
        battle.playerHp = Math.max(1, battle.playerHp - backlash);
        state.resources.calamity = num(state.resources.calamity) + 30;
        SaveManager.save(state);
        events.push(`劫气反噬，你受 ${backlash} 伤害；杀伐之气入体，劫气 +30。`);
        break;
      }
      case "nezha_spear":
        hit(target, 14 + 4 * lv, "fire", "火尖枪");
        if (target.hp > 0) {
          target.statuses.burn += (4 + lv + godSeat(state, "burnBonus")) * this._powerMult(battle);
          events.push(`${target.name}被枪锋火焰缠绕（燃烧 ${target.statuses.burn}）。`);
        }
        break;
      case "yangjian_blade":
        for (const e of battle.enemies.filter((x) => x.hp > 0)) hit(e, 8 + 2 * lv, "weapon", "三尖两刃");
        break;
      case "ziya_whip": {
        const vsSpirit = battle.source === "breakthrough" || battle.source === "array";
        hit(target, Math.round((12 + 3 * lv) * (vsSpirit ? 1.5 : 1)), "merit", "打神鞭");
        if (vsSpirit) events.push("打神鞭专封神祇——对此等残影，威力大增！");
        break;
      }
      case "charm_focus":
        battle.ap += 2;
        events.push("你凝神运气，真气 +2。");
        break;
      case "treasure_skill": {
        const tid = state.first_treasure_id;
        const skill = TREASURE_SKILLS[tid];
        if (!skill) break;
        const tname = String(DataManager.getById("treasure_table", tid).treasure_name || "法宝");
        events.push(`你祭出${tname}——${skill.name}！`);
        switch (tid) {
          case "treasure_001": hit(target, 10 + 5 * lv, "thunder", skill.name); break;
          case "treasure_002": {
            const heal = (8 + 4 * lv) * this._powerMult(battle);
            battle.playerHp = Math.min(battle.playerHpMax, battle.playerHp + heal);
            events.push(`你回复 ${heal} 气血。`);
            break;
          }
          case "treasure_003": {
            battle.playerStatuses.shield += 1;
            const blk = (3 + 2 * lv) * this._powerMult(battle);
            battle.playerBlock += blk;
            events.push(`圣盾 1 层，罡气 +${blk}。`);
            break;
          }
            break;
          case "treasure_004":
            hit(target, 6 + 3 * lv, "treasure", skill.name);
            if (target.hp > 0) { target.statuses.weak = Math.max(target.statuses.weak, 2); events.push(`${target.name}攻势一滞（虚弱 2 回合）。`); }
            break;
          case "treasure_005":
            for (const e of battle.enemies.filter((x) => x.hp > 0)) {
              e.statuses.burn += (3 + lv + this.relic(state, "burnBonus") + godSeat(state, "burnBonus")) * this._powerMult(battle);
              events.push(`${e.name}被风火缠身（燃烧 ${e.statuses.burn}）。`);
            }
            break;
          case "treasure_006":
            hit(target, 4 + 2 * lv, "treasure", skill.name);
            if (target.hp > 0) { target.statuses.vuln = Math.max(target.statuses.vuln, 2); events.push(`${target.name}魂影毕露（易伤 2 回合）。`); }
            break;
          case "treasure_007": hit(target, 12 + 6 * lv, "treasure", skill.name); break;
          case "treasure_008": {
            const heal = (5 + lv) * this._powerMult(battle);
            battle.playerHp = Math.min(battle.playerHpMax, battle.playerHp + heal);
            battle.playerStatuses.burn = 0;
            battle.playerStatuses.weak = 0;
            events.push(`你回复 ${heal} 气血，邪火与滞涩尽去。`);
            break;
          }
        }
        break;
      }
    }
    this._checkEnd(state, battle);
    events.push(...battle.pendingEvents.splice(0));
    return events;
  },

  endPlayerTurn(state, battle) {
    if (battle.done) return [];
    const events = [];
    // 敌方阶段：执行意图
    for (const e of battle.enemies.filter((x) => x.hp > 0)) {
      if (e.charged) {
        const dmg = this._damagePlayer(state, battle, Math.max(1, Math.round(e.power * 0.35)));
        e.charged = false;
        events.push(`${e.name}蓄势重击！你受 ${dmg} 伤害。`);
        continue;
      }
      const intent = e.intent;
      if (!intent) continue;
      if (intent.type === "attack") {
        let value = intent.value;
        if (e.statuses.weak > 0) value = Math.max(1, Math.round(value * 0.75));
        value = Math.max(1, Math.round(value * (1 - godSeat(state, "enemyWeaken"))));
        const dmg = this._damagePlayer(state, battle, value);
        events.push(`${e.name}${intent.label || "扑击"}，你受 ${dmg} 伤害。`);
      } else if (intent.type === "charge") {
        e.charged = true;
        events.push(`${e.name}${intent.label || "凶光大盛，蓄势待发"}！`);
      } else if (intent.type === "block") {
        e.block += intent.value;
        events.push(`${e.name}${intent.label || "罡气护体"}，罡气 +${intent.value}。`);
      } else if (intent.type === "curse_burn") {
        battle.playerStatuses.burn += Math.max(2, Math.round(e.power * num(intent.ratio, 0.03)));
        events.push(`${e.name}${intent.label || "喷吐邪火"}，你被燃烧缠身。`);
      } else if (intent.type === "curse_weak") {
        battle.playerStatuses.weak = 2;
        events.push(`${e.name}${intent.label || "嘶吼震魂"}，你手足发软（虚弱 2 回合）。`);
      }
      e.intent = null;
    }
    // 燃烧结算（双方）
    if (battle.playerStatuses.burn > 0) {
      battle.playerHp = Math.max(0, battle.playerHp - battle.playerStatuses.burn);
      events.push(`邪火焚身，你受 ${battle.playerStatuses.burn} 燃烧伤害。`);
      battle.playerStatuses.burn = Math.max(0, battle.playerStatuses.burn - 1);
    }
    for (const e of battle.enemies.filter((x) => x.hp > 0 && x.statuses.burn > 0)) {
      e.hp = Math.max(0, e.hp - e.statuses.burn);
      events.push(`${e.name}被灵火灼烧，受 ${e.statuses.burn} 燃烧伤害。`);
      e.statuses.burn = Math.max(0, e.statuses.burn - 1);
    }
    // 持续状态衰减
    for (const e of battle.enemies) {
      e.statuses.weak = Math.max(0, e.statuses.weak - 1);
      e.statuses.vuln = Math.max(0, e.statuses.vuln - 1);
    }
    battle.playerStatuses.weak = Math.max(0, battle.playerStatuses.weak - 1);

    this._checkEnd(state, battle);
    events.push(...battle.pendingEvents.splice(0));
    if (!battle.done) this._startPlayerTurn(state, battle);
    return events;
  },

  _damagePlayer(state, battle, value) {
    if (battle.playerStatuses.shield > 0) {
      battle.playerStatuses.shield -= 1;
      return 0;
    }
    let dmg = value;
    if (battle.playerBlock > 0) {
      const absorbed = Math.min(battle.playerBlock, dmg);
      battle.playerBlock -= absorbed;
      dmg -= absorbed;
    }
    battle.playerHp = Math.max(0, battle.playerHp - dmg);
    return dmg;
  },

  _checkEnd(state, battle) {
    if (battle.enemies.every((e) => e.hp <= 0)) {
      // 破劫多阶段：击碎当前金影后，榜文显化下一阶段
      if (battle.phases && battle.phaseIndex < battle.phases.length - 1) {
        this._advancePhase(state, battle);
        return;
      }
      battle.done = true;
      battle.win = true;
      return;
    }
    if (battle.playerHp <= 0 || battle.turn >= battle.maxTurns) {
      battle.done = true;
      battle.win = false;
    }
  },

  _advancePhase(state, battle) {
    battle.phaseIndex += 1;
    const phase = battle.phases[battle.phaseIndex];
    battle.enemies = [this._mkEnemy(phase.name, Math.round(battle.playerHpMax * num(phase.power_ratio, 0.8)), phase.pool)];
    battle.pendingEvents.push(phase.intro || `${phase.name}显化而出！`);
  },

  // 自动模式：从前往后出第一张可用牌
  autoStep(state, battle) {
    if (battle.done || battle.manual) return { events: [], acted: false };
    for (let i = 0; i < battle.hand.length; i++) {
      const card = battle.hand[i];
      if (card.used) continue;
      const def = CARD_DEFS[card.id];
      if (!def) continue;
      if (def.kind === "treasure" && battle.treasureUsed) continue;
      if (def.cost && num(state.resources[def.cost.resource]) < num(def.cost.amount)) continue;
      if (def.target === "enemy" && !battle.enemies.some((e) => e.hp > 0)) continue;
      const alive = battle.enemies.filter((e) => e.hp > 0);
      const targetIndex = alive.reduce((best, e, idx) => (e.hp < alive[best].hp ? idx : best), 0);
      const events = this.playCard(state, battle, i, targetIndex);
      return { events, acted: events.length > 0, card };
    }
    return { events: [], acted: false };
  },

  toggleManual(state, battle) {
    battle.manual = !battle.manual;
    state.flags.battle_manual = battle.manual;
    SaveManager.save(state);
  },
};

function getCardDisplayName(state, cardId) {
  if (cardId === "treasure_skill") {
    return TREASURE_SKILLS[state.first_treasure_id]?.name || "法宝技";
  }
  return CARD_DEFS[cardId]?.name || cardId;
}

function getCardBattleLevel(state, cardId) {
  const ups = int(state.card_upgrades?.[cardId]);
  if (cardId === "treasure_skill") return int(state.treasures[state.first_treasure_id]?.level) + ups;
  if (cardId.startsWith("spell_")) return int(state.spells[cardId]?.level) + ups;
  if (cardId === "charm_focus") return 1;
  if (cardId.startsWith("charm_")) return 1 + ups;
  return 1;
}
