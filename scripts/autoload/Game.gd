extends Node

signal state_changed
signal toast(message: String)
signal reward_claimed(reward: Dictionary)
signal event_offered(event_id: String)
signal breakthrough_finished(result: Dictionary)

var state: Dictionary = {}
var pending_offline_reward: Dictionary = {}
var last_message := ""


func _ready() -> void:
	DataManager.load_all_tables()
	state = SaveManager.load_or_create()
	UnlockManager.refresh_unlocks(state)
	_refresh_pending_reward()
	SaveManager.save(state)
	state_changed.emit()


func claim_offline_reward() -> Dictionary:
	var reward := pending_offline_reward
	if int(reward.get("minutes", 0)) <= 0:
		_set_message("闭关未满一刻，暂无可领取收益。")
		return reward

	_apply_resource_delta(reward.get("resources", {}))
	state["last_claim_time"] = Time.get_unix_time_from_system()
	var event_id := str(reward.get("event_id", ""))
	if not event_id.is_empty():
		state["pending_event_id"] = event_id
		event_offered.emit(event_id)

	_after_state_mutated()
	reward_claimed.emit(reward)
	_set_message(_format_reward_message("领取闭关", reward))
	return reward


func level_up() -> Dictionary:
	var result := RealmManager.level_up(state)
	if bool(result.get("ok", false)):
		UnlockManager.refresh_unlocks(state)
	_after_state_mutated()
	_set_message(str(result.get("message", "")))
	return result


func breakthrough() -> Dictionary:
	var result := BreakthroughManager.try_breakthrough(state)
	if bool(result.get("ok", false)):
		UnlockManager.refresh_unlocks(state)
	_after_state_mutated()
	breakthrough_finished.emit(result)
	_set_message(str(result.get("message", "")))
	return result


func offer_event(source: String = "manual") -> String:
	var current_pending := str(state.get("pending_event_id", ""))
	if not current_pending.is_empty():
		event_offered.emit(current_pending)
		_set_message("有一段机缘尚未抉择。")
		return current_pending

	var event_id := EventManager.roll_event(state, source)
	if event_id.is_empty():
		_set_message("暂未感应到新的机缘。")
		return ""

	state["pending_event_id"] = event_id
	event_offered.emit(event_id)
	_after_state_mutated()
	_set_message("天边榜文微动，一段机缘浮现。")
	return event_id


func choose_event_option(option_index: int) -> Dictionary:
	var event_id := str(state.get("pending_event_id", ""))
	var event_row := EventManager.get_event(event_id)
	if event_row.is_empty():
		_set_message("当前没有待处理的机缘。")
		return {"ok": false}

	var options: Array = event_row.get("options", [])
	if option_index < 0 or option_index >= options.size():
		_set_message("机缘选项无效。")
		return {"ok": false}

	var option: Dictionary = options[option_index]
	var reward_payload: Dictionary = option.get("reward", {})
	var reward := _apply_event_reward(reward_payload)
	EventManager.mark_event_seen(state, event_id)
	state["pending_event_id"] = ""

	_after_state_mutated()
	var message := "%s：%s" % [str(event_row.get("event_name", "机缘")), str(option.get("text", ""))]
	if not reward.get("resources", {}).is_empty():
		message += "\n" + _format_resource_delta(reward.get("resources", {}))
	_set_message(message)
	return {
		"ok": true,
		"event": event_row,
		"option": option,
		"reward": reward,
	}


func travel_once() -> Dictionary:
	if not UnlockManager.is_unlocked(state, "travel"):
		_set_message("游历尚未开启。")
		return {"ok": false}

	var maps := UnlockManager.get_available_maps(state)
	if maps.is_empty():
		_set_message("暂无可游历之地。")
		return {"ok": false}

	var current_map_id := str(state.get("current_map_id", ""))
	var index := 0
	for i in range(maps.size()):
		if str(maps[i].get("map_id", "")) == current_map_id:
			index = i
			break
	state["current_map_id"] = str(maps[index].get("map_id", ""))

	var reward := RewardManager.calculate_reward_for_minutes(state, 15)
	_apply_resource_delta(reward.get("resources", {}))
	if str(state.get("pending_event_id", "")).is_empty():
		var event_id := EventManager.roll_event(state, "travel")
		if not event_id.is_empty():
			state["pending_event_id"] = event_id
			reward["event_id"] = event_id

	_after_state_mutated()
	_set_message(_format_reward_message("游历%s" % str(maps[index].get("map_name", "")), reward))
	return {
		"ok": true,
		"reward": reward,
		"map": maps[index],
	}


