/**
 * Tests for the in-app update flow: check -> download with progress -> install.
 *
 * The native side (APK download, package installer) is replaced by a fake
 * bridge, so the whole state machine runs in Node against the real markup.
 */

import test, { before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { JSDOM } from 'jsdom';

import { createUpdater } from '../src/js/update-ui.js';

const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const HASH = 'c'.repeat(64);

const releasePayload = (tag = 'v1.4') => ({
  tag_name: tag,
  name: `CalcS ${tag.replace('v', '')}`,
  html_url: `https://github.com/jakariatanjim-svg/Calcivo/releases/tag/${tag}`,
  published_at: '2026-10-12T09:30:00Z',
  body: '## New\n- faster start\n- fixed percent',
  assets: [
    {
      name: 'CalcS_1.4_release.apk',
      browser_download_url: 'https://example.com/CalcS_1.4_release.apk',
      size: 4 * 1024 * 1024,
    },
    {
      name: 'CalcS_1.4_release.apk.sha256',
      browser_download_url: 'https://example.com/CalcS_1.4_release.apk.sha256',
      size: 90,
    },
  ],
});

function createBridge(overrides = {}) {
  const calls = { download: [], install: [], cancel: 0, settings: 0 };
  return {
    calls,
    isAndroid: () => true,
    canInstallPackages: async () => true,
    openInstallPermissionSettings: async () => {
      calls.settings += 1;
      return true;
    },
    cancelDownload: async () => {
      calls.cancel += 1;
    },
    fetchChecksum: async () => `${HASH}  CalcS_1.4_release.apk`,
    downloadApk: async ({ url, fileName, onProgress }) => {
      calls.download.push({ url, fileName });
      onProgress?.({ percent: 25, received: 1024 * 1024, total: 4 * 1024 * 1024 });
      onProgress?.({ percent: 100, received: 4 * 1024 * 1024, total: 4 * 1024 * 1024 });
      return { fileName, path: `/tmp/${fileName}`, size: 4 * 1024 * 1024, sha256: HASH };
    },
    installApk: async ({ fileName }) => {
      calls.install.push(fileName);
      return { needsPermission: false };
    },
    ...overrides,
  };
}

let dom;
let document;
let fetchImpl;
let bridge;
let updater;

const el = (id) => document.getElementById(id);
const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 0));

before(async () => {
  const html = await readFile(path.join(root, 'src', 'index.html'), 'utf8');
  dom = new JSDOM(html, { url: 'https://localhost/' });
  document = dom.window.document;
  globalThis.window = dom.window;
  globalThis.document = document;
});

beforeEach(() => {
  bridge = createBridge();
  fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => releasePayload(),
  });
  updater = createUpdater({
    elements: {
      aboutVersion: el('about-version'),
      updateBadge: el('update-badge'),
      updateCard: el('update-card'),
      updateIcon: el('update-icon'),
      updateTitle: el('update-title'),
      updateStatus: el('update-status'),
      updateProgress: el('update-progress'),
      progressBar: el('progress-bar'),
      updateMeta: el('update-meta'),
      updateNotes: el('update-notes'),
      updatePrimary: el('update-primary'),
      updateSecondary: el('update-secondary'),
      featureList: el('feature-list'),
    },
    getVersion: () => '1.3',
    getRepository: () => 'jakariatanjim-svg/Calcivo',
    fetchImpl,
    bridge,
  });
});

test('a newer release is offered with its version, size and notes', async () => {
  const result = await updater.check();
  assert.equal(result.status, 'update');
  assert.equal(updater.phase, 'available');
  assert.match(el('update-title').textContent, /1\.4/);
  assert.match(el('update-status').textContent, /4\.0 MB/);
  assert.match(el('update-notes').textContent, /faster start/);
  assert.equal(el('update-primary').textContent, 'Download update');
  assert.equal(el('update-primary').disabled, false);
  assert.equal(el('update-secondary').hidden, true);
  assert.equal(el('update-card').classList.contains('is-update'), true);
});

