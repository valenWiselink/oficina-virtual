import { app, ipcMain } from 'electron';
import { autoUpdater, type UpdateInfo } from 'electron-updater';
import * as fs from 'fs';
import * as path from 'path';

import { readState, writeState } from './appState.js';
import type { Log } from './office.js';
import { answerCheck, askToInstall } from './updateDialogs.js';
import { normalizeReleaseNotes, type ReleaseNote, whatsNewOnStart } from './updateNotes.js';

/** How often to look for a new version while the app runs (also at start). */
const CHECK_EVERY_MS = 20 * 60_000;
/** Grace for the page to show a ready update itself before the native
 *  fallback asks (a page still loading asks for the state within this). */
const PAGE_GRACE_MS = 15_000;

/**
 * Everything the office page needs to show about updates (webview-ui
 * src/updates/desktopUpdates.ts mirrors this shape).
 */
export interface UpdateState {
  /** There is somewhere to get updates from (see updatesEnabled). */
  enabled: boolean;
  /** The version installed and running. */
  current: string;
  status: 'idle' | 'checking' | 'downloading' | 'ready' | 'none' | 'error';
  /** The newer version found (while downloading, and once ready). */
  version?: string;
  /** Its notes, plus the skipped versions' (newest first). */
  notes: ReleaseNote[];
  /** "Cuando nadie esté trabajando" is armed: the page installs it as soon
   *  as no agent is working. Kept here so a page reload does not forget it. */
  whenIdle: boolean;
  /** The last check's outcome; `manual` when someone asked for it. */
  lastCheck?: { at: number; outcome: 'none' | 'found' | 'error'; manual: boolean };
  /** Shown once after an update, until the page closes it. */
  whatsNew?: { version: string; notes: ReleaseNote[] };
}

/**
 * Updates are on only when there is somewhere to get them from:
 * - the build was published with a `publish` target (electron-builder then
 *   writes resources/app-update.yml), or
 * - OFICINA_UPDATE_URL points at a folder (a "generic" feed) holding
 *   latest.yml and the new Setup .exe.
 * Otherwise nothing is checked and the tray shows no update entry.
 */
export function updatesEnabled(): boolean {
  if (!app.isPackaged) return false;
  return (
    !!process.env.OFICINA_UPDATE_URL ||
    fs.existsSync(path.join(process.resourcesPath, 'app-update.yml'))
  );
}

/**
 * The updater as the office page drives it: checks at start and every
 * CHECK_EVERY_MS, downloads on its own, and tells the page (`publish`)
 * instead of opening a dialog. Installing is the page's call ("Instalar
 * ahora" or "Cuando nadie esté trabajando"); an update left downloaded is
 * also installed when the app quits (electron-updater's autoInstallOnAppQuit).
 */
export class Updates {
  private state: UpdateState;
  private manualCheck = false;
  /** The page shown asked for the update state since it loaded, so it shows
   *  updates itself. An older office page never asks (updateDialogs.ts). */
  private pageKnows = false;
  /** The version the native fallback already asked about (a downloaded
   *  update is announced again on every later check). */
  private askedFor?: string;

  constructor(
    private readonly log: Log,
    private readonly publish: (state: UpdateState) => void,
  ) {
    this.state = {
      enabled: updatesEnabled(),
      current: app.getVersion(),
      status: 'idle',
      notes: [],
      whenIdle: false,
      whatsNew: app.isPackaged ? rememberVersion(app.getVersion()) : undefined,
    };
  }

  start(): void {
    this.registerIpc();
    if (!this.state.enabled) return;
    const url = process.env.OFICINA_UPDATE_URL;
    if (url) useGenericFeed(url);
    autoUpdater.logger = { info: this.log, warn: this.log, error: this.log, debug: () => {} };
    autoUpdater.autoDownload = true;
    // Also the notes of the versions in between, when one is skipped.
    autoUpdater.fullChangelog = true;
    this.listen();
    void this.check(false);
    setInterval(() => {
      if (this.state.status !== 'downloading') void this.check(false);
    }, CHECK_EVERY_MS);
  }

  /** The window started loading a page: until that page asks for the
   *  state, assume it cannot show updates. */
  pageLoading(): void {
    this.pageKnows = false;
  }

