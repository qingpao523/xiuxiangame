/* 封神修道录 · ScrollScene — 可复用的画卷式沉浸演出引擎
 * 由 opening_prototype.html 验证后抽取。数据驱动：传入 {beats:[...]} 即播放。
 *
 * beat 类型：
 *   {t:"black",  lines:[...], dwell:ms}                 纯黑 + 文字渐显
 *   {t:"scene",  bg:"cave|vista|gold|dawn|void", fx:"mist|glow|cleanse|rise|converge|flash", lines:[...], dwell:ms}
 *   {t:"hold",   prompt:"按住…", hold:ms, lines:[...]}   按住交互，按满自动进入下一拍
 *   {t:"end",    word:"真人", sub:"…"}                   终拍，显示一个词 + 副题
 *
 * lines 元素可为字符串，或 {text, cls}（cls: faint/small/gold）
 */
"use strict";

const ScrollScene = {
  playing: false,
  beats: [],
  idx: 0,
  onDone: null,
  canAdvance: false,
  holdRAF: null,
  holding: false,
  holdStart: 0,
  holdNeed: 0,
  timers: [],

  play(script, doneCb) {
    if (!script || !script.beats || !script.beats.length) { if (doneCb) doneCb(); return; }
    this.beats = script.beats;
    this.idx = 0;
    this.onDone = doneCb || null;
    this.playing = true;
    const layer = $("ss-layer");
    layer.classList.remove("hidden");
    layer.classList.add("on");
    this._bindOnce();
    this._playBeat();
  },

  _bindOnce() {
    if (this._bound) return;
    this._bound = true;
    const layer = $("ss-layer");
    const down = (e) => { if (this.playing && this.beats[this.idx] && this.beats[this.idx].t === "hold") { e.preventDefault(); this._startHold(); } };
    const up = () => {
      if (!this.playing) return;
      const beat = this.beats[this.idx];
      if (beat && beat.t === "hold") { this._endHold(); }
      else if (this.canAdvance) { this._next(); }
    };
    layer.addEventListener("mousedown", down);
    layer.addEventListener("touchstart", down, { passive: false });
    window.addEventListener("mouseup", up);
    window.addEventListener("touchend", up);
    // 跳过按钮
    const skip = $("ss-skip");
    if (skip) skip.addEventListener("click", (e) => { e.stopPropagation(); this.skip(); });
  },

  _clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; },
  _later(fn, ms) { const id = setTimeout(fn, ms); this.timers.push(id); return id; },

  _playBeat() {
    if (!this.playing) return;
    if (this.idx >= this.beats.length) { this._finish(); return; }
    this.canAdvance = false;
    const stage = $("ss-stage");
    stage.innerHTML = "";
    const beat = this.beats[this.idx];
    $("ss-hint").classList.remove("show");
    const skip = $("ss-skip"); if (skip) skip.classList.remove("show");

    if (beat.t === "end") { this._renderEnd(stage, beat); return; }

    const scene = document.createElement("div");
    scene.className = "ss-scene ss-bg-" + (beat.bg || "black") + (beat.fx ? " ss-fx-" + beat.fx : "");
    stage.appendChild(scene);

    // 文字容器
    const box = document.createElement("div");
    box.className = "ss-lines";
    scene.appendChild(box);
    const lines = beat.lines || [];
    let delay = 500;
    lines.forEach((ln) => {
      const el = document.createElement("div");
      const text = typeof ln === "string" ? ln : ln.text;
      const cls = typeof ln === "string" ? "" : ln.cls;
      el.className = "ss-line" + (cls ? " ss-" + cls : "");
      el.textContent = text;
      box.appendChild(el);
      this._later(() => el.classList.add("show"), delay);
      delay += 1900;
    });

    if (beat.t === "hold") {
      this._renderHold(scene, beat, delay);
      return; // hold 自己控制推进
    }

    // 普通拍：文字走完后，允许轻触继续（或自动推进）
    const readyAt = delay + (beat.dwell != null ? beat.dwell : 700);
    this._later(() => {
      if (!this.playing) return;
      if (beat.auto) { this._next(); }
      else {
        this.canAdvance = true;
        $("ss-hint").classList.add("show");
        if (skip) skip.classList.add("show");
      }
    }, readyAt);
  },

  _renderHold(scene, beat, delay) {
    const ring = document.createElement("div"); ring.className = "ss-ring";
    const core = document.createElement("div"); core.className = "ss-core";
    const word = document.createElement("div"); word.className = "ss-hold-word";
    word.textContent = beat.prompt || "按住";
    scene.append(ring, core, word);
    this._later(() => { word.classList.add("show"); }, delay);
    this.holdNeed = beat.hold || 3000;
    this._ring = ring; this._holdWord = word;
    // hold 交互由 _startHold/_endHold 处理；按满后展示 lines 剩余并推进
    this._holdBeat = beat;
    this._holdDelayBase = delay;
  },

  _startHold() {
    if (this.holding || !this._ring) return;
    this.holding = true;
    this.holdStart = performance.now();
    if (this._holdWord) this._holdWord.textContent = "……";
    if (typeof AudioManager !== "undefined") AudioManager.playSfx("breath_in"); // SFX-02 吸气渐强
    this._tickHold();
  },

  _tickHold() {
    if (!this.holding) return;
    const t = performance.now() - this.holdStart;
    const scale = Math.min(1.7, 0.4 + (t / this.holdNeed) * 1.3);
    this._ring.style.transform = "translate(-50%,-50%) scale(" + scale + ")";
    this._ring.style.opacity = String(0.5 + (t / this.holdNeed) * 0.4);
    if (t >= this.holdNeed) { this._completeHold(); return; }
    this.holdRAF = requestAnimationFrame(() => this._tickHold());
  },

  _endHold() {
    if (!this.holding) return;
    this.holding = false;
    cancelAnimationFrame(this.holdRAF);
    const t = performance.now() - this.holdStart;
    if (t < this.holdNeed && this._ring) {
      // 没按满，收回
      this._ring.style.transform = "translate(-50%,-50%) scale(.4)";
      this._ring.style.opacity = ".5";
      if (this._holdWord) this._holdWord.textContent = this._holdBeat.prompt || "按住";
    }
  },

  _completeHold() {
    this.holding = false;
    cancelAnimationFrame(this.holdRAF);
    if (typeof AudioManager !== "undefined") AudioManager.playSfx("breath_out"); // SFX-02 呼气释放
    if (this._ring) { this._ring.style.transform = "translate(-50%,-50%) scale(2)"; this._ring.style.opacity = "0"; }
    if (this._holdWord) this._holdWord.classList.remove("show");
    // 展示 hold 拍的文字
    const beat = this._holdBeat;
    const scene = $("ss-stage").querySelector(".ss-scene");
    if (scene && beat.lines) {
      const box = scene.querySelector(".ss-lines");
      let d = 300;
      beat.lines.forEach((ln) => {
        const el = document.createElement("div");
        el.className = "ss-line" + (typeof ln === "string" ? "" : " ss-" + ln.cls);
        el.textContent = typeof ln === "string" ? ln : ln.text;
        box.appendChild(el);
        this._later(() => el.classList.add("show"), d);
        d += 1900;
      });
      this._later(() => { if (this.playing) this._next(); }, d + 900);
    } else {
      this._later(() => { if (this.playing) this._next(); }, 1400);
    }
  },

  _renderEnd(stage, beat) {
    const wrap = document.createElement("div");
    wrap.className = "ss-scene ss-bg-" + (beat.bg || "void") + " ss-end";
    const word = document.createElement("div");
    word.className = "ss-end-word";
    word.textContent = beat.word || "";
    wrap.appendChild(word);
    if (beat.sub) {
      const sub = document.createElement("div");
      sub.className = "ss-end-sub";
      sub.textContent = beat.sub;
      wrap.appendChild(sub);
      this._later(() => sub.classList.add("show"), 2600);
    }
    stage.appendChild(wrap);
    this._later(() => word.classList.add("show"), 600);
    this._later(() => {
      if (!this.playing) return;
      this.canAdvance = true;
      $("ss-hint").classList.add("show");
    }, beat.sub ? 4200 : 2600);
  },

  _next() {
    if (!this.playing) return;
    this.idx++;
    this._playBeat();
  },

  skip() { this._finish(); },

  _finish() {
    this.playing = false;
    this.canAdvance = false;
    this._clearTimers();
    cancelAnimationFrame(this.holdRAF);
    const layer = $("ss-layer");
    layer.classList.remove("on");
    this._later(() => layer.classList.add("hidden"), 900);
    const cb = this.onDone; this.onDone = null;
    if (cb) this._later(cb, 950);
  },
};
