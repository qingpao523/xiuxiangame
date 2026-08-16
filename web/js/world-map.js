/* 封神修道录 · WorldMap — 封神山河图（无美术素材期的 CSS/SVG 示意图） */

"use strict";

const WORLD_MAP_NODES = [
  { id: "fengshen_tai", name: "封神台", x: 50, y: 8, kind: "seal", reach: () => false, desc: "金榜悬于此处。当前版本尚未开放，但大劫中所有人都会朝它走。" },
  { id: "chaoge", name: "朝歌", x: 68, y: 20, kind: "city", reach: () => false, desc: "大商王都，兵煞与劫气交汇之地。天仙篇开启后，这里将是杀劫最重的舞台之一。" },
  { id: "yuxu", name: "玉虚宫", x: 9, y: 15, kind: "sect", reach: () => false, desc: "昆仑山玉虚宫，阐教道场。元始天尊座下十二金仙，尚在山中等一场封神杀劫。" },
  { id: "xiqi", name: "西岐", x: 17, y: 33, kind: "city", reach: () => false, desc: "西伯侯之地，未来封神大战的西线。现在与你之间隔着整片尚未开放的中原。" },
  { id: "jin_ao", name: "金鳌岛", x: 92, y: 31, kind: "island", reach: () => false, desc: "东海金鳌岛，截教碧游宫所在。万仙来朝之处，海雾中已能听见钟声。" },
  { id: "chentang", name: "陈塘关", x: 82, y: 48, kind: "pass", mapId: "map_002", realm: "zr_03", desc: "东海之滨的陈塘关。哪吒尚未闹海，但巡海妖兵已开始上岸。真人三重可至。" },
  { id: "kulou", name: "骷髅山", x: 25, y: 58, kind: "ruin", mapId: "map_003", realm: "dx_01", desc: "骷髅山白骨洞边界，石矶旧地。阴火不熄，地仙一重才敢靠近。" },
  { id: "wild", name: "山野妖患", x: 39, y: 74, kind: "wild", mapId: "map_001", realm: "rq_03", desc: "你所在的山野。受劫气驱使的小妖在黑雾中游荡，是最初的修行地。" },
  { id: "cave", name: "山野洞府", x: 56, y: 84, kind: "home", current: true, desc: "你的洞府。一炉一榻，一扇朝东的窗，正对着天边那页金榜。" },
];

const WORLD_MAP_PATHS = [
  ["cave", "wild"],
  ["wild", "chentang"],
  ["chentang", "jin_ao"],
  ["chentang", "chaoge"],
  ["chaoge", "fengshen_tai"],
  ["chaoge", "xiqi"],
  ["xiqi", "yuxu"],
  ["wild", "kulou"],
  ["kulou", "xiqi"],
];

const WorldMap = {
  closeCallback: null,

  isReachable(state, node) {
    if (node.current) return true;
    if (node.realm && DataManager.isRealmAtLeast(state.realm_id, node.realm)) return true;
    if (node.mapId && UnlockManager.getAvailableMaps(state).some((m) => String(m.map_id) === node.mapId)) return true;
    return false;
  },

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
    this._el("world-map-title").textContent = "封神山河图";
    const pressure = WorldScroll.getSealPressure(state);
    this._el("world-map-sub").textContent = `${getPhaseRealmName(RealmManager.getCurrentRealm(state))} · ${pressure.label} · 榜文在上，山河在下`;
    const canvas = this._el("world-map-canvas");
    canvas.innerHTML = "";
    canvas.appendChild(this._buildSvg(state));
    for (const node of WORLD_MAP_NODES) canvas.appendChild(this._buildNode(state, node));
    const foot = this._el("world-map-foot");
    foot.innerHTML = "";
    const current = this._currentMapRow(state);
    foot.appendChild(this._node("div", "world-map-foot-name", current ? `当前驻留：${current.map_name}` : "当前驻留：山野洞府"));
    foot.appendChild(this._node("div", "world-map-foot-tip", "点按已点亮的地点，可直接驻留。雾中之地，会随修行与版本推进逐一显现。"));
  },

  _buildSvg(state) {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.classList.add("world-map-svg");
    const pos = (node) => {
      const found = WORLD_MAP_NODES.find((n) => n.id === node);
      return found ? { x: found.x, y: found.y } : null;
    };
    for (const [a, b] of WORLD_MAP_PATHS) {
      const p1 = pos(a); const p2 = pos(b);
      if (!p1 || !p2) continue;
      const aReached = this._nodeReached(state, WORLD_MAP_NODES.find((n) => n.id === a));
      const bReached = this._nodeReached(state, WORLD_MAP_NODES.find((n) => n.id === b));
      const line = document.createElementNS(NS, "line");
      line.setAttribute("x1", p1.x); line.setAttribute("y1", p1.y);
      line.setAttribute("x2", p2.x); line.setAttribute("y2", p2.y);
      line.classList.add("world-map-path");
      if (aReached || bReached) line.classList.add("lit");
      svg.appendChild(line);
    }
    // 山川装饰线：纯 CSS/SVG 占位，正式美术替换后删除
    const decor = [
      [8, 8, 18, 5, 8, 12], [78, 10, 90, 8, 82, 15], [10, 44, 24, 38, 14, 48],
      [84, 60, 94, 54, 86, 66], [4, 72, 18, 68, 8, 80], [68, 78, 88, 72, 72, 86],
    ];
    for (const d of decor) {
      const path = document.createElementNS(NS, "polyline");
      path.setAttribute("points", d.join(" "));
      path.classList.add("world-map-decor");
      svg.appendChild(path);
    }
    return svg;
  },

  _nodeReached(state, node) {
    if (!node) return false;
    if (node.current) return true;
    if (node.realm && DataManager.isRealmAtLeast(state.realm_id, node.realm)) return true;
    if (node.mapId && UnlockManager.getAvailableMaps(state).some((m) => String(m.map_id) === node.mapId)) return true;
    return false;
  },

  _buildNode(state, node) {
    const reached = this._nodeReached(state, node);
    const isCurrent = node.current || (node.mapId && state.current_map_id === node.mapId);
    const el = this._node("button", `world-map-node${reached ? " reached" : " locked"}${isCurrent ? " current" : ""}${node.kind ? ` kind-${node.kind}` : ""}`);
    el.type = "button";
    el.style.left = `${node.x}%`;
    el.style.top = `${node.y}%`;
    el.title = node.desc;
    const glyph = this._node("span", "world-map-node-glyph", this._glyph(node.kind));
    const label = this._node("span", "world-map-node-label", node.name);
    el.append(glyph, label);
    el.addEventListener("click", () => this._onNodeClick(state, node));
    return el;
  },

  _glyph(kind) {
    return { seal: "榜", city: "城", sect: "宫", island: "岛", pass: "关", ruin: "山", wild: "野", home: "府" }[kind] || "地";
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
