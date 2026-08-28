"use strict";
// ============================================================================
// web/config.js —— 客户端运行时配置（design/20.0 Step6 部署）
// 必须在 api-client.js 之前加载。自动判定 API 基址：
//   - 开发：页面跑在本地静态服（localhost / 127.0.0.1）→ API 在 :3000。
//   - 生产：经 Nginx 同源反代（公网域名）→ apiBase="" 走同源 /api。
// 亦可经 localStorage.xxg_api_base 手动覆盖（调试用）。
// ============================================================================
(function () {
  var host = (typeof location !== "undefined" && location.hostname) || "";
  var isLocal = host === "localhost" || host === "127.0.0.1" || host === "";
  window.XXG_CONFIG = {
    apiBase: isLocal ? "http://localhost:3000" : "",
  };
})();
