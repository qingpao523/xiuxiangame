# HUD 批次A 恢复规格与 v3 重生成计划 v0.1（2026-09-02）

> 来源：从会话转录重建的 batchA_css_full.css（5526行，含「批次A · 120分主屏皮肤 2026-08-24」全段+v0.40/v0.41修正）。
> 批次A 覆盖策略（原文）：「只覆盖视觉（背景/边框/阴影/文字色），不动布局与逻辑」→ 移植=纯CSS选择器覆盖+素材替换，零JS改动。
> DOM 核验：#top-banner/#game-title/#resource-strip/#goal-panel/#progress-bar/#main-btn/#seal-pressure 全部存在于现网 web/index.html（7/7）。

## 一、八区设计（Z1-Z7，批次A 原规格）

| 区 | 内容 | 素材 | 显示规格 | CSS 要点 |
|---|---|---|---|---|
| Z1 | 匾额（游戏题字） | ui_title_plaque.png | 264×52，题字20px楷 letter-spacing 6px | background cover；padding 0 20px 5px |
| Z2 | 资源牌匾+玉璧 | ui_resbar_plaque.png / ui_res_disc.png | 条高56px；玉璧36px圆；数字15px上/小字10px下 | v0.41改纯CSS渐变（Chrome131 bug规避）→ v3复活为 border-image 九宫格 |
| Z3 | 目标卡 | ui_goal_card.png | min-height 72px | border-image-slice 90 130 90 130 fill；border-width 10px 14px |
| Z4 | 舞台立绘+云台 | ui_cloud_stand.png | hero max-height 42vh 落地云台 | 云台真img，透明底 |
| Z5 | 道行槽 | ui_dao_trough.png | 高30px，标签入槽11px居中，fill内缩7px | border-image-slice 46 180 fill；border-width 2px 40px |
| Z6 | 主按钮三态 | ui_main_btn_{ready,acting,break}.png | 令牌 min(62%,240px)×70px，题字18px keep-all | ready态显示break图（#main-btn.ready→ui_main_btn_break.png） |
| Z7 | 底栏6格玉牌 | ui_nav_tile.png（+attention变体） | 栏高72px；图标17px上+名10px下 | 锁定格=同图 grayscale(0.65)+opacity .75（v0.41，不再用独立locked图） |

顶栏 veil：#app::before 230px 渐隐柔光（v3 改月白）。

## 二、v3 重生成素材清单（10件，入 web/assets/ui/hud/）

| # | 文件 | 透明 | 生成规格 | 禁金 | 备注 |
|---|---|---|---|---|---|
| 1 | ui_title_plaque.png | 否 | 横匾 1536×384→resize 528×132 | 禁 | 题字区留白（字由程序写） |
| 2 | ui_resbar_plaque.png | 否 | 横牌 1536×384→九宫格 | 禁 | 边素净可拉伸 |
| 3 | ui_res_disc.png | 是(品红底抠) | 玉璧 1024²→resize 144² | 禁 | 圆形璧，中孔 |
| 4 | ui_goal_card.png | 否 | 卡 1024×640 | 禁 | 九宫格安全区：角90/边130不放大元素 |
| 5 | ui_dao_trough.png | 否 | 槽 1536×320 | 禁 | 九宫格 slice 46 180；中段素净 |
| 6 | ui_main_btn_ready.png | 是 | 令牌 1024×384→resize 480×160 | 禁 | 青玉令牌素面 |
| 7 | ui_main_btn_acting.png | 是 | 同上 | 禁 | 行功态：石青光气微亮 |
| 8 | ui_main_btn_break.png | 是 | 同上 | 允一点 | 破劫态：唯一天命金微光 |
| 9 | ui_nav_tile.png | 是 | 玉牌 768×1024→resize 192×256 | 禁 | 白玉牌，上下留字位 |
| 10 | ui_nav_attention.png | 是 | 同上 | 禁 | 朱砂点醒 |
| (11) | ui_cloud_stand.png | 是 | 云台 1536×768 | 禁 | 落地云台，承立绘 |

- ui_nav_locked.png 不生成（v0.41 同图灰化方案）。
- 风格锁v3：不透明矿物颜料厚涂、石青石绿分层积色、彩压墨、铁线描、月白底；严禁水墨淡彩/透明水洗/昏黄做旧/Q版；R4 禁文字印章（题字区一律留白）。
- 验收线 ≥80（沿用用户 2026-09-01 拍板），红线一票否决：R4文字印章/金滥用/水墨漂移。
- 纪律：n≥2 择优；透明件品红底+PIL抠图（chroma 判据 R-g>60且B-g>60且g<130）；GOLD_BAN 逐图写入 prompt；评分员独立 qodercli（DeepSeek-V4-Flash，附件≤5，锚图 design/references/23.0_风格定调_keyart_v3.png）。

