/* 封神修道录 · CraftMinigame — 生活技艺的"火候时机条"（炼丹控火 / 画符蓄力）
 * 一个光标在条上左右游走，玩家看准时机按下停手；停在中段→上品，偏外→中品/下品。
 * 这是"手感操作"，不是点按钮出数字——呼应 design/6.0 的留白与气韵。
 */
"use strict";

const CraftMinigame = {
  active: false,
  raf: null,
  pos: 0,
  dir: 1,
  speed: 1.1,
  boost: false,
  onDone: null,
  _bound: false,

  open(opts, cb) {
    opts = opts || {};
    this.onDone = cb || null;
    this.active = true;
    this.pos = 0;
    this.dir = 1;
    this.speed = num(opts.speed, 1.1);
    this.boost = !!opts.boost;
    const layer = $("craft-layer");
    layer.classList.remove("hidden");
    void layer.offsetWidth;
    layer.classList.add("on");
    $("craft-title").textContent = opts.title || "炉火";
    $("craft-prompt").textContent = opts.prompt || "看准火候，按下停手";
    $("craft-result").textContent = "";
    $("craft-result").className = "craft-result";
    const zone = $("craft-zone");
    if (zone) zone.className = "craft-zone";
    this._bindOnce();
    this._loop();
  },

  _bindOnce() {
    if (this._bound) return;
    this._bound = true;
    $("craft-stop").addEventListener("click", () => this.stop());
    // 点按整个条也能停（移动端友好）
    $("craft-bar").addEventListener("click", () => this.stop());
  },

  _loop() {
    if (!this.active) return;
    this.pos += this.dir * this.speed;
    if (this.pos >= 100) { this.pos = 100; this.dir = -1; }
    if (this.pos <= 0) { this.pos = 0; this.dir = 1; }
    const marker = $("craft-marker");
    if (marker) marker.style.left = this.pos + "%";
    this.raf = requestAnimationFrame(() => this._loop());
  },

  stop() {
    if (!this.active) return;
    this.active = false;
    cancelAnimationFrame(this.raf);
    const d = Math.abs(this.pos - 50);
    const shangZone = this.boost ? 22 : 15;
    const zhongZone = this.boost ? 38 : 30;
    const q = d <= shangZone ? "shang" : d <= zhongZone ? "zhong" : "xia";
    const qdef = (typeof CRAFT_QUALITY !== "undefined" && CRAFT_QUALITY[q]) ? CRAFT_QUALITY[q] : { name: "中品" };
    const zone = $("craft-zone");
    if (zone) zone.classList.add("flash-" + q);
    const res = $("craft-result");
    if (res) { res.textContent = qdef.name; res.classList.add("show", "q-" + q); }
    setTimeout(() => {
      const layer = $("craft-layer");
      layer.classList.remove("on");
      setTimeout(() => layer.classList.add("hidden"), 500);
      const cb = this.onDone; this.onDone = null;
      if (cb) cb(q);
    }, 750);
  },
};
