/**
 * Controller for the "About and updates" sheet.
 *
 * It owns the whole update flow: checking GitHub for a new release, downloading
 * the APK with live progress, verifying the published checksum and handing the
 * file to the Android package installer.
 */

import * as apkUpdater from './apk-updater.js';
import { checkForUpdate, checksumMatches, normalizeRepository } from './update.js';

/** Inline Material style icons - the app never uses emoji. */
const ICONS = {
  search:
    '<path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z"/>',
  check:
    '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1.2 14.4-4.2-4.2 1.4-1.4 2.8 2.8 6-6 1.4 1.4-7.4 7.4z"/>',
  download:
    '<path d="M11 3h2v9.6l3.3-3.3 1.4 1.4L12 16.4l-5.7-5.7 1.4-1.4L11 12.6V3zM4 18h16v3H4z"/>',
  install:
    '<path d="M12 2 4 5v6c0 5 3.4 9.6 8 11 4.6-1.4 8-6 8-11V5l-8-3zm-1.2 14.4L6.6 12.2 8 10.8l2.8 2.8 4.8-4.8 1.4 1.4-6.2 6.2z"/>',
  refresh:
    '<path d="M17.65 6.35A8 8 0 1 0 20 12h-2a6 6 0 1 1-1.76-4.24L13 11h7V4l-2.35 2.35z"/>',
  warning:
    '<path d="M12 2 1 21h22L12 2zm1 15h-2v2h2v-2zm0-7h-2v5h2V10z"/>',
  spark:
    '<path d="M12 2.5l1.8 5.2 5.2 1.8-5.2 1.8L12 16.5l-1.8-5.2L5 9.5l5.2-1.8L12 2.5zM5 16l.9 2.6L8.5 19.5l-2.6.9L5 23l-.9-2.6L1.5 19.5l2.6-.9L5 16z"/>',
  settings:
    '<path d="M19.14 12.94a7.5 7.5 0 0 0 0-1.88l2.03-1.58-1.93-3.34-2.4.97a7.3 7.3 0 0 0-1.62-.94l-.36-2.55H10.6l-.36 2.55c-.58.24-1.12.55-1.62.94l-2.4-.97-1.93 3.34 2.03 1.58a7.5 7.5 0 0 0 0 1.88l-2.03 1.58 1.93 3.34 2.4-.97c.5.39 1.04.7 1.62.94l.36 2.55h4.26l.36-2.55c.58-.24 1.12-.55 1.62-.94l2.4.97 1.93-3.34-2.03-1.58zM12.73 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/>',
  money:
    '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1.5 15.4v1.1h-2v-1.1a4.6 4.6 0 0 1-1.9-.6l.5-1.9c.5.3 1.2.6 1.9.6.7 0 1.2-.3 1.2-.8 0-.4-.3-.7-1.3-1-1.5-.5-2.4-1.1-2.4-2.4 0-1.1.8-2 2-2.3V8.5h2v1.1c.7.1 1.3.3 1.8.6l-.5 1.9c-.5-.3-1-.5-1.7-.5-.7 0-1.1.3-1.1.7 0 .4.4.6 1.4 1 1.5.5 2.4 1.1 2.4 2.4 0 1.2-.9 2.2-2.3 2.5z"/>',
  swap:
    '<path d="M7 7h11l-4-4 1.4-1.4L21.8 8l-6.4 6.4L14 13l4-4H7V7zm10 10H6l4 4-1.4 1.4L2.2 16l6.4-6.4L10 11l-4 4h11v2z"/>',
  function:
    '<path d="M18 4H6l4 8-4 8h12v-2.5h-7.4l2.9-5.5-2.9-5.5H18V4z"/>',
  palette:
    '<path d="M12 3a9 9 0 0 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-.9-.5-1.2-.3-.4-.5-.8-.5-1.3 0-1 .9-1.8 1.9-1.8H16a5 5 0 0 0 5-5c0-3.9-4-6.7-9-6.7zM6.5 12A1.5 1.5 0 1 1 8 10.5 1.5 1.5 0 0 1 6.5 12zm3-4A1.5 1.5 0 1 1 11 6.5 1.5 1.5 0 0 1 9.5 8zm5 0A1.5 1.5 0 1 1 16 6.5 1.5 1.5 0 0 1 14.5 8z"/>',
  widget:
    '<path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z"/>',
  export:
    '<path d="M12 3 8 7h3v6h2V7h3l-4-4zM5 14v5h14v-5h2v7H3v-7h2z"/>',
};

