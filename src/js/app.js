/**
 * CalcS - UI layer.
 *
 * Renders the snapshot produced by the calculator engine and forwards key
 * presses, keyboard input, gestures and native events back into it. It also
 * owns the two bottom sheets: history and "about and updates".
 */

import { Calculator, formatNumberForDisplay } from './engine.js';
import {
  copyText,
  getAppInfo,
  keyFeedback,
  registerBackButton,
  registerResume,
  resultFeedback,
} from './native.js';
import {
  enterFloatingWindow,
  isFloatingWindowSupported,
  onFloatingWindowChange,
} from './floating-window.js';
import { DEFAULT_REPOSITORY, normalizeRepository } from './update.js';
import { createUpdater } from './update-ui.js';

const HISTORY_KEY = 'calcs:history:v1';
/* Key used before the app was renamed to CalcS; read once and moved over. */
const LEGACY_HISTORY_KEY = 'calcivo:history:v1';
const HISTORY_LIMIT = 50;
const BUILD_INFO_URL = 'version.json';
const LONG_PRESS_MS = 450;
const AUTO_CHECK_DELAY_MS = 1500;

/** Calculator modes. The first two work today, the rest are on the roadmap. */
const MODES = {
  standard: { label: 'Standard', available: true },
  scientific: { label: 'Scientific', available: true },
};

const els = {
  app: document.querySelector('.app'),
  expression: document.getElementById('expression'),
  entry: document.getElementById('entry'),
  preview: document.getElementById('preview'),
  previewValue: document.getElementById('preview-value'),
  keypad: document.getElementById('keypad'),
  extraKeys: document.getElementById('extra-keys'),
  brandLabel: document.getElementById('brand-label'),
  caret: document.getElementById('caret'),
  floatingBtn: document.getElementById('floating-btn'),
  signBtn: document.getElementById('sign-btn'),
  scientificBtn: document.getElementById('scientific-btn'),
  modesBtn: document.getElementById('modes-btn'),
  modeGrid: document.getElementById('mode-grid'),
  modesSheet: document.getElementById('modes-sheet'),
  modesClose: document.getElementById('modes-close'),
  modesBackdrop: document.getElementById('modes-backdrop'),
  modesHandle: document.getElementById('modes-handle'),
  modesHeader: document.querySelector('#modes-sheet .sheet__header'),
  menuBtn: document.getElementById('menu-btn'),
  appMenu: document.getElementById('app-menu'),
  menuHistory: document.getElementById('menu-history'),
  menuSettings: document.getElementById('menu-settings'),
  historySheet: document.getElementById('history-sheet'),
  historyList: document.getElementById('history-list'),
  historyClear: document.getElementById('history-clear'),
  historyClose: document.getElementById('history-close'),
  historyBackdrop: document.getElementById('sheet-backdrop'),
  historyHandle: document.getElementById('sheet-handle'),
  historyHeader: document.querySelector('#history-sheet .sheet__header'),
  settingsSheet: document.getElementById('settings-sheet'),
  settingsClose: document.getElementById('settings-close'),
  settingsBack: document.getElementById('settings-back'),
  settingsTitle: document.getElementById('settings-title'),
  settingsBackdrop: document.getElementById('settings-backdrop'),
  settingsHandle: document.getElementById('settings-handle'),
  settingsHeader: document.querySelector('#settings-sheet .sheet__header'),
  settingsList: document.querySelector('#settings-sheet .sheet__list'),
  settingsRoot: document.getElementById('settings-root'),
  settingsAbout: document.getElementById('settings-about'),
  settingsPrivacy: document.getElementById('settings-privacy'),
  openAbout: document.getElementById('open-about'),
  openPrivacy: document.getElementById('open-privacy'),
  repoLink: document.getElementById('repo-link'),
  versionApp: document.getElementById('version-app'),
  aboutVersion: document.getElementById('about-version'),
  updateBadge: document.getElementById('update-badge'),
  updateCard: document.getElementById('update-card'),
  updateIcon: document.getElementById('update-icon'),
  updateTitle: document.getElementById('update-title'),
  updateStatus: document.getElementById('update-status'),
  updateProgress: document.getElementById('update-progress'),
  progressBar: document.getElementById('progress-bar'),
  updateMeta: document.getElementById('update-meta'),
  updateNotes: document.getElementById('update-notes'),
  updatePrimary: document.getElementById('update-primary'),
  updateSecondary: document.getElementById('update-secondary'),
  featureList: document.getElementById('feature-list'),
  snackbar: document.getElementById('snackbar'),
  buildLabel: document.getElementById('build-label'),
};

