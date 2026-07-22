extends Control

const TRACKED_RESOURCES := [
	"daoxing",
	"mana",
	"merit",
	"calamity",
	"spell_page",
	"artifact_shard",
	"treasure_shard",
	"refine_material",
]

const ICON_PATHS := {
	"daoxing": "res://assets/godot_mvp/resources/resource_daoxing.png",
	"mana": "res://assets/godot_mvp/resources/resource_mana.png",
	"merit": "res://assets/godot_mvp/resources/resource_merit.png",
	"calamity": "res://assets/godot_mvp/resources/resource_calamity.png",
	"spell_page": "res://assets/godot_mvp/resources/resource_spell_page.png",
	"artifact_shard": "res://assets/godot_mvp/resources/resource_treasure_shard.png",
	"treasure_shard": "res://assets/godot_mvp/resources/resource_treasure_shard.png",
	"refine_material": "res://assets/godot_mvp/resources/resource_refine_material.png",
}

const BACKGROUND_PATHS := {
	"mountain_cave": "res://assets/godot_mvp/backgrounds/bg_mountain_cave.png",
	"chentang_far": "res://assets/godot_mvp/backgrounds/bg_chentang_pass.png",
	"kulou_edge": "res://assets/godot_mvp/backgrounds/bg_bone_mountain_edge.png",
}

const CHARACTER_PATHS := {
	"炼气士": "res://assets/godot_mvp/characters/char_cultivator.png",
	"真人": "res://assets/godot_mvp/characters/char_realman.png",
	"地仙": "res://assets/godot_mvp/characters/char_earth_immortal.png",
}

var background_rect: TextureRect
var character_rect: TextureRect
var title_label: Label
var realm_label: Label
var progress_label: Label
var progress_bar: ProgressBar
var rate_label: Label
var map_label: Label
var lore_label: RichTextLabel
var status_label: Label
var resource_labels: Dictionary = {}
var event_panel: PanelContainer
var event_title_label: Label
var event_body_label: RichTextLabel
var event_option_box: VBoxContainer
var claim_button: Button
var level_button: Button
var breakthrough_button: Button
var event_button: Button
var travel_button: Button
var map_button: Button
var spell_button: Button
var treasure_button: Button
var fast_forward_button: Button


func _ready() -> void:
	_build_ui()
	Game.state_changed.connect(_refresh)
	Game.toast.connect(_on_toast)
	_refresh()


func _build_ui() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	background_rect = TextureRect.new()
	background_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	background_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	background_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	background_rect.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(background_rect)

	var dim := ColorRect.new()
	dim.color = Color(0.03, 0.04, 0.06, 0.56)
	dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(dim)

	var root_margin := MarginContainer.new()
	root_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_set_margins(root_margin, 36, 54, 36, 32)
	add_child(root_margin)

	var root_box := VBoxContainer.new()
	root_box.add_theme_constant_override("separation", 18)
	root_margin.add_child(root_box)

	root_box.add_child(_build_header())
	root_box.add_child(_build_resource_grid())

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	root_box.add_child(scroll)

	var content := VBoxContainer.new()
	content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	content.add_theme_constant_override("separation", 18)
	scroll.add_child(content)

	content.add_child(_build_cultivation_panel())
	content.add_child(_build_event_panel())
	content.add_child(_build_status_panel())
	root_box.add_child(_build_action_panel())


func _build_header() -> Control:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", _panel_style(Color(0.09, 0.11, 0.13, 0.82), Color(0.84, 0.66, 0.32, 0.65)))

	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 6)
	_set_panel_padding(box, 24, 18, 24, 18)
	panel.add_child(box)

	title_label = Label.new()
	title_label.text = "封神修道录"
	title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title_label.add_theme_font_size_override("font_size", 46)
	title_label.add_theme_color_override("font_color", Color(1.0, 0.88, 0.56))
	box.add_child(title_label)

	realm_label = Label.new()
	realm_label.text = ""
	realm_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	realm_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	realm_label.add_theme_font_size_override("font_size", 28)
	realm_label.add_theme_color_override("font_color", Color(0.89, 0.94, 0.93))
	box.add_child(realm_label)

	return panel


