/**
 * The little the office page may ask of the desktop app: closing it after
 * "Apagar la oficina" (components/ShutdownScreen.tsx; also when the app only
 * attached to an office it did not start), Windows' own folder picker
 * (hooks/useFolderPicker.ts) instead of the server's older one, and the
 * updater (webview-ui src/updates/: the notice, "Buscar actualizaciones").
 */
import { contextBridge, ipcRenderer } from 'electron';

import type { UpdateState } from './updates.js';

type UpdateListener = (state: UpdateState) => void;
const updateListeners = new Set<UpdateListener>();
ipcRenderer.on('oficina:update-changed', (_event, state: UpdateState) => {
  for (const listener of updateListeners) listener(state);
});

contextBridge.exposeInMainWorld('oficinaDesktop', {
  quit: () => ipcRenderer.send('oficina:quit'),
  pickFolder: (): Promise<string | undefined> => ipcRenderer.invoke('oficina:pickFolder'),
  updates: {
    state: (): Promise<UpdateState> => ipcRenderer.invoke('oficina:update-state'),
    /** Returns the unsubscribe (functions cross the bridge as proxies, so
     *  the page cannot hand the same listener back to remove it). */
    onChange: (listener: UpdateListener): (() => void) => {
      updateListeners.add(listener);
      return () => updateListeners.delete(listener);
    },
    check: (): Promise<UpdateState> => ipcRenderer.invoke('oficina:update-check'),
    install: () => ipcRenderer.send('oficina:update-install'),
    setWhenIdle: (on: boolean) => ipcRenderer.send('oficina:update-when-idle', on),
    whatsNewSeen: () => ipcRenderer.send('oficina:update-whats-new-seen'),
  },
});
