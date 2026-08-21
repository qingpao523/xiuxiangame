"use strict";

/* 封神修道录 · Boss 机制模块 V2（design/8.1 v1.3 终稿）
 *
 * 解耦实现：9 个具名 Boss 机制的核心逻辑独立于此模块，引擎仅以 switch case 委托调用，
 * 不侵入 battle-engine-v2.js 的回合结构（与并发会话的逐格分步重构正交，零冲突）。
 *
 * 集成契约（design/8.1:164）：
 *   battle-engine-v2.js 两个钩子 _processMechanicTurnStart(state,battle,events) /
 *   _processMechanicEnemyPhase(state,battle,events) 的 switch(battle.mechanic) 加 case：
 *     case "zhangguifang_interrupt": BossMechanicsV2.turnStart(state, battle, events); break;
 *     ...（enemyPhase 同理）
 *   或在 default 统一委托：BossMechanicsV2.dispatch("turnStart", state, battle, events)。
 *   战斗创建时调 BossMechanicsV2.init(state, battle) 初始化 mechanicState。
 *   玩家对敌造成伤害后调 BossMechanicsV2.onPlayerDamageDealt(state,battle,enemy,rawDmg,events)
 *   （供八卦云光帕累积破罩 / 花狐貂护甲吸收）。
 *
 * 状态：存 battle.mechanicState（turnCount 由引擎每玩家回合自增；其余字段 init 时按机制初始化）。
 * 依赖：直接引用全局单例 BattleEngineV2 的 _damagePlayer/_dealDamageToEnemy 等辅助方法。
 * 真伤：_trueDamagePlayer 绕过护盾/格挡（不绕无敌），供灼烧引爆/焚城/飞剑无视护盾。
 *
 * 冷却依赖：张桂芳呼名落马 / 魔礼海三弦 操作 slot._cd（per-slot 冷却子系统，design/8.1）。
 *   skill_table.json 已加 cooldown 字段（commit bf156d0）；引擎冷却消费（slot._cd 递减/跳过/置位）
 *   属九Boss接线引擎层，待并发会话 battle-engine-v2.js 重构落地后接入。slot._cd 缺失时本模块
 *   安全降级（_setSlotCd 仅在字段存在时写）。
 *
 * 数值🔴待批次0 playtest 校准。
 */

