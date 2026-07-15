/**
 * Muscle FDG Registry — Google Sheets backend
 * Access control + two-way edit + per-site uptake findings.
 * ---------------------------------------------------------------------------
 * After ANY code change: Deploy > Manage deployments > edit > New version.
 *
 * Two tabs are used:
 *   Data     — one row per patient (patient-level fields + findings_count/summary)
 *   Findings — one row per muscle/site finding, linked by record_id
 *
 * Actions (JSON body):
 *   save   -> append patient row(s) + their findings
 *   lookup -> find patient rows by patient_id, each with its findings[] attached
 *   update -> overwrite one patient row in place and replace its findings
 *
 * On update, record_id/submitted_at/authorized_as are preserved; updated_by/at set.
 * Only active keys in the "Access" tab may do anything.
 */

var DATA_SHEET     = 'Data';
var FINDINGS_SHEET = 'Findings';
var ACCESS_SHEET   = 'Access';
var PROTECTED      = ['record_id', 'submitted_at', 'authorized_as'];
var FIND_COLS      = ['record_id', 'patient_id', 'region', 'muscle', 'laterality', 'grade'];

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    var payload = JSON.parse(e.postData.contents);
    var key = (payload.key || '').toString().trim();
    var action = (payload.action || 'save').toString();

    var who = resolveKey(key);
    if (!who) return json({ ok: false, error: 'unauthorized' });

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(DATA_SHEET) || ss.insertSheet(DATA_SHEET);

    if (action === 'lookup') return handleLookup(sheet, payload);
    if (action === 'update') return handleUpdate(sheet, payload, who);
    return handleSave(sheet, payload, who);
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return json({ ok: true, service: 'Muscle FDG Registry', hint: 'POST records here with a valid key.' });
}

/* ---------- append new records + findings ---------- */
function handleSave(sheet, payload, who) {
  var fields = payload.fields || [];
  var records = payload.records || [];
  if (fields.indexOf('authorized_as') === -1) fields = fields.concat(['authorized_as']);
  records.forEach(function (r) { r.authorized_as = who; });

  var header = ensureHeader(sheet, fields);
  var rows = records.map(function (rec) { return header.map(function (c) { return cell(rec, c); }); });
  if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, header.length).setValues(rows);

  records.forEach(function (rec) {
    if (rec._findings && rec._findings.length) writeFindings(rec.record_id, rec.patient_id, rec._findings);
  });
  return json({ ok: true, inserted: rows.length, authorized_as: who });
}

/* ---------- lookup with findings attached ---------- */
function handleLookup(sheet, payload) {
  var pid = (payload.patient_id || '').toString().trim().toLowerCase();
  if (!pid) return json({ ok: false, error: 'no-patient-id' });
  if (sheet.getLastRow() < 2) return json({ ok: true, records: [] });

  var values = sheet.getDataRange().getValues();
  var header = values[0];
  var pidCol = header.indexOf('patient_id');
  if (pidCol === -1) return json({ ok: true, records: [] });

  var findMap = readFindingsByRecord();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    if ((values[i][pidCol] || '').toString().trim().toLowerCase() === pid) {
      var obj = rowToObj(header, values[i]);
      obj.findings = findMap[String(obj.record_id).trim()] || [];
      out.push(obj);
    }
  }
  return json({ ok: true, records: out });
}

/* ---------- update one record + replace its findings ---------- */
function handleUpdate(sheet, payload, who) {
  var rid = (payload.record_id || '').toString().trim();
  var incoming = (payload.records && payload.records[0]) || {};
  if (!rid) return json({ ok: false, error: 'no-record-id' });

  var fields = payload.fields || [];
  ['updated_at', 'updated_by'].forEach(function (f) { if (fields.indexOf(f) === -1) fields.push(f); });
  var header = ensureHeader(sheet, fields);

  var values = sheet.getDataRange().getValues();
  var ridCol = header.indexOf('record_id');
  var target = -1;
  for (var i = 1; i < values.length; i++) {
    if ((values[i][ridCol] || '').toString().trim() === rid) { target = i; break; }
  }
  if (target === -1) return json({ ok: false, error: 'not-found' });

  var existing = rowToObj(header, values[target]);
  incoming.updated_at = new Date().toISOString();
  incoming.updated_by = who;

  var newRow = header.map(function (col) {
    if (PROTECTED.indexOf(col) !== -1) return existing[col];
    if (incoming.hasOwnProperty(col)) return incoming[col];
    return existing.hasOwnProperty(col) ? existing[col] : '';
  });
  sheet.getRange(target + 1, 1, 1, header.length).setValues([newRow]);

  // replace findings for this record
  deleteFindings(rid);
  var pid = existing.patient_id;
  if (incoming._findings && incoming._findings.length) writeFindings(rid, pid, incoming._findings);

  return json({ ok: true, updated: 1, record_id: rid, updated_by: who });
}

