# 美术资源（Web Art Pack）

本目录存放网页版（web/）使用的美术资源。代码引用见 `web/js/ui-constants.js`
（BACKGROUND_PATHS / CHARACTER_PATHS / SPELL_ICONS / TREASURE_ICONS / ICON_PATHS）。

资源按类型分目录，代码以相对路径 `assets/...` 引用（相对于 web/index.html）。

目录结构：

```text
assets/
  backgrounds/    背景图
  characters/     主角立绘
  treasures/      法宝图标
  spells/         术法图标
  resources/      资源图标
  ui/
    banners/      顶部横幅
    borders/      边框
    buttons/      按钮边框
    bars/         进度条
    icons/        图标
    popups/       弹窗背景
  vfx/            特效
```

说明：

- 当前为占位/初版素材，正式美术到位后按层替换，不改逻辑代码（见 CLAUDE.md 美术素材流程）。
- 部分 UI 皮肤与 VFX 尚未接入，详见 `美术需求.md`。