const svg = (name) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${ICONS[name] || ''}</svg>`;

/** Roadmap shown in the About sheet. */
export const UPCOMING_FEATURES = [
  { icon: 'money', label: 'Currency and money calculators' },
  { icon: 'swap', label: 'Unit and measurement converter' },
  { icon: 'function', label: 'Scientific functions and graphs' },
  { icon: 'palette', label: 'Themes and accent colours' },
  { icon: 'widget', label: 'Home screen widgets and quick tiles' },
  { icon: 'export', label: 'Export and share your history' },
];

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * @param {{
 *   elements: Record<string, HTMLElement>,
 *   getVersion: () => string,
 *   getRepository: () => string,
 *   onSnackbar?: (message: string) => void,
 *   onUpdateAvailable?: (result: object) => void,
 *   fetchImpl?: typeof fetch,
 *   bridge?: object  native side, replaced in tests
 * }} options
 */
export function createUpdater({
  elements,
  getVersion,
  getRepository,
  onSnackbar,
  onUpdateAvailable,
  fetchImpl,
  bridge = apkUpdater,
} = {}) {
  const state = {
    phase: 'idle', // idle | checking | current | available | downloading | ready | permission | installing | error | disabled | no-releases
    result: null,
    progress: null,
    errorMessage: '',
    download: null, // { fileName, size, verified }
  };

  function renderFeatures() {
    const list = elements.featureList;
    if (!list) return;
    list.textContent = '';
    for (const feature of UPCOMING_FEATURES) {
      const item = document.createElement('li');
      item.className = 'feature-list__item';

      const icon = document.createElement('span');
      icon.className = 'feature-list__icon';
      icon.innerHTML = svg(feature.icon);

      const label = document.createElement('span');
      label.textContent = feature.label;

      const soon = document.createElement('span');
      soon.className = 'feature-list__soon';
      soon.textContent = 'soon';

      item.append(icon, label, soon);
      list.appendChild(item);
    }
  }

  function setIcon(name, extraClass) {
    const icon = elements.updateIcon;
    if (!icon) return;
    icon.className = `update-card__icon${extraClass ? ` ${extraClass}` : ''}`;
    icon.innerHTML = extraClass === 'is-checking' ? '' : svg(name);
  }

  function setPrimary(label, handler, { hidden = false, disabled = false } = {}) {
    const button = elements.updatePrimary;
    if (!button) return;
    button.hidden = hidden;
    button.disabled = disabled;
    if (label !== null) button.textContent = label;
    button.onclick = handler || null;
  }

  function setSecondary(label, handler, { hidden = false } = {}) {
    const button = elements.updateSecondary;
    if (!button) return;
    button.hidden = hidden;
    if (label !== null) button.textContent = label;
    button.onclick = handler || null;
  }

  function setProgress(progress, metaText) {
    const container = elements.updateProgress;
    const bar = elements.progressBar;
    if (!container || !bar) return;

    container.hidden = !progress;
    if (!progress) return;

    const bar_ = bar.parentElement;
    const unknown = !progress.total;
    if (bar_) bar_.classList.toggle('is-indeterminate', unknown);
    bar.style.width = unknown ? '' : `${Math.max(2, Math.min(100, progress.percent))}%`;
    if (elements.updateMeta) elements.updateMeta.textContent = metaText || '';
  }

  function setNotes(text) {
    if (!elements.updateNotes) return;
    elements.updateNotes.hidden = !text;
    elements.updateNotes.textContent = text || '';
  }

  function render() {
    const card = elements.updateCard;
    const title = elements.updateTitle;
    const status = elements.updateStatus;
    if (!card) return;

    card.classList.toggle('is-update', state.phase === 'available');
    card.classList.toggle('is-error', state.phase === 'error');

    const version = getVersion();
    if (elements.aboutVersion) elements.aboutVersion.textContent = version;

    switch (state.phase) {
      case 'checking':
        setIcon('refresh', 'is-checking');
        title.textContent = 'Checking for updates';
        status.textContent = 'Looking at the newest GitHub release...';
        setProgress(null);
        setNotes('');
        setPrimary(null, null, { hidden: true });
        setSecondary(null, null, { hidden: true });
        break;

      case 'current':
        setIcon('check');
        title.textContent = 'You are up to date';
        status.textContent = `Version ${state.result?.currentVersion || version} is the newest release.`;
        setProgress(null);
        setNotes('');
        setPrimary('Check again', () => check({ silent: false }));
        setSecondary(null, null, { hidden: true });
        break;

      case 'available': {
        const result = state.result || {};
        setIcon('download');
        title.textContent = `Version ${result.latestVersion} is available`;
        status.textContent = result.apk
          ? `You have ${result.currentVersion}. Download is ${formatBytes(result.apk.size)}.`
          : `You have ${result.currentVersion}, but this release has no APK attached.`;
        setProgress(null);
        const notes = [result.notes, result.publishedAt ? `Published ${formatDate(result.publishedAt)}` : '']
          .filter(Boolean)
          .join('\n');
        setNotes(notes);
        setPrimary('Download update', () => download(), { disabled: !result.apk || !bridge.isAndroid() });
        setSecondary(null, null, { hidden: true });
        if (!bridge.isAndroid()) {
          status.textContent += ' Updates install themselves in the Android app only.';
        }
        break;
      }

      case 'downloading': {
        const progress = state.progress || { percent: 0, received: 0, total: 0 };
        setIcon('download');
        title.textContent = 'Downloading update';
        status.textContent = progress.total
          ? `Version ${state.result?.latestVersion} - ${formatBytes(progress.received)} of ${formatBytes(progress.total)}`
          : `Version ${state.result?.latestVersion} - ${formatBytes(progress.received)} downloaded`;
        setProgress(progress, progress.total ? `${progress.percent}%` : 'working...');
        setNotes('');
        setPrimary(null, null, { hidden: true });
        setSecondary('Cancel', () => cancel());
        break;
      }

      case 'ready': {
        const download = state.download || {};
        setIcon('install');
        title.textContent = 'Ready to install';
        status.textContent = download.verified
          ? `Downloaded ${formatBytes(download.size)}. The checksum matches the release.`
          : `Downloaded ${formatBytes(download.size)}.`;
        setProgress({ percent: 100, received: download.size, total: download.size }, '100%');
        setNotes('');
        setPrimary('Install update', () => install());
        setSecondary('Download again', () => download());
        break;
      }

      case 'permission':
        setIcon('settings');
        title.textContent = 'Allow the installer';
        status.textContent =
          'Android needs your permission before Calcivo can install an update. Open the settings screen, allow Calcivo to install unknown apps, then come back and tap install.';
        setProgress(null);
        setNotes('');
        setPrimary('Open settings', () => openSettings());
        setSecondary('I allowed it', () => install());
        break;

      case 'installing':
        setIcon('install');
        title.textContent = 'Confirm the installation';
        status.textContent =
          'The Android installer is open. Follow the prompts and the app will restart on the new version.';
        setProgress(null);
        setNotes('');
        setPrimary('Open installer again', () => install());
        setSecondary(null, null, { hidden: true });
        break;

      case 'no-releases':
        setIcon('warning');
        title.textContent = 'No release published yet';
        status.textContent = 'The update channel is empty for now. Check again after the first release.';
        setProgress(null);
        setNotes('');
        setPrimary('Check again', () => check({ silent: false }));
        setSecondary(null, null, { hidden: true });
        break;

      case 'disabled':
        setIcon('warning');
        title.textContent = 'Update channel not set';
        status.textContent = state.errorMessage || 'This build was made outside the release channel.';
        setProgress(null);
        setNotes('');
        setPrimary(null, null, { hidden: true });
        setSecondary(null, null, { hidden: true });
        break;

      case 'error':
        setIcon('warning');
        title.textContent = 'Update check failed';
        status.textContent = state.errorMessage || 'Something went wrong.';
        setProgress(null);
        setNotes('');
        setPrimary('Try again', () => check({ silent: false }));
        setSecondary(null, null, { hidden: true });
        break;

      case 'idle':
      default:
        setIcon('refresh');
        title.textContent = 'Updates';
        status.textContent = `Installed version ${version}. Tap check to look for a newer release.`;
        setProgress(null);
        setNotes('');
        setPrimary('Check for updates', () => check({ silent: false }));
        setSecondary(null, null, { hidden: true });
        break;
    }
  }

  async function check({ silent = false } = {}) {
    if (state.phase === 'downloading') return null;

    const previous = state.phase;
    state.phase = 'checking';
    state.errorMessage = '';
    if (!silent) render();

    const result = await checkForUpdate({
      repository: getRepository(),
      currentVersion: getVersion(),
      fetchImpl,
    });

    state.result = result;

    switch (result.status) {
      case 'update':
        state.phase = 'available';
        if (onUpdateAvailable) onUpdateAvailable(result);
        if (!silent && onSnackbar) onSnackbar(`Version ${result.latestVersion} is ready to install`);
        break;
      case 'current':
        state.phase = 'current';
        if (!silent && onSnackbar) onSnackbar('You are on the newest version');
        break;
      case 'no-releases':
        state.phase = 'no-releases';
        break;
      case 'disabled':
        state.phase = 'disabled';
        state.errorMessage = result.message;
        break;
      default:
        state.phase = previous === 'checking' ? 'error' : previous === 'idle' ? 'error' : previous;
        if (result.status === 'error') {
          state.phase = 'error';
          state.errorMessage = result.message;
          if (!silent && onSnackbar) onSnackbar(result.message);
        }
    }

    render();
    return result;
  }

  async function download() {
    const result = state.result;
    if (!result?.apk) {
      if (onSnackbar) onSnackbar('This release has no APK attached');
      return;
    }

    state.phase = 'downloading';
    state.progress = { percent: 0, received: 0, total: result.apk.size || 0 };
    render();

    try {
      const downloaded = await bridge.downloadApk({
        url: result.apk.url,
        fileName: result.apk.name,
        onProgress: (progress) => {
          state.progress = progress;
          if (elements.updateProgress && !elements.updateProgress.hidden) {
            const meta = progress.total
              ? `${progress.percent}% - ${formatBytes(progress.received)} of ${formatBytes(progress.total)}`
              : formatBytes(progress.received);
            setProgress(progress, meta);
            if (elements.updateStatus && state.result) {
              elements.updateStatus.textContent = `Downloading version ${state.result.latestVersion} - ${meta}`;
            }
          }
        },
      });

      let verified = false;
      if (result.checksumUrl && downloaded?.sha256) {
        const expected = await bridge.fetchChecksum(result.checksumUrl, fetchImpl);
        verified = checksumMatches(expected, downloaded.sha256);
        if (!verified) {
          state.phase = 'error';
          state.errorMessage =
            'The downloaded file does not match the published checksum. Download it again to be safe.';
          render();
          return;
        }
      }

      state.download = {
        fileName: downloaded.fileName,
        size: downloaded.size || result.apk.size,
        verified,
      };
      state.phase = 'ready';
      state.progress = null;
      render();
    } catch (error) {
      state.phase = 'error';
      state.errorMessage = error?.message || 'The download failed.';
      state.progress = null;
      render();
      if (onSnackbar) onSnackbar(state.errorMessage);
    }
  }

  async function cancel() {
    await bridge.cancelDownload();
    state.progress = null;
    state.phase = state.result ? 'available' : 'idle';
    render();
  }

  async function install() {
    const downloadInfo = state.download;
    if (!downloadInfo) return;

    if (!(await bridge.canInstallPackages())) {
      state.phase = 'permission';
      render();
      await bridge.openInstallPermissionSettings();
      return;
    }

    try {
      const { needsPermission } = await bridge.installApk({ fileName: downloadInfo.fileName });
      if (needsPermission) {
        state.phase = 'permission';
        render();
        await bridge.openInstallPermissionSettings();
        return;
      }
      state.phase = 'installing';
      render();
    } catch (error) {
      state.phase = 'error';
      state.errorMessage = error?.message || 'Could not open the installer.';
      render();
    }
  }

  async function openSettings() {
    await bridge.openInstallPermissionSettings();
  }

  return {
    check,
    download,
    cancel,
    install,
    openSettings,
    render,
    renderFeatures,
    get phase() {
      return state.phase;
    },
    get state() {
      return state;
    },
    get repository() {
      return normalizeRepository(getRepository());
    },
  };
}
