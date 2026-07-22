extends Node


func get_available_breakthrough(state: Dictionary) -> Dictionary:
	var realm := DataManager.get_realm(str(state.get("realm_id", "rq_01")))
	if realm.is_empty():
		return {}

	var breakthrough_value = realm.get("breakthrough_id_to_next", null)
	if breakthrough_value == null:
		return {}

	var breakthrough_id := str(breakthrough_value)
	if breakthrough_id.is_empty():
		return {}

	return DataManager.get_by_id("breakthrough_table", breakthrough_id)


func get_success_rate(state: Dictionary, breakthrough: Dictionary = {}) -> float:
	var data := breakthrough
	if data.is_empty():
		data = get_available_breakthrough(state)
	if data.is_empty():
		return 0.0

	var resources: Dictionary = state.get("resources", {})
	var fail_counts: Dictionary = state.get("breakthrough_fail_counts", {})
	var fail_count := int(fail_counts.get(str(data.get("breakthrough_id", "")), 0))
	var merit := float(resources.get("merit", 0.0))
	var calamity := float(resources.get("calamity", 0.0))

	var merit_bonus: float = min(floor(merit / 100.0) * 0.005, float(data.get("merit_bonus_cap", 0.2)))
	var calamity_penalty: float = min(floor(calamity / 100.0) * 0.003, float(data.get("calamity_penalty_cap", 0.15)))
	var fail_bonus: float = fail_count * float(data.get("fail_bonus", 0.0))
	var rate: float = float(data.get("base_success_rate", 0.0)) + merit_bonus + fail_bonus - calamity_penalty

	return clamp(rate, float(data.get("min_success_rate", 0.0)), float(data.get("max_success_rate", 1.0)))


func try_breakthrough(state: Dictionary) -> Dictionary:
	var data := get_available_breakthrough(state)
	if data.is_empty():
		return {
			"ok": false,
			"message": "当前境界暂无破劫。",
		}

	var resources: Dictionary = state.get("resources", {})
	var required_daoxing := float(data.get("required_daoxing", 0.0))
	if float(resources.get("daoxing", 0.0)) < required_daoxing:
		return {
			"ok": false,
			"message": "破劫道行不足，还需闭关积累。",
		}

	var breakthrough_id := str(data.get("breakthrough_id", ""))
	var fail_counts: Dictionary = state.get("breakthrough_fail_counts", {})
	var fail_count := int(fail_counts.get(breakthrough_id, 0))
	var guarantee_after := int(data.get("guarantee_after_fail", 99))
	var rate := get_success_rate(state, data)
	var rng := RandomNumberGenerator.new()
	rng.randomize()
	var success := fail_count >= guarantee_after or rng.randf() <= rate

	if success:
		resources["daoxing"] = max(0.0, float(resources.get("daoxing", 0.0)) - required_daoxing)
		state["resources"] = resources
		state["realm_id"] = str(data.get("to_realm", state.get("realm_id", "rq_01")))
		fail_counts[breakthrough_id] = 0
		state["breakthrough_fail_counts"] = fail_counts

		var success_rewards: Dictionary = data.get("success_rewards", {})
		UnlockManager.add_unlocks(state, success_rewards.get("unlock_ids", []))
		return {
			"ok": true,
			"success": true,
			"rate": rate,
			"message": str(data.get("success_text", "破劫成功。")),
		}

	fail_counts[breakthrough_id] = fail_count + 1
	state["breakthrough_fail_counts"] = fail_counts
	var fail_rewards: Dictionary = data.get("fail_rewards", {})
	var mana_percent := float(fail_rewards.get("mana_percent", 0.0))
	if mana_percent > 0.0:
		resources["mana"] = float(resources.get("mana", 0.0)) + max(100.0, float(resources.get("mana", 0.0)) * mana_percent)
	state["resources"] = resources

	return {
		"ok": true,
		"success": false,
		"rate": rate,
		"message": str(data.get("fail_text", "破劫未成，但道心更稳。")),
	}