const BossMechanicsV2 = {

  // ---------- 初始化：按机制给 mechanicState 铺默认字段 ----------
  init(state, battle) {
    const ms = battle.mechanicState || (battle.mechanicState = { turnCount: 0 });
    switch (battle.mechanic) {
      case "zhangguifang_interrupt":
        ms.interruptEvery = 3; break;
      case "shiji_parasol": {
        const boss = (battle.enemies || [])[0];
        ms.parasolEvery = 4; ms.parasolTurns = 0;
        ms.parasolHpMax = boss ? Math.round(boss.hpMax * 0.15) : 0; ms.parasolHp = 0; break;
      }
      case "mo_lihai_strings":
        ms.stringIndex = 0; ms.stringStackTurns = 0; break;
      case "mo_liqing_sword":
        ms.swordEvery = 5; ms.swordTurns = 0; break;
      case "mo_lishou_armor": {
        const boss2 = (battle.enemies || [])[0];
        if (boss2) { boss2.block = Math.round(boss2.hpMax * 0.30); }
        ms.armorActive = true; ms.enraged = false; break;
      }
      case "huoling_burnstack":
        ms.burnStacks = 0; ms.burnDetonateAt = 5; break;
      case "luoxuan_fivefire":
        ms.fireBag = ["fan", "wheel", "rat", "pearl", "rope"]; ms.fireUsed = []; break;
      default: break;
    }
  },

  // ---------- 统一委托入口（引擎 default case 用） ----------
  dispatch(phase, state, battle, events) {
    const key = battle.mechanic;
    if (!key) return;
    if (phase === "init") { this.init(state, battle); return; }
    const handler = (phase === "turnStart" ? this.turnStart : this.enemyPhase)[key];
    if (typeof handler === "function") handler.call(this, state, battle, events);
  },

  // ---------- 回合开始机制（玩家回合，逐格释放前） ----------
  turnStart: {

    // 张桂芳·呼名落马：每3回合（hp<30%→每2）强制打断随机术法槽+重置冷却
    zhangguifang_interrupt(state, battle, events) {
      const ms = battle.mechanicState;
      const boss = (battle.enemies || []).find((e) => e.hp > 0);
      if (!boss) return;
      const every = (boss.hp / boss.hpMax < 0.30) ? 2 : 3;
      if (ms.turnCount % every !== 0) return;
      const slots = battle.slots || [];
      if (!slots.length) return;
      const idx = Math.floor(Math.random() * slots.length);
      const slot = slots[idx];
      this._setSlotCd(slot, Math.max(2, int(slot.cooldown, 2))); // 重置冷却（满CD）
      slot._interrupted = true; // 本回合跳过（引擎逐格释放时检查）
      events.push({ type: "mechanic", mechanic: "zhangguifang_interrupt",
        text: `张桂芳厉喝一声「呼名落马」——你的「${slot.name}」心神被撼，术法溃散，冷却重置。` });
    },

    // 石矶·八卦云光帕：每4回合（hp<25%→每2）展帕笼罩全场2回合，术法伤害-40%；累积伤害达15%Boss血量破罩
    shiji_parasol(state, battle, events) {
      const ms = battle.mechanicState;
      const boss = (battle.enemies || []).find((e) => e.hp > 0);
      if (!boss) return;
      const enraged = boss.hp / boss.hpMax < 0.25;
      const every = enraged ? 2 : 4;
      // 既有帕子：递减持续回合
      if (ms.parasolTurns > 0) {
        ms.parasolTurns -= 1;
        if (ms.parasolTurns === 0) { battle.spellDmgReduction = Math.max(0, (battle.spellDmgReduction || 0) - 0.40); }
      }
      if (ms.turnCount % every === 0 && ms.parasolTurns === 0) {
        ms.parasolTurns = 2; ms.parasolHp = ms.parasolHpMax;
        battle.spellDmgReduction = (battle.spellDmgReduction || 0) + 0.40;
        events.push({ type: "mechanic", mechanic: "shiji_parasol",
          text: `石矶祭起八卦云光帕，帕影笼罩全场——你的术法伤害 -40%（破罩需累积 ${ms.parasolHpMax} 伤害）。` });
      }
      if (enraged && ms.turnCount % 2 === 0) {
        // 狂暴：剑气连击（额外器系伤害）
        const dmg = this._trueDamagePlayer(state, battle, Math.max(1, Math.round(boss.power * 0.12)), events, "剑气连击");
        events.push({ type: "mechanic", mechanic: "shiji_parasol_swordqi", text: `石矶狂暴，帕中剑气连斩！`, damage: dmg });
      }
    },

    // 魔礼海·四弦乱心：循环弹四弦，每弦一debuff，第四弦全叠加2回合；第5回合重置；hp<40%从三弦起
    mo_lihai_strings(state, battle, events) {
      const ms = battle.mechanicState;
      const boss = (battle.enemies || []).find((e) => e.hp > 0);
      if (!boss) return;
      // 全叠加状态递减
      if (ms.stringStackTurns > 0) ms.stringStackTurns -= 1;
      // 起手弦位：hp<40% 从三弦（index 2）起
      if (ms.turnCount === 1 && boss.hp / boss.hpMax < 0.40) ms.stringIndex = 2;
      const i = ms.stringIndex % 4;
      const labels = ["一弦·攻心", "二弦·破防", "三弦·滞法", "四弦齐鸣"];
      if (i === 0) { battle._mechAtkMult = 0.85; }              // 玩家攻击 -15%
      else if (i === 1) { battle._mechDefMult = 0.85; }        // 玩家防御 -15%
      else if (i === 2) { (battle.slots || []).forEach((s) => this._addSlotCd(s, 1)); } // 术法CD+1
      else { // 四弦齐鸣：三效果全叠加2回合
        battle._mechAtkMult = 0.85; battle._mechDefMult = 0.85;
        (battle.slots || []).forEach((s) => this._addSlotCd(s, 1));
        ms.stringStackTurns = 2;
      }
      events.push({ type: "mechanic", mechanic: "mo_lihai_strings",
        text: `魔礼海拨动琵琶——${labels[i]}！${i === 3 ? "（三效果齐发，持续2回合）" : ""}` });
      ms.stringIndex += 1;
      if (ms.stringIndex % 4 === 0 && ms.stringStackTurns === 0) { /* 第五回合自然重置从一弦 */ }
    },

    // 火灵·金霞冠灼烧蔓延：灼烧层每回合tick；满5层引爆=玩家总血量25%真伤→清零
    huoling_burnstack(state, battle, events) {
      const ms = battle.mechanicState;
      if (ms.burnStacks <= 0) return;
      // 每层每回合火系小额持续伤害（🔴待校准：每层=玩家最大生命1%）
      const perStack = Math.max(1, Math.round(battle.playerHpMax * 0.01));
      const tickDmg = this._trueDamagePlayer(state, battle, perStack * ms.burnStacks, events, "灼烧蔓延");
      events.push({ type: "mechanic", mechanic: "huoling_burnstack_tick",
        text: `金霞冠灼烧蔓延（${ms.burnStacks}层），你受到 ${tickDmg} 火伤。`, damage: tickDmg, stacks: ms.burnStacks });
    },
  },

  // ---------- 敌方阶段机制（敌方回合，意图执行后） ----------
  enemyPhase: {

    // 敖丙·化龙形：hp<50% 变身龙形（一次性），物理防御×2，但每回合攻击次数2→1
    aobing_transform(state, battle, events) {
      const ms = battle.mechanicState;
      const boss = (battle.enemies || []).find((e) => e.hp > 0);
      if (!boss || ms.transformed) return;
      if (boss.hp / boss.hpMax < 0.50) {
        ms.transformed = true;
        boss.defMult = (boss.defMult || 1) * 2;   // 物理防御翻倍
        boss.attacksPerTurn = 1;                    // 攻击次数 2→1
        events.push({ type: "mechanic", mechanic: "aobing_transform",
          text: `敖丙怒吼一声，化现龙形！鳞甲坚凝（防御×2），然攻势转缓（每回合一击）。` });
      }
    },

    // 魔礼青·青云剑出鞘：每5回合祭飞剑追击3回合，器系伤害无视护盾减伤；hp<30%剑不回鞘
    mo_liqing_sword(state, battle, events) {
      const ms = battle.mechanicState;
      const boss = (battle.enemies || []).find((e) => e.hp > 0);
      if (!boss) return;
      const enraged = boss.hp / boss.hpMax < 0.30;
      if (ms.turnCount % ms.swordEvery === 0) ms.swordTurns = 3;
      if (enraged) ms.swordTurns = Math.max(ms.swordTurns, 1); // 剑不回鞘
      if (ms.swordTurns > 0) {
        const dmg = this._trueDamagePlayer(state, battle, Math.max(1, Math.round(boss.power * 0.18)), events, "青云剑");
        events.push({ type: "mechanic", mechanic: "mo_liqing_sword",
          text: `青云剑出鞘，飞剑追斩（无视护盾）！你受 ${dmg} 器系剑伤。`, damage: dmg });
        if (!enraged) ms.swordTurns -= 1;
      }
    },

    // 魔礼红·混元珍珠伞翻天：开场第1回合展伞，全场暗天，术法伤害-25%（持续整场不可解除）
    mo_lihong_umbrella(state, battle, events) {
      const ms = battle.mechanicState;
      if (ms.turnCount === 1 && !ms.umbrellaOpen) {
        ms.umbrellaOpen = true;
        battle.spellDmgReduction = (battle.spellDmgReduction || 0) + 0.25;
        events.push({ type: "mechanic", mechanic: "mo_lihong_umbrella",
          text: `魔礼红撑开混元珍珠伞·翻天——天光骤暗！你的术法伤害 -25%（持续整场，不可解除）。` });
      }
    },

    // 罗宣·五宝连锁：每回合随机祭1件火系法宝（5件各出现1次后触发焚城=玩家最大生命50%火伤）
    luoxuan_fivefire(state, battle, events) {
      const ms = battle.mechanicState;
      const boss = (battle.enemies || []).find((e) => e.hp > 0);
      if (!boss) return;
      const remain = ms.fireBag.filter((f) => !ms.fireUsed.includes(f));
      if (remain.length === 0) {
        // 五宝齐出 → 焚城
        const dmg = this._trueDamagePlayer(state, battle, Math.round(battle.playerHpMax * 0.50), events, "焚城");
        events.push({ type: "mechanic", mechanic: "luoxuan_fivefire_burn_city",
          text: `五宝齐祭——焚城！烈焰吞天，你受 ${dmg} 火伤（最大生命50%）。`, damage: dmg });
        ms.fireUsed = []; // 重置循环
        return;
      }
      const pick = remain[Math.floor(Math.random() * remain.length)];
      ms.fireUsed.push(pick);
      const names = { fan: "五龙轮", wheel: "照天印", rat: "万鸦壶", pearl: "飞烟剑", rope: "万里起云烟" };
      const dmg = this._trueDamagePlayer(state, battle, Math.max(1, Math.round(boss.power * 0.15)), events, names[pick]);
      events.push({ type: "mechanic", mechanic: "luoxuan_fivefire",
        text: `罗宣祭出「${names[pick]}」（${ms.fireUsed.length}/5），烈焰扑面！你受 ${dmg} 火伤。`, damage: dmg });
    },
  },

  // ---------- 玩家对敌造成伤害后钩子（帕子累积 / 花狐貂护甲吸收） ----------
  onPlayerDamageDealt(state, battle, enemy, rawDamage, events) {
    const ms = battle.mechanicState || {};
    // 石矶·八卦云光帕：帕子存在时，玩家伤害先累积到帕子（达 parasolHpMax 破罩）
    if (battle.mechanic === "shiji_parasol" && ms.parasolTurns > 0 && ms.parasolHp > 0) {
      ms.parasolHp -= rawDamage;
      if (ms.parasolHp <= 0) {
        ms.parasolTurns = 0; ms.parasolHp = 0;
        battle.spellDmgReduction = Math.max(0, (battle.spellDmgReduction || 0) - 0.40);
        events.push({ type: "mechanic", mechanic: "shiji_parasol_break",
          text: `八卦云光帕应声而破！帕影消散，你的术法伤害恢复。` });
      }
    }
    // 魔礼寿·花狐貂护甲：护甲存在时本体减伤50%（engine 读 enemy.block 先吸收）；护甲破→暴怒
    if (battle.mechanic === "mo_lishou_armor" && ms.armorActive && enemy && enemy.block <= 0) {
      ms.armorActive = false; ms.enraged = true;
      enemy.defMult = 1;                 // 减伤消失
      enemy.atkMult = (enemy.atkMult || 1) * 2; // 攻击力×2（暴怒）
      events.push({ type: "mechanic", mechanic: "mo_lishou_armor_break",
        text: `花狐貂被击退！魔礼寿暴怒——护甲减伤消失，攻击力翻倍！` });
    }
  },

  // ---------- 敌方攻击时叠灼烧（引擎 enemy attack 分支调用） ----------
  onEnemyAttack(state, battle, enemy, events) {
    const ms = battle.mechanicState || {};
    if (battle.mechanic !== "huoling_burnstack") return;
    const enraged = enemy && enemy.hp / enemy.hpMax < 0.30;
    const add = enraged ? 2 : 1;
    ms.burnStacks = (ms.burnStacks || 0) + add;
    // 每3回合火焰喷射额外+2层
    if (ms.turnCount % 3 === 0) ms.burnStacks += 2;
    events.push({ type: "mechanic", mechanic: "huoling_burnstack_add",
      text: `金霞冠灼烧叠加（+${add}，现 ${ms.burnStacks} 层）。`, stacks: ms.burnStacks });
    // 满层引爆
    if (ms.burnStacks >= ms.burnDetonateAt) {
      const dmg = this._trueDamagePlayer(state, battle, Math.round(battle.playerHpMax * 0.25), events, "灼烧引爆");
      events.push({ type: "mechanic", mechanic: "huoling_burnstack_detonate",
        text: `灼烧叠满 ${ms.burnDetonateAt} 层——引爆！你受 ${dmg} 真实伤害（最大生命25%）。`, damage: dmg });
      ms.burnStacks = 0;
    }
  },

  // ---------- 辅助 ----------

  // 真伤：绕过护盾/格挡（不绕无敌）。返回实际扣血。
  _trueDamagePlayer(state, battle, amount, events, label) {
    if (battle.playerStatuses && battle.playerStatuses.invincible > 0) return 0;
    const dmg = Math.max(0, Math.round(amount));
    battle.playerHp = Math.max(0, battle.playerHp - dmg);
    if (battle.stats) battle.stats.taken = (battle.stats.taken || 0) + dmg;
    return dmg;
  },

  // 安全写 slot 冷却（冷却子系统未接入时 _cd 可能不存在；写了不报错，引擎接入后生效）
  _setSlotCd(slot, turns) { if (slot) slot._cd = Math.max(int(slot._cd, 0), int(turns, 0)); },
  _addSlotCd(slot, turns) { if (slot) slot._cd = int(slot._cd, 0) + int(turns, 0); },
};
