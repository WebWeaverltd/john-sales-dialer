/**
 * John's Sales Dialer — App Logic (Simplified)
 *
 * Reads leads from Google Apps Script, renders one at a time,
 * handles dial tap + outcome logging.
 */

// ─── CONFIG ──────────────────────────────────────────────────────────
var API_URL = 'https://script.google.com/macros/s/AKfycbw9NR0L2XXae7CzM4hvJJFpDtqLGZ-y9UeS223RPr2sLvYk3KzgrQwwB2VYuqrElgxd/exec';

// ─── STATE ───────────────────────────────────────────────────────────
var leads = [];
var currentIndex = 0;
var dialTapped = false;
var isSubmitting = false;

// ─── DOM REFS ────────────────────────────────────────────────────────
var $ = function (id) { return document.getElementById(id); };

// ─── INIT ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  $('btn-refresh').addEventListener('click', fetchLeads);
  $('btn-retry-error').addEventListener('click', fetchLeads);
  $('btn-retry-empty').addEventListener('click', fetchLeads);
  $('btn-skip').addEventListener('click', skip);

  $('dial-btn').addEventListener('click', function () {
    dialTapped = true;
    var section = $('outcomes-section');
    section.classList.add('visible');
    setTimeout(function () {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
  });

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

  $('biz-name').textContent = lead.business_name || 'Unknown Business';

  var typeEl = $('biz-type');
  var typeText = lead.business_type || '';
  if (typeText) {
    typeEl.textContent = typeText;
    typeEl.style.display = '';
  } else {
    typeEl.style.display = 'none';
  }

  var phone = lead.phone_number || '';
  $('dial-btn').href = 'tel:' + cleanPhone(phone);
  $('dial-number').textContent = formatPhone(phone);

  dialTapped = false;
  $('outcomes-section').classList.remove('visible');
  enableOutcomeButtons();

  $('counter-text').textContent = (currentIndex + 1) + ' of ' + leads.length;

  window.scrollTo(0, 0);
}

// ─── OUTCOME HANDLER ─────────────────────────────────────────────────
function onOutcome(outcome) {
  if (isSubmitting) return;
  isSubmitting = true;
  disableOutcomeButtons();

  var lead = leads[currentIndex];
  showState('state-updating');

  var logUrl = API_URL + '?action=log&lead_id=' + encodeURIComponent(lead.lead_id) + '&outcome=' + encodeURIComponent(outcome);

  fetch(logUrl)
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (data.error) {
        showToast('Error: ' + data.error);
        showState('state-lead');
        enableOutcomeButtons();
        isSubmitting = false;
        return;
      }

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
  var s = String(raw || '').trim();
  if (s.charAt(0) === '+') {
    return '+' + s.replace(/[^\d]/g, '');
  }
  return s.replace(/[^\d]/g, '');
}

function formatPhone(raw) {
  var s = String(raw || '').trim();
  if (s.indexOf(' ') !== -1) return s;
  var digits = s.replace(/[^\d]/g, '');
  if (digits.length === 11 && digits.charAt(0) === '0') {
    return digits.substring(0, 5) + ' ' + digits.substring(5, 8) + ' ' + digits.substring(8);
  }
  if (digits.length === 12 && digits.substring(0, 2) === '44') {
    return '+44 ' + digits.substring(2, 6) + ' ' + digits.substring(6, 9) + ' ' + digits.substring(9);
  }
  return s;
}