test('the newest release reports that the app is up to date', async () => {
  fetchImpl = async () => ({ ok: true, status: 200, json: async () => releasePayload('v1.3') });
  updater = createUpdater({
    elements: { updateCard: el('update-card'), updateTitle: el('update-title'), updateStatus: el('update-status'), updatePrimary: el('update-primary'), updateSecondary: el('update-secondary'), updateProgress: el('update-progress') },
    getVersion: () => '1.3',
    getRepository: () => 'jakariatanjim-svg/Calcivo',
    fetchImpl,
    bridge,
  });
  const result = await updater.check();
  assert.equal(result.status, 'current');
  assert.equal(updater.phase, 'current');
  assert.match(el('update-title').textContent, /up to date/i);
  assert.equal(el('update-primary').textContent, 'Check again');
});

test('a network failure is reported without breaking the sheet', async () => {
  fetchImpl = async () => {
    throw new Error('offline');
  };
  updater = createUpdater({
    elements: { updateCard: el('update-card'), updateTitle: el('update-title'), updateStatus: el('update-status'), updatePrimary: el('update-primary'), updateSecondary: el('update-secondary'), updateProgress: el('update-progress') },
    getVersion: () => '1.3',
    getRepository: () => 'jakariatanjim-svg/Calcivo',
    fetchImpl,
    bridge,
  });
  await updater.check();
  assert.equal(updater.phase, 'error');
  assert.match(el('update-status').textContent, /connection/i);
  assert.equal(el('update-card').classList.contains('is-error'), true);
});

test('the download runs through progress and verifies the checksum', async () => {
  await updater.check();
  await updater.download();

  assert.equal(bridge.calls.download.length, 1);
  assert.equal(bridge.calls.download[0].url, 'https://example.com/CalcS_1.4_release.apk');
  assert.equal(bridge.calls.download[0].fileName, 'CalcS_1.4_release.apk');
  assert.equal(updater.phase, 'ready');
  assert.equal(updater.state.download.verified, true);
  assert.match(el('update-status').textContent, /checksum matches/i);
  assert.equal(el('update-primary').textContent, 'Install update');

  const bar = el('progress-bar');
  assert.equal(bar.style.width, '100%');
  assert.equal(bar.parentElement.classList.contains('is-indeterminate'), false);
});

test('progress is shown while the download is running', async () => {
  let releaseDownload;
  const pending = new Promise((resolve) => {
    releaseDownload = resolve;
  });

  updater = createUpdater({
    elements: {
      updateCard: el('update-card'),
      updateTitle: el('update-title'),
      updateStatus: el('update-status'),
      updateProgress: el('update-progress'),
      progressBar: el('progress-bar'),
      updateMeta: el('update-meta'),
      updatePrimary: el('update-primary'),
      updateSecondary: el('update-secondary'),
    },
    getVersion: () => '1.3',
    getRepository: () => 'jakariatanjim-svg/Calcivo',
    fetchImpl,
    bridge: createBridge({
      downloadApk: async ({ fileName, onProgress }) => {
        onProgress({ percent: 40, received: 2 * 1024 * 1024, total: 5 * 1024 * 1024 });
        return pending.then(() => ({ fileName, size: 5 * 1024 * 1024, sha256: HASH }));
      },
    }),
  });

  await updater.check();
  const running = updater.download();
  await nextFrame();

  assert.equal(updater.phase, 'downloading');
  assert.equal(el('update-progress').hidden, false);
  assert.equal(el('progress-bar').style.width, '40%');
  assert.match(el('update-status').textContent, /2\.0 MB of 5\.0 MB/);
  assert.equal(el('update-secondary').hidden, false);
  assert.equal(el('update-secondary').textContent, 'Cancel');

  releaseDownload();
  await running;
  assert.equal(updater.phase, 'ready');
});

