/**
 * Update channel.
 *
 * Calcivo is distributed through GitHub releases. This module talks to the
 * public GitHub API, compares the newest published release with the version
 * that is installed and reports back everything the UI needs to offer an
 * in-app update.
 *
 * The repository slug is baked in at build time (see scripts/build-web.mjs);
 * DEFAULT_REPOSITORY is only the fallback for local development builds. GitHub
 * keeps redirecting a renamed repository, so older builds keep working.
 */

import { compareVersions, formatVersion, isNewerVersion, parseVersion } from './version.js';

export const DEFAULT_REPOSITORY = 'jakariatanjim-svg/test';
export const GITHUB_API = 'https://api.github.com';

/** Accepts "owner/repo", a full https url or a git remote and returns "owner/repo". */
export function normalizeRepository(input) {
  if (typeof input !== 'string') return '';
  let value = input.trim();
  if (value === '') return '';
  value = value.replace(/\.git$/i, '');
  const match = value.match(/github\.com[/:]([^/\s]+)\/([^/\s]+)$/i);
  if (match) return `${match[1]}/${match[2]}`;
  const plain = value.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (plain) return `${plain[1]}/${plain[2]}`;
  return '';
}

/** Picks the APK (and its checksum) that the app should install. */
export function findApkAssets(release) {
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  const apks = assets.filter((asset) => /\.apk$/i.test(asset?.name || ''));
  if (apks.length === 0) return { apk: null, checksum: null };

  const preferred =
    apks.find((asset) => /-latest\.apk$/i.test(asset.name)) ||
    apks.find((asset) => /release/i.test(asset.name)) ||
    apks[0];

  const checksum = assets.find((asset) => asset.name === `${preferred.name}.sha256`) || null;
  return { apk: preferred, checksum };
}

/** Trims release notes down to a short block of plain text for the UI. */
export function summarizeNotes(body, maxLines = 6) {
  if (typeof body !== 'string') return '';
  const lines = body
    .replace(/\r/g, '')
    .split('\n')
    .map((line) =>
      line
        .replace(/^#{1,6}\s*/, '')
        .replace(/^[-*+]\s+/, '')
        .replace(/[*_`>]/g, '')
        .trim(),
    )
    .filter((line) => line !== '' && !/^-{3,}$/.test(line));
  return lines.slice(0, maxLines).join('\n');
}

/** Extracts the version from a release tag such as "v1.4". */
export function versionFromTag(tag) {
  const parts = parseVersion(tag);
  return parts ? formatVersion(parts) : null;
}

/**
 * Asks GitHub for the newest release and compares it with `currentVersion`.
 *
 * @returns {Promise<{
 *   status: 'update' | 'current' | 'no-releases' | 'disabled' | 'error',
 *   message: string,
 *   currentVersion: string,
 *   latestVersion: string|null,
 *   releaseName: string|null,
 *   releaseUrl: string|null,
 *   publishedAt: string|null,
 *   notes: string,
 *   apk: { name: string, url: string, size: number }|null,
 *   checksumUrl: string|null,
 * }>}
 */
export async function checkForUpdate({
  repository = DEFAULT_REPOSITORY,
  currentVersion,
  fetchImpl,
  signal,
} = {}) {
  const slug = normalizeRepository(repository);
  const current = parseVersion(currentVersion) ? formatVersion(parseVersion(currentVersion)) : '0.0';
  const base = {
    currentVersion: current,
    latestVersion: null,
    releaseName: null,
    releaseUrl: null,
    publishedAt: null,
    notes: '',
    apk: null,
    checksumUrl: null,
  };

  if (!slug) {
    return {
      ...base,
      status: 'disabled',
      message: 'This build has no update channel configured.',
    };
  }

  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!doFetch) {
    return { ...base, status: 'error', message: 'This device cannot check for updates.' };
  }

  let response;
  try {
    response = await doFetch(`${GITHUB_API}/repos/${slug}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store',
      signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    return { ...base, status: 'error', message: 'Could not reach GitHub. Check your connection.' };
  }

  if (response.status === 404) {
    return { ...base, status: 'no-releases', message: 'No release has been published yet.' };
  }

  if (response.status === 403 || response.status === 429) {
    return {
      ...base,
      status: 'error',
      message: 'GitHub is limiting update checks right now. Try again in a little while.',
    };
  }

  if (!response.ok) {
    return { ...base, status: 'error', message: `Update check failed (HTTP ${response.status}).` };
  }

  let release;
  try {
    release = await response.json();
  } catch {
    return { ...base, status: 'error', message: 'GitHub sent an unexpected answer.' };
  }

  const latest = versionFromTag(release?.tag_name || release?.name || '');
  if (!latest) {
    return { ...base, status: 'error', message: 'The newest release has no usable version number.' };
  }

  const { apk, checksum } = findApkAssets(release);
  const shared = {
    ...base,
    latestVersion: latest,
    releaseName: release?.name || latest,
    releaseUrl: release?.html_url || null,
    publishedAt: release?.published_at || null,
    notes: summarizeNotes(release?.body),
    apk: apk ? { name: apk.name, url: apk.browser_download_url, size: apk.size || 0 } : null,
    checksumUrl: checksum ? checksum.browser_download_url : null,
  };

  if (!isNewerVersion(latest, current)) {
    return { ...shared, status: 'current', message: `You are on the newest version (${current}).` };
  }

  return {
    ...shared,
    status: 'update',
    message: `Version ${latest} is available. You have ${current}.`,
  };
}

/** Compares two checksum strings written as "sha  file". */
export function checksumMatches(expected, actual) {
  if (!expected || !actual) return false;
  const clean = (value) => value.trim().toLowerCase().split(/\s+/)[0];
  return clean(expected) === clean(actual);
}

export { compareVersions };
