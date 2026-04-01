/**
 * John's Sales Dialer — Google Apps Script API (Simplified)
 *
 * Bound to Google Sheet: 17aJQJX7EGiNygtG_74VBsZ0Pfrq9ZOu2JhODmnKfyl8
 *
 * Deploy as: Web App → Execute as Me → Access Anyone
 *
 * Endpoints:
 *   GET  → returns call-ready leads as JSON
 *   POST → receives {lead_id, outcome} and updates the row
 */

// Column index map (0-based) matching the sheet schema A-Z
var COL = {
  lead_id: 0,            // A
  business_name: 1,      // B
  contact_name: 2,       // C
  phone_number: 3,       // D
  location: 4,           // E
  business_type: 5,      // F
  lead_source: 6,        // G
  talking_angle: 7,      // H
  priority: 8,           // I
  current_status: 9,     // J
  call_ready: 10,        // K
  last_contact_date: 11, // L
  last_contact_time: 12, // M
  last_call_outcome: 13, // N
  follow_up_needed: 14,  // O
  callback_date: 15,     // P
  callback_window: 16,   // Q
  statement_sent: 17,    // R
  statement_sent_date: 18, // S
  booked_meeting: 19,    // T
  booked_meeting_date: 20, // U
  notes_for_john: 21,    // V
  next_action: 22,       // W
  assigned_to: 23,       // X
  last_updated_by: 24,   // Y
  updated_at: 25         // Z
};

var HEADERS = [
  'lead_id', 'business_name', 'contact_name', 'phone_number', 'location',
  'business_type', 'lead_source', 'talking_angle', 'priority', 'current_status',
  'call_ready', 'last_contact_date', 'last_contact_time', 'last_call_outcome',
  'follow_up_needed', 'callback_date', 'callback_window', 'statement_sent',
  'statement_sent_date', 'booked_meeting', 'booked_meeting_date', 'notes_for_john',
  'next_action', 'assigned_to', 'last_updated_by', 'updated_at'
];

var SKIP_STATUSES = ['Closed', 'Not Interested'];

var VALID_OUTCOMES = [
  'Interested', 'Sending Statement', 'Potential', 'Call Back', 'Not Interested'
];

// ─── GET: Return call-ready leads ────────────────────────────────────

