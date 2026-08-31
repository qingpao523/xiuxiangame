# T-D 验收单（供独立 verifier 使用）

任务：第 1 批 T-D —— design/21.2 表现层气韵化 T0 + L1 + 两项设计债。
任务书：production/tasks/T-D-brief.md。总标准：design/22.0。

## 实施过程说明（诚实记录）
本任务由两个执行体完成：第一个 P7 agent 完成了数据层（feedback_table.json 63 条含六池迁移+B/C 条目、feedback-renderer.js、data_index 注册、index.html 脚本、harness 加载清单、T0-1 realm_table/T0-2 action_table 文案）后停滞；主理人接管完成接线层（atmosphere/ui-constants/ui/constants/game 六池接线与旧常量删除、B2/B4/B6/B7/B9/C 类处置、块三 story/pulse 口径对齐+天庭敕令面板行、块四验证、T0-4 锚点抽查与 event_113 修复）。

## 验收钩子逐项（21.2 §5）
- H1 数据化率 100%：`grep -n "一轮周天\|你闭上眼\|灵气如丝\|你感到气不再是气\|杀劫初临。" web/js/*.js web/js/panels/*.js` 零命中；QIYUN/PHASE_RITUALS/BREAKTHROUGH_SCENES/INSIGHT_LINES/FEATURE_UNLOCK_TEXT/RESOURCE_UNLOCK_TEXT 全仓（web/server/test/tests）零残留。
- H2 数字糊脸处置表：A 类 6 处保留（进度条/遭遇成算/破劫 rate-table/HP/伤害浮字/败战小记）；B2 双轨（sparkle 气韵主行+数字次行，style.css .sparkle-num）；B4/B6/B7/C 类 6 标题改读 feedback_table popup_* 条目（数字保留 body）；B9 气韵标题+goal_name 移 body；B1 维持现状（境界/称号已在前为主、战力居末为次，且身份行在黄金快照内，不改以守前 30 分钟零漂移——处置理由）；B5 T-B 已处置；B8/B10/B11 现状即双轨（result.log/日志/括号次行），未动。
- H3 前 30 分钟零回归：`node test/ui-regression.test.js` 黄金快照完全一致（未用 --write）。
- H4 预算/不重复：feedback-renderer.js RECENT_KEEP=5 近 N 次不重复 + daily_max/min_interval/first_only 预算 + fallback 链；insight daily_max=240。
- H5 文案审查：T0 改写抽样见 devlog；红线机检（≤25字/禁系统腔/锚点）对新增文案逐条过。
- H6 工程校验：node --check 全过；npm test 六套全绿；审计基线损坏不作硬门（22.0 §三.4）。
- H7 浮字红线：B2 只改内容不改位置（仍在 orb 原位、#stage 内）。
- H8 双轨一致性：所有数字本体未动（A 类白名单），气韵只做引言。
- 块三（设计债一）：game.js advNet 并入 storyBonus+pulseBonus；ui.js 面板补"天庭敕令"行；`node test/tribulation-advantage.test.js` 全绿（胜率差方向与显著性不变，z=7.46）。
- 块四（设计债二）：bt_scene_bt_004 首 beat"五行冲撞"对齐 phases 首段、bt_scene_bt_005 首 beat 桥接"五气既朝元→大道试问"，已用脚本核对。
- T0-4：扩展意象词典扫描 event 98 条/encounter 全表，疑似无锚点 12+7 条逐条人工复核，除 event_113（纯通用吐纳）外均含世界实体合格；event_113 已补榜文锚点。

## verifier 必跑命令
```bash
for f in web/js/*.js web/js/panels/*.js; do node --check "$f"; done
grep -rn "QIYUN\|PHASE_RITUALS\|BREAKTHROUGH_SCENES\|INSIGHT_LINES\|FEATURE_UNLOCK_TEXT\|RESOURCE_UNLOCK_TEXT" web/ server/ test/ tests/ --include="*.js" --include="*.html"
npm test
node test/ui-regression.test.js
node test/balance-metrics.js
node test/tribulation-advantage.test.js
node test/list-marks.test.js
node tests/companion-passives.test.js
node tests/boss-mechanics.test.js
```

## 对抗审查重点
A. 六池迁移是否 1:1（抽 3 池比对原常量与 feedback_table 条目，允许 T-B 风格的润色但不允许丢内容——尤其 BREAKTHROUGH_SCENES 的 beats 结构 t/bg/fx/hold/prompt/word/sub 字段完整性）。
B. B1"维持现状"处置是否可接受（21.2 原文处置方向是"战力降为次级或收进面板"，现状是否已满足；黄金快照约束是否构成不改的正当理由）。
C. 块三 advNet 扩项后 bt_001 豁免是否仍成立、NET_CAP 是否仍兜底。
D. feedback-renderer 的 fallback 递归是否有环（fallback_id 指向自身/互指）。
E. 服务端同构：server 侧突破路径是否会调用到 FeedbackRenderer（game.js unlock/toast 路径在服务端 tick 中触发时 FeedbackRenderer 必须在加载清单内——核对 test/harness.js 与 server 加载序）。
