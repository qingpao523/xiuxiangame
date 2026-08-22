/* 封神修道录 · AudioManager — Web Audio 单例（画卷哲学·声音闭环）
 *
 * 设计（音效需求.md §4）：
 *   - 单例 AudioManager，Web Audio API。
 *   - 接口：init()（首次交互后启动 AudioContext）/ playAmbient(id) / playSfx(id) /
 *           setVolume / setMuted / 三总线（master/sfx/ambient/music）。
 *   - 自动播放合规：AudioContext 只在首次用户手势（pointerdown/keydown/touchstart）后创建/恢复。
 *   - 可访问性：尊重 prefers-reduced-motion（减弱闪烁类音效与环境音调度）；提供音量/静音。
 *   - 素材策略：优先加载 web/audio/{id}.ogg → .mp3（真实素材后补）；无素材时回退到
 *     程序化合成（oscillator + 滤波噪声），接口与素材无关，系统当下即可端到端运行。
 *   - 设置持久化：写入存档 state.audio。
 *
 * 性能/内存：所有一次性 oscillator/source 均 start+stop 自动回收；环境音返回 {stop} 句柄，
 *   切换/停止时 ramp 到 0 后 stop 并断开；周期调度用 setTimeout 自递归并在 stop 时清除，无泄漏。
 */

"use strict";

