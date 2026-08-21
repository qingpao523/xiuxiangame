/* 封神修道录 · WorldMap — 封神山河图（四大部洲底本，design/15.0 v0.2）
 * 无美术素材期：CSS/SVG 示意图。 playable 节点读 map_table（数据驱动），
 * 五大部洲色块 + 伐纣推进链 + 跨部洲虚线 + 部洲扩展地标（雾中，未来投放）。
 * 正式美术替换后，色块/坐标由 design/9.2 风格锁资产接管。 */

"use strict";

// 五大部洲底本（坐标归一自 design/设定思考/封神四大部洲融合地理图.html，viewBox 1200×900 → 百分比）
const CONTINENT_META = {
  "北俱芦洲":     { color: "#e6e1f0", text: "#5a4a6a", label: "北俱芦洲 · 北荒妖族", shape: "rect", x: 30.8, y: 5.3, w: 38.3, h: 16.9 },
  "西牛贺洲":     { color: "#f2e6c2", text: "#6a5a2a", label: "西牛贺洲 · 西方教", shape: "rect", x: 4.2, y: 36.7, w: 24.7, h: 27.8 },
  "东胜神洲":     { color: "#d8e9de", text: "#3a5a4a", label: "东胜神洲 · 截教龙族", shape: "rect", x: 71.0, y: 36.7, w: 24.8, h: 27.8 },
  "南赡部洲":     { color: "#efdcbd", text: "#6a4a2a", label: "南赡部洲 · 商周中原（伐纣主舞台）", shape: "rect", x: 25.8, y: 71.1, w: 48.3, h: 22.9 },
  "须弥昆仑中枢": { color: "#31406b", text: "#dfe6ff", label: "须弥 · 昆仑 · 仙佛中枢", shape: "circle", cx: 50, cy: 45, r: 13 },
};

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
    const canvas = this._el("world-map-canvas");
    canvas.innerHTML = "";
    canvas.appendChild(this._buildSvg(state, nodes));
    for (const node of nodes) canvas.appendChild(this._buildNode(state, node));
    const foot = this._el("world-map-foot");
    foot.innerHTML = "";
    const current = this._currentMapRow(state);
    foot.appendChild(this._node("div", "world-map-foot-name", current ? `当前驻留：${current.map_name}（${current.continent || ""}）` : "当前驻留：山野洞府"));
    foot.appendChild(this._node("div", "world-map-foot-tip", "点按已点亮的地点可直接驻留。南赡部洲为伐纣主舞台，余部洲随修行与版本推进逐一显现。"));
  },

  // ---------- SVG：部洲色块 + 推进链 + 装饰 ----------

  _buildSvg(state, nodes) {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.classList.add("world-map-svg");

    // 五大部洲色块（背景层，正式美术替换后删除）
    for (const key of Object.keys(CONTINENT_META)) {
      const c = CONTINENT_META[key];
      let shape;
      if (c.shape === "circle") {
        shape = document.createElementNS(NS, "circle");
        shape.setAttribute("cx", c.cx); shape.setAttribute("cy", c.cy); shape.setAttribute("r", c.r);
      } else {
        shape = document.createElementNS(NS, "rect");
        shape.setAttribute("x", c.x); shape.setAttribute("y", c.y);
        shape.setAttribute("width", c.w); shape.setAttribute("height", c.h);
        shape.setAttribute("rx", 2.5);
      }
      shape.setAttribute("fill", c.color);
      shape.setAttribute("fill-opacity", "0.38");
      shape.setAttribute("stroke", c.color);
      shape.setAttribute("stroke-opacity", "0.9");
      shape.setAttribute("stroke-width", "0.3");
      svg.appendChild(shape);
      // 部洲名标签
      const lx = c.shape === "circle" ? c.cx : c.x + c.w / 2;
      const ly = c.shape === "circle" ? c.cy - c.r + 3 : c.y + 3.5;
      const label = document.createElementNS(NS, "text");
      label.setAttribute("x", lx); label.setAttribute("y", ly);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("font-size", "2.6");
      label.setAttribute("fill", c.text);
      label.setAttribute("fill-opacity", "0.85");
      label.textContent = c.label;
      svg.appendChild(label);
    }

    // 伐纣推进链：按 prev_map 连线；同部洲实线，跨部洲虚线；两端皆达则点亮
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
      line.classList.add("world-map-path");
      if (a.continent !== b.continent) line.classList.add("cross"); // 跨部洲虚线（CSS）
      if (this._nodeReached(state, a) && this._nodeReached(state, b)) line.classList.add("lit");
      svg.appendChild(line);
    }
    return svg;
  },

  // ---------- 节点 ----------

  _buildNode(state, node) {
    const reached = this._nodeReached(state, node);
    const isCurrent = node.mapId && state.current_map_id === node.mapId;
    const el = this._node("button", `world-map-node${reached ? " reached" : " locked"}${isCurrent ? " current" : ""}${node.kind ? ` kind-${node.kind}` : ""}${node.landmark ? " landmark" : ""}`);
    el.type = "button";
    el.style.left = `${node.wx}%`;
    el.style.top = `${node.wy}%`;
    el.title = node.desc;
    let glyph;
    if (!node.landmark && typeof MAP_NODE_ICONS !== "undefined" && MAP_NODE_ICONS[node.id]) {
      glyph = document.createElement("img"); glyph.className = "world-map-node-icon"; glyph.src = MAP_NODE_ICONS[node.id]; glyph.alt = "";
    } else {
      glyph = this._node("span", "world-map-node-glyph", this._glyph(node.kind));
    }
    const label = this._node("span", "world-map-node-label", node.name);
    el.append(glyph, label);
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
