/* 封神山河图 · WorldMap（design/15.0 F1~F3 + design/15.1 渐进解锁体验）
 * 层 = 境界：部洲底图随境界逐层揭开（封神榜封印 fog → 碎裂 reveal → 全彩）。
 * 节点 5 态：sealed/locked/available/current/completed（15.1 §1.2）。
 * 美术：design/9.2 风格锁 v2 素材（assets/map/），缺失自动回退色块+glyph。 */

"use strict";

// 五大部洲底本（坐标归一自 design/设定思考/封神四大部洲融合地理图.html，viewBox 1200×900 → 百分比）
// reveal_realm：部洲解封境界（15.1 §1.1 层级模型，对齐 map_table 节点解锁节奏）
const CONTINENT_META = {
  "北俱芦洲":     { color: "#e6e1f0", text: "#5a4a6a", label: "北俱芦洲", shape: "rect", x: 30.8, y: 5.3, w: 38.3, h: 16.9, reveal_realm: "ty_01", img: "assets/map/continents/continent_beiju.png" },
  "西牛贺洲":     { color: "#f2e6c2", text: "#6a5a2a", label: "西牛贺洲", shape: "rect", x: 4.2, y: 36.7, w: 24.7, h: 27.8, reveal_realm: "ty_01", img: "assets/map/continents/continent_xiniu.png" },
  "东胜神洲":     { color: "#d8e9de", text: "#3a5a4a", label: "东胜神洲", shape: "rect", x: 71.0, y: 36.7, w: 24.8, h: 27.8, reveal_realm: "jx_01", img: "assets/map/continents/continent_dongsheng.png" },
  "南赡部洲":     { color: "#efdcbd", text: "#6a4a2a", label: "南赡部洲", shape: "rect", x: 25.8, y: 71.1, w: 48.3, h: 22.9, reveal_realm: "rq_01", img: "assets/map/continents/continent_nanshan.png" },
  "须弥昆仑中枢": { color: "#31406b", text: "#dfe6ff", label: "须弥 · 昆仑", shape: "circle", cx: 50, cy: 45, r: 13, reveal_realm: "ty_01", img: "assets/map/continents/continent_xumishan.png" },
};

const FOG_SEAL_IMG = "assets/map/fog/fog_seal_pattern.png";
const CLOUD_BASE_IMG = "assets/map/cloud_sea_base.png";
const PLAYER_MARKER_IMG = "assets/map/path/marker_player.png";

// 部洲扩展地标（雾中节点：未来批次可升格为可玩图，当前仅叙事/世界观纵深）
const FLAVOR_LANDMARKS = [
  { id: "lm_chaoge",   name: "朝歌",     continent: "南赡部洲", kind: "city",  wx: 70.8, wy: 84.0, desc: "大商王都，兵煞与劫气交汇。伐纣的终点，杀劫最重的舞台之一。" },
  { id: "lm_qingqiu",  name: "青丘之山", continent: "南赡部洲", kind: "ruin",  wx: 78.3, wy: 81.1, desc: "九尾狐氏的故地。妲己的因果，从这里被卷进封神榜。" },
  { id: "lm_muye",     name: "牧野",     continent: "南赡部洲", kind: "wild",  wx: 55.0, wy: 91.8, desc: "牧野之战的古战场。血流漂杵的传说，尚在土里发烫。" },
  { id: "lm_yuxu",     name: "玉虚宫",   continent: "须弥昆仑中枢", kind: "sect", wx: 39.2, wy: 40.0, desc: "昆仑山玉虚宫，阐教道场。元始天尊座下十二金仙，尚在山中等一场封神杀劫。" },
  { id: "lm_lingshan", name: "西天灵山", continent: "西牛贺洲", kind: "sect",  wx: 16.5, wy: 48.9, desc: "接引、准提二位道人之道场，西方教所在。封神之后，此处渐成西天灵山。" },
  { id: "lm_yinglong", name: "东海·应龙", continent: "东胜神洲", kind: "island", wx: 83.4, wy: 57.3, desc: "东海深处，应龙潜渊。龙族与截教往来密切，敖丙的因果也系于此。" },
  { id: "lm_huaguo",   name: "傲来国·花果山", continent: "东胜神洲", kind: "island", wx: 90.7, wy: 62.2, desc: "东海傲来国海外之山（后世《西游记》参照）。此版本仅作世界观远景。" },
  { id: "lm_zhulong",  name: "章尾山·烛龙", continent: "北俱芦洲", kind: "ruin",  wx: 37.7, wy: 17.3, desc: "钟山之神烛龙（烛阴）所居，视为昼、瞑为夜。北荒妖族最古的图腾之一。" },
  { id: "lm_jingwei",  name: "发鸠山·精卫", continent: "北俱芦洲", kind: "ruin",  wx: 64.0, wy: 12.4, desc: "炎帝少女溺于东海，化为精卫，衔木石以填海。北荒不屈之志。" },
  { id: "lm_yaozu",    name: "北荒妖族", continent: "北俱芦洲", kind: "wild",  wx: 49.3, wy: 14.2, desc: "女娲娘娘招妖幡所指，北荒万妖聚居。封神大劫中，妖族是搅动风云的暗流。" },
  { id: "lm_cave",     name: "山野洞府", continent: "南赡部洲", kind: "home",  wx: 40.0, wy: 88.0, reach: true, desc: "你的洞府。一炉一榻，一扇朝东的窗，正对着天边那页金榜。" },
];

