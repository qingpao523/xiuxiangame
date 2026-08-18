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
    // P1 阵容：只有"上场"道友的专属卡入库（最多 3 位），bond_card 从数据表读取
    for (const cid of state.lineup || []) {
      if (!state.companions?.[cid]?.bonded) continue;
      const crow = DataManager.getById("companion_table", cid);
      const cardId = String(crow.bond_card || "");
      if (cardId) deck.push({ id: cardId, level: 1 + int(ups[cardId]) });
    }
    // P1 生活技艺·画符：一次性符咒卡入牌库（每张符一枚）
    for (const t of state.talismans || []) {
      deck.push({ id: "talisman_" + t.type, level: int(t.lv, 1) });
    }
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
      mechanic: cfg.mechanic || null,
      weakness: cfg.weakness || null,
      mechanicState: { turnCount: 0, pearlsUsed: 0, rotateIndex: 0 },
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
    battle.thunderBoost = 0;
    for (const c of battle.hand) { if (c.disabled > 0) c.disabled -= 1; }
    if (battle.pictureWorld > 0) battle.pictureWorld -= 1;
    if (battle.rageAllTurns > 0) battle.rageAllTurns -= 1;
    if (int(battle.fireDomainTurns) > 0) {
      for (const e of battle.enemies.filter((x) => x.hp > 0)) e.statuses.burn += Math.round((10 + int(battle.fireDomainLv, 1)) * this._powerMult(battle));
      battle.fireDomainTurns -= 1;
    }
    this._processMechanicTurnStart(state, battle);
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

  // P0-A: 本命流派战斗风格被动乘区
  _benmingMult(state, battle, element) {
    const bm = str(state.benming_school, "");
    if (!bm) return 1;
    if (bm === "thunder" && element === "thunder" && !battle.benmingThunderUsed) {
      battle.benmingThunderUsed = true;
      return 1.5;
    }
    if (bm === "weapon" && element === "weapon") return 1.25;
    if (bm === "calamity") return 1 + 0.05 * int(battle.cardsPlayed);
    return 1;
  },

  // 火修被动：燃烧持续 +1 回合（施加燃烧时 +1）
  _fireBenmingTurn(state) { return str(state.benming_school, "") === "fire" ? 1 : 0; },

  _dealDamage(state, battle, enemy, base, element) {
    // Boss mechanic: element immunity
    const mech = battle.mechanic;
    if (mech === "thunder_immune" && element === "thunder") return 0;
    if (mech === "fire_immune" && element === "fire") return 0;
    if (mech === "five_rotate") {
      const els = ["thunder", "fire", "weapon", "soul", "calamity"];
      if (element === els[battle.mechanicState.rotateIndex % 5]) return 0;
    }
    if (mech === "array_eyes" && enemy.isMain && battle.enemies.some(e => e.hp > 0 && !e.isMain)) return 0;
    let pictureMult = 1;
    if (mech === "picture_world" && battle.pictureWorld > 0) pictureMult = 0.5;
    // P0-B: 弱点克制——卡牌元素命中 Boss 弱点，伤害 +30%
    let weaknessMult = 1;
    if (battle.weakness && battle.weakness.includes(element)) {
      weaknessMult = 1.3;
      if (!battle.weaknessShown) { battle.weaknessShown = true; battle.pendingEvents.push("正中弱点！你的攻势撕开了它的破绽。"); }
    }
    // 卡牌基础值很小，按玩家战力放大到与敌方血量同一量级
    let mult = this._powerMult(battle) * (1 + this.relic(state, "dmgBonus") + godSeat(state, "dmgBonus"));
    if (battle.guaranteeBuff) mult *= 1.25;
    if (element === "thunder") {
      mult += this._omenThunderBonus(state);
      if (battle.thunderBoost > 0) mult += battle.thunderBoost;
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
    if (int(battle.rageAllTurns) > 0) mult *= 1.5; // 万劫归一：后续诸牌 ×1.5
    let dmg = Math.max(1, Math.round(base * mult * pictureMult * weaknessMult * this._benmingMult(state, battle, element)));
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
    if (!card || card.used || card.disabled > 0) return [];
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
          target.statuses.burn += (3 + lv + this.relic(state, "burnBonus") + godSeat(state, "burnBonus") + this._fireBenmingTurn(state)) * this._powerMult(battle);
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
        // --- P0.5 新增术法卡 ---
        case "spell_thunder_02": {
          hit(target, 12 + 5 * lv, "thunder", "五雷术");
          if (target.hp > 0) {
            target.statuses.mark += 1;
            if (target.statuses.mark >= 3) {
              const bonus = Math.round(8 * this._powerMult(battle));
              target.hp = Math.max(0, target.hp - bonus);
              target.statuses.mark = 0;
              events.push(`雷殛标记引爆！${target.name}额外受 ${bonus} 雷伤。`);
            } else {
              events.push(`${target.name}身上烙下雷殛标记（${target.statuses.mark}/3）。`);
            }
          }
          break;
        }
        case "spell_thunder_03": {
          hit(target, 16 + 6 * lv, "thunder", "雷部敕令");
          if (target.hp > 0) {
            target.statuses.stun = 1;
            events.push(`雷网束缚！${target.name}下回合无法行动。`);
          }
          break;
        }
        case "spell_fire_02": {
          hit(target, 8 + 3 * lv, "fire", "赤火术");
          if (target.hp > 0) {
            target.statuses.burn += Math.round((5 + lv + this.relic(state, "burnBonus") + godSeat(state, "burnBonus") + this._fireBenmingTurn(state)) * this._powerMult(battle));
            events.push(`${target.name}被赤火缠绕（燃烧 ${target.statuses.burn}）。`);
            for (const e of battle.enemies.filter((x) => x.hp > 0 && x !== target)) {
              e.statuses.burn += 2;
              events.push(`火焰蔓延至${e.name}（燃烧 +2）。`);
            }
          }
          break;
        }
        case "spell_fire_03": {
          hit(target, 12 + 4 * lv, "fire", "三昧真火");
          if (target.hp > 0) {
            target.statuses.burn += Math.round((8 + lv + this.relic(state, "burnBonus") + godSeat(state, "burnBonus") + this._fireBenmingTurn(state)) * this._powerMult(battle));
            target.statuses.burnUnpurgeable = true;
            events.push(`三昧真火沾身（燃烧 ${target.statuses.burn}），非水可灭！`);
          }
          break;
        }
        case "spell_weapon_02": {
          const ignoreBlock = Math.round(target.block * 0.3);
          target.block = Math.max(0, target.block - ignoreBlock);
          hit(target, 10 + 4 * lv, "weapon", "御剑术");
          if (ignoreBlock > 0) events.push(`剑气破罡，无视 ${ignoreBlock} 罡气。`);
          break;
        }
        case "spell_weapon_03": {
          const isYao = (target.tags || []).includes("yao") || (target.name || "").includes("妖");
          const yaoMult = isYao ? 1.4 : 1;
          hit(target, Math.round((16 + 5 * lv) * yaoMult), "weapon", "斩妖剑气");
          if (isYao) events.push("剑气专斩妖邪，威力大增！");
          break;
        }
        case "spell_soul_01": {
          const soulBen = str(state.benming_school, "") === "soul" ? 1.2 : 1;
          const soulDmg = Math.round((6 + 2 * lv) * this._powerMult(battle) * soulBen);
          target.hp = Math.max(0, target.hp - soulDmg);
          events.push(`摄魂咒对${target.name}造成 ${soulDmg} 真伤（无视罡气）。`);
          if (target.hp > 0) { const wd = 1 + (str(state.benming_school, "") === "soul" ? 1 : 0); target.statuses.weak = Math.max(target.statuses.weak, wd); events.push(`${target.name}心神动摇（虚弱 ${wd} 回合）。`); }
          break;
        }
        case "spell_soul_02": {
          const soulBen2 = str(state.benming_school, "") === "soul" ? 1.2 : 1;
          const soulDmg2 = Math.round((10 + 3 * lv) * this._powerMult(battle) * soulBen2);
          target.hp = Math.max(0, target.hp - soulDmg2);
          events.push(`落魂术对${target.name}造成 ${soulDmg2} 真伤。`);
          if (target.hp > 0) { const wd2 = 2 + (str(state.benming_school, "") === "soul" ? 1 : 0); target.statuses.weak = Math.max(target.statuses.weak, wd2); events.push(`${target.name}神魂不稳，攻势衰减（虚弱 ${wd2} 回合）。`); }
          break;
        }
        case "spell_calamity_01": {
          hit(target, 12 + 3 * lv, "calamity", "劫火入体");
          const cal1Backlash = Math.max(1, Math.round(battle.playerHpMax * 0.05));
          battle.playerHp = Math.max(1, battle.playerHp - cal1Backlash);
          state.resources.calamity = num(state.resources.calamity) + 20;
          SaveManager.save(state);
          events.push(`劫火反噬，你受 ${cal1Backlash} 伤害；劫气 +20。`);
          break;
        }
        case "spell_calamity_02": {
          battle.rageStack = int(battle.rageStack) + 1;
          const rageMult = 1 + 0.15 * battle.rageStack;
          hit(target, Math.round((16 + 5 * lv) * rageMult), "calamity", "杀劫缠身");
          const cal2Backlash = Math.max(1, Math.round(battle.playerHpMax * 0.08));
          battle.playerHp = Math.max(1, battle.playerHp - cal2Backlash);
          events.push(`杀劫缠身（第 ${battle.rageStack} 叠，×${rageMult.toFixed(2)}），你受 ${cal2Backlash} 反噬。`);
          break;
        }
        // --- P0.5 新增道友卡 ---
        case "tuxingsun_drill": {
          battle.playerStatuses.dodge = (battle.playerStatuses.dodge || 0) + 1;
          events.push("你遁入地底，下次攻击将被闪避。");
          break;
        }
        case "huangtianhua_sword": {
          const crit = Math.random() < 0.3;
          const swordBase = Math.round((20 + 6 * lv) * (crit ? 2 : 1) * this._powerMult(battle));
          hit(target, swordBase, "weapon", "莫邪剑");
          if (crit) events.push("莫邪剑暴击！伤害翻倍！");
          break;
        }
        case "leizhenzi_wing": {
          battle.thunderBoost = (battle.thunderBoost || 0) + 0.5;
          events.push("风雷翅展开！本回合雷系伤害 +50%。");
          break;
        }
        // --- P1/P2/P3 道友卡 ---
        case "yinjiao_seal": {
          hit(target, 18 + 5 * lv, "treasure", "番天印（残）");
          if (target.hp > 0) {
            target.statuses.stun = 1;
            events.push("番天印镇压！敌方下回合无法行动。");
          }
          break;
        }
        case "shengongbao_whip": {
          if (target.block > 0) {
            const stolen = Math.max(1, Math.round(target.block * 0.3));
            target.block -= stolen;
            battle.playerBlock += stolen;
            events.push(`黑虎鞭卷走敌方 ${stolen} 罡气！`);
          } else if (target.statuses.burn > 0) {
            const stolenBurn = Math.min(3, target.statuses.burn);
            target.statuses.burn -= stolenBurn;
            battle.playerBlock += 10;
            events.push(`黑虎鞭夺走敌方燃烧之力，罡气 +10。`);
          } else {
            events.push("敌方无增益可偷。");
          }
          break;
        }
        case "zhaogongming_pearl": {
          for (let i = 0; i < 3 && target.hp > 0; i++) hit(target, 8 + 2 * lv, "treasure", "定海珠");
          events.push("定海珠连击！");
          break;
        }
        case "yunxiao_dou": {
          target.statuses.weak = Math.max(target.statuses.weak, 2);
          target.powerMult = 0.9;
          target.powerMultTurns = 2;
          events.push("混元金斗削境！敌方战力 -10%。");
          break;
        }
        case "duobao_banner": {
          hit(target, 15 + 4 * lv, "calamity", "六魂幡");
          target.block = 0;
          target.statuses.burn = 0;
          target.statuses.shield = 0;
          events.push("六魂幡摇动，敌方增益尽散！");
          break;
        }
        case "guangchengzi_seal": {
          const ignoreBlock = Math.round(target.block * 0.5);
          target.block = Math.max(0, target.block - ignoreBlock);
          hit(target, 22 + 7 * lv, "treasure", "番天印");
          events.push("番天印破罡！");
          break;
        }
        case "randeng_pearls": {
          for (let i = 0; i < 5 && target.hp > 0; i++) hit(target, 6 + 2 * lv, "treasure", "定海珠（全）");
          events.push("二十四颗定海珠！");
          break;
        }
        case "kongxuan_light": {
          const usable = battle.hand.filter((c) => !c.used && c !== card && !c.disabled);
          if (usable.length > 0) {
            const picked = usable[Math.floor(Math.random() * usable.length)];
            picked.disabled = 2;
            events.push(`五色神光刷走了你的一张牌（${CARD_DEFS[picked.id]?.name || picked.id}）！`);
          } else {
            events.push("五色神光落空，无可刷之牌。");
          }
          break;
        }
        case "luya_blade": {
          hit(target, 35 + 10 * lv, "weapon", "斩仙飞刀");
          if (target.hp > 0 && target.hp <= target.maxHp * 0.25) {
            target.hp = 0;
            events.push("斩仙飞刀——一击必杀！");
          }
          break;
        }
        case "tongtian_sword": {
          target.block = 0;
          hit(target, 50 + 15 * lv, "weapon", "诛仙剑意");
          events.push("诛仙剑意，破罡破阵！");
          break;
        }
        case "yuanshi_banner": {
          target.block = 0;
          target.statuses.shield = 0;
          hit(target, 60 + 20 * lv, "treasure", "盘古幡");
          events.push("盘古幡——开天一击！");
          break;
        }
        case "nuwa_picture": {
          battle.passiveBonus = (battle.passiveBonus || 0) + 0.1;
          events.push("山河社稷图展开，本场收益 +10%。");
          break;
        }
        case "laojun_chart": {
          battle.playerStatuses.immune = (battle.playerStatuses.immune || 0) + 1;
          events.push("太极图护体，免疫下次控制。");
          break;
        }
        // ===== P0-A/P2 神通（T4/T5） =====
        case "spell_thunder_04": {
          let base = 24 + 8 * lv;
          const isYao = (target.tags || []).includes("yao") || String(target.name || "").includes("妖");
          if (isYao) base = Math.round(base * 1.3);
          hit(target, base, "thunder", "九霄神雷");
          if (target.hp > 0) { target.statuses.mark += 1; events.push(`${target.name}烙下雷殛标记。`); }
          for (const e of battle.enemies.filter((x) => x.hp > 0 && x !== target)) {
            const sd = this._dealDamage(state, battle, e, Math.round(base * 0.5), "thunder");
            events.push(`雷光溅射${e.name}，受 ${sd} 伤害。`);
          }
          if (isYao) events.push("九霄神雷克妖，威力大增！");
          break;
        }
        case "spell_thunder_05": {
          let base = 40 + 12 * lv;
          if (battle.source === "boss" || battle.source === "breakthrough" || battle.source === "array") base += Math.round(target.hpMax * 0.3);
          hit(target, base, "thunder", "代天行罚");
          if (target.hp > 0 && target.hp <= target.hpMax * 0.2) { target.hp = 0; events.push("代天行罚——天雷审判，灰飞烟灭！"); }
          break;
        }
        case "spell_fire_04": {
          hit(target, 18 + 6 * lv, "fire", "九龙神火");
          if (target.hp > 0) {
            target.statuses.burn += Math.round((5 + lv + this._fireBenmingTurn(state)) * this._powerMult(battle));
            target.statuses.pctBurn = 0.05;
            events.push(`${target.name}被九龙神火缠绕（燃烧 ${target.statuses.burn}，另受灼魂之痛）。`);
          }
          break;
        }
        case "spell_fire_05": {
          hit(target, 30 + 10 * lv, "fire", "焚天炼界");
          battle.fireDomainTurns = 3; battle.fireDomainLv = lv;
          for (const e of battle.enemies.filter((x) => x.hp > 0)) e.statuses.burn += Math.round((10 + lv + this._fireBenmingTurn(state)) * this._powerMult(battle));
          events.push("焚天炼界——火域展开，万物皆焚（3 回合）！");
          break;
        }
        case "spell_weapon_04": {
          const wb = 22 + 7 * lv;
          hit(target, wb, "weapon", "太乙剑诀");
          if (target.hp <= 0) {
            const next = battle.enemies.find((x) => x.hp > 0);
            if (next) { const cd = this._dealDamage(state, battle, next, Math.round(wb * 0.5), "weapon"); events.push(`剑势不断，余威斩向${next.name}，受 ${cd} 伤害。`); }
          }
          break;
        }
        case "spell_weapon_05": {
          const savedBlock = target.block; target.block = 0;
          hit(target, 50 + 15 * lv, "weapon", "一剑破万法");
          target.block = savedBlock;
          events.push("一剑破万法——罡气圣盾，皆为虚妄！");
          break;
        }
        case "spell_soul_04": {
          const soulBen = str(state.benming_school, "") === "soul" ? 1.2 : 1;
          const sd = Math.round((20 + 6 * lv) * this._powerMult(battle) * soulBen);
          target.hp = Math.max(0, target.hp - sd);
          events.push(`幽冥锁魂对${target.name}造成 ${sd} 真伤。`);
          if (target.hp > 0) {
            const wd = 2 + (str(state.benming_school, "") === "soul" ? 1 : 0);
            target.statuses.weak = Math.max(target.statuses.weak, wd);
            target.statuses.lock = 2;
            events.push(`${target.name}被锁魂，${wd} 回合内攻势受挫、无法蓄力。`);
          }
          break;
        }
        case "spell_soul_05": {
          const soulBen = str(state.benming_school, "") === "soul" ? 1.2 : 1;
          const sd = Math.round((35 + 10 * lv) * this._powerMult(battle) * soulBen);
          target.hp = Math.max(0, target.hp - sd);
          events.push(`魂灭道消对${target.name}造成 ${sd} 真伤。`);
          if (target.hp > 0) {
            if (battle.source === "boss" || battle.source === "breakthrough" || battle.source === "array") {
              const td = Math.round(target.hpMax * 0.3); target.hp = Math.max(0, target.hp - td);
              events.push(`魂灭之力直捣元神，${target.name}再受 ${td} 真伤！`);
            } else if (Math.random() < 0.2) { target.hp = 0; events.push("魂灭道消——元神俱灭！"); }
          }
          break;
        }
        case "spell_calamity_04": {
          const cal = num(state.resources.calamity);
          const bonus = Math.floor(cal / 100) * 10;
          state.resources.calamity = 0; SaveManager.save(state);
          hit(target, 28 + 8 * lv + bonus, "calamity", "劫气化刃");
          const sh = Math.max(1, Math.round(battle.playerHpMax * 0.1));
          battle.playerHp = Math.max(1, battle.playerHp - sh);
          events.push(`劫气化刃，耗尽劫气（+${bonus} 威力），你受 ${sh} 反噬。`);
          break;
        }
        case "spell_calamity_05": {
          hit(target, 60 + 20 * lv, "calamity", "万劫归一");
          const sh = Math.max(1, Math.round(battle.playerHpMax * 0.2));
          battle.playerHp = Math.max(1, battle.playerHp - sh);
          battle.rageAllTurns = 3;
          events.push(`万劫归一——你受 ${sh} 反噬，杀意滔天，后续诸牌威力 ×1.5（3 回合）！`);
          break;
        }
        case "talisman_fire":
          hit(target, 10 + 5 * lv, "fire", "火符");
          if (target.hp > 0) { target.statuses.burn += (4 + lv) * this._powerMult(battle); events.push(`${target.name}被符火缠身（燃烧 ${target.statuses.burn}）。`); }
          events.push("火符燃尽，化为飞灰。");
          break;
        case "talisman_thunder":
          hit(target, 12 + 6 * lv, "thunder", "雷符");
          if (target.hp > 0) { target.statuses.mark += 1; events.push(`${target.name}烙下雷殛标记。`); }
          events.push("雷符炸裂，电光消散。");
          break;
        case "talisman_guard": {
          const gblk = (10 + 6 * lv) * this._powerMult(battle);
          battle.playerBlock += gblk; battle.playerStatuses.shield += 1;
          events.push(`护身符亮起：罡气 +${gblk}，圣盾 1 层。`);
          break;
        }
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
    // P1 生活技艺·画符：符咒打出即消耗一枚存货
    if (CARD_DEFS[card.id] && CARD_DEFS[card.id].kind === "talisman") {
      const ttype = CARD_DEFS[card.id].talisman;
      const arr = state.talismans || [];
      const ti = arr.findIndex((x) => x.type === ttype);
      if (ti >= 0) { arr.splice(ti, 1); SaveManager.save(state); }
    }
    battle.cardsPlayed = int(battle.cardsPlayed) + 1;
    this._checkEnd(state, battle);
    events.push(...battle.pendingEvents.splice(0));
    return events;
  },

  endPlayerTurn(state, battle) {
    if (battle.done) return [];
    const events = [];
    // 敌方阶段：执行意图
    for (const e of battle.enemies.filter((x) => x.hp > 0)) {
        if (e.statuses.stun > 0) {
          e.statuses.stun -= 1;
          events.push(`${e.name}被雷网束缚，无法行动！`);
          continue;
        }
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
        if (num(e.statuses.lock) > 0) { events.push(`${e.name}被锁魂，蓄势被打断。`); }
        else e.charged = true;
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
    for (const e of battle.enemies.filter((x) => x.hp > 0 && (x.statuses.burn > 0 || x.statuses.pctBurn > 0))) {
      const burnDmg = (str(state.benming_school, "") === "fire") ? Math.round(e.statuses.burn * 1.3) : e.statuses.burn;
      const pctDmg = num(e.statuses.pctBurn) > 0 ? Math.round(e.hpMax * num(e.statuses.pctBurn)) : 0;
      const total = burnDmg + pctDmg;
      if (total > 0) { e.hp = Math.max(0, e.hp - total); events.push(`${e.name}被灵火灼烧，受 ${total} 燃烧伤害${pctDmg > 0 ? "（含灼魂）" : ""}。`); }
      e.statuses.burn = Math.max(0, e.statuses.burn - 1);
      if (num(e.statuses.pctBurn) > 0) e.statuses.pctBurn = Math.max(0, num(e.statuses.pctBurn) - 0.01);
    }
    // 持续状态衰减
    for (const e of battle.enemies) {
      e.statuses.weak = Math.max(0, e.statuses.weak - 1);
      e.statuses.vuln = Math.max(0, e.statuses.vuln - 1);
      if (num(e.statuses.lock) > 0) e.statuses.lock = Math.max(0, e.statuses.lock - 1);
    }
    battle.playerStatuses.weak = Math.max(0, battle.playerStatuses.weak - 1);

    this._processMechanicEnemyPhase(state, battle);
    this._checkEnd(state, battle);
    events.push(...battle.pendingEvents.splice(0));
    if (!battle.done) this._startPlayerTurn(state, battle);
    return events;
  },

  _damagePlayer(state, battle, value) {
    if (battle.mechanic === "picture_world" && battle.pictureWorld > 0) value = Math.round(value * 0.5);
    if (battle.playerStatuses.shield > 0) {
      if (battle.playerStatuses.dodge > 0) {
        battle.playerStatuses.dodge -= 1;
        return 0;
      }
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
    if (battle.mechanic === "immortal") {
      const main = battle.enemies.find(e => e.isMain || true);
      if (main && main.hp <= 0 && !main._oneShotKill) { main._oneShotKill = true; }
    }
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

  // ---------- Boss 特殊机制 ----------

  _processMechanicTurnStart(state, battle) {
    const mech = battle.mechanic;
    if (!mech) return;
    const ms = battle.mechanicState;
    ms.turnCount += 1;
    switch (mech) {
      case "block_regen": {
        const main = battle.enemies.find(e => e.hp > 0);
        if (main) { const regen = Math.round(main.hpMax * 0.2); main.block += regen; battle.pendingEvents.push(`${main.name}罡气自复（+${regen}）。`); }
        break;
      }
      case "realm_cut": {
        const cut = ms.turnCount >= 6 ? 0.08 : 0.05;
        battle.playerHpMax = Math.max(1, Math.round(battle.playerHpMax * (1 - cut)));
        battle.playerHp = Math.min(battle.playerHp, battle.playerHpMax);
        battle.pendingEvents.push(`削境之力侵蚀，你的气血上限 -${Math.round(cut * 100)}%。`);
        break;
      }
      case "five_rotate": {
        ms.rotateIndex = (ms.rotateIndex + 1) % 5;
        const names = ["雷", "火", "剑", "魂", "劫"];
        battle.pendingEvents.push(`万仙阵灵切换形态——本回合免疫${names[ms.rotateIndex]}系。`);
        break;
      }
      case "alchemy": {
        if (ms.turnCount % 2 === 0) {
          const main = battle.enemies.find(e => e.hp > 0);
          if (main) { const heal = Math.round(main.hpMax * 0.1); main.hp = Math.min(main.hpMax, main.hp + heal); battle.pendingEvents.push(`老君残影炼成一丹，服下后回复 ${heal} 气血。`); }
        }
        break;
      }
      case "pearl_barrage": {
        if (ms.pearlsUsed >= 24 && ms.pearlsUsed < 26) {
          const main = battle.enemies.find(e => e.hp > 0);
          if (main && main.statuses.weak <= 0) { main.statuses.weak = 2; battle.pendingEvents.push("二十四颗定海珠用尽，赵公明残影陷入虚弱！"); }
        }
        if (ms.pearlsUsed >= 26) ms.pearlsUsed = 0;
        break;
      }
      case "four_swords": {
        const main = battle.enemies.find(e => e.hp > 0);
        if (main) {
          const swords = [
            { type: "attack", value: Math.round(main.power * 0.28), label: "诛仙剑落", short: "诛仙" },
            { type: "attack", value: Math.round(main.power * 0.30), label: "戮仙剑斩", short: "戮仙" },
            { type: "curse_burn", ratio: 0.04, label: "陷仙剑火", short: "陷仙" },
            { type: "attack", value: Math.round(main.power * 0.32), label: "绝仙剑灭", short: "绝仙" },
          ];
          main.intent = swords[(ms.turnCount - 1) % 4];
        }
        break;
      }
      default: break;
    }
  },

  _processMechanicEnemyPhase(state, battle) {
    const mech = battle.mechanic;
    if (!mech) return;
    const ms = battle.mechanicState;
    switch (mech) {
      case "summon": {
        if (ms.turnCount % 2 === 0) {
          const main = battle.enemies.find(e => e.hp > 0 && !e.isAdd);
          if (main && battle.enemies.filter(e => e.hp > 0).length < 4) {
            const add = this._mkEnemy("小妖", Math.round(main.hpMax * 0.2)); add.isAdd = true;
            battle.enemies.push(add);
            battle.pendingEvents.push(`${main.name}召唤了一只小妖！`);
          }
        }
        break;
      }
      case "army_formation": {
        if (ms.turnCount % 3 === 0) {
          const main = battle.enemies.find(e => e.hp > 0 && !e.isAdd);
          if (main) {
            for (let i = 0; i < 3 && battle.enemies.filter(e => e.hp > 0).length < 5; i++) {
              const add = this._mkEnemy("甲士", Math.round(main.hpMax * 0.15)); add.isAdd = true;
              battle.enemies.push(add);
            }
            battle.pendingEvents.push(`${main.name}重新召集甲士列阵！`);
          }
        }
        break;
      }
      case "double_strike": {
        const main = battle.enemies.find(e => e.hp > 0);
        if (main && main.intent && main.intent.type === "attack") {
          const extraDmg = this._damagePlayer(state, battle, Math.max(1, Math.round(main.power * 0.12)));
          if (extraDmg > 0) battle.pendingEvents.push(`${main.name}连刺第二枪！你额外受 ${extraDmg} 伤害。`);
        }
        break;
      }
      case "six_soul": {
        if (ms.turnCount % 2 === 0) {
          battle.playerBlock = 0; battle.playerStatuses.shield = 0; battle.rageStack = 0; battle.thunderBoost = 0;
          battle.pendingEvents.push("六魂幡摇动——你的罡气、圣盾、增益尽散！");
        }
        break;
      }
      case "five_light": {
        if (ms.turnCount % 3 === 0) {
          const usable = battle.hand.filter(c => !c.used && !(c.disabled > 0));
          if (usable.length) {
            const pick = usable[Math.floor(Math.random() * usable.length)];
            pick.disabled = 2;
            battle.pendingEvents.push(`五色神光刷走了「${CARD_DEFS[pick.id]?.name || pick.id}」！该牌 2 回合内不可用。`);
          }
        }
        break;
      }
      case "pearl_barrage": {
        const main = battle.enemies.find(e => e.hp > 0);
        if (main && ms.pearlsUsed < 24) {
          for (let i = 0; i < 3; i++) { ms.pearlsUsed += 1; const d = this._damagePlayer(state, battle, Math.max(1, Math.round(main.power * 0.08))); }
          battle.pendingEvents.push(`赵公明残影投出定海珠（已用 ${ms.pearlsUsed}/24）！`);
        }
        break;
      }
      case "picture_world": {
        if (ms.turnCount % 4 === 0) {
          battle.pictureWorld = 3;
          battle.pendingEvents.push("女娲残影展开山河社稷图——你被拉入图中！3 回合内伤害 -50%，但受到的伤害也 -50%。");
        }
        break;
      }
      case "charge_strike": {
        const main = battle.enemies.find(e => e.hp > 0);
        if (main && ms.turnCount % 3 === 0) {
          const dmg = this._damagePlayer(state, battle, Math.round(main.power * 0.5));
          events.push(`${main.name}蓄力重击，你受 ${dmg} 伤害！`);
        }
        break;
      }
      case "pangu_strike": {
        const main = battle.enemies.find(e => e.hp > 0);
        if (main) {
          if (ms.turnCount % 3 === 0) {
            const dmg = this._damagePlayer(state, battle, Math.round(main.power * 0.8));
            events.push(`${main.name}开天一击！你受 ${dmg} 伤害！`);
          } else {
            main.block += Math.round(main.hpMax * 0.3);
            events.push(`${main.name}罡气护体。`);
          }
        }
        break;
      }
      case "immortal": {
        const main = battle.enemies.find(e => e.hp > 0);
        if (main && !main._oneShotKill) {
          main.hp = main.hpMax;
          battle.pendingEvents.push(`${main.name}被榜文照身，满血复活！唯有单回合打出超过其气血上限的伤害才能击杀。`);
        }
        break;
      }
      default: break;
    }
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