  /** Check now. Resolves with the state once the check (not the download)
   *  is over. */
  async check(manual: boolean): Promise<UpdateState> {
    if (!this.state.enabled) return this.state;
    this.manualCheck = this.manualCheck || manual;
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      this.log(`[app] No pude buscar actualizaciones: ${errorText(err)}`);
      this.finishCheck('error');
    }
    if (manual && !this.pageKnows) void this.answerNatively();
    return this.state;
  }

  /** "Buscar actualizaciones" from the tray over a page that cannot answer. */
  private async answerNatively(): Promise<void> {
    const { status, version, lastCheck, current } = this.state;
    if (status === 'ready' && version) {
      if (await askToInstall(version)) this.install();
    } else if (lastCheck?.outcome === 'none' || lastCheck?.outcome === 'error') {
      await answerCheck(lastCheck.outcome, current);
    }
  }

  private listen(): void {
    autoUpdater.on('checking-for-update', () => {
      if (this.state.status !== 'ready') this.set({ status: 'checking' });
    });
    autoUpdater.on('update-available', (info) => {
      this.set({ status: 'downloading', ...this.found(info) });
      this.finishCheck('found');
    });
    autoUpdater.on('update-not-available', () => {
      if (this.state.status !== 'ready') this.set({ status: 'none' });
      this.finishCheck(this.state.status === 'ready' ? 'found' : 'none');
    });
    autoUpdater.on('update-downloaded', (info) => {
      const found = this.found(info);
      writeState({ pendingUpdate: found });
      this.set({ status: 'ready', ...found });
      setTimeout(() => void this.fallBackToDialog(found.version), PAGE_GRACE_MS);
    });
    autoUpdater.on('error', (err) => {
      this.log(`[app] Actualización: ${errorText(err)}`);
      if (this.state.status !== 'ready') this.set({ status: 'error' });
    });
  }

  /** A page that cannot show the notice gets the native question instead. */
  private async fallBackToDialog(version: string): Promise<void> {
    if (this.pageKnows || this.askedFor === version) return;
    if (this.state.status !== 'ready' || this.state.version !== version) return;
    this.askedFor = version;
    if (await askToInstall(version)) this.install();
  }

  private install(): void {
    if (this.state.status !== 'ready') return;
    this.log(`[app] Instalando la ${this.state.version ?? '?'}`);
    autoUpdater.quitAndInstall();
  }

  private found(info: UpdateInfo): { version: string; notes: ReleaseNote[] } {
    return { version: info.version, notes: normalizeReleaseNotes(info.releaseNotes, info.version) };
  }

  private finishCheck(outcome: 'none' | 'found' | 'error'): void {
    const manual = this.manualCheck;
    this.manualCheck = false;
    this.set({ lastCheck: { at: Date.now(), outcome, manual } });
  }

  private set(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch };
    this.publish(this.state);
  }

  private registerIpc(): void {
    ipcMain.handle('oficina:update-state', () => {
      this.pageKnows = true;
      return this.state;
    });
    ipcMain.handle('oficina:update-check', () => this.check(true));
    ipcMain.on('oficina:update-install', () => this.install());
    ipcMain.on('oficina:update-when-idle', (_event, on: unknown) => {
      this.set({ whenIdle: on === true });
    });
    ipcMain.on('oficina:update-whats-new-seen', () => {
      writeState({ whatsNew: undefined });
      this.set({ whatsNew: undefined });
    });
  }
}

/**
 * Record the version that runs now and work out what's new. It stays in
 * estado.json until the page closes it, so a start where the page never got
 * to show it (the office failed to open) still shows it next time.
 */
function rememberVersion(current: string): UpdateState['whatsNew'] {
  const saved = readState();
  const fresh = whatsNewOnStart(
    {
      lastVersion: saved.lastVersion,
      pendingUpdate: saved.pendingUpdate,
      hadState: Object.keys(saved).length > 0,
    },
    current,
  );
  const whatsNew = fresh ?? saved.whatsNew;
  writeState({ lastVersion: current, pendingUpdate: undefined, whatsNew });
  return whatsNew;
}

/** A URL feed: electron-updater reads its whole config (cache folder
 *  included) from a yml file — a published build ships one in resources;
 *  here it is written to the app's data folder. */
function useGenericFeed(url: string): void {
  const file = path.join(app.getPath('userData'), 'app-update.yml');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    `provider: generic
url: ${JSON.stringify(url)}
updaterCacheDirName: oficina-virtual-updater
`,
  );
  autoUpdater.updateConfigPath = file;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
