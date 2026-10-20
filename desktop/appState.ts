import { app, type BrowserWindow, type Rectangle, screen } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

/** Small things the app remembers between runs (%APPDATA%\Oficina virtual). */
interface AppState {
  bounds?: Rectangle;
  maximized?: boolean;
  /** The "it keeps running in the tray" balloon was shown once. */
  trayHintShown?: boolean;
}

const file = () => path.join(app.getPath('userData'), 'estado.json');

export function readState(): AppState {
  try {
    return JSON.parse(fs.readFileSync(file(), 'utf-8')) as AppState;
  } catch {
    return {};
  }
}

export function writeState(patch: Partial<AppState>): void {
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify({ ...readState(), ...patch }));
  } catch {
    /* not worth failing the app over */
  }
}

/** Saved bounds, only if they still land on a connected screen. */
export function savedBounds(): Rectangle | undefined {
  const b = readState().bounds;
  if (!b) return undefined;
  const onScreen = screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return (
      b.x < a.x + a.width && b.x + b.width > a.x && b.y < a.y + a.height && b.y + b.height > a.y
    );
  });
  return onScreen ? b : undefined;
}

/** Remember size and place whenever they settle. */
export function trackBounds(win: BrowserWindow): void {
  const save = () => {
    if (win.isDestroyed() || win.isMinimized()) return;
    writeState({
      maximized: win.isMaximized(),
      ...(win.isMaximized() ? {} : { bounds: win.getBounds() }),
    });
  };
  win.on('resized', save);
  win.on('moved', save);
  win.on('maximize', save);
  win.on('unmaximize', save);
}
