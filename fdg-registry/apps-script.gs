/**
 * Muscle FDG Registry — Google Sheets backend
 * -------------------------------------------------
 * Paste this into Extensions ▸ Apps Script of your Google Sheet,
 * then Deploy ▸ New deployment ▸ Web app:
 *     Execute as:      Me
 *     Who has access:  Anyone
 * Copy the resulting /exec URL into the app's ⚙ settings.
 *
 * The app POSTs JSON: { fields: [ordered column keys], records: [ {..}, {..} ] }
 * with Content-Type text/plain (keeps it a CORS "simple request").
 * This script writes a header row on first use and appends one row per record,
 * keeping columns aligned to `fields` even as the schema grows.
 */

var SHEET_NAME = 'Data';

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    var payload = JSON.parse(e.postData.contents);
    var fields  = payload.fields || [];
    var records = payload.records || [];

    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

    // Ensure a header row exists and covers every incoming field.
    var header = sheet.getLastRow() > 0
      ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].filter(String)
      : [];

    if (header.length === 0) {
      header = fields.slice();
      sheet.getRange(1, 1, 1, header.length).setValues([header]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, header.length).setFontWeight('bold');
    } else {
      // Append any new keys the client sent that aren't in the sheet yet.
      var added = false;
      fields.forEach(function (f) {
        if (header.indexOf(f) === -1) { header.push(f); added = true; }
      });
      if (added) sheet.getRange(1, 1, 1, header.length).setValues([header]);
    }

    // Build rows aligned to the (possibly extended) header order.
    var rows = records.map(function (rec) {
      return header.map(function (col) {
        return rec.hasOwnProperty(col) && rec[col] !== null && rec[col] !== undefined ? rec[col] : '';
      });
    });

    if (rows.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, header.length).setValues(rows);
    }

    return json({ ok: true, inserted: rows.length });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return json({ ok: true, service: 'Muscle FDG Registry', hint: 'POST records here.' });
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
