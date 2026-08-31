/* 封神修道录 · FeedbackRenderer — 反馈文案渲染器（design/21.2 §3.2 L1-3）
 *
 * 数据为体、画面为用：一切反馈文案住在 web/data/feedback_table.json，
 * 本层只做三件事——①近 N 次不重复伪随机选句（沿用 atmosphere.js 旧 seed
 * 思路升级：旧为"日期+次数取模"确定性映射，新为会话内近 N 次无重复随机）；
 * ②预算检查（daily_max/min_interval/first_only，预算尽 → fallback_id 或静默）；
 * ③{key} 模板插值。
 *
 * 留白优先于气韵（21.2 §R1）：预算耗尽且无 fallback 时返回 null（静默）。
 * 预算状态只存本模块内存（纯表现层，不入存档、不入服务端逻辑，对齐 S2-2 方向）。
 */
"use strict";

const FeedbackRenderer = {
  RECENT_KEEP: 10, // 21.2 S2：同池近 N 次不重复（池长不足时自动收窄为 池长-1）
  LONG_DAILY_CAP: 20, // 21.2 S2：每日气韵长文（≥2 句）配额，超额降级为短句（留白优先于气韵）
  DECAY_AFTER: 30, // 21.2 S2：同一条目曝光超 N 次后自动缩短（第 N 次只留一句，防文字通胀）

  _recent: {},  // feedback_id -> 最近选中的下标队列
  _daily: {},   // feedback_id -> { day, n } 每日曝光计数
  _lastAt: {},  // feedback_id -> 上次曝光时间戳（ms）
  _seen: {},    // feedback_id -> true（first_only 已曝光）
  _longDaily: null, // { day, n } 全局长文当日曝光计数（21.2 S2）
  _expose: {},  // feedback_id -> 累计曝光次数（重复衰减用，21.2 S2）

  _row(feedbackId) {
    if (typeof DataManager === "undefined") return null;
    const row = DataManager.getById("feedback_table", feedbackId);
    return row && row.feedback_id ? row : null;
  },

  // 池 = 本行 lines + merge_ids 声明的合池行 lines（如 insight 行动池合入 insight_generic）
  _poolOf(row) {
    const lines = Array.isArray(row.lines) ? [...row.lines] : [];
    for (const mid of row.merge_ids || []) {
      const mrow = DataManager.getById("feedback_table", String(mid));
      if (mrow && Array.isArray(mrow.lines)) lines.push(...mrow.lines);
    }
    return lines;
  },

  _today() { return typeof todayString === "function" ? todayString() : ""; },

  _budgetOk(row) {
    const b = row.budget || {};
    const id = String(row.feedback_id);
    const today = this._today();
    if (this._daily[id] && this._daily[id].day !== today) delete this._daily[id];
    const dailyMax = int(b.daily_max);
    if (dailyMax > 0 && int(this._daily[id] ? this._daily[id].n : 0) >= dailyMax) return false;
    const minInterval = int(b.min_interval);
    if (minInterval > 0) {
      const last = num(this._lastAt[id]);
      if (last && Date.now() - last < minInterval * 1000) return false;
    }
    if (b.first_only && this._seen[id]) return false;
    return true;
  },

  _spend(row) {
    const id = String(row.feedback_id);
    const today = this._today();
    if (!this._daily[id] || this._daily[id].day !== today) this._daily[id] = { day: today, n: 0 };
    this._daily[id].n += 1;
    this._lastAt[id] = Date.now();
    this._expose[id] = int(this._expose[id]) + 1; // 21.2 S2 重复衰减计数
    if (row.budget && row.budget.first_only) this._seen[id] = true;
  },

  // 21.2 S2：≥2 句为长文（留白优先于气韵——长文是阅读负担）
  _isLong(text) { return (String(text).match(/。/g) || []).length >= 2; },
  // 21.2 S2 降级：只留第一句（数字与语义不断，只减阅读量）
  _shorten(text) { const t = String(text); const i = t.indexOf("。"); return i > 0 ? t.slice(0, i + 1) : t; },
  _longQuotaOk() {
    const today = this._today();
    if (!this._longDaily || this._longDaily.day !== today) this._longDaily = { day: today, n: 0 };
    return this._longDaily.n < this.LONG_DAILY_CAP;
  },

  // 近 N 次不重复选句：候选剔除最近 keep 次已选下标后均匀随机（池长 1 时恒取 0）
  _pick(pool, feedbackId) {
    if (!pool.length) return -1;
    if (pool.length === 1) return 0;
    const recent = this._recent[feedbackId] || (this._recent[feedbackId] = []);
    const keep = Math.min(this.RECENT_KEEP, pool.length - 1);
    const banned = recent.slice(-keep);
    const cands = [];
    for (let i = 0; i < pool.length; i++) if (!banned.includes(i)) cands.push(i);
    const idx = cands[Math.floor(Math.random() * cands.length)];
    recent.push(idx);
    while (recent.length > keep) recent.shift();
    return idx;
  },

  _fill(text, ctx) {
    if (!ctx) return String(text);
    return String(text).replace(/\{(\w+)\}/g, (m, k) => (ctx[k] != null ? String(ctx[k]) : m));
  },

  // 取一句：预算尽 → fallback_id，再尽 → null（静默）；
  // 21.2 S2：长文超日配额或同条曝光超阈值 → 降级为第一句（留白优先于气韵）
  line(feedbackId, ctx) {
    const row = this._row(feedbackId);
    if (!row) return null;
    if (!this._budgetOk(row)) {
      const fb = str(row.fallback_id, "");
      return fb && fb !== feedbackId ? this.line(fb, ctx) : null;
    }
    const pool = this._poolOf(row);
    const i = this._pick(pool, feedbackId);
    if (i < 0) {
      const fb = str(row.fallback_id, "");
      return fb && fb !== feedbackId ? this.line(fb, ctx) : null;
    }
    let text = String(pool[i]);
    const long = this._isLong(text);
    if (long && (!this._longQuotaOk() || int(this._expose[feedbackId]) >= this.DECAY_AFTER)) text = this._shorten(text);
    this._spend(row);
    if (long && this._isLong(text)) this._longDaily.n += 1; // 实际以长文输出才计全局长文配额
    return this._fill(text, ctx);
  },

  // 取画卷脚本 beats（scroll_scene 通道；结构同 scroll-scene.js 约定）
  scene(feedbackId) {
    const row = this._row(feedbackId);
    if (!row || !Array.isArray(row.beats) || !row.beats.length) return null;
    return row.beats;
  },

  // 取整行（unlock 等带 title 字段的条目用）
  entry(feedbackId) { return this._row(feedbackId); },
};
