"use strict";

// ===== 战斗引擎 V2：斗法栏连锁制 =====
// 配招5分钟，斗法全自动。
// 核心：栏位顺序释放 → 同系连锁×1.3 → 三连终极 → Boss抗性/弱点

const BattleEngineV2 = {
  // ---------- 数据获取 ----------

  getSkillData(skillId) {
    const rows = DataManager.getRows("skill_table");
    return rows.find((r) => r.id === skillId) || null;
  },

  getUltimateConfig() {
    if (this._ultCache) return this._ultCache;
    // combo_ultimate.json 由 DataManager 加载，结构为 { table, ultimates: {...} }
    const payload = DataManager.tables?.combo_ultimate;
    if (payload && payload.ultimates) {
      this._ultCache = payload.ultimates;
    } else {
      this._ultCache = COMBO_ULTIMATE_FALLBACK;
    }
    return this._ultCache;
  },

  // ---------- 战斗创建 ----------

  create(state, cfg) {
    const slots = this._resolveSlots(state);
    const omen = typeof getTodayOmen === "function" ? getTodayOmen() : {};
    const playerPower = typeof RealmManager !== "undefined" ? RealmManager.getCombatPower(state) : 1000;

    // 敌方构建
    const enemies = [];
    if (cfg.phases) {
      enemies.push(this._mkEnemy(cfg.phases[0].name, Math.round(playerPower * num(cfg.phases[0].power_ratio, 0.8)), cfg.phases[0].pool));
    } else {
      const enemyHp = Math.round(num(cfg.enemy_power, playerPower) * num(omen.enemyMult, 1));
      enemies.push(this._mkEnemy(String(cfg.name || "妖物"), enemyHp));
      for (const add of cfg.adds || []) {
        enemies.push(this._mkEnemy(String(add.name), Math.round(num(add.power) * num(omen.enemyMult, 1))));
      }
    }

    const battle = {
      version: 2,
      name: String(cfg.name || "妖物"),
      source: cfg.source || "normal",
      payload: cfg.payload || {},
      // 玩家
      playerHp: playerPower,
      playerHpMax: playerPower,
      playerBlock: 0,
      playerStatuses: { burn: 0, weak: 0, shield: 0, invincible: 0, reflect: 0 },
      slots: slots,
      benming: str(state.benming_school, ""),
      // 敌方
      enemies: enemies,
      // 流程
      round: 0,
      maxRounds: cfg.maxRounds || 20,
      phases: cfg.phases || null,
      phaseIndex: 0,
      // 机制
      mechanic: cfg.mechanic || null,
      weakness: cfg.weakness || null,
      mechanicState: { turnCount: 0 },
      // 终极
      ultimateUsed: false,
      // 劫修叠加
      rageStack: 0,
      rageAllTurns: 0,
      // 火域
      fireDomainTurns: 0,
      fireDomainBurn: 0,
      // 练气终稿新增状态
      _lastSlotType: null,
      _nextElementBonus: null,
      _selfBurnTurns: 0,
      _selfBurnCost: 0,
      _atkBuffMult: 1,
      _atkBuffTurns: 0,
      _missChance: 0,
      _missTurns: 0,
      _revengeBonus: 0,
      _revengeActive: false,
      _reflectRatio: 0.5,
      _racePassive: null,
      // 日志
      log: [],
      pendingEvents: [],
      // 状态
      done: false,
      win: false,
      // 演出速度
      speed: 1,
      // 教学
      tutorial: !state.flags?.battle_v2_tutorial_done,
    };

    // 开局buff（法宝被动、势力、神位等）
    this._applyStartBuffs(state, battle);

    return battle;
  },

  _resolveSlots(state) {
    const slotIds = state.battle_slots || [];
    const slots = [];
    for (const id of slotIds) {
      const data = this.getSkillData(id);
      if (data) {
        const lv = int(state.skill_levels?.[id], 1);
        slots.push({ ...data, level: lv });
      }
    }
    // 如果玩家没配（新存档），给默认体系三连
    if (slots.length === 0) {
      const defaults = ["skill_body_01", "skill_thunder_01", "skill_fire_01"];
      for (const id of defaults) {
        const data = this.getSkillData(id);
        if (data) slots.push({ ...data, level: 1 });
      }
    }
    return slots;
  },

  _mkEnemy(name, hp, intentPool) {
    return {
      name,
      hp,
      hpMax: hp,
      power: hp,
      block: 0,
      charged: false,
      statuses: { burn: 0, weak: 0, vuln: 0, mark: 0, stun: 0, lock: 0, paralyze: 0, burnMultiplier: 1, burnMultiplierTurns: 0, pctBurn: 0 },
      intent: null,
      intentPool: intentPool || null,
      resistance: {},
      weakness: {},
      isAdd: false,
    };
  },

  _applyStartBuffs(state, battle) {
    // 法宝被动（保留旧系统的RELIC_EFFECTS）
    if (typeof RELIC_EFFECTS !== "undefined") {
      for (const tid of Object.keys(state.treasures || {})) {
        if (int(state.treasures[tid]?.level) > 0 && RELIC_EFFECTS[tid]?.startShield) {
          battle.playerStatuses.shield += RELIC_EFFECTS[tid].startShield;
        }
      }
    }
    // 势力buff（design/7.2 v0.2）
    // 阐教·玉虚炼器：合成法宝已永久计入 state.treasures 战力，无需临时 buff。
    // 截教·万仙阵法：携带阵法卡 → 首回合敌方全体受伤加成（数值由阵法卡等级决定）。
    const arrayBuffMult = (typeof Game !== "undefined" && Game.getArrayFirstRoundBonus) ? num(Game.getArrayFirstRoundBonus(state), 0) : 0;
    if (arrayBuffMult > 0) {
      battle.arrayBuffMult = arrayBuffMult;
      battle.pendingEvents.push(`截教万仙阵法：首回合敌方受伤 +${Math.round(arrayBuffMult * 100)}%。`);
    }
    // 本命流派提示
    if (battle.benming) {
      const names = { thunder: "雷", fire: "火", weapon: "器", soul: "魂", calamity: "劫", body: "体" };
      battle.pendingEvents.push(`本命流派·${names[battle.benming] || battle.benming}修——连锁加成强化。`);
    }
    // 种族战斗被动初始化
    const raceId = str(state.race_id, state.race || "");
    if (raceId) {
      battle._racePassive = raceId;
      const racePassiveNames = {
        human: "苦修之躯",
        yao: "本命妖力",
        xiantian: "天生灵觉",
        qilin: "祥瑞护体"
      };
      if (racePassiveNames[raceId]) {
        battle.pendingEvents.push(`种族被动·${racePassiveNames[raceId]}生效。`);
      }
    }
  },

  // ---------- 主循环（一步执行一轮，供UI逐帧调用） ----------

  // 执行一轮玩家攻击（所有栏位按序释放）
  executePlayerRound(state, battle) {
    if (battle.done) return [];
    const events = [];
    battle.round += 1;
    battle.mechanicState.turnCount += 1;

    // 火域结算（回合开始）
    if (battle.fireDomainTurns > 0) {
      for (const e of battle.enemies.filter((x) => x.hp > 0)) {
        const domainDmg = battle.fireDomainBurn * this._powerMult(battle);
        e.hp = Math.max(0, e.hp - domainDmg);
        e.statuses.burn += Math.round(battle.fireDomainBurn * 0.5);
        events.push({ type: "fire_domain", target: e.name, damage: domainDmg });
      }
      battle.fireDomainTurns -= 1;
    }

    // Boss机制·回合开始
    this._processMechanicTurnStart(state, battle, events);

    // 逐格释放
    const aliveEnemies = () => battle.enemies.filter((e) => e.hp > 0);
    let roundDamage = 0; // 用于魂系终极回血

    for (let i = 0; i < battle.slots.length; i++) {
      if (aliveEnemies().length === 0) break;
      const skill = battle.slots[i];
      const target = aliveEnemies().reduce((a, b) => (a.hp < b.hp ? a : b), aliveEnemies()[0]);

      // 基础伤害
      let dmg = this._calcBaseDamage(skill, battle);
      // 引雷符：下一同系加成消耗
      if (battle._nextElementBonus && battle._nextElementBonus.element === skill.spell_type) {
        dmg = Math.floor(dmg * (1 + battle._nextElementBonus.bonus));
        battle._nextElementBonus = null;
      }

      // 连锁判定：与前一格同系
      let comboMult = 1;
      let comboTriggered = false;
      if (i > 0 && battle.slots[i - 1].spell_type === skill.spell_type) {
        comboMult = this._getComboMultiplier(battle.benming, skill.spell_type);
        comboTriggered = true;
      }
      dmg = Math.floor(dmg * comboMult);

      // 劫修叠加
      if (battle.rageStack > 0) {
        dmg = Math.floor(dmg * (1 + 0.15 * battle.rageStack));
      }
      if (battle.rageAllTurns > 0) {
        dmg = Math.floor(dmg * 1.5);
      }

      // 抗性/弱点
      dmg = this._applyResistance(dmg, skill.spell_type, target, battle);

      // 全局乘区
      dmg = this._applyGlobalMult(dmg, state, battle, skill);

      // 特殊效果
      const specialResult = this._applySpecialEffect(skill, target, battle, state, dmg);
      dmg = specialResult.finalDamage;

      // 应用伤害
      const actualDmg = this._dealDamageToEnemy(target, dmg, battle);
      roundDamage += actualDmg;

      // 日志
      events.push({
        type: "attack",
        slotIndex: i,
        skillName: skill.name,
        element: skill.spell_type,
        damage: actualDmg,
        combo: comboTriggered,
        comboMult: comboMult,
        targetName: target.name,
        special: specialResult.event || null,
      });

      // 检查击杀
      if (target.hp <= 0) {
        events.push({ type: "kill", targetName: target.name });
      }
    }

    // 三连终极检测（在逐格释放后检测连续三格）
    if (!battle.ultimateUsed) {
      const ultResult = this._checkAndApplyUltimate(battle, state, roundDamage);
      if (ultResult) {
        events.push(ultResult);
        battle.ultimateUsed = true;
      }
    }

    // 魂系终极回血（六魂尽灭）
    if (battle._soulUltimateActive) {
      const heal = Math.round(roundDamage * 1.0);
      battle.playerHp = Math.min(battle.playerHpMax, battle.playerHp + heal);
      events.push({ type: "lifesteal", amount: heal });
      battle._soulUltimateActive = false;
    }

    // 劫修被动：每出一招叠加
    if (battle.benming === "calamity") {
      battle.rageStack += 1;
    }

    // 检查胜利
    if (battle.enemies.every((e) => e.hp <= 0)) {
      this._checkPhaseOrWin(battle, events);
    }

    return events;
  },

  // 执行敌方回合
  executeEnemyRound(state, battle) {
    if (battle.done) return [];
    const events = [];

    for (const e of battle.enemies.filter((x) => x.hp > 0)) {
      // 麻痹/眩晕检查
      if (e.statuses.paralyze > 0) {
        e.statuses.paralyze -= 1;
        events.push({ type: "enemy_paralyzed", name: e.name });
        continue;
      }
      if (e.statuses.stun > 0) {
        e.statuses.stun -= 1;
        events.push({ type: "enemy_stunned", name: e.name });
        continue;
      }

      // 蓄力重击
      if (e.charged) {
        const dmg = this._damagePlayer(state, battle, Math.max(1, Math.round(e.power * 0.35)));
        e.charged = false;
        events.push({ type: "enemy_charged_attack", name: e.name, damage: dmg });
        continue;
      }

      // 意图执行
      const intent = e.intent || this._rollIntent(e);
      if (intent.type === "attack") {
        let value = intent.value || Math.max(1, Math.round(e.power * 0.2));
        if (e.statuses.weak > 0) {
          const weakRed = e.statuses.weakReduction || 0.25;
          value = Math.max(1, Math.round(value * (1 - weakRed)));
        }
        // 雷震：slow减伤
        if (e.statuses.slow > 0) {
          value = Math.max(1, Math.round(value * (1 - (e.statuses.slowReduction || 0.3))));
          e.statuses.slow -= 1;
        }
        // 迷心术：miss判定
        if (battle._missTurns > 0 && battle._missChance > 0 && Math.random() < battle._missChance) {
          events.push({ type: "enemy_miss", name: e.name });
          e.intent = null;
          continue;
        }
        const dmg = this._damagePlayer(state, battle, value);
        // 噬血诀：受伤后激活revenge
        if (dmg > 0 && battle._revengeBonus > 0) battle._revengeActive = true;
        events.push({ type: "enemy_attack", name: e.name, label: intent.label || "扑击", damage: dmg });
      } else if (intent.type === "charge") {
        if (e.statuses.lock > 0) {
          events.push({ type: "enemy_charge_blocked", name: e.name });
        } else {
          e.charged = true;
          events.push({ type: "enemy_charge", name: e.name, label: intent.label || "蓄势" });
        }
      } else if (intent.type === "block") {
        e.block += intent.value || Math.round(e.power * 0.08);
        events.push({ type: "enemy_block", name: e.name, block: e.block });
      } else if (intent.type === "curse_burn") {
        const burnDmg = Math.max(2, Math.round(e.power * num(intent.ratio, 0.03)));
        battle.playerStatuses.burn += burnDmg;
        events.push({ type: "enemy_burn", name: e.name, burn: burnDmg });
      } else if (intent.type === "curse_weak") {
        battle.playerStatuses.weak = 2;
        events.push({ type: "enemy_weak", name: e.name });
      }
      e.intent = null;
    }

    // 燃烧结算（玩家）
    if (battle.playerStatuses.burn > 0) {
      battle.playerHp = Math.max(0, battle.playerHp - battle.playerStatuses.burn);
      events.push({ type: "player_burn", damage: battle.playerStatuses.burn });
      battle.playerStatuses.burn = Math.max(0, battle.playerStatuses.burn - 1);
    }

    // 燃烧结算（敌方）
    for (const e of battle.enemies.filter((x) => x.hp > 0)) {
      if (e.statuses.burn > 0 || e.statuses.pctBurn > 0) {
        const mult = e.statuses.burnMultiplier || 1;
        const burnDmg = Math.round(e.statuses.burn * mult);
        const pctDmg = e.statuses.pctBurn > 0 ? Math.round(e.hpMax * e.statuses.pctBurn) : 0;
        const total = burnDmg + pctDmg;
        if (total > 0) {
          e.hp = Math.max(0, e.hp - total);
          events.push({ type: "enemy_burn_tick", name: e.name, damage: total });
        }
        e.statuses.burn = Math.max(0, e.statuses.burn - 1);
        if (e.statuses.pctBurn > 0) e.statuses.pctBurn = Math.max(0, e.statuses.pctBurn - 0.01);
      }
      // 状态衰减
      e.statuses.weak = Math.max(0, e.statuses.weak - 1);
      e.statuses.vuln = Math.max(0, e.statuses.vuln - 1);
      e.statuses.lock = Math.max(0, e.statuses.lock - 1);
      if (e.statuses.burnMultiplierTurns > 0) {
        e.statuses.burnMultiplierTurns -= 1;
        if (e.statuses.burnMultiplierTurns <= 0) e.statuses.burnMultiplier = 1;
      }
    }

    // 玩家状态衰减
    battle.playerStatuses.weak = Math.max(0, battle.playerStatuses.weak - 1);
    if (battle.playerStatuses.invincible > 0) battle.playerStatuses.invincible -= 1;
    if (battle.playerStatuses.reflect > 0) battle.playerStatuses.reflect -= 1;
    if (battle.rageAllTurns > 0) battle.rageAllTurns -= 1;

    // Boss机制·敌方阶段
    this._processMechanicEnemyPhase(state, battle, events);

    // 赤焰缠身：自灼结算
    if (battle._selfBurnTurns > 0) {
      const selfBurnDmg = Math.max(1, Math.round(battle.playerHpMax * battle._selfBurnCost));
      battle.playerHp = Math.max(1, battle.playerHp - selfBurnDmg);
      battle._selfBurnTurns -= 1;
      events.push({ type: "self_burn_tick", damage: selfBurnDmg, turns_left: battle._selfBurnTurns });
    }
    // 赤焰缠身：攻击buff衰减
    if (battle._atkBuffTurns > 0) battle._atkBuffTurns -= 1;
    // 迷心术：miss衰减
    if (battle._missTurns > 0) battle._missTurns -= 1;

    // 检查死亡
    if (battle.playerHp <= 0) {
      battle.done = true;
      battle.win = false;
      events.push({ type: "player_defeated" });
    }
    if (battle.round >= battle.maxRounds && !battle.done) {
      battle.done = true;
      battle.win = false;
      events.push({ type: "timeout" });
    }

    // 为下一轮准备敌方意图
    if (!battle.done) {
      for (const e of battle.enemies.filter((x) => x.hp > 0)) {
        e.intent = this._rollIntent(e);
      }
    }

    return events;
  },

  // 完整自动战斗（一次性跑完，用于跳过/快速结算）
  runFullAuto(state, battle) {
    const allEvents = [];
    while (!battle.done && battle.round < battle.maxRounds) {
      const playerEvents = this.executePlayerRound(state, battle);
      allEvents.push(...playerEvents);
      if (battle.done) break;
      const enemyEvents = this.executeEnemyRound(state, battle);
      allEvents.push(...enemyEvents);
    }
    if (!battle.done) {
      battle.done = true;
      battle.win = false;
    }
    return allEvents;
  },

  // ---------- 伤害计算 ----------

  _calcBaseDamage(skill, battle) {
    const lv = int(skill.level, 1);
    return skill.damage_base + skill.damage_growth * (lv - 1);
  },

  _getComboMultiplier(benming, elementType) {
    // 本命流派对应系连锁加成强化
    if (benming === elementType) {
      if (elementType === "thunder") return 1.5;
      if (elementType === "weapon") return 1.4;
      return 1.4;
    }
    return 1.3;
  },

  _applyResistance(dmg, elementType, enemy, battle) {
    // Boss抗性
    if (enemy.resistance[elementType]) {
      dmg = Math.floor(dmg * (1 - enemy.resistance[elementType]));
    }
    // Boss弱点
    if (enemy.weakness[elementType]) {
      dmg = Math.floor(dmg * (1 + enemy.weakness[elementType]));
    }
    // 战斗级弱点（boss_table.weakness数组）
    if (battle.weakness && battle.weakness.includes(elementType)) {
      dmg = Math.floor(dmg * 1.3);
    }
    // 易伤状态
    if (enemy.statuses.vuln > 0) {
      dmg = Math.floor(dmg * 1.5);
    }
    return Math.max(1, dmg);
  },

  _applyGlobalMult(dmg, state, battle, skill) {
    let mult = this._powerMult(battle);
    // 法宝被动
    if (typeof RELIC_EFFECTS !== "undefined") {
      for (const tid of Object.keys(state.treasures || {})) {
        if (int(state.treasures[tid]?.level) > 0 && RELIC_EFFECTS[tid]?.dmgBonus) {
          mult += RELIC_EFFECTS[tid].dmgBonus;
        }
      }
    }
    // 势力buff
    if (battle.factionDmgMult) mult *= battle.factionDmgMult;
    // 截教首回合（design/7.2 v0.2：阵法卡数值加成）
    if (num(battle.arrayBuffMult, 0) > 0 && battle.round === 1) mult *= (1 + num(battle.arrayBuffMult, 0));
    // 本命流派被动
    mult *= this._benmingPassiveMult(battle, skill.spell_type);
    // 劫修buff
    if (battle.buffMult && battle.buffTurns > 0) mult *= battle.buffMult;
    // 赤焰缠身：攻击buff
    if (battle._atkBuffTurns > 0) mult *= battle._atkBuffMult;
    // 噬血诀：受伤后下回合+50%
    if (battle._revengeActive && battle._revengeBonus > 0) {
      mult *= (1 + battle._revengeBonus);
      battle._revengeActive = false;
    }
    // 种族被动·妖：体系术法伤害+15%
    if (battle._racePassive === "yao" && battle.benming === skill.spell_type) mult *= 1.15;
    // 种族被动·先天：暴击率+10%（暴击=2倍伤害）
    if (battle._racePassive === "xiantian" && Math.random() < 0.10) mult *= 2;

    return Math.floor(dmg * mult);
  },

  _benmingPassiveMult(battle, elementType) {
    const bm = battle.benming;
    if (!bm) return 1;
    if (bm === "thunder" && elementType === "thunder" && battle.round === 1 && !battle._benmingThunderUsed) {
      battle._benmingThunderUsed = true;
      return 1.5;
    }
    if (bm === "weapon" && elementType === "weapon") return 1.25;
    if (bm === "soul" && elementType === "soul") return 1.2;
    if (bm === "fire" && elementType === "fire") return 1.3;
    return 1;
  },

  _powerMult(battle) {
    return Math.max(1, Math.round(battle.playerHpMax / 200));
  },

  _dealDamageToEnemy(enemy, dmg, battle) {
    // 罡气吸收
    if (enemy.block > 0) {
      const absorbed = Math.min(enemy.block, dmg);
      enemy.block -= absorbed;
      dmg -= absorbed;
    }
    enemy.hp = Math.max(0, enemy.hp - dmg);
    return dmg;
  },

  _damagePlayer(state, battle, value) {
    // 无敌
    if (battle.playerStatuses.invincible > 0) {
      // 反弹
      if (battle.playerStatuses.reflect > 0) {
        const reflectDmg = Math.round(value * (battle._reflectRatio || 0.5));
        const mainEnemy = battle.enemies.find((e) => e.hp > 0);
        if (mainEnemy) {
          mainEnemy.hp = Math.max(0, mainEnemy.hp - reflectDmg);
          battle.pendingEvents.push({ type: "reflect", damage: reflectDmg, target: mainEnemy.name });
        }
      }
      return 0;
    }
    // 圣盾
    if (battle.playerStatuses.shield > 0) {
      battle.playerStatuses.shield -= 1;
      return 0;
    }
    // 罡气
    let dmg = value;
    if (battle.playerBlock > 0) {
      const absorbed = Math.min(battle.playerBlock, dmg);
      battle.playerBlock -= absorbed;
      dmg -= absorbed;
    }
    // 种族被动·麒麟：HP<30%受伤-30%
    if (battle._racePassive === "qilin" && battle.playerHp / Math.max(1, battle.playerHpMax) < 0.3) {
      dmg = Math.round(dmg * 0.7);
    }
    // 转劫术：反弹（使用可配置比例）
    if (battle.playerStatuses.reflect > 0 && dmg > 0) {
      const reflectDmg = Math.round(dmg * (battle._reflectRatio || 0.5));
      const mainEnemy = battle.enemies.find((e) => e.hp > 0);
      if (mainEnemy) {
        mainEnemy.hp = Math.max(0, mainEnemy.hp - reflectDmg);
        battle.pendingEvents.push({ type: "reflect", damage: reflectDmg, target: mainEnemy.name });
      }
    }
    battle.playerHp = Math.max(0, battle.playerHp - dmg);
    return dmg;
  },

  // ---------- 特殊效果 ----------

  _applySpecialEffect(skill, target, battle, state, baseDmg) {
    const effect = skill.special_effect;
    const params = skill.special_params || {};
    const result = { finalDamage: baseDmg, event: null };
    if (!effect) return result;

    switch (effect) {
      case "self_block": {
        const block = Math.round(battle.playerHpMax * num(params.block_ratio, 0.08));
        battle.playerBlock += block;
        result.event = { type: "self_block", amount: block };
        break;
      }
      case "shield_1": {
        battle.playerStatuses.shield += int(params.shield, 1);
        result.event = { type: "shield", amount: int(params.shield, 1) };
        break;
      }
      case "shield_block": {
        battle.playerStatuses.shield += int(params.shield, 1);
        const block = Math.round(battle.playerHpMax * num(params.block_ratio, 0.15));
        battle.playerBlock += block;
        result.event = { type: "shield_block", shield: int(params.shield, 1), block };
        break;
      }
      case "stun_chance": {
        if (Math.random() < num(params.chance, 0.25)) {
          target.statuses.stun += int(params.turns, 1);
          result.event = { type: "stun", target: target.name, turns: int(params.turns, 1) };
        }
        break;
      }
      case "stun": {
        target.statuses.stun += int(params.turns, 1);
        result.event = { type: "stun", target: target.name, turns: int(params.turns, 1) };
        break;
      }
      case "mark": {
        target.statuses.mark += int(params.marks, 1);
        result.event = { type: "mark", target: target.name, marks: target.statuses.mark };
        break;
      }
      case "mark_detonate": {
        target.statuses.mark += 1;
        if (target.statuses.mark >= int(params.marks_required, 3)) {
          const bonus = Math.round(num(params.bonus_damage, 60) * this._powerMult(battle));
          target.hp = Math.max(0, target.hp - bonus);
          target.statuses.mark = 0;
          result.event = { type: "mark_detonate", target: target.name, bonus };
          result.finalDamage += bonus;
        } else {
          result.event = { type: "mark", target: target.name, marks: target.statuses.mark };
        }
        break;
      }
      case "burn": {
        const burnVal = (int(params.burn_base, 15) + int(params.burn_growth, 3) * int(skill.level, 1)) * this._powerMult(battle);
        target.statuses.burn += burnVal;
        result.event = { type: "burn", target: target.name, burn: burnVal };
        break;
      }
      case "burn_spread": {
        const burnVal = (int(params.burn_base, 20) + int(params.burn_growth, 4) * int(skill.level, 1)) * this._powerMult(battle);
        target.statuses.burn += burnVal;
        for (const e of battle.enemies.filter((x) => x.hp > 0 && x !== target)) {
          e.statuses.burn += int(params.spread, 8) * this._powerMult(battle);
        }
        result.event = { type: "burn_spread", target: target.name, burn: burnVal };
        break;
      }
      case "burn_unpurgeable": {
        const burnVal = (int(params.burn_base, 30) + int(params.burn_growth, 6) * int(skill.level, 1)) * this._powerMult(battle);
        target.statuses.burn += burnVal;
        target.statuses.burnUnpurgeable = true;
        result.event = { type: "burn_unpurgeable", target: target.name, burn: burnVal };
        break;
      }
      case "burn_all": {
        const burnVal = (int(params.burn_base, 18) + int(params.burn_growth, 4) * int(skill.level, 1)) * this._powerMult(battle);
        for (const e of battle.enemies.filter((x) => x.hp > 0)) {
          e.statuses.burn += burnVal;
        }
        result.event = { type: "burn_all", burn: burnVal };
        break;
      }
      case "pct_burn": {
        const burnVal = (int(params.burn_base, 25) + int(params.burn_growth, 5) * int(skill.level, 1)) * this._powerMult(battle);
        target.statuses.burn += burnVal;
        target.statuses.pctBurn = num(params.pct, 0.04);
        result.event = { type: "pct_burn", target: target.name, burn: burnVal, pct: num(params.pct, 0.04) };
        break;
      }
      case "fire_domain": {
        battle.fireDomainTurns = int(params.domain_turns, 3);
        battle.fireDomainBurn = int(params.domain_burn, 40);
        for (const e of battle.enemies.filter((x) => x.hp > 0)) {
          e.statuses.burn += battle.fireDomainBurn * this._powerMult(battle);
        }
        result.event = { type: "fire_domain", turns: battle.fireDomainTurns };
        break;
      }
      case "multi_target": {
        // 对全体敌人造成伤害（主目标已算，补其余）
        for (const e of battle.enemies.filter((x) => x.hp > 0 && x !== target)) {
          const splashDmg = this._dealDamageToEnemy(e, Math.round(baseDmg * 0.6), battle);
          result.event = { type: "multi_target", hits: battle.enemies.filter((x) => x.hp > 0).length + 1 };
        }
        break;
      }
      case "ignore_block": {
        const ignore = Math.round(target.block * num(params.ignore_ratio, 0.3));
        target.block = Math.max(0, target.block - ignore);
        if (ignore > 0) result.event = { type: "ignore_block", amount: ignore };
        break;
      }
      case "ignore_all_def": {
        target.block = 0;
        result.event = { type: "ignore_all_def" };
        break;
      }
      case "anti_yao": {
        const isYao = (target.name || "").includes("妖") || (target.tags || []).includes("yao");
        if (isYao) {
          const bonus = Math.round(baseDmg * num(params.bonus_vs_yao, 0.4));
          result.finalDamage += bonus;
          result.event = { type: "anti_yao", bonus };
        }
        break;
      }
      case "chain_kill": {
        if (target.hp <= 0) {
          const next = battle.enemies.find((x) => x.hp > 0);
          if (next) {
            const chainDmg = this._dealDamageToEnemy(next, Math.round(baseDmg * num(params.chain_ratio, 0.5)), battle);
            result.event = { type: "chain_kill", target: next.name, damage: chainDmg };
          }
        }
        break;
      }
      case "true_damage_weak": {
        // 真伤无视罡气（已在_dealDamageToEnemy前处理）
        target.statuses.weak = Math.max(target.statuses.weak, int(params.weak_turns, 1));
        result.event = { type: "weak", target: target.name, turns: int(params.weak_turns, 1) };
        break;
      }
      case "lifesteal": {
        const heal = Math.round(baseDmg * num(params.steal_rate, 0.4));
        battle.playerHp = Math.min(battle.playerHpMax, battle.playerHp + heal);
        result.event = { type: "lifesteal", amount: heal };
        break;
      }
      case "lock": {
        target.statuses.lock = int(params.lock_turns, 2);
        target.statuses.weak = Math.max(target.statuses.weak, int(params.weak_turns, 2));
        result.event = { type: "lock", target: target.name, turns: int(params.lock_turns, 2) };
        break;
      }
      case "instant_kill_chance": {
        const isBoss = battle.source === "boss" || battle.source === "breakthrough" || battle.source === "array";
        if (isBoss) {
          const bonusDmg = Math.round(target.hpMax * num(params.boss_pct, 0.25));
          target.hp = Math.max(0, target.hp - bonusDmg);
          result.finalDamage += bonusDmg;
          result.event = { type: "boss_true_damage", damage: bonusDmg };
        } else if (Math.random() < num(params.chance, 0.15)) {
          target.hp = 0;
          result.event = { type: "instant_kill", target: target.name };
        }
        break;
      }
      case "self_damage": {
        const cost = Math.max(1, Math.round(battle.playerHpMax * num(params.hp_cost, 0.05)));
        battle.playerHp = Math.max(1, battle.playerHp - cost);
        result.event = { type: "self_damage", cost };
        break;
      }
      case "rage_stack": {
        const cost = Math.max(1, Math.round(battle.playerHpMax * num(params.hp_cost, 0.08)));
        battle.playerHp = Math.max(1, battle.playerHp - cost);
        battle.rageStack += 1;
        result.event = { type: "rage_stack", stack: battle.rageStack, cost };
        break;
      }
      case "self_damage_buff": {
        const cost = Math.max(1, Math.round(battle.playerHpMax * num(params.hp_cost, 0.1)));
        battle.playerHp = Math.max(1, battle.playerHp - cost);
        battle.buffMult = num(params.buff_mult, 1.3);
        battle.buffTurns = int(params.buff_turns, 2);
        result.event = { type: "self_damage_buff", cost, mult: battle.buffMult, turns: battle.buffTurns };
        break;
      }
      case "consume_resource": {
        const res = str(params.resource, "calamity");
        const amount = num(state.resources?.[res], 0);
        const bonus = Math.floor(amount / 100) * int(params.bonus_per_100, 50);
        if (state.resources) state.resources[res] = 0;
        result.finalDamage += bonus;
        const cost = Math.max(1, Math.round(battle.playerHpMax * num(params.hp_cost, 0.1)));
        battle.playerHp = Math.max(1, battle.playerHp - cost);
        result.event = { type: "consume_resource", resource: res, bonus, cost };
        break;
      }
      case "sacrifice_rage": {
        const cost = Math.max(1, Math.round(battle.playerHpMax * num(params.hp_cost, 0.2)));
        battle.playerHp = Math.max(1, battle.playerHp - cost);
        battle.rageAllTurns = int(params.rage_turns, 3);
        result.event = { type: "sacrifice_rage", cost, turns: battle.rageAllTurns };
        break;
      }
      case "multi_attack_x3": {
        const hits = int(params.hits, 3);
        const ratio = num(params.each_ratio, 0.5);
        let totalExtra = 0;
        for (let h = 1; h < hits; h++) {
          const extraDmg = this._dealDamageToEnemy(target, Math.round(baseDmg * ratio), battle);
          totalExtra += extraDmg;
        }
        result.finalDamage += totalExtra;
        result.event = { type: "multi_attack", hits, totalExtra };
        break;
      }
      case "splash": {
        for (const e of battle.enemies.filter((x) => x.hp > 0 && x !== target)) {
          const splashDmg = this._dealDamageToEnemy(e, Math.round(baseDmg * num(params.splash_ratio, 0.4)), battle);
        }
        result.event = { type: "splash" };
        break;
      }
      case "execute": {
        if (target.hp > 0 && target.hp <= target.hpMax * num(params.threshold, 0.25)) {
          target.hp = 0;
          result.event = { type: "execute", target: target.name };
        }
        break;
      }
      case "vuln": {
        target.statuses.vuln = Math.max(target.statuses.vuln, int(params.vuln_turns, 2));
        result.event = { type: "vuln", target: target.name, turns: int(params.vuln_turns, 2) };
        break;
      }
      case "purge_enemy": {
        target.block = 0;
        target.statuses.burn = 0;
        target.statuses.shield = 0;
        result.event = { type: "purge_enemy", target: target.name };
        break;
      }

      // ===== 练气终稿30术法新增效果 =====

      case "anti_armor": {
        const ignoreAmt = Math.round(target.block * num(params.ignore_def_pct, 0.2));
        target.block = Math.max(0, target.block - ignoreAmt);
        if (ignoreAmt > 0) result.event = { type: "anti_armor", ignored: ignoreAmt };
        break;
      }
      case "hp_threshold_bonus": {
        const hpRatio = target.hp / Math.max(1, target.hpMax);
        const cond = str(params.condition, "above");
        const threshold = num(params.threshold, 0.5);
        const bonus = num(params.bonus, 0.3);
        if ((cond === "above" && hpRatio > threshold) || (cond === "below" && hpRatio < threshold)) {
          const extraDmg = Math.round(baseDmg * bonus);
          result.finalDamage += extraDmg;
          result.event = { type: "hp_threshold_bonus", bonus: extraDmg, condition: cond };
        }
        break;
      }
      case "combo_second_hit": {
        const prevSlot = battle._lastSlotType;
        if (prevSlot === skill.spell_type) {
          const extraDmg = Math.round(baseDmg * num(params.bonus, 0.4));
          result.finalDamage += extraDmg;
          result.event = { type: "combo_second_hit", bonus: extraDmg };
        }
        battle._lastSlotType = skill.spell_type;
        break;
      }
      case "next_same_element_bonus": {
        battle._nextElementBonus = { element: skill.spell_type, bonus: num(params.bonus, 0.5) };
        result.event = { type: "next_same_element_bonus", element: skill.spell_type, bonus: num(params.bonus, 0.5) };
        break;
      }
      case "slow": {
        target.statuses.slow = int(params.turns, 1);
        target.statuses.slowReduction = num(params.reduction, 0.3);
        result.event = { type: "slow", target: target.name, turns: int(params.turns, 1) };
        break;
      }
      case "boss_bonus": {
        const isBoss = battle.source === "boss" || battle.source === "breakthrough" || battle.source === "array";
        if (isBoss) {
          const extraDmg = Math.round(baseDmg * num(params.bonus, 0.3));
          result.finalDamage += extraDmg;
          result.event = { type: "boss_bonus", bonus: extraDmg };
        }
        break;
      }
      case "kill_bonus": {
        if (target.hp <= 0 || (target.hp - baseDmg) <= 0) {
          const nextEnemy = battle.enemies.find((x) => x.hp > 0 && x !== target);
          if (nextEnemy) {
            const chaseDmg = Math.round(baseDmg * num(params.bonus, 0.6));
            this._dealDamageToEnemy(nextEnemy, chaseDmg, battle);
            result.event = { type: "kill_bonus", target: nextEnemy.name, damage: chaseDmg };
          }
        }
        break;
      }
      case "multi_attack": {
        const hits = int(params.hits, 2);
        const ratio = num(params.each_ratio, 0.6);
        let totalExtra = 0;
        for (let h = 1; h < hits; h++) {
          const extraDmg = this._dealDamageToEnemy(target, Math.round(baseDmg * ratio), battle);
          totalExtra += extraDmg;
        }
        result.finalDamage += totalExtra;
        result.event = { type: "multi_attack", hits, totalExtra };
        break;
      }
      case "self_burn_atk_buff": {
        battle._selfBurnTurns = int(params.turns, 2);
        battle._selfBurnCost = num(params.hp_cost_per_turn, 0.03);
        battle._atkBuffMult = 1 + num(params.atk_bonus, 0.4);
        battle._atkBuffTurns = int(params.turns, 2);
        result.event = { type: "self_burn_atk_buff", turns: int(params.turns, 2), atk_bonus: num(params.atk_bonus, 0.4) };
        break;
      }
      case "weaken_enemy": {
        target.statuses.weak = Math.max(target.statuses.weak, int(params.turns, 1));
        target.statuses.weakReduction = num(params.reduction, 0.25);
        result.event = { type: "weaken_enemy", target: target.name, reduction: num(params.reduction, 0.25), turns: int(params.turns, 1) };
        break;
      }
      case "miss_chance": {
        battle._missChance = num(params.chance, 0.3);
        battle._missTurns = 1;
        result.event = { type: "miss_chance", chance: num(params.chance, 0.3) };
        break;
      }
      case "true_hit": {
        result.event = { type: "true_hit" };
        break;
      }
      case "aoe_weaken": {
        for (const e of battle.enemies.filter((x) => x.hp > 0)) {
          e.statuses.weak = Math.max(e.statuses.weak, int(params.turns, 2));
          e.statuses.weakReduction = num(params.reduction, 0.2);
        }
        result.event = { type: "aoe_weaken", reduction: num(params.reduction, 0.2), turns: int(params.turns, 2) };
        break;
      }
      case "revenge_bonus": {
        battle._revengeBonus = num(params.bonus, 0.5);
        result.event = { type: "revenge_bonus", bonus: num(params.bonus, 0.5) };
        break;
      }
      case "dot": {
        const dotDmg = int(params.damage_per_turn, 40) * this._powerMult(battle);
        const dotTurns = int(params.turns, 3);
        target.statuses.burn += dotDmg;
        target.statuses.dotTurns = Math.max(target.statuses.dotTurns || 0, dotTurns);
        target.statuses.dotFixed = dotDmg;
        result.event = { type: "dot", target: target.name, per_turn: dotDmg, turns: dotTurns };
        break;
      }
      case "self_damage_mult": {
        const cost = Math.max(1, Math.round(battle.playerHpMax * num(params.hp_cost, 0.05)));
        battle.playerHp = Math.max(1, battle.playerHp - cost);
        const mult = num(params.damage_mult, 1.5);
        result.finalDamage = Math.round(baseDmg * mult);
        result.event = { type: "self_damage_mult", cost, mult };
        break;
      }
      case "heal_reduce": {
        target.statuses.healReduce = num(params.reduction, 0.5);
        target.statuses.healReduceTurns = int(params.turns, 2);
        result.event = { type: "heal_reduce", target: target.name, reduction: num(params.reduction, 0.5), turns: int(params.turns, 2) };
        break;
      }
      case "reflect_damage": {
        battle.playerStatuses.reflect = int(params.turns, 1);
        battle._reflectRatio = num(params.ratio, 0.5);
        result.event = { type: "reflect_damage", ratio: num(params.ratio, 0.5), turns: int(params.turns, 1) };
        break;
      }
      case "execute_threshold": {
        const hpPct = target.hp / Math.max(1, target.hpMax);
        if (hpPct < num(params.threshold, 0.3)) {
          const extraDmg = Math.round(baseDmg * num(params.bonus, 0.8));
          result.finalDamage += extraDmg;
          result.event = { type: "execute_threshold", bonus: extraDmg, target: target.name };
        }
        break;
      }
    }
    return result;
  },

  // ---------- 三连终极 ----------

  _checkAndApplyUltimate(battle, state, roundDamage) {
    const slots = battle.slots;
    if (slots.length < 3) return null;

    // 找连续三格同系
    for (let i = 2; i < slots.length; i++) {
      if (slots[i].spell_type === slots[i - 1].spell_type &&
          slots[i].spell_type === slots[i - 2].spell_type) {
        const element = slots[i].spell_type;
        return this._applyUltimate(element, battle, state, roundDamage);
      }
    }
    return null;
  },

  _applyUltimate(element, battle, state, roundDamage) {
    const ults = this.getUltimateConfig();
    const ult = ults[element];
    if (!ult) return null;

    const mainEnemy = battle.enemies.find((e) => e.hp > 0);
    const event = { type: "ultimate", element, name: ult.name, visual_text: ult.visual_text, visual_color: ult.visual_color };

    switch (ult.effect_type) {
      case "invincible_reflect": {
        battle.playerStatuses.invincible = int(ult.duration, 1);
        battle.playerStatuses.reflect = int(ult.duration, 1);
        event.effect = "invincible";
        break;
      }
      case "paralyze_detonate": {
        for (const e of battle.enemies.filter((x) => x.hp > 0)) {
          e.statuses.paralyze += int(ult.paralyze_turns, 1);
          // 引爆雷殛标记
          if (e.statuses.mark > 0) {
            const detonateDmg = e.statuses.mark * 40 * this._powerMult(battle);
            e.hp = Math.max(0, e.hp - detonateDmg);
            event.detonate_damage = (event.detonate_damage || 0) + detonateDmg;
            e.statuses.mark = 0;
          }
        }
        event.effect = "paralyze";
        break;
      }
      case "dot_multiply": {
        for (const e of battle.enemies.filter((x) => x.hp > 0)) {
          e.statuses.burnMultiplier = num(ult.multiplier, 2);
          e.statuses.burnMultiplierTurns = int(ult.duration, 3);
        }
        event.effect = "dot_boost";
        break;
      }
      case "multi_hit": {
        if (mainEnemy) {
          const hitCount = int(ult.hit_count, 5);
          const ratio = num(ult.each_ratio, 0.6);
          let totalDmg = 0;
          const baseDmg = this._calcBaseDamage(battle.slots[0], battle) * this._powerMult(battle);
          for (let h = 0; h < hitCount; h++) {
            const isCrit = ult.each_crit && Math.random() < 0.3;
            const hitDmg = Math.round(baseDmg * ratio * (isCrit ? 2 : 1));
            totalDmg += hitDmg;
            mainEnemy.hp = Math.max(0, mainEnemy.hp - hitDmg);
          }
          event.total_damage = totalDmg;
          event.hits = hitCount;
        }
        event.effect = "multi_hit";
        break;
      }
      case "lifesteal": {
        battle._soulUltimateActive = true;
        event.effect = "lifesteal";
        event.heal = roundDamage; // 将在executePlayerRound末尾结算
        break;
      }
      case "sacrifice_burst": {
        const cost = Math.floor(battle.playerHp * num(ult.hp_cost, 0.5));
        battle.playerHp = Math.max(1, battle.playerHp - cost);
        if (mainEnemy) {
          const burstDmg = Math.round(battle.playerHpMax * num(ult.damage_mult, 3.0));
          mainEnemy.hp = Math.max(0, mainEnemy.hp - burstDmg);
          event.damage = burstDmg;
          event.cost = cost;
        }
        event.effect = "sacrifice";
        break;
      }
    }
    return event;
  },

  // ---------- Boss机制（继承V1的19种） ----------

  _processMechanicTurnStart(state, battle, events) {
    const mech = battle.mechanic;
    if (!mech) return;
    const ms = battle.mechanicState;

    switch (mech) {
      case "block_regen": {
        const main = battle.enemies.find((e) => e.hp > 0);
        if (main) {
          const regen = Math.round(main.hpMax * 0.2);
          main.block += regen;
          events.push({ type: "mechanic", mechanic: "block_regen", name: main.name, block: regen });
        }
        break;
      }
      case "realm_cut": {
        const cut = ms.turnCount >= 6 ? 0.08 : 0.05;
        battle.playerHpMax = Math.max(1, Math.round(battle.playerHpMax * (1 - cut)));
        battle.playerHp = Math.min(battle.playerHp, battle.playerHpMax);
        events.push({ type: "mechanic", mechanic: "realm_cut", cut: Math.round(cut * 100) });
        break;
      }
      case "five_rotate": {
        ms.rotateIndex = ((ms.rotateIndex || 0) + 1) % 5;
        const names = ["雷", "火", "器", "魂", "劫"];
        const els = ["thunder", "fire", "weapon", "soul", "calamity"];
        battle._immuneElement = els[ms.rotateIndex];
        events.push({ type: "mechanic", mechanic: "five_rotate", immune: names[ms.rotateIndex] });
        break;
      }
      case "alchemy": {
        if (ms.turnCount % 2 === 0) {
          const main = battle.enemies.find((e) => e.hp > 0);
          if (main) {
            const heal = Math.round(main.hpMax * 0.1);
            main.hp = Math.min(main.hpMax, main.hp + heal);
            events.push({ type: "mechanic", mechanic: "alchemy", name: main.name, heal });
          }
        }
        break;
      }
    }
  },

  _processMechanicEnemyPhase(state, battle, events) {
    const mech = battle.mechanic;
    if (!mech) return;
    const ms = battle.mechanicState;

    switch (mech) {
      case "summon": {
        if (ms.turnCount % 2 === 0) {
          const main = battle.enemies.find((e) => e.hp > 0 && !e.isAdd);
          if (main && battle.enemies.filter((e) => e.hp > 0).length < 4) {
            const add = this._mkEnemy("小妖", Math.round(main.hpMax * 0.2));
            add.isAdd = true;
            battle.enemies.push(add);
            events.push({ type: "mechanic", mechanic: "summon", name: main.name });
          }
        }
        break;
      }
      case "double_strike": {
        const main = battle.enemies.find((e) => e.hp > 0);
        if (main && main.intent && main.intent.type === "attack") {
          const extraDmg = this._damagePlayer(state, battle, Math.max(1, Math.round(main.power * 0.12)));
          if (extraDmg > 0) events.push({ type: "mechanic", mechanic: "double_strike", damage: extraDmg });
        }
        break;
      }
      case "six_soul": {
        if (ms.turnCount % 2 === 0) {
          battle.playerBlock = 0;
          battle.playerStatuses.shield = 0;
          battle.rageStack = 0;
          events.push({ type: "mechanic", mechanic: "six_soul" });
        }
        break;
      }
      case "picture_world": {
        if (ms.turnCount % 4 === 0) {
          battle.pictureWorld = 3;
          events.push({ type: "mechanic", mechanic: "picture_world" });
        }
        break;
      }
      case "four_swords": {
        const main = battle.enemies.find((e) => e.hp > 0);
        if (main) {
          const swords = ["诛仙剑落", "戮仙剑斩", "陷仙剑火", "绝仙剑灭"];
          const idx = (ms.turnCount - 1) % 4;
          main.intent = { type: idx === 2 ? "curse_burn" : "attack", value: Math.round(main.power * (0.28 + idx * 0.02)), label: swords[idx], ratio: 0.04 };
        }
        break;
      }
      case "immortal": {
        const main = battle.enemies.find((e) => e.hp > 0);
        if (main && main.hp <= 0 && !main._oneShotKill) {
          main.hp = main.hpMax;
          main._oneShotKill = true;
          events.push({ type: "mechanic", mechanic: "immortal", name: main.name });
        }
        break;
      }
    }
  },

  // ---------- 意图系统 ----------

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
    if (r < 0.6) return { type: "attack", value: Math.max(1, Math.round(enemy.power * (0.18 + Math.random() * 0.06))), label: "扑击" };
    if (r < 0.75) return { type: "charge", label: "凶光大盛" };
    if (r < 0.9) return { type: "block", value: Math.max(1, Math.round(enemy.power * 0.08)), label: "罡气护体" };
    if (r < 0.95) return { type: "curse_burn", label: "喷吐邪火", ratio: 0.03 };
    return { type: "curse_weak", label: "嘶吼震魂" };
  },

  _mkIntent(enemy, p) {
    if (p.type === "attack") {
      const lo = num(p.ratio?.[0], 0.18);
      const hi = num(p.ratio?.[1], 0.24);
      return { type: "attack", value: Math.max(1, Math.round(enemy.power * (lo + Math.random() * (hi - lo)))), label: p.label };
    }
    if (p.type === "block") {
      return { type: "block", value: Math.max(1, Math.round(enemy.power * num(p.ratio, 0.08))), label: p.label };
    }
    return { type: p.type, label: p.label, ratio: num(p.ratio, 0.03) };
  },

  // ---------- 阶段/胜负 ----------

  _checkPhaseOrWin(battle, events) {
    if (battle.phases && battle.phaseIndex < battle.phases.length - 1) {
      battle.phaseIndex += 1;
      const phase = battle.phases[battle.phaseIndex];
      battle.enemies = [this._mkEnemy(phase.name, Math.round(battle.playerHpMax * num(phase.power_ratio, 0.8)), phase.pool)];
      events.push({ type: "phase_advance", name: phase.name, intro: phase.intro });
    } else {
      battle.done = true;
      battle.win = true;
      events.push({ type: "victory" });
    }
  },

  // ---------- 工具 ----------

  getSlotCount(state) {
    const realm = str(state.realm_id, "rq_01");
    if (realm.startsWith("rq")) return 3;
    if (realm.startsWith("zr")) {
      const minor = int(realm.split("_")[1], 1);
      if (minor >= 5) return 5;
      return 4;
    }
    return 6; // dx+
  },

  canPlaceSkill(state, skillId, slotIndex) {
    const slots = state.battle_slots || [];
    // 不能重复
    if (slots.includes(skillId)) return false;
    // 不能超出格数
    if (slotIndex >= this.getSlotCount(state)) return false;
    // 必须已解锁
    if (!(state.unlocked_skills || []).includes(skillId)) return false;
    return true;
  },
};