const AudioManager = {
  ctx: null,
  master: null,
  sfxBus: null,
  ambientBus: null,
  musicBus: null,
  noiseBuffer: null,
  bufferCache: {},        // id -> AudioBuffer（真实素材加载缓存）
  _loading: {},           // id -> true（避免重复 fetch）
  _ready: false,
  _gestureBound: false,
  _gestureHandler: null,
  reducedMotion: false,
  currentAmbient: null,   // { id, stop(), silent? }

  // 默认设置（0..1 音量 + 静音）。loadSettings 会从存档覆盖。
  settings: { master: 0.8, sfx: 0.85, ambient: 0.45, music: 0.6, muted: false },

  // ---------------- 生命周期 / 自动播放合规 ----------------

  // 绑定首次手势：浏览器自动播放策略要求 AudioContext 在用户交互后才能 running。
  // 只绑定一次；首次触发后 init() 并解绑（once 行为）。
  bindGestures() {
    if (this._gestureBound) return;
    if (typeof window === "undefined") return;
    this._gestureBound = true;
    const self = this;
    this._gestureHandler = function () {
      self.init();
      self._unbindGestures();
    };
    ["pointerdown", "keydown", "touchstart"].forEach((ev) => {
      window.addEventListener(ev, this._gestureHandler, { passive: true });
    });
    // 检测 prefers-reduced-motion
    try {
      const mq = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
      if (mq) {
        this.reducedMotion = !!mq.matches;
        if (typeof mq.addEventListener === "function") {
          mq.addEventListener("change", (e) => { self.reducedMotion = !!e.matches; });
        } else if (typeof mq.addListener === "function") {
          mq.addListener((e) => { self.reducedMotion = !!e.matches; });
        }
      }
    } catch (e) { /* matchMedia 不可用则忽略 */ }
  },

  _unbindGestures() {
    if (!this._gestureHandler) return;
    ["pointerdown", "keydown", "touchstart"].forEach((ev) => {
      window.removeEventListener(ev, this._gestureHandler);
    });
    this._gestureHandler = null;
  },

  // 创建/恢复 AudioContext 与三总线。幂等。无 Web Audio 支持时静默降级（_ready 保持 false）。
  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended" && this.ctx.resume) this.ctx.resume();
      return;
    }
    if (typeof window === "undefined") return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return; // 不支持 Web Audio：全部 play* 静默 no-op
    try {
      this.ctx = new AC();
    } catch (e) {
      this.ctx = null;
      return;
    }
    this.master = this.ctx.createGain();
    this.sfxBus = this.ctx.createGain();
    this.ambientBus = this.ctx.createGain();
    this.musicBus = this.ctx.createGain();
    this.sfxBus.connect(this.master);
    this.ambientBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.master.connect(this.ctx.destination);
    this._makeNoiseBuffer();
    this._applyGains();
    this._ready = true;
    if (this.ctx.state === "suspended" && this.ctx.resume) this.ctx.resume();
  },

  isReady() { return this._ready && !!this.ctx; },

  _makeNoiseBuffer() {
    const len = Math.floor(this.ctx.sampleRate * 2);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;
  },

  // ---------------- 设置 / 持久化 ----------------

  loadSettings(state) {
    if (!state) return;
    const a = state.audio || {};
    this.settings.master = this._clamp01(num(a.master, this.settings.master));
    this.settings.sfx = this._clamp01(num(a.sfx, this.settings.sfx));
    this.settings.ambient = this._clamp01(num(a.ambient, this.settings.ambient));
    this.settings.music = this._clamp01(num(a.music, this.settings.music));
    this.settings.muted = !!a.muted;
    this._applyGains();
  },

  // 把当前设置写回存档（不触发存档节流，直接挂到 state.audio）。
  writeSettings(state) {
    if (!state) return;
    state.audio = {
      master: this.settings.master,
      sfx: this.settings.sfx,
      ambient: this.settings.ambient,
      music: this.settings.music,
      muted: this.settings.muted,
    };
  },

  setMasterVolume(v) { this.settings.master = this._clamp01(num(v, this.settings.master)); this._applyGains(); },
  setSfxVolume(v) { this.settings.sfx = this._clamp01(num(v, this.settings.sfx)); this._applyGains(); },
  setAmbientVolume(v) { this.settings.ambient = this._clamp01(num(v, this.settings.ambient)); this._applyGains(); },
  setMusicVolume(v) { this.settings.music = this._clamp01(num(v, this.settings.music)); this._applyGains(); },
  // 兼容 §4 接口 setVolume(v)：设主音量。
  setVolume(v) { this.setMasterVolume(v); },

  setMuted(m) {
    const wasMuted = this.settings.muted;
    this.settings.muted = !!m;
    this._applyGains();
    // 静音时停掉环境音调度（避免空转）。
    if (this.settings.muted) this.stopAmbient();
    // 取消静音：恢复当前境界环境音（否则 playAmbient 会因 silent 句柄早退，用户听不到）。
    else if (wasMuted && typeof this.onUnmute === "function") this.onUnmute();
  },
  isMuted() { return this.settings.muted; },

  _clamp01(v) { v = Number(v); if (!isFinite(v)) return 0; return Math.max(0, Math.min(1, v)); },

  _applyGains() {
    if (!this._ready) return;
    const m = this.settings.muted ? 0 : this.settings.master;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(m, t, 0.02);
    this.sfxBus.gain.setTargetAtTime(this.settings.sfx, t, 0.02);
    this.ambientBus.gain.setTargetAtTime(this.settings.ambient, t, 0.02);
    this.musicBus.gain.setTargetAtTime(this.settings.music, t, 0.02);
  },

  // ---------------- 素材加载（真实 .ogg/.mp3 后补，回退合成） ----------------

  // 预加载一组素材；失败则静默（playSfx 会回退合成）。
  preload(ids) {
    if (!Array.isArray(ids)) return;
    ids.forEach((id) => this._loadBuffer(id));
  },

  _loadBuffer(id) {
    if (this.bufferCache[id] || this._loading[id]) return;
    if (typeof fetch === "undefined") return;
    this._loading[id] = true;
    const self = this;
    const tryUrl = (url, fallback) => {
      fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("not found"))))
        .then((ab) => self.ctx.decodeAudioData(ab))
        .then((buf) => { self.bufferCache[id] = buf; delete self._loading[id]; })
        .catch(() => {
          if (fallback) tryUrl(fallback, null);
          else delete self._loading[id];
        });
    };
    // 延迟到 ctx 就绪再解码；若未就绪仅标记，init 后可重新 preload。
    if (!this.ctx) { delete this._loading[id]; return; }
    tryUrl(`audio/${id}.ogg`, `audio/${id}.mp3`);
  },

  // ---------------- SFX 播放 ----------------

  // playSfx(id, opts)：素材优先，回退程序化合成。静音/未就绪时安全 no-op。
  playSfx(id, opts) {
    opts = opts || {};
    if (this.settings.muted) return;
    // #6 修复：不在无手势时创建 AudioContext，仅在手势已触发 init 后播放。
    if (!this.isReady()) return;
    if (this.ctx.state === "suspended" && this.ctx.resume) this.ctx.resume();
    const buf = this.bufferCache[id];
    if (buf) { this._playBuffer(buf, opts); return; }
    // 异步尝试加载真实素材（下次播放生效），本次用合成。
    this._loadBuffer(id);
    const recipe = SFX_RECIPES[id];
    if (typeof recipe === "function") {
      try { recipe.call(this, opts); } catch (e) { /* 合成失败不影响游戏 */ }
    }
  },

  _playBuffer(buf, opts) {
    const t = this.ctx.currentTime + num(opts.delay, 0);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = num(opts.gain, 1);
    src.connect(g);
    g.connect(opts.bus === "ambient" ? this.ambientBus : this.sfxBus);
    if (opts.loop) src.loop = true;
    src.start(t);
    if (!opts.loop && buf.duration) src.stop(t + buf.duration + 0.05);
    return { src, g };
  },

  // ---------------- 环境音床 ----------------

  // playAmbient(id)：切换到指定环境音床（无缝 crossfade）。同 id 不重启。
  playAmbient(id) {
    if (this.currentAmbient && this.currentAmbient.id === id) return;
    this.stopAmbient();
    if (this.settings.muted) { this.currentAmbient = { id, silent: true, stop() {} }; return; }
    // #6 修复：不在无手势时创建 AudioContext，仅在手势已触发 init 后播放。
    if (!this.isReady()) return;
    const recipe = AMBIENT_RECIPES[id];
    if (typeof recipe !== "function") return;
    let handle;
    try { handle = recipe.call(this); } catch (e) { return; }
    if (!handle || typeof handle.stop !== "function") return;
    handle.id = id;
    this.currentAmbient = handle;
  },

  stopAmbient() {
    if (this.currentAmbient && typeof this.currentAmbient.stop === "function") {
      try { this.currentAmbient.stop(); } catch (e) { /* ignore */ }
    }
    this.currentAmbient = null;
  },

  // ---------------- 合成辅助 ----------------

  // 通用音高包络 oscillator。返回 {osc, g}，自动 stop。
  _tone(freq, dur, type, peak, when, dest, freqEnd) {
    const t = (when != null ? when : this.ctx.currentTime);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(Math.max(1, freq), t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(dest || this.sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.06);
    return { osc, g };
  },

  // 通用噪声爆发（带低通/高通滤波与频率扫描）。返回 {src, g}。
  _noiseBurst(dur, peak, filterType, fStart, fEnd, when, dest, q) {
    const t = (when != null ? when : this.ctx.currentTime);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filt = this.ctx.createBiquadFilter();
    filt.type = filterType || "lowpass";
    filt.frequency.setValueAtTime(Math.max(1, fStart), t);
    if (fEnd) filt.frequency.exponentialRampToValueAtTime(Math.max(1, fEnd), t + dur);
    if (q) filt.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(dest || this.sfxBus);
    src.start(t);
    src.stop(t + dur + 0.1);
    return { src, g };
  },
};

