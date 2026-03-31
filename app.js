/**
 * John's Sales Dialer — App Logic
 *
 * Reads leads from Google Apps Script, renders one at a time,
 * handles dial tap + outcome logging.
 *
 * Replace API_URL with the deployed Apps Script web app URL.
 */

// ─── CONFIG ──────────────────────────────────────────────────────────
// After deploying the Apps Script, paste the web app URL here:
var API_URL = 'PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE';

// ─── STATE ───────────────────────────────────────────────────────────
var leads = [];
var currentIndex = 0;
var dialTapped = false;
var isSubmitting = false;

// ─── DOM REFS ────────────────────────────────────────────────────────
var $ = function (id) { return document.getElementById(id); };

// ─── INIT ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  // Event listeners
  $('btn-refresh').addEventListener('click', fetchLeads);
  $('btn-retry-error').addEventListener('click', fetchLeads);
  $('btn-retry-empty').addEventListener('click', fetchLeads);
  $('btn-skip').addEventListener('click', skip);

  // Dial button — show outcomes on tap, let tel: link fire natively
  $('dial-btn').addEventListener('click', function () {
    dialTapped = true;
    var section = $('outcomes-section');
    section.classList.add('visible');
    // Smooth scroll to outcomes
    setTimeout(function () {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
  });

  // Outcome buttons
  var buttons = document.querySelectorAll('.outcome-btn');
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].addEventListener('click', function () {
      onOutcome(this.getAttribute('data-outcome'));
    });
  }

  fetchLeads();
});

// ─── FETCH LEADS ─────────────────────────────────────────────────────
function fetchLeads() {
  showState('state-loading');

  fetch(API_URL)
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (data.error) {
        showError(data.error);
        return;
      }
      leads = data.leads || [];
      currentIndex = 0;
      $('queue-badge').textContent = leads.length;

      if (leads.length === 0) {
        showState('state-empty');
      } else {
        renderLead();
      }
    })
    .catch(function (err) {
      showError('Network error — check your connection');
    });
}

// ─── RENDER LEAD ─────────────────────────────────────────────────────
function renderLead() {
  if (currentIndex >= leads.length) {
    fetchLeads();
    return;
  }

  var lead = leads[currentIndex];
  showState('state-lead');

  // Business name
  $('biz-name').textContent = lead.business_name || 'Unknown Business';

  // Contact name
  var contactEl = $('contact-name');
  if (lead.contact_name) {
    contactEl.textContent = lead.contact_name;
    contactEl.style.display = '';
  } else {
    contactEl.style.display = 'none';
  }

  // Meta pills
  $('meta-location').textContent = lead.location || '—';
  $('meta-type').textContent = lead.business_type || '—';
  $('meta-source').textContent = lead.lead_source || '—';

  // Talking angle
  var angleEl = $('talking-angle');
  if (lead.talking_angle) {
    angleEl.textContent = lead.talking_angle;
    angleEl.style.display = '';
  } else {
    angleEl.style.display = 'none';
  }

  // Notes
  var notesEl = $('notes-box');
  if (lead.notes_for_john) {
    notesEl.textContent = lead.notes_for_john;
    notesEl.style.display = '';
  } else {
    notesEl.style.display = 'none';
  }

  // Priority badge
  var prBadge = $('badge-priority');
  prBadge.textContent = lead.priority || 'Warm';
  prBadge.className = 'badge';
  var pr = (lead.priority || '').toLowerCase();
  if (pr === 'hot') prBadge.classList.add('badge-hot');
  else if (pr === 'warm') prBadge.classList.add('badge-warm');
  else prBadge.classList.add('badge-cold');

  // Status badge
  $('badge-status').textContent = lead.current_status || '—';

  // Last contact
  var lcEl = $('last-contact');
  if (lead.last_contact_date) {
    var lcText = 'Last contact: ' + lead.last_contact_date;
    if (lead.last_contact_time) lcText += ' at ' + lead.last_contact_time;
    if (lead.last_call_outcome) lcText += ' — ' + lead.last_call_outcome;
    lcEl.textContent = lcText;
    lcEl.style.display = '';
  } else {
    lcEl.textContent = 'Never contacted';
    lcEl.style.display = '';
  }

  // Dial button
  var phone = lead.phone_number || '';
  $('dial-btn').href = 'tel:' + cleanPhone(phone);
  $('dial-number').textContent = formatPhone(phone);

  // Reset outcomes
  dialTapped = false;
  $('outcomes-section').classList.remove('visible');
  enableOutcomeButtons();

  // Counter
  $('counter-text').textContent = (currentIndex + 1) + ' of ' + leads.length;

  // Scroll to top
  window.scrollTo(0, 0);
}