func cycle_map() -> void:
	var maps := UnlockManager.get_available_maps(state)
	if maps.is_empty():
		return

	var current_map_id := str(state.get("current_map_id", ""))
	var index := 0
	for i in range(maps.size()):
		if str(maps[i].get("map_id", "")) == current_map_id:
			index = i
			break
	var next_index := (index + 1) % maps.size()
	state["current_map_id"] = str(maps[next_index].get("map_id", ""))
	_after_state_mutated()
	_set_message("前往%s。" % str(maps[next_index].get("map_name", "")))


func upgrade_first_spell() -> Dictionary:
	var spells := UnlockManager.get_available_spells(state)
	if spells.is_empty():
		_set_message("术法尚未开启。")
		return {"ok": false}

	var spell_row: Dictionary = spells[0]
	var spell_id := str(spell_row.get("spell_id", ""))
	var spell_state := _get_spell_state(spell_id)
	var next_level := int(spell_state.get("level", 0)) + 1
	var cost := _get_spell_upgrade_cost(spell_row, next_level)
	var resources: Dictionary = state.get("resources", {})
	if float(resources.get("spell_page", 0.0)) < float(cost.get("spell_page_cost", 0.0)) or float(resources.get("mana", 0.0)) < float(cost.get("mana_cost", 0.0)):
		_set_message("%s升级材料不足。" % str(spell_row.get("spell_name", "术法")))
		return {"ok": false}

	resources["spell_page"] = float(resources.get("spell_page", 0.0)) - float(cost.get("spell_page_cost", 0.0))
	resources["mana"] = float(resources.get("mana", 0.0)) - float(cost.get("mana_cost", 0.0))
	state["resources"] = resources
	spell_state["level"] = next_level
	spell_state["unlocked"] = true
	var spells_state: Dictionary = state.get("spells", {})
	spells_state[spell_id] = spell_state
	state["spells"] = spells_state

	_after_state_mutated()
	_set_message("%s提升至%d重。" % [str(spell_row.get("spell_name", "术法")), next_level])
	return {"ok": true}


func upgrade_first_treasure() -> Dictionary:
	var treasures := UnlockManager.get_available_treasures(state)
	if treasures.is_empty():
		_set_message("本命法宝尚未开启。")
		return {"ok": false}

	var treasure_row: Dictionary = treasures[0]
	var treasure_id := str(treasure_row.get("treasure_id", ""))
	var treasure_state := _get_treasure_state(treasure_id)
	var next_level := int(treasure_state.get("level", 0)) + 1
	var cost := _get_treasure_upgrade_cost(treasure_row, next_level)
	var resources: Dictionary = state.get("resources", {})
	if float(resources.get("treasure_shard", 0.0)) < float(cost.get("treasure_shard_cost", 0.0)) or float(resources.get("mana", 0.0)) < float(cost.get("mana_cost", 0.0)):
		_set_message("%s温养材料不足。" % str(treasure_row.get("treasure_name", "法宝")))
		return {"ok": false}

	resources["treasure_shard"] = float(resources.get("treasure_shard", 0.0)) - float(cost.get("treasure_shard_cost", 0.0))
	resources["mana"] = float(resources.get("mana", 0.0)) - float(cost.get("mana_cost", 0.0))
	state["resources"] = resources
	treasure_state["level"] = next_level
	treasure_state["owned"] = true
	var treasures_state: Dictionary = state.get("treasures", {})
	treasures_state[treasure_id] = treasure_state
	state["treasures"] = treasures_state

	_after_state_mutated()
	_set_message("%s温养至%d重。" % [str(treasure_row.get("treasure_name", "法宝")), next_level])
	return {"ok": true}


func demo_fast_forward(minutes: int = 180) -> void:
	state["last_claim_time"] = int(state.get("last_claim_time", Time.get_unix_time_from_system())) - max(1, minutes) * 60
	_refresh_pending_reward()
	SaveManager.save(state)
	state_changed.emit()
	_set_message("闭关%s分钟，可收取新收益。" % str(minutes))


func get_pending_event() -> Dictionary:
	return EventManager.get_event(str(state.get("pending_event_id", "")))


