/**
 * Version arithmetic for CalcS - file and CLI layer.
 *
 * The canonical version lives in `version.json` at the root of the repository
 * and holds the version of the last build.
 *
 *   node scripts/version.mjs                    # print the current version
 *   node scripts/version.mjs next               # version of the next build
 *   node scripts/version.mjs next --write       # ... and store it in version.json
 *   node scripts/version.mjs next --from-tags --write
 *   node scripts/version.mjs code 1.4           # matching Android version code
 *
 * `--from-tags` compares version.json against the released git tags and
 * continues from the highest one, so a build never repeats a version.
 *
 * The sequence runs 1.0, 1.1, ... 1.9, 2.0, ... and continues as 10.0 after 9.9.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DIGITS,
  bumpVersion,
  compareVersions,
  formatVersion,
  parseVersion,
  toVersionCode,
} from '../src/js/version.js';

export { DIGITS, bumpVersion, compareVersions, formatVersion, parseVersion, toVersionCode };

export const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
export const VERSION_FILE = path.join(ROOT, 'version.json');

/** Reads version.json. */
export function readVersionInfo(file = VERSION_FILE) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  if (!data.version || !parseVersion(data.version)) {
    throw new Error('version.json is missing a valid "version" field');
  }
  return data;
}

/** Writes version.json back, keeping the file readable. */
export function writeVersionInfo(info, file = VERSION_FILE) {
  writeFileSync(file, `${JSON.stringify(info, null, 2)}\n`);
}

/** Version names of every release tag in this repository. */
export function versionsFromTags() {
  try {
    const output = execFileSync('git', ['tag', '--list', 'v*'], { cwd: ROOT, encoding: 'utf8' });
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => parseVersion(line))
      .filter(Boolean)
      .map((parts) => formatVersion(parts, DIGITS));
  } catch {
    return [];
  }
}

/** The newest version of the given list, or null when the list is empty. */
export function highestVersion(list) {
  let best = null;
  for (const item of list) {
    if (!parseVersion(item)) continue;
    if (best === null || compareVersions(item, best) > 0) best = item;
  }
  return best;
}

/** The version the next build should carry. */
export function nextVersion({ info = readVersionInfo(), includeTags = false } = {}) {
  const candidates = [info.version];
  if (includeTags) candidates.push(...versionsFromTags());
  const base = highestVersion(candidates) ?? info.version;
  return bumpVersion(base, DIGITS);
}

function writeGithubOutput(values) {
  const target = process.env.GITHUB_OUTPUT;
  if (!target) return;
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);
  writeFileSync(target, `${lines.join('\n')}\n`, { flag: 'a' });
}

function main(argv) {
  const [command = 'current', ...rest] = argv;
  const flags = new Set(rest.filter((item) => item.startsWith('--')));
  const positional = rest.filter((item) => !item.startsWith('--'));
  const info = readVersionInfo();

  switch (command) {
    case 'current':
      console.log(info.version);
      return;

    case 'next': {
      const version = nextVersion({ info, includeTags: flags.has('--from-tags') });
      if (flags.has('--write')) writeVersionInfo({ ...info, version });
      console.log(version);
      writeGithubOutput({ version, version_code: toVersionCode(version) });
      if (flags.has('--write')) console.error(`version.json updated to ${version}`);
      return;
    }

    case 'code':
      console.log(toVersionCode(positional[0] || info.version));
      return;

    case 'highest':
      console.log(highestVersion([info.version, ...versionsFromTags()]) ?? info.version);
      return;

    default:
      console.error(`Unknown command "${command}". Use: current | next | code | highest`);
      process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv.slice(2));
}