// ================= SFX 合成配方（音效需求.md §2） =================
// 键 = 逻辑 id；真实素材 web/audio/{id}.ogg 存在时优先用素材。
const SFX_RECIPES = {
  // SFX-01 开局卷首：水滴 → 远处雷声
  water_drop() {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1300, t);
    osc.frequency.exponentialRampToValueAtTime(280, t + 0.13);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    osc.connect(g); g.connect(this.sfxBus);
    osc.start(t); osc.stop(t + 0.32);
  },
  thunder(opts) {
    const dur = num(opts && opts.dur, 1.8);
    const peak = num(opts && opts.gain, 0.7);
    this._noiseBurst(dur, peak, "lowpass", 900, 70);
    // 低频隆隆尾
    this._tone(60, dur * 0.9, "sine", peak * 0.4, this.ctx.currentTime + 0.05, this.sfxBus, 38);
  },

  // SFX-02 吐纳：吸气渐强 → 呼气释放
  breath_in() {
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 700; bp.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.32, t + 1.1);   // 渐强
    g.gain.linearRampToValueAtTime(0.0001, t + 1.25);
    bp.frequency.linearRampToValueAtTime(1100, t + 1.1);
    src.connect(bp); bp.connect(g); g.connect(this.sfxBus);
    src.start(t); src.stop(t + 1.3);
  },
  breath_out() {
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 1000; bp.Q.value = 0.7;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.3, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4); // 释放
    bp.frequency.linearRampToValueAtTime(500, t + 1.4);
    src.connect(bp); bp.connect(g); g.connect(this.sfxBus);
    src.start(t); src.stop(t + 1.5);
  },

  // SFX-03 五系出招音色（雷/火/剑=weapon/魂/劫=calamity；body 用通用）
  elem_thunder() { // 雷：短促电击 zap
    const t = this.ctx.currentTime;
    this._tone(1800, 0.12, "sawtooth", 0.35, t, this.sfxBus, 220);
    this._noiseBurst(0.14, 0.25, "highpass", 1500, 3000, t);
  },
  elem_fire() { // 火：噼啪爆裂
    const t = this.ctx.currentTime;
    this._noiseBurst(0.22, 0.32, "bandpass", 1200, 600, t, this.sfxBus, 1.2);
    this._tone(320, 0.18, "triangle", 0.18, t, this.sfxBus, 140);
  },
  elem_weapon() { // 剑：金属清鸣
    const t = this.ctx.currentTime;
    this._tone(1560, 0.16, "triangle", 0.3, t, this.sfxBus, 1040);
    this._tone(2340, 0.12, "sine", 0.14, t + 0.01, this.sfxBus, 1560);
  },
  elem_soul() { // 魂：幽沉颤音
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const lfo = this.ctx.createOscillator();
    const lfoG = this.ctx.createGain();
    osc.type = "sine"; osc.frequency.value = 440;
    lfo.type = "sine"; lfo.frequency.value = 6.5;
    lfoG.gain.value = 22;
    lfo.connect(lfoG); lfoG.connect(osc.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.26, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    osc.connect(g); g.connect(this.sfxBus);
    osc.start(t); lfo.start(t); osc.stop(t + 0.55); lfo.stop(t + 0.55);
  },
  elem_calamity() { // 劫：沉重低频压迫
    const t = this.ctx.currentTime;
    this._tone(110, 0.4, "sawtooth", 0.32, t, this.sfxBus, 55);
    this._noiseBurst(0.3, 0.2, "lowpass", 500, 120, t);
  },
  elem_body() { // 体：沉稳击打
    const t = this.ctx.currentTime;
    this._tone(220, 0.14, "square", 0.24, t, this.sfxBus, 90);
    this._noiseBurst(0.08, 0.14, "lowpass", 800, 300, t);
  },

  // SFX-04 破劫演出：劫雷 + 榜文嗡鸣 + 破劫成功清越音
  tribulation_rumble() {
    this._noiseBurst(2.2, 0.5, "lowpass", 600, 60);
    this._tone(50, 2.0, "sine", 0.3, this.ctx.currentTime, this.sfxBus, 34);
  },
  seal_hum() { // 榜文嗡鸣
    const t = this.ctx.currentTime;
    this._tone(196, 1.2, "sine", 0.16, t, this.sfxBus);
    this._tone(294, 1.2, "sine", 0.1, t, this.sfxBus);
  },
  tribulation_success() { // 清越音（钟铃）
    const t = this.ctx.currentTime;
    this._tone(1046, 0.9, "sine", 0.3, t, this.sfxBus);
    this._tone(1568, 0.9, "sine", 0.16, t, this.sfxBus);
    this._tone(2093, 0.7, "sine", 0.1, t + 0.02, this.sfxBus);
  },

  // SFX-05 机缘：清脆提示（大三和弦琶音）
  fortune() {
    const t = this.ctx.currentTime;
    this._tone(784, 0.4, "sine", 0.24, t, this.sfxBus);          // G5
    this._tone(988, 0.4, "sine", 0.22, t + 0.09, this.sfxBus);   // B5
    this._tone(1318, 0.5, "sine", 0.2, t + 0.18, this.sfxBus);   // E6
  },

  // SFX-06 境界提升：上行清越音（与破劫区分：更亮、上行）
  realm_up() {
    const t = this.ctx.currentTime;
    this._tone(523, 0.3, "triangle", 0.24, t, this.sfxBus);          // C5
    this._tone(659, 0.3, "triangle", 0.24, t + 0.1, this.sfxBus);    // E5
    this._tone(784, 0.3, "triangle", 0.24, t + 0.2, this.sfxBus);    // G5
    this._tone(1046, 0.55, "triangle", 0.26, t + 0.3, this.sfxBus);  // C6
  },

  // SFX-07 发现秘境：发现提示（与机缘区分：双音下探+回响）
  secret_found() {
    const t = this.ctx.currentTime;
    this._tone(880, 0.35, "sine", 0.24, t, this.sfxBus, 660);
    this._tone(1174, 0.5, "sine", 0.18, t + 0.12, this.sfxBus, 880);
  },

  // 通用 UI 轻反馈
  ui_click() {
    this._tone(660, 0.07, "sine", 0.14, this.ctx.currentTime, this.sfxBus, 520);
  },
};

