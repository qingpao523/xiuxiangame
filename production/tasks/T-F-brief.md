# T-F 任务书：21.3 终局 E2 三结局 + E3 道痕修复 + E4 见闻录（第 1 批第 6 任务）

> 角色：P7 实施工程师。性质：写代码（state 钩子+数据行+面板）。
> 工作目录：/Users/qingpao/xiuxiangame。前置：T-A~T-C 已验收（devlog 顶部记录；list_marks 已在 T-C 实现）。

## 必读（动手前逐字读）
1. /Users/qingpao/xiuxiangame/CLAUDE.md
2. /Users/qingpao/xiuxiangame/design/22.0 分批实施验收总标准 v0.1.md
3. /Users/qingpao/xiuxiangame/design/21.3 疲劳点与终局设计 v0.1.md —— 本任务设计书。重点：§0.2 分层盘点（死指针/死字段位置）、§3.1 设计立场、§3.3 低代码档 E1-E4、§3.5 依赖次序、§4.1 守则对照（尤其守则 5 多维可替代）、§5 验收钩子
4. /Users/qingpao/xiuxiangame/design/1.3 # 《封神修道录》游戏设定文档 v1.0.MD §二十四（三结局原设：受封天庭/肉身成圣/混元逍遥）
5. devlog.md 顶部 T-A/T-B/T-C 记录（含 T-C verifier 遗留：bt_006~008 补 title）

## 任务（三块 + 一项 T-C 遗留）

### 块一 E2：三结局落地（21.3 §3.3 E2）
现状病根：realm_table.json hy_10 的 unlock_ids:["ending_choice"] 是死指针（unlock_table 无此行）；hy_10 lore 问"三条路你选哪条"点击无事发生。
- unlock_table.json 补 3 行：ending_fengshen（受封天庭）/ending_chengsheng（肉身成圣）/ending_xiaoyao（混元逍遥）。
- hy_10 毕业（或 isCapped 后）触发三选一抉择弹窗（复用现有 popup 队列，一世一次）。
- 结算 = 一次性终局画卷文案（走既有画卷/大弹窗通道）+ `state.ending_id` 永久身份 + "后结局状态"：世界仍开放（可继续见证/转世走另一结局）。
- 结局条件矩阵（守则 5 多维可替代，三条结局对应三种玩法偏好）：
  - 受封天庭（放置党）：功德/天庭差事维度（可用 list_marks/merit，门槛适中）；
  - 肉身成圣（战力党）：战斗维度（Boss 首杀数/杀阵/战力）；
  - 混元逍遥（长线党）：见证/历世维度（witnessed 条目数/转世次数/道痕）。
  - 具体数值先读现状分布再定，写成数据行（unlock_table condition），不硬编码。**任何一条都不是唯一必走路径。**
- ending_choice 死指针消除：hy_10 的 unlock_ids 指向真实存在的行，grep ending_choice 有消费代码（21.3 §5 钩子 1）。
- 补写结局规格进 Z4 文档位（design/21.3 已给框架，结局文案按 1.3 §二十四基调写，≤25字/句、挂锚点）。

### 块二 E3：道痕结算修复（21.3 §3.3 E3）
现状病根：game.js 转世 majorGain 表只写到地仙（{炼气士:1,真人:3,地仙:5}||1），天仙及以上一律 1 点——"前世修到混元和修到地仙差不多"。
- majorGain 补齐天仙~混元递增梯度（设计说数值待校准——你给一版有理据的初版梯度并写明推导：建议随大境递增，体现"修得越深道痕越凝"，幅度参考既有 1/3/5 的斜率不外推爆炸）。
- getRebirthPreview 同步更新（10 个大境 gain 全部 >0 且单调，测试覆盖全部 major_realm）。
- "历世录"升级为正式档案：rebirth.log 条目扩字段记录本世流派/结局/名位（state.rebirth.log 已有结构，扩字段不破坏旧条目）。

### 块三 E4：见闻录原型（21.3 §3.3 E4）
- `state.witnessed[]`：具名 Boss 首杀 / 同伴弧关键节点（结缘/stage 完成）/ 破劫成败 时写入见证条目（复用 event seen 去重机制，同一条目二次不触发）。
- 每条目含 lore_anchor（可溯源到封神实体）+ 一句见证文案（≤25字，"谁怎么了"的众生相）。
- 洞府加"见闻录"面板（浮字/日志式更新提示，不弹窗；面板可展示全部已收集条目）。先读现有面板架构（web/js/panels/*.js 的 PANEL_UNITS 注册分发模式）照模式加。
- 首批条目覆盖：31 Boss 首杀 + 19 同伴结缘（文案可用 AI 批量思路但必须逐条挂锚点，先做 Boss+同伴两类，事件类见证留结构不硬凑）。

### 块四 T-C 遗留：bt_006~008 补 title 数据
breakthrough_table.json 的 bt_006/007/008 success_rewards 补 title（名位语义，与 T-B 文案口径一致：如斩尸/出因果/混元道果方向，先读 bt_001~005 既有 title 风格对齐）。目的：替身代形"不授 title"的代价在终局三关成立（T-C verifier 遗留①）。

### 硬性约束
- 禁止简化：三块+遗留全做。E2 必须是真结局（画卷+ending_id+后结局开放），不是弹窗发个称号。
- 守则 5：结局条件多维可替代，无唯一路径；不强制养成。
- 弹窗克制：结局画卷一世一次大弹窗；日常见证一律非阻断浮字/日志。
- 前 30 分钟零触碰：本任务全部在终局/转世链路，开局测试必须零漂移。
- 数据为体：结局条件/见证条目配置化；state 字段全可序列化标量（服务端友好）。
- 不改范围外文件；不要 git commit。

### 验收命令（全跑留证）
```bash
for f in web/js/*.js; do node --check "$f"; done
npm test
node test/ui-regression.test.js
node test/balance-metrics.js
node test/tribulation-advantage.test.js
node test/list-marks.test.js
# 你新增的终局测试
```

### 验收钩子（21.3 §5）
- 三结局：调试通道直达 hy_10 → 三选一 → state.ending_id ∈ {fengshen,chengsheng,xiaoyao} → 终局画卷文案 → 后结局世界开放、转世后可达另一结局；unlock_table 存在 3 行 ending_*；ending_choice 死指针消除。
- 道痕：getRebirthPreview 10 大境 gain 全 >0 且单调；历世录新字段写入。
- 见闻录：Boss 首杀/同伴节点/破劫成败 → witnessed+1 且浮字；seen 去重；面板展示全部条目带 lore_anchor。
- bt_006~008 title：替身符在这三关败转胜时 title 不授的代价真实存在（对照 T-C 的 list-marks 测试口径扩展断言）。

### 交付报告
1. 改动文件清单+摘要。2. 三结局条件矩阵+画卷文案。3. 道痕梯度表+推导。4. 见闻录首批条目统计+抽样。5. 各项验收钩子测试证据。6. 自审查 + devlog.md 顶部追加 T-F 条目草稿（标注"自测，待独立验收"，不写分数）。
