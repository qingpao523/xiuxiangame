"use strict";
// ============================================================================
// server/src/middleware/rate-limit.js —— 频率限制（design/20.0 Step6 反作弊）
// 固定窗口计数器（进程内 Map），按 key 限流，超限返回 429。
// 生产多实例部署可换 Redis 后端；当前单实例正确性优先。
// ============================================================================

// 创建一个限流中间件：windowMs 窗口内最多 max 次。
// keyFn(req) 决定限流粒度（默认按玩家 sub；未鉴权路由可传 ip 粒度）。
function rateLimit({ windowMs = 60000, max = 60, keyFn = null } = {}) {
  const hits = new Map(); // key -> { count, resetAt }
  // 惰性清理过期键，避免无限增长
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, windowMs).unref?.();

  return function (req, res, next) {
    const id = keyFn ? keyFn(req) : (req.player && req.player.sub) || req.ip || "anon";
    const key = id + ":" + req.baseUrl + req.path;
    const now = Date.now();
    let slot = hits.get(key);
    if (!slot || slot.resetAt <= now) {
      slot = { count: 0, resetAt: now + windowMs };
      hits.set(key, slot);
    }
    slot.count += 1;
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - slot.count)));
    if (slot.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((slot.resetAt - now) / 1000)));
      return res.status(429).json({ error: "rate limit exceeded", retryAfterMs: slot.resetAt - now });
    }
    next();
  };
}

// 鉴权路由按 IP 限流（注册/登录防暴力破解），无 token 也能限。
const authLimiter = rateLimit({ windowMs: 60000, max: 20, keyFn: (req) => "ip:" + (req.ip || "anon") });

module.exports = { rateLimit, authLimiter };