const ACTION_HANDLERS = {
  digit: (value) => calculator.pressDigit(value),
  'double-zero': () => {
    calculator.pressDigit('0');
    calculator.pressDigit('0');
  },
  decimal: () => calculator.pressDecimal(),
  operator: (value) => calculator.pressOperator(value),
  equals: () => calculator.pressEquals(),
  clear: () => calculator.clear(),
  backspace: () => calculator.pressBackspace(),
  percent: () => calculator.pressPercent(),
  sign: () => calculator.pressSign(),
  paren: () => calculator.pressParen(),
  sqrt: () => calculator.pressSqrt(),
  square: () => calculator.pressSquare(),
  reciprocal: () => calculator.pressReciprocal(),
  constant: (value) => calculator.pressConstant(value),
};

const KEY_MAP = {
  0: { action: 'digit', value: '0' },
  1: { action: 'digit', value: '1' },
  2: { action: 'digit', value: '2' },
  3: { action: 'digit', value: '3' },
  4: { action: 'digit', value: '4' },
  5: { action: 'digit', value: '5' },
  6: { action: 'digit', value: '6' },
  7: { action: 'digit', value: '7' },
  8: { action: 'digit', value: '8' },
  9: { action: 'digit', value: '9' },
  '.': { action: 'decimal' },
  ',': { action: 'decimal' },
  '+': { action: 'operator', value: '+' },
  '-': { action: 'operator', value: '-' },
  '*': { action: 'operator', value: '*' },
  x: { action: 'operator', value: '*' },
  X: { action: 'operator', value: '*' },
  '/': { action: 'operator', value: '/' },
  '=': { action: 'equals' },
  Enter: { action: 'equals' },
  Backspace: { action: 'backspace' },
  Escape: { action: 'clear' },
  Delete: { action: 'clear' },
  c: { action: 'clear' },
  C: { action: 'clear' },
  '%': { action: 'percent' },
  n: { action: 'sign' },
  N: { action: 'sign' },
  '(': { action: 'paren' },
  ')': { action: 'paren' },
  r: { action: 'sqrt' },
  R: { action: 'sqrt' },
  q: { action: 'square' },
  Q: { action: 'square' },
  i: { action: 'reciprocal' },
  I: { action: 'reciprocal' },
  p: { action: 'constant', value: 'pi' },
  P: { action: 'constant', value: 'pi' },
};

const buildInfo = {
  name: 'CalcS',
  version: '1.0',
  variant: 'dev',
  commit: 'unknown',
  repository: DEFAULT_REPOSITORY,
};

let history = [];
let lastPreviewValue = null;
let snackbarTimer = 0;
let updateSeen = false;

const calculator = new Calculator({
  onCommit: ({ expression, result }) => addHistory(expression, result),
});

/* --------------------------------------------------------------------------
 * Rendering
 * ------------------------------------------------------------------------ */

/**
 * Display layout: the expression the user is typing is the big line, the
 * running answer sits under it in a quieter colour. After equals the answer
 * takes over the big line and the expression moves up as a small caption.
 */