// 元素 → SFX id 映射（SFX-03）。spell_type: body/thunder/fire/weapon/soul/calamity。
AudioManager.elementSfx = function (spellType) {
  const map = {
    thunder: "elem_thunder",
    fire: "elem_fire",
    weapon: "elem_weapon",
    soul: "elem_soul",
    calamity: "elem_calamity",
    body: "elem_body",
  };
  return map[spellType] || "elem_body";
};

// ================= 环境音床合成配方（音效需求.md §1） =================
// 每个配方返回 { stop() }：ramp 顶层 gain 到 0 → stop sources → 清调度。
// reducedMotion 时关闭周期调度（滴水/噼啪闪烁），保留稳定音床。

AudioManager._makeAmbientStop = function (topGain, sources, timers, stopped) {
  const self = this;
  return function () {
    if (stopped) stopped.stopped = true; // 通知周期回调（drip/roll/crackle）停止自重排
    timers.forEach((tm) => clearTimeout(tm));
    timers.length = 0;
    if (!self.ctx) { sources.forEach((s) => { try { s.stop(); } catch (e) {} }); return; }
    const t = self.ctx.currentTime;
    try {
      topGain.gain.cancelScheduledValues(t);
      topGain.gain.setValueAtTime(topGain.gain.value, t);
      topGain.gain.linearRampToValueAtTime(0.0001, t + 0.6);
    } catch (e) { /* ignore */ }
    sources.forEach((s) => {
      try { s.stop(t + 0.7); } catch (e) { /* 已停 */ }
    });
    setTimeout(() => { try { topGain.disconnect(); } catch (e) {} }, 800);
  };
};

