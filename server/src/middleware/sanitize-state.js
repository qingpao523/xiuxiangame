"use strict";
// ============================================================================
// server/src/middleware/sanitize-state.js —— state 入参校验（design/20.0 Step6 反作弊）
// 客户端经 PUT /api/state 上传整份 state。经济权威在服务端 ops（战斗/升重/破劫奖励
// 都由服务端结算），此处做结构卫生：资源须为有限非负数且不超过上限，realm_id 须合法，
// 拦截明显的篡改/脏数据（负数、NaN、Infinity、天文数字）。
// ============================================================================

const MAX_RESOURCE = 1e12; // 单种资源上限（远超正常 7 天流程产出）

// 校验并净化 state；返回 { ok, state?, error? }。不修改原对象的合法字段，非法资源被钳制。
function sanitizeState(state) {
  if (state === null || typeof state !== "object" || Array.isArray(state)) {
    return { ok: false, error: "state must be an object" };
  }
  if (state.realm_id != null && !/^rq_\d+$/.test(String(state.realm_id))) {
    return { ok: false, error: "invalid realm_id" };
  }
  const res = state.resources;
  if (res != null) {
    if (typeof res !== "object" || Array.isArray(res)) return { ok: false, error: "resources must be an object" };
    for (const k of Object.keys(res)) {
      let v = Number(res[k]);
      if (!Number.isFinite(v)) return { ok: false, error: `resource ${k} is not a finite number` };
      if (v < 0) v = 0;
      if (v > MAX_RESOURCE) v = MAX_RESOURCE;
      res[k] = v;
    }
  }
  return { ok: true, state };
}

module.exports = { sanitizeState, MAX_RESOURCE };