func _build_resource_grid() -> Control:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", _panel_style(Color(0.06, 0.08, 0.10, 0.84), Color(0.33, 0.53, 0.52, 0.52)))

	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 16)
	grid.add_theme_constant_override("v_separation", 12)
	_set_panel_padding(grid, 18, 14, 18, 14)
	panel.add_child(grid)

	for resource_id in TRACKED_RESOURCES:
		grid.add_child(_build_resource_row(resource_id))

	return panel


func _build_resource_row(resource_id: String) -> Control:
	var row := HBoxContainer.new()
	row.custom_minimum_size = Vector2(0, 58)
	row.add_theme_constant_override("separation", 10)

	var icon := TextureRect.new()
	icon.custom_minimum_size = Vector2(42, 42)
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.texture = _load_texture(str(ICON_PATHS.get(resource_id, "")))
	row.add_child(icon)

	var name_label := Label.new()
	var resource := DataManager.get_by_id("resource_table", resource_id)
	name_label.text = str(resource.get("resource_name", resource_id))
	name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	name_label.add_theme_font_size_override("font_size", 24)
	name_label.add_theme_color_override("font_color", Color(0.76, 0.84, 0.82))
	row.add_child(name_label)

	var value_label := Label.new()
	value_label.text = "0"
	value_label.custom_minimum_size = Vector2(126, 0)
	value_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	value_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	value_label.add_theme_font_size_override("font_size", 24)
	value_label.add_theme_color_override("font_color", Color(1.0, 0.92, 0.68))
	row.add_child(value_label)

	resource_labels[resource_id] = value_label
	return row


func _build_cultivation_panel() -> Control:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", _panel_style(Color(0.06, 0.08, 0.09, 0.74), Color(0.78, 0.66, 0.41, 0.5)))

	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 14)
	_set_panel_padding(box, 24, 20, 24, 20)
	panel.add_child(box)

	character_rect = TextureRect.new()
	character_rect.custom_minimum_size = Vector2(0, 520)
	character_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	character_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	box.add_child(character_rect)

	var progress_box := VBoxContainer.new()
	progress_box.add_theme_constant_override("separation", 8)
	box.add_child(progress_box)

	progress_label = Label.new()
	progress_label.text = ""
	progress_label.add_theme_font_size_override("font_size", 24)
	progress_label.add_theme_color_override("font_color", Color(0.86, 0.91, 0.88))
	progress_box.add_child(progress_label)

	progress_bar = ProgressBar.new()
	progress_bar.custom_minimum_size = Vector2(0, 30)
	progress_bar.show_percentage = false
	progress_bar.add_theme_stylebox_override("background", _bar_style(Color(0.04, 0.05, 0.06, 0.88)))
	progress_bar.add_theme_stylebox_override("fill", _bar_style(Color(0.86, 0.67, 0.31, 1.0)))
	progress_box.add_child(progress_bar)

	rate_label = Label.new()
	rate_label.text = ""
	rate_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	rate_label.add_theme_font_size_override("font_size", 22)
	rate_label.add_theme_color_override("font_color", Color(0.74, 0.86, 0.83))
	box.add_child(rate_label)

	map_label = Label.new()
	map_label.text = ""
	map_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	map_label.add_theme_font_size_override("font_size", 22)
	map_label.add_theme_color_override("font_color", Color(0.82, 0.87, 0.84))
	box.add_child(map_label)

	lore_label = RichTextLabel.new()
	lore_label.custom_minimum_size = Vector2(0, 170)
	lore_label.bbcode_enabled = true
	lore_label.fit_content = true
	lore_label.scroll_active = false
	lore_label.add_theme_font_size_override("normal_font_size", 24)
	lore_label.add_theme_color_override("default_color", Color(0.90, 0.91, 0.84))
	box.add_child(lore_label)

	return panel