func _after_state_mutated() -> void:
	state = SaveManager.normalize_state(state)
	UnlockManager.refresh_unlocks(state)
	_refresh_pending_reward()
	SaveManager.save(state)
	state_changed.emit()


func _refresh_pending_reward() -> void:
	pending_offline_reward = RewardManager.calculate_offline_reward(state)


func _apply_resource_delta(delta: Dictionary) -> void:
	var resources: Dictionary = state.get("resources", {})
	for resource_id in delta.keys():
		resources[resource_id] = max(0.0, float(resources.get(resource_id, 0.0)) + float(delta[resource_id]))
	state["resources"] = resources


func _apply_event_reward(reward_payload: Dictionary) -> Dictionary:
	var resources: Dictionary = {}
	_merge_resources(resources, reward_payload.get("resources", {}))

	if reward_payload.has("random_bonus"):
		var random_bonus: Dictionary = reward_payload.get("random_bonus", {})
		var rng := RandomNumberGenerator.new()
		rng.randomize()
		if rng.randf() <= float(random_bonus.get("chance", 0.0)):
			_merge_resources(resources, random_bonus.get("resources", {}))

	if reward_payload.has("spell_pages_by_type"):
		var pages: Dictionary = reward_payload.get("spell_pages_by_type", {})
		var total := 0.0
		for key in pages.keys():
			total += float(pages[key])
		resources["spell_page"] = float(resources.get("spell_page", 0.0)) + total

	if reward_payload.has("treasure_shards_by_id"):
		var shards: Dictionary = reward_payload.get("treasure_shards_by_id", {})
		var total_shards := 0.0
		for key in shards.keys():
			total_shards += float(shards[key])
		resources["treasure_shard"] = float(resources.get("treasure_shard", 0.0)) + total_shards

	if reward_payload.has("root_progress"):
		resources["daoxing"] = float(resources.get("daoxing", 0.0)) + float(reward_payload.get("root_progress", 0.0))

	if reward_payload.has("breakthrough_pressure_reduce"):
		var state_resources: Dictionary = state.get("resources", {})
		resources["calamity"] = float(resources.get("calamity", 0.0)) - ceil(float(state_resources.get("calamity", 0.0)) * float(reward_payload.get("breakthrough_pressure_reduce", 0.0)))

	_apply_resource_delta(resources)
	return {"resources": resources}


func _merge_resources(target: Dictionary, source: Dictionary) -> void:
	for resource_id in source.keys():
		target[resource_id] = float(target.get(resource_id, 0.0)) + float(source[resource_id])


func _get_spell_state(spell_id: String) -> Dictionary:
	var spells: Dictionary = state.get("spells", {})
	if not spells.has(spell_id):
		spells[spell_id] = {"level": 0, "unlocked": false}
		state["spells"] = spells
	return spells[spell_id]


func _get_treasure_state(treasure_id: String) -> Dictionary:
	var treasures: Dictionary = state.get("treasures", {})
	if not treasures.has(treasure_id):
		treasures[treasure_id] = {"level": 0, "owned": false}
		state["treasures"] = treasures
	return treasures[treasure_id]


func _get_spell_upgrade_cost(spell_row: Dictionary, to_level: int) -> Dictionary:
	for cost in spell_row.get("upgrade_costs", []):
		if int(cost.get("to_level", 0)) == to_level:
			return cost
	return {"spell_page_cost": 999999, "mana_cost": 999999}


func _get_treasure_upgrade_cost(treasure_row: Dictionary, to_level: int) -> Dictionary:
	for cost in treasure_row.get("level_growth", []):
		if int(cost.get("level", 0)) == to_level:
			return cost
	return {"treasure_shard_cost": 999999, "mana_cost": 999999}


func _set_message(message: String) -> void:
	last_message = message
	toast.emit(message)
	state_changed.emit()


func _format_reward_message(prefix: String, reward: Dictionary) -> String:
	return "%s %d分钟\n%s" % [
		prefix,
		int(reward.get("minutes", 0)),
		_format_resource_delta(reward.get("resources", {})),
	]


func _format_resource_delta(resources: Dictionary) -> String:
	var parts: Array = []
	for resource_id in resources.keys():
		var amount := float(resources[resource_id])
		if amount == 0.0:
			continue
		var row := DataManager.get_by_id("resource_table", str(resource_id))
		var display_name := str(row.get("resource_name", resource_id))
		parts.append("%s %+d" % [display_name, int(round(amount))])
	return "，".join(parts)
