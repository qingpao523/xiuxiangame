"use strict";
// ============================================================================
// server/src/middleware/rate-limit.js —— 频率限制（design/20.0 Step6 反作弊）
// 滑动窗口日志（进程内 Map，key -> 时间戳数组），按 key 限流，超限返回 429。
// 相比固定窗口，滑动窗口消除「窗口边界双倍突发」缺陷（跨边界 2×max 连发）。
// 生产多实例部署可换 Redis 后端（ZSET 存时间戳）；当前单实例正确性优先。
// ============================================================================

// 创建一个限流中间件：任意 windowMs 滑动窗口内最多 max 次。
// keyFn(req) 决定限流粒度（默认按玩家 sub；未鉴权路由可传 ip 粒度）。
function rateLimit({ windowMs = 60000, max = 60, keyFn = null } = {}) {
  const hits = new Map(); // key -> number[]（窗口内请求时间戳，升序）
  // 惰性清理过期键，避免无限增长
  setInterval(() => {
    const now = Date.now();
    for (const [k, arr] of hits) {
      while (arr.length && arr[0] <= now - windowMs) arr.shift();
      if (!arr.length) hits.delete(k);
    }
  }, windowMs).unref?.();

  return function (req, res, next) {
    const id = keyFn ? keyFn(req) : (req.player && req.player.sub) || req.ip || "anon";
    const key = id + ":" + req.baseUrl + req.path;
    const now = Date.now();
    let arr = hits.get(key);
    if (!arr) { arr = []; hits.set(key, arr); }
    // 丢弃滑出窗口的旧时间戳
    while (arr.length && arr[0] <= now - windowMs) arr.shift();
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - arr.length)));
    if (arr.length >= max) {
      // 最早一次请求滑出窗口的时刻即为可重试时刻
      const retryAt = arr[0] + windowMs;
      res.setHeader("Retry-After", String(Math.ceil((retryAt - now) / 1000)));
      return res.status(429).json({ error: "rate limit exceeded", retryAfterMs: retryAt - now });
    }
    arr.push(now);
    next();
  };
}

// 鉴权路由按 IP 限流（注册/登录防暴力破解），无 token 也能限。
const authLimiter = rateLimit({ windowMs: 60000, max: 20, keyFn: (req) => "ip:" + (req.ip || "anon") });

module.exports = { rateLimit, authLimiter };
