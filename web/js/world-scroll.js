/* 封神修道录 · WorldScroll — 开局卷首演出 + 封神图卷（山河卷轴） */

"use strict";

const PROLOGUE_SCENES = [
  {
    cls: "scene-title",
    bg: "assets/opening/prologue_wake.jpg",
    kicker: "洞府 · 第一息",
    title: "你睁开眼",
    text: "尘在光里走。",
  },
  {
    cls: "scene-seal",
    bg: "assets/opening/prologue_gold.jpg",
    kicker: "天际",
    title: "那一点金光",
    text: "它不解释。你会记住。",
  },
  {
    cls: "scene-world",
    bg: "assets/opening/prologue_breathe.jpg",
    kicker: "洞府 · 吐纳",
    title: "先把这一息稳住",
    text: "跟脚还没落定。",
    enter: true,
  },
];

const WORLD_SPOTS = [
  { name: "山野洞府", reach: () => true },
  { name: "陈塘关", reach: (s) => DataManager.isRealmAtLeast(s.realm_id, "zr_03") },
  { name: "骷髅山", reach: (s) => DataManager.isRealmAtLeast(s.realm_id, "dx_01") },
  { name: "西岐", reach: () => false },
  { name: "封神台", reach: () => false },
];

const GOAL_CHAPTER_META = {
  "前30分钟": {
    chapter: "卷首",
    title: "山野炼气",
    place: "山野洞府",
    subtitle: "榜文初现，山野劫气渐生。先立住脚跟，再谈长生。",
  },
  "第1天": {
    chapter: "卷一",
    title: "陈塘风雷",
    place: "陈塘关外围",
    subtitle: "入真人境，向东南见海。陈塘旧怨与榜文牵引同时逼近。",
  },
  "第2天": {
    chapter: "卷二",
    title: "榜外散修",
    place: "骷髅山边界",
    subtitle: "地仙劫后，榜文未能留名。天下棋局，才刚摆开。",
  },
};

const FUTURE_CHAPTERS = [
  {
    chapter: "卷五",
    title: "天仙篇 · 金仙三花",
    subtitle: "三花聚顶、五气朝元、斩却三尸。封神榜残影挑战将在此开启。",
  },
  {
    chapter: "卷六",
    title: "杀劫篇 · 阐截之争",
    subtitle: "十绝阵后是万仙阵，万仙阵后是封神战场。站队、杀业、天罚，皆在此卷。",
  },
  {
    chapter: "卷七",
    title: "终局篇 · 榜上封神",
    subtitle: "受封天庭、肉身成圣、混元逍遥。三百六十五位正神位，等你落名或拒名。",
  },
];

const PRESSURE_BASE = {
  rq_01: 8, rq_02: 10, rq_03: 12, rq_04: 14, rq_05: 18,
  rq_06: 28, rq_07: 32, rq_08: 38, rq_09: 46, rq_10: 58,
  zr_01: 62, zr_02: 64, zr_03: 66, zr_04: 68, zr_05: 70,
  zr_06: 72, zr_07: 76, zr_08: 80, zr_09: 86, zr_10: 94,
  dx_01: 42,
};

