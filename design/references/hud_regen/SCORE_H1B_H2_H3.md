# HUD H1b/H2/H3 波评分结果（独立评分员 qodercli DeepSeek-V4-Flash，锚图 keyart_v3，2026-09-02）

> 注：评分员写文件被权限拦截，本文件由主控从 /tmp/hud_score2_run.log 落盘。

| 文件 | 分数 | 判定 | 理由 |
|---|---|---|---|
| h1b/resbar_v1 | 88 | PASS | 两端青绿密云饰件＋月白净地匾心可拉伸，厚涂层次足，无字无金 |
| h1b/resbar_v2 | 82 | PASS | 长条匾达标、云饰略水彩单薄，净地中段可用，黑底缺陷已修 |
| h1b/dao_v1 | 78 | FAIL | 中段薄荷水彩偏粉水洗，矿物感不足，细长条形制本身达标 |
| h1b/dao_v2 | 83 | PASS | 细长槽两端云饰中段teal净地可拉伸，色稳无字无金 |
| h2/res_disc_v1 | 90 | PASS | 玉璧八组浮雕云纹层次足，青绿铜锈质感，圆璧形制最贴 |
| h2/res_disc_v2 | 85 | PASS | 素面玉璧干净利落，深线勾边抠图友好，纹饰信息略少 |
| h2/btn_ready_v1 | 85 | PASS | 四边回纹完整框象牙牌匾＋端珐琅云饰，按钮底结构最完整 |
| h2/btn_ready_v2 | 85 | PASS | 云帽花边牌匾珠光面板净地可题，花边悬挂孔位略杂 |
| h2/btn_acting_v1 | 53 | FAIL | 发光星云条非令牌牌匾，弥散光晕拖尾，比例超3:1风格漂移 |
| h2/btn_acting_v2 | 85 | PASS | 云龙雕端饰＋回纹青玉面板厚涂到位，中段淡雾纹微杂 |
| h2/btn_break_v1 | 86 | PASS | 龙首卷云横匾，天光金柱≤5%例外内，竖光柱穿中段或碍题字 |
| h2/btn_break_v2 | 87 | PASS | 金芒星嵌顶冠≤5%例外内，青玉大理石匾稳重，中段净地 |
| h2/nav_tile_v1 | 79 | FAIL | 竖长非近方，顶部四叶草镂空洞伤图块完整性，瓷釉云纹本身佳 |
| h2/nav_tile_v2 | 62 | FAIL | 素白面板蓝细线极简框，无青绿矿物色，风格锁缺位 |
| h2/nav_attention_v1 | 82 | PASS | 白雕青绿云冠顶缀红珠，呼应锚图红点，整体竖长微偏方 |
| h2/nav_attention_v2 | 56 | FAIL | 遥控器式灰身蓝框红钮，现代器物感，风格漂移严重 |
| h3/cloud_stand_v1 | 88 | PASS | 厚涂青绿云台顶面平展可承托，painterly笔触最贴风格锁 |
| h3/cloud_stand_v2 | 85 | PASS | 微凹平顶＋底座云簇承托明确，矢量白描边偏插画化 |

## 择优结论
- ui_resbar_plaque → resbar_v1（88）；resbar_v2 留候选。
- ui_dao_trough → dao_v2（83）；dao_v1 薄荷水洗 FAIL。
- ui_res_disc → res_disc_v1（90，全场最高）；v2 留候选。
- ui_btn_ready → btn_ready_v1（85，同分取回纹硬框矩形题字区规整者）。
- ui_btn_acting → btn_acting_v2（85）；v1 发光星云跑形 FAIL。
- ui_btn_break → btn_break_v2（87，金芒嵌顶冠≤5%不碍题字）；v1 留候选。
- ui_nav_tile → 全废重出。要点：近方形小牌匾、中段净地、禁镂空洞、禁极简现代框。
- ui_nav_attention → nav_attention_v1（82，红珠云冠）。
- ui_cloud_stand → cloud_stand_v1（88，厚涂顶面平展）。
- 汇总：PASS 13 / FAIL 5；btn_break_v2/btn_ready_v1 中段题字叠加待 Playwright 实测。