func _build_event_panel() -> Control:
	event_panel = PanelContainer.new()
	event_panel.visible = false
	event_panel.add_theme_stylebox_override("panel", _panel_style(Color(0.13, 0.08, 0.06, 0.90), Color(0.92, 0.56, 0.34, 0.72)))

	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 12)
	_set_panel_padding(box, 24, 20, 24, 20)
	event_panel.add_child(box)

	event_title_label = Label.new()
	event_title_label.text = ""
	event_title_label.add_theme_font_size_override("font_size", 30)
	event_title_label.add_theme_color_override("font_color", Color(1.0, 0.78, 0.48))
	box.add_child(event_title_label)

	event_body_label = RichTextLabel.new()
	event_body_label.custom_minimum_size = Vector2(0, 150)
	event_body_label.bbcode_enabled = true
	event_body_label.fit_content = true
	event_body_label.scroll_active = false
	event_body_label.add_theme_font_size_override("normal_font_size", 24)
	event_body_label.add_theme_color_override("default_color", Color(0.94, 0.90, 0.82))
	box.add_child(event_body_label)

	event_option_box = VBoxContainer.new()
	event_option_box.add_theme_constant_override("separation", 10)
	box.add_child(event_option_box)

	return event_panel


func _build_status_panel() -> Control:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", _panel_style(Color(0.04, 0.06, 0.07, 0.76), Color(0.26, 0.47, 0.47, 0.45)))

	status_label = Label.new()
	status_label.text = ""
	status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	status_label.custom_minimum_size = Vector2(0, 86)
	status_label.add_theme_font_size_override("font_size", 23)
	status_label.add_theme_color_override("font_color", Color(0.86, 0.91, 0.87))
	_set_panel_padding(status_label, 20, 16, 20, 16)
	panel.add_child(status_label)
	return panel


func _build_action_panel() -> Control:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", _panel_style(Color(0.05, 0.07, 0.08, 0.91), Color(0.82, 0.68, 0.39, 0.55)))

	var grid := GridContainer.new()
	grid.columns = 3
	grid.add_theme_constant_override("h_separation", 12)
	grid.add_theme_constant_override("v_separation", 12)
	_set_panel_padding(grid, 18, 16, 18, 16)
	panel.add_child(grid)

	claim_button = _action_button("领取闭关")
	claim_button.pressed.connect(func() -> void: Game.claim_offline_reward())
	grid.add_child(claim_button)

	level_button = _action_button("升重")
	level_button.pressed.connect(func() -> void: Game.level_up())
	grid.add_child(level_button)

	breakthrough_button = _action_button("破劫")
	breakthrough_button.pressed.connect(func() -> void: Game.breakthrough())
	grid.add_child(breakthrough_button)

	event_button = _action_button("机缘")
	event_button.pressed.connect(func() -> void: Game.offer_event("manual"))
	grid.add_child(event_button)

	travel_button = _action_button("游历")
	travel_button.pressed.connect(func() -> void: Game.travel_once())
	grid.add_child(travel_button)

	map_button = _action_button("换地图")
	map_button.pressed.connect(func() -> void: Game.cycle_map())
	grid.add_child(map_button)

	spell_button = _action_button("术法")
	spell_button.pressed.connect(func() -> void: Game.upgrade_first_spell())
	grid.add_child(spell_button)

	treasure_button = _action_button("法宝")
	treasure_button.pressed.connect(func() -> void: Game.upgrade_first_treasure())
	grid.add_child(treasure_button)

	fast_forward_button = _action_button("快进半日")
	fast_forward_button.pressed.connect(func() -> void: Game.demo_fast_forward(360))
	grid.add_child(fast_forward_button)

	return panel


