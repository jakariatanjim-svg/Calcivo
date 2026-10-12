/**
 * Calcivo - UI layer.
 *
 * Renders the snapshot produced by the calculator engine and forwards key
 * presses, keyboard input, gestures and native events back into it. It also
 * owns the two bottom sheets: history and "about and updates".
 */

import { Calculator, formatNumberForDisplay } from './engine.js';
import {
  copyText,
  keyFeedback,
  registerBackButton,
  registerResume,
  resultFeedback,
} from './native.js';
import { DEFAULT_REPOSITORY, normalizeRepository } from './update.js';
import { createUpdater } from './update-ui.js';

const HISTORY_KEY = 'calcivo:history:v1';
const HISTORY_LIMIT = 50;
const BUILD_INFO_URL = 'version.json';
const LONG_PRESS_MS = 450;
const AUTO_CHECK_DELAY_MS = 1500;

const els = {
  app: document.querySelector('.app'),
  expression: document.getElementById('expression'),
  entry: document.getElementById('entry'),
  preview: document.getElementById('preview'),
  previewExpression: document.getElementById('preview-expression'),
  previewLabel: document.getElementById('preview-label'),
  previewValue: document.getElementById('preview-value'),
  keypad: document.getElementById('keypad'),
  extraKeys: document.getElementById('extra-keys'),
  scientificBtn: document.getElementById('scientific-btn'),
  historyBtn: document.getElementById('history-btn'),
  historySheet: document.getElementById('history-sheet'),
  historyList: document.getElementById('history-list'),
  historyClear: document.getElementById('history-clear'),
  historyClose: document.getElementById('history-close'),
  historyBackdrop: document.getElementById('sheet-backdrop'),
  historyHandle: document.getElementById('sheet-handle'),
  historyHeader: document.querySelector('#history-sheet .sheet__header'),
  aboutBtn: document.getElementById('about-btn'),
  aboutSheet: document.getElementById('about-sheet'),
  aboutClose: document.getElementById('about-close'),
  aboutBackdrop: document.getElementById('about-backdrop'),
  aboutHandle: document.getElementById('about-handle'),
  aboutHeader: document.querySelector('#about-sheet .sheet__header'),
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
  name: 'Calcivo',
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

function render() {
  const snapshot = calculator.snapshot();

  const expressionText =
    snapshot.expressionText || (snapshot.mode === 'result' ? snapshot.lastExpression : '');
  els.expression.textContent = expressionText || '\u00a0';

  els.entry.textContent = snapshot.entryText;
  els.entry.classList.toggle('is-error', snapshot.entryIsError);
  els.entry.classList.toggle('is-result', snapshot.entryIsResult);

  const length = snapshot.entryText.length;
  els.entry.classList.toggle('is-length-2', length > 7 && length <= 10);
  els.entry.classList.toggle('is-length-3', length > 10 && length <= 14);
  els.entry.classList.toggle('is-length-4', length > 14);

  renderPreview(snapshot.preview);

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

function renderPreview(preview) {
  if (!preview) {
    els.preview.hidden = true;
    lastPreviewValue = null;
    return;
  }

  els.preview.hidden = false;
  const isError = preview.ok === false;
  els.preview.classList.toggle('is-error', isError);

  if (isError) {
    els.previewExpression.textContent = '';
    els.previewExpression.hidden = true;
    els.previewLabel.hidden = true;
    els.previewValue.textContent = preview.message;
    lastPreviewValue = null;
    return;
  }

  els.previewExpression.hidden = false;
  els.previewLabel.hidden = false;
  els.previewExpression.textContent = preview.expression;
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

function loadHistory() {
  try {
    const stored = window.localStorage.getItem(HISTORY_KEY);
    if (!stored) return;
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      history = parsed
        .filter((item) => item && typeof item.expression === 'string')
        .slice(0, HISTORY_LIMIT);
    }
  } catch {
    history = [];
  }
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
    trigger: els.historyBtn,
    handles: [els.historyHandle, els.historyHeader],
  },
  about: {
    sheet: els.aboutSheet,
    backdrop: els.aboutBackdrop,
    close: els.aboutClose,
    trigger: els.aboutBtn,
    handles: [els.aboutHandle, els.aboutHeader],
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

    if (event.key === 'Escape' && openPanelName) {
      closePanel(openPanelName);
      return;
    }

    const mapped = KEY_MAP[event.key];
    if (!mapped) return;

    event.preventDefault();
    flashButton(event.key);
    runAction(mapped.action, mapped.value);
  });
}

function attachExtraKeysToggle() {
  els.scientificBtn.addEventListener('click', () => {
    const willShow = els.extraKeys.hidden;
    els.extraKeys.hidden = !willShow;
    els.scientificBtn.setAttribute('aria-pressed', willShow ? 'true' : 'false');
    keyFeedback();
  });
}

function renderBuildLabel() {
  const parts = [`Version ${buildInfo.version}`];
  if (buildInfo.variant && buildInfo.variant !== 'dev') parts.push(buildInfo.variant);
  if (buildInfo.commit && buildInfo.commit !== 'unknown') parts.push(buildInfo.commit.slice(0, 7));
  const repo = normalizeRepository(buildInfo.repository);
  if (repo) parts.push(repo);
  els.buildLabel.textContent = parts.join(' \u00b7 ');
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
      showSnackbar('A new version of Calcivo is available');
    }
  },
});

function boot() {
  loadHistory();
  renderHistory();
  render();

  attachKeypad(els.keypad);
  attachKeypad(els.extraKeys);
  attachKeyboard();
  attachExtraKeysToggle();

  attachLongPress(els.entry, copyCurrentValue);
  els.entry.addEventListener('click', () => keyFeedback());

  els.historyBtn.addEventListener('click', () => openPanel('history'));
  els.historyClose.addEventListener('click', () => closePanel('history'));
  els.historyBackdrop.addEventListener('click', () => closePanel('history'));
  els.historyClear.addEventListener('click', () => {
    history = [];
    saveHistory();
    renderHistory();
    keyFeedback();
  });

  els.aboutBtn.addEventListener('click', () => {
    openPanel('about');
    els.updateBadge.hidden = true;
  });
  els.aboutClose.addEventListener('click', () => closePanel('about'));
  els.aboutBackdrop.addEventListener('click', () => closePanel('about'));

  attachSheetDrag('history');
  attachSheetDrag('about');

  document.addEventListener('gesturestart', (event) => event.preventDefault());
  document.addEventListener('dblclick', (event) => event.preventDefault());

  registerBackButton(() => {
    if (openPanelName) {
      closePanel(openPanelName);
      return true;
    }
    return false;
  });
  registerResume(() => render());

  updater.renderFeatures();
  updater.render();

  loadBuildInfo().then(() => {
    renderBuildLabel();
    updater.render();
    // Silent check a moment after the first screen so the start stays instant.
    window.setTimeout(() => updater.check({ silent: true }), AUTO_CHECK_DELAY_MS);
  });

  // Debug handle, only created when a page opts in (used by the DOM tests).
  if (window.__CALCIVO_TEST__) {
    window.__calcivo = { calculator, render, updater, buildInfo, openPanel, closePanel };
  }
}

boot();

export { calculator, render, updater, buildInfo };
