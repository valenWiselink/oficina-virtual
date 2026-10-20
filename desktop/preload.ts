/**
 * The little the office page may ask of the desktop app: closing it after
 * "Apagar la oficina" (components/ShutdownScreen.tsx; also when the app only
 * attached to an office it did not start), and Windows' own folder picker
 * (hooks/useFolderPicker.ts) instead of the server's older one.
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('oficinaDesktop', {
  quit: () => ipcRenderer.send('oficina:quit'),
  pickFolder: (): Promise<string | undefined> => ipcRenderer.invoke('oficina:pickFolder'),
});
