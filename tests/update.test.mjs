import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_REPOSITORY,
  checkForUpdate,
  checksumMatches,
  findApkAssets,
  normalizeRepository,
  summarizeNotes,
  versionFromTag,
} from '../src/js/update.js';

const release = (overrides = {}) => ({
  tag_name: 'v1.4',
  name: 'CalcS 1.4',
  html_url: 'https://github.com/jakariatanjim-svg/Calcivo/releases/tag/v1.4',
  published_at: '2026-10-12T09:30:00Z',
  body: '## CalcS 1.4\n\n- live preview chip\n- in-app updates\n',
  assets: [
    { name: 'CalcS_1.4_release.apk', browser_download_url: 'https://example.com/1.4.apk', size: 5200000 },
    { name: 'CalcS_1.4_release.apk.sha256', browser_download_url: 'https://example.com/1.4.apk.sha256', size: 90 },
  ],
  ...overrides,
});

const respondWith = (payload, status = 200) => async () => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => payload,
});

test('normalizeRepository accepts the ways a repository is written', () => {
  assert.equal(normalizeRepository('jakariatanjim-svg/Calcivo'), 'jakariatanjim-svg/Calcivo');
  assert.equal(normalizeRepository('https://github.com/jakariatanjim-svg/Calcivo'), 'jakariatanjim-svg/Calcivo');
  assert.equal(normalizeRepository('https://github.com/jakariatanjim-svg/Calcivo.git'), 'jakariatanjim-svg/Calcivo');
  assert.equal(normalizeRepository('git@github.com:jakariatanjim-svg/Calcivo.git'), 'jakariatanjim-svg/Calcivo');
  assert.equal(normalizeRepository(''), '');
  assert.equal(normalizeRepository('not a repo'), '');
});

test('findApkAssets picks the APK that matches the release version', () => {
  const { apk, checksum } = findApkAssets(release());
  assert.equal(apk.name, 'CalcS_1.4_release.apk');
  assert.equal(checksum.name, 'CalcS_1.4_release.apk.sha256');
  assert.equal(apk.browser_download_url, 'https://example.com/1.4.apk');
});

test('findApkAssets prefers the versioned APK over an old "latest" copy', () => {
  const legacy = release({
    assets: [
      { name: 'CalcS-latest.apk', browser_download_url: 'https://example.com/latest.apk', size: 10 },
      { name: 'CalcS_1.4_release.apk', browser_download_url: 'https://example.com/1.4.apk', size: 10 },
      { name: 'CalcS_1.4_release.apk.sha256', browser_download_url: 'https://example.com/1.4.apk.sha256', size: 90 },
    ],
  });
  assert.equal(findApkAssets(legacy).apk.name, 'CalcS_1.4_release.apk');
  assert.equal(findApkAssets(legacy).checksum.name, 'CalcS_1.4_release.apk.sha256');
});

test('findApkAssets falls back to whatever APK a hand made release carries', () => {
  const single = release({
    assets: [{ name: 'CalcS.apk', browser_download_url: 'https://example.com/x.apk', size: 10 }],
  });
  assert.equal(findApkAssets(single).apk.name, 'CalcS.apk');
  assert.equal(findApkAssets(single).checksum, null);
});

test('findApkAssets copes with releases without an APK', () => {
  const { apk, checksum } = findApkAssets({ assets: [{ name: 'notes.txt' }] });
  assert.equal(apk, null);
  assert.equal(checksum, null);
  assert.deepEqual(findApkAssets(null), { apk: null, checksum: null });
});

test('versionFromTag reads the version out of the tag', () => {
  assert.equal(versionFromTag('v1.4'), '1.4');
  assert.equal(versionFromTag('v10.0'), '10.0');
  assert.equal(versionFromTag('1.4'), '1.4');
  assert.equal(versionFromTag('nightly'), null);
});

test('summarizeNotes flattens markdown for the update card', () => {
  const text = summarizeNotes('## CalcS 1.4\n\n- live preview chip\n- **in-app** updates\n\n---\nlast');
  assert.equal(text, 'CalcS 1.4\nlive preview chip\nin-app updates\nlast');
});

test('checksumMatches compares the sha lines written by sha256sum', () => {
  const hash = 'a'.repeat(64);
  assert.equal(checksumMatches(`${hash}  CalcS_1.4_developer.apk`, hash), true);
  assert.equal(checksumMatches(`${hash.toUpperCase()}  file.apk`, hash), true);
  assert.equal(checksumMatches('b'.repeat(64), hash), false);
  assert.equal(checksumMatches(null, hash), false);
});

test('checkForUpdate reports an available update', async () => {
  const result = await checkForUpdate({
    repository: DEFAULT_REPOSITORY,
    currentVersion: '1.3',
    fetchImpl: respondWith(release()),
  });

  assert.equal(result.status, 'update');
  assert.equal(result.currentVersion, '1.3');
  assert.equal(result.latestVersion, '1.4');
  assert.equal(result.releaseName, 'CalcS 1.4');
  assert.equal(result.apk.url, 'https://example.com/1.4.apk');
  assert.equal(result.apk.name, 'CalcS_1.4_release.apk');
  assert.equal(result.apk.size, 5200000);
  assert.match(result.notes, /live preview chip/);
  assert.match(result.message, /1\.4/);
});

test('checkForUpdate reports when the app is already current', async () => {
  const same = await checkForUpdate({
    currentVersion: '1.4',
    fetchImpl: respondWith(release()),
  });
  assert.equal(same.status, 'current');

  const newer = await checkForUpdate({
    currentVersion: '1.10',
    fetchImpl: respondWith(release()),
  });
  assert.equal(newer.status, 'current', 'numeric comparison, not string comparison');
});

test('checkForUpdate handles an empty channel, rate limits and network errors', async () => {
  const empty = await checkForUpdate({ currentVersion: '1.0', fetchImpl: respondWith({}, 404) });
  assert.equal(empty.status, 'no-releases');

  const limited = await checkForUpdate({ currentVersion: '1.0', fetchImpl: respondWith({}, 403) });
  assert.equal(limited.status, 'error');
  assert.match(limited.message, /limiting/i);

  const offline = await checkForUpdate({
    currentVersion: '1.0',
    fetchImpl: async () => {
      throw new Error('offline');
    },
  });
  assert.equal(offline.status, 'error');
  assert.match(offline.message, /connection/i);
});

test('checkForUpdate refuses to look for updates without a repository', async () => {
  const result = await checkForUpdate({ repository: '', currentVersion: '1.0' });
  assert.equal(result.status, 'disabled');
});

test('checkForUpdate rejects releases without a usable version', async () => {
  const result = await checkForUpdate({
    currentVersion: '1.0',
    fetchImpl: respondWith(release({ tag_name: 'nightly' })),
  });
  assert.equal(result.status, 'error');
  assert.match(result.message, /version number/i);
});

test('checkForUpdate surfaces a release without an APK asset', async () => {
  const result = await checkForUpdate({
    currentVersion: '1.0',
    fetchImpl: respondWith(release({ assets: [{ name: 'notes.txt' }] })),
  });
  assert.equal(result.status, 'update');
  assert.equal(result.apk, null);
});