const AMBIENT_RECIPES = {
  // AMB-01 山野洞府：低沉山风 + 洞内滴水
  amb_mountain() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const top = ctx.createGain();
    top.gain.setValueAtTime(0.0001, t);
    top.gain.linearRampToValueAtTime(0.5, t + 2.5);
    top.connect(this.ambientBus);
    const sources = [];
    // 山风：低通噪声 + 慢 LFO
    const wind = ctx.createBufferSource();
    wind.buffer = this.noiseBuffer; wind.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 380;
    const wg = ctx.createGain(); wg.gain.value = 0.5;
    wind.connect(lp); lp.connect(wg); wg.connect(top);
    wind.start();
    sources.push(wind);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08;
    const lfoG = ctx.createGain(); lfoG.gain.value = 140;
    lfo.connect(lfoG); lfoG.connect(lp.frequency);
    lfo.start(); sources.push(lfo);
    // 洞内滴水（周期调度，reducedMotion 时关闭）
    const timers = [];
    const stopped = { stopped: false };
    const self = this;
    if (!this.reducedMotion) {
      const drip = () => {
        if (stopped.stopped) return;
        const dt = ctx.currentTime;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.setValueAtTime(900 + Math.random() * 400, dt);
        o.frequency.exponentialRampToValueAtTime(300, dt + 0.1);
        g.gain.setValueAtTime(0.0001, dt);
        g.gain.exponentialRampToValueAtTime(0.12, dt + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.2);
        o.connect(g); g.connect(top);
        o.start(dt); o.stop(dt + 0.25);
        timers.push(setTimeout(drip, 2500 + Math.random() * 4000));
      };
      timers.push(setTimeout(drip, 1500));
    }
    return { stop: this._makeAmbientStop(top, sources, timers, stopped) };
  },

  // AMB-02 陈塘关外围：海风 + 潮声 + 远处雷声
  amb_chentang() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const top = ctx.createGain();
    top.gain.setValueAtTime(0.0001, t);
    top.gain.linearRampToValueAtTime(0.5, t + 2.5);
    top.connect(this.ambientBus);
    const sources = [];
    // 海风/潮声：带通噪声 + 较慢 LFO（潮涌）
    const wind = ctx.createBufferSource();
    wind.buffer = this.noiseBuffer; wind.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 600; bp.Q.value = 0.5;
    const wg = ctx.createGain(); wg.gain.value = 0.45;
    wind.connect(bp); bp.connect(wg); wg.connect(top);
    wind.start(); sources.push(wind);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.15;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.2;
    const tideG = ctx.createGain(); tideG.gain.value = 0.45;
    lfo.connect(lfoG); lfoG.connect(tideG.gain);
    wg.disconnect(); wg.connect(tideG); tideG.connect(top);
    lfo.start(); sources.push(lfo);
    // 远处雷声（周期，reducedMotion 关闭）
    const timers = [];
    const stopped = { stopped: false };
    const self = this;
    if (!this.reducedMotion) {
      const roll = () => {
        if (stopped.stopped) return;
        const dt = ctx.currentTime;
        const src = ctx.createBufferSource();
        src.buffer = self.noiseBuffer;
        const lp = ctx.createBiquadFilter(); lp.type = "lowpass";
        lp.frequency.setValueAtTime(500, dt);
        lp.frequency.exponentialRampToValueAtTime(70, dt + 1.6);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, dt);
        g.gain.exponentialRampToValueAtTime(0.22, dt + 0.1);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 1.7);
        src.connect(lp); lp.connect(g); g.connect(top);
        src.start(dt); src.stop(dt + 1.8);
        timers.push(setTimeout(roll, 6000 + Math.random() * 8000));
      };
      timers.push(setTimeout(roll, 3000));
    }
    return { stop: this._makeAmbientStop(top, sources, timers, stopped) };
  },

  // AMB-03 骷髅山边界：阴风 + 低频压迫 + 阴火噼啪
  amb_kulou() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const top = ctx.createGain();
    top.gain.setValueAtTime(0.0001, t);
    top.gain.linearRampToValueAtTime(0.5, t + 2.5);
    top.connect(this.ambientBus);
    const sources = [];
    // 低频压迫 drone
    const drone = ctx.createOscillator();
    drone.type = "sine"; drone.frequency.value = 55;
    const dg = ctx.createGain(); dg.gain.value = 0.22;
    drone.connect(dg); dg.connect(top);
    drone.start(); sources.push(drone);
    // 阴风：低通噪声
    const wind = ctx.createBufferSource();
    wind.buffer = this.noiseBuffer; wind.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 260;
    const wg = ctx.createGain(); wg.gain.value = 0.4;
    wind.connect(lp); lp.connect(wg); wg.connect(top);
    wind.start(); sources.push(wind);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.06;
    const lfoG = ctx.createGain(); lfoG.gain.value = 90;
    lfo.connect(lfoG); lfoG.connect(lp.frequency);
    lfo.start(); sources.push(lfo);
    // 阴火噼啪（周期高通短爆，reducedMotion 关闭）
    const timers = [];
    const stopped = { stopped: false };
    const self = this;
    if (!this.reducedMotion) {
      const crackle = () => {
        if (stopped.stopped) return;
        const dt = ctx.currentTime;
        const src = ctx.createBufferSource();
        src.buffer = self.noiseBuffer;
        const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 2200;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, dt);
        g.gain.exponentialRampToValueAtTime(0.1, dt + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, dt + 0.08);
        src.connect(hp); hp.connect(g); g.connect(top);
        src.start(dt); src.stop(dt + 0.1);
        timers.push(setTimeout(crackle, 700 + Math.random() * 2200));
      };
      timers.push(setTimeout(crackle, 1000));
    }
    return { stop: this._makeAmbientStop(top, sources, timers, stopped) };
  },

  // AMB-04 破劫/杀阵：劫云低频 + 紧张颤音
  amb_tribulation() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const top = ctx.createGain();
    top.gain.setValueAtTime(0.0001, t);
    top.gain.linearRampToValueAtTime(0.5, t + 1.2);
    top.connect(this.ambientBus);
    const sources = [];
    // 劫云低频
    const drone = ctx.createOscillator();
    drone.type = "sawtooth"; drone.frequency.value = 48;
    const dlp = ctx.createBiquadFilter(); dlp.type = "lowpass"; dlp.frequency.value = 160;
    const dg = ctx.createGain(); dg.gain.value = 0.2;
    drone.connect(dlp); dlp.connect(dg); dg.connect(top);
    drone.start(); sources.push(drone);
    // 紧张弦乐颤音（tremolo）
    const str = ctx.createOscillator();
    str.type = "sawtooth"; str.frequency.value = 220;
    const slp = ctx.createBiquadFilter(); slp.type = "lowpass"; slp.frequency.value = 900;
    const sg = ctx.createGain(); sg.gain.value = 0.08;
    const trem = ctx.createOscillator(); trem.frequency.value = 7;
    const tremG = ctx.createGain(); tremG.gain.value = 0.05;
    trem.connect(tremG); tremG.connect(sg.gain);
    str.connect(slp); slp.connect(sg); sg.connect(top);
    str.start(); trem.start();
    sources.push(str, trem);
    return { stop: this._makeAmbientStop(top, sources, []) };
  },
};

// 场景/境界 → 环境音 id 映射（供 WorldScroll/Game 调用）。
AudioManager.ambientForRealm = function (realmId) {
  // 骷髅山界（地仙 dx_01 起）→ 骷髅山；真人境（zr_03 起，陈塘）→ 陈塘；其余 → 山野。
  const rid = String(realmId || "");
  if (rid.indexOf("dx_") === 0) return "amb_kulou";
  if (rid.indexOf("zr_") === 0) {
    const n = parseInt(rid.split("_")[1], 10) || 0;
    return n >= 3 ? "amb_chentang" : "amb_mountain";
  }
  return "amb_mountain";
};
