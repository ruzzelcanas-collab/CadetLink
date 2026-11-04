// Paste this into the spreadsheet's Apps Script project, then run
// installNmoHistorySync() once to authorize access and schedule 5-minute updates.
// Removing a synced picture deletes its NMO record from Firebase on the next sync.
const NMO_SPREADSHEET_ID = "1pcaN-_WUZQscs2KiT05sKZkY-b5wwTNn92VwspWE_OU";
const NMO_DATABASE_URL = "https://cadetlink-d53c4-default-rtdb.asia-southeast1.firebasedatabase.app";
const NMO_SHEET_NAME = "NMO History";
const NMO_RECORD_NOTE_PREFIX = "CadetLink NMO record ID: ";

function installNmoHistorySync() {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === "syncNmoHistory")
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger("syncNmoHistory").timeBased().everyMinutes(5).create();
  syncNmoHistory();
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("CadetLink NMO")
    .addItem("Refresh NMO history", "syncNmoHistory")
    .addToUi();
}

function syncNmoHistory() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    syncNmoHistoryLocked();
  } finally {
    lock.releaseLock();
  }
}

function syncNmoHistoryLocked() {
  const response = UrlFetchApp.fetch(`${NMO_DATABASE_URL}/cadetsNmo.json`, {
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) {
    throw new Error(`Firebase NMO records request failed: ${response.getResponseCode()}`);
  }

  let savedRecords = JSON.parse(response.getContentText());
  if (savedRecords !== null && (typeof savedRecords !== "object" || Array.isArray(savedRecords))) {
    throw new Error("Firebase returned an invalid NMO records format.");
  }
  savedRecords = savedRecords || {};

  const spreadsheet = SpreadsheetApp.openById(NMO_SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(NMO_SHEET_NAME) || spreadsheet.insertSheet(NMO_SHEET_NAME);
  const previousLastRow = Math.max(sheet.getLastRow(), 1);
  const imageAnchors = new Set(sheet.getImages().map((image) => {
    const anchor = image.getAnchorCell();
    return `${anchor.getRow()}:${anchor.getColumn()}`;
  }));
  const previousNotes = sheet.getRange(2, 2, Math.max(previousLastRow - 1, 1), 3).getNotes();
  const removedRecordIds = new Set();
  previousNotes.forEach((row, rowOffset) => {
    row.forEach((note, columnOffset) => {
      if (!note.startsWith(NMO_RECORD_NOTE_PREFIX)) return;
      const recordId = note.slice(NMO_RECORD_NOTE_PREFIX.length);
      const anchor = `${rowOffset + 2}:${columnOffset + 2}`;
      if (recordId && !imageAnchors.has(anchor)) removedRecordIds.add(recordId);
    });
  });
  removedRecordIds.forEach((recordId) => {
    const deleteResponse = UrlFetchApp.fetch(
      `${NMO_DATABASE_URL}/cadetsNmo/${encodeURIComponent(recordId)}.json`,
      { method: "delete", muteHttpExceptions: true }
    );
    if (deleteResponse.getResponseCode() !== 200) {
      throw new Error(`Firebase NMO record deletion failed: ${deleteResponse.getResponseCode()}`);
    }
    delete savedRecords[recordId];
  });

  const cadets = new Map();
  Object.entries(savedRecords).forEach(([id, record]) => {
    if (!record || typeof record !== "object" || record.status !== "approved" || !record.cadetUid) return;
    if (!cadets.has(record.cadetUid)) {
      cadets.set(record.cadetUid, { name: record.cadetName || "Name unavailable", records: [] });
    }
    cadets.get(record.cadetUid).records.push({
      id,
      image: record.image,
      approvedAt: Date.parse(record.approvedAt || record.sentAt) || 0
    });
  });

  const rows = [];
  const imageJobs = [];
  [...cadets.values()]
    .sort((first, second) => first.name.localeCompare(second.name))
    .forEach((cadet) => {
      cadet.records.sort((first, second) => first.approvedAt - second.approvedAt || first.id.localeCompare(second.id));
      const nmoCount = cadet.records.length;
      for (let offset = 0; offset < nmoCount; offset += 3) {
        const rowNumber = rows.length + 2;
        const restriction = nmoCount === 2
          ? "Restricted for 2 Months"
          : nmoCount >= 3
            ? "Restricted for 6 months"
            : "";
        rows.push([cadet.name, "", "", "", nmoCount, restriction]);
        cadet.records.slice(offset, offset + 3).forEach((record, index) => {
          if (typeof record.image !== "string" || !/^data:image\/jpeg;base64,/i.test(record.image)) return;
          const base64 = record.image.slice(record.image.indexOf(",") + 1);
          imageJobs.push({
            id: record.id,
            row: rowNumber,
            column: index + 2,
            blob: Utilities.newBlob(
              Utilities.base64Decode(base64),
              "image/jpeg",
              `${cadet.name}-NMO-${offset + index + 1}.jpg`
            )
          });
        });
      }
    });

  sheet.getImages().forEach((image) => image.remove());
  sheet.getRange(2, 2, Math.max(previousLastRow - 1, 1), 3).clearNote();
  sheet.clearContents();
  sheet.getRange(1, 1, 1, 6).setValues([[
    "Cadet Name",
    "NMO Picture 1",
    "NMO Picture 2",
    "NMO Picture 3",
    "Number of NMO Passed",
    "Restriction"
  ]]);
  if (rows.length > 0) sheet.getRange(2, 1, rows.length, 6).setValues(rows);

  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidths(2, 3, 170);
  sheet.setColumnWidth(5, 150);
  sheet.setColumnWidth(6, 190);
  sheet.getRange(1, 1, 1, 6).setFontWeight("bold").setWrap(true);
  if (rows.length > 0) {
    sheet.setRowHeights(2, rows.length, 125);
    sheet.getRange(2, 1, rows.length, 6).setVerticalAlignment("middle");
  }

  imageJobs.forEach((job) => {
    const image = sheet.insertImage(job.blob, job.column, job.row);
    image.setWidth(160).setHeight(110);
    sheet.getRange(job.row, job.column).setNote(`${NMO_RECORD_NOTE_PREFIX}${job.id}`);
  });
}
