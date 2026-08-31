/* 封神修道录 · 六抽屉独立渲染单元：境界（design/19.0 G2，A4-②）
 * 由 ui.js renderRealmPanel 逐字迁出，逻辑零改（test/ui-regression.test.js 黄金快照钉死口径）。
 * 运行时依赖（全局符号，调用时解析）：ui.js note/popupButton/closePanelSheet/drainPopupQueue/playLevelUpFx；realm-manager.js getFactionRow/getPhaseRealmName/getRaceShortName/getRealmLifespan/RealmManager；game.js GOD_SEATS/getTitle/Game；breakthrough-manager.js BreakthroughManager；utils.js int/str/formatInt。
 */

"use strict";

// 境界面板
function renderRealmPanel(body, state) {
  const realm = RealmManager.getCurrentRealm(state);
  const progress = RealmManager.getProgress(state);
  const raceTag = getRaceShortName(state);
  const faction = getFactionRow(state);
  const rb = state.rebirth || {};
  const rebirthLine = int(rb.count) > 0 ? `\n历世：第${rb.count + 1}世｜道痕 ${int(rb.daohen)}｜宿慧 +${Math.round(int(rb.daohen) * 3 + (rb.races_seen || []).length)}%` : "";
  const factionLine = Object.keys(faction).length ? `势力：${faction.faction_name}（${faction.dojo}）\n护持：${faction.passive_name}——${faction.passive_desc}` : (RealmManager.isCapped(state) ? "势力：尚未入局——你已立身天仙之境，四方皆在等你落子。" : "势力：未入局（立身天仙之境后，须择一方势力）");
  // 真灵上榜：已得神位
  let seatText = "";
  if (state.god_seats?.length) {
    const seatNames = state.god_seats.map((id) => { const s = GOD_SEATS.find((g) => g.id === id); return s ? s.name + "：" + s.desc : ""; });
    seatText = `\n真灵上榜：\n${seatNames.join("\n")}`;
  }
  // 21.1 §1.4 榜上留名：有留名才显示（N=0 不显示——榜上无名留白，且黄金快照零漂移）
  const marksN = int(state.list_marks);
  const marksText = marksN > 0 ? `\n榜上留名：${marksN} 缕——榜文笔下记过的名字，天庭自会差人来问。` : "";
  body.appendChild(note(`${getPhaseRealmName(realm)}｜${raceTag ? `${raceTag}·` : ""}${getTitle(state)}\n寿元：${getRealmLifespan(realm)}\n${factionLine}${rebirthLine}${seatText}${marksText}\n\n${realm.visual_state || ""}\n\n${realm.lore_text || ""}\n\n道行 ${formatInt(progress.current)} / ${formatInt(progress.required)}　战力 ${formatInt(RealmManager.getCombatPower(state))}`));
  // 21.3 §3.4 S1 名位档案：多维画像，不是单一可比标量（R1 护栏：档案腔，非进度逼迫）；全空不渲染（新号零负担）
  const witnessedN = Array.isArray(state.witnessed) ? state.witnessed.length : 0;
  const seatsSeen = Array.isArray(rb.god_seats_seen) ? rb.god_seats_seen.length : 0;
  const endingRow = str(state.ending_id, "") ? DataManager.getById("unlock_table", "ending_" + str(state.ending_id, "")) : {};
  const hasArchive = marksN > 0 || (state.god_seats || []).length > 0 || witnessedN > 0 || int(rb.count) > 0 || Object.keys(endingRow).length > 0 || num(state.resources.merit) > 0;
  if (hasArchive) {
    const seatRows = DataManager.getRows("god_seat_table");
    const totalSeats = seatRows.length || 36;
    const archiveLines = [
      `榜上留名：${marksN} 缕——榜文笔下，自有记认`,
      `功德：${formatInt(num(state.resources.merit))}——顺天护生所得清明之力`,
      `神位：此生 ${(state.god_seats || []).length}/6 部｜历世档案 ${seatsSeen}/${totalSeats} 位`,
      `见闻：${witnessedN} 条众生结局入眼`,
      `历世：${int(rb.count)} 世｜道痕 ${int(rb.daohen)} 点`,
    ];
    if (Object.keys(endingRow).length) archiveLines.push(`结局：${endingRow.unlock_name}——名位已定，道果已成`);
    body.appendChild(note(`名位档案（劫中之我，非数字可量）：\n${archiveLines.join("\n")}`));
  }
  const breakthrough = BreakthroughManager.getAvailable(state);
  if (Object.keys(breakthrough).length) {
    body.appendChild(note(`${breakthrough.pressure_label || "劫将至"}：${breakthrough.breakthrough_lore || ""}`));
    body.appendChild(popupButton(`${breakthrough.display_name}（${Math.round(BreakthroughManager.getSuccessRate(state) * 100)}%）`, false, () => { closePanelSheet(); Game.requestBreakthrough(); }));
  } else if (RealmManager.canLevelUp(state)) {
    body.appendChild(popupButton("道行已满，升重", false, () => { closePanelSheet(); playLevelUpFx(() => Game.levelUp()); }));
  } else if (RealmManager.isCapped(state)) {
    body.appendChild(note(`你已至${getPhaseRealmName(realm)}，当前版本修行暂止。`));
    if (!str(state.faction_id, "")) body.appendChild(popupButton("择势力入局", false, () => { closePanelSheet(); Game._maybeQueueFactionChoice(); drainPopupQueue(); }));
    body.appendChild(popupButton("查看天仙篇预告", false, () => { closePanelSheet(); Game.showCapNotice(); }));
    // 应劫转世
    if (Game.canReincarnate()) {
      const preview = Game.getRebirthPreview();
      body.appendChild(popupButton("应劫转世（凝此生为道痕）", false, () => {
        closePanelSheet();
        Game.queuePopup({
          kind: "text", style: "breakthrough", title: "应劫转世？",
          body: `此生修至${getPhaseRealmName(realm)}。\n\n转世之后：境界、资源、术法、法宝尽数重走；\n此生凝作道痕 +${preview.gain}（共 ${preview.daohenAfter} 点）——每点道痕，来世收益 +3%；\n此生跟脚${preview.raceNew ? "将录入图鉴，来世再添 +1%" : "已入图鉴"}。\n历世记录与操作偏好保留。`,
          buttons: [{ label: "应劫转世", action: "reincarnate" }, { label: "暂不转世" }],
        });
        drainPopupQueue();
      }));
    }
  } else {
    body.appendChild(note(`下一境：${getPhaseRealmName(RealmManager.getNextRealm(state))}\n继续闭关或修行，积累道行。`));
  }
}

window.PANEL_UNITS = window.PANEL_UNITS || {};
window.PANEL_UNITS.realm = { title: "境界", render: renderRealmPanel };
