/**
 * End to end smoke test for the UI layer.
 *
 * Loads the real production bundle (www/app.js) inside jsdom together with the
 * real markup (www/index.html) and drives it the way a user would.
 *
 * Run `npm run build:web` first - `npm test` does that automatically.
 */

import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { JSDOM } from 'jsdom';

const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const webDir = path.join(root, 'www');

const RELEASE = {
  tag_name: 'v9.9',
  name: 'Calcivo 9.9',
  html_url: 'https://github.com/jakariatanjim-svg/test/releases/tag/v9.9',
  published_at: '2026-10-12T09:30:00Z',
  body: '## Highlights\n- live preview',
  assets: [
    {
      name: 'Calcivo-latest.apk',
      browser_download_url: 'https://example.com/Calcivo-latest.apk',
      size: 3 * 1024 * 1024,
    },
  ],
};

let dom;
let document;
let window;

const $ = (selector) => document.querySelector(selector);

function clickKey(selector) {
  const element = $(selector);
  assert.ok(element, `missing element: ${selector}`);
  element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
}

function pressKeys(...keys) {
  for (const key of keys) clickKey(`.btn[data-key="${key}"]`);
}

function nextFrame() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function preview() {
  const chip = $('#preview');
  return {
    hidden: chip.hidden,
    value: $('#preview-value').textContent,
    expression: $('#preview-expression').textContent,
    label: $('#preview-label').textContent,
    isError: chip.classList.contains('is-error'),
  };
}