function render() {
  const snapshot = calculator.snapshot();

  const isResult = snapshot.mode === 'result';
  // Errors take over the big line the same way a result does.
  const committed = isResult || snapshot.mode === 'error';
  const mainText = committed
    ? snapshot.entryText
    : snapshot.expressionText || snapshot.entryText;

  els.expression.textContent = committed
    ? snapshot.lastExpression.replace(/\s*=$/, '') || '\u00a0'
    : '\u00a0';

  els.entry.textContent = mainText;
  els.entry.classList.toggle('is-error', snapshot.entryIsError);
  els.entry.classList.toggle('is-result', isResult);

  const length = mainText.length;
  els.entry.classList.toggle('is-length-2', length > 8 && length <= 12);
  els.entry.classList.toggle('is-length-3', length > 12 && length <= 17);
  els.entry.classList.toggle('is-length-4', length > 17);

  // The caret sits after what has been typed, and disappears while a result is
  // on screen or when the entry turned into an error.
  const typing = !committed;
  if (els.caret) els.caret.hidden = !typing;

  renderPreview(snapshot.preview, snapshot);

  document.querySelectorAll('.btn--op').forEach((button) => {
    const isActive =
      !snapshot.entryIsError &&
      snapshot.activeOperator !== null &&
      button.getAttribute('data-value') === snapshot.activeOperator;
    button.classList.toggle('is-active-op', isActive);
  });

  els.expression.scrollLeft = els.expression.scrollWidth;
  els.entry.scrollLeft = els.entry.scrollWidth;
}

function renderPreview(preview, snapshot) {
  const message = preview && preview.ok === false ? preview.message : '';

  if (!preview && !(snapshot.mode === 'error' && snapshot.errorMessage)) {
    els.preview.hidden = true;
    lastPreviewValue = null;
    return;
  }

  // An error is reported in the same place the answer would appear.
  if (message) {
    els.preview.hidden = false;
    els.preview.classList.add('is-error');
    els.previewValue.textContent = message;
    lastPreviewValue = null;
    return;
  }

  if (!preview) {
    els.preview.hidden = false;
    els.preview.classList.add('is-error');
    els.previewValue.textContent = snapshot.errorMessage;
    lastPreviewValue = null;
    return;
  }

  els.preview.hidden = false;
  els.preview.classList.remove('is-error');
  els.previewValue.textContent = preview.value;

  if (lastPreviewValue !== null && lastPreviewValue !== preview.value) {
    els.preview.classList.remove('is-bumped');
    void els.preview.offsetWidth;
    els.preview.classList.add('is-bumped');
  }
  lastPreviewValue = preview.value;
}

function flashScreen() {
  els.app.classList.remove('is-flashing');
  void els.app.offsetWidth;
  els.app.classList.add('is-flashing');
}

function showSnackbar(message) {
  els.snackbar.hidden = false;
  els.snackbar.textContent = message;
  requestAnimationFrame(() => els.snackbar.classList.add('is-visible'));
  window.clearTimeout(snackbarTimer);
  snackbarTimer = window.setTimeout(() => {
    els.snackbar.classList.remove('is-visible');
    window.setTimeout(() => {
      els.snackbar.hidden = true;
    }, 220);
  }, 2000);
}

/* --------------------------------------------------------------------------
 * Key handling
 * ------------------------------------------------------------------------ */

function runAction(action, value) {
  const handler = ACTION_HANDLERS[action];
  if (!handler) return;
  const before = calculator.snapshot();
  handler(value);
  const after = calculator.snapshot();

  render();

  const settled = after.mode === 'result' && (before.mode !== 'result' || action === 'equals');
  if (settled) {
    flashScreen();
    resultFeedback();
  } else {
    keyFeedback();
  }
}

function flashButton(key) {
  const normalized = key === 'x' || key === 'X' ? '*' : key;
  const buttons = document.querySelectorAll('.btn');
  for (const button of buttons) {
    if (button.getAttribute('data-key') !== normalized) continue;
    button.classList.add('is-kbd');
    window.setTimeout(() => button.classList.remove('is-kbd'), 120);
    return;
  }
}

function createRipple(event, target) {
  const rect = target.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const pointX = typeof event.clientX === 'number' ? event.clientX : rect.left + rect.width / 2;
  const pointY = typeof event.clientY === 'number' ? event.clientY : rect.top + rect.height / 2;

  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left = `${pointX - rect.left - size / 2}px`;
  ripple.style.top = `${pointY - rect.top - size / 2}px`;
  target.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove());
}

