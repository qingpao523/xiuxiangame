extends Node


func get_current_realm(state: Dictionary) -> Dictionary:
	return DataManager.get_realm(str(state.get("realm_id", "rq_01")))


func get_next_realm(state: Dictionary) -> Dictionary:
	var next_id := DataManager.get_next_realm_id(str(state.get("realm_id", "rq_01")))
	if next_id.is_empty():
		return {}
	return DataManager.get_realm(next_id)


func get_progress(state: Dictionary) -> Dictionary:
	var realm := get_current_realm(state)
	var resources: Dictionary = state.get("resources", {})
	var current := float(resources.get("daoxing", 0.0))
	var required := float(realm.get("required_daoxing_to_next", 1.0))
	return {
		"current": current,
		"required": required,
		"ratio": clamp(current / max(1.0, required), 0.0, 1.0),
	}


func can_level_up(state: Dictionary) -> bool:
	var realm := get_current_realm(state)
	if realm.is_empty():
		return false
	if realm.get("breakthrough_id_to_next", null) != null:
		return false
	if get_next_realm(state).is_empty():
		return false

	var resources: Dictionary = state.get("resources", {})
	return float(resources.get("daoxing", 0.0)) >= float(realm.get("required_daoxing_to_next", 0.0))


func level_up(state: Dictionary) -> Dictionary:
	if not can_level_up(state):
		return {
			"ok": false,
			"message": "道行尚浅，还需继续闭关。",
		}

	var current_realm := get_current_realm(state)
	var next_realm := get_next_realm(state)
	var resources: Dictionary = state.get("resources", {})
	var cost := float(current_realm.get("required_daoxing_to_next", 0.0))
	resources["daoxing"] = max(0.0, float(resources.get("daoxing", 0.0)) - cost)
	state["resources"] = resources
	state["realm_id"] = str(next_realm.get("realm_id", state.get("realm_id", "rq_01")))

	return {
		"ok": true,
		"message": "升至%s，道行流转更快。" % str(next_realm.get("realm_name", "")),
		"realm": next_realm,
	}


func get_combat_power(state: Dictionary) -> int:
	var realm := get_current_realm(state)
	var power := float(realm.get("combat_power_base", 0.0))
	var spells: Dictionary = state.get("spells", {})
	for spell_id in spells.keys():
		power += 60.0 * int(spells[spell_id].get("level", 0))

	var treasures: Dictionary = state.get("treasures", {})
	for treasure_id in treasures.keys():
		power += 240.0 * int(treasures[treasure_id].get("level", 0))

	return int(round(power))