before(async () => {
  const html = await readFile(path.join(webDir, 'index.html'), 'utf8');
  dom = new JSDOM(html, {
    url: 'https://localhost/',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
  window = dom.window;
  document = window.document;

  const versionInfo = {
    name: 'Calcivo',
    version: '1.2',
    variant: 'debug',
    commit: 'abc1234',
    builtAt: '2026-10-12T09:30:00Z',
    repository: 'jakariatanjim-svg/test',
  };

  // Every network call the app makes is answered locally.
  const fetchMock = async (url) => {
    const target = String(url);
    if (target.includes('/releases/latest')) {
      return { ok: true, status: 200, json: async () => RELEASE };
    }
    if (target.includes('version.json')) {
      return { ok: true, status: 200, json: async () => versionInfo };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  window.fetch = fetchMock;
  globalThis.fetch = fetchMock;

  window.__CALCIVO_TEST__ = true;
  globalThis.window = window;
  globalThis.document = document;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.HTMLElement = window.HTMLElement;
  Object.defineProperty(globalThis, 'navigator', {
    value: window.navigator,
    configurable: true,
    writable: true,
  });

  await import(path.join(webDir, 'app.js'));
  await nextFrame();
});

test('boots as Calcivo with an empty display', () => {
  assert.equal($('.app-bar__title').textContent, 'Calcivo');
  assert.equal(document.title, 'Calcivo');
  assert.equal($('#entry').textContent, '0');
  assert.equal($('#preview').hidden, true);
});

test('the about sheet shows the installed version and the roadmap', () => {
  clickKey('#about-btn');
  assert.equal($('#about-version').textContent, '1.2');
  assert.match($('#build-label').textContent, /Version 1\.2/);
  assert.match($('#build-label').textContent, /jakariatanjim-svg\/test/);

  const items = document.querySelectorAll('.feature-list__item');
  assert.equal(items.length, 6);
  assert.match($('.about-section__title').textContent, /New features coming soon/);

  clickKey('#about-close');
  assert.equal($('#about-sheet').classList.contains('is-open'), false);
});

test('the background check reports the newer release', async () => {
  await window.__calcivo.updater.check();
  assert.equal(window.__calcivo.updater.phase, 'available');
  assert.match($('#update-title').textContent, /9\.9/);
  assert.equal($('#update-primary').textContent, 'Download update');
  assert.equal($('#update-badge').hidden, false, 'the about button is badged');
});

test('shows the live preview while an expression is typed', () => {
  pressKeys('1', '2', '+', '5');
  const chip = preview();
  assert.equal(chip.hidden, false);
  assert.equal(chip.value, '17');
  assert.equal(chip.expression, '12 + 5');
  assert.equal($('#expression').textContent, '12 + 5');
  assert.equal($('#entry').textContent, '5');
});

test('preview follows precedence without pressing equals', () => {
  pressKeys('*', '2');
  assert.equal(preview().value, '22');
});

test('equals commits the result and writes it to history', () => {
  pressKeys('Enter');
  assert.equal($('#entry').textContent, '22');
  assert.equal($('#entry').classList.contains('is-result'), true);
  assert.equal($('#preview').hidden, true);
  assert.equal($('#expression').textContent, '12 + 5 \u00d7 2 =');

  const items = document.querySelectorAll('.history-item');
  assert.equal(items.length, 1);
  assert.equal(items[0].querySelector('.history-item__result').textContent, '= 22');
});

test('history survives a reload through local storage', () => {
  const stored = JSON.parse(window.localStorage.getItem('calcivo:history:v1'));
  assert.equal(stored.length, 1);
  assert.equal(stored[0].expression, '12 + 5 \u00d7 2');
  assert.equal(stored[0].result, '22');
});

test('history sheet opens and closes', async () => {
  clickKey('#history-btn');
  await nextFrame();
  assert.equal($('#history-sheet').classList.contains('is-open'), true);
  assert.equal($('#history-sheet').getAttribute('aria-hidden'), 'false');

  clickKey('#history-close');
  assert.equal($('#history-sheet').classList.contains('is-open'), false);
  await nextFrame();
});

test('history row loads its value back into the calculator', async () => {
  clickKey('#history-btn');
  await nextFrame();
  clickKey('.history-item');
  assert.equal($('#entry').textContent, '22');
  assert.equal($('#history-sheet').classList.contains('is-open'), false);
  pressKeys('Escape');
  assert.equal($('#entry').textContent, '0');
});

test('opening the about sheet clears the update badge', () => {
  clickKey('#about-btn');
  assert.equal($('#update-badge').hidden, true);
  clickKey('#about-close');
});

test('division by zero is flagged before equals and after it', () => {
  pressKeys('8', '/', '0');
  const chip = preview();
  assert.equal(chip.isError, true);
  assert.equal(chip.value, 'Cannot divide by zero');

  pressKeys('Enter');
  assert.equal($('#entry').textContent, 'Error');
  assert.equal($('#entry').classList.contains('is-error'), true);
  pressKeys('Escape');
  assert.equal($('#entry').textContent, '0');
});

test('extra keys toggle and feed the engine', () => {
  const extraKeys = $('#extra-keys');
  assert.equal(extraKeys.hidden, true);

  clickKey('#scientific-btn');
  assert.equal(extraKeys.hidden, false);
  assert.equal($('#scientific-btn').getAttribute('aria-pressed'), 'true');

  clickKey('.btn--extra[data-action="paren"]');
  pressKeys('3', '+', '4');
  clickKey('.btn--extra[data-action="paren"]');
  assert.equal(preview().value, '7');
  assert.equal(preview().expression, '(3 + 4)');

  pressKeys('Escape');
  pressKeys('9');
  clickKey('.btn--extra[data-action="sqrt"]');
  assert.equal($('#entry').textContent, '3');

  pressKeys('Escape');
  clickKey('#scientific-btn');
  assert.equal(extraKeys.hidden, true);
});

test('keyboard input drives the calculator', () => {
  for (const key of ['4', '5', '+', '5', '5']) {
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  }
  assert.equal(preview().value, '100');

  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
  assert.equal(preview().value, '50');

  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal($('#entry').textContent, '0');
});

test('the interface contains no emoji', () => {
  assert.equal(document.body.innerHTML.match(/\p{Extended_Pictographic}/gu), null);
});
