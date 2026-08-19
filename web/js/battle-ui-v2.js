"use strict";

// ===== 斗法栏配置UI + 战斗演出UI V2 =====
// 配招界面：拖拽/点选技能入栏，同系高亮，连锁预览
// 战斗演出：逐行文字日志，combo变色，三连全屏大演出

const BattleUIV2 = {
  // ---------- 斗法栏配置界面 ----------

  renderSlotConfig(container, state, onConfirm, opts = {}) {
    container.innerHTML = "";
    container.classList.add("battle-v2-config");
    // 记住渲染上下文，供交互后重渲染复用
    this._cfgCtx = { container, state, onConfirm, opts };
    if (this._selIdx == null) this._selIdx = -1;

    const maxSlots = BattleEngineV2.getSlotCount(state);
    const slots = state.battle_slots || [];
    const unlocked = state.unlocked_skills || [];

    // 标题
    const title = document.createElement("div");
    title.className = "slot-config-title";
    title.textContent = "斗法栏·配招";
    container.appendChild(title);

    // 格数提示
    const hint = document.createElement("div");
    hint.className = "slot-config-hint";
    hint.textContent = `当前${maxSlots}格（境界突破可扩展）`;
    container.appendChild(hint);

    // 斗法栏格子
    const slotRow = document.createElement("div");
    slotRow.className = "slot-row";
    for (let i = 0; i < maxSlots; i++) {
      const slotEl = document.createElement("div");
      slotEl.className = "slot-cell";
      slotEl.dataset.index = i;

      if (slots[i]) {
        const skill = BattleEngineV2.getSkillData(slots[i]);
        if (skill) {
          slotEl.classList.add("filled", `element-${skill.spell_type}`);
          if (this._selIdx === i) slotEl.classList.add("selected");
          slotEl.innerHTML = `<span class="slot-num">${i + 1}</span><span class="slot-name">${skill.name}</span><span class="slot-type">${this._elementName(skill.spell_type)}</span><span class="slot-remove" title="移除">✕</span>`;
          // 点击格体：选中 / 交换顺序
          slotEl.addEventListener("click", () => {
            if (this._selIdx === i) { this._selIdx = -1; }
            else if (this._selIdx >= 0 && slots[this._selIdx]) {
              const a = this._selIdx;
              const tmp = slots[a]; slots[a] = slots[i]; slots[i] = tmp;
              this._selIdx = -1;
              state.battle_slots = slots;
              SaveManager.save(state);
            } else { this._selIdx = i; }
            this._rerenderConfig();
          });
          // 点击 ✕：移除
          slotEl.querySelector(".slot-remove").addEventListener("click", (ev) => {
            ev.stopPropagation();
            slots.splice(i, 1);
            this._selIdx = -1;
            state.battle_slots = slots.filter(Boolean);
            SaveManager.save(state);
            this._rerenderConfig();
          });
        }
      } else {
        slotEl.classList.add("empty");
        slotEl.innerHTML = `<span class="slot-num">${i + 1}</span><span class="slot-empty-text">空</span>`;
      }

      // 连锁高亮：相邻同系
      if (i > 0 && slots[i] && slots[i - 1]) {
        const prev = BattleEngineV2.getSkillData(slots[i - 1]);
        const curr = BattleEngineV2.getSkillData(slots[i]);
        if (prev && curr && prev.spell_type === curr.spell_type) {
          slotEl.classList.add("combo-active");
        }
      }

      slotRow.appendChild(slotEl);

      // 连锁箭头
      if (i < maxSlots - 1) {
        const arrow = document.createElement("span");
        arrow.className = "slot-arrow";
        arrow.textContent = "→";
        slotRow.appendChild(arrow);
      }
    }
    container.appendChild(slotRow);

    // 连锁预览
    const preview = document.createElement("div");
    preview.className = "combo-preview";
    preview.innerHTML = this._getComboPreview(slots);
    container.appendChild(preview);

    // 技能列表（按系分组）
    const listTitle = document.createElement("div");
    listTitle.className = "skill-list-title";
    listTitle.textContent = "可用技能（点击放入）";
    container.appendChild(listTitle);

    const elements = ["body", "thunder", "fire", "weapon", "soul", "calamity"];
    for (const el of elements) {
      const skills = unlocked.map((id) => BattleEngineV2.getSkillData(id)).filter((s) => s && s.spell_type === el);
      if (skills.length === 0) continue;

      const group = document.createElement("div");
      group.className = `skill-group element-${el}`;
      const groupLabel = document.createElement("div");
      groupLabel.className = "skill-group-label";
      groupLabel.textContent = `${this._elementName(el)}系`;
      group.appendChild(groupLabel);

      for (const skill of skills) {
        const inSlot = slots.includes(skill.id);
        const item = document.createElement("div");
        item.className = `skill-item rarity-${skill.rarity}${inSlot ? " in-slot" : ""}`;
        item.innerHTML = `
          <span class="skill-cat-badge cat-${skill.category}">${this._categoryName(skill.category)}</span>
          <span class="skill-item-name">${skill.name}</span>
          <span class="skill-item-dmg">${skill.damage_base}+</span>
          ${skill.special_effect ? `<span class="skill-item-fx">✦</span>` : ""}
        `;
        if (!inSlot && slots.length < maxSlots) {
          item.addEventListener("click", () => {
            slots.push(skill.id);
            this._selIdx = -1;
            state.battle_slots = slots;
            SaveManager.save(state);
            this._rerenderConfig();
          });
        }
        group.appendChild(item);
      }
      container.appendChild(group);
    }

    // 教学分支 / 确认按钮
    if (opts.tutorial) {
      this._renderTutorialUI(container, state);
    } else {
      const btn = document.createElement("button");
      btn.className = "slot-confirm-btn";
      btn.textContent = "确认配招";
      btn.addEventListener("click", () => {
        if (onConfirm) onConfirm();
      });
      container.appendChild(btn);
    }
  },

  // ---------- 重渲染 ----------
  _rerenderConfig() {
    const c = this._cfgCtx;
    if (c) this.renderSlotConfig(c.container, c.state, c.onConfirm, c.opts);
  },

  // ---------- 新手教学：三层递进引导 ----------

  // 入口：布置教学局面并打开配招界面
  startTutorial(state) {
    // 确保教学所需技能已解锁
    const need = ["skill_body_01", "skill_body_02", "skill_thunder_01"];
    state.unlocked_skills = state.unlocked_skills || [];
    for (const id of need) {
      if (!state.unlocked_skills.includes(id)) state.unlocked_skills.push(id);
      if (!state.skill_levels) state.skill_levels = {};
      if (!state.skill_levels[id]) state.skill_levels[id] = 1;
    }
    // 故意把两个体系技能隔开（中间夹雷系），让玩家发现"同系相邻"
    state.battle_slots = ["skill_body_01", "skill_thunder_01", "skill_body_02"];
    this._selIdx = -1;
    this._tutSolved = false;
    SaveManager.save(state);
    if (typeof Game !== "undefined") Game.queuePopup({ kind: "slot_config", tutorial: true });
  },

  _renderTutorialUI(container, state) {
    this._clearTutorialHints();
    const slots = state.battle_slots || [];
    const solved = this._tutorialHasCombo(slots);

    // 教学横幅
    const banner = document.createElement("div");
    banner.className = "tut-banner";
    banner.innerHTML = solved
      ? "✓ 气机共鸣！同系术法相邻，威力倍增。"
      : "教学 · 试着让<b>同系术法</b>相邻排列……";
    container.appendChild(banner);

    // 三层提示容器
    const hint = document.createElement("div");
    hint.className = "tut-hint";
    hint.id = "tut-hint";
    container.appendChild(hint);

    if (solved) {
      this._tutSolved = true;
      hint.innerHTML = '<div class="tut-bubble gold">妙！同系相邻，气机共鸣，威力倍增。</div>';
      const btn = document.createElement("button");
      btn.className = "slot-confirm-btn tut-go";
      btn.textContent = "开始斗法 · 试试威力";
      btn.addEventListener("click", () => this._launchTutorialBattle(state));
      container.appendChild(btn);
    } else {
      // 第一层（立即）：高亮抖动两个体系格
      this._highlightBodySlots(container);
      // 第二层（3秒）：文字提示
      this._tutTimers.push(setTimeout(() => {
        if (this._tutSolved) return;
        const h = document.getElementById("tut-hint");
        if (h) h.innerHTML = '<div class="tut-bubble">同系术法相邻，或有奇效……<br><span class="tut-sub">点选一格，再点另一格，即可交换顺序。</span></div>';
      }, 3000));
      // 第三层（8秒）：箭头直接引导
      this._tutTimers.push(setTimeout(() => {
        if (this._tutSolved) return;
        const h = document.getElementById("tut-hint");
        if (h) h.innerHTML = '<div class="tut-bubble arrow">把第③格「铜头诀」换到第②格 ↷<br><span class="tut-sub">先点「铜头诀」，再点「掌心雷」。</span></div>';
        this._showArrow(container);
      }, 8000));
    }
  },

  _tutorialHasCombo(slots) {
    for (let i = 1; i < slots.length; i++) {
      const a = BattleEngineV2.getSkillData(slots[i - 1]);
      const b = BattleEngineV2.getSkillData(slots[i]);
      if (a && b && a.spell_type === b.spell_type) return true;
    }
    return false;
  },

  _highlightBodySlots(container) {
    const cells = container.querySelectorAll(".slot-cell.filled");
    cells.forEach((cell) => {
      const idx = parseInt(cell.dataset.index, 10);
      const slots = (this._cfgCtx && this._cfgCtx.state.battle_slots) || [];
      const sk = BattleEngineV2.getSkillData(slots[idx]);
      if (sk && sk.spell_type === "body") cell.classList.add("tut-shake");
    });
  },

  _showArrow(container) {
    const row = container.querySelector(".slot-row");
    if (!row) return;
    const arrow = document.createElement("div");
    arrow.className = "tut-arrow";
    arrow.textContent = "↷";
    row.appendChild(arrow);
  },

  _clearTutorialHints() {
    if (!this._tutTimers) this._tutTimers = [];
    for (const t of this._tutTimers) clearTimeout(t);
    this._tutTimers = [];
  },

  _launchTutorialBattle(state) {
    this._clearTutorialHints();
    state.flags.battle_v2_tutorial_done = true;
    SaveManager.save(state);
    if (typeof closePopup === "function") closePopup();
    if (typeof Game !== "undefined") {
      Game.startBattleV2({
        name: "山野妖猪",
        enemy_power: 350,
        source: "normal",
        payload: { tutorial: true },
      });
    }
  },

  _getComboPreview(slots) {
    if (slots.length < 2) return '<span class="preview-none">放入技能后显示连锁预览</span>';
    const parts = [];
    let maxCombo = 0;
    let currentCombo = 1;
    let comboElement = null;

    for (let i = 1; i < slots.length; i++) {
      const prev = BattleEngineV2.getSkillData(slots[i - 1]);
      const curr = BattleEngineV2.getSkillData(slots[i]);
      if (prev && curr && prev.spell_type === curr.spell_type) {
        currentCombo++;
        comboElement = curr.spell_type;
      } else {
        if (currentCombo >= 2) {
          parts.push(`<span class="preview-combo element-${comboElement}">${this._elementName(comboElement)}系${currentCombo >= 3 ? "三连·终极" : "二连"}×1.3</span>`);
        }
        currentCombo = 1;
        comboElement = null;
      }
    }
    if (currentCombo >= 2 && comboElement) {
      parts.push(`<span class="preview-combo element-${comboElement}">${this._elementName(comboElement)}系${currentCombo >= 3 ? "三连·终极" : "二连"}×1.3</span>`);
    }

    if (parts.length === 0) return '<span class="preview-none">无连锁（相邻同系触发）</span>';
    return parts.join(" ");
  },

  // ---------- 战斗演出界面 ----------

  renderBattlePopup(panel, battle, state) {
    panel.classList.add("style-breakthrough", "battle-v2");
    const body = panel.querySelector(".popup-body") || panel;

    // 战斗区域
    const zone = document.createElement("div");
    zone.className = "battle-v2-zone";
    body.appendChild(zone);

    // 日志区域
    const logBox = document.createElement("div");
    logBox.className = "battle-v2-log";
    body.appendChild(logBox);

    // 初始信息
    this._appendLog(logBox, `你与${battle.name}对上了气机，斗法开始！`, "system");
    for (const evt of battle.pendingEvents.splice(0)) {
      if (typeof evt === "string") this._appendLog(logBox, evt, "system");
    }

    // 速度控制
    const speedRow = document.createElement("div");
    speedRow.className = "battle-speed-row";
    const speeds = [1, 2, 4, 0];
    const speedLabels = ["1×", "2×", "4×", "跳过"];
    speeds.forEach((sp, idx) => {
      const btn = document.createElement("button");
      btn.className = `speed-btn${battle.speed === sp ? " active" : ""}`;
      btn.textContent = speedLabels[idx];
      btn.addEventListener("click", () => {
        battle.speed = sp;
        speedRow.querySelectorAll(".speed-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        if (sp === 0) this._runSkip(battle, state, logBox, zone, panel);
      });
      speedRow.appendChild(btn);
    });
    body.appendChild(speedRow);

    // 开始自动战斗
    this._startAutoLoop(battle, state, logBox, zone, panel);
  },

  _startAutoLoop(battle, state, logBox, zone, panel) {
    if (battle._timer) clearInterval(battle._timer);

    const step = () => {
      if (battle.done) {
        clearInterval(battle._timer);
        this._renderBattleEnd(battle, logBox, zone, panel);
        return;
      }

      // 玩家回合
      const playerEvents = BattleEngineV2.executePlayerRound(state, battle);
      this._renderEvents(playerEvents, logBox, zone, battle);

      if (battle.done) {
        clearInterval(battle._timer);
        this._renderBattleEnd(battle, logBox, zone, panel);
        return;
      }

      // 敌方回合（延迟执行，给演出时间）
      setTimeout(() => {
        if (battle.done) return;
        const enemyEvents = BattleEngineV2.executeEnemyRound(state, battle);
        this._renderEvents(enemyEvents, logBox, zone, battle);

        if (battle.done) {
          clearInterval(battle._timer);
          this._renderBattleEnd(battle, logBox, zone, panel);
        }
      }, this._getDelay(battle) * 0.5);
    };

    const interval = this._getDelay(battle) * (battle.slots.length + 2);
    battle._timer = setInterval(step, Math.max(300, interval));
    // 立即执行第一步
    step();
  },

  _runSkip(battle, state, logBox, zone, panel) {
    if (battle._timer) clearInterval(battle._timer);
    const allEvents = BattleEngineV2.runFullAuto(state, battle);
    // 只显示关键事件
    for (const evt of allEvents) {
      if (evt.type === "ultimate" || evt.type === "victory" || evt.type === "player_defeated" || evt.type === "kill") {
        this._renderEvents([evt], logBox, zone, battle);
      }
    }
    this._renderBattleEnd(battle, logBox, zone, panel);
  },

  _getDelay(battle) {
    const base = 800;
    if (battle.speed === 2) return 400;
    if (battle.speed === 4) return 150;
    return base;
  },

  _renderEvents(events, logBox, zone, battle) {
    for (const evt of events) {
      switch (evt.type) {
        case "attack": {
          const cls = evt.combo ? "combo-hit" : "normal-hit";
          const comboText = evt.combo ? ` <span class="combo-badge">${this._elementName(evt.element)}系共鸣！×${evt.comboMult}</span>` : "";
          this._appendLog(logBox, `${evt.skillName} → ${evt.targetName} <b>${formatInt(evt.damage)}</b>${comboText}`, cls);
          break;
        }
        case "kill":
          this._appendLog(logBox, `${evt.targetName} 溃散！`, "kill-line");
          break;
        case "ultimate":
          this._showUltimateOverlay(evt, zone);
          this._appendLog(logBox, `【${evt.name}】${evt.visual_text}`, "ultimate-line");
          if (evt.total_damage) this._appendLog(logBox, `造成 ${formatInt(evt.total_damage)} 伤害！`, "ultimate-dmg");
          if (evt.damage) this._appendLog(logBox, `造成 ${formatInt(evt.damage)} 伤害！`, "ultimate-dmg");
          if (evt.detonate_damage) this._appendLog(logBox, `引爆雷伤 ${formatInt(evt.detonate_damage)}！`, "ultimate-dmg");
          break;
        case "enemy_attack":
          this._appendLog(logBox, `${evt.name}${evt.label}，你受 ${formatInt(evt.damage)} 伤害。`, "enemy-line");
          break;
        case "enemy_charged_attack":
          this._appendLog(logBox, `${evt.name}蓄势重击！你受 ${formatInt(evt.damage)} 伤害。`, "enemy-heavy");
          break;
        case "enemy_stunned":
        case "enemy_paralyzed":
          this._appendLog(logBox, `${evt.name}无法行动！`, "control-line");
          break;
        case "enemy_burn_tick":
          this._appendLog(logBox, `${evt.name}被灵火灼烧，受 ${formatInt(evt.damage)} 伤害。`, "burn-line");
          break;
        case "player_burn":
          this._appendLog(logBox, `邪火焚身，你受 ${formatInt(evt.damage)} 伤害。`, "player-hurt");
          break;
        case "player_defeated":
          this._appendLog(logBox, "你护住灵台，且战且退。", "defeat-line");
          break;
        case "victory":
          this._appendLog(logBox, `${battle.name}溃散！斗法胜利！`, "victory-line");
          break;
        case "mechanic":
          this._appendLog(logBox, this._mechanicText(evt), "mechanic-line");
          break;
        case "phase_advance":
          this._appendLog(logBox, evt.intro || `${evt.name}显化而出！`, "phase-line");
          break;
        case "lifesteal":
          this._appendLog(logBox, `六魂尽灭——回复 ${formatInt(evt.amount)} 气血！`, "heal-line");
          break;
        case "reflect":
          this._appendLog(logBox, `金光反弹！${evt.target}受 ${formatInt(evt.damage)} 伤害！`, "combo-hit");
          break;
        default:
          break;
      }
    }
    // 更新血条
    this._updateHealthBars(zone, battle);
  },

  _showUltimateOverlay(evt, zone) {
    const overlay = document.createElement("div");
    overlay.className = "ultimate-overlay";
    overlay.style.setProperty("--ult-color", evt.visual_color || "#FFD700");
    overlay.innerHTML = `<div class="ultimate-text">${evt.name}</div><div class="ultimate-sub">${evt.visual_text}</div>`;
    zone.appendChild(overlay);
    // 3秒后移除
    setTimeout(() => overlay.classList.add("fade-out"), 2000);
    setTimeout(() => overlay.remove(), 2800);
  },

  _renderBattleEnd(battle, logBox, zone, panel) {
    if (battle._ended) return;
    battle._ended = true;
    if (battle._timer) clearInterval(battle._timer);

    const endRow = document.createElement("div");
    endRow.className = "battle-end-row";
    const btn = document.createElement("button");
    btn.className = "popup-btn primary";
    btn.textContent = battle.win ? "收取战果" : "退出战圈";
    btn.addEventListener("click", () => {
      closePopup();
      Game.finishBattle(battle);
    });
    endRow.appendChild(btn);
    panel.appendChild(endRow);
  },

  _updateHealthBars(zone, battle) {
    // 敌方
    let enemyBar = zone.querySelector(".enemy-hp-bar");
    if (!enemyBar) {
      enemyBar = document.createElement("div");
      enemyBar.className = "enemy-hp-bar";
      zone.prepend(enemyBar);
    }
    const mainEnemy = battle.enemies.find((e) => e.hp > 0) || battle.enemies[0];
    if (mainEnemy) {
      const pct = Math.max(0, Math.round((mainEnemy.hp / mainEnemy.hpMax) * 100));
      enemyBar.innerHTML = `<span class="bar-name">${mainEnemy.name}</span><div class="bar-track"><div class="bar-fill enemy" style="width:${pct}%"></div></div><span class="bar-num">${formatInt(mainEnemy.hp)}</span>`;
    }

    // 己方
    let playerBar = zone.querySelector(".player-hp-bar");
    if (!playerBar) {
      playerBar = document.createElement("div");
      playerBar.className = "player-hp-bar";
      zone.appendChild(playerBar);
    }
    const pPct = Math.max(0, Math.round((battle.playerHp / battle.playerHpMax) * 100));
    playerBar.innerHTML = `<span class="bar-name">你</span><div class="bar-track"><div class="bar-fill player" style="width:${pPct}%"></div></div><span class="bar-num">${formatInt(battle.playerHp)}</span>`;

    // 斗法栏缩略
    let slotMini = zone.querySelector(".slot-mini-row");
    if (!slotMini) {
      slotMini = document.createElement("div");
      slotMini.className = "slot-mini-row";
      zone.appendChild(slotMini);
    }
    slotMini.innerHTML = battle.slots.map((s, i) =>
      `<span class="slot-mini element-${s.spell_type}">${s.name.slice(0, 2)}</span>`
    ).join('<span class="mini-arrow">→</span>');
  },

  _appendLog(logBox, text, cls) {
    const line = document.createElement("div");
    line.className = `blog-line ${cls || ""}`;
    line.innerHTML = text;
    logBox.appendChild(line);
    logBox.scrollTop = logBox.scrollHeight;
  },

  _mechanicText(evt) {
    const map = {
      block_regen: `${evt.name}罡气自复（+${formatInt(evt.block)}）。`,
      realm_cut: `削境之力侵蚀，你的气血上限 -${evt.cut}%。`,
      five_rotate: `万仙阵灵切换形态——本回合免疫${evt.immune}系。`,
      alchemy: `${evt.name}炼成一丹，回复 ${formatInt(evt.heal)} 气血。`,
      summon: `${evt.name}召唤了一只小妖！`,
      double_strike: `连刺第二枪！你额外受 ${formatInt(evt.damage)} 伤害。`,
      six_soul: `六魂幡摇动——你的罡气、圣盾、增益尽散！`,
      picture_world: `山河社稷图展开——你被拉入图中！`,
      immortal: `${evt.name}被榜文照身，满血复活！`,
    };
    return map[evt.mechanic] || `机制触发：${evt.mechanic}`;
  },

  // ---------- 工具 ----------

  _elementName(el) {
    const names = { body: "体", thunder: "雷", fire: "火", weapon: "器", soul: "魂", calamity: "劫" };
    return names[el] || el;
  },

  _categoryName(cat) {
    const names = { spell: "术", treasure: "宝", ability: "通" };
    return names[cat] || cat;
  },
};