## 三、CSS 移植方案（禁整文件覆盖）

1. 从 batchA_css_full.css 提取「批次A」段（L4376 起）→ 适配后**追加**为 web/style.css 末尾独立段「/* ==== HUD v3 皮肤（批次A移植） ==== */」。
2. 素材路径修正：assets/_inbox/crop/*_c.png → assets/ui/hud/*.png；cloud_sea_base.png → .jpg。
3. 缺失素材引用处理：bg_mountain_cave.jpg / prologue_wake.jpg 先查存在性，缺则删对应规则。
4. v0.41 纯CSS渐变资源条 → 改回 ui_resbar_plaque.png border-image 方案（D4h 禁渐变冒充）；若 Chrome131 bug 复现再降级。
5. css-compat 合规：border-image 规则加 background-color 兜底；禁 background 斜杠简写。
6. 金色系文字/渐变（#c99638 系）→ v3 口径：石青/石绿/月白/墨色为主，金仅破劫按钮微光。
7. Playwright 真实页面截图验收（主屏日常极）+ npm test 六套回归（css-compat 特别关注）。

## 四、最小复原步骤

1. H1 波：不透明件 title_plaque/resbar_plaque/goal_card/dao_trough（4件）
2. H2 波：透明件 res_disc/main_btn×3/nav_tile/nav_attention（7件，品红底抠图）
3. H3 波：cloud_stand（1件）
4. CSS 移植 + index.html 无需改（DOM ID 全在）
5. Playwright 截图 + npm test + commit

## 五、执行记录（2026-09-02 全部完成）

### 生图与择优（doneai gpt_image_2_generate，风格锁v3逐字入prompt，n≥2择优，≥80过线）
- H1 波（4件×2版）：title_v1 83 PASS / goal_v1 84 PASS 胜出；resbar/dao 四张全废（金袍金饰/纯黑底/满幅壁画非细长槽）。
- H1b 补出（针对首轮缺陷）：resbar_v1 88 PASS（长条匾+月白净地中段）/ dao_v2 83 PASS（细长槽两端云饰中段净地）。
- H2 波（6件×2版）：res_disc_v1 90（全场最高）/ btn_ready_v1 85 / btn_acting_v2 85 / btn_break_v2 87（金芒≤5%例外内）/ nav_attention_v1 82 胜出；nav_tile 两版全废（竖长+镂空洞 / 极简框风格漂移）。
- H2b 补出：nav_tile_v1 87 PASS（近方形+实心净地，首轮双缺陷全修）。
- H3 波：cloud_stand_v1 88 PASS（厚涂顶面平展可承托）。
- 评分档案：hud_regen/h1/SCORE.md、hud_regen/SCORE_H1B_H2_H3.md、hud_regen/h2b/SCORE.md；各波 REPORT.md 含完整 Prompt+UUID。

### 安装（11件入 web/assets/ui/hud/）
- 不透明件：bbox 检测裁剪主体→resize（title 528×132 / goal 1024×640 / resbar 1536×384 / dao 1536×320）。
- 透明件：品红底抠图（判据 R-g>60且B-g>60且g<130，软边 alpha=(d-60)*3）→alpha bbox→resize（res_disc 144² / btn×3 480×160 / nav_tile+nav_attention 192×256 / cloud_stand 1536×768）。

### CSS 移植（batchA_v3_port.css 1189行，追加为 web/style.css 末尾独立段，4384→5573行）
- 路径修正 _inbox/crop→ui/hud；nav_locked 规则删改同图 grayscale(0.65)+opacity.75；金色系→石青#3d7a8c/石绿#4a8c6a/墨青#2e5d6b（破劫金例外）；3处 border-image 均加 #f7edd4 background-color 兜底+完整 background 回落；斜杠简写全拆。
- 残留核验：_inbox/crop=0、ui_nav_locked.png=0、斜杠简写=0、金色系=0。

### 验收
- css-compat 12/12 PASS（含18资产存在性）。
- npm test 六套全绿 EXIT=0。
- Playwright 截图（拦截 api-client.js 跳 auth 门走本地存档；#ss-skip 跳过卷首）：7件主屏素材全加载、无 404、无 console 错误（除故意拦截的 api-client）。
- DOM 核验：七 ID（top-banner/game-title/resource-strip/goal-panel/progress-bar/main-btn/seal-pressure）+#char-ground 全在，index.html 零改动。
