# T-D 任务书：21.2 表现层气韵化 T0 + L1（第 1 批第 4 任务）

> 角色：P7 实施工程师。性质：写代码（游戏代码重构 + JSON 文案润色）。
> 工作目录：/Users/qingpao/xiuxiangame（修仙题材放置类文字网页游戏，纯前端 web/，数据 web/data/，架构"数据为体、画面为用"）。

## 必读（动手前逐字读）
1. /Users/qingpao/xiuxiangame/CLAUDE.md —— 项目守则
2. /Users/qingpao/xiuxiangame/design/22.0 分批实施验收总标准 v0.1.md —— §七文案红线
3. /Users/qingpao/xiuxiangame/design/21.2 表现层气韵化落地路径 v0.1.md —— 本任务设计书。重点：§0.3 数字糊脸 18 处 A/B/C 分类、§3.0 三问准则、§3.1 T0、§3.2 L1、§4.2 风险、§5 验收钩子 H1-H8
4. devlog.md 顶部 T-A/T-B/T-C 三条记录（前置批次已完成，各验收 97/97/99；其中两项设计债归本批处置）

## 改动范围（四块，禁止简化，全做）

### 块一 T0：JSON 文案润色（breakthrough_table 已在 T-B 做完，本批做剩余三表）
- T0-1：web/data/realm_table.json 的 lore_text（约 90+ 条）统一为气韵句，去说明腔。示例：rq_03 现"可离开洞府，在山野边缘游历"→方向"洞外的风，比昨日多了一层。你想，可以走远些了。"功能性信息由 feature_tips/解锁弹窗承担，lore_text 只管气韵。
- T0-2：web/data/action_table.json 的 start_text/complete_text 逐条体检，删残留裸数字（"一缕道行"类量化暗示可留，裸 +N 禁止）。
- T0-4：encounter_table.text / event_table.narrative_text 锚点抽查：须含六锚点之一（榜文/劫气/功德/阐截/杀劫/神位）或具体世界实体；只改不合格条目，合格不动（控制改动面）。
- 文案红线：≤25字/句、禁系统腔/感叹号结算腔、含锚点或实体、气韵句内禁裸+N。
- 护栏：action_table.complete_text 是首小时高频文案，改完重跑 ui-regression 确认零回归。

### 块二 L1：文案入数据 + 渲染器（21.2 §3.2 逐步）
- L1-1 新建 web/data/feedback_table.json（字段 feedback_id/channel/tier/lines/budget/fallback_id，结构示例见 21.2 §3.2 L1-1）。
- L1-2 迁移六个 JS 文案池入表：QIYUN（web/js/atmosphere.js:13-45）、PHASE_RITUALS（atmosphere.js:49-64）、BREAKTHROUGH_SCENES（atmosphere.js:68-158，beats 的 t/bg/fx/lines 结构原样作字段）、INSIGHT_LINES（web/js/ui-constants.js:198-210）、FEATURE_UNLOCK_TEXT/RESOURCE_UNLOCK_TEXT（web/js/constants.js:226-243）。迁移后 atmosphere.js 只留 API 与渲染逻辑，内容读 DataManager.getConfig("feedback")；原常量删除。
- L1-3 新建 web/js/feedback-renderer.js（约 100 行）：FeedbackRenderer.line(feedbackId, ctx)——近 N 次不重复伪随机（沿用 atmosphere.js:167 seed 思路升级）、预算检查（预算尽→fallback 或静默）、{realm_name} 类模板插值。atmosphere.js 的 actionLine/phaseRitual/breakthroughScene 三 API 内部改调渲染器，外部签名不变，game.js 调用点零改动。
- L1-4 web/data/data_index.json tables 数组追加 feedback_table.json。
- L1-5 处置 B/C 清单（21.2 §0.3 的 B1-B12 + C 类 6 标题）：B1 战力降次级、B2 拾取浮字双轨（气韵句+数字次行）、B9 目标达成标题气韵化、C 类 6 个系统腔标题（"闭关结束！""目标达成：…""破劫成功！""破劫失败""挑战胜利！""斗法失利"——注意破劫失败弹窗 T-B 已改过，先读现状）改读 feedback_table channel:"popup_title"。零新增模态弹窗。A 类 6 处数字白名单（ui.js:64 进度条/遭遇成算/破劫 rate-table/战斗 HP/伤害浮字/败战小记）数字本体不动。

### 块三 设计债一：storyBonus/pulseBonus 口径对齐（devlog T-B 条目"verifier 复核修正"③）
破劫确认面板因果明细行与 T-B 净值公式双向一致：storyBonus/pulseBonus 并入净值兑现（game.js confirmBreakthrough 净值计算处扩项；battle-engine-v2.js 注入路径已存在），factionBonus 补面板行（ui.js 破劫确认面板）。净值上限 NET_CAP=0.5 不变。改完重跑 test/tribulation-advantage.test.js 必须全绿（胜率数字可变，方向与显著性不变即可，变化原因写报告）。

### 块四 设计债二：bt_004/bt_005 画卷-phases 对齐（devlog T-B 遗留①）
迁移 BREAKTHROUGH_SCENES 时把 bt_004/bt_005 画卷 beats 文案与本关 phases 主题对齐（先读 web/data/breakthrough_table.json 确认各关 phases 内容，以 phases 为准调画卷 lines；不改 phases 数据与画卷触发逻辑）。

## 硬性约束
- 六池迁移必须 100%（验收钩子 H1：迁移后原池关键句 grep web/js/*.js 零命中）。
- bt_001 与前 30 分钟零回归：test/ui-regression.test.js 黄金快照零漂移（禁止 --write 覆盖快照）；首次吐纳弹窗保留。
- 弹窗克制：零新增模态。数据为体：迁移后 JS 零文案硬编码（渲染模板除外）。
- 不改范围外文件；不要 git commit。

## 验收命令（全跑留证）
```bash
for f in web/js/*.js; do node --check "$f"; done
npm test
node test/ui-regression.test.js
node test/balance-metrics.js
node test/tribulation-advantage.test.js
node test/list-marks.test.js
```

## 交付报告
1. 改动文件清单+摘要。
2. T0 三表改动统计+抽 5 条前后对照。
3. 六池迁移对照表（原常量位置→feedback_id）+ grep 零残留证据。
4. B/C 清单逐点处置表（18+6 处各标注保留/双轨/气韵化及理由）。
5. 两项设计债处置证据。
6. 自审查（范围完整性/回归风险/有无简化）+ 在 devlog.md 顶部追加 T-D 条目草稿（标注"自测，待独立验收"，不写分数）。

逐池迁移逐池验证，不要一口气全改完再测。