function attachKeypad(section) {
  section.addEventListener('pointerdown', (event) => {
    const button = event.target.closest('.btn');
    if (button) createRipple(event, button);
  });

  section.addEventListener('click', (event) => {
    const button = event.target.closest('.btn');
    if (!button) return;
    runAction(button.getAttribute('data-action'), button.getAttribute('data-value'));
  });
}

/* --------------------------------------------------------------------------
 * History
 * ------------------------------------------------------------------------ */

function readStoredHistory(key) {
  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter((item) => item && typeof item.expression === 'string')
      .slice(0, HISTORY_LIMIT);
  } catch {
    return null;
  }
}

function loadHistory() {
  const current = readStoredHistory(HISTORY_KEY);
  if (current) {
    history = current;
    return;
  }

  // First start after the rename: keep the history that was saved under the
  // name the app used before.
  const legacy = readStoredHistory(LEGACY_HISTORY_KEY);
  if (legacy) {
    history = legacy;
    saveHistory();
    try {
      window.localStorage.removeItem(LEGACY_HISTORY_KEY);
    } catch {
      /* nothing to clean up */
    }
    return;
  }

  history = [];
}

function saveHistory() {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    /* storage unavailable: history stays in memory */
  }
}

function addHistory(expression, result) {
  history.unshift({ expression, result: String(result) });
  if (history.length > HISTORY_LIMIT) history.length = HISTORY_LIMIT;
  saveHistory();
  renderHistory();
}

function renderHistory() {
  els.historyList.textContent = '';

  if (history.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'sheet__empty';
    empty.innerHTML =
      '<svg viewBox="0 0 24 24" width="38" height="38" fill="currentColor" aria-hidden="true">' +
      '<path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>' +
      '</svg>' +
      '<div>No calculations yet.<br />Results are saved on this device.</div>';
    els.historyList.appendChild(empty);
    els.historyClear.disabled = true;
    return;
  }

  els.historyClear.disabled = false;

  for (const item of history) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'history-item';

    const expression = document.createElement('span');
    expression.className = 'history-item__expr';
    expression.textContent = item.expression;

    const result = document.createElement('span');
    result.className = 'history-item__result';
    result.textContent = `= ${formatNumberForDisplay(Number(item.result))}`;

    button.append(expression, result);

    button.addEventListener('click', () => {
      calculator.loadValue(Number(item.result));
      render();
      closePanel('history');
      keyFeedback();
    });

    els.historyList.appendChild(button);
  }
}

/* --------------------------------------------------------------------------
 * Bottom sheets
 * ------------------------------------------------------------------------ */

const panels = {
  history: {
    sheet: els.historySheet,
    backdrop: els.historyBackdrop,
    close: els.historyClose,
    trigger: els.menuBtn,
    handles: [els.historyHandle, els.historyHeader],
  },
  settings: {
    sheet: els.settingsSheet,
    backdrop: els.settingsBackdrop,
    close: els.settingsClose,
    trigger: els.menuBtn,
    handles: [els.settingsHandle, els.settingsHeader],
  },
  modes: {
    sheet: els.modesSheet,
    backdrop: els.modesBackdrop,
    close: els.modesClose,
    trigger: els.modesBtn,
    handles: [els.modesHandle, els.modesHeader],
  },
};

let openPanelName = null;

function isOpen(name) {
  return openPanelName === name;
}

function openPanel(name) {
  const panel = panels[name];
  if (!panel || openPanelName === name) return;
  if (openPanelName) closePanel(openPanelName, { silent: true });

  openPanelName = name;
  panel.backdrop.hidden = false;
  panel.sheet.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => {
    panel.backdrop.classList.add('is-open');
    panel.sheet.classList.add('is-open');
  });
  panel.close.focus({ preventScroll: true });
}

function closePanel(name = openPanelName, { silent = false } = {}) {
  const panel = panels[name];
  if (!panel) return;
  if (openPanelName === name) openPanelName = null;

  panel.backdrop.classList.remove('is-open');
  panel.sheet.classList.remove('is-open');
  panel.sheet.style.transform = '';
  panel.sheet.setAttribute('aria-hidden', 'true');
  window.setTimeout(() => {
    if (openPanelName !== name) panel.backdrop.hidden = true;
  }, 240);
  if (!silent) panel.trigger.focus({ preventScroll: true });
}

