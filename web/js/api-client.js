"use strict";
// ============================================================================
// web/js/api-client.js —— 客户端通信层（design/20.0 Step5）
//
// 两个全局：
//   ApiClient      —— 与服务端 REST API 通信（注册/登录/读写state/核心操作）。
//   ApiSaveManager —— SaveManager 的「服务端后端」：read() 同步返回登录后预取的
//                     state 缓存；write() 异步 PUT 回服务端（防抖批量）。
//                     经 SaveManager.useBackend(ApiSaveManager) 注入，game.js 零改动。
//
// 设计要点（反作弊基石）：登录后游戏 state 的唯一真相在服务端 MongoDB；
// localStorage 里即便篡改 state 也无效——boot 时一律从服务端拉取覆盖。
// token 存 localStorage（xxg_token），与游戏存档键完全分离。
// ============================================================================

const ApiClient = (() => {
  // API 基址优先级：localStorage 覆盖 > 运行时配置(window.XXG_CONFIG.apiBase) > 默认本地 :3000。
  // 生产经 Nginx 同源反代时，deploy/config.js 设 window.XXG_CONFIG = { apiBase: "" }（同源）。
  const DEFAULT_BASE = "http://localhost:3000";
  function base() {
    try {
      if (typeof localStorage !== "undefined" && localStorage.getItem("xxg_api_base")) {
        return localStorage.getItem("xxg_api_base");
      }
    } catch (e) { /* ignore */ }
    if (typeof window !== "undefined" && window.XXG_CONFIG && typeof window.XXG_CONFIG.apiBase === "string") {
      return window.XXG_CONFIG.apiBase;
    }
    return DEFAULT_BASE;
  }

  const TOKEN_KEY = "xxg_token";
  const PLAYER_KEY = "xxg_player";

  function getToken() { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } }
  function setToken(t) { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ } }
  function getPlayer() { try { const s = localStorage.getItem(PLAYER_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function setPlayer(p) { try { p ? localStorage.setItem(PLAYER_KEY, JSON.stringify(p)) : localStorage.removeItem(PLAYER_KEY); } catch (e) { /* ignore */ } }

  async function request(method, path, body, useAuth) {
    const headers = { "content-type": "application/json" };
    if (useAuth) {
      const t = getToken();
      if (t) headers.authorization = "Bearer " + t;
    }
    const res = await fetch(base() + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* 非 JSON */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || ("HTTP " + res.status));
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  return {
    base,
    getToken, setToken, getPlayer, setPlayer,
    isLoggedIn() { return !!getToken(); },
    logout() { setToken(null); setPlayer(null); },

    // —— 认证 ——
    async register(phone, email, password) {
      const r = await request("POST", "/api/auth/register", { phone, email, password }, false);
      setToken(r.token); setPlayer(r.player);
      return r;
    },
    async login(phone, email, password) {
      const r = await request("POST", "/api/auth/login", { phone, email, password }, false);
      setToken(r.token); setPlayer(r.player);
      return r;
    },

    // —— state 读写 ——
    async getState() { return request("GET", "/api/state", undefined, true); },
    async putState(state) { return request("PUT", "/api/state", { state }, true); },

    // —— 核心操作（Step6 反作弊：UI 改由服务端权威执行时调用）——
    async opTick() { return request("POST", "/api/action/tick", {}, true); },
    async opLevelUp() { return request("POST", "/api/progress/levelup", {}, true); },
    async opBreakthrough() { return request("POST", "/api/progress/breakthrough", {}, true); },
    async opBossBattle(bossId) { return request("POST", "/api/battle/boss", { bossId }, true); },
  };
})();

// SaveManager 服务端后端：read 同步（返回预取缓存），write 异步 PUT（防抖）。
const ApiSaveManager = (() => {
  let cache = null;        // state 的 JSON 字符串缓存
  let timer = null;        // 防抖定时器
  const DEBOUNCE_MS = 400; // 批量高频 save（tick/连点），尾随刷新

  function flush() {
    timer = null;
    if (cache == null) return;
    let state;
    try { state = JSON.parse(cache); } catch (e) { return; }
    ApiClient.putState(state).catch((e) => {
      console.warn("[ApiSaveManager] 上传 state 失败：", e && e.message ? e.message : e);
    });
  }

  return {
    // 登录成功后由 boot 调用：注入服务端拉取的 state（对象或 null）。
    setInitial(stateObj) {
      cache = stateObj == null ? null : JSON.stringify(stateObj);
    },
    read() { return cache; },
    write(text) {
      cache = text;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, DEBOUNCE_MS);
    },
    clear() { cache = null; },
    // 立即刷新（如关闭页面前）
    flushNow() { if (timer) { clearTimeout(timer); flush(); } },
  };
})();
