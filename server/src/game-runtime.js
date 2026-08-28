"use strict";
// ============================================================================
// server/src/game-runtime.js —— 服务端游戏运行时（design/20.0 Step4）
//
// 核心模式（反作弊基石，Step6 沿用）：
//   每个请求 boot 一个独立 vm 沙箱（复用 test/harness 的 bootGame，零源码改动同构），
//   经 SaveManager 内存后端把 DB 里的 player.state 注入 Game，
//   在服务端权威执行操作（tick/levelUp/breakthrough/bossBattle），
//   取回被 mutate 的 Game.state 由路由写回 DB。
//   —— 战斗/成长结果只认服务端，客户端无法伪造。
//
// 每请求独立沙箱：无并发竞态、状态不串号，符合「数据为体」（从 DB state 出发确定性执行）。
// 性能优化（缓存 JS code / data json）留待 Step6 或后续，当前正确性优先。
// ============================================================================
const path = require("path");
const { bootGame } = require(path.join(__dirname, "..", "..", "test", "harness.js"));

// 内存存储后端：read 返回注入的 state 串，write 仅捕获（落库由路由负责）。
function memoryBackend(stateObj) {
  const text = JSON.stringify(stateObj);
  return { read: () => text, write: () => {}, clear: () => {} };
}

// 在独立沙箱里执行一个操作，返回 { state(操作后), result }。
async function runOperation(state, opFn, opts = {}) {
  const g = await bootGame({ seed: opts.seed != null ? opts.seed : 20260828 });
  const { Game, SaveManager, RealmManager, BattleEngineV2, BreakthroughManager } = g;
  SaveManager.useBackend(memoryBackend(state));
  Game.init({ debug: false, fresh: false });
  Game.popupQueue.length = 0; // 丢弃 init 的开局弹窗，只看本操作产生的
  const result = await opFn({ Game, RealmManager, BattleEngineV2, BreakthroughManager, runInSandbox: g.runInSandbox });
  return { state: Game.state, result };
}

// 创建初始 state（注册时调用）：空后端 + fresh:true → Game.init 走 loadOrCreate 生成默认新号 state。
async function createInitialState(opts = {}) {
  const g = await bootGame({ seed: opts.seed != null ? opts.seed : 20260828 });
  const { Game, SaveManager } = g;
  SaveManager.useBackend(memoryBackend(null));
  Game.init({ debug: false, fresh: true });
  return Game.state;
}

// 从 popupQueue 取最后一个 battle_v2 弹窗的战斗（startBattleV2 排队而非 return）。
function takeBattle(Game) {
  const idx = Game.popupQueue.map((p) => p.kind).lastIndexOf("battle_v2");
  if (idx < 0) return null;
  return Game.popupQueue.splice(idx, 1)[0].battle;
}

// 各操作以 (state, opts) => Promise<{state,result}> 形式导出，供路由直接调用。
const opTick = (state, opts) =>
  runOperation(state, ({ Game }) => {
    Game.tick();
    return { ticked: true };
  }, opts);

const opLevelUp = (state, opts) =>
  runOperation(state, ({ Game, RealmManager }) => {
    const s = Game.state;
    const before = String(s.realm_id);
    const canBefore = RealmManager.canLevelUp(s);
    if (canBefore) Game.levelUp();
    const after = String(s.realm_id);
    return {
      leveled: canBefore && after !== before,
      from: before,
      to: after,
      combat_power: RealmManager.getCombatPower(s),
      can_level_more: RealmManager.canLevelUp(s),
    };
  }, opts);

const opBreakthrough = (state, opts) =>
  runOperation(state, ({ Game, RealmManager, BattleEngineV2, BreakthroughManager }) => {
    const s = Game.state;
    const before = String(s.realm_id);
    const canBefore = BreakthroughManager.canAttempt(s);
    Game.confirmBreakthrough();
    const battle = takeBattle(Game);
    if (!battle) {
      return { attempted: false, reason: canBefore ? "no_battle_queued" : "not_attemptable", realm: before };
    }
    BattleEngineV2.runFullAuto(s, battle);
    Game.finishBattle(battle);
    return {
      attempted: true,
      win: !!battle.win,
      rounds: battle.round,
      from: before,
      to: String(s.realm_id),
      advanced: String(s.realm_id) !== before,
      combat_power: RealmManager.getCombatPower(s),
    };
  }, opts);

const opBossBattle = (state, bossId, opts) =>
  runOperation(state, ({ Game, BattleEngineV2 }) => {
    const s = Game.state;
    const resBefore = { ...(s.resources || {}) };
    const clearsBefore = Number(s.boss_clears || 0);
    Game.startBossBattle(bossId);
    const battle = takeBattle(Game);
    if (!battle) return { challenged: false, reason: "not_challengeable_or_not_found", bossId };
    BattleEngineV2.runFullAuto(s, battle);
    Game.finishBattle(battle);
    const rewards = {};
    for (const k of Object.keys(s.resources || {})) {
      const d = Number(s.resources[k] || 0) - Number(resBefore[k] || 0);
      if (d !== 0) rewards[k] = d;
    }
    return {
      challenged: true,
      bossId,
      win: !!battle.win,
      rounds: battle.round,
      dealt: battle.stats ? battle.stats.dealt : 0,
      taken: battle.stats ? battle.stats.taken : 0,
      rewards,
      boss_clears: Number(s.boss_clears || 0),
      clears_delta: Number(s.boss_clears || 0) - clearsBefore,
    };
  }, opts);

module.exports = { runOperation, createInitialState, opTick, opLevelUp, opBreakthrough, opBossBattle };
