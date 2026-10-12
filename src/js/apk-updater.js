/**
 * Bridge to the native ApkUpdater plugin.
 *
 * The plugin downloads a release APK with progress callbacks and hands it to
 * the Android package installer. Everything is wrapped so the same bundle can
 * run in a browser, where installing an APK is simply not possible.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

const ApkUpdater = registerPlugin('ApkUpdater');

/** True when the app runs inside the Android shell. */
export function isAndroid() {
  try {
    return Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

/**
 * @returns {Promise<{supported: boolean, canInstall: boolean, sdk?: number}>}
 */
export async function getUpdaterInfo() {
  if (!isAndroid()) return { supported: false, canInstall: false };
  try {
    const info = await ApkUpdater.isSupported();
    return {
      supported: Boolean(info?.supported),
      canInstall: Boolean(info?.canInstall),
      sdk: info?.sdk,
    };
  } catch {
    return { supported: false, canInstall: false };
  }
}

/**
 * Downloads an APK.
 * @param {{url: string, fileName: string, onProgress?: (progress: {percent: number, received: number, total: number}) => void}} options
 * @returns {Promise<{fileName: string, path: string, size: number, sha256: string}>}
 */
export async function downloadApk({ url, fileName, onProgress }) {
  if (!isAndroid()) throw new Error('Downloading updates is only supported in the Android app.');

  let handle = null;
  if (typeof onProgress === 'function') {
    handle = await ApkUpdater.addListener('downloadProgress', (progress) => {
      onProgress({
        percent: typeof progress?.percent === 'number' ? progress.percent : -1,
        received: progress?.received || 0,
        total: progress?.total || 0,
      });
    });
  }

  try {
    return await ApkUpdater.download({ url, fileName });
  } finally {
    if (handle) await handle.remove();
  }
}

/** Asks the system installer to install a previously downloaded APK. */
export async function installApk({ fileName }) {
  if (!isAndroid()) throw new Error('Installing updates is only supported in the Android app.');
  const result = await ApkUpdater.install({ fileName });
  return { needsPermission: Boolean(result?.needsPermission) };
}

/** Whether Android lets this app open the package installer. */
export async function canInstallPackages() {
  if (!isAndroid()) return false;
  try {
    const result = await ApkUpdater.canInstall();
    return Boolean(result?.canInstall);
  } catch {
    return false;
  }
}

/** Opens the "install unknown apps" screen for Calcivo. */
export async function openInstallPermissionSettings() {
  if (!isAndroid()) return false;
  try {
    await ApkUpdater.openInstallSettings();
    return true;
  } catch {
    return false;
  }
}

/** Stops a running download. */
export async function cancelDownload() {
  if (!isAndroid()) return;
  try {
    await ApkUpdater.cancel();
  } catch {
    /* nothing to cancel */
  }
}

/** Fetches a checksum file (used to verify the downloaded APK). */
export async function fetchChecksum(url, fetchImpl) {
  const doFetch = fetchImpl || fetch;
  try {
    const response = await doFetch(url, { cache: 'no-store' });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}