function attachSheetDrag(name) {
  const panel = panels[name];
  let startY = 0;
  let delta = 0;
  let dragging = false;

  const start = (event) => {
    dragging = true;
    delta = 0;
    startY = event.clientY;
    panel.sheet.classList.add('is-dragging');
    panel.sheet.setPointerCapture?.(event.pointerId);
  };

  const move = (event) => {
    if (!dragging) return;
    delta = Math.max(0, event.clientY - startY);
    panel.sheet.style.transform = `translateY(${delta}px)`;
  };

  const end = () => {
    if (!dragging) return;
    dragging = false;
    panel.sheet.classList.remove('is-dragging');
    panel.sheet.style.transform = '';
    if (delta > 90) closePanel(name);
  };

  for (const handle of panel.handles) {
    if (!handle) continue;
    handle.addEventListener('pointerdown', start);
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }
}

/* --------------------------------------------------------------------------
 * Gestures
 * ------------------------------------------------------------------------ */

function attachLongPress(element, handler) {
  let timer = 0;
  let startPoint = null;

  const clear = () => {
    window.clearTimeout(timer);
    startPoint = null;
  };

  element.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    startPoint = { x: event.clientX, y: event.clientY };
    timer = window.setTimeout(() => handler(), LONG_PRESS_MS);
  });

  element.addEventListener('pointermove', (event) => {
    if (!startPoint) return;
    const moved = Math.hypot(event.clientX - startPoint.x, event.clientY - startPoint.y);
    if (moved > 12) clear();
  });

  element.addEventListener('pointerup', clear);
  element.addEventListener('pointercancel', clear);
  element.addEventListener('pointerleave', clear);
  element.addEventListener('contextmenu', (event) => event.preventDefault());
}

async function copyCurrentValue() {
  const snapshot = calculator.snapshot();
  if (snapshot.entryIsError) return;
  const text = snapshot.entryText.replace(/,/g, '');
  const ok = await copyText(text);
  await keyFeedback();
  showSnackbar(ok ? `Copied ${snapshot.entryText}` : 'Copy is not available here');
}

/* --------------------------------------------------------------------------
 * Boot
 * ------------------------------------------------------------------------ */

function attachKeyboard() {
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    if (event.key === 'Escape') {
      if (openMenuName) {
        closeMenus();
        return;
      }
      if (openPanelName) {
        closePanel(openPanelName);
        return;
      }
    }

    const mapped = KEY_MAP[event.key];
    if (!mapped) return;

    event.preventDefault();
    flashButton(event.key);
    runAction(mapped.action, mapped.value);
  });
}

/* --------------------------------------------------------------------------
 * Calculator mode (two arrows button, mode chip and the mode menu)
 * ------------------------------------------------------------------------ */

let calculatorMode = 'standard';

function setCalculatorMode(next, { feedback = true } = {}) {
  const wanted = MODES[next]?.available ? next : 'standard';
  calculatorMode = wanted;
  const isScientific = wanted === 'scientific';

  els.extraKeys.hidden = !isScientific;
  els.scientificBtn.setAttribute('aria-pressed', isScientific ? 'true' : 'false');
  els.app.classList.toggle('is-scientific', isScientific);

  for (const tile of els.modeGrid.querySelectorAll('[data-mode]')) {
    tile.setAttribute('aria-pressed', tile.getAttribute('data-mode') === wanted ? 'true' : 'false');
  }

  if (feedback) keyFeedback();
}

function toggleScientific() {
  setCalculatorMode(calculatorMode === 'scientific' ? 'standard' : 'scientific');
}

/* --------------------------------------------------------------------------
 * Three dot menu (History and Settings)
 * ------------------------------------------------------------------------ */

let openMenuName = null;

const menus = () => ({
  app: { menu: els.appMenu, trigger: els.menuBtn },
});

function openMenu(name) {
  const entry = menus()[name];
  if (!entry) return;
  closeMenus();
  openMenuName = name;
  entry.menu.hidden = false;
  entry.trigger.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => entry.menu.classList.add('is-open'));
}

