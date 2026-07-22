extends Node


func calculate_offline_reward(state: Dictionary, now_unix: int = -1) -> Dictionary:
	var now := now_unix
	if now <= 0:
		now = Time.get_unix_time_from_system()

	var last_claim := int(state.get("last_claim_time", now))
	var elapsed_seconds := now - last_claim
	if elapsed_seconds < 0:
		return {
			"minutes": 0,
			"resources": {},
			"event_id": "",
			"warning": "本机时间回退，本次不产生闭关收益。",
		}

	var minutes := int(floor(float(elapsed_seconds) / 60.0))
	var effective_minutes := _clamp_offline_minutes(state, minutes)
	if effective_minutes <= 0:
		return {
			"minutes": 0,
			"resources": {},
			"event_id": "",
			"warning": "",
		}

	var reward := calculate_reward_for_minutes(state, effective_minutes)
	var config := DataManager.get_config("offline_config")
	var event_interval := int(config.get("event_check_interval_minutes", 30))
	if str(state.get("pending_event_id", "")).is_empty() and effective_minutes >= event_interval:
		reward["event_id"] = EventManager.roll_event(state, "offline")
	else:
		reward["event_id"] = ""
	reward["warning"] = ""
	return reward


func calculate_reward_for_minutes(state: Dictionary, minutes: int) -> Dictionary:
	var realm := DataManager.get_realm(str(state.get("realm_id", "rq_01")))
	var map_row := DataManager.get_by_id("map_table", str(state.get("current_map_id", "")))
	var daoxing_per_min := float(realm.get("base_daoxing_per_min", 0.0))
	var mana_per_min := float(realm.get("base_mana_per_min", 0.0))

	if not map_row.is_empty():
		daoxing_per_min += float(map_row.get("daoxing_per_min", 0.0))
		mana_per_min += float(map_row.get("mana_per_min", 0.0))

	var multiplier := _effective_multiplier(state)
	var resources := {
		"daoxing": floor(daoxing_per_min * minutes * multiplier),
		"mana": floor(mana_per_min * minutes * multiplier),
	}

	if not map_row.is_empty():
		_merge_resources(resources, _roll_map_drops(state, map_row, minutes))

	return {
		"minutes": minutes,
		"resources": resources,
		"event_id": "",
	}


func _clamp_offline_minutes(state: Dictionary, minutes: int) -> int:
	var config := DataManager.get_config("offline_config")
	var min_minutes := int(config.get("min_offline_minutes", 1))
	if minutes < min_minutes:
		return 0

	var realm := DataManager.get_realm(str(state.get("realm_id", "rq_01")))
	var major_realm := str(realm.get("major_realm", "炼气士"))
	var limits: Dictionary = config.get("default_limit_minutes_by_major_realm", {})
	var limit := int(limits.get(major_realm, 240))

	var created_at := int(state.get("created_at", Time.get_unix_time_from_system()))
	var hours_since_created := float(Time.get_unix_time_from_system() - created_at) / 3600.0
	if hours_since_created <= float(config.get("new_player_bonus_duration_hours", 24)):
		limit = max(limit, int(config.get("new_player_bonus_limit_minutes", limit)))

	var max_single_claim := int(config.get("time_cheat", {}).get("max_single_claim_minutes", limit))
	limit = min(limit, max_single_claim)
	return clamp(minutes, 0, limit)


func _effective_multiplier(state: Dictionary) -> float:
	var config := DataManager.get_config("offline_config")
	var resources: Dictionary = state.get("resources", {})
	var merit := float(resources.get("merit", 0.0))
	var calamity := float(resources.get("calamity", 0.0))

	var merit_bonus: float = min(
		floor(merit / 100.0) * float(config.get("merit_bonus_per_100", 0.0)),
		float(config.get("merit_bonus_cap", 0.0))
	)
	var calamity_penalty: float = min(
		floor(calamity / 100.0) * float(config.get("calamity_penalty_per_100", 0.0)),
		float(config.get("calamity_penalty_cap", 0.0))
	)
	var calamity_bonus: float = min(
		floor(calamity / 100.0) * float(config.get("calamity_reward_bonus_per_100", 0.0)),
		float(config.get("calamity_reward_bonus_cap", 0.0))
	)

	return max(0.1, 1.0 + merit_bonus + calamity_bonus - calamity_penalty)


func _roll_map_drops(state: Dictionary, map_row: Dictionary, minutes: int) -> Dictionary:
	var config := DataManager.get_config("offline_config")
	var interval := int(map_row.get("drop_roll_interval_minutes", config.get("drop_roll_interval_minutes_default", 10)))
	if interval <= 0:
		return {}

	var rolls: int = min(80, int(floor(float(minutes) / float(interval))))
	if rolls <= 0:
		return {}

	var rng := RandomNumberGenerator.new()
	rng.randomize()
	var result: Dictionary = {}
	for roll_index in range(rolls):
		for drop in map_row.get("drop_table", []):
			if not (drop is Dictionary):
				continue
			if not UnlockManager.condition_met(state, str(drop.get("unlock_condition", "open"))):
				continue
			if rng.randf() <= float(drop.get("chance", 0.0)):
				var resource_id := str(drop.get("resource_id", ""))
				var amount := rng.randi_range(int(drop.get("min", 1)), int(drop.get("max", 1)))
				result[resource_id] = float(result.get(resource_id, 0.0)) + amount

	return result


func _merge_resources(target: Dictionary, source: Dictionary) -> void:
	for resource_id in source.keys():
		target[resource_id] = float(target.get(resource_id, 0.0)) + float(source[resource_id])