function doGet(e) {
  try {
    var params = e.parameter || {};

    // If action=log, handle outcome logging via GET
    if (params.action === 'log') {
      return logOutcome(params.lead_id, params.outcome);
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Leads');
    if (!sheet) {
      return jsonResponse({ error: 'Leads sheet not found' }, 404);
    }

    var data = sheet.getDataRange().getValues();
    if (data.length < 2) {
      return jsonResponse({ leads: [], count: 0 });
    }

    var leads = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];

      // Filter: call_ready=TRUE, status not skipped, assigned to John
      var callReady = row[COL.call_ready];
      if (callReady !== true && String(callReady).toUpperCase() !== 'TRUE') continue;

      var status = String(row[COL.current_status] || '');
      if (SKIP_STATUSES.indexOf(status) !== -1) continue;

      var assignedTo = String(row[COL.assigned_to] || '');
      if (assignedTo !== 'John') continue;

      // Must have a phone number
      var phone = String(row[COL.phone_number] || '').trim();
      if (!phone) continue;

      // Build lead object — only send what the app needs
      leads.push({
        lead_id: String(row[COL.lead_id] || ''),
        business_name: String(row[COL.business_name] || ''),
        phone_number: phone,
        business_type: String(row[COL.business_type] || ''),
        priority: String(row[COL.priority] || 'Warm')
      });
    }

    // Sort: priority (Hot first), then by lead_id
    var PRIORITY_WEIGHT = { 'Hot': 1, 'Warm': 2, 'Cold': 3 };
    leads.sort(function(a, b) {
      var pa = PRIORITY_WEIGHT[a.priority] || 99;
      var pb = PRIORITY_WEIGHT[b.priority] || 99;
      return pa - pb;
    });

    return jsonResponse({ leads: leads, count: leads.length });

  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

// ─── LOG OUTCOME (called from doGet with action=log) ─────────────────

function logOutcome(leadId, outcome) {
  try {
    if (!leadId || !outcome) {
      return jsonResponse({ error: 'Missing lead_id or outcome' }, 400);
    }

    if (VALID_OUTCOMES.indexOf(outcome) === -1) {
      return jsonResponse({ error: 'Invalid outcome: ' + outcome }, 400);
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Leads');
    if (!sheet) {
      return jsonResponse({ error: 'Leads sheet not found' }, 404);
    }

    // Find the row by lead_id (column A)
    var data = sheet.getRange('A:A').getValues();
    var rowIndex = -1;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(leadId)) {
        rowIndex = i + 1; // 1-based
        break;
      }
    }

    if (rowIndex === -1) {
      return jsonResponse({ error: 'Lead not found: ' + leadId }, 404);
    }

    // Timestamps
    var now = new Date();
    var today = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var timeNow = Utilities.formatDate(now, Session.getScriptTimeZone(), 'HH:mm');
    var fullTimestamp = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');

    // Common updates for ALL outcomes
    sheet.getRange(rowIndex, COL.last_contact_date + 1).setValue(today);     // L
    sheet.getRange(rowIndex, COL.last_contact_time + 1).setValue(timeNow);   // M
    sheet.getRange(rowIndex, COL.last_call_outcome + 1).setValue(outcome);   // N
    sheet.getRange(rowIndex, COL.last_updated_by + 1).setValue('Dialer App'); // Y
    sheet.getRange(rowIndex, COL.updated_at + 1).setValue(fullTimestamp);     // Z

    // Outcome-specific updates
    switch (outcome) {
      case 'Interested':
        sheet.getRange(rowIndex, COL.current_status + 1).setValue('Interested');
        sheet.getRange(rowIndex, COL.call_ready + 1).setValue(true);
        sheet.getRange(rowIndex, COL.follow_up_needed + 1).setValue(true);
        sheet.getRange(rowIndex, COL.next_action + 1).setValue('Send statement');
        break;

      case 'Sending Statement':
        sheet.getRange(rowIndex, COL.current_status + 1).setValue('Statement Sent');
        sheet.getRange(rowIndex, COL.call_ready + 1).setValue(true);
        sheet.getRange(rowIndex, COL.follow_up_needed + 1).setValue(true);
        sheet.getRange(rowIndex, COL.statement_sent + 1).setValue(true);
        sheet.getRange(rowIndex, COL.statement_sent_date + 1).setValue(today);
        sheet.getRange(rowIndex, COL.next_action + 1).setValue('Follow up');
        break;

      case 'Potential':
        sheet.getRange(rowIndex, COL.current_status + 1).setValue('Potential');
        sheet.getRange(rowIndex, COL.call_ready + 1).setValue(true);
        sheet.getRange(rowIndex, COL.follow_up_needed + 1).setValue(true);
        sheet.getRange(rowIndex, COL.next_action + 1).setValue('Follow up later');
        break;

      case 'Call Back':
        sheet.getRange(rowIndex, COL.current_status + 1).setValue('Call Back');
        sheet.getRange(rowIndex, COL.call_ready + 1).setValue(true);
        sheet.getRange(rowIndex, COL.follow_up_needed + 1).setValue(true);
        sheet.getRange(rowIndex, COL.next_action + 1).setValue('Call back');
        break;

      case 'Not Interested':
        sheet.getRange(rowIndex, COL.current_status + 1).setValue('Not Interested');
        sheet.getRange(rowIndex, COL.call_ready + 1).setValue(false);
        sheet.getRange(rowIndex, COL.follow_up_needed + 1).setValue(false);
        sheet.getRange(rowIndex, COL.next_action + 1).setValue('Remove from queue');
        break;
    }

    SpreadsheetApp.flush();

    return jsonResponse({
      success: true,
      lead_id: leadId,
      outcome: outcome,
      updated_at: fullTimestamp
    });

  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function jsonResponse(data, code) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── Sheet Setup (run once from menu) ────────────────────────────────

function setupSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // --- Leads tab ---
  var leads = ss.getSheetByName('Leads') || ss.insertSheet('Leads');
  leads.clear();

  // Headers
  leads.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  leads.getRange(1, 1, 1, HEADERS.length)
    .setBackground('#002244')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setFontSize(10);

  // Column D (phone_number) as plain text
  leads.getRange('D:D').setNumberFormat('@');

  // Freeze header row
  leads.setFrozenRows(1);

  // Column widths
  leads.setColumnWidth(1, 130);  // lead_id
  leads.setColumnWidth(2, 200);  // business_name
  leads.setColumnWidth(3, 140);  // contact_name
  leads.setColumnWidth(4, 140);  // phone_number
  leads.setColumnWidth(5, 120);  // location
  leads.setColumnWidth(6, 130);  // business_type

  // --- Dropdowns tab ---
  var dd = ss.getSheetByName('Dropdowns') || ss.insertSheet('Dropdowns');
  dd.clear();

  dd.getRange(1, 1, 1, 3).setValues([['current_status', 'last_call_outcome', 'priority']]);
  dd.getRange(1, 1, 1, 3).setBackground('#002244').setFontColor('#FFFFFF').setFontWeight('bold');

  var statuses = [['Ready to Call'], ['Interested'], ['Statement Sent'], ['Potential'], ['Call Back'], ['Not Interested'], ['Closed']];
  dd.getRange(2, 1, statuses.length, 1).setValues(statuses);

  var outcomes = [['Interested'], ['Sending Statement'], ['Potential'], ['Call Back'], ['Not Interested']];
  dd.getRange(2, 2, outcomes.length, 1).setValues(outcomes);

  dd.getRange(2, 3, 3, 1).setValues([['Hot'], ['Warm'], ['Cold']]);

  // --- Data validation on Leads ---
  var lastRow = 500;

  var prRule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(dd.getRange('C2:C4'), true).setAllowInvalid(false).build();
  leads.getRange(2, COL.priority + 1, lastRow).setDataValidation(prRule);

  var stRule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(dd.getRange('A2:A8'), true).setAllowInvalid(false).build();
  leads.getRange(2, COL.current_status + 1, lastRow).setDataValidation(stRule);

  var ocRule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(dd.getRange('B2:B6'), true).setAllowInvalid(false).build();
  leads.getRange(2, COL.last_call_outcome + 1, lastRow).setDataValidation(ocRule);

  // Checkboxes (K, O, R, T)
  var cbRule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
  leads.getRange(2, COL.call_ready + 1, lastRow).setDataValidation(cbRule);
  leads.getRange(2, COL.follow_up_needed + 1, lastRow).setDataValidation(cbRule);
  leads.getRange(2, COL.statement_sent + 1, lastRow).setDataValidation(cbRule);
  leads.getRange(2, COL.booked_meeting + 1, lastRow).setDataValidation(cbRule);

  // --- Instructions tab ---
  var instr = ss.getSheetByName('Instructions') || ss.insertSheet('Instructions');
  instr.clear();
  instr.getRange('A1').setValue("John's Sales Dialer — Instructions").setFontSize(16).setFontWeight('bold');
  instr.getRange('A3').setValue('This sheet powers the Sales Dialer PWA.');
  instr.getRange('A5').setValue('Key rules:');
  instr.getRange('A6').setValue('1. Only rows with call_ready=TRUE and assigned_to=John appear in the dialer');
  instr.getRange('A7').setValue('2. The app shows: Business Name, Business Type, Phone Number');
  instr.getRange('A8').setValue('3. Outcomes: Interested, Sending Statement, Potential, Call Back, Not Interested');
  instr.getRange('A9').setValue('4. The app automatically updates status and timestamps after each call');
  instr.setColumnWidth(1, 800);

  SpreadsheetApp.flush();
  SpreadsheetApp.getUi().alert('Sheet setup complete! Now run "Populate Leads" from the Dialer menu to load leads.');
}

// ─── Populate Leads from CSV data (run from menu) ────────────────────

function populateLeads() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Leads');
  if (!sheet) {
    SpreadsheetApp.getUi().alert('Run "Setup Sheet" first.');
    return;
  }

  // Clear existing data rows (keep header)
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, HEADERS.length).clearContent();
  }

  // CSV data is pasted into a hidden "Import" tab as columns:
  // A=Lead ID, B=Business Name, C=Address, D=Area, E=Business Type, F=Phone
  var importSheet = ss.getSheetByName('Import');
  if (!importSheet) {
    SpreadsheetApp.getUi().alert('Create an "Import" tab and paste the CSV data there first (columns: Lead ID, Business Name, Address, Area, Business Type, Phone, ...)');
    return;
  }

  var importData = importSheet.getDataRange().getValues();
  if (importData.length < 2) {
    SpreadsheetApp.getUi().alert('No data found in Import tab.');
    return;
  }

  var rows = [];
  for (var i = 1; i < importData.length; i++) {
    var src = importData[i];
    var leadId = String(src[0] || '').trim();
    var bizName = String(src[1] || '').trim();
    var address = String(src[2] || '').trim();
    var area = String(src[3] || '').trim();
    var bizType = String(src[4] || '').trim();
    var phone = String(src[5] || '').trim();

    if (!bizName || !phone) continue;

    // Format business_type: "meal_takeaway" → "Takeaway", "cafe" → "Cafe" etc.
    var typeFormatted = formatBizType(bizType);

    // Build row matching 26-column schema
    var row = new Array(26);
    for (var j = 0; j < 26; j++) row[j] = '';
    row[COL.lead_id] = leadId;
    row[COL.business_name] = bizName;
    row[COL.phone_number] = phone;
    row[COL.location] = area;
    row[COL.business_type] = typeFormatted;
    row[COL.lead_source] = 'Google Maps';
    row[COL.priority] = 'Warm';
    row[COL.current_status] = 'Ready to Call';
    row[COL.call_ready] = true;
    row[COL.follow_up_needed] = false;
    row[COL.statement_sent] = false;
    row[COL.booked_meeting] = false;
    row[COL.assigned_to] = 'John';
    row[COL.notes_for_john] = address;

    rows.push(row);
  }

  if (rows.length === 0) {
    SpreadsheetApp.getUi().alert('No valid leads found in Import tab.');
    return;
  }

  sheet.getRange(2, 1, rows.length, 26).setValues(rows);
  SpreadsheetApp.flush();
  SpreadsheetApp.getUi().alert(rows.length + ' leads loaded into the Leads tab!');
}

function formatBizType(raw) {
  var map = {
    'meal_takeaway': 'Takeaway',
    'meal_delivery': 'Takeaway',
    'restaurant': 'Restaurant',
    'cafe': 'Cafe',
    'bar': 'Bar',
    'night_club': 'Night Club',
    'bakery': 'Bakery',
    'hair_care': 'Barber',
    'beauty_salon': 'Beauty Salon'
  };
  var key = String(raw || '').trim().toLowerCase();
  return map[key] || (key.charAt(0).toUpperCase() + key.slice(1)).replace(/_/g, ' ');
}

// ─── Menu ────────────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Dialer')
    .addItem('Setup Sheet', 'setupSheet')
    .addItem('Populate Leads (from Import tab)', 'populateLeads')
    .addToUi();
}
