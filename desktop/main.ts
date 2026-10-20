/**
 * Oficina virtual as a desktop app: one window over the same office the
 * browser opens (the server in dist/cli.js, run with this app's own Node), a
 * tray icon so closing the window leaves the agents working, and the hooks
 * and updates a PC without Node needs. See desktop/README in the repo docs.
 */
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

import { readState, savedBounds, trackBounds, writeState } from './appState.js';
import { PAPER } from './colors.js';
import { runHookIfAsked, runUninstallIfAsked } from './hookRelay.js';
import { type Office, openOffice, redactToken, stopServer } from './office.js';
import { errorPage, startingPage } from './pages.js';
import { checkForUpdates, setUpUpdates, updatesEnabled } from './updates.js';

const APP_ID = 'com.oficina.virtual';
const appRoot = app.getAppPath();
/** How long the page's goodbye stays up after our server shuts down. */
const GOODBYE_MS = 5000;
const iconPath = path.join(appRoot, 'dist', 'webview', 'icons', 'oficina.ico');

// A hook or the uninstaller: do that and leave, no window, no lock.
if (
  !runHookIfAsked(process.argv) &&
  !runUninstallIfAsked(process.argv, path.join(appRoot, 'dist', 'cli.js'))
) {
  startApp();
}

function startApp(): void {
  // The same data folder (%APPDATA%Oficina virtual) running packaged or not.
  app.setName('Oficina virtual');
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  app.setAppUserModelId(APP_ID);

  let win: BrowserWindow | null = null;
  let tray: Tray | null = null;
  let office: Office | null = null;
  let quitting = false;
  let restarts = 0;

  const logDir = path.join(app.getPath('userData'), 'logs');
  const log = (line: string) => {
    try {
      fs.mkdirSync(logDir, { recursive: true });
      const day = new Date().toISOString().slice(0, 10);
      fs.appendFileSync(
        path.join(logDir, `oficina-${day}.log`),
        `${new Date().toISOString()} ${redactToken(line)}\n`,
      );
    } catch {
      /* logging must never take the app down */
    }
  };

  const show = () => {
    // The window can be gone (closed from inside the page): make a new one
    // over the same office.
    if (!win || win.isDestroyed()) {
      createWindow();
      if (office) void win?.loadURL(office.url);
    }
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  };

  app.on('second-instance', show);

  const createWindow = () => {
    const state = readState();
    win = new BrowserWindow({
      ...(savedBounds() ?? { width: 1400, height: 880 }),
      minWidth: 900,
      minHeight: 600,
      title: 'Oficina',
      icon: iconPath,
      show: false,
      autoHideMenuBar: true,
      backgroundColor: PAPER,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: path.join(__dirname, 'preload.js'),
      },
    });
    if (state.maximized) win.maximize();
    trackBounds(win);
    win.once('ready-to-show', () => win?.show());
    // Links to anything but the office open in the default browser.
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//.test(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (event, url) => {
      if (office && url.startsWith(`http://127.0.0.1:${office.port}/`)) return;
      event.preventDefault();
      if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    });
    // Closing leaves the office running in the tray (the agents keep working).
    win.on('close', (event) => {
      if (quitting) return;
      event.preventDefault();
      win?.hide();
      if (!readState().trayHintShown && tray) {
        tray.displayBalloon({
          iconType: 'info',
          title: 'La oficina sigue abierta',
          content: 'Tus agentes siguen trabajando. Abrila desde este ícono de la bandeja.',
        });
        writeState({ trayHintShown: true });
      }
    });
    win.on('closed', () => {
      win = null;
    });
    void win.loadURL(startingPage());
  };

  const quit = async () => {
    quitting = true;
    if (office?.child) await stopServer(office.child);
    app.quit();
  };

  const buildTray = () => {
    tray = new Tray(nativeImage.createFromPath(iconPath));
    tray.setToolTip('Oficina virtual');
    const items: Electron.MenuItemConstructorOptions[] = [
      { label: 'Abrir la oficina', click: show },
      ...(updatesEnabled()
        ? [{ label: 'Buscar actualizaciones', click: () => void checkForUpdates(log, true) }]
        : []),
      { type: 'separator' },
      { label: 'Apagar la oficina', click: () => void quit() },
    ];
    tray.setContextMenu(Menu.buildFromTemplate(items));
    tray.on('double-click', show);
    tray.on('click', show);
  };

  const open = async () => {
    try {
      office = await openOffice(appRoot, log);
      watchServer(office);
      await win?.loadURL(office.url);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`[app] ${message}`);
      await win?.loadURL(errorPage(message, logDir));
    }
  };

  // The page's goodbye after "Apagar la oficina" closes the app (it also asks
  // when the app only attached to an office it did not start).
  ipcMain.on('oficina:quit', () => void quit());
  // The folder picker, as the Explorer draws it (the server's fallback is the
  // old tree dialog).
  ipcMain.handle('oficina:pickFolder', async () => {
    const options: Electron.OpenDialogOptions = {
      title: 'Elegí la carpeta de tu proyecto',
      properties: ['openDirectory', 'createDirectory'],
    };
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? undefined : result.filePaths[0];
  });

  // Our server leaving on its own: "Apagar la oficina" from Ajustes (code 0)
  // quits the app once the page has shown its goodbye (or right away if the
  // page never asks); a crash restarts it a couple of times.
  const watchServer = (o: Office) => {
    o.child?.once('exit', (code) => {
      if (quitting) return;
      log(`[app] La oficina terminó (código ${String(code)})`);
      if (code === 0) {
        setTimeout(() => void quit(), GOODBYE_MS);
      } else if (restarts++ < 2) {
        void open();
      } else {
        void win?.loadURL(errorPage('La oficina se cerró varias veces seguidas.', logDir));
      }
    });
  };

  app.on('before-quit', (event) => {
    if (quitting || !office?.child || office.child.exitCode !== null) {
      quitting = true;
      return;
    }
    event.preventDefault();
    void quit();
  });
  // Every window closed (hidden, really): stay in the tray.
  app.on('window-all-closed', () => {});

  void app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    log(`[app] Oficina virtual ${app.getVersion()} (Electron ${process.versions.electron})`);
    buildTray();
    createWindow();
    void open();
    setUpUpdates(log);
  });
}
