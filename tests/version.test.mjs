import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  bumpVersion,
  compareVersions,
  formatVersion,
  isNewerVersion,
  parseVersion,
  toVersionCode,
} from '../src/js/version.js';

import { highestVersion, nextVersion, readVersionInfo, writeVersionInfo } from '../scripts/version.mjs';

const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

test('parseVersion understands the accepted shapes', () => {
  assert.deepEqual(parseVersion('1.4'), [1, 4, 0]);
  assert.deepEqual(parseVersion('v1.4'), [1, 4, 0]);
  assert.deepEqual(parseVersion('2.0.3'), [2, 0, 3]);
  assert.deepEqual(parseVersion('7'), [7, 0, 0]);
  assert.equal(parseVersion('1.x'), null);
  assert.equal(parseVersion(''), null);
  assert.equal(parseVersion(undefined), null);
});

test('bumpVersion walks the sequence the way the project documents it', () => {
  assert.equal(bumpVersion('1.0'), '1.1');
  assert.equal(bumpVersion('1.8'), '1.9');
  assert.equal(bumpVersion('1.9'), '2.0');
  assert.equal(bumpVersion('2.9'), '3.0');
  assert.equal(bumpVersion('9.9'), '10.0');
});

test('bumpVersion rolls a three part version into its neighbour', () => {
  assert.equal(bumpVersion('1.2.3', 3), '1.2.4');
  assert.equal(bumpVersion('1.2.9', 3), '1.3.0');
  assert.equal(bumpVersion('1.9.9', 3), '2.0.0');
});

test('a full release cycle never repeats or skips a version', () => {
  const seen = new Set();
  let version = '1.0';
  for (let index = 0; index < 25; index += 1) {
    assert.equal(seen.has(version), false, `${version} was produced twice`);
    seen.add(version);
    version = bumpVersion(version);
  }
  assert.equal(seen.size, 25);
  assert.equal(version, '3.5');
});

test('formatVersion keeps the project at two digits', () => {
  assert.equal(formatVersion(parseVersion('3.4.9')), '3.4');
  assert.equal(formatVersion(parseVersion('12.0')), '12.0');
});

test('toVersionCode always grows with the version', () => {
  assert.equal(toVersionCode('1.0'), 10000);
  assert.equal(toVersionCode('1.1'), 10100);
  assert.equal(toVersionCode('1.9'), 10900);
  assert.equal(toVersionCode('2.0'), 20000);
  assert.equal(toVersionCode('2.1'), 20100);
  assert.ok(toVersionCode('1.10') > toVersionCode('1.9'));
});

test('compareVersions and isNewerVersion compare numerically', () => {
  assert.equal(compareVersions('1.10', '1.9'), 1);
  assert.equal(compareVersions('1.9', '1.10'), -1);
  assert.equal(compareVersions('2.0', '2.0'), 0);
  assert.equal(compareVersions('1.0', '1'), 0);
  assert.equal(isNewerVersion('1.2', '1.1'), true);
  assert.equal(isNewerVersion('1.1', '1.1'), false);
  assert.equal(isNewerVersion('1.0', '1.1'), false);
});

test('nextVersion continues from version.json', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'calcivo-version-'));
  const file = path.join(directory, 'version.json');
  writeFileSync(file, JSON.stringify({ name: 'Calcivo', version: '1.4' }));
  const info = readVersionInfo(file);
  assert.equal(nextVersion({ info }), '1.5');

  writeVersionInfo({ ...info, version: '1.5' }, file);
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).version, '1.5');
});

test('nextVersion starts at 1.0 when nothing has been released yet', () => {
  assert.equal(nextVersion({ info: { name: 'Calcivo', version: '1.0' } }), '1.1');
  assert.equal(bumpVersion('0.9'), '1.0');
});

test('highestVersion picks the newest of a mixed list', () => {
  assert.equal(highestVersion(['1.4', '1.10', '1.9']), '1.10');
  assert.equal(highestVersion(['bogus', '2.0']), '2.0');
  assert.equal(highestVersion([]), null);
});

test('the CLI prints the version stored in version.json', () => {
  const stored = readVersionInfo();
  const output = execFileSync(process.execPath, ['scripts/version.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(output.trim(), stored.version);
});

test('the CLI prints the next version and matches the version code helper', () => {
  const output = execFileSync(process.execPath, ['scripts/version.mjs', 'next'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  const stored = readVersionInfo();
  assert.equal(output, bumpVersion(stored.version));

  const code = execFileSync(process.execPath, ['scripts/version.mjs', 'code', output], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  assert.equal(Number(code), toVersionCode(output));
});

test('the shipped version.json carries a compact two digit version', () => {
  const stored = readVersionInfo();
  assert.equal(stored.name, 'Calcivo');
  assert.equal(parseVersion(stored.version).length, 3);
  assert.equal(stored.version.split('.').length, 2);
});