const WorldMap = {
  closeCallback: null,

  // ---------- 节点构建（数据驱动） ----------

  _playableNodes(state) {
    return DataManager.getRows("map_table").map((row) => ({
      id: String(row.map_id),
      name: String(row.map_name),
      continent: String(row.continent || "南赡部洲"),
      kind: String(row.icon_kind || "wild"),
      wx: num(row.wx, 50),
      wy: num(row.wy, 50),
      mapId: String(row.map_id),
      realm: String(row.unlock_realm || ""),
      bossId: String(row.boss_id || ""),
      landmark: false,
      desc: String(row.narrative_desc || row.entry_text || ""),
    }));
  },

  _landmarkNodes() {
    return FLAVOR_LANDMARKS.map((lm) => ({
      id: lm.id,
      name: lm.name,
      continent: lm.continent,
      kind: lm.kind,
      wx: lm.wx,
      wy: lm.wy,
      mapId: null,
      landmark: true,
      alwaysReach: !!lm.reach,
      desc: lm.desc,
    }));
  },

  _allNodes(state) {
    return this._playableNodes(state).concat(this._landmarkNodes());
  },

  // ---------- 可达性（F3：境界主锁 + 前置节点弱锁，见 UnlockManager.getAvailableMaps） ----------

  isReachable(state, node) {
    return this._nodeReached(state, node);
  },

  _nodeReached(state, node) {
    if (!node) return false;
    if (node.landmark) return !!node.alwaysReach; // 雾中地标：默认不可达（洞府例外）
    return UnlockManager.getAvailableMaps(state).some((m) => String(m.map_id) === node.mapId);
  },

  // ---------- 5 态状态机（15.1 §1.2：sealed/locked/available/current/completed） ----------

  _continentRevealed(state, name) {
    const meta = CONTINENT_META[name];
    if (!meta) return true;
    return UnlockManager.conditionMet(state, meta.reveal_realm);
  },

  _nodeState(state, node) {
    if (node.landmark) {
      if (node.alwaysReach) return "available";
      return this._continentRevealed(state, node.continent) ? "fog" : "sealed";
    }
    if (node.bossId && int(state.boss_clears[node.bossId]) > 0) return "completed";
    if (node.mapId && state.current_map_id === node.mapId) return "current";
    if (this._nodeReached(state, node)) return "available";
    // 部洲未解封 = 封印；部洲已开但前置未通 = 未达
    return this._continentRevealed(state, node.continent) ? "locked" : "sealed";
  },

  // ---------- 生命周期 ----------

  open(onClose) {
    this.closeCallback = typeof onClose === "function" ? onClose : null;
    this.render(Game.state);
    this._el("world-map-layer").classList.remove("hidden");
  },

  close() {
    this._el("world-map-layer").classList.add("hidden");
    const cb = this.closeCallback;
    this.closeCallback = null;
    if (cb) cb();
  },

  render(state) {
    if (!state || !state.realm_id) return;
    this._el("world-map-title").textContent = "封神山河图 · 四大部洲";
    const pressure = WorldScroll.getSealPressure(state);
    this._el("world-map-sub").textContent = `${getPhaseRealmName(RealmManager.getCurrentRealm(state))} · ${pressure.label} · 榜文在上，山河在下`;
    const nodes = this._allNodes(state);
    const snapshot = this._takeSnapshot(state, nodes);
    const canvas = this._el("world-map-canvas");
    canvas.innerHTML = "";
    canvas.appendChild(this._buildContinents(state, snapshot));
    canvas.appendChild(this._buildSvg(state, nodes));
    for (const node of nodes) canvas.appendChild(this._buildNode(state, node, snapshot));
    canvas.appendChild(this._buildMarker(state, nodes));
    this._playReveal(state, snapshot);
    const foot = this._el("world-map-foot");
    foot.innerHTML = "";
    const current = this._currentMapRow(state);
    foot.appendChild(this._node("div", "world-map-foot-name", current ? `当前驻留：${current.map_name}（${current.continent || ""}）` : "当前驻留：山野洞府"));
    foot.appendChild(this._node("div", "world-map-foot-tip", "点按已点亮的地点可直接驻留。南赡部洲为伐纣主舞台，余部洲随修行与版本推进逐一显现。"));
  },

  // ---------- 渐进解锁：快照对比 + reveal 演出（15.1 §1.4） ----------

  _takeSnapshot(state, nodes) {
    if (!state.flags || typeof state.flags !== "object") state.flags = {};
    const prev = state.flags.world_map_snapshot || null;
    const cur = {
      continents: Object.keys(CONTINENT_META).filter((c) => this._continentRevealed(state, c)),
      nodes: nodes.filter((n) => !n.landmark && this._nodeReached(state, n)).map((n) => n.id),
    };
    const isFirst = !prev;
    const prevC = new Set((prev && prev.continents) || []);
    const prevN = new Set((prev && prev.nodes) || []);
    state.flags.world_map_snapshot = cur;
    return {
      first: isFirst,
      newContinents: cur.continents.filter((c) => !prevC.has(c)),
      newNodes: cur.nodes.filter((n) => !prevN.has(n)),
    };
  },

  _playReveal(state, snapshot) {
    if (snapshot.first) return; // 首次铺开地图不播解封演出
    const names = snapshot.newContinents.map((c) => (CONTINENT_META[c] || {}).label || c);
    const nodeNames = snapshot.newNodes
      .filter((id) => this._continentRevealed(state, (DataManager.getById("map_table", id) || {}).continent || "南赡部洲"))
      .filter((id) => !snapshot.newContinents.includes(String((DataManager.getById("map_table", id) || {}).continent || "")))
      .map((id) => { const r = DataManager.getById("map_table", id); return r ? String(r.map_name) : ""; })
      .filter(Boolean);
    const lines = names.concat(nodeNames);
    if (!lines.length) return;
    if (typeof AudioManager !== "undefined" && AudioManager.playSfx) AudioManager.playSfx("secret_found");
    lines.forEach((name, i) => {
      setTimeout(() => {
        const panel = document.getElementById("world-map-panel");
        if (!panel || this._el("world-map-layer").classList.contains("hidden")) return;
        const banner = this._node("div", "world-map-reveal-banner", `${name} · 解封`);
        panel.appendChild(banner);
        setTimeout(() => banner.remove(), 2600);
      }, 450 * i);
    });
  },

  // ---------- 部洲层：底图 + 封印 fog（15.1 §3.1） ----------

  _buildContinents(state, snapshot) {
    const wrap = this._node("div", "world-map-continents");
    for (const key of Object.keys(CONTINENT_META)) {
      const c = CONTINENT_META[key];
      const box = this._node("div", "world-map-continent");
      const rect = c.shape === "circle"
        ? { x: c.cx - c.r, y: c.cy - c.r, w: c.r * 2, h: c.r * 2 }
        : { x: c.x, y: c.y, w: c.w, h: c.h };
      box.style.left = `${rect.x}%`;
      box.style.top = `${rect.y}%`;
      box.style.width = `${rect.w}%`;
      box.style.height = `${rect.h}%`;
      if (c.shape === "circle") box.classList.add("is-circle");
      box.style.background = `${c.color}40`; // 回退色块（25% 透明部洲色，15.1 §3.3）
      const revealed = this._continentRevealed(state, key);
      const justRevealed = !snapshot.first && snapshot.newContinents.includes(key);
      const img = document.createElement("img");
      img.className = "world-map-continent-img";
      img.src = c.img;
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      img.onerror = () => { img.remove(); box.classList.add("no-art"); }; // 回退：色块
      box.appendChild(img);
      if (!revealed) {
        box.classList.add("sealed");
        const fog = this._node("div", "world-map-fog");
        const fogImg = document.createElement("img");
        fogImg.src = FOG_SEAL_IMG;
        fogImg.alt = "";
        fogImg.onerror = () => fogImg.remove();
        fog.appendChild(fogImg);
        box.appendChild(fog);
      } else if (justRevealed) {
        // 解封演出：封印碎裂揭开 + 区域上色（15.1 §1.4）
        box.classList.add("revealing");
        const fog = this._node("div", "world-map-fog shatter");
        const fogImg = document.createElement("img");
        fogImg.src = FOG_SEAL_IMG;
        fogImg.alt = "";
        fogImg.onerror = () => fogImg.remove();
        fog.appendChild(fogImg);
        box.appendChild(fog);
        setTimeout(() => { box.classList.remove("revealing"); fog.remove(); }, 2100);
      }
      const name = this._node("div", `world-map-continent-name${revealed ? "" : " sealed"}`, c.label);
      box.appendChild(name);
      wrap.appendChild(box);
    }
    return wrap;
  },

  // ---------- SVG：伐纣古道（旅程路径，15.1 §1.5） ----------

  _buildSvg(state, nodes) {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.classList.add("world-map-svg");

    // 伐纣推进链：已通=实体古道（暖金流光），可进方向=虚线延伸，未通=雾中若隐若现
    const byId = {};
    for (const n of nodes) byId[n.id] = n;
    for (const row of DataManager.getRows("map_table")) {
      const prev = String(row.prev_map || "");
      if (!prev) continue;
      const a = byId[prev]; const b = byId[String(row.map_id)];
      if (!a || !b) continue;
      const line = document.createElementNS(NS, "line");
      line.setAttribute("x1", a.wx); line.setAttribute("y1", a.wy);
      line.setAttribute("x2", b.wx); line.setAttribute("y2", b.wy);
      line.setAttribute("vector-effect", "non-scaling-stroke");
      line.classList.add("world-map-path");
      const aDone = this._nodeState(state, a) === "completed";
      const bDone = this._nodeState(state, b) === "completed";
      const aLive = ["completed", "current", "available"].includes(this._nodeState(state, a));
      const bLive = ["completed", "current", "available"].includes(this._nodeState(state, b));
      if (a.continent !== b.continent) line.classList.add("cross"); // 跨部洲虚线（CSS）
      if (aDone && bDone) line.classList.add("lit");        // 已通段：实体古道
      else if (aLive && bLive) line.classList.add("active"); // 行进方向：流光虚线
      svg.appendChild(line);
    }
    return svg;
  },

  // ---------- 行进标记：主角乘云小像，定位在当前节点（15.1 §1.5/§2.5） ----------

  _buildMarker(state, nodes) {
    const marker = this._node("div", "world-map-player-marker");
    const cur = nodes.find((n) => !n.landmark && n.mapId === state.current_map_id);
    const anchor = cur || nodes.find((n) => n.id === "lm_cave");
    if (!anchor) { marker.classList.add("hidden"); return marker; }
    marker.style.left = `${anchor.wx}%`;
    marker.style.top = `${anchor.wy}%`;
    const img = document.createElement("img");
    img.src = PLAYER_MARKER_IMG;
    img.alt = "";
    img.onerror = () => { marker.remove(); };
    marker.appendChild(img);
    return marker;
  },

  // ---------- 节点（图标 + 5 态视觉） ----------

  _buildNode(state, node, snapshot) {
    const nState = this._nodeState(state, node);
    const reached = this._nodeReached(state, node);
    const el = this._node("button", `world-map-node state-${nState}${node.kind ? ` kind-${node.kind}` : ""}${node.landmark ? " landmark" : ""}`);
    el.type = "button";
    el.style.left = `${node.wx}%`;
    el.style.top = `${node.wy}%`;
    el.title = node.desc;
    const justUnlocked = !snapshot.first && !node.landmark && snapshot.newNodes.includes(node.id);
    if (justUnlocked) el.classList.add("just-unlocked");

    const iconSrc = node.landmark
      ? (typeof LANDMARK_ICONS !== "undefined" ? LANDMARK_ICONS[node.id] : null)
      : (typeof MAP_NODE_ICONS !== "undefined" ? MAP_NODE_ICONS[node.id] : null);
    let glyph;
    if (iconSrc) {
      glyph = document.createElement("img");
      glyph.className = "world-map-node-icon";
      glyph.src = iconSrc;
      glyph.alt = "";
      glyph.loading = "lazy";
      glyph.decoding = "async";
      glyph.onerror = () => { // 回退：文字 glyph（15.1 §3.3 占位兼容）
        const span = this._node("span", "world-map-node-glyph", this._glyph(node.kind));
        glyph.replaceWith(span);
      };
    } else {
      glyph = this._node("span", "world-map-node-glyph", this._glyph(node.kind));
    }
    el.appendChild(glyph);

    // completed：功德暖金 ✓ 圈（9.2 §2.3 符号色）
    if (nState === "completed") el.appendChild(this._node("span", "world-map-node-done", "✓"));
    // sealed：锁形（CSS 绘制，非文字）
    if (nState === "sealed") el.appendChild(this._node("span", "world-map-node-lock"));

    const label = this._node("span", "world-map-node-label", node.name);
    el.appendChild(label);
    el.addEventListener("click", () => this._onNodeClick(state, node));
    return el;
  },

  _glyph(kind) {
    return { seal: "榜", city: "城", sect: "宫", island: "岛", pass: "关", ruin: "山", wild: "野", home: "府", array: "阵" }[kind] || "地";
  },

  _onNodeClick(state, node) {
    if (node.mapId && this._nodeReached(state, node)) {
      Game.selectMap(node.mapId);
      Game.toast("山河图 · 移居", `你沿山道而行，驻留于${node.name}。`);
      this.render(Game.state);
      return;
    }
    Game.toast(node.name, node.desc || "此地尚在雾中。");
  },

  _currentMapRow(state) {
    return DataManager.getById("map_table", state.current_map_id);
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
