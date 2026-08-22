// ============================================================
// resonance-system.js — 共鸣系统框架（可扩展）
// ------------------------------------------------------------
// 【设计 · 用户拍板】
//   共鸣有多种类型（通道 channel）：五行共鸣、套装共鸣（如「哪吒三件套」）、
//   未来的其他共鸣……本框架统一承接，留口子，可持续加新通道。
//   - 五行只是第一个接入的通道；只有「本身带五行」的招式/夹招才触发五行共鸣。
//   - 克环 + 增幅是【数据驱动】的关系图，可不断丰富（加节点/加边/调权重/加新关系类型）。
//
// 【两层分离】体系(体/器/魂/劫，build 选择，无相互克) ≠ 五行(木火土金水，驱动五行共鸣)。
//   器的二级才带五行；体系↔五行无固定映射。
//
// 【组合规则（初版）】各通道倍率【相乘】；五行被破返回 ×1.0（抹平连锁加成）。
//   无通道命中 → ×1.0。组合方式（相乘/取极值/优先级）为 ⚪ 待决策，第二期加通道时定稿。
//
// 所有倍率为初版占位，待统一数值规划（见 design/数值规划与平衡待办 v0.1.md）。
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
    // 五行关系图（数据驱动 · 可不断丰富）
    //   _rel[a] = { ke: b, sheng: b }  表示 a 克 b、a 生 b
    //   扩展方式：往 _rel 加节点/改边；或加新关系类型（如 泄/耗）+ 在五行通道 evaluate 里判定。
    // ============================================================
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
    ke(a, b)    { return a != null && b != null && this._rel[a] && this._rel[a].ke === b; },
    sheng(a, b) { return a != null && b != null && this._rel[a] && this._rel[a].sheng === b; },

    // 五行倍率（初版占位 · 待验证）
    MULT_BASE: 1.3,      // 基础共鸣（同系连锁，沿用现状）
    MULT_BROKEN: 1.0,    // 五行被克 → 抹平连锁加成
    MULT_ENHANCED: 1.6,  // 五行得生 → 增幅

    // 注册内置通道
    _registerBuiltins() {
      const self = this;

      // 通道一：五行共鸣（第一期）。仅当 left 与 middle 都带五行才参与。
      this.registerChannel({
        id: "wuxing",
        name: "五行共鸣",
        enabled: true,
        condition(ctx) {
          const l = ctx.leftWuxing, m = ctx.middleWuxing;
          return l != null && m != null && self.WUXING[l] && self.WUXING[m];
        },
        evaluate(ctx) {
          const l = ctx.leftWuxing, m = ctx.middleWuxing;
          if (self.ke(m, l))    return { mult: self.MULT_BROKEN,   broken: true,  enhanced: false, reason: "ke",    channel: "wuxing" };
          if (self.sheng(m, l)) return { mult: self.MULT_ENHANCED, broken: false, enhanced: true,  reason: "sheng", channel: "wuxing" };
          return { mult: self.MULT_BASE, broken: false, enhanced: false, reason: "base", channel: "wuxing" };
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
    //   results 为各命中通道的明细（供 UI 展示「哪种共鸣生效了」）。
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

    wuxingLabel(el) { return (this.WUXING[el] && this.WUXING[el].name) || el || "?"; },
    wuxingColor(el) { return (this.WUXING[el] && this.WUXING[el].color) || "#888"; },
  };

  ResonanceSystem._initRelations();
  ResonanceSystem._registerBuiltins();

  global.ResonanceSystem = ResonanceSystem;
  if (typeof module !== "undefined" && module.exports) module.exports = ResonanceSystem;
})(typeof window !== "undefined" ? window : globalThis);
