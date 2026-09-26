// First-visit welcome is browser UI state, separate from saved/shareable setups.
// Native dialog supplies background isolation, Escape handling and focus trapping.
const SEEN_KEY = 'headroom:welcome:v1';
const STORES = ['localStorage', 'sessionStorage'];
let returnTo = null;

function wasSeen() {
  for (const name of STORES) {
    try { if (window[name].getItem(SEEN_KEY) === 'seen') return true; }
    catch { /* Storage can be unavailable in private or embedded contexts. */ }
  }
  return false;
}

function remember() {
  for (const name of STORES) {
    try { window[name].setItem(SEEN_KEY, 'seen'); return; }
    catch { /* Try session storage when persistent storage is unavailable. */ }
  }
}

export function openWelcome() {
  const dialog = document.getElementById('welcomeDialog');
  if (dialog.open || typeof dialog.showModal !== 'function') return;
  returnTo = document.activeElement === document.body ? null : document.activeElement;
  dialog.showModal();
  document.body.classList.add('welcome-open');
  remember();
}

export function closeWelcome() {
  document.getElementById('welcomeDialog').close();
}

export function restoreWelcomeFocus() {
  document.body.classList.remove('welcome-open');
  const fallback = document.querySelector('.header-overflow-toggle:not([hidden])');
  const target = [returnTo, document.getElementById('welcomeBtn'), fallback, document.getElementById('tab-sandbox')]
    .find(el => el?.isConnected && el.getClientRects().length && !el.closest('[hidden]'));
  target?.focus({ preventScroll: true });
  returnTo = null;
}

export function showFirstWelcome() {
  if (!wasSeen()) openWelcome();
}