function closeMenus() {
  if (!openMenuName) return;
  const entry = menus()[openMenuName];
  openMenuName = null;
  if (!entry) return;
  entry.menu.classList.remove('is-open');
  entry.trigger.setAttribute('aria-expanded', 'false');
  window.setTimeout(() => {
    if (openMenuName === null) entry.menu.hidden = true;
  }, 140);
}

function toggleMenu(name) {
  if (openMenuName === name) {
    closeMenus();
    return;
  }
  openMenu(name);
  keyFeedback();
}

function attachMenus() {
  els.menuBtn.addEventListener('click', () => toggleMenu('app'));

  els.menuHistory.addEventListener('click', () => {
    closeMenus();
    openPanel('history');
  });

  els.menuSettings.addEventListener('click', () => {
    closeMenus();
    showSettingsPage('root');
    openPanel('settings');
    els.updateBadge.hidden = true;
  });

  document.addEventListener('pointerdown', (event) => {
    if (!openMenuName) return;
    const entry = menus()[openMenuName];
    if (entry.menu.contains(event.target) || entry.trigger.contains(event.target)) return;
    closeMenus();
  });
}

/* --------------------------------------------------------------------------
 * Settings pages (settings root, about, privacy)
 * ------------------------------------------------------------------------ */

const SETTINGS_PAGES = {
  root: { title: 'Settings' },
  about: { title: 'About CalcS' },
  privacy: { title: 'Privacy note' },
};

function showSettingsPage(name) {
  for (const key of Object.keys(SETTINGS_PAGES)) {
    const page = { root: els.settingsRoot, about: els.settingsAbout, privacy: els.settingsPrivacy }[key];
    if (page) page.hidden = key !== name;
  }
  els.settingsBack.hidden = name === 'root';
  els.settingsTitle.textContent = SETTINGS_PAGES[name]?.title || 'Settings';
  if (els.settingsList) els.settingsList.scrollTop = 0;
}

/* --------------------------------------------------------------------------
 * Floating window (Android picture in picture)
 * ------------------------------------------------------------------------ */

async function openFloatingWindow() {
  const supported = await isFloatingWindowSupported();
  if (!supported) {
    showSnackbar('A floating window needs Android 8 or newer');
    return;
  }
  const result = await enterFloatingWindow();
  keyFeedback();
  if (!result.entered) showSnackbar('Could not open the floating window');
}

function renderBuildLabel() {
  const parts = [`Version ${buildInfo.version}`];
  if (buildInfo.variant && buildInfo.variant !== 'dev') parts.push(buildInfo.variant);
  if (buildInfo.commit && buildInfo.commit !== 'unknown') parts.push(buildInfo.commit.slice(0, 7));
  const repo = normalizeRepository(buildInfo.repository);
  if (repo) parts.push(repo);
  els.buildLabel.textContent = parts.join(' \u00b7 ');
}

function renderBrand() {
  const name = buildInfo.name || 'CalcS';
  if (els.brandLabel) els.brandLabel.textContent = name;
  if (els.versionApp) els.versionApp.textContent = name;
  document.title = name;
}

function renderRepoLink() {
  const repo = normalizeRepository(buildInfo.repository);
  if (!els.repoLink) return;
  els.repoLink.href = repo ? `https://github.com/${repo}` : 'https://github.com/';
}

async function loadBuildInfo() {
  if (typeof fetch !== 'function') return;
  try {
    const response = await fetch(BUILD_INFO_URL, { cache: 'no-store' });
    if (!response.ok) return;
    const info = await response.json();
    Object.assign(buildInfo, {
      name: info.name || buildInfo.name,
      version: info.version || buildInfo.version,
      variant: info.variant || buildInfo.variant,
      commit: info.commit || buildInfo.commit,
      repository: info.repository || buildInfo.repository,
    });
  } catch {
    /* a missing version.json only means the labels stay generic */
  }
}

/**
 * The version shown in Settings is the one installed on this phone. Inside the
 * Android app that value comes from the package manager, so it stays right even
 * if the web bundle and the installed APK were built at different times.
 */
