# HUD H1b 波重出报告（resbar + dao 全废重出，2026-09-02）

> 首轮失败修正依据：h1/SCORE.md — resbar=群像壁画/金袍金饰/黑底；dao=满幅非细长槽/金冠。
> 修正要点：构图硬条款（主体唯一横向细带+月白空地82%）、GOLD_BAN 逐图显式、禁黑底、禁圆框、自查条款（禁水洗/渐变冒充厚涂）。
> v2 两图首版云纹描边出现金黄像素（resbar_v2=296、dao_v2=349），触禁金红线弃用；v2 以 ANTI_GOLD_STRONG 强化句重出后通过（60/8 淡米色反锯齿点，非金线）。
> 生图：doneai skill gpt_image_2（image2），aspectRatio=3:2，skillName=doneai，skill-version=0.14.1。全部 2048×1360 RGB PNG。
> 评分：本波为素材补出（独立评分另波执行）；像素审计见 _work/audit*.py。

| 素材 | v1 | v2 | 尺寸 | 判定 |
|---|---|---|---|---|
| ui_resbar_plaque | resbar_v1.png | resbar_v2.png | 2048×1360 | 两版均合规保留 |
| ui_dao_trough | dao_v1.png | dao_v2.png | 2048×1360 | 两版均合规保留 |

## 逐张明细

### resbar_v1.png
- UUID: gpt-1f1dd301de92556a
- CDN: https://done.cdn.alibabadesign.com/2026/09/02/2d3ee0c8be0142df.png
- 尺寸: 2048×1360
- 文件大小: 1137679 B
- 判定: 合规：匾体居中（栏约19.9%画高）、云纹无金（暖金像素9，白描边）；保留
- 完整 Prompt:



### resbar_v2.png
- UUID: gpt-8b66780b2d7d7a13
- CDN: https://done.cdn.alibabadesign.com/2026/09/02/01e803c536668541.png
- 尺寸: 2048×1360
- 文件大小: 778305 B
- 判定: v2 重出（首版金描边弃用）后合规：匾体18.7%画高居中、白描边、暖金像素60（淡米色反锯齿点，非金线）；保留
- 完整 Prompt:



### dao_v1.png
- UUID: gpt-18d5217b086abfb3
- CDN: https://done.cdn.alibabadesign.com/2026/09/02/14dc039ea6991618.png
- 尺寸: 2048×1360
- 文件大小: 685892 B
- 判定: 合规：中段石绿平涂平整可拉伸（横向std 2.8-14边缘行外，主带2.8-6.3）；暖金像素0；保留
- 完整 Prompt:



### dao_v2.png
- UUID: gpt-35f582a3ed0abb7d
- CDN: https://done.cdn.alibabadesign.com/2026/09/02/e6e49f3e975f842d.png
- 尺寸: 2048×1360
- 文件大小: 487873 B
- 判定: v2 重出（首版金描边弃用）后合规：中段平涂极平（横向std 1.3-1.6）、无金（暖金像素8）；保留
- 完整 Prompt:


