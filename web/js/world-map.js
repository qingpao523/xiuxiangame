/* 封神山河图 · WorldMap — 两级架构（design/15.2：L1 世界总图 → L2 部洲详图）
 * L1：单张统一世界底图（world_unified_l1.png，keyart_v1 风格锚定），只标部洲 + 关键位置，
 *     未解封部洲罩轻纱金雾 + 锁徽；点击已解封部洲进入 L2。
 * L2：部洲详图（15.1 批次部洲底图），承载节点 5 态 / 伐纣古道 / 行进标记 / 破境 reveal。
 * 素材缺失回退：底图失败回退旧色块 + 文字 glyph（15.1 §3.3）。 */

"use strict";

// 五大部洲底本（世界坐标归一自 design/设定思考/封神四大部洲融合地理图.html；L2 底图 + 解封境界）
const CONTINENT_META = {
  "北俱芦洲":     { color: "#e6e1f0", text: "#5a4a6a", label: "北俱芦洲", reveal_realm: "ty_01", img: "assets/map/continents/continent_beiju.png",
                    desc: "北荒雪原妖域。章尾山烛龙视为昼瞑为夜，女娲招妖幡所指，万妖聚居。" },
  "西牛贺洲":     { color: "#f2e6c2", text: "#6a5a2a", label: "西牛贺洲", reveal_realm: "ty_01", img: "assets/map/continents/continent_xiniu.png",
                    desc: "西方教道场，云海灵山。接引、准提二位道人所在，封神之后渐成西天佛门。" },
  "东胜神洲":     { color: "#d8e9de", text: "#3a5a4a", label: "东胜神洲", reveal_realm: "jx_01", img: "assets/map/continents/continent_dongsheng.png",
                    desc: "东海仙岛链。金鳌岛碧游宫为截教总坛，万仙阵所在；龙族往来其间。" },
  "南赡部洲":     { color: "#efdcbd", text: "#6a4a2a", label: "南赡部洲", reveal_realm: "rq_01", img: "assets/map/continents/continent_nanshan.png",
                    desc: "商周中原，人道伐纣主舞台。西起西岐、东至朝歌，五关古道贯穿其间。" },
  "须弥昆仑中枢": { color: "#31406b", text: "#dfe6ff", label: "须弥 · 昆仑", reveal_realm: "ty_01", img: "assets/map/continents/continent_xumishan.png",
                    desc: "仙佛中枢。昆仑玉虚宫为阐教总坛，封神台悬于绝顶，榜文之光所出。" },
};

// L1 热点区（对 world_unified_l1.png 的归一化区域，背景以 100%×100% 铺满故坐标一一对应）
const L1_REGIONS = {
  "北俱芦洲":     { x: 6,  y: 2,  w: 56, h: 22, labelX: 34, labelY: 10 },
  "西牛贺洲":     { x: 0,  y: 27, w: 31, h: 30, labelX: 15, labelY: 33 },
  "东胜神洲":     { x: 64, y: 27, w: 36, h: 36, labelX: 82, labelY: 33 },
  "须弥昆仑中枢": { x: 31, y: 21, w: 32, h: 40, labelX: 47, labelY: 57 },
  "南赡部洲":     { x: 3,  y: 61, w: 85, h: 38, labelX: 28, labelY: 71 },
};

// L1 关键位置标记（用户 2026-08-22 指定：中央只标封神台；各部洲只标代表性重点位置；南赡=陈塘关/西岐/朝歌）
const L1_SPOTS = [
  { icon: "lm_yaozu",   name: "北荒妖族",     continent: "北俱芦洲",     x: 37, y: 9  },
  { icon: "lm_lingshan", name: "西天灵山",    continent: "西牛贺洲",     x: 14, y: 40 },
  { icon: "lm_huaguo",  name: "傲来国·花果山", continent: "东胜神洲",     x: 80, y: 47 },
  { icon: "map_008",    name: "封神台",       continent: "须弥昆仑中枢", x: 47, y: 31 },
  { icon: "lm_chaoge",  name: "朝歌",         continent: "南赡部洲",     x: 46, y: 66 },
  { icon: "map_002",    name: "陈塘关",       continent: "南赡部洲",     x: 72, y: 84 },
  { icon: "map_004",    name: "西岐",         continent: "南赡部洲",     x: 18, y: 78 },
];

