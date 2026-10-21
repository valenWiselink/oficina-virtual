/**
 * Which run of the server this is. Agent ids start over at 1 on every start
 * (agentStateStore), so an open page that reconnects to a new run would keep
 * acting on ids that now name other agents: the page gets this id first on
 * every connection (`serverHello`) and reloads when it changes, and the
 * terminal socket refuses a page that names another run (`?boot=`).
 */
export const SERVER_BOOT_ID = `${process.pid.toString(36)}-${Date.now().toString(36)}`;

/** The `?boot=` a terminal handshake carries, or null when it carries none
 *  (a page older than the boot check: let it through as before). */
export function bootOfRequest(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url, 'http://localhost').searchParams.get('boot');
  } catch {
    return null;
  }
}
