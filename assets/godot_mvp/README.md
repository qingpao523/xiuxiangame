# Godot MVP Art Pack

This folder contains the Godot-ready art assets generated from `design/1.7 Godot Web MVP 技术方案与开发任务拆分 v0.1.md`.

Total files in this pack: 43 PNGs.

Required by 1.7:

- 3 backgrounds
- 3 character portraits
- 8 treasure icons
- 3 spell icons
- 7 resource icons
- 12 UI decoration assets
- 5 VFX assets

Bonus extras:

- `ui/icons/ui_red_dot.png`
- `ui/icons/ui_unlock_flash.png`

These two files live in `ui/icons/` alongside the required `ui_lock_icon.png`.

Recommended `res://` structure:

```text
res://assets/godot_mvp/
  backgrounds/
  characters/
  treasures/
  spells/
  resources/
  ui/
    banners/
    borders/
    buttons/
    bars/
    icons/
    popups/
  vfx/
```

File list:

```text
backgrounds/bg_mountain_cave.png
backgrounds/bg_chentang_pass.png
backgrounds/bg_bone_mountain_edge.png

characters/char_cultivator.png
characters/char_realman.png
characters/char_earth_immortal.png

treasures/treasure_lightwood_sword.png
treasures/treasure_spirit_gourd.png
treasures/treasure_xuanhuang_protective_talisman.png
treasures/treasure_subduing_demon_bell.png
treasures/treasure_windfire_meditation_mat.png
treasures/treasure_bronze_soul_mirror.png
treasures/treasure_gold_light_seal.png
treasures/treasure_calm_jade_pendant.png

spells/spell_palm_thunder.png
spells/spell_spirit_fire.png
spells/spell_artifact_control.png

resources/resource_daoxing.png
resources/resource_mana.png
resources/resource_merit.png
resources/resource_calamity.png
resources/resource_spell_page.png
resources/resource_treasure_shard.png
resources/resource_refine_material.png

ui/banners/ui_top_seal_banner.png
ui/borders/ui_seal_border.png
ui/buttons/ui_merit_button_border.png
ui/buttons/ui_calamity_button_border.png
ui/popups/ui_breakthrough_popup_bg.png
ui/popups/ui_chance_popup_bg.png
ui/popups/ui_treasure_popup_bg.png
ui/borders/ui_map_card_border.png
ui/bars/ui_realm_progress_bar.png
ui/bars/ui_daoxing_progress_bar.png
ui/bars/ui_resource_bar_bg.png
ui/icons/ui_lock_icon.png

vfx/vfx_collect_reward.png
vfx/vfx_level_up.png
vfx/vfx_breakthrough.png
vfx/vfx_treasure_get.png
vfx/vfx_chance_event.png
```

Notes:

- All required art assets are already copied into this folder tree.
- The bonus UI icons are kept in `ui/icons/` so they are easy to use, but they are not required by 1.7.
- The images are ready to import directly into Godot as texture resources.
