extends Node


func refresh_unlocks(state: Dictionary) -> void:
	_reset_daily_event_counts_if_needed(state)

	var unlocked: Array = state.get("unlocked_ids", [])
	for unlock_row in DataManager.get_rows("unlock_table"):
		var unlock_id := str(unlock_row.get("unlock_id", ""))
		var condition := str(unlock_row.get("unlock_realm", ""))
		if condition_met(state, condition) and not unlocked.has(unlock_id):
			unlocked.append(unlock_id)

	var realm := DataManager.get_realm(str(state.get("realm_id", "rq_01")))
	for unlock_id in realm.get("unlock_ids", []):
		if not unlocked.has(str(unlock_id)):
			unlocked.append(str(unlock_id))

	state["unlocked_ids"] = unlocked
	_ensure_default_map(state)


func add_unlocks(state: Dictionary, unlock_ids: Array) -> void:
	var unlocked: Array = state.get("unlocked_ids", [])
	for unlock_id in unlock_ids:
		var id_text := str(unlock_id)
		if not unlocked.has(id_text):
			unlocked.append(id_text)
	state["unlocked_ids"] = unlocked


func is_unlocked(state: Dictionary, unlock_id: String) -> bool:
	var unlocked: Array = state.get("unlocked_ids", [])
	return unlocked.has(unlock_id)


func condition_met(state: Dictionary, condition: String) -> bool:
	if condition.is_empty() or condition == "open" or condition == "开局":
		return true

	var current_realm_id := str(state.get("realm_id", "rq_01"))
	if DataManager.realm_order.has(condition):
		return DataManager.is_realm_at_least(current_realm_id, condition)

	if condition.begins_with("day_"):
		var day_required := int(condition.substr(4))
		return _current_day_number(state) >= day_required

	var unlocked: Array = state.get("unlocked_ids", [])
	if unlocked.has(condition):
		return true

	if str(state.get("current_map_id", "")) == condition:
		return true

	return false


func get_available_maps(state: Dictionary) -> Array:
	var maps: Array = []
	for map_row in DataManager.get_rows("map_table"):
		if condition_met(state, str(map_row.get("unlock_realm", ""))):
			maps.append(map_row)
	maps.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return int(a.get("sort_order", 0)) < int(b.get("sort_order", 0))
	)
	return maps


func get_available_spells(state: Dictionary) -> Array:
	var spells: Array = []
	for spell_row in DataManager.get_rows("spell_table"):
		if condition_met(state, str(spell_row.get("unlock_realm", ""))):
			spells.append(spell_row)
	return spells


func get_available_treasures(state: Dictionary) -> Array:
	var treasures: Array = []
	for treasure_row in DataManager.get_rows("treasure_table"):
		if condition_met(state, str(treasure_row.get("unlock_realm", ""))):
			treasures.append(treasure_row)
	return treasures


func _ensure_default_map(state: Dictionary) -> void:
	if not str(state.get("current_map_id", "")).is_empty():
		return

	var maps := get_available_maps(state)
	if not maps.is_empty():
		state["current_map_id"] = str(maps[0].get("map_id", ""))


func _current_day_number(state: Dictionary) -> int:
	var created_at := int(state.get("created_at", Time.get_unix_time_from_system()))
	var elapsed: int = max(0, Time.get_unix_time_from_system() - created_at)
	return int(floor(float(elapsed) / 86400.0)) + 1


func _reset_daily_event_counts_if_needed(state: Dictionary) -> void:
	var today := Time.get_date_string_from_system()
	if str(state.get("last_daily_reset_day", "")) == today:
		return
	state["last_daily_reset_day"] = today
	state["event_counts_today"] = {}
