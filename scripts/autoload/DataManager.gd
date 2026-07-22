extends Node

const DATA_DIR := "res://data"
const ID_FIELDS := {
	"realm_table": "realm_id",
	"resource_table": "resource_id",
	"map_table": "map_id",
	"spell_table": "spell_id",
	"treasure_table": "treasure_id",
	"event_table": "event_id",
	"breakthrough_table": "breakthrough_id",
	"boss_table": "boss_id",
	"unlock_table": "unlock_id",
}

var tables: Dictionary = {}
var rows_by_table: Dictionary = {}
var rows_by_id: Dictionary = {}
var realm_order: Dictionary = {}
var sorted_realm_ids: Array = []


func load_all_tables() -> void:
	tables.clear()
	rows_by_table.clear()
	rows_by_id.clear()
	realm_order.clear()
	sorted_realm_ids.clear()

	for file_name in _get_table_files():
		_load_table_file(file_name)

	_build_indexes()


func load_json_file(path: String) -> Variant:
	if not FileAccess.file_exists(path):
		push_error("Missing JSON file: %s" % path)
		return null

	var text := FileAccess.get_file_as_string(path)
	var json := JSON.new()
	var err := json.parse(text)
	if err != OK:
		push_error("JSON parse failed: %s:%d %s" % [path, json.get_error_line(), json.get_error_message()])
		return null

	return json.data


func get_table(table_name: String) -> Dictionary:
	return tables.get(table_name, {})


func get_rows(table_name: String) -> Array:
	return rows_by_table.get(table_name, [])


func get_config(table_name: String) -> Dictionary:
	var table: Dictionary = tables.get(table_name, {})
	return table.get("config", {})


func get_by_id(table_name: String, id_value: String) -> Dictionary:
	var table_index: Dictionary = rows_by_id.get(table_name, {})
	return table_index.get(id_value, {})


func get_realm(realm_id: String) -> Dictionary:
	return get_by_id("realm_table", realm_id)


func get_next_realm_id(realm_id: String) -> String:
	var index := sorted_realm_ids.find(realm_id)
	if index >= 0 and index + 1 < sorted_realm_ids.size():
		return str(sorted_realm_ids[index + 1])
	return ""


func is_realm_at_least(current_realm_id: String, required_realm_id: String) -> bool:
	if required_realm_id.is_empty() or required_realm_id == "open" or required_realm_id == "开局":
		return true
	if not realm_order.has(current_realm_id) or not realm_order.has(required_realm_id):
		return false
	return int(realm_order[current_realm_id]) >= int(realm_order[required_realm_id])


func get_resource_ids() -> Array:
	var ids: Array = []
	for row in get_rows("resource_table"):
		ids.append(str(row.get("resource_id", "")))
	return ids


func _get_table_files() -> Array:
	var files: Array = []
	var index_data: Variant = load_json_file("%s/data_index.json" % DATA_DIR)
	if index_data is Dictionary:
		for table_file in index_data.get("tables", []):
			files.append(str(table_file))

	if not files.is_empty():
		return files

	var dir := DirAccess.open(DATA_DIR)
	if dir == null:
		push_error("Cannot open data dir: %s" % DATA_DIR)
		return files

	dir.list_dir_begin()
	var file_name := dir.get_next()
	while not file_name.is_empty():
		if not dir.current_is_dir() and file_name.ends_with(".json") and file_name != "data_index.json":
			files.append(file_name)
		file_name = dir.get_next()
	dir.list_dir_end()
	files.sort()
	return files


func _load_table_file(file_name: String) -> void:
	var path := "%s/%s" % [DATA_DIR, file_name]
	var payload: Variant = load_json_file(path)
	if not (payload is Dictionary):
		return

	var table_name := str(payload.get("table", file_name.get_basename()))
	tables[table_name] = payload
	rows_by_table[table_name] = payload.get("rows", [])


func _build_indexes() -> void:
	for table_name in rows_by_table.keys():
		var id_field := str(ID_FIELDS.get(table_name, ""))
		if id_field.is_empty():
			continue

		var table_index: Dictionary = {}
		for row in rows_by_table[table_name]:
			if row is Dictionary and row.has(id_field):
				table_index[str(row[id_field])] = row
		rows_by_id[table_name] = table_index

	var realm_rows: Array = rows_by_table.get("realm_table", []).duplicate()
	realm_rows.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return int(a.get("sort_order", 0)) < int(b.get("sort_order", 0))
	)

	for index in range(realm_rows.size()):
		var row: Dictionary = realm_rows[index]
		var realm_id := str(row.get("realm_id", ""))
		sorted_realm_ids.append(realm_id)
		realm_order[realm_id] = index
