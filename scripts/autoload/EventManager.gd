extends Node


func roll_event(state: Dictionary, source: String = "manual") -> String:
	if not UnlockManager.is_unlocked(state, "event_system") and source != "offline":
		return ""

	var candidates := _get_candidates(state, source)
	if candidates.is_empty():
		return ""

	var total_weight := 0.0
	for event_row in candidates:
		total_weight += float(event_row.get("weight", 1.0))

	var rng := RandomNumberGenerator.new()
	rng.randomize()
	var pick := rng.randf_range(0.0, total_weight)
	var cursor := 0.0
	for event_row in candidates:
		cursor += float(event_row.get("weight", 1.0))
		if pick <= cursor:
			return str(event_row.get("event_id", ""))

	return str(candidates[0].get("event_id", ""))


func mark_event_seen(state: Dictionary, event_id: String) -> void:
	var counts: Dictionary = state.get("event_counts_today", {})
	counts[event_id] = int(counts.get(event_id, 0)) + 1
	state["event_counts_today"] = counts


func get_event(event_id: String) -> Dictionary:
	return DataManager.get_by_id("event_table", event_id)


func _get_candidates(state: Dictionary, source: String) -> Array:
	var result: Array = []
	var counts: Dictionary = state.get("event_counts_today", {})
	for event_row in DataManager.get_rows("event_table"):
		var event_id := str(event_row.get("event_id", ""))
		if not UnlockManager.condition_met(state, str(event_row.get("unlock_condition", ""))):
			continue
		if source != "manual":
			var sources: Array = event_row.get("trigger_source", [])
			if not sources.has(source):
				continue
		if int(counts.get(event_id, 0)) >= int(event_row.get("daily_limit", 99)):
			continue
		result.append(event_row)
	return result
