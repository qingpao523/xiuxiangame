"use strict";

const DataManager = {
  tables: {},
  rowsById: {},
  realmOrder: {},
  sortedRealmIds: [],

  async loadAll() {
    const index = await (await fetch("data/data_index.json")).json();
    const payloads = await Promise.all(
      index.tables.map((file) => fetch(`data/${file}`).then((r) => r.json()))
    );
    for (const payload of payloads) {
      const name = payload.table;
      this.tables[name] = payload;
      const idField = ID_FIELDS[name];
      if (!idField) continue;
      const byId = {};
      for (const row of payload.rows || []) {
        if (row && row[idField] != null) byId[String(row[idField])] = row;
      }
      this.rowsById[name] = byId;
    }
    const realms = [...(this.tables.realm_table?.rows || [])].sort(
      (a, b) => (a.sort_order || 0) - (b.sort_order || 0)
    );
    realms.forEach((row, i) => {
      const id = String(row.realm_id);
      this.sortedRealmIds.push(id);
      this.realmOrder[id] = i;
    });
  },

  getRows(name) {
    return this.tables[name]?.rows || [];
  },

  getConfig(name) {
    return this.tables[name]?.config || {};
  },

  getById(name, id) {
    return this.rowsById[name]?.[String(id)] || {};
  },

  getRealm(id) {
    return this.getById("realm_table", id);
  },

  getNextRealmId(id) {
    const i = this.sortedRealmIds.indexOf(id);
    return i >= 0 && i + 1 < this.sortedRealmIds.length ? this.sortedRealmIds[i + 1] : "";
  },

  isRealmAtLeast(currentId, requiredId) {
    if (!requiredId || requiredId === "open" || requiredId === "开局") return true;
    if (!(currentId in this.realmOrder) || !(requiredId in this.realmOrder)) return false;
    return this.realmOrder[currentId] >= this.realmOrder[requiredId];
  },

  getResourceIds() {
    return this.getRows("resource_table").map((r) => String(r.resource_id));
  },
};
