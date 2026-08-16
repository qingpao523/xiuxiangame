# 微信端发布评估与方案

## 结论（重要）

当前《封神修道录》是 **DOM/CSS 网页版**。微信**小游戏**运行环境没有 DOM，不能直接加载 `index.html`。因此：

- 如果这个 AppID 只能创建**小游戏**：必须做 Canvas 渲染层移植，不能直接发布。
- 如果可以用**小程序 + web-view**：最快 1-2 天可以跑通测试，把现有网页包进小程序。
- 你给的是“小游戏测试号”，请先在微信公众平台确认该 AppID 的**类目/编译类型**。如果只能用小游戏，我们就走 Canvas 移植路线；如果也可以建小程序，先用 web-view 验证玩法。

> 安全提醒：AppSecret 属于敏感凭证，不要把 AppSecret 提交到仓库。你已经把 AppSecret 发在对话里，建议在微信公众平台重置一次，并只用云函数环境变量保存。

---

## 路线 A：小程序 web-view（最快验证路径）

适用：确认 AppID 可以创建小程序，或重新注册一个小程序测试号。

1. 把 `web/` 部署到微信云托管/云开发静态托管，得到 `https://xxx.tcloudbaseapp.com/` 或云托管域名。
2. 在小程序后台配置 **业务域名** 为该 HTTPS 域名。
3. 用 `wechat/miniprogram-webview/` 作为小程序壳工程，把 `gameUrl` 改成实际域名。
4. 微信开发者工具打开该项目，即可在 web-view 中运行当前网页版。

注意：
- web-view 会加载远程 H5，包体很小，但 80MB 素材首次加载慢，需要先做图片压缩/懒加载。
- 微信浏览器兼容性较好，现有 `localStorage`、`fetch` 基本可用，但正式版仍要替换为云存档。

## 路线 B：小游戏 Canvas 移植（正式路线）

适用：确认 AppID 只能创建小游戏，且目标是长期微信小游戏版本。

需要做：

1. **资产瘦身**：当前 `web/assets` 约 80MB，小游戏主包限制 4MB。先转 WebP/压缩，再把背景/立绘改远程下载。
2. **运行环境适配**：
   - `wx.createCanvas()` 作为唯一渲染表面；
   - `wx.getStorageSync/setStorageSync` 替代 localStorage；
   - `wx.request` 替代 fetch；
   - 文件系统与下载管理替代浏览器资源加载。
3. **渲染层重写**：
   - 主界面、资源条、进度条、按钮 → Canvas 2D 自绘；
   - 弹窗/面板 → Canvas 浮层；
   - 封神图卷/山河图 → Canvas 时间线与节点。
4. **逻辑层复用**：`web/js/` 中的 data/reward/action/goal/battle 等纯逻辑模块可以继续复用，主要重写 `ui.js` 与 `world-scroll/world-map` 的渲染部分。
5. **云开发接入**：云函数做存档、结算、排行；云托管放配置与资源。

---

## 当前仓库的微信相关文件

- `wechat/miniprogram-webview/`：小程序壳工程（web-view 路线）。
- 暂未创建 Canvas 小游戏工程，等 AppID 类型确认后开工。

## 下一步建议

先确认 AppID 类型，然后我做两件事：

1. 先按路线 A 出可扫码体验的微信测试版；
2. 同时按路线 B 拆出 Canvas 渲染层改造任务包，逐步替换 DOM。
