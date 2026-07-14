/**
 * Muscle FDG Registry — Google Sheets backend (with access control)
 * -----------------------------------------------------------------
 * Setup:
 *   1. Extensions ▸ Apps Script — paste this whole file, Save.
 *   2. Reload the Sheet. A new "FDG Registry" menu appears.
 *      Use it ▸ "Add collaborator" to create an access key for each person.
 *   3. Deploy ▸ New deployment ▸ Web app
 *        Execute as:     Me
 *        Who has access: Anyone
 *      Copy the /exec URL. Each collaborator pastes the URL + their key
 *      into the app's ⚙ settings.
 *
 * Whenever you change this code, you must Deploy ▸ Manage deployments ▸
 * edit the deployment ▸ Version: New version, or the old code keeps running.
 *
 * Access model: only keys listed as active in the "Access" tab may write.
 * Revoke someone by setting their "active" cell to No (no redeploy needed).
 * Every saved row is stamped in `authorized_as` with the key's owner.
 */

var DATA_SHEET   = 'Data';
var ACCESS_SHEET = 'Access';

/* ---------- write endpoint ---------- */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    var payload = JSON.parse(e.postData.contents);
    var key     = (payload.key || '').toString().trim();
    var fields  = payload.fields || [];
    var records = payload.records || [];

    // --- authorise ---
    var who = resolveKey(key);
    if (!who) return json({ ok: false, error: 'unauthorized' });

    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(DATA_SHEET) || ss.insertSheet(DATA_SHEET);

    // Stamp every record with the authorised owner, and make sure the
    // column is part of the header order.
    if (fields.indexOf('authorized_as') === -1) fields = fields.concat(['authorized_as']);
    records.forEach(function (r) { r.authorized_as = who; });

    // --- header management ---
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

    // --- append rows aligned to header ---
    var rows = records.map(function (rec) {
      return header.map(function (col) {
        return (rec.hasOwnProperty(col) && rec[col] !== null && rec[col] !== undefined) ? rec[col] : '';
      });
    });
    if (rows.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, header.length).setValues(rows);
    }

    return json({ ok: true, inserted: rows.length, authorized_as: who });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return json({ ok: true, service: 'Muscle FDG Registry', hint: 'POST records here with a valid key.' });
}

/* ---------- access-key validation ---------- */
/** Returns the owner name for an active key, or '' if invalid/inactive. */
function resolveKey(key) {
  if (!key) return '';
  var sheet = ensureAccessSheet();
  var last = sheet.getLastRow();
  if (last < 2) return '';                       // no keys defined yet → locked
  var rows = sheet.getRange(2, 1, last - 1, 3).getValues(); // key | name | active
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
    sheet.setColumnWidth(1, 180);
    sheet.setColumnWidth(2, 200);
  }
  return sheet;
}

/* ---------- PI tools (menu — no code editing needed) ---------- */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('FDG Registry')
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
    '\n\nSend this to ' + name + ' privately. They paste it into the app\'s ⚙ settings.' +
    '\nRevoke later by setting their "active" cell to No.',
    ui.ButtonSet.OK);
}

function menuOpenAccess() {
  var sheet = ensureAccessSheet();
  SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(sheet);
  SpreadsheetApp.getUi().alert('Access list',
    'Edit the "active" column: Yes = allowed, anything else = blocked. Changes take effect immediately, no redeploy needed.',
    SpreadsheetApp.getUi().ButtonSet.OK);
}

/** Human-readable random key, e.g. K-7F3Q-2ND8 (no ambiguous chars). */
function newKey() {
  var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function block(n) { var s = ''; for (var i = 0; i < n; i++) s += abc.charAt(Math.floor(Math.random() * abc.length)); return s; }
  return 'K-' + block(4) + '-' + block(4);
}

/* ---------- utility ---------- */
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
