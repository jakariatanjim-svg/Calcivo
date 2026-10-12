/**
 * Thin wrapper around the Capacitor plugins used by the app.
 *
 * Every call is defensive: the same bundle runs in a plain browser during
 * development, where the native plugins are simply not there.
 */

import { Capacitor } from '@capacitor/core';

export function isNative() {
  try {
    return Boolean(Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());
  } catch {
    return false;
  }
}

export function platform() {
  try {
    return Capacitor && Capacitor.getPlatform ? Capacitor.getPlatform() : 'web';
  } catch {
    return 'web';
  }
}

function lazy(loader) {
  let promise = null;
  return () => {
    if (!promise) promise = loader().catch(() => null);
    return promise;
  };
}

const loadApp = lazy(() => import('@capacitor/app'));
const loadHaptics = lazy(() => import('@capacitor/haptics'));
const loadClipboard = lazy(() => import('@capacitor/clipboard'));

function vibrate(pattern) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch {
    /* vibration is a nice to have */
  }
}

/** Light tick for every key press. */
export async function keyFeedback() {
  if (!isNative()) {
    vibrate(8);
    return;
  }
  try {
    const module = await loadHaptics();
    if (!module) throw new Error('haptics unavailable');
    await module.Haptics.impact({ style: module.ImpactStyle.Light });
  } catch {
    vibrate(8);
  }
}

/** Slightly stronger tick for equals. */
export async function resultFeedback() {
  if (!isNative()) {
    vibrate(14);
    return;
  }
  try {
    const module = await loadHaptics();
    if (!module) throw new Error('haptics unavailable');
    await module.Haptics.impact({ style: module.ImpactStyle.Medium });
  } catch {
    vibrate(14);
  }
}

/** @returns {Promise<boolean>} whether the text landed on the clipboard. */
export async function copyText(text) {
  if (isNative()) {
    try {
      const module = await loadClipboard();
      if (module) {
        await module.Clipboard.write({ string: text });
        return true;
      }
    } catch {
      /* fall through to the web API */
    }
  }

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/**
 * Handles the Android hardware back button.
 * @param {() => boolean} onBack return true when the handler consumed the event
 */
export async function registerBackButton(onBack) {
  if (!isNative()) return () => {};
  try {
    const module = await loadApp();
    if (!module) return () => {};
    const handle = await module.App.addListener('backButton', async () => {
      const consumed = onBack();
      if (!consumed) {
        try {
          await module.App.exitApp();
        } catch {
          /* nothing else to do */
        }
      }
    });
    return () => handle.remove();
  } catch {
    return () => {};
  }
}

/** Keeps the app state fresh when it comes back to the foreground. */
export async function registerResume(handler) {
  if (!isNative()) return () => {};
  try {
    const module = await loadApp();
    if (!module) return () => {};
    const handle = await module.App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) handler();
    });
    return () => handle.remove();
  } catch {
    return () => {};
  }
}