func _action_button(text: String) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size = Vector2(0, 92)
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.focus_mode = Control.FOCUS_ALL
	button.add_theme_font_size_override("font_size", 24)
	button.add_theme_stylebox_override("normal", _button_style(Color(0.13, 0.20, 0.20, 0.96), Color(0.66, 0.74, 0.58, 0.66)))
	button.add_theme_stylebox_override("hover", _button_style(Color(0.18, 0.28, 0.27, 0.98), Color(0.94, 0.79, 0.44, 0.86)))
	button.add_theme_stylebox_override("pressed", _button_style(Color(0.10, 0.14, 0.15, 1.0), Color(1.0, 0.83, 0.48, 0.90)))
	button.add_theme_color_override("font_color", Color(0.96, 0.92, 0.80))
	button.add_theme_color_override("font_disabled_color", Color(0.46, 0.50, 0.48))
	return button


func _refresh() -> void:
	if Game.state.is_empty():
		return

	var state := Game.state
	var realm := RealmManager.get_current_realm(state)
	var realm_ui: Dictionary = realm.get("ui", {})
	background_rect.texture = _load_texture(str(BACKGROUND_PATHS.get(str(realm_ui.get("background_phase", "mountain_cave")), BACKGROUND_PATHS["mountain_cave"])))
	character_rect.texture = _load_texture(str(CHARACTER_PATHS.get(str(realm_ui.get("character_phase", "炼气士")), CHARACTER_PATHS["炼气士"])))

	realm_label.text = "%s  战力 %s" % [str(realm.get("realm_name", "")), _format_int(RealmManager.get_combat_power(state))]
	_refresh_resources(state)
	_refresh_progress(state, realm)
	_refresh_map(state)
	_refresh_event_panel()
	_refresh_buttons(state)

	var message := Game.last_message
	if message.is_empty():
		message = str(realm.get("settlement_flavor", realm.get("lore_text", "")))
	status_label.text = message


func _refresh_resources(state: Dictionary) -> void:
	var resources: Dictionary = state.get("resources", {})
	for resource_id in resource_labels.keys():
		var label: Label = resource_labels[resource_id]
		label.text = _format_int(resources.get(resource_id, 0.0))


func _refresh_progress(state: Dictionary, realm: Dictionary) -> void:
	var progress := RealmManager.get_progress(state)
	progress_bar.max_value = max(1.0, float(progress.get("required", 1.0)))
	progress_bar.value = min(float(progress.get("current", 0.0)), progress_bar.max_value)
	progress_label.text = "道行 %s / %s" % [
		_format_int(progress.get("current", 0.0)),
		_format_int(progress.get("required", 0.0)),
	]

	var breakthrough := BreakthroughManager.get_available_breakthrough(state)
	if breakthrough.is_empty():
		var tips_text: Array = []
		for tip in realm.get("feature_tips", []):
			tips_text.append(str(tip))
		rate_label.text = " · ".join(tips_text)
	else:
		rate_label.text = "%s 成功率 %d%%" % [
			str(breakthrough.get("display_name", "破劫")),
			int(round(BreakthroughManager.get_success_rate(state, breakthrough) * 100.0)),
		]

	var lore := str(realm.get("lore_text", ""))
	var visual := str(realm.get("visual_state", ""))
	lore_label.text = "[b]%s[/b]\n%s" % [visual, lore]


func _refresh_map(state: Dictionary) -> void:
	var map_row := DataManager.get_by_id("map_table", str(state.get("current_map_id", "")))
	if map_row.is_empty():
		map_label.text = "洞府闭关中"
		return
	map_label.text = "%s：%s" % [str(map_row.get("map_name", "")), str(map_row.get("entry_text", map_row.get("narrative_desc", "")))]