// L2 节点摆位（按 2:3 部洲底图网格逐张手工对位，坐标=底图百分比；未配置节点回退 bbox 自动布局）
const L2_NODE_POS = {
  // 南赡部洲：左上青山（洞府/妖患相邻）· 左中骷髅山（骷髅岩）· 右中陈塘关（海岸城楼）· 左下西岐（城郭）· 中下十绝阵/黄河（九曲金田）· 右上朝歌（王城远景）· 右下青丘
  lm_cave:  { x: 14, y: 20 },
  map_001:  { x: 23, y: 29 },
  map_003:  { x: 13, y: 42 },
  map_002:  { x: 82, y: 55 },
  map_004:  { x: 16, y: 76 },
  map_005:  { x: 44, y: 62 },
  map_006:  { x: 60, y: 58 },
  lm_muye:  { x: 36, y: 88 },
  lm_qingqiu: { x: 80, y: 87 },
  lm_chaoge: { x: 72, y: 14 },
  // 东胜神洲：上碧游宫（万仙阵）· 下海中应龙白龙 · 右下花果山桃岛
  map_007:  { x: 45, y: 30 },
  lm_yinglong: { x: 40, y: 82 },
  lm_huaguo: { x: 80, y: 72 },
  // 须弥昆仑中枢：中金光法阵高台封神台 · 中上玉虚宫 · 底部浮空岛混元道场
  map_008:  { x: 50, y: 52 },
  lm_yuxu:  { x: 48, y: 33 },
  map_009:  { x: 50, y: 84 },
  // 西牛贺洲：上部灵山金顶佛塔
  lm_lingshan: { x: 50, y: 18 },
  // 北俱芦洲：上烛龙衔珠 · 中妖族图腾雪村 · 下精卫冰崖
  lm_zhulong: { x: 50, y: 13 },
  lm_yaozu:  { x: 38, y: 48 },
  lm_jingwei: { x: 64, y: 74 },
};

const FOG_SEAL_IMG = "assets/map/fog/fog_seal_pattern.png";
const PLAYER_MARKER_IMG = "assets/map/path/marker_player.png";
const WORLD_L1_IMG = "assets/map/world_unified_l1.png";

