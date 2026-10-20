/**
 * The little the office page may ask of the desktop app: closing it after
 * "Apagar la oficina" (components/ShutdownScreen.tsx). Also true when the app
 * attached to an office it did not start, which then has nothing left to show.
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('oficinaDesktop', {
  quit: () => ipcRenderer.send('oficina:quit'),
});