func _refresh_event_panel() -> void:
	var event_row := Game.get_pending_event()
	event_panel.visible = not event_row.is_empty()
	for child in event_option_box.get_children():
		child.queue_free()

	if event_row.is_empty():
		return

	event_title_label.text = "%s · %s" % [str(event_row.get("event_name", "机缘")), str(event_row.get("fengshen_tag", ""))]
	event_body_label.text = str(event_row.get("narrative_text", ""))

	var options: Array = event_row.get("options", [])
	for i in range(options.size()):
		var option: Dictionary = options[i]
		var option_index := i
		var button := _action_button(str(option.get("text", "选择")))
		button.custom_minimum_size = Vector2(0, 76)
		button.pressed.connect(func() -> void:
			Game.choose_event_option(option_index)
		)
		event_option_box.add_child(button)


func _refresh_buttons(state: Dictionary) -> void:
	var pending_minutes := int(Game.pending_offline_reward.get("minutes", 0))
	claim_button.text = "领取闭关\n%s分钟" % _format_int(pending_minutes)
	level_button.disabled = not RealmManager.can_level_up(state)

	var breakthrough := BreakthroughManager.get_available_breakthrough(state)
	breakthrough_button.disabled = breakthrough.is_empty()
	if breakthrough.is_empty():
		breakthrough_button.text = "破劫"
	else:
		breakthrough_button.text = "破劫\n%d%%" % int(round(BreakthroughManager.get_success_rate(state, breakthrough) * 100.0))

	var event_unlocked := UnlockManager.is_unlocked(state, "event_system") or not str(state.get("pending_event_id", "")).is_empty()
	event_button.disabled = not event_unlocked
	travel_button.disabled = not UnlockManager.is_unlocked(state, "travel")
	map_button.disabled = UnlockManager.get_available_maps(state).size() <= 1
	spell_button.disabled = not UnlockManager.is_unlocked(state, "spell_system")
	treasure_button.disabled = not UnlockManager.is_unlocked(state, "treasure_system")


func _on_toast(message: String) -> void:
	if status_label != null:
		status_label.text = message


func _load_texture(path: String) -> Texture2D:
	if path.is_empty() or not ResourceLoader.exists(path):
		return null
	return load(path)


func _format_int(value: Variant) -> String:
	var number := float(value)
	var abs_number: float = abs(number)
	if abs_number >= 100000000.0:
		return "%.2f亿" % (number / 100000000.0)
	if abs_number >= 10000.0:
		return "%.2f万" % (number / 10000.0)
	return str(int(round(number)))


func _panel_style(bg: Color, border: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = bg
	style.border_color = border
	style.border_width_left = 1
	style.border_width_top = 1
	style.border_width_right = 1
	style.border_width_bottom = 1
	style.corner_radius_top_left = 8
	style.corner_radius_top_right = 8
	style.corner_radius_bottom_left = 8
	style.corner_radius_bottom_right = 8
	style.content_margin_left = 16
	style.content_margin_top = 14
	style.content_margin_right = 16
	style.content_margin_bottom = 14
	return style


func _button_style(bg: Color, border: Color) -> StyleBoxFlat:
	var style := _panel_style(bg, border)
	style.content_margin_left = 8
	style.content_margin_right = 8
	style.content_margin_top = 8
	style.content_margin_bottom = 8
	return style


func _bar_style(bg: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = bg
	style.corner_radius_top_left = 6
	style.corner_radius_top_right = 6
	style.corner_radius_bottom_left = 6
	style.corner_radius_bottom_right = 6
	return style


func _set_margins(container: MarginContainer, left: int, top: int, right: int, bottom: int) -> void:
	container.add_theme_constant_override("margin_left", left)
	container.add_theme_constant_override("margin_top", top)
	container.add_theme_constant_override("margin_right", right)
	container.add_theme_constant_override("margin_bottom", bottom)


func _set_panel_padding(node: Control, left: int, top: int, right: int, bottom: int) -> void:
	node.add_theme_constant_override("margin_left", left)
	node.add_theme_constant_override("margin_top", top)
	node.add_theme_constant_override("margin_right", right)
	node.add_theme_constant_override("margin_bottom", bottom)