async function loadInstalledVersion() {
  const info = await getAppInfo();
  if (info?.version && parseVersion(info.version)) {
    buildInfo.version = info.version;
  }
}

function parseVersion(value) {
  return /^\d+(\.\d+){0,2}$/.test(String(value || '').trim());
}

const updater = createUpdater({
  elements: els,
  getVersion: () => buildInfo.version,
  getRepository: () => buildInfo.repository,
  fetchImpl: typeof fetch === 'function' ? fetch.bind(window) : undefined,
  onSnackbar: (message) => showSnackbar(message),
  onUpdateAvailable: () => {
    els.updateBadge.hidden = false;
    if (!updateSeen) {
      updateSeen = true;
      showSnackbar('A new version of CalcS is available');
    }
  },
});

function boot() {
  loadHistory();
  renderHistory();
  render();
  setCalculatorMode('standard', { feedback: false });

  attachKeypad(els.keypad);
  attachKeypad(els.extraKeys);
  attachKeyboard();
  attachMenus();

  els.scientificBtn.addEventListener('click', () => toggleScientific());
  els.floatingBtn.addEventListener('click', () => openFloatingWindow());
  els.signBtn.addEventListener('click', () => runAction('sign'));

  els.modesBtn.addEventListener('click', () => {
    openPanel('modes');
    keyFeedback();
  });
  els.modeGrid.addEventListener('click', (event) => {
    const tile = event.target.closest('[data-mode]');
    if (!tile) return;
    setCalculatorMode(tile.getAttribute('data-mode'));
    closePanel('modes');
  });
  els.modesClose.addEventListener('click', () => closePanel('modes'));
  els.modesBackdrop.addEventListener('click', () => closePanel('modes'));

  // While the app floats above another app it gets a compact layout.
  onFloatingWindowChange((active) => els.app.classList.toggle('is-floating', active));

  attachLongPress(els.entry, copyCurrentValue);
  els.entry.addEventListener('click', () => keyFeedback());

  els.historyClose.addEventListener('click', () => closePanel('history'));
  els.historyBackdrop.addEventListener('click', () => closePanel('history'));
  els.historyClear.addEventListener('click', () => {
    history = [];
    saveHistory();
    renderHistory();
    keyFeedback();
  });

  els.settingsClose.addEventListener('click', () => closePanel('settings'));
  els.settingsBackdrop.addEventListener('click', () => closePanel('settings'));
  els.settingsBack.addEventListener('click', () => {
    showSettingsPage('root');
    keyFeedback();
  });
  els.openAbout.addEventListener('click', () => {
    showSettingsPage('about');
    keyFeedback();
  });
  els.openPrivacy.addEventListener('click', () => {
    showSettingsPage('privacy');
    keyFeedback();
  });

  attachSheetDrag('history');
  attachSheetDrag('settings');
  attachSheetDrag('modes');

  document.addEventListener('gesturestart', (event) => event.preventDefault());
  document.addEventListener('dblclick', (event) => event.preventDefault());

  registerBackButton(() => {
    if (openMenuName) {
      closeMenus();
      return true;
    }
    if (openPanelName === 'settings' && els.settingsBack.hidden === false) {
      showSettingsPage('root');
      return true;
    }
    if (openPanelName) {
      closePanel(openPanelName);
      return true;
    }
    return false;
  });
  registerResume(() => render());

  updater.renderFeatures();
  updater.render();

  Promise.all([loadBuildInfo(), loadInstalledVersion()]).then(() => {
    renderBrand();
    renderRepoLink();
    renderBuildLabel();
    updater.render();
    // Silent check a moment after the first screen so the start stays instant.
    window.setTimeout(() => updater.check({ silent: true }), AUTO_CHECK_DELAY_MS);
  });

  // Debug handle, only created when a page opts in (used by the DOM tests).
  if (window.__CALCS_TEST__) {
    window.__calcs = {
      calculator,
      render,
      updater,
      buildInfo,
      openPanel,
      closePanel,
      openMenu,
      closeMenus,
      setCalculatorMode,
      showSettingsPage,
      get mode() {
        return calculatorMode;
      },
    };
  }
}

boot();

export { calculator, render, updater, buildInfo };