// 部洲扩展地标（L2 雾中节点：未来批次可升格为可玩图，当前仅叙事/世界观纵深）
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
  view: { level: "world", continent: null }, // L1 world / L2 continent

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

  // ---------- 可达性与 5 态状态机（15.1 §1.2） ----------

  isReachable(state, node) {
    return this._nodeReached(state, node);
  },

  _nodeReached(state, node) {
    if (!node) return false;
    if (node.landmark) return !!node.alwaysReach;
    return UnlockManager.getAvailableMaps(state).some((m) => String(m.map_id) === node.mapId);
  },

  _continentRevealed(state, name) {
    const meta = CONTINENT_META[name];
    if (!meta) return true;
    return UnlockManager.conditionMet(state, meta.reveal_realm);
  },

  _nodeState(state, node) {
    if (node.landmark) {
      if (node.alwaysReach) return "available";
      return "fog";
    }
    if (node.bossId && int(state.boss_clears[node.bossId]) > 0) return "completed";
    if (node.mapId && state.current_map_id === node.mapId) return "current";
    if (this._nodeReached(state, node)) return "available";
    return "locked"; // L2 内节点只分 locked/available/current/completed（sealed 属于 L1 部洲层）
  },

  // ---------- 生命周期 ----------

  open(onClose) {
    this.closeCallback = typeof onClose === "function" ? onClose : null;
    this.view = { level: "world", continent: null };
    this.render(Game.state);
    this._el("world-map-layer").classList.remove("hidden");
  },

  close() {
    this._el("world-map-layer").classList.add("hidden");
    this.view = { level: "world", continent: null };
    const cb = this.closeCallback;
    this.closeCallback = null;
    if (cb) cb();
  },

  render(state) {
    if (!state || !state.realm_id) return;
    if (this.view.level === "continent" && this.view.continent) this._renderL2(state, this.view.continent);
    else this._renderL1(state);
  },

  // ================= L1 世界总图（15.2 §2.1） =================

  _renderL1(state) {
    this._el("world-map-title").textContent = "封神山河图 · 四大部洲";
    const pressure = WorldScroll.getSealPressure(state);
    this._el("world-map-sub").textContent = `${getPhaseRealmName(RealmManager.getCurrentRealm(state))} · ${pressure.label} · 榜文在上，山河在下`;
    const snapshot = this._takeSnapshot(state);
    const canvas = this._el("world-map-canvas");
    canvas.innerHTML = "";

    // 单张统一世界底图（一张图拼合五部洲，视觉统一；失败回退云海底+色块热点）
    const base = document.createElement("img");
    base.className = "world-map-l1-base";
    base.src = WORLD_L1_IMG;
    base.alt = "";
    base.draggable = false;
    base.onerror = () => { base.remove(); canvas.classList.add("l1-no-art"); };
    canvas.appendChild(base);

    // 部洲热点：点击进 L2；未解封罩金雾 + 锁徽（锁保留，用户点名好评）
    for (const name of Object.keys(L1_REGIONS)) {
      const r = L1_REGIONS[name];
      const meta = CONTINENT_META[name];
      const revealed = this._continentRevealed(state, name);
      const justRevealed = !snapshot.first && snapshot.newContinents.includes(name);
      const spot = this._node("button", `world-map-region${revealed ? " revealed" : " sealed"}${justRevealed ? " just-revealed" : ""}`);
      spot.type = "button";
      spot.style.left = `${r.x}%`;
      spot.style.top = `${r.y}%`;
      spot.style.width = `${r.w}%`;
      spot.style.height = `${r.h}%`;
      spot.title = revealed ? `${meta.label}——${meta.desc}` : `${meta.label} · 封印未解`;
      if (!revealed || justRevealed) {
        const veil = this._node("div", `world-map-region-veil${justRevealed ? " shatter" : ""}`);
        const veilImg = document.createElement("img");
        veilImg.src = FOG_SEAL_IMG; veilImg.alt = ""; veilImg.onerror = () => veilImg.remove();
        veil.appendChild(veilImg);
        spot.appendChild(veil);
        if (!revealed) spot.appendChild(this._node("span", "world-map-node-lock big"));
        else setTimeout(() => veil.remove(), 2100);
      }
      if (canvas.classList.contains("l1-no-art")) spot.style.background = `${meta.color}40`; // 回退色块
      const label = this._node("span", "world-map-region-label", revealed ? meta.label : `${meta.label} · 封`);
      label.style.left = `${r.labelX}%`;
      label.style.top = `${r.labelY}%`;
      spot.addEventListener("click", () => this._onRegionClick(state, name));
      canvas.appendChild(spot);
      canvas.appendChild(label); // label 独立定位，避免热点裁剪
    }

    // L1 关键位置标记（只标用户指定的重点位置，小徽章 + 名称）
    for (const s of L1_SPOTS) {
      const icon = this._l1SpotIcon(s);
      if (!icon) continue;
      canvas.appendChild(icon);
    }

    // 玩家行进标记：定位在当前驻留图所属部洲
    canvas.appendChild(this._buildMarker(state, this._l1MarkerPos(state)));

    // 解封演出：锁徽碎裂 + 弹幕
    this._playReveal(state, snapshot);

    const foot = this._el("world-map-foot");
    foot.innerHTML = "";
    const current = this._currentMapRow(state);
    foot.appendChild(this._node("div", "world-map-foot-name", current && current.map_name ? `当前驻留：${current.map_name}（${current.continent || ""}）` : "当前驻留：山野洞府"));
    foot.appendChild(this._node("div", "world-map-foot-tip", "点按已解封的部洲可展开详图。榜文渐显之处，山河逐层而开。"));
  },

  _l1SpotIcon(s) {
    const src = (typeof MAP_NODE_ICONS !== "undefined" && MAP_NODE_ICONS[s.icon])
      || (typeof LANDMARK_ICONS !== "undefined" ? LANDMARK_ICONS[s.icon] : null);
    if (!src) return null;
    const el = this._node("div", "world-map-l1-spot");
    el.style.left = `${s.x}%`;
    el.style.top = `${s.y}%`;
    const img = document.createElement("img");
    img.src = src; img.alt = ""; img.loading = "lazy"; img.decoding = "async";
    img.onerror = () => { el.remove(); };
    el.appendChild(img);
    el.appendChild(this._node("span", "world-map-l1-spot-name", s.name));
    return el;
  },

  _l1MarkerPos(state) {
    const row = state.current_map_id ? DataManager.getById("map_table", state.current_map_id) : null;
    const continent = row && row.continent ? String(row.continent) : "南赡部洲";
    const r = L1_REGIONS[continent] || null;
    if (!r) return { x: 19, y: 83 }; // 默认洞府方位
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  },

  _onRegionClick(state, name) {
    if (!this._continentRevealed(state, name)) {
      if (typeof AudioManager !== "undefined" && AudioManager.playSfx) AudioManager.playSfx("seal_locked");
      Game.toast(CONTINENT_META[name].label, "此处封印未解，榜上无名。随境界渐开，山河逐层而启。");
      return;
    }
    this.view = { level: "continent", continent: name };
    this._renderL2(state, name);
  },

  // ================= L2 部洲详图（15.2 §2.2，承载 15.1 动态体验） =================

  _renderL2(state, continent) {
    const meta = CONTINENT_META[continent];
    this._el("world-map-title").textContent = `${meta.label} · 详图`;
    const pressure = WorldScroll.getSealPressure(state);
    this._el("world-map-sub").textContent = `${getPhaseRealmName(RealmManager.getCurrentRealm(state))} · ${pressure.label} · ${meta.desc}`;
    const canvas = this._el("world-map-canvas");
    canvas.innerHTML = "";

    // 部洲底图（失败回退部洲色块）
    const base = document.createElement("img");
    base.className = "world-map-l2-base";
    base.src = meta.img;
    base.alt = "";
    base.draggable = false;
    base.onerror = () => { base.remove(); canvas.style.background = `${meta.color}66`; };
    canvas.style.background = "";
    canvas.appendChild(base);

    // 返回 L1
    const back = this._node("button", "world-map-back", "← 总图");
    back.type = "button";
    back.addEventListener("click", () => { this.view = { level: "world", continent: null }; this._renderL1(state); });
    canvas.appendChild(back);

    // 本部洲节点（可玩 + 地标），世界坐标 → 部洲内子坐标（按成员 bbox 归一，数据零改动）
    const members = this._playableNodes(state).concat(this._landmarkNodes()).filter((n) => n.continent === continent);
    const placed = this._l2Layout(members);
    canvas.appendChild(this._buildSvg(state, members, placed));
    this._takeSnapshot(state); // 更新快照（continents/nodes），节点 reveal 走挂起队列
    const popIds = this._consumePendingNodes(state, continent);
    for (const n of members) canvas.appendChild(this._buildNode(state, n, placed.get(n.id), popIds));
    if (!members.some((n) => !n.landmark)) {
      canvas.appendChild(this._node("div", "world-map-l2-empty", "尚无历练之地，权作远观。"));
    }

    // 行进标记定位当前节点
    const cur = members.find((n) => !n.landmark && n.mapId === state.current_map_id);
    const home = members.find((n) => n.id === "lm_cave");
    const anchor = cur || home;
    canvas.appendChild(this._buildMarker(state, anchor ? placed.get(anchor.id) : null));

    // L2 内新解锁节点 reveal（节点浮现 + 弹幕）
    this._playNodeReveal(popIds);

    const foot = this._el("world-map-foot");
    foot.innerHTML = "";
    const current = this._currentMapRow(state);
    foot.appendChild(this._node("div", "world-map-foot-name", current && current.map_name ? `当前驻留：${current.map_name}（${current.continent || ""}）` : "当前驻留：山野洞府"));
    foot.appendChild(this._node("div", "world-map-foot-tip", "点按已点亮的地点可直接驻留。通关前置之地，古道自会向前延伸。"));
  },

  // 部洲内子坐标：优先 L2_NODE_POS 手工摆位（贴合底图内容）；未配置节点回退 bbox 归一
  _l2Layout(members) {
    const map = new Map();
    const missing = [];
    for (const n of members) {
      const p = (typeof L2_NODE_POS !== "undefined" && L2_NODE_POS[n.id]) || null;
      if (p) map.set(n.id, { x: p.x, y: p.y });
      else missing.push(n);
    }
    if (missing.length) {
      const pad = 12;
      const xs = missing.map((n) => n.wx), ys = missing.map((n) => n.wy);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const spanX = Math.max(maxX - minX, 1), spanY = Math.max(maxY - minY, 1);
      for (const n of missing) {
        map.set(n.id, {
          x: pad + ((n.wx - minX) / spanX) * (100 - pad * 2),
          y: pad + ((n.wy - minY) / spanY) * (100 - pad * 2),
        });
      }
    }
    return map;
  },

  // ---------- SVG：伐纣古道（15.1 §1.5，L2 内本洲链） ----------

  _buildSvg(state, nodes, placed) {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.classList.add("world-map-svg");
    const byId = {};
    for (const n of nodes) byId[n.id] = n;
    for (const row of DataManager.getRows("map_table")) {
      const prev = String(row.prev_map || "");
      if (!prev) continue;
      const a = byId[prev]; const b = byId[String(row.map_id)];
      if (!a || !b || a.landmark || b.landmark) continue;
      const pa = placed.get(a.id), pb = placed.get(b.id);
      if (!pa || !pb) continue;
      const line = document.createElementNS(NS, "line");
      line.setAttribute("x1", pa.x); line.setAttribute("y1", pa.y);
      line.setAttribute("x2", pb.x); line.setAttribute("y2", pb.y);
      line.setAttribute("vector-effect", "non-scaling-stroke");
      line.classList.add("world-map-path");
      const sa = this._nodeState(state, a), sb = this._nodeState(state, b);
      const aLive = ["completed", "current", "available"].includes(sa);
      const bLive = ["completed", "current", "available"].includes(sb);
      if (sa === "completed" && sb === "completed") line.classList.add("lit");
      else if (aLive && bLive) line.classList.add("active");
      svg.appendChild(line);
    }
    return svg;
  },

  // ---------- 行进标记：主角乘云小像（15.1 §2.5） ----------

  _buildMarker(state, pos) {
    const marker = this._node("div", "world-map-player-marker");
    if (!pos) { marker.classList.add("hidden"); return marker; }
    marker.style.left = `${pos.x}%`;
    marker.style.top = `${pos.y}%`;
    const img = document.createElement("img");
    img.src = PLAYER_MARKER_IMG;
    img.alt = "";
    img.onerror = () => { marker.remove(); };
    marker.appendChild(img);
    return marker;
  },

  // ---------- 节点（L2：图标 + 5 态视觉） ----------

  _buildNode(state, node, pos, popIds) {
    const nState = this._nodeState(state, node);
    const el = this._node("button", `world-map-node state-${nState}${node.kind ? ` kind-${node.kind}` : ""}${node.landmark ? " landmark" : ""}`);
    el.type = "button";
    el.style.left = `${pos.x}%`;
    el.style.top = `${pos.y}%`;
    el.title = node.desc;
    if (!node.landmark && popIds.includes(node.id)) el.classList.add("just-unlocked");

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
      glyph.onerror = () => {
        const span = this._node("span", "world-map-node-glyph", this._glyph(node.kind));
        glyph.replaceWith(span);
      };
    } else {
      glyph = this._node("span", "world-map-node-glyph", this._glyph(node.kind));
    }
    el.appendChild(glyph);

    if (nState === "completed") el.appendChild(this._node("span", "world-map-node-done", "✓"));
    if (nState === "locked" && !node.landmark) el.appendChild(this._node("span", "world-map-node-lock"));

    el.appendChild(this._node("span", "world-map-node-label", node.name));
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

  // ---------- 渐进解锁：快照 + reveal 演出（15.1 §1.4 / 15.2 §2.3） ----------

  _takeSnapshot(state) {
    if (!state.flags || typeof state.flags !== "object") state.flags = {};
    const prev = state.flags.world_map_snapshot || null;
    const available = UnlockManager.getAvailableMaps(state).map((m) => String(m.map_id));
    const cur = {
      continents: Object.keys(CONTINENT_META).filter((c) => this._continentRevealed(state, c)),
      nodes: available,
    };
    const prevC = new Set((prev && prev.continents) || []);
    const prevN = new Set((prev && prev.nodes) || []);
    // 节点 reveal 挂起累积：直到玩家进入对应部洲 L2 才消费（L1 先渲染不吞掉节点演出）
    const newly = cur.nodes.filter((n) => !prevN.has(n));
    const pending = new Set([...(state.flags.world_map_pending_nodes || []), ...newly]);
    state.flags.world_map_pending_nodes = [...pending];
    state.flags.world_map_snapshot = cur;
    return {
      first: !prev,
      newContinents: cur.continents.filter((c) => !prevC.has(c)),
      pendingNodes: [...pending],
    };
  },

  // L2 消费本部洲的挂起 reveal，返回本次浮现的节点 id
  _consumePendingNodes(state, continent) {
    const pending = state.flags.world_map_pending_nodes || [];
    const mine = pending.filter((id) => {
      const r = DataManager.getById("map_table", id);
      return r && r.map_name && String(r.continent || "") === continent;
    });
    if (mine.length) {
      state.flags.world_map_pending_nodes = pending.filter((id) => !mine.includes(id));
    }
    return mine;
  },

  // L1：部洲解封演出（锁徽碎裂 + 金雾散去 + 弹幕）
  _playReveal(state, snapshot) {
    if (snapshot.first || !snapshot.newContinents.length) return;
    if (typeof AudioManager !== "undefined" && AudioManager.playSfx) AudioManager.playSfx("secret_found");
    snapshot.newContinents.forEach((name, i) => {
      setTimeout(() => {
        if (this._el("world-map-layer").classList.contains("hidden")) return;
        const panel = document.getElementById("world-map-panel");
        if (!panel) return;
        const banner = this._node("div", "world-map-reveal-banner", `${(CONTINENT_META[name] || {}).label || name} · 解封`);
        panel.appendChild(banner);
        setTimeout(() => banner.remove(), 2600);
      }, 450 * i);
    });
  },

  // L2：本洲新解锁节点弹幕（节点 pop 由 just-unlocked class 承担）
  _playNodeReveal(popIds) {
    if (!popIds.length) return;
    const names = popIds
      .map((id) => DataManager.getById("map_table", id))
      .filter((r) => r && r.map_name)
      .map((r) => String(r.map_name));
    if (!names.length) return;
    if (typeof AudioManager !== "undefined" && AudioManager.playSfx) AudioManager.playSfx("secret_found");
    names.forEach((name, i) => {
      setTimeout(() => {
        if (this._el("world-map-layer").classList.contains("hidden")) return;
        const panel = document.getElementById("world-map-panel");
        if (!panel) return;
        const banner = this._node("div", "world-map-reveal-banner", `${name} · 解封`);
        panel.appendChild(banner);
        setTimeout(() => banner.remove(), 2600);
      }, 450 * i);
    });
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
