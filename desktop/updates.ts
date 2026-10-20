import { app, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as fs from 'fs';
import * as path from 'path';

import type { Log } from './office.js';

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

export function setUpUpdates(log: Log): void {
  if (!updatesEnabled()) return;
  const url = process.env.OFICINA_UPDATE_URL;
  if (url) useGenericFeed(url);
  autoUpdater.logger = { info: log, warn: log, error: log, debug: () => {} };
  autoUpdater.autoDownload = true;
  autoUpdater.on('update-downloaded', (info) => {
    void dialog
      .showMessageBox({
        type: 'info',
        title: 'Oficina virtual',
        message: `Hay una versión nueva (${info.version}).`,
        detail: 'Se instala al cerrar la oficina. ¿La instalo ahora? Tus agentes se retoman solos.',
        buttons: ['Instalar ahora', 'Después'],
        defaultId: 0,
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      });
  });
  void checkForUpdates(log, false);
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

/** Check now; `tellIfNone` answers "you are up to date" (the tray entry). */
export async function checkForUpdates(log: Log, tellIfNone: boolean): Promise<void> {
  try {
    const result = await autoUpdater.checkForUpdates();
    const newer = result?.isUpdateAvailable ?? false;
    if (!newer && tellIfNone) {
      await dialog.showMessageBox({
        type: 'info',
        title: 'Oficina virtual',
        message: `Tenés la última versión (${app.getVersion()}).`,
      });
    }
  } catch (err) {
    log(
      `[app] No pude buscar actualizaciones: ${err instanceof Error ? err.message : String(err)}`,
    );
    if (tellIfNone) {
      await dialog.showMessageBox({
        type: 'warning',
        title: 'Oficina virtual',
        message: 'No pude buscar actualizaciones ahora. Probá más tarde.',
      });
    }
  }
}