const WorldScroll = {
  prologueTimer: null,
  prologueIndex: 0,
  prologueFinish: null,

  // ---------- 开局卷首演出 ----------

  playPrologue(done) {
    this.stopPrologue();
    this.prologueFinish = typeof done === "function" ? done : function () {};
    this.prologueIndex = 0;
    const layer = this._el("prologue-layer");
    const stage = this._el("prologue-stage");
    stage.innerHTML = PROLOGUE_SCENES.map((scene, i) => {
      const enter = scene.enter
        ? '<button id="prologue-enter" class="hidden">盘膝吐纳</button>'
        : "";
      return `<section class="prologue-scene ${scene.cls}" data-index="${i}">
        <div class="prologue-kicker">${scene.kicker}</div>
        <div class="prologue-title">${scene.title}</div>
        <div class="prologue-text">${scene.text}</div>
        ${enter}
      </section>`;
    }).join("");
    layer.classList.remove("hidden");
    layer.dataset.scene = "0";
    this._setPrologueBg(PROLOGUE_SCENES[0].bg);
    this._showPrologueScene(0);
    layer.onclick = () => {
      if (this.prologueIndex < PROLOGUE_SCENES.length - 1) this._nextPrologueScene();
    };
    const enter = this._el("prologue-enter");
    if (enter) {
      enter.addEventListener("click", (e) => {
        e.stopPropagation();
        this._finishPrologue();
      });
    }
    this._el("prologue-skip").addEventListener("click", (e) => {
      e.stopPropagation();
      this._finishPrologue();
    });
  },

  stopPrologue() {
    if (this.prologueTimer) { clearTimeout(this.prologueTimer); this.prologueTimer = null; }
    const layer = this._el("prologue-layer");
    if (layer) { layer.classList.add("hidden"); layer.onclick = null; }
  },

  _showPrologueScene(index) {
    this.prologueIndex = index;
    const layer = this._el("prologue-layer");
    document.querySelectorAll("#prologue-stage .prologue-scene").forEach((scene, i) => {
      scene.classList.toggle("active", i === index);
      scene.classList.toggle("leaving", i < index);
    });
    layer.dataset.scene = String(index);
    this._setPrologueBg(PROLOGUE_SCENES[index] && PROLOGUE_SCENES[index].bg);
    // SFX-01 开局卷首声音闭环（design/6.0 水滴→金鸣→按住首息）：与 3 幕节奏同步。
    if (typeof AudioManager !== "undefined") {
      if (index === 0) AudioManager.playSfx("water_drop");
      else if (index === 1) AudioManager.playSfx("seal_hum");
    }
    const enter = this._el("prologue-enter");
    if (enter) enter.classList.toggle("hidden", index !== PROLOGUE_SCENES.length - 1);
    const hint = this._el("prologue-hint");
    if (hint) hint.classList.toggle("hidden", index === PROLOGUE_SCENES.length - 1);
    if (this.prologueTimer) clearTimeout(this.prologueTimer);
    const wait = index === 0 ? 3200 : index === PROLOGUE_SCENES.length - 1 ? 5600 : 2800;
    this.prologueTimer = setTimeout(() => {
      this.prologueTimer = null;
      if (index < PROLOGUE_SCENES.length - 1) this._nextPrologueScene();
      else this._finishPrologue();
    }, wait);
  },

  _setPrologueBg(src) {
    const layer = this._el("prologue-layer");
    if (!layer || !src) return;
    layer.style.setProperty("--pro-bg", "url(\"" + src + "\")");
    layer.classList.remove("pro-ken");
    void layer.offsetWidth;
    layer.classList.add("pro-ken");
  },

  _nextPrologueScene() {
    if (this.prologueIndex < PROLOGUE_SCENES.length - 1) this._showPrologueScene(this.prologueIndex + 1);
  },

  _finishPrologue() {
    if (!this.prologueFinish) return;
    if (this.prologueTimer) { clearTimeout(this.prologueTimer); this.prologueTimer = null; }
    this.stopPrologue();
    if (typeof Game.markPrologueSeen === "function") Game.markPrologueSeen();
    const finish = this.prologueFinish;
    this.prologueFinish = null;
    finish();
  },

  getChapterReveal(stage) {
    return GOAL_CHAPTER_META[stage] || null;
  },

  // ---------- 榜文感应（表现层） ----------

  getSealPressure(state) {
    const realmId = str(state.realm_id, "rq_01");
    let value = num(PRESSURE_BASE[realmId], 12);
    const calamity = num(state.resources.calamity);
    const merit = num(state.resources.merit);
    value += clamp(calamity / 150, 0, 16);
    value -= clamp(merit / 200, 0, 10);
    value = clamp(Math.round(value), 0, 100);
    let label = "榜文未显";
    if (realmId === "dx_01" && value < 55) label = "榜外留白";
    else if (value >= 90) label = "真灵受牵";
    else if (value >= 75) label = "榜文牵引";
    else if (value >= 55) label = "榜文微照";
    else if (value >= 25) label = "碎光初照";
    else if (value >= 12) label = "榜文渐近";
    let tip = "榜文未显，山中尚可修行。";
    if (value >= 90) tip = "封神榜已开始搜寻你的真灵。破劫之前，务必积功德、养法宝。";
    else if (value >= 75) tip = "榜文垂光，真灵受牵。你越强，它越近。";
    else if (value >= 55) tip = "封神榜第一次真正感应到你的存在。";
    else if (value >= 25) tip = "榜文碎光初照，大劫已经开场。";
    else if (realmId === "dx_01") tip = "你已暂时挣脱榜文牵引。榜上无名，不等于榜外无事。";
    const mods = [];
    if (calamity >= 100) mods.push("劫气助涨");
    if (merit >= 100) mods.push("功德护持");
    if (mods.length) tip += `（${mods.join("、")}）`;
    return { value, label, tip };
  },

  // ---------- 封神图卷 ----------

  open() {
    this.render(Game.state);
    this._el("world-scroll-layer").classList.remove("hidden");
  },

  close() {
    this._el("world-scroll-layer").classList.add("hidden");
  },

  render(state) {
    if (!state || !state.realm_id) return;
    const pressure = this.getSealPressure(state);
    this._el("world-scroll-title").textContent = "封神图卷";
    this._el("world-scroll-sub").textContent = `${getPhaseRealmName(RealmManager.getCurrentRealm(state))} · ${pressure.label} · 已展开 ${int(state.completed_goals.length)} / ${DataManager.getRows("chapter_goal_table").length} 节`;
    const body = this._el("world-scroll-body");
    body.innerHTML = "";
    this._renderHorizon(body, state);
    this._renderGoalChapters(body, state);
    this._renderSystemChapters(body, state);
    const foot = this._el("world-scroll-foot");
    foot.innerHTML = "";
    foot.appendChild(this._node("span", "scroll-foot-label", `榜文感应：${pressure.label}`));
    foot.appendChild(this._node("span", "scroll-foot-tip", pressure.tip));
  },

  _renderHorizon(body, state) {
    const strip = this._node("div", "scroll-horizon");
    strip.appendChild(this._node("div", "scroll-horizon-caption", "山河一瞥 · 未至之地皆在雾中"));
    const row = this._node("div", "scroll-horizon-row");
    for (const spot of WORLD_SPOTS) {
      const reached = !!spot.reach(state);
      row.appendChild(this._node("div", `scroll-horizon-spot${reached ? " reached" : " fogged"}`, spot.name));
    }
    strip.appendChild(row);
    body.appendChild(strip);
  },

  _renderGoalChapters(body, state) {
    const rows = DataManager.getRows("chapter_goal_table").slice().sort((a, b) => {
      return int(String(a.goal_id).slice(5)) - int(String(b.goal_id).slice(5));
    });
    const groups = [];
    for (const goal of rows) {
      const stage = String(goal.stage || "前30分钟");
      const prev = groups[groups.length - 1];
      if (!prev || prev.stage !== stage) {
        const meta = GOAL_CHAPTER_META[stage] || { chapter: "卷", title: stage, place: "", subtitle: "" };
        groups.push({ stage, meta, goals: [] });
      }
      groups[groups.length - 1].goals.push(goal);
    }
    groups.forEach((group, groupIndex) => {
      const doneCount = group.goals.filter((g) => state.completed_goals.includes(String(g.goal_id))).length;
      const hasCurrent = group.goals.some((g) => String(g.goal_id) === String(state.current_goal_id));
      let status = "future";
      if (hasCurrent) status = "current";
      else if (doneCount >= group.goals.length) status = "done";
      else if (groupIndex === 0) status = "current";
      this._renderChapter(body, group.meta, status, doneCount, group.goals.length, (content) => {
        if (status === "future") {
          content.appendChild(this._node("div", "scroll-locked-card", `此卷尚未揭开。\n继续前行，${group.meta.title}自会显化。`));
          return;
        }
        for (const goal of group.goals) {
          const goalId = String(goal.goal_id);
          const isDone = state.completed_goals.includes(goalId);
          const isCurrent = goalId === String(state.current_goal_id);
          const node = this._node("div", `scroll-node${isDone ? " done" : ""}${isCurrent ? " current" : ""}${!isDone && !isCurrent ? " future" : ""}`);
          const marker = this._node("div", "scroll-node-marker");
          const info = this._node("div", "scroll-node-info");
          info.appendChild(this._node("div", "scroll-node-tag", isDone ? "已过" : isCurrent ? "当前" : "未至"));
          info.appendChild(this._node("div", "scroll-node-name", goal.goal_name || goalId));
          const desc = isDone ? String(goal.complete_text || "此节已过。")
            : isCurrent ? String(goal.reward_preview || "正在此节。")
            : String(goal.reward_preview || "此节尚未揭开。");
          info.appendChild(this._node("div", "scroll-node-desc", desc));
          node.appendChild(marker);
          node.appendChild(info);
          content.appendChild(node);
        }
      });
    });
  },

  _renderSystemChapters(body, state) {
    const arraysUnlocked = DataManager.isRealmAtLeast(state.realm_id, "zr_01");
    const arrayMeta = { chapter: "卷三", title: "杀劫大阵", place: "十绝阵 · 九曲黄河 · 诛仙 · 万仙", subtitle: "闻仲布十绝，三霄摆黄河，通天立诛仙。每周轮转，败者亦有一缕真灵上榜。" };
    if (arraysUnlocked) {
      const arrays = DataManager.getRows("array_table");
      const today = getTodayArray();
      this._renderChapter(body, arrayMeta, "current", 0, arrays.length, (content) => {
        for (const arr of arrays) {
          const id = String(arr.array_id || "");
          const wins = int(state.array_wins[id]);
          const isDone = wins > 0;
          const isToday = String(today.array_id) === id;
          const node = this._node("div", `scroll-node${isDone ? " done" : ""}${isToday && !isDone ? " current" : ""}${!isDone && !isToday ? " future" : ""}`);
          const marker = this._node("div", "scroll-node-marker");
          const info = this._node("div", "scroll-node-info");
          info.appendChild(this._node("div", "scroll-node-tag", isDone ? `已破 ${wins} 次` : isToday ? "今日当值" : "轮转中"));
          info.appendChild(this._node("div", "scroll-node-name", arr.array_name || id));
          info.appendChild(this._node("div", "scroll-node-desc", String(arr.intro || "")));
          node.appendChild(marker);
          node.appendChild(info);
          content.appendChild(node);
        }
      });
    } else {
      this._renderChapter(body, arrayMeta, "future", 0, 0, (content) => {
        content.appendChild(this._node("div", "scroll-locked-card", "此卷尚未揭开。\n破真人劫后，每逢轮转之日，大阵残影便会显化。"));
      });
    }

    const companions = DataManager.getRows("companion_table");
    const companionActive = companions.some((row) => {
      const c = state.companions[String(row.companion_id)];
      return !!c || UnlockManager.conditionMet(state, String(row.unlock_realm || ""));
    });
    const companionMeta = { chapter: "卷四", title: "封神人物因缘", place: "哪吒 · 杨戬 · 姜子牙", subtitle: "大劫中的名字会先遇见你。结缘者，其法与气运皆入你牌库。" };
    if (companionActive) {
      this._renderChapter(body, companionMeta, "current", 0, companions.length, (content) => {
        for (const row of companions) {
          const id = String(row.companion_id || "");
          const c = state.companions[id] || { stage: 0, bonded: false };
          const isDone = !!c.bonded;
          const isCurrent = !isDone && UnlockManager.conditionMet(state, String(row.unlock_realm || ""));
          const node = this._node("div", `scroll-node${isDone ? " done" : ""}${isCurrent ? " current" : ""}${!isDone && !isCurrent ? " future" : ""}`);
          const marker = this._node("div", "scroll-node-marker");
          const info = this._node("div", "scroll-node-info");
          info.appendChild(this._node("div", "scroll-node-tag", isDone ? "已结缘" : isCurrent ? "因缘已起" : "尚未相遇"));
          info.appendChild(this._node("div", "scroll-node-name", `${row.name}｜${row.title || ""}`));
          info.appendChild(this._node("div", "scroll-node-desc", isDone ? String(row.bond_text || "") : String(row.stages?.[0]?.text || "机缘未至。")));
          node.appendChild(marker);
          node.appendChild(info);
          content.appendChild(node);
        }
      });
    } else {
      this._renderChapter(body, companionMeta, "future", 0, 0, (content) => {
        content.appendChild(this._node("div", "scroll-locked-card", "此卷尚未揭开。\n待你入真人境，陈塘关外会有人叫住你。"));
      });
    }

    const fateActive = DataManager.isRealmAtLeast(state.realm_id, "dx_01") || !!str(state.faction_id, "") || int(state.rebirth?.count) > 0;
    const fateMeta = { chapter: "卷五", title: "入局与轮回", place: "阐教 · 截教 · 天庭 · 五庄观", subtitle: "立身天仙后，四方势力等你落子；此生修到尽头，亦可应劫转世，凝道痕再开新卷。" };
    if (fateActive) {
      const nodes = [
        {
          name: "择势力入局",
          desc: str(state.faction_id, "") ? `${getFactionRow(state).faction_name}（${getFactionRow(state).dojo}）` : "你已至天仙·初期，尚未落子。",
          done: !!str(state.faction_id, ""),
        },
        {
          name: "真灵上榜",
          desc: state.god_seats?.length ? `已得 ${state.god_seats.length} / 6 神位护持` : "斗法败北时，榜文会照走一缕真灵，化作神位。",
          done: int(state.god_seats?.length) >= 6,
        },
        {
          name: "应劫转世",
          desc: int(state.rebirth?.count) > 0 ? `已历 ${state.rebirth.count} 世，宿慧 ${Math.round(int(state.rebirth.daohen) * 3 + (state.rebirth.races_seen || []).length)}%` : "修至当前封顶，可转世重修，凝道痕为永久收益。",
          done: int(state.rebirth?.count) > 0,
        },
      ];
      this._renderChapter(body, fateMeta, "current", 0, nodes.length, (content) => {
        for (const item of nodes) {
          const node = this._node("div", `scroll-node${item.done ? " done" : " current"}`);
          const marker = this._node("div", "scroll-node-marker");
          const info = this._node("div", "scroll-node-info");
          info.appendChild(this._node("div", "scroll-node-tag", item.done ? "已定" : "可择"));
          info.appendChild(this._node("div", "scroll-node-name", item.name));
          info.appendChild(this._node("div", "scroll-node-desc", item.desc));
          node.appendChild(marker);
          node.appendChild(info);
          content.appendChild(node);
        }
      });
    } else {
      this._renderChapter(body, fateMeta, "future", 0, 0, (content) => {
        content.appendChild(this._node("div", "scroll-locked-card", "此卷尚未揭开。\n天仙之后，才有资格谈落子与转世。"));
      });
    }

    for (const future of FUTURE_CHAPTERS) {
      this._renderChapter(body, future, "future", 0, 0, (content) => {
        content.appendChild(this._node("div", "scroll-locked-card", `${future.subtitle}`));
      });
    }
  },

  _renderChapter(body, meta, status, doneCount, total, build) {
    const section = this._node("section", `scroll-chapter ${status}`);
    const head = this._node("header", "scroll-chapter-head");
    head.appendChild(this._node("div", "scroll-chapter-line", `${meta.chapter} · ${meta.title}`));
    head.appendChild(this._node("div", "scroll-chapter-place", meta.place || ""));
    head.appendChild(this._node("div", "scroll-chapter-sub", meta.subtitle || ""));
    if (total > 0) head.appendChild(this._node("div", "scroll-chapter-progress", `${doneCount} / ${total}`));
    const content = this._node("div", "scroll-chapter-body");
    build(content);
    section.appendChild(head);
    section.appendChild(content);
    body.appendChild(section);
  },

  _node(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  },

  _el(id) {
    return document.getElementById(id);
  },
};
