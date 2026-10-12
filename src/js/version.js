/**
 * Version helpers shared by the app, the build scripts and the tests.
 *
 * CalcS uses a compact two part version: MAJOR.MINOR. Every build increases
 * the version by one step and digits roll over at nine, so the sequence runs
 * 1.0, 1.1, ... 1.9, 2.0, 2.1, ... Three part versions (1.2.3) are accepted as
 * well, in which case the last digit rolls over into the previous one.
 *
 * Pure functions only: no DOM access and no Node APIs.
 */

/** Number of digits in the project version. */
export const DIGITS = 2;

/** Highest digit value before a digit rolls over into its neighbour. */
export const ROLLOVER = 9;

/** Parses "1.4", "v1.4.2" or "1" into [major, minor, patch]; null when invalid. */
export function parseVersion(text) {
  if (typeof text !== 'string') {
    if (Array.isArray(text)) return text.slice();
    return null;
  }
  const cleaned = text.trim().replace(/^v/i, '');
  if (!/^\d+(\.\d+){0,2}$/.test(cleaned)) return null;
  const parts = cleaned.split('.').map((part) => Number(part));
  while (parts.length < 3) parts.push(0);
  return parts;
}

/** Formats a version array with the requested number of digits. */
export function formatVersion(parts, digits = DIGITS) {
  return parts.slice(0, digits).join('.');
}

/**
 * Compares two versions numerically.
 * @returns {number} -1 when a < b, 0 when equal, 1 when a > b
 */
export function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return 0;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const l = left[index] ?? 0;
    const r = right[index] ?? 0;
    if (l !== r) return l < r ? -1 : 1;
  }
  return 0;
}

/** True when `candidate` is a newer version than `current`. */
export function isNewerVersion(candidate, current) {
  return compareVersions(candidate, current) > 0;
}

/** Increases a version by one step, carrying into the next digit at nine. */
export function bumpVersion(version, digits = DIGITS) {
  const parts = parseVersion(version);
  if (!parts) throw new Error(`Not a valid version: ${version}`);

  const target = parts.slice(0, digits);
  let index = target.length - 1;
  while (index >= 0) {
    target[index] += 1;
    if (target[index] <= ROLLOVER) return formatVersion(target, digits);
    target[index] = 0;
    index -= 1;
  }

  // Every digit rolled over, so the leading one grows: 9.9 -> 10.0
  target[0] = 10;
  return formatVersion(target, digits);
}

/** Android version code: a single number that always grows with the version. */
export function toVersionCode(version) {
  const parts = parseVersion(version);
  if (!parts) throw new Error(`Not a valid version: ${version}`);
  const [major, minor, patch] = parts;
  return major * 10000 + minor * 100 + patch;
}