// 终极效果fallback（如果DataManager未加载combo_ultimate.json）
const COMBO_ULTIMATE_FALLBACK = {
  body: { name: "肉身成圣", effect_type: "invincible_reflect", reflect_rate: 0.5, duration: 1, visual_text: "金光护体，万法不侵！", visual_color: "#FFD700" },
  thunder: { name: "五雷轰顶", effect_type: "paralyze_detonate", paralyze_turns: 1, detonate_stored: true, visual_text: "五雷轰顶，天罚降世！", visual_color: "#4FC3F7" },
  fire: { name: "三昧焚天", effect_type: "dot_multiply", multiplier: 2, duration: 3, visual_text: "三昧焚天，万物皆烬！", visual_color: "#FF5722" },
  weapon: { name: "万剑归宗", effect_type: "multi_hit", hit_count: 5, each_ratio: 0.6, each_crit: true, visual_text: "万剑归宗，剑雨倾泻！", visual_color: "#B0BEC5" },
  soul: { name: "六魂尽灭", effect_type: "lifesteal", steal_rate: 1.0, visual_text: "六魂尽灭，生死逆转！", visual_color: "#7C4DFF" },
  calamity: { name: "万劫不复", effect_type: "sacrifice_burst", hp_cost: 0.5, damage_mult: 3.0, visual_text: "万劫不复，玉石俱焚！", visual_color: "#D32F2F" },
};
