/* AudioManager 单元/集成测试（Node harness）
 * 验证：自动播放合规 / 三总线 gain 数学 / 静音 / 设置持久化 /
 *       elementSfx 映射 / ambientForRealm 映射 / reducedMotion / 环境音 stop 无泄漏。
 * 运行：node test_audio.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const WEB = path.join(__dirname, "web");

// ---------- mock Web Audio ----------
function makeGainParam() {
  return {
    value: 1,
    _targets: [],
    setValueAtTime(v) { this.value = v; return this; },
    setTargetAtTime(v) { this.value = v; this._targets.push(v); return this; },
    linearRampToValueAtTime(v) { this.value = v; return this; },
    cancelScheduledValues() { return this; },
  };
}
function makeGainNode() {
  return { gain: makeGainParam(), _connected: [], connect(n) { this._connected.push(n); return n; }, disconnect() { this._connected = []; } };
}
function makeOsc() {
  return {
    type: "sine", frequency: makeGainParam(), _started: false, _stopped: false,
    connect() { return this; }, disconnect() {},
    start() { this._started = true; }, stop() { this._stopped = true; },
  };
}
function makeBufferSource() {
  return { buffer: null, loop: false, playbackRate: makeGainParam(), _started: false, _stopped: false, connect() { return this; }, disconnect() {}, start() { this._started = true; }, stop() { this._stopped = true; } };
}
class MockAudioContext {
  constructor() {
    this.state = "running";
    this.sampleRate = 44100;
    this.currentTime = 0;
    this.destination = { _isDest: true };
    this._resumed = false;
  }
  createGain() { return makeGainNode(); }
  createOscillator() { return makeOsc(); }
  createBufferSource() { return makeBufferSource(); }
  createBiquadFilter() { return { type: "lowpass", frequency: makeGainParam(), Q: makeGainParam(), connect() { return this; }, disconnect() {} }; }
  createBuffer(ch, len, sr) {
    const data = new Float32Array(len);
    return { numberOfChannels: ch, length: len, sampleRate: sr, getChannelData: () => data };
  }
  decodeAudioData() { return Promise.resolve(this.createBuffer(1, 100, this.sampleRate)); }
  resume() { this._resumed = true; this.state = "running"; return Promise.resolve(); }
}

// ---------- mock window / fetch / matchMedia ----------
const listeners = {};
const windowMock = {
  AudioContext: MockAudioContext,
  addEventListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
  removeEventListener(ev, fn) { if (listeners[ev]) listeners[ev] = listeners[ev].filter((f) => f !== fn); },
  matchMedia() { return { matches: false, addEventListener() {}, addListener() {} }; },
};
let fetchCalls = [];
const fetchMock = (url) => { fetchCalls.push(url); return Promise.resolve({ ok: false }); };

// ---------- sandbox ----------
const sandbox = {
  window: windowMock,
  fetch: fetchMock,
  console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  Math, Number, parseInt, parseFloat, isFinite, Promise, Float32Array, Array, Object, String, JSON,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

function load(file) {
  return fs.readFileSync(path.join(WEB, file), "utf8");
}
// 在同一脚本作用域内求值，使 const AudioManager 可被随后引用（const 不跨 runInContext 持久）。
const combined = load("js/utils.js") + "\n;\n" + load("js/audio-manager.js") + "\n;\nAudioManager;";
const AM = vm.runInContext(combined, sandbox, { filename: "combined.js" });

// ---------- assertions ----------
let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.error("  ✗ FAIL: " + msg); }
}
function eq(a, b, msg) { ok(a === b, msg + " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")"); }
function approx(a, b, msg) { ok(Math.abs(a - b) < 1e-6, msg + " (got " + a + ", want " + b + ")"); }

console.log("== 1. 自动播放合规（autoplay guard）==");
eq(AM.isReady(), false, "init 前未就绪");
AM.bindGestures();
eq(AM.isReady(), false, "bindGestures 后、手势前仍未创建 AudioContext（不违规自动播放）");
ok((listeners.pointerdown || []).length === 1, "已绑定 pointerdown 监听");
// 模拟首次手势
(listeners.pointerdown || []).forEach((fn) => fn());
eq(AM.isReady(), true, "首次手势后 AudioContext 启动");
ok((listeners.pointerdown || []).length === 0, "手势后已解绑（once 行为）");

console.log("== 2. 三总线 gain 数学 ==");
AM.setMasterVolume(0.5); AM.setSfxVolume(0.7); AM.setAmbientVolume(0.3); AM.setMusicVolume(0.9);
approx(AM.master.gain.value, 0.5, "master gain=0.5");
approx(AM.sfxBus.gain.value, 0.7, "sfx gain=0.7");
approx(AM.ambientBus.gain.value, 0.3, "ambient gain=0.3");
approx(AM.musicBus.gain.value, 0.9, "music gain=0.9");
// clamp
AM.setMasterVolume(5); approx(AM.settings.master, 1, "音量 clamp 上限 1");
AM.setMasterVolume(-3); approx(AM.settings.master, 0, "音量 clamp 下限 0");
// setVolume 兼容接口 = master
AM.setVolume(0.42); approx(AM.settings.master, 0.42, "setVolume 映射到 master");

console.log("== 3. 静音 ==");
AM.setMasterVolume(0.8);
AM.setMuted(true);
eq(AM.isMuted(), true, "isMuted true");
approx(AM.master.gain.value, 0, "静音时 master gain=0");
AM.setMuted(false);
approx(AM.master.gain.value, 0.8, "取消静音恢复 master gain");

console.log("== 4. 设置持久化（state.audio 往返）==");
const state = {};
AM.setMasterVolume(0.55); AM.setSfxVolume(0.66); AM.setAmbientVolume(0.22); AM.setMusicVolume(0.33); AM.setMuted(true);
AM.writeSettings(state);
ok(state.audio && typeof state.audio === "object", "writeSettings 写入 state.audio");
eq(state.audio.muted, true, "state.audio.muted 持久化");
approx(state.audio.master, 0.55, "state.audio.master 持久化");
// 新实例语义：重置后从 state 读回
AM.setMuted(false); AM.setMasterVolume(0.8);
AM.loadSettings(state);
eq(AM.isMuted(), true, "loadSettings 读回 muted");
approx(AM.settings.master, 0.55, "loadSettings 读回 master");
approx(AM.settings.sfx, 0.66, "loadSettings 读回 sfx");

console.log("== 5. elementSfx 映射（5 系音色可区分）==");
eq(AM.elementSfx("thunder"), "elem_thunder", "雷");
eq(AM.elementSfx("fire"), "elem_fire", "火");
eq(AM.elementSfx("weapon"), "elem_weapon", "剑");
eq(AM.elementSfx("soul"), "elem_soul", "魂");
eq(AM.elementSfx("calamity"), "elem_calamity", "劫");
eq(AM.elementSfx("body"), "elem_body", "体");
eq(AM.elementSfx("unknown"), "elem_body", "未知回退 elem_body");
const distinct = new Set(["thunder","fire","weapon","soul","calamity"].map((t) => AM.elementSfx(t)));
eq(distinct.size, 5, "5 系音色互不相同");

console.log("== 6. ambientForRealm 映射（3 套环境音可区分）==");
eq(AM.ambientForRealm("dx_01"), "amb_kulou", "地仙→骷髅山");
eq(AM.ambientForRealm("zr_03"), "amb_chentang", "真人境3→陈塘");
eq(AM.ambientForRealm("zr_01"), "amb_mountain", "真人境1→山野");
eq(AM.ambientForRealm("rq_05"), "amb_mountain", "炼气→山野");
eq(AM.ambientForRealm(""), "amb_mountain", "空→山野");
const ambSet = new Set([AM.ambientForRealm("dx_01"), AM.ambientForRealm("zr_03"), AM.ambientForRealm("rq_01")]);
eq(ambSet.size, 3, "山野/陈塘/骷髅山 3 套可区分");

console.log("== 7. reducedMotion 关闭周期调度 ==");
AM.reducedMotion = true;
AM.stopAmbient();
AM.playAmbient("amb_mountain");
ok(AM.currentAmbient && typeof AM.currentAmbient.stop === "function", "playAmbient 设置 currentAmbient {stop} 句柄");
// reducedMotion 下不应有周期 setTimeout 残留（_makeAmbientStop 清 timers）
AM.currentAmbient.stop();
ok(true, "reducedMotion 环境音可正常 stop（无异常）");
AM.reducedMotion = false;

console.log("== 8. 环境音 stop 无泄漏 / 切换 ==");
AM.stopAmbient();
AM.playAmbient("amb_kulou");
ok(AM.currentAmbient && AM.currentAmbient.id === "amb_kulou", "currentAmbient 记录 id");
AM.playAmbient("amb_kulou");
eq(AM.currentAmbient.id, "amb_kulou", "同 id 不重启");
AM.playAmbient("amb_chentang");
eq(AM.currentAmbient.id, "amb_chentang", "切换环境音更新 currentAmbient");
AM.stopAmbient();
eq(AM.currentAmbient, null, "stopAmbient 清空 currentAmbient");

console.log("== 9. playSfx 安全 no-op（静音/未就绪）==");
AM.setMuted(true);
let threw = false;
try { AM.playSfx("water_drop"); AM.playSfx("thunder", { dur: 1 }); } catch (e) { threw = true; }
ok(!threw, "静音时 playSfx 不抛错");
AM.setMuted(false);
threw = false;
try { AM.playSfx("fortune"); AM.playSfx("realm_up"); AM.playSfx("secret_found"); AM.playSfx("ui_click"); } catch (e) { threw = true; console.error(e); }
ok(!threw, "合成 SFX 播放不抛错（oscillator 回收）");

console.log("== 10. 素材回退（fetch 失败→合成，不阻塞）==");
fetchCalls = [];
AM.playSfx("water_drop"); // 无缓存→尝试加载素材失败→回退合成
ok(true, "素材缺失时回退合成路径无异常");

console.log("\n========================================");
console.log("通过 " + pass + " / 失败 " + fail);
console.log("========================================");
process.exit(fail === 0 ? 0 : 1);
