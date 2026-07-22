extends Node

const CURRENT_VERSION := 1
const SAVE_DIR := "user://save"
const SAVE_PATH := "user://save/save_v1.json"


func load_or_create() -> Dictionary:
	var state := _load_save()
	if state.is_empty():
		state = create_default_state()
	else:
		state = _migrate(state)

	return normalize_state(state)


func create_default_state() -> Dictionary:
	var now := Time.get_unix_time_from_system()
	var resources: Dictionary = {}
	for resource_id in DataManager.get_resource_ids():
		resources[resource_id] = 0.0

	return {
		"version": CURRENT_VERSION,
		"created_at": now,
		"last_claim_time": now - 120,
		"last_daily_reset_day": Time.get_date_string_from_system(),
		"realm_id": "rq_01",
		"current_map_id": "",
		"resources": resources,
		"unlocked_ids": [],
		"spells": {},
		"treasures": {},
		"breakthrough_fail_counts": {},
		"event_counts_today": {},
		"pending_event_id": "",
		"claimed_bosses": [],
		"temporary_buffs": [],
	}


func save(state: Dictionary) -> bool:
	var absolute_dir := ProjectSettings.globalize_path(SAVE_DIR)
	var dir_err := DirAccess.make_dir_recursive_absolute(absolute_dir)
	if dir_err != OK:
		push_error("Cannot create save directory: %s" % error_string(dir_err))
		return false

	var file := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if file == null:
		push_error("Cannot write save: %s" % error_string(FileAccess.get_open_error()))
		return false

	file.store_string(JSON.stringify(state, "\t"))
	return true


func delete_save() -> bool:
	if not FileAccess.file_exists(SAVE_PATH):
		return true
	var err := DirAccess.remove_absolute(ProjectSettings.globalize_path(SAVE_PATH))
	if err != OK:
		push_error("Cannot delete save: %s" % error_string(err))
		return false
	return true


func normalize_state(state: Dictionary) -> Dictionary:
	state["version"] = int(state.get("version", CURRENT_VERSION))
	state["created_at"] = int(state.get("created_at", Time.get_unix_time_from_system()))
	state["last_claim_time"] = int(state.get("last_claim_time", Time.get_unix_time_from_system()))
	state["last_daily_reset_day"] = str(state.get("last_daily_reset_day", Time.get_date_string_from_system()))
	state["realm_id"] = str(state.get("realm_id", "rq_01"))
	state["current_map_id"] = str(state.get("current_map_id", ""))
	state["unlocked_ids"] = state.get("unlocked_ids", [])
	state["spells"] = state.get("spells", {})
	state["treasures"] = state.get("treasures", {})
	state["breakthrough_fail_counts"] = state.get("breakthrough_fail_counts", {})
	state["event_counts_today"] = state.get("event_counts_today", {})
	state["pending_event_id"] = str(state.get("pending_event_id", ""))
	state["claimed_bosses"] = state.get("claimed_bosses", [])
	state["temporary_buffs"] = state.get("temporary_buffs", [])

	var resources: Dictionary = state.get("resources", {})
	for resource_id in DataManager.get_resource_ids():
		if not resources.has(resource_id):
			resources[resource_id] = 0.0
	state["resources"] = resources

	return state


func _load_save() -> Dictionary:
	if not FileAccess.file_exists(SAVE_PATH):
		return {}

	var text := FileAccess.get_file_as_string(SAVE_PATH)
	var json := JSON.new()
	var err := json.parse(text)
	if err != OK:
		push_error("Save parse failed at line %d: %s" % [json.get_error_line(), json.get_error_message()])
		return {}

	if json.data is Dictionary:
		return json.data
	return {}


func _migrate(state: Dictionary) -> Dictionary:
	var version := int(state.get("version", 0))
	while version < CURRENT_VERSION:
		version += 1
		state["version"] = version
	return state