test('cancel returns to the update card', async () => {
  await updater.check();
  await updater.cancel();
  assert.equal(bridge.calls.cancel, 1);
  assert.equal(updater.phase, 'available');
  assert.equal(el('update-progress').hidden, true);
});

test('a checksum mismatch stops the install', async () => {
  const mismatchBridge = createBridge({ fetchChecksum: async () => `${'d'.repeat(64)}  CalcS_1.4_release.apk` });
  updater = createUpdater({
    elements: { updateCard: el('update-card'), updateTitle: el('update-title'), updateStatus: el('update-status'), updateProgress: el('update-progress'), progressBar: el('progress-bar'), updatePrimary: el('update-primary'), updateSecondary: el('update-secondary') },
    getVersion: () => '1.3',
    getRepository: () => 'jakariatanjim-svg/Calcivo',
    fetchImpl,
    bridge: mismatchBridge,
  });

  await updater.check();
  await updater.download();

  assert.equal(updater.phase, 'error');
  assert.match(updater.state.errorMessage, /checksum/i);
  assert.equal(mismatchBridge.calls.install.length, 0);
});

test('installing hands the file to the Android installer', async () => {
  await updater.check();
  await updater.download();
  await updater.install();

  assert.deepEqual(bridge.calls.install, ['CalcS_1.4_release.apk']);
  assert.equal(updater.phase, 'installing');
  assert.match(el('update-status').textContent, /installer is open/i);
});

test('Android install permission is requested before installing', async () => {
  const permissionBridge = createBridge({ canInstallPackages: async () => false });
  updater = createUpdater({
    elements: { updateCard: el('update-card'), updateTitle: el('update-title'), updateStatus: el('update-status'), updateProgress: el('update-progress'), progressBar: el('progress-bar'), updatePrimary: el('update-primary'), updateSecondary: el('update-secondary') },
    getVersion: () => '1.3',
    getRepository: () => 'jakariatanjim-svg/Calcivo',
    fetchImpl,
    bridge: permissionBridge,
  });

  await updater.check();
  await updater.download();
  await updater.install();

  assert.equal(updater.phase, 'permission');
  assert.equal(permissionBridge.calls.settings, 1);
  assert.match(el('update-status').textContent, /permission/i);
  assert.equal(el('update-primary').textContent, 'Open settings');
  assert.equal(el('update-secondary').textContent, 'I allowed it');
});

test('a browser cannot install, so the download button stays disabled', async () => {
  const webBridge = createBridge({ isAndroid: () => false });
  updater = createUpdater({
    elements: { updateCard: el('update-card'), updateTitle: el('update-title'), updateStatus: el('update-status'), updatePrimary: el('update-primary'), updateSecondary: el('update-secondary'), updateProgress: el('update-progress') },
    getVersion: () => '1.3',
    getRepository: () => 'jakariatanjim-svg/Calcivo',
    fetchImpl,
    bridge: webBridge,
  });

  await updater.check();
  assert.equal(el('update-primary').disabled, true);
  assert.match(el('update-status').textContent, /Android app only/i);
});

test('the roadmap is rendered with inline icons and no emoji', () => {
  updater.renderFeatures();
  const list = el('feature-list');
  const items = list.querySelectorAll('.feature-list__item');
  assert.equal(items.length, 6);
  for (const item of items) {
    assert.equal(item.querySelectorAll('svg').length, 1, 'each row has an inline icon');
    assert.equal(item.querySelector('.feature-list__soon').textContent, 'soon');
    assert.equal(item.textContent.match(/\p{Extended_Pictographic}/gu), null, 'no emoji in the UI');
  }
  assert.match(list.textContent, /Currency and money calculators/);
});

test('the marketplace icon set in the sheet holds no emoji either', () => {
  const markup = document.body.innerHTML;
  assert.equal(markup.match(/\p{Extended_Pictographic}/gu), null, 'the UI is emoji free');
});
