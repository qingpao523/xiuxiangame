# 开发日志 — 封神·放置修仙

---

## 2026-06-30 08:45 CST — Godot MVP Demo 项目骨架与首屏闭环

### 变更摘要

- 将 `/Users/flyaways/Documents/GAME-XIUXIAN` 初始化为 Godot 4.7 项目根目录。
- 新增 `project.godot`，配置竖屏优先视口 `1080x1920`、`canvas_items` 拉伸、`gl_compatibility` 渲染模式，并注册核心 Autoload。
- 将 `fengshen_mvp_data_json_v0_1` 下的全量 JSON 表复制到 `res://data/`，用于运行时读取。
- 新增核心运行系统：
  - `DataManager`：加载 `data_index.json` 指定的数据表，并按表名 / ID 建立索引。
  - `SaveManager`：使用 `user://save/save_v1.json` 写入可迁移 JSON 存档。
  - `UnlockManager`：根据境界、日期、地图、已解锁 ID 判断功能开放。
  - `RewardManager`：计算离线闭关收益、地图掉落、机缘触发。
  - `RealmManager`：处理境界进度、小境界升重和战力估算。
  - `BreakthroughManager`：处理真人劫 / 地仙劫成功率、失败补偿和保底。
  - `EventManager`：按触发源和权重抽取机缘事件。
  - `Game`：作为 demo 聚合入口，串联收菜、升重、破劫、机缘、游历、术法和法宝入口。
- 新增 `scenes/main/Main.tscn` 与 `scripts/ui/Main.gd`，实现竖屏首屏 demo：
  - 资源栏
  - 境界进度条
  - 角色立绘与背景切换
  - 闭关收益领取
  - 升重 / 破劫按钮
  - 机缘二选一
  - 游历 / 换地图
  - 术法 / 法宝最小升级入口
  - demo 调试按钮“快进半日”
- 新增 `.gitignore` 与 `.gitattributes`，忽略 Godot 编辑器缓存与导出产物，并标记图片资源为 binary。

### 关键决策理由

- 第一性原理：放置修仙 MVP 的最小可玩闭环不是“页面多”，而是“时间差 -> 资源增长 -> 消耗资源 -> 境界提升 -> 解锁新收益源”。因此优先实现离线收益、境界升重、破劫和机缘，而不是先铺完整多页面系统。
- JSON 表已经是项目的事实源，所以运行时以 `DataManager` 读取 `res://data/`，避免把数值写死在 UI 或脚本里。
- 存档必须使用 `user://`，因为 Godot 导出后的 `res://` 是只读路径；使用 JSON 是为了便于调试、迁移和手工检查。
- 首屏采用单场景动态 UI，是为了在 MVP 阶段降低场景文件维护成本，先验证核心循环和数据接入，再拆分独立页面。
- 真仙前不称“神通”，术法系统在 UI 和数据入口中统一使用“术法”，保持和当前设定一致。
- 音效暂不接入，遵循当前目标：先证明放置收菜数值快感和封神包装能跑通。

### 验证记录

- 已执行 Godot 静态检查：

```bash
godot --headless --path . --check-only --quit-after 1
```

- 已执行 Godot 主场景启动冒烟：

```bash
godot --headless --path . --quit-after 1
```

- 两项均通过。
- 运行后确认 Godot 已写出 `user://save/save_v1.json`，说明 Autoload 初始化、JSON 加载与存档写入链路已打通。

### 后续待办

- 增加 H5 export preset。
- 拆出正式页面：地图页、术法页、法宝页、Boss 结算页。
- 补齐 Boss 战斗 / 首通奖励 / 法宝获得流程。
- 细化首日引导和第七天节奏验证。
- 对 UI 做移动端真机尺寸检查和美术皮肤精修。