// ─── OUTCOME HANDLER ─────────────────────────────────────────────────
function onOutcome(outcome) {
  if (isSubmitting) return;
  isSubmitting = true;
  disableOutcomeButtons();

  var lead = leads[currentIndex];
  showState('state-updating');

  fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lead_id: lead.lead_id,
      outcome: outcome
    })
  })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (data.error) {
        showToast('Error: ' + data.error);
        showState('state-lead');
        enableOutcomeButtons();
        isSubmitting = false;
        return;
      }

      // Success flash
      $('success-text').textContent = 'Logged: ' + outcome;
      showState('state-success');

      setTimeout(function () {
        isSubmitting = false;
        advance();
      }, 1000);
    })
    .catch(function () {
      showToast('Network error — try again');
      showState('state-lead');
      enableOutcomeButtons();
      isSubmitting = false;
    });
}

// ─── NAVIGATION ──────────────────────────────────────────────────────
function advance() {
  currentIndex++;
  if (currentIndex >= leads.length) {
    fetchLeads();
  } else {
    $('queue-badge').textContent = leads.length - currentIndex;
    renderLead();
  }
}

function skip() {
  advance();
}

// ─── UI HELPERS ──────────────────────────────────────────────────────
function showState(id) {
  var states = ['state-loading', 'state-error', 'state-empty', 'state-lead', 'state-success', 'state-updating'];
  for (var i = 0; i < states.length; i++) {
    var el = $(states[i]);
    if (el) el.classList.remove('active');
  }
  var target = $(id);
  if (target) target.classList.add('active');
}

function showError(msg) {
  $('error-message').textContent = msg || 'Unknown error';
  showState('state-error');
}

function showToast(msg) {
  var toast = $('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(function () {
    toast.classList.remove('show');
  }, 2500);
}

function disableOutcomeButtons() {
  var btns = document.querySelectorAll('.outcome-btn');
  for (var i = 0; i < btns.length; i++) btns[i].disabled = true;
}

function enableOutcomeButtons() {
  var btns = document.querySelectorAll('.outcome-btn');
  for (var i = 0; i < btns.length; i++) btns[i].disabled = false;
}

// ─── PHONE HELPERS ───────────────────────────────────────────────────
function cleanPhone(raw) {
  // Strip everything except digits and leading +
  var s = String(raw || '').trim();
  if (s.charAt(0) === '+') {
    return '+' + s.replace(/[^\d]/g, '');
  }
  return s.replace(/[^\d]/g, '');
}

function formatPhone(raw) {
  var s = String(raw || '').trim();
  // Already formatted nicely — just return it
  if (s.indexOf(' ') !== -1) return s;
  // Raw digits — format UK-style
  var digits = s.replace(/[^\d]/g, '');
  if (digits.length === 11 && digits.charAt(0) === '0') {
    // 07xxx xxxxxx
    return digits.substring(0, 5) + ' ' + digits.substring(5, 8) + ' ' + digits.substring(8);
  }
  if (digits.length === 12 && digits.substring(0, 2) === '44') {
    // +44 7xxx xxxxxx
    return '+44 ' + digits.substring(2, 6) + ' ' + digits.substring(6, 9) + ' ' + digits.substring(9);
  }
  return s;
}
