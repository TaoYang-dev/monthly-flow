const SPREADSHEET_ID = "1oDQ5YGgdJ5ndgrQh0idmi9jvO4WqfUAnZDxuYIPDVVs";

function doGet(event) {
  const callback = event.parameter.callback;
  const response = getLatestSnapshotResponse();
  const output = callback
    ? `${callback}(${JSON.stringify(response)});`
    : JSON.stringify(response);

  return ContentService
    .createTextOutput(output)
    .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

function doPost(event) {
  const payload = JSON.parse(event.postData.contents);
  const syncedAt = payload.syncedAt || new Date().toISOString();
  const balance = String(payload.balance || "0");
  const items = Array.isArray(payload.items) ? payload.items : [];
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const itemsSheet = spreadsheet.getSheetByName("Items");
  const snapshotsSheet = spreadsheet.getSheetByName("Snapshots");

  if (items.length) {
    const rows = items.map((item) => [
      syncedAt,
      item.id || "",
      item.type || "",
      item.name || "",
      Number(item.amount) || 0,
      Number(item.day) || "",
      item.category || "",
      item.account || "",
      item.notes || ""
    ]);
    itemsSheet.getRange(itemsSheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }

  snapshotsSheet.appendRow([
    syncedAt,
    items.length,
    balance,
    JSON.stringify(payload)
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, syncedAt }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getLatestSnapshotResponse() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const snapshotsSheet = spreadsheet.getSheetByName("Snapshots");
  const lastRow = snapshotsSheet.getLastRow();

  if (lastRow < 2) {
    return { ok: false, error: "No snapshots found" };
  }

  const payloadJson = snapshotsSheet.getRange(lastRow, 4).getValue();
  return {
    ok: true,
    payload: JSON.parse(payloadJson)
  };
}
