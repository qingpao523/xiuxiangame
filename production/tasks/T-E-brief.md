# T-E 任务书：21.4 §3.2 道友 visits 试点 3 人（第 1 批第 5 任务）

> 角色：P7 实施工程师。性质：写代码（数据结构+触发管线+内容）。
> 工作目录：/Users/qingpao/xiuxiangame。前置：T-A~T-C 已验收（devlog 顶部有记录）。

## 必读（动手前逐字读）
1. /Users/qingpao/xiuxiangame/CLAUDE.md
2. /Users/qingpao/xiuxiangame/design/22.0 分批实施验收总标准 v0.1.md（§七文案红线）
3. /Users/qingpao/xiuxiangame/design/21.4 道友活人化最小架构 v0.1.md —— 本任务设计书。重点：§0 现状盘点（尤其 0.1/0.3/0.6）、§3.2 低代码档（数据结构 3.2.1/挂载点 3.2.2/频控 3.2.3）、§3.4 三个试点样例（文案级，直接用）、§4 风险铁律、§5 验收钩子
4. devlog.md 顶部 T-A/T-B/T-C 记录

## 任务：把 3 位试点道友从"结缘即退场"变成"结缘后还会来找你"

### 数据结构（companion_table.json 加字段，不建新表）
- 试点 3 人（申公豹 shengongbao / 哪吒 nezha / 赵公明 zhaogongming，以表内实际 companion_id 为准）各加：
  - `stance`：立场声明元数据（faction/wants/dislikes/quote，按 21.4 §3.2.1 示例，从 design/9.0 与 stage 原文推导）。
  - `visits[]`：结缘后内容数组。每条 { visit_id, title, condition(all_of 富条件), text, options[](text/reward/effect/log), cooldown_days(≥7), once }。
  - 内容直接用 21.4 §3.4 三条文案级样例（"劫机西来"/"东海又动"/"一笔账"），可润色不可降级（选项数、分支条件、延迟浮字都要保留）。
- 存档侧：state.companions[id] 追加 { visit_ptr:0, favor:0, last_visit_day:0 }（save-manager normalize 补默认，旧档无感）。

### 挂载点（全部现成，先读现状）
- `_checkCompanions()`（game.js，经 _afterMutated 每次状态变化调用）：追加 visits 评估——每次变更最多触发 1 条（guard）；`state.pending_event_id` 存在即让位（对齐导演纪律 content-director.js）。
- `_companionConditionMet`（game.js，13 种富条件类型）：直接复用；补一个 `all_of` 包装器（约 8 行）处理多条件与。
- 弹窗：queuePopup({kind:"text",style:"seal"}) 同 stage 弹窗规格，视觉零新增。
- 低权重无选项的纯风味回访（如哪吒样例 B 路线的七日后延迟浮字）只走 _log 浮字，不弹窗。

### 频控硬规则（21.4 §3.2.3，逐条实现）
- 一次 _afterMutated 至多 1 条 visit；离线收菜结算批次视同一次。
- 每位道友 cooldown_days ≥7（state 记 last_visit_day）。
- 全局每周 visits 总数 ≤2（state 记周计数）。
- 开局总闸：ContentDirector.isOpening 为真或境界 < zr_06 一律不触发。
- 条件不满足（未结缘/势力不符）时全程零引用该人物。

### 硬性约束（21.4 §4 铁律）
- **护持基线永不削减**：bond_passive 基线值不动，tests/companion-passives.test.js 20 条断言原样通过是硬验收。
- favor 只开新事件、不开/关旧收益；不进 UI 数值面板（只以称呼/语气外显）。
- 无惩罚分支：所有选项都有路，拒绝零惩罚；visit 不作进程门槛。
- 禁系统语言入文案（无"好感+1"）；每条挂 ≥1 封神锚点。
- 零新增模态规格（沿用 seal 文本弹窗）；前 30 分钟零负担（总闸保证）。
- 数据为体：visits 全在 JSON，代码只是评估器。
- 不改范围外文件；不要 git commit。

### 验收命令（全跑留证）
```bash
for f in web/js/*.js; do node --check "$f"; done
npm test
node test/ui-regression.test.js
node tests/companion-passives.test.js    # 20 断言零回归（硬验收）
node test/balance-metrics.js
node test/tribulation-advantage.test.js
node test/list-marks.test.js
# 你新增的 visits 测试
```

### 验收钩子（21.4 §5 低代码档）
- 试点 3 人各 ≥1 条 visit：满足条件后 3 天内必现；不满足条件时全程零引用（脚本遍历 visits 条件树核对）。
- 频控：模拟 14 天状态流，单道友间隔 ≥7 天、全局 ≤2 条/周、pending_event_id 占用时 100% 让位。
- 旧档兼容：无 visit_ptr/favor 字段的存档 normalize 后正常。
- 文案评审：口癖一致性（对照 stage 原文）、零系统语言、每条 ≥1 锚点。

### 交付报告
1. 改动文件清单+摘要。2. 三条 visits 的最终文案（含选项/条件/奖励）。3. 频控测试证据（14 天模拟）。4. companion-passives 20 断言通过证据。5. 自审查 + devlog.md 顶部追加 T-E 条目草稿（标注"自测，待独立验收"，不写分数）。
