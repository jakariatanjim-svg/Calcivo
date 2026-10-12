/**
 * Bridge to the native FloatingWindow plugin (Android picture in picture).
 *
 * The same bundle runs in a browser during development, where a floating
 * window simply does not exist, so every call falls back to a "not supported"
 * answer instead of throwing.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

const FloatingWindow = registerPlugin('FloatingWindow');

function isAndroid() {
  try {
    return Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

/** True when this device can show the app in a floating window. */
export async function isFloatingWindowSupported() {
  if (!isAndroid()) return false;
  try {
    const info = await FloatingWindow.isSupported();
    return Boolean(info?.supported);
  } catch {
    return false;
  }
}

/**
 * Moves the app into the small floating window.
 * @returns {Promise<{entered: boolean, reason: string}>}
 */
export async function enterFloatingWindow() {
  if (!isAndroid()) return { entered: false, reason: 'unsupported' };
  try {
    const result = await FloatingWindow.enter();
    return { entered: Boolean(result?.entered), reason: result?.reason || '' };
  } catch (error) {
    return { entered: false, reason: error?.message || 'failed' };
  }
}

/**
 * Listens for the app entering and leaving the floating window. The native side
 * sends this as a window event, so a plain listener is enough.
 * @param {(active: boolean) => void} handler
 * @returns {() => void} unsubscribe
 */
export function onFloatingWindowChange(handler) {
  if (typeof window === 'undefined' || typeof handler !== 'function') return () => {};
  // Capacitor's native bridge copies the payload onto the event object itself
  // (a plain Event, not a CustomEvent), so `active` is read from there.
  const listener = (event) => handler(Boolean(event?.active ?? event?.detail?.active));
  window.addEventListener('floatingWindowChanged', listener);
  return () => window.removeEventListener('floatingWindowChanged', listener);
}