/* ---------- Findings tab helpers ---------- */
function findingsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(FINDINGS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(FINDINGS_SHEET);
    sh.getRange(1, 1, 1, FIND_COLS.length).setValues([FIND_COLS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function writeFindings(rid, pid, arr) {
  var sh = findingsSheet();
  var rows = arr.map(function (f) {
    return [rid, pid, f.region || '', f.muscle || '', f.laterality || '', (f.grade === '' || f.grade == null) ? '' : f.grade];
  });
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, FIND_COLS.length).setValues(rows);
}
function deleteFindings(rid) {
  var sh = findingsSheet();
  if (sh.getLastRow() < 2) return;
  var vals = sh.getDataRange().getValues();
  for (var i = vals.length - 1; i >= 1; i--) {          // bottom-up so indices stay valid
    if ((vals[i][0] || '').toString().trim() === rid) sh.deleteRow(i + 1);
  }
}
function readFindingsByRecord() {
  var sh = findingsSheet();
  var map = {};
  if (sh.getLastRow() < 2) return map;
  var vals = sh.getDataRange().getValues();
  var h = vals[0];
  for (var i = 1; i < vals.length; i++) {
    var o = rowToObj(h, vals[i]);
    var rid = String(o.record_id).trim();
    if (!rid) continue;
    if (!map[rid]) map[rid] = [];
    map[rid].push({ region: o.region || '', muscle: o.muscle || '', laterality: o.laterality || '', grade: o.grade === '' ? '' : o.grade });
  }
  return map;
}

/* ---------- generic helpers ---------- */
function ensureHeader(sheet, fields) {
  var header = sheet.getLastRow() > 0
    ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].filter(String)
    : [];
  if (header.length === 0) {
    header = fields.slice();
    sheet.getRange(1, 1, 1, header.length).setValues([header]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, header.length).setFontWeight('bold');
  } else {
    var added = false;
    fields.forEach(function (f) { if (header.indexOf(f) === -1) { header.push(f); added = true; } });
    if (added) sheet.getRange(1, 1, 1, header.length).setValues([header]);
  }
  return header;
}
function rowToObj(header, row) { var o = {}; for (var i = 0; i < header.length; i++) if (header[i]) o[header[i]] = row[i]; return o; }
function cell(rec, col) { return (rec.hasOwnProperty(col) && rec[col] !== null && rec[col] !== undefined) ? rec[col] : ''; }

/* ---------- access-key validation ---------- */
function resolveKey(key) {
  if (!key) return '';
  var sheet = ensureAccessSheet();
  var last = sheet.getLastRow();
  if (last < 2) return '';
  var rows = sheet.getRange(2, 1, last - 1, 3).getValues();
  for (var i = 0; i < rows.length; i++) {
    var k = (rows[i][0] || '').toString().trim();
    var active = (rows[i][2] || '').toString().trim().toLowerCase();
    if (k && k === key && (active === 'yes' || active === 'y' || active === 'true' || active === '1')) {
      return (rows[i][1] || 'unknown').toString().trim();
    }
  }
  return '';
}
function ensureAccessSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(ACCESS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(ACCESS_SHEET);
    sheet.getRange(1, 1, 1, 3).setValues([['key', 'name', 'active']]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 180); sheet.setColumnWidth(2, 200);
  }
  return sheet;
}

/* ---------- PI menu ---------- */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('FDG Registry')
    .addItem('Add collaborator (new key)', 'menuAddCollaborator')
    .addItem('List / manage keys', 'menuOpenAccess')
    .addToUi();
}
function menuAddCollaborator() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.prompt('Add collaborator', "Enter the person's name or initials:", ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var name = resp.getResponseText().trim();
  if (!name) { ui.alert('No name entered.'); return; }
  var sheet = ensureAccessSheet();
  var key = newKey();
  sheet.appendRow([key, name, 'Yes']);
  ui.alert('Key created for ' + name,
    'Access key:\n\n' + key +
    '\n\nSend this to ' + name + ' privately. They paste it into the app settings.' +
    '\nRevoke later by setting their "active" cell to No.', ui.ButtonSet.OK);
}
function menuOpenAccess() {
  var sheet = ensureAccessSheet();
  SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(sheet);
  SpreadsheetApp.getUi().alert('Access list',
    'Edit the "active" column: Yes = allowed, anything else = blocked. Takes effect immediately, no redeploy.',
    SpreadsheetApp.getUi().ButtonSet.OK);
}
function newKey() {
  var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function block(n) { var s = ''; for (var i = 0; i < n; i++) s += abc.charAt(Math.floor(Math.random() * abc.length)); return s; }
  return 'K-' + block(4) + '-' + block(4);
}
function json(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
