// ============================================================
// resonance-system.js — 共鸣/锁链系统框架（完整锁链 · 数据驱动）
// ------------------------------------------------------------
// 【设计 · 用户拍板（G5 完整锁链）】
//   「我不需要体系的弱点，需要的是整个的锁链，被克是锁链的一环，
//     五行只是其中一类，要完整做。」
//   - 锁链（chain）= 一组节点 + 若干【关系环】。关系环是有向环：
//     ring 中每项指向下一项（首尾相接）。「克」只是关系类型之一
//     （ke=被克抹平 / sheng=得生增幅），未来可加新类型（泄/耗/…）。
//   - 五行链只是第一条链。新增链 = 往 web/data/chain_table.json 加一行，
//     引擎/求值器零改（关系类型语义在本文件求值器登记）。
//   - 体系(体/器/魂/劫)是 build 轴，【无相互克】，不进锁链。
//
// 【数据源】web/data/chain_table.json（DataManager.tables.chain_table）。
//   数据缺失时回落内置五行环（_initRelations），保证裸 Node/旧测试可跑。
//
// 【组合规则】各通道倍率【相乘】；一次求值命中多条链时链间也相乘。
//   无命中 → ×1.0。倍率初版占位，待统一数值规划（design/数值规划与平衡待办 v0.1.md）。
// ============================================================
(function (global) {
  "use strict";

  const ResonanceSystem = {
    // ---- 通道注册表（留口子：registerChannel 挂新共鸣类型）----
    channels: {},            // id -> channel
    order: [],               // 求值顺序

    // channel = { id, name, enabled, condition(ctx)->bool, evaluate(ctx)->{mult,...meta} }
    registerChannel(ch) {
      if (!ch || !ch.id) return;
      if (!this.channels[ch.id]) this.order.push(ch.id);
      this.channels[ch.id] = ch;
    },

    // ============================================================
    // 锁链注册表（数据驱动 · chain_table.json）
    //   chains[chainId] = {
    //     id, name, enabled,
    //     nodes: { nodeId: { name, color } },
    //     rel:   { relType: Set("a|b") },   // a 以 relType 关系指向 b（环内每项指向下一项）
    //     mults: { base, broken, enhanced }
    //   }
    // ============================================================
    chains: {},
    _chainSource: null,      // 已装载的 chain_table payload 引用（脏检查用）

    // 装载一条链（chain_table.json 的一行）
    _ingestChain(row) {
      if (!row || !row.chain_id) return;
      const nodes = {};
      for (const n of row.nodes || []) {
        if (n && n.node_id != null) {
          nodes[String(n.node_id)] = { name: n.name || String(n.node_id), color: n.color || "#888" };
        }
      }
      const rel = {};
      for (const r of row.relations || []) {
        if (!r || !r.type || !Array.isArray(r.ring) || r.ring.length < 2) continue;
        const set = rel[r.type] || (rel[r.type] = new Set());
        const ring = r.ring.map(String);
        for (let i = 0; i < ring.length; i++) set.add(ring[i] + "|" + ring[(i + 1) % ring.length]);
      }
      this.chains[String(row.chain_id)] = {
        id: String(row.chain_id),
        name: row.name || String(row.chain_id),
        enabled: row.enabled !== false,
        nodes,
        rel,
        mults: {
          base:     (row.mults && row.mults.base != null)     ? row.mults.base     : this.MULT_BASE,
          broken:   (row.mults && row.mults.broken != null)   ? row.mults.broken   : this.MULT_BROKEN,
          enhanced: (row.mults && row.mults.enhanced != null) ? row.mults.enhanced : this.MULT_ENHANCED,
        },
      };
    },

    // 懒装载：首次求值时从 DataManager 拉 chain_table；payload 引用变了才重建
    _ensureChains() {
      const dm = (typeof DataManager !== "undefined") ? DataManager : null;
      const payload = (dm && dm.tables) ? dm.tables.chain_table : null;
      if (!payload) return;                    // 数据未加载 → 用内置五行回落
      if (this._chainSource === payload) return;
      this._chainSource = payload;
      this.chains = {};
      for (const row of payload.rows || []) this._ingestChain(row);
    },

    // 两端点都落在哪些启用链里（求值域）
    _activeChainsFor(l, m) {
      this._ensureChains();
      const out = [];
      for (const id of Object.keys(this.chains)) {
        const ch = this.chains[id];
        if (!ch.enabled || !ch.nodes[l] || !ch.nodes[m]) continue;
        out.push(ch);
      }
      return out;
    },

    // 某关系类型下 a→b 是否成环（任一条启用链命中即真）
    _relIn(type, a, b) {
      this._ensureChains();
      for (const id of Object.keys(this.chains)) {
        const ch = this.chains[id];
        if (!ch.enabled || !ch.nodes[a] || !ch.nodes[b]) continue;
        if (ch.rel[type] && ch.rel[type].has(a + "|" + b)) return ch;
      }
      return null;
    },

    // ---- 内置五行回落（无 chain_table 时仍可用：裸 Node/旧测试）----
    WUXING: {
      wood:  { name: "木", color: "#66BB6A" },
      fire:  { name: "火", color: "#FF5722" },
      earth: { name: "土", color: "#C8A165" },
      metal: { name: "金", color: "#E0E0E0" },
      water: { name: "水", color: "#4FC3F7" },
    },
    _rel: {},
    _initRelations() {
      const keRing    = ["wood", "earth", "water", "fire", "metal"]; // 每项克下一项：木克土→土克水→水克火→火克金→金克木
      const shengRing = ["wood", "fire", "earth", "metal", "water"]; // 每项生下一项：木生火→火生土→土生金→金生水→水生木
      this._rel = {};
      for (const k of Object.keys(this.WUXING)) this._rel[k] = { ke: null, sheng: null };
      for (let i = 0; i < keRing.length; i++)    this._rel[keRing[i]].ke    = keRing[(i + 1) % keRing.length];
      for (let i = 0; i < shengRing.length; i++) this._rel[shengRing[i]].sheng = shengRing[(i + 1) % shengRing.length];
    },

    // 向后兼容 API：ke(a,b)=a 克 b；sheng(a,b)=a 生 b。
    // 有链数据 → 查全部启用链；无链数据 → 回落内置五行 _rel。
    ke(a, b) {
      if (a == null || b == null) return false;
      this._ensureChains();
      if (this._chainSource) return !!this._relIn("ke", String(a), String(b));
      return !!(this._rel[a] && this._rel[a].ke === b);
    },
    sheng(a, b) {
      if (a == null || b == null) return false;
      this._ensureChains();
      if (this._chainSource) return !!this._relIn("sheng", String(a), String(b));
      return !!(this._rel[a] && this._rel[a].sheng === b);
    },

    // 倍率缺省（链行未写 mults 时兜底；初版占位 · 待数值验证）
    MULT_BASE: 1.3,      // 同链基础共鸣
    MULT_BROKEN: 1.0,    // 被克 → 抹平连锁加成
    MULT_ENHANCED: 1.6,  // 得生 → 增幅

    // 注册内置通道
    _registerBuiltins() {
      const self = this;

      // 通道一：锁链共鸣（完整锁链框架）。left/middle 两端点落进哪条链，哪条链就发声。
      //   语义：middle 克 left → broken(×broken)；middle 生 left → enhanced(×enhanced)；
      //         同链无克生 → base。命中多链 → 链间倍率相乘，明细在 hits[]。
      this.registerChannel({
        id: "chain",
        name: "锁链共鸣",
        enabled: true,
        condition(ctx) {
          return ctx.leftWuxing != null && ctx.middleWuxing != null;
        },
        evaluate(ctx) {
          const l = String(ctx.leftWuxing), m = String(ctx.middleWuxing);
          const chains = self._activeChainsFor(l, m);
          const hits = [];
          let mult = 1.0, broken = false, enhanced = false;
          for (const ch of chains) {
            let r;
            if (ch.rel.ke && ch.rel.ke.has(m + "|" + l)) {
              r = { mult: ch.mults.broken, broken: true, enhanced: false, reason: "ke" };
            } else if (ch.rel.sheng && ch.rel.sheng.has(m + "|" + l)) {
              r = { mult: ch.mults.enhanced, broken: false, enhanced: true, reason: "sheng" };
            } else {
              r = { mult: ch.mults.base, broken: false, enhanced: false, reason: "base" };
            }
            r.channel = ch.id;
            mult *= r.mult;
            if (r.broken) broken = true;
            if (r.enhanced) enhanced = true;
            hits.push(r);
          }
          if (!hits.length) {
            // 回落：无 chain_table 数据时用内置五行环（裸 Node/旧测试路径）
            if (self.WUXING[l] && self.WUXING[m]) {
              if (self.ke(m, l))    return { mult: self.MULT_BROKEN,   broken: true,  enhanced: false, reason: "ke",    channel: "wuxing" };
              if (self.sheng(m, l)) return { mult: self.MULT_ENHANCED, broken: false, enhanced: true,  reason: "sheng", channel: "wuxing" };
              return { mult: self.MULT_BASE, broken: false, enhanced: false, reason: "base", channel: "wuxing" };
            }
            return { mult: 1.0, reason: "none", channel: "chain" };
          }
          return {
            mult, broken, enhanced,
            reason: hits.length === 1 ? hits[0].reason : "multi",
            channel: "chain",
            hits,
          };
        },
      });

      // 通道二（占位 · 留口子）：套装共鸣，如「哪吒三件套」。
      //   触发条件与倍率待设计；接入时：给 condition 读 ctx（套装件数），evaluate 返回 mult。
      this.registerChannel({
        id: "set",
        name: "套装共鸣",
        enabled: false, // 未启用：数据结构与规则待定
        condition(/* ctx */) { return false; },
        evaluate(/* ctx */) { return { mult: 1.0, reason: "none", channel: "set" }; },
      });
    },

    // ============================================================
    // 统一求值入口。ctx = { leftSkill, leftWuxing, middleElement, middleWuxing, battle, ... }
    //   返回 { mult, broken, enhanced, base, results[] }
    //   results 为各命中通道的明细（供 UI 展示「哪种共鸣生效了」）；
    //   锁链通道的 results[i].hits 为逐链明细。
    // ============================================================
    evaluate(ctx) {
      ctx = ctx || {};
      let mult = 1.0;
      let broken = false, enhanced = false;
      const results = [];
      for (const id of this.order) {
        const ch = this.channels[id];
        if (!ch || ch.enabled === false) continue;
        let ok = false;
        try { ok = ch.condition ? ch.condition(ctx) : true; } catch (e) { ok = false; }
        if (!ok) continue;
        const r = ch.evaluate(ctx) || { mult: 1.0 };
        mult *= (r.mult != null ? r.mult : 1.0);
        if (r.broken) broken = true;
        if (r.enhanced) enhanced = true;
        results.push(r);
      }
      return { mult, broken, enhanced, base: this.MULT_BASE, results };
    },

    // 节点展示（任意链的节点都可查；回落内置五行）
    _nodeMeta(el) {
      if (el == null) return null;
      this._ensureChains();
      for (const id of Object.keys(this.chains)) {
        const n = this.chains[id].nodes[String(el)];
        if (n) return n;
      }
      return this.WUXING[el] || null;
    },
    wuxingLabel(el) { const n = this._nodeMeta(el); return (n && n.name) || el || "?"; },
    wuxingColor(el) { const n = this._nodeMeta(el); return (n && n.color) || "#888"; },
  };

  ResonanceSystem._initRelations();
  ResonanceSystem._registerBuiltins();

  global.ResonanceSystem = ResonanceSystem;
  if (typeof module !== "undefined" && module.exports) module.exports = ResonanceSystem;
})(typeof window !== "undefined" ? window : globalThis);
