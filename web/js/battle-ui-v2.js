"use strict";

// ===== 斗法场 + 配招阵面（design/8.4）=====
// 规则核仍是 BattleEngineV2。这里只负责：一场一会话、全屏演出、配招触控。

const BattleUIV2 = {
  _session: null,
  _formCtx: null,
  _selIdx: -1,
  _tutSolved: false,
  _tutTimers: [],
  _condPick: -1,
  _treasurePick: -1,

  // ---------- 会话 ----------

  BAR_CAP: 6,

  abortSession() {
    const s = this._session;
    if (!s) return;
    s.aborted = true;
    if (s.battle) {
      if (typeof BattleEngineV2 !== "undefined" && BattleEngineV2.abort) BattleEngineV2.abort(s.battle);
      else { s.battle.aborted = true; s.battle._animating = false; }
    }
    for (const t of s.timers || []) clearTimeout(t);
    s.timers = [];
    for (const r of s.resolvers || []) { try { r(); } catch (e) {} }
    s.resolvers = [];
    this._session = null;
  },

  closeLayers() {
    this.abortSession();
    this._clearTutorialHints();
    this._unmount("duel-layer", "duel-root");
    this._unmount("formation-layer", "formation-root");
    this._formCtx = null;
    this._condPick = -1;
    this._treasurePick = -1;
    document.body.classList.remove("dueling");
  },

  _unmount(layerId, rootId) {
    const layer = document.getElementById(layerId);
    const root = document.getElementById(rootId);
    if (root) root.innerHTML = "";
    if (layer) layer.classList.add("hidden");
  },

  _alive(session) {
    return !!(session && !session.aborted && this._session === session && session.battle && !session.battle.aborted);
  },

  _timer(session, fn, ms) {
    const id = setTimeout(fn, ms);
    if (session && session.timers) session.timers.push(id);
    return id;
  },

  // ---------- 公共入口（兼容旧 renderer 名） ----------

  renderBattlePopup(panel, battle, state) {
    this.openBattle(battle, state);
  },

  renderSlotConfig(container, state, onConfirm, opts = {}) {
    this.openFormation(state, onConfirm, opts);
  },

  openBattle(battle, state) {
    this.abortSession();
    this._unmount("formation-layer", "formation-root");
    document.body.classList.add("dueling");
    const layer = document.getElementById("duel-layer");
    const root = document.getElementById("duel-root");
    if (!layer || !root || !battle) return;
    const session = { id: battle.sessionId || ("b" + Date.now()), battle, state, timers: [], resolvers: [], aborted: false };
    this._session = session;
    battle._ended = false;
    battle._animating = false;
    layer.classList.remove("hidden");
    layer.dataset.session = session.id;
    this._mountDuel(root, session);
    this._startAutoLoop(session);
  },

  closeBattle() {
    this.abortSession();
    this._unmount("duel-layer", "duel-root");
    document.body.classList.remove("dueling");
  },

  openFormation(state, onConfirm, opts = {}) {
    this._clearTutorialHints();
    const layer = document.getElementById("formation-layer");
    const root = document.getElementById("formation-root");
    if (!layer || !root) return;
    this._formCtx = { state, onConfirm, opts };
    if (this._selIdx == null) this._selIdx = -1;
    layer.classList.remove("hidden");
    this._mountFormation(root);
  },

  closeFormation() {
    this._clearTutorialHints();
    this._unmount("formation-layer", "formation-root");
    this._formCtx = null;
    this._condPick = -1;
    this._treasurePick = -1;
  },

  // ---------- 斗法场 DOM ----------

  _mountDuel(root, session) {
    const battle = session.battle;
    const state = session.state;
    const bg = this._battleBg(battle, state);
    const playerName = this._playerBattleName(state);
    const playerImg = this._playerPortrait(state);
    const front = (battle.enemies || []).find((e) => e.hp > 0) || (battle.enemies || [])[0] || { name: battle.name, hp: 1, hpMax: 1 };
    const foeImg = this._foePortrait(battle);
    battle.playerName = playerName;
    session.urgedSlots = session.urgedSlots || {};
    root.innerHTML = "";
    root.className = "duel-root duel-board";
    root.style.backgroundImage =
      `linear-gradient(180deg, rgba(6,8,12,0.00) 0%, rgba(6,8,12,0.08) 48%, rgba(6,8,12,0.90) 100%), url("${bg}")`;

    const head = document.createElement("header");
    head.className = "duel-head";
    head.innerHTML =
      `<div class="duel-round">第 <b data-duel="round">${int(battle.round, 0)}</b> 回</div>`
      + `<div class="duel-title" data-duel="title">${this._esc(battle.name)}</div>`
      + `<div class="duel-speeds" data-duel="speeds"></div>`;
    root.appendChild(head);
    this._mountSpeeds(head.querySelector("[data-duel=speeds]"), session);

    const arena = document.createElement("div");
    arena.className = "duel-arena";
    arena.innerHTML =
      `<div class="duel-impact" data-duel="impact"></div>`
      + `<div class="duel-field">`
      + `  <div class="duel-scroll">`
      + `    <div class="duel-portrait foe${foeImg ? "" : " nametag"}" data-duel="foe-port">`
      + (foeImg ? `<img alt="" src="${this._esc(foeImg)}">` : this._yaoSilhouette(front.name))
      + `      <div class="duel-floats" data-duel="foe-floats"></div>`
      + `    </div>`
      + `    <div class="duel-plaque">${this._esc(front.name)}</div>`
      + `    <div class="duel-hp foe" data-duel="foe-hp"></div>`
      + `    <div class="duel-orbs foe" data-duel="foe-orbs"></div>`
      + `  </div>`
      + `  <div class="duel-you">`
      + `    <div class="duel-portrait you" data-duel="you-port">`
      + (playerImg ? `<img alt="" src="${this._esc(playerImg)}">` : `<span class="duel-nametag">${this._esc(playerName)}</span>`)
      + `      <div class="duel-floats" data-duel="you-floats"></div>`
      + `    </div>`
      + `    <div class="duel-you-meta">`
      + `      <div class="duel-you-name">${this._esc(playerName)}</div>`
      + `      <div class="duel-hp you" data-duel="you-hp"></div>`
      + `    </div>`
      + `  </div>`
      + `</div>`;
    root.appendChild(arena);

    const callout = document.createElement("div");
    callout.className = "duel-callout";
    callout.setAttribute("data-duel", "callout");
    callout.innerHTML = `<span class="co-k">气机</span><span class="co-name">相触</span><span class="co-sub">点亮的术法可催动</span>`;
    root.appendChild(callout);

    const orbs = document.createElement("div");
    orbs.className = "duel-orbs you";
    orbs.setAttribute("data-duel", "orbs");
    orbs.addEventListener("click", (ev) => this._onOrbTap(ev, session, root));
    root.appendChild(orbs);

    const ticker = document.createElement("div");
    ticker.className = "duel-ticker hidden";
    ticker.setAttribute("data-duel", "ticker");
    ticker.innerHTML = `<div class="duel-tick" data-duel="tick"></div>`;
    root.appendChild(ticker);

    const end = document.createElement("div");
    end.className = "duel-end hidden";
    end.setAttribute("data-duel", "end");
    root.appendChild(end);

    this._paintHp(root, battle);
    this._paintOrbs(root, battle, -1);
    if (typeof BattleEngineV2._planEnemyRound === "function") BattleEngineV2._planEnemyRound(battle);
    this._paintFoeBar(root, battle, 0, "next");
    this._paintTele(root, battle);
    for (const evt of (battle.pendingEvents || []).splice(0)) {
      if (typeof evt === "string") this._tick(root, session, evt, "sys");
    }
  },

  _mountSpeeds(host, session) {
    if (!host) return;
    host.innerHTML = "";
    const speeds = [1, 2, 4, 0];
    const labels = ["1×", "2×", "4×", "跳过"];
    speeds.forEach((sp, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "duel-speed" + (session.battle.speed === sp ? " on" : "");
      btn.textContent = labels[idx];
      btn.addEventListener("click", () => {
        if (!this._alive(session)) return;
        session.battle.speed = sp;
        host.querySelectorAll(".duel-speed").forEach((b) => b.classList.remove("on"));
        btn.classList.add("on");
        if (sp === 0) {
          const rs = (session.resolvers || []).splice(0);
          for (const r of rs) { try { r(); } catch (e) {} }
        }
      });
      host.appendChild(btn);
    });
  },

  _paintHp(root, battle) {
    const foeBox = root.querySelector("[data-duel=foe-hp]");
    if (foeBox) {
      foeBox.innerHTML = (battle.enemies || []).map((e) => {
        const dead = e.hp <= 0;
        const pct = Math.max(0, Math.round((e.hp / Math.max(1, e.hpMax)) * 100));
        const charging = (e.charged || (e.intent && e.intent.type === "charge") || e.intent === "charge") && !dead;
        return `<div class="duel-hp-row${dead ? " dead" : ""}${charging ? " charging" : ""}">`
          + `<span class="duel-hp-track"><i style="width:${pct}%"></i></span>`
          + `<span class="duel-hp-num">${dead ? "溃" : formatInt(e.hp)}</span></div>`;
      }).join("");
    }
    const plaque = root.querySelector(".duel-plaque");
    const front = (battle.enemies || []).find((e) => e.hp > 0) || (battle.enemies || [])[0];
    if (plaque && front) plaque.textContent = front.name;
    const youBox = root.querySelector("[data-duel=you-hp]");
    if (youBox) {
      const pct = Math.max(0, Math.round((battle.playerHp / Math.max(1, battle.playerHpMax)) * 100));
      youBox.innerHTML = `<div class="duel-hp-row">`
        + `<span class="duel-hp-track player"><i style="width:${pct}%"></i></span>`
        + `<span class="duel-hp-num">${formatInt(battle.playerHp)}</span></div>`;
    }
    const roundEl = root.querySelector("[data-duel=round]");
    if (roundEl) roundEl.textContent = String(int(battle.round, 0));
  },

  _paintOrbs(root, battle, activeIndex, mode) {
    const host = root.querySelector("[data-duel=orbs]");
    if (!host) return;
    const slots = battle.slots || [];
    const state = (this._session && this._session.state) || {};
    const open = BattleEngineV2.getSlotCount ? BattleEngineV2.getSlotCount(state) : slots.length;
    const cap = this.BAR_CAP;
    let html = "";
    for (let i = 0; i < cap; i++) {
      if (i >= open) {
        html += `<div class="duel-orb locked" data-idx="${i}"><span class="duel-orb-cat">锁</span><span class="duel-orb-name">未开</span></div>`;
        continue;
      }
      const s = slots[i];
      if (!s) {
        html += `<div class="duel-orb empty" data-idx="${i}"><span class="duel-orb-name">空</span></div>`;
        continue;
      }
      const on = i === activeIndex ? " on" : (activeIndex >= 0 && i < activeIndex ? " done" : "");
      const combo = i > 0 && slots[i - 1] && slots[i - 1].spell_type === s.spell_type ? " combo" : "";
      const urging = (mode === "urge" && i === activeIndex) ? " urging" : "";
      const icon = this._skillIcon(s);
      const cat = s.treasure ? "器" : "术";
      html += `<button type="button" class="duel-orb element-${s.spell_type}${on}${combo}${urging}" data-idx="${i}">`
        + `<span class="duel-orb-cat">${cat}</span>`
        + (icon ? `<img alt="" src="${icon}">` : `<span class="duel-orb-el">${this._elementName(s.spell_type)}</span>`)
        + `<span class="duel-orb-name">${this._esc(s.name || "")}</span>`
        + (i === activeIndex && mode === "urge" ? `<span class="duel-orb-cue">催</span>` : "")
        + `</button>`;
    }
    host.innerHTML = html;
  },

  _paintFoeBar(root, battle, pulseIndex, mode) {
    const host = root.querySelector("[data-duel=foe-orbs]");
    if (!host) return;
    const front = (battle.enemies || []).find((e) => e.hp > 0);
    const q = (front && front.roundIntents) || [];
    const n = this.BAR_CAP;
    const live = Math.max(1, (battle.slots || []).length);
    const at = front ? int(front.roundIntentAt) : 0;
    let html = "";
    for (let i = 0; i < n; i++) {
      if (i >= live) {
        html += `<div class="duel-orb foe-orb empty" data-foe-idx="${i}"><span class="duel-orb-name">·</span></div>`;
        continue;
      }
      const it = q[i] || {};
      const el = it.element || "";
      let cls = "duel-orb foe-orb" + (el ? " element-" + el : "");
      if (i < at) cls += " done";
      if (mode === "cast" && i === pulseIndex) cls += " on";
      else if (mode === "next" && i === pulseIndex) cls += " next";
      const name = it.label || (i < at ? "·" : "…");
      html += `<div class="${cls}" data-foe-idx="${i}">`
        + `<span class="duel-orb-name">${this._esc(name)}</span></div>`;
    }
    host.innerHTML = html;
  },

  _paintTele(root, battle) {
    const box = root.querySelector("[data-duel=tele]");
    if (!box) return;
    const bar = root.querySelector("[data-duel=foe-orbs]");
    if (bar && bar.children.length) { box.innerHTML = ""; return; }
    const front = (battle.enemies || []).find((e) => e.hp > 0);
    const it = front ? front.intent : null;
    if (!it || battle.done) { box.innerHTML = ""; return; }
    const wx = it.wuxing || null;
    const hasRS = typeof ResonanceSystem !== "undefined";
    const wxLabel = wx && hasRS ? ResonanceSystem.wuxingLabel(wx) : "";
    const wxColor = wx && hasRS ? ResonanceSystem.wuxingColor(wx) : "#c9a227";
    const badge = wx ? `<span class="duel-wx" style="color:${wxColor};border-color:${wxColor}">${this._esc(wxLabel)}</span>` : "";
    box.innerHTML = `<span class="duel-tele-k">敌势</span><span class="duel-tele-v">${this._esc(it.label || it.type || "")}</span>${badge}`;
  },

  _tick(root, session, text, cls) {
    const tick = root.querySelector("[data-duel=tick]");
    if (tick) {
      tick.className = "duel-tick " + (cls || "");
      tick.innerHTML = text;
    }
    const dbg = root.querySelector("[data-duel=debug-log]");
    if (dbg) {
      const line = document.createElement("div");
      line.className = cls || "";
      line.innerHTML = text;
      dbg.appendChild(line);
      dbg.scrollTop = dbg.scrollHeight;
    }
  },

  _float(root, side, text, cls) {
    const host = root.querySelector(side === "you" ? "[data-duel=you-floats]" : "[data-duel=foe-floats]");
    if (!host) return;
    const el = document.createElement("div");
    el.className = "duel-float " + (cls || "");
    el.textContent = text;
    el.style.left = (36 + Math.random() * 28) + "%";
    host.appendChild(el);
    const session = this._session;
    this._timer(session || { timers: [] }, () => el.remove(), 900);
  },

  _shake(root, side) {
    const el = root.querySelector(side === "you" ? "[data-duel=you-port]" : "[data-duel=foe-port]");
    if (!el) return;
    el.classList.remove("hit");
    void el.offsetWidth;
    el.classList.add("hit");
  },

  // ---------- 播放循环 ----------

  _startAutoLoop(session) {
    const battle = session.battle;
    const state = session.state;
    if (battle._animating) return;
    battle._animating = true;
    const root = document.getElementById("duel-root");
    const delay = () => this._getDelay(battle);
    const sleep = (ms) => new Promise((r) => {
      if (!this._alive(session) || battle.speed === 0 || ms <= 0) return r();
      session.resolvers.push(r);
      this._timer(session, r, ms);
    });
    const alive = () => battle.enemies.filter((e) => e.hp > 0).length;

    const runRound = async () => {
      while (this._alive(session) && !battle.done) {
        const startEvents = BattleEngineV2.startPlayerRound(state, battle);
        if (!this._alive(session)) return;
        this._paintHp(root, battle);
        this._paintOrbs(root, battle, -1);
        this._paintFoeBar(root, battle, 0, "next");
        this._paintTele(root, battle);
        if (startEvents.length) {
          this._renderEvents(startEvents, root, session);
          await sleep(delay() * 0.35);
        }
        if (!this._alive(session) || battle.done) break;

        for (let i = 0; i < battle.slots.length; i++) {
          if (!this._alive(session) || battle.done || alive() === 0) break;
          const skill = battle.slots[i];
          session.urgeSlot = i;
          battle._urgeNext = 0;
          this._paintOrbs(root, battle, i, battle.speed === 0 ? "" : "urge");
          this._paintFoeBar(root, battle, i, "next");
          this._paintTele(root, battle);
          {
            const dmg = skill ? (skill.damage_base || skill.damage || "") : "";
            this._callout(
              root,
              skill ? this._xiuCallout(skill.spell_type) : "",
              skill ? skill.name : "",
              dmg ? ("伤 " + formatInt(dmg)) : (battle.speed === 0 ? "" : "点此催动"),
              ""
            );
          }
          await sleep(delay() * 0.42);
          if (!this._alive(session) || battle.done) break;
          if (battle.speed !== 0 && skill) this._launchBolt(root, session, i, skill);
          await sleep(delay() * 0.16);
          if (!this._alive(session)) return;
          session.urgeSlot = -1;
          const slotEvents = BattleEngineV2.executeSingleSlot(state, battle, i);
          if (!this._alive(session)) return;
          if (slotEvents.length) this._renderEvents(slotEvents, root, session);
          this._paintOrbs(root, battle, i);
          await sleep(delay() * 0.42);
          if (!this._alive(session) || battle.done || alive() === 0) break;

          this._paintFoeBar(root, battle, i, "cast");
          const gapEvents = BattleEngineV2.enemyGapAct(state, battle);
          if (!this._alive(session)) return;
          if (gapEvents.length) this._renderEvents(gapEvents, root, session);
          this._paintFoeBar(root, battle, i, "done");
          this._paintTele(root, battle);
          await sleep(delay() * 0.55);
        }

        if (!this._alive(session) || battle.done) break;
        const endEvents = BattleEngineV2.endPlayerRound(state, battle);
        if (!this._alive(session)) return;
        if (endEvents.length) {
          this._renderEvents(endEvents, root, session);
          await sleep(delay() * 0.45);
        }
        if (!this._alive(session) || battle.done) break;
        const bookEvents = BattleEngineV2.endEnemyRoundBookkeeping(state, battle);
        if (!this._alive(session)) return;
        if (bookEvents.length) this._renderEvents(bookEvents, root, session);
        this._paintOrbs(root, battle, -1);
        this._paintHp(root, battle);
        if (!battle.done) await sleep(delay() * 0.28);
      }

      if (!this._alive(session)) return;
      battle._animating = false;
      this._renderBattleEnd(session, root);
    };

    runRound();
  },

  _getDelay(battle) {
    if (battle.speed === 2) return 700;
    if (battle.speed === 4) return 300;
    if (battle.speed === 0) return 0;
    return 1400;
  },

  _renderEvents(events, root, session) {
    const battle = session.battle;
    const skipMode = battle.speed === 0;
    const KEY = new Set(["ultimate", "victory", "player_defeated", "kill", "phase_advance"]);
    for (const evt of events) {
      if (skipMode && !KEY.has(evt.type)) continue;
      switch (evt.type) {
        case "attack": {
          const sub = [
            evt.urged ? "催动" : "",
            evt.combo ? `${this._xiuCallout(evt.element)}共鸣 ×${evt.comboMult}` : "",
          ].filter(Boolean).join(" · ");
          this._callout(root, this._xiuCallout(evt.element), evt.skillName, sub || ("伤 " + formatInt(evt.damage)), evt.combo ? "combo" : (evt.urged ? "urge" : "hit"));
          this._float(root, "foe", (evt.combo ? "✦" : "-") + formatInt(evt.damage), evt.combo ? "crit" : (evt.urged ? "urge" : "dmg"));
          this._shake(root, "foe");
          this._flash(root, session, evt.element, evt.combo);
          if (evt.combo) this._stamp(root, session, "共鸣");
          else if (evt.urged) this._stamp(root, session, "催");
          if (typeof AudioManager !== "undefined") {
            const now = performance.now();
            if (!this._lastCastSfx || now - this._lastCastSfx > 130) {
              this._lastCastSfx = now;
              AudioManager.playSfx(AudioManager.elementSfx(evt.element), { gain: evt.combo ? 1.0 : 0.8 });
            }
          }
          break;
        }
        case "kill":
          this._tick(root, session, `${this._esc(evt.targetName)} 道消身陨，溃散当场！`, "kill");
          break;
        case "slot_wait":
          this._tick(root, session, `${this._esc(evt.skillName)} 引而不发（${this._conditionLabel(evt.condition)}）。`, "wait");
          break;
        case "ultimate":
          this._showUltimateOverlay(evt, root, session);
          const shen = root.querySelector(".duel-kit-slot.shen");
          if (shen) shen.classList.add("filled");
          if (typeof AudioManager !== "undefined") AudioManager.playSfx("tribulation_rumble", { dur: 1.0, gain: 0.5 });
          this._callout(root, "通", evt.name, evt.visual_text || "", "ult");
          if (evt.total_damage) this._float(root, "foe", formatInt(evt.total_damage), "ult");
          break;
        case "enemy_attack":
          if (battle.stats) battle.stats.lastHit = evt.name;
          this._callout(root, "敌", evt.label || "扑击", "你受创 " + formatInt(evt.damage), "lose");
          this._float(root, "you", "-" + formatInt(evt.damage), "dmg");
          this._shake(root, "you");
          break;
        case "enemy_charged_attack":
          if (battle.stats) battle.stats.lastHit = evt.name;
          this._callout(root, "敌", "重击", "你受创 " + formatInt(evt.damage), "lose");
          this._float(root, "you", "-" + formatInt(evt.damage), "crit");
          this._shake(root, "you");
          break;
        case "enemy_stunned":
        case "enemy_paralyzed":
          this._tick(root, session, `${this._esc(evt.name)}气机受制，动弹不得！`, "ctrl");
          break;
        case "enemy_burn_tick":
          this._tick(root, session, `灵火灼体，${this._esc(evt.name)}受焚 ${formatInt(evt.damage)}。`, "burn");
          this._float(root, "foe", "-" + formatInt(evt.damage), "burn");
          break;
        case "player_burn":
          this._tick(root, session, `邪火焚身，你受灼 ${formatInt(evt.damage)}。`, "hurt");
          this._float(root, "you", "-" + formatInt(evt.damage), "burn");
          break;
        case "player_defeated":
          this._callout(root, "", "且战且退", "灵台尚在", "lose");
          root.classList.add("duel-lost");
          break;
        case "victory":
          this._callout(root, "", "溃散", "此战告捷", "win");
          const foe = root.querySelector("[data-duel=foe-port]");
          if (foe) foe.classList.add("fall");
          break;
        case "mechanic":
          this._tick(root, session, this._mechanicText(evt), "mech");
          break;
        case "phase_advance":
          this._tick(root, session, evt.intro || `${this._esc(evt.name)}显化而出！`, "phase");
          break;
        case "lifesteal":
          this._tick(root, session, `六魂尽灭——回复 ${formatInt(evt.amount)} 气血！`, "heal");
          this._float(root, "you", "+" + formatInt(evt.amount), "heal");
          break;
        case "reflect":
          this._tick(root, session, `金光反弹！${this._esc(evt.target)}受 ${formatInt(evt.damage)} 伤害！`, "combo");
          this._float(root, "foe", "-" + formatInt(evt.damage), "crit");
          break;
        case "fire_domain":
          this._tick(root, session, `火域燎原，${this._esc(evt.target)}受焚 ${formatInt(evt.damage)}。`, "burn");
          break;
        case "enemy_charge":
          this._tick(root, session, `${this._esc(evt.name)}${this._esc(evt.label || "蓄势")}，气机暴涨！`, "hurt");
          break;
        case "enemy_charge_blocked":
          this._tick(root, session, `${this._esc(evt.name)}蓄势被锁，难以凝聚。`, "ctrl");
          break;
        case "enemy_block":
          this._tick(root, session, `${this._esc(evt.name)}凝罡护体（罡气 ${formatInt(evt.block)}）。`, "sys");
          break;
        case "enemy_burn":
          this._tick(root, session, `${this._esc(evt.name)}施以邪火，你被灼烧（+${formatInt(evt.burn)}）。`, "hurt");
          break;
        case "enemy_weak":
          this._tick(root, session, `${this._esc(evt.name)}施以弱咒，你的攻势受挫。`, "hurt");
          break;
        case "enemy_miss":
          this._tick(root, session, `${this._esc(evt.name)}一击落空！`, "ctrl");
          break;
        case "self_burn_tick":
          this._tick(root, session, `赤焰反噬，你自灼 ${formatInt(evt.damage)}。`, "hurt");
          break;
        case "timeout":
          this._tick(root, session, "斗法逾时，胜负未分，只得作罢。", "lose");
          break;
        default:
          break;
      }
    }
    this._paintHp(root, battle);
  },

  _showUltimateOverlay(evt, root, session) {
    if (session.battle && session.battle.speed === 0) return;
    const overlay = document.createElement("div");
    overlay.className = "duel-ult";
    overlay.style.setProperty("--ult-color", evt.visual_color || "#FFD700");
    overlay.innerHTML = `<div class="duel-ult-name">${this._esc(evt.name)}</div><div class="duel-ult-sub">${this._esc(evt.visual_text || "")}</div>`;
    root.appendChild(overlay);
    this._timer(session, () => overlay.classList.add("fade-out"), 1800);
    this._timer(session, () => overlay.remove(), 2600);
  },

  _renderBattleEnd(session, root) {
    const battle = session.battle;
    if (!this._alive(session)) return;
    if (battle._ended) return;
    battle._ended = true;
    battle._animating = false;
    this._paintHp(root, battle);
    this._paintOrbs(root, battle, -1);
    this._paintFoeBar(root, battle, -1, "idle");
    this._paintTele(root, battle);

    const end = root.querySelector("[data-duel=end]");
    if (!end) return;
    end.classList.remove("hidden");
    end.innerHTML = "";

    const banner = document.createElement("div");
    banner.className = "duel-finale" + (battle.win ? " win" : " loss");
    banner.innerHTML = `<div class="finale-kicker">${battle.win ? "气机已定" : "气机未定"}</div>`
      + `<div class="finale-title">${battle.win ? "告捷" : "暂退"}</div>`
      + `<div class="finale-sub">${battle.win ? this._esc(battle.name) + "溃散" : "且战且退，未伤根本"}</div>`;
    end.appendChild(banner);

    if (!battle.win) {
      const st = battle.stats || { dealt: 0, taken: 0, lastHit: "" };
      const remainFoes = (battle.enemies || []).filter((e) => e.hp > 0);
      const totalEnemyHp = (battle.enemies || []).reduce((a, e) => a + Math.max(0, e.hp), 0);
      const box = document.createElement("div");
      box.className = "duel-settle loss";
      box.innerHTML = `<div class="settle-title">此战小记</div>`
        + `<div class="defeat-line">撑至第 ${int(battle.round, 0)} 回</div>`
        + `<div class="defeat-line">输出 ${formatInt(st.dealt)}　承伤 ${formatInt(st.taken)}</div>`
        + (st.lastHit ? `<div class="defeat-line">致命一击：${this._esc(st.lastHit)}</div>` : "")
        + (remainFoes.length ? `<div class="defeat-line">残敌余血 ${formatInt(totalEnemyHp)}</div>` : "")
        + `<div class="defeat-tip">同系相邻则共鸣。术法亮起时点一下可催动。</div>`;
      end.appendChild(box);
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "duel-collect";
    btn.textContent = battle.win ? "收取战果" : "退出战圈";
    btn.addEventListener("click", () => this._collect(session));
    end.appendChild(btn);
  },

  _collect(session) {
    if (!session || session._collected) return;
    session._collected = true;
    const battle = session.battle;
    this.closeBattle();
    if (typeof releaseModal === "function") releaseModal();
    if (typeof Game !== "undefined" && Game.finishBattle) Game.finishBattle(battle);
  },

  // ---------- 配招阵面 ----------

  _mountFormation(root) {
    const ctx = this._formCtx;
    if (!ctx) return;
    const state = ctx.state;
    const opts = ctx.opts || {};
    const maxSlots = BattleEngineV2.getSlotCount(state);
    const slots = state.battle_slots || [];
    const unlocked = state.unlocked_skills || [];
    root.innerHTML = "";

    const head = document.createElement("header");
    head.className = "form-head";
    head.innerHTML = `<div class="form-kicker">斗法栏</div><div class="form-title">配招</div><div class="form-hint">体系体/器/魂/劫 · 器=法宝绑在格上 · 五行是器的二级 · 炼气开 ${maxSlots}/6 格</div>`;
    root.appendChild(head);

    const row = document.createElement("div");
    row.className = "form-slots";
    for (let i = 0; i < this.BAR_CAP; i++) {
      row.appendChild(this._slotCard(state, slots, i, maxSlots));
    }
    root.appendChild(row);

    const preview = document.createElement("div");
    preview.className = "form-preview";
    preview.innerHTML = this._getComboPreview(slots);
    root.appendChild(preview);

    if (this._condPick >= 0) root.appendChild(this._optionSheet("释放条件", BattleEngineV2.conditionOptions(), this._slotCond(slots[this._condPick]), (val) => {
      const i = this._condPick;
      slots[i] = { id: this._slotId(slots[i]), condition: val, treasure: this._slotTreasure(slots[i]) };
      state.battle_slots = slots;
      SaveManager.save(state);
      this._condPick = -1;
      this._rerenderConfig();
    }, () => { this._condPick = -1; this._rerenderConfig(); }));

    if (this._treasurePick >= 0) {
      const owned = this._ownedTreasures(state);
      const optsT = [{ value: "", label: "无法宝" }].concat(owned.map((tr) => ({
        value: tr.id,
        label: tr.name + (tr.wuxing ? ` [${this._wuxingBadge(tr.wuxing)}]` : ""),
      })));
      root.appendChild(this._optionSheet("绑定法宝（器·五行）", optsT, this._slotTreasure(slots[this._treasurePick]) || "", (val) => {
        const i = this._treasurePick;
        slots[i] = { id: this._slotId(slots[i]), condition: this._slotCond(slots[i]), treasure: val || null };
        state.battle_slots = slots;
        SaveManager.save(state);
        this._treasurePick = -1;
        this._rerenderConfig();
      }, () => { this._treasurePick = -1; this._rerenderConfig(); }));
    }

    const listTitle = document.createElement("div");
    listTitle.className = "form-list-title";
    listTitle.textContent = "体系四修 · 法术入格 · 法宝绑格";
    root.appendChild(listTitle);
    this._mountXiuCatalog(root, state, slots, unlocked, maxSlots);

    if (opts.tutorial) this._renderTutorialUI(root, state);
    else {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "form-confirm";
      btn.textContent = "确认配招";
      btn.addEventListener("click", () => {
        const fn = ctx.onConfirm;
        this.closeFormation();
        if (fn) fn();
      });
      root.appendChild(btn);
    }
  },

  _slotCard(state, slots, i, maxSlots) {
    const card = document.createElement("div");
    card.className = "form-slot";
    card.dataset.index = i;
    if (i >= maxSlots) {
      card.classList.add("locked");
      card.innerHTML = `<span class="form-slot-num">${i + 1}</span><span class="form-slot-empty">境界未开</span>`;
      return card;
    }
    const entry = slots[i];
    if (entry) {
      const skill = BattleEngineV2.getSkillData(this._slotId(entry));
      if (skill) {
        card.classList.add("filled", `element-${skill.spell_type}`);
        if (this._selIdx === i) card.classList.add("selected");
        if (i > 0 && slots[i - 1]) {
          const prev = BattleEngineV2.getSkillData(this._slotId(slots[i - 1]));
          if (prev && BattleEngineV2.sameTixi && BattleEngineV2.sameTixi(prev.spell_type, skill.spell_type)) card.classList.add("combo-active");
        }
        const icon = this._skillIcon(skill);
        const cond = this._conditionLabel(this._slotCond(entry));
        const treasureId = this._slotTreasure(entry);
        const tr = treasureId ? BattleEngineV2.getTreasureData(treasureId) : null;
        const wx = tr && tr.wuxing ? this._wuxingBadge(tr.wuxing) : "";
        card.innerHTML =
          `<span class="form-slot-num">${i + 1}</span>`
          + `<button type="button" class="form-slot-x" title="移除">✕</button>`
          + (icon ? `<img class="form-slot-icon" alt="" src="${icon}">` : `<span class="form-slot-el">${this._esc(this._xiuCallout(skill.spell_type))}</span>`)
          + `<span class="form-slot-name">${this._esc(skill.name)}</span>`
          + `<span class="form-slot-type">法术 · ${this._esc(this._xiuCallout(skill.spell_type))}</span>`
          + `<button type="button" class="form-chip cond">${this._esc(cond)}</button>`
          + `<button type="button" class="form-chip treasure">${this._esc(tr ? ("器·" + (tr.treasure_name || "") + (wx ? " " + wx : "")) : "器·未绑法宝")}</button>`;
        card.addEventListener("click", (ev) => {
          if (ev.target.closest(".form-slot-x") || ev.target.closest(".form-chip")) return;
          if (this._selIdx === i) this._selIdx = -1;
          else if (this._selIdx >= 0 && slots[this._selIdx]) {
            const a = this._selIdx;
            const tmp = slots[a]; slots[a] = slots[i]; slots[i] = tmp;
            this._selIdx = -1;
            state.battle_slots = slots;
            SaveManager.save(state);
          } else this._selIdx = i;
          this._rerenderConfig();
        });
        card.querySelector(".form-slot-x").addEventListener("click", (ev) => {
          ev.stopPropagation();
          slots.splice(i, 1);
          this._selIdx = -1;
          state.battle_slots = slots.filter(Boolean);
          SaveManager.save(state);
          this._rerenderConfig();
        });
        const condBtn = card.querySelector(".form-chip.cond");
        if (condBtn) condBtn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          this._condPick = i;
          this._treasurePick = -1;
          this._rerenderConfig();
        });
        const tBtn = card.querySelector(".form-chip.treasure");
        if (tBtn) tBtn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          this._treasurePick = i;
          this._condPick = -1;
          this._rerenderConfig();
        });
        return card;
      }
    }
    card.classList.add("empty");
    card.innerHTML = `<span class="form-slot-num">${i + 1}</span><span class="form-slot-empty">空</span>`;
    return card;
  },

  _optionSheet(title, options, current, onPick, onClose) {
    const sheet = document.createElement("div");
    sheet.className = "form-sheet";
    const inner = document.createElement("div");
    inner.className = "form-sheet-inner";
    inner.innerHTML = `<div class="form-sheet-title">${this._esc(title)}</div>`;
    for (const opt of options) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "form-sheet-opt" + (String(opt.value) === String(current) ? " on" : "");
      b.textContent = opt.label;
      b.addEventListener("click", () => onPick(opt.value));
      inner.appendChild(b);
    }
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "form-sheet-opt ghost";
    cancel.textContent = "取消";
    cancel.addEventListener("click", onClose);
    inner.appendChild(cancel);
    sheet.appendChild(inner);
    sheet.addEventListener("click", (ev) => { if (ev.target === sheet) onClose(); });
    return sheet;
  },

  _rerenderConfig() {
    const root = document.getElementById("formation-root");
    if (root && this._formCtx) this._mountFormation(root);
  },

  // ---------- 教学 ----------

  startTutorial(state) {
    const need = ["skill_body_01", "skill_body_02", "skill_thunder_01"];
    state.unlocked_skills = state.unlocked_skills || [];
    for (const id of need) {
      if (!state.unlocked_skills.includes(id)) state.unlocked_skills.push(id);
      if (!state.skill_levels) state.skill_levels = {};
      if (!state.skill_levels[id]) state.skill_levels[id] = 1;
    }
    state.battle_slots = [
      { id: "skill_body_01", condition: "always" },
      { id: "skill_thunder_01", condition: "always" },
      { id: "skill_body_02", condition: "always" },
    ];
    this._selIdx = -1;
    this._tutSolved = false;
    SaveManager.save(state);
    if (typeof Game !== "undefined") Game.queuePopup({ kind: "slot_config", tutorial: true });
  },

  _renderTutorialUI(container, state) {
    this._clearTutorialHints();
    const slots = state.battle_slots || [];
    const solved = this._tutorialHasCombo(slots);
    const banner = document.createElement("div");
    banner.className = "tut-banner";
    banner.innerHTML = solved
      ? "✓ 气机共鸣！同系术法相邻，威力倍增。"
      : "教学 · 试着让<b>同系术法</b>相邻排列……";
    container.appendChild(banner);
    const hint = document.createElement("div");
    hint.className = "tut-hint";
    hint.id = "tut-hint";
    container.appendChild(hint);
    if (solved) {
      this._tutSolved = true;
      hint.innerHTML = '<div class="tut-bubble gold">妙！同系相邻，气机共鸣，威力倍增。</div>';
      const btn = document.createElement("button");
      btn.className = "form-confirm tut-go";
      btn.textContent = "开始斗法 · 试试威力";
      btn.addEventListener("click", () => this._launchTutorialBattle(state));
      container.appendChild(btn);
    } else {
      this._highlightBodySlots(container);
      this._tutTimers.push(setTimeout(() => {
        if (this._tutSolved) return;
        const h = document.getElementById("tut-hint");
        if (h) h.innerHTML = '<div class="tut-bubble">同系术法相邻，或有奇效……<br><span class="tut-sub">点选一格，再点另一格，即可交换顺序。</span></div>';
      }, 3000));
      this._tutTimers.push(setTimeout(() => {
        if (this._tutSolved) return;
        const h = document.getElementById("tut-hint");
        if (h) h.innerHTML = '<div class="tut-bubble arrow">把第③格换到第②格 ↷<br><span class="tut-sub">先点第③格，再点第②格。</span></div>';
        this._showArrow(container);
      }, 8000));
    }
  },

  _tutorialHasCombo(slots) {
    for (let i = 1; i < slots.length; i++) {
      const a = BattleEngineV2.getSkillData(this._slotId(slots[i - 1]));
      const b = BattleEngineV2.getSkillData(this._slotId(slots[i]));
      if (a && b && a.spell_type === b.spell_type) return true;
    }
    return false;
  },

  _highlightBodySlots(container) {
    const cells = container.querySelectorAll(".form-slot.filled");
    cells.forEach((cell) => {
      const idx = parseInt(cell.dataset.index, 10);
      const slots = (this._formCtx && this._formCtx.state.battle_slots) || [];
      const sk = BattleEngineV2.getSkillData(this._slotId(slots[idx]));
      if (sk && sk.spell_type === "body") cell.classList.add("tut-shake");
    });
  },

  _showArrow(container) {
    const row = container.querySelector(".form-slots");
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
    const pending = (typeof GameplayEngine !== "undefined") ? GameplayEngine.pendingBattle : null;
    if (typeof GameplayEngine !== "undefined") GameplayEngine.pendingBattle = null;
    this.closeFormation();
    if (typeof releaseModal === "function") releaseModal();
    if (typeof Game !== "undefined") {
      if (pending) Game.startBattleV2(pending);
      else Game.startBattleV2({
        name: "山野妖猪",
        enemy_power: 350,
        source: "normal",
        payload: { tutorial: true },
      });
    }
  },

  _getComboPreview(slots) {
    if (!slots || slots.length < 2) return '<span class="preview-none">法术入格，同体系相邻连锁；器上五行才共鸣</span>';
    const parts = [];
    let currentCombo = 1;
    let comboElement = null;
    for (let i = 1; i < slots.length; i++) {
      const prev = BattleEngineV2.getSkillData(this._slotId(slots[i - 1]));
      const curr = BattleEngineV2.getSkillData(this._slotId(slots[i]));
      if (prev && curr && BattleEngineV2.sameTixi && BattleEngineV2.sameTixi(prev.spell_type, curr.spell_type)) {
        currentCombo++;
        comboElement = curr.spell_type;
      } else {
        if (currentCombo >= 2) {
          parts.push(`<span class="preview-combo element-${comboElement}">${this._xiuCallout(comboElement)}${currentCombo >= 3 ? "三连·终极" : "二连"}×1.3</span>`);
        }
        currentCombo = 1;
        comboElement = null;
      }
    }
    if (currentCombo >= 2 && comboElement) {
      parts.push(`<span class="preview-combo element-${comboElement}">${this._xiuCallout(comboElement)}${currentCombo >= 3 ? "三连·终极" : "二连"}×1.3</span>`);
    }
    if (parts.length === 0) return '<span class="preview-none">无连锁（相邻同体系触发）</span>';
    return parts.join(" ");
  },

  _paintKit(root, battle, state) {
    const kit = root.querySelector("[data-duel=kit]");
    if (!kit) return;
    const treasures = [];
    const seen = {};
    for (const s of battle.slots || []) {
      const tid = s && s.treasure;
      if (tid && !seen[tid]) {
        seen[tid] = true;
        const row = BattleEngineV2.getTreasureData ? BattleEngineV2.getTreasureData(tid) : null;
        treasures.push({ id: tid, name: row ? (row.treasure_name || tid) : tid });
      }
    }
    while (treasures.length < 2) treasures.push(null);
    let shen = "神通未成";
    const slots = battle.slots || [];
    let run = 1, runEl = slots[0] && slots[0].spell_type;
    for (let i = 1; i < slots.length; i++) {
      if (slots[i] && slots[i].spell_type === runEl) {
        run++;
        if (run >= 3) {
          const ult = BattleEngineV2.getUltimateConfig && BattleEngineV2.getUltimateConfig();
          const u = ult && ult[runEl];
          shen = (u && u.name) || (this._elementName(runEl) + "系神通");
          break;
        }
      } else {
        run = 1;
        runEl = slots[i] && slots[i].spell_type;
      }
    }
    kit.innerHTML =
      `<div class="duel-kit-row treasures">`
      + treasures.slice(0, 2).map((t) => t
        ? `<span class="duel-kit-slot filled" title="${this._esc(t.name)}">宝·${this._esc((t.name || "").slice(0, 2))}</span>`
        : `<span class="duel-kit-slot empty">宝</span>`).join("")
      + `</div>`
      + `<div class="duel-kit-row shentong"><span class="duel-kit-slot shen${shen === "神通未成" ? " empty" : " filled"}">通·${this._esc(shen)}</span></div>`;
  },

  _onOrbTap(ev, session, root) {
    if (!this._alive(session) || session.battle.speed === 0) return;
    const btn = ev.target.closest(".duel-orb");
    if (!btn) return;
    const idx = parseInt(btn.dataset.idx, 10);
    if (idx !== session.urgeSlot) return;
    session.battle._urgeNext = 1.15;
    session.urgedSlots[idx] = true;
    btn.classList.add("urged");
    this._stamp(root, session, "催");
  },

  _callout(root, el, name, sub, cls) {
    const box = root.querySelector("[data-duel=callout]");
    if (!box) return;
    box.className = "duel-callout " + (cls || "");
    box.innerHTML =
      (el ? `<span class="co-k">${this._esc(el)}</span>` : `<span class="co-k">斗法</span>`)
      + `<span class="co-name">${this._esc(name || "")}</span>`
      + (sub ? `<span class="co-sub">${this._esc(sub)}</span>` : "");
  },

  _launchBolt(root, session, slotIndex, skill) {
    this._flash(root, session, skill && skill.spell_type, false);
  },

  _flash(root, session, element, combo) {
    const layer = root.querySelector("[data-duel=impact]");
    if (!layer) return;
    const flash = document.createElement("div");
    flash.className = "duel-flash element-" + (element || "body") + (combo ? " combo" : "");
    layer.appendChild(flash);
    this._timer(session, () => flash.remove(), 380);
  },

  _stamp(root, session, text) {
    const layer = root.querySelector("[data-duel=impact]");
    if (!layer) return;
    const el = document.createElement("div");
    el.className = "duel-stamp";
    el.textContent = text;
    layer.appendChild(el);
    this._timer(session, () => el.remove(), 700);
  },

  _yaoSilhouette(name) {
    return `<svg class="duel-yao" viewBox="0 0 160 180" aria-hidden="true">`
      + `<ellipse cx="80" cy="168" rx="46" ry="8" fill="rgba(80,20,20,0.45)"/>`
      + `<path d="M80 28 C118 36 132 88 118 128 C108 156 52 156 42 128 C28 88 42 36 80 28 Z" fill="#2a1c18"/>`
      + `<path d="M52 40 L36 8 L60 32 M108 40 L124 8 L100 32" fill="#3a241c"/>`
      + `<circle cx="62" cy="78" r="7" fill="#c62828"/><circle cx="98" cy="78" r="7" fill="#c62828"/>`
      + `<circle cx="62" cy="78" r="3" fill="#ffecb3"/><circle cx="98" cy="78" r="3" fill="#ffecb3"/>`
      + `<path d="M68 108 Q80 122 92 108" stroke="#6d4c41" fill="none" stroke-width="3"/>`
      + `</svg><span class="visually-hidden">${this._esc(name || "")}</span>`;
  },

  // ---------- 资源 / 文案 ----------

  _battleBg(battle, state) {
    if (typeof BACKGROUND_PATHS === "undefined") return "assets/backgrounds/bg_mountain_cave.jpg";
    if (battle.source === "breakthrough") return BACKGROUND_PATHS.fengsheng_far;
    if (battle.source === "boss") return BACKGROUND_PATHS.kulou_edge || BACKGROUND_PATHS.mountain_cave;
    if (battle.source === "array") return BACKGROUND_PATHS.xichi_far || BACKGROUND_PATHS.mountain_cave;
    return BACKGROUND_PATHS.mountain_cave;
  },

  _playerPortrait(state) {
    try {
      if (typeof getCharacterPath === "function") return getCharacterPath(state) || "";
    } catch (e) {}
    return (typeof CHARACTER_PATHS !== "undefined" && CHARACTER_PATHS.human)
      ? CHARACTER_PATHS.human["炼气士"]
      : "";
  },

  _foePortrait(battle) {
    const bossId = battle && battle.payload && battle.payload.bossId;
    if (bossId && typeof BOSS_ICONS !== "undefined" && BOSS_ICONS[bossId]) return BOSS_ICONS[bossId];
    if (typeof BOSS_ICONS !== "undefined" && BOSS_ICONS.boss_001) {
      const src = String(battle.source || "");
      if (src === "encounter" || src === "debug" || src === "normal" || src === "") return BOSS_ICONS.boss_001;
    }
    return "";
  },

  _playerBattleName(state) {
    try {
      if (typeof RealmManager !== "undefined" && RealmManager.getCurrentRealm) {
        const realm = RealmManager.getCurrentRealm(state);
        if (RealmManager.getPhaseRealmName) {
          const rn = RealmManager.getPhaseRealmName(realm);
          if (rn) return String(rn);
        }
        if (realm && realm.major_realm) return String(realm.major_realm);
      }
    } catch (e) {}
    const bm = { thunder: "雷修", fire: "火修", body: "体修", weapon: "器修", soul: "魂修", calamity: "劫修" };
    return bm[String((state && state.benming_school) || "")] || "炼气士";
  },

  _skillIcon(skill) {
    if (!skill) return "";
    const id = skill.id || skill.skill_id;
    if (typeof TREASURE_ICONS !== "undefined" && TREASURE_ICONS[id]) return TREASURE_ICONS[id];
    if (typeof SPELL_ICONS !== "undefined" && SPELL_ICONS[id]) return SPELL_ICONS[id];
    const byEl = {
      thunder: "assets/spells/spell_palm_thunder.png",
      fire: "assets/spells/spell_spirit_fire.png",
      weapon: "assets/spells/spell_artifact_control.png",
      soul: "assets/spells/spell_soul_01.png",
      calamity: "assets/spells/spell_calamity_01.png",
      body: "assets/spells/spell_earth_01.png",
    };
    const el = skill.spell_type;
    if (typeof SPELL_ICONS !== "undefined") {
      const legacy = "spell_" + el + "_01";
      if (SPELL_ICONS[legacy]) return SPELL_ICONS[legacy];
    }
    return byEl[el] || "";
  },

  _esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  _slotId(entry) { return (entry && typeof entry === "object") ? String(entry.id) : String(entry); },
  _slotCond(entry) { return (entry && typeof entry === "object" && entry.condition) ? String(entry.condition) : "always"; },
  _slotTreasure(entry) { return (entry && typeof entry === "object" && entry.treasure) ? String(entry.treasure) : null; },

  _ownedTreasures(state) {
    const out = [];
    const t = state.treasures || {};
    for (const tid of Object.keys(t)) {
      if (Number(t[tid] && t[tid].level) > 0) {
        const row = BattleEngineV2.getTreasureData ? BattleEngineV2.getTreasureData(tid) : null;
        out.push({ id: tid, name: row ? (row.treasure_name || tid) : tid, wuxing: row && row.wuxing ? String(row.wuxing) : null });
      }
    }
    return out;
  },

  _wuxingBadge(wx) {
    if (!wx) return "";
    if (typeof ResonanceSystem !== "undefined" && ResonanceSystem.wuxingLabel) return ResonanceSystem.wuxingLabel(wx);
    const names = { wood: "木", fire: "火", earth: "土", metal: "金", water: "水" };
    return names[wx] || wx;
  },

  _conditionLabel(cond) {
    const c = String(cond || "always");
    if (c === "always" || c === "") return "每轮释放";
    const opt = (BattleEngineV2.conditionOptions ? BattleEngineV2.conditionOptions() : []).find((o) => o.value === c);
    if (opt) return opt.label;
    const [k, a] = c.split(":");
    const zh = { every_n: `每${a}轮`, enemy_hp_below: `敌血<${a}%`, self_hp_below: `己血<${a}%`, enemy_charging: "敌蓄势", round_gte: `第${a}轮起` };
    return zh[k] || c;
  },

  _elementName(el) {
    const names = { body: "体", thunder: "雷", fire: "火", weapon: "器", soul: "魂", calamity: "劫" };
    return names[el] || el;
  },

  _xiuCallout(el) {
    if (typeof BattleEngineV2 !== "undefined" && BattleEngineV2.tixiOf) {
      const t = BattleEngineV2.tixiOf(el);
      if (t === "ti") return "体";
      if (t === "hun") return "魂";
      if (t === "jie") return "劫";
    }
    if (el === "weapon" || el === "fire") return "法术";
    return this._elementName(el);
  },

  _mountXiuCatalog(root, state, slots, unlocked, maxSlots) {
    const pool = unlocked.map((id) => BattleEngineV2.getSkillData(id)).filter(Boolean);
    const pick = (keys) => pool.filter((s) => keys.indexOf(String(s.spell_type)) >= 0);
    this._appendXiuSection(root, "体", "以身证道 · 法术入格（雷并入体）", [
      { title: "法术", skills: pick(["body", "thunder"]) },
      { title: "法术·可入格（不是器）", skills: pick(["weapon", "fire"]), empty: "御器/火意象法术走这里" },
    ], slots, maxSlots);
    this._appendXiuSection(root, "器", "以器证道 · 法宝绑格 · 五行是二级", [
      { title: "二级·五行", treasures: true, empty: "点一格再绑法宝。五行随法宝，不是招式。" },
    ], slots, maxSlots, state);
    this._appendXiuSection(root, "魂", "以神证道 · 法术入格", [
      { title: "法术", skills: pick(["soul"]) },
    ], slots, maxSlots);
    this._appendXiuSection(root, "劫", "以劫证道 · 法术入格", [
      { title: "法术", skills: pick(["calamity"]) },
    ], slots, maxSlots);
  },

  _appendXiuSection(root, name, fantasy, branches, slots, maxSlots, state) {
    const sec = document.createElement("section");
    sec.className = "form-xiu";
    const head = document.createElement("div");
    head.className = "form-xiu-head";
    head.innerHTML = `<b>${this._esc(name)}</b><span>${this._esc(fantasy)}</span>`;
    sec.appendChild(head);
    for (const br of branches) {
      if (br.treasures) {
        this._appendTreasureBranch(sec, br.title, br.empty, slots, state);
        continue;
      }
      this._appendFormBranch(sec, br.title, br.skills || [], slots, maxSlots, br.empty || "");
    }
    root.appendChild(sec);
  },

  _appendTreasureBranch(sec, title, emptyHint, slots, state) {
    const lab = document.createElement("div");
    lab.className = "form-branch-label";
    lab.textContent = title;
    sec.appendChild(lab);
    const owned = this._ownedTreasures(state || (this._formCtx && this._formCtx.state) || {});
    if (!owned.length) {
      const empty = document.createElement("div");
      empty.className = "form-branch-empty";
      empty.textContent = emptyHint || "尚无法宝";
      sec.appendChild(empty);
      return;
    }
    const grid = document.createElement("div");
    grid.className = "form-grid";
    for (const tr of owned) {
      const row = BattleEngineV2.getTreasureData ? BattleEngineV2.getTreasureData(tr.id) : null;
      const wx = tr.wuxing || (row && row.wuxing) || "";
      const item = document.createElement("button");
      item.type = "button";
      item.className = "form-skill cat-treasure";
      const icon = (typeof TREASURE_ICONS !== "undefined" && TREASURE_ICONS[tr.id]) ? TREASURE_ICONS[tr.id] : "";
      item.innerHTML =
        `<span class="form-skill-cat">器</span>`
        + (icon ? `<img alt="" src="${icon}">` : `<span class="form-skill-el">器</span>`)
        + `<span class="form-skill-name">${this._esc(tr.name)}</span>`
        + `<span class="form-skill-dmg">${this._esc(wx ? ("五行·" + this._wuxingBadge(wx)) : "五行未挂")}</span>`;
      item.addEventListener("click", () => {
        const ctx = this._formCtx;
        if (!ctx) return;
        const st = ctx.state;
        const cur = st.battle_slots || [];
        let i = this._selIdx;
        if (i < 0 || !cur[i]) i = cur.findIndex(Boolean);
        if (i < 0) return;
        cur[i] = { id: this._slotId(cur[i]), condition: this._slotCond(cur[i]), treasure: tr.id };
        st.battle_slots = cur;
        SaveManager.save(st);
        this._rerenderConfig();
      });
      grid.appendChild(item);
    }
    sec.appendChild(grid);
  },

  _appendFormBranch(sec, title, skills, slots, maxSlots, lockedHint) {
    const lab = document.createElement("div");
    lab.className = "form-branch-label";
    lab.textContent = title;
    sec.appendChild(lab);
    if (!skills.length) {
      const empty = document.createElement("div");
      empty.className = "form-branch-empty";
      empty.textContent = lockedHint || "此支暂无";
      sec.appendChild(empty);
      return;
    }
    const grid = document.createElement("div");
    grid.className = "form-grid";
    for (const skill of skills) {
      const inSlot = slots.some((e) => this._slotId(e) === skill.id);
      const item = document.createElement("button");
      item.type = "button";
      item.className = `form-skill rarity-${skill.rarity || "common"}${inSlot ? " in-slot" : ""}`;
      const icon = this._skillIcon(skill);
      const cat = skill.category === "treasure" ? "宝" : (skill.skill_class === "神通" ? "通" : "术");
      item.innerHTML =
        `<span class="form-skill-cat">${cat}</span>`
        + (icon ? `<img alt="" src="${icon}">` : `<span class="form-skill-el">${this._esc(this._xiuCallout(skill.spell_type))}</span>`)
        + `<span class="form-skill-name">${this._esc(skill.name)}</span>`
        + `<span class="form-skill-dmg">${this._esc(this._xiuCallout(skill.spell_type))} ${skill.damage_base}+</span>`;
      if (!inSlot && slots.filter(Boolean).length < maxSlots) {
        item.addEventListener("click", () => {
          const ctx = this._formCtx;
          if (!ctx) return;
          const st = ctx.state;
          const cur = st.battle_slots || [];
          cur.push({ id: skill.id, condition: "always" });
          st.battle_slots = cur.filter(Boolean);
          SaveManager.save(st);
          this._selIdx = -1;
          this._rerenderConfig();
        });
      }
      grid.appendChild(item);
    }
    sec.appendChild(grid);
  },

  _categoryName(cat) {
    const names = { spell: "术", treasure: "宝", ability: "通" };
    return names[cat] || cat;
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
      zhangguifang_interrupt: evt.text || "张桂芳呼名落马，术法溃散！",
      aobing_transform: evt.text || "敖丙化现龙形！",
      shiji_parasol: evt.text || "石矶祭起八卦云光帕！",
      shiji_parasol_break: evt.text || "八卦云光帕应声而破！",
      shiji_parasol_swordqi: evt.text || "石矶狂暴，剑气连斩！",
      mo_liqing_sword: evt.text || "魔礼青青云剑出鞘！",
      mo_lihai_strings: evt.text || "魔礼海拨动琵琶！",
      mo_lishou_armor: evt.text || "魔礼寿花狐貂护甲！",
      mo_lishou_armor_break: evt.text || "花狐貂被击退，魔礼寿暴怒！",
      mo_lihong_umbrella: evt.text || "魔礼红撑开混元珍珠伞！",
      huoling_burnstack: evt.text || "火灵金霞冠灼烧！",
      huoling_burnstack_tick: evt.text || "灼烧蔓延！",
      huoling_burnstack_add: evt.text || "灼烧叠加！",
      huoling_burnstack_detonate: evt.text || "灼烧引爆！",
      luoxuan_fivefire: evt.text || "罗宣祭出火系法宝！",
      luoxuan_fivefire_burn_city: evt.text || "五宝齐祭——焚城！",
    };
    return map[evt.mechanic] || evt.text || `机制触发：${evt.mechanic}`;
  },
};
