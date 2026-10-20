import { type ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';

/** The port the office uses unless OFICINA_PORT says otherwise (the same as
 *  the browser launcher, so both find each other). */
export const DEFAULT_PORT = 3100;
/** How many ports above the default to try when it is taken by something else. */
const PORT_TRIES = 20;
const HEALTH_TIMEOUT_MS = 1500;
const START_TIMEOUT_MS = 60_000;

export interface Office {
  /** The tokened URL the window opens. */
  url: string;
  port: number;
  /** The server this app started; null when it attached to a running one. */
  child: ChildProcess | null;
}

export type Log = (line: string) => void;

/** Never write the token to a log. */
export const redactToken = (text: string): string =>
  text.replace(/token=[A-Za-z0-9_-]+/g, 'token=<oculto>');

/** GET /api/health: is an Oficina answering on this port? */
export function isOffice(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(
      { host: '127.0.0.1', port, path: '/api/health', timeout: HEALTH_TIMEOUT_MS },
      (res) => {
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => {
          try {
            resolve((JSON.parse(body) as { status?: string }).status === 'ok');
          } catch {
            resolve(false);
          }
        });
      },
    );
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(false));
  });
}

/** Whether nothing listens on the port (we could bind it). */
export function isFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '127.0.0.1');
  });
}

/** The token a running office keeps for this user (~/.pixel-agents). */
function readToken(): string | null {
  try {
    const token = fs
      .readFileSync(path.join(os.homedir(), '.pixel-agents', 'standalone-token'), 'utf-8')
      .trim();
    return token || null;
  } catch {
    return null;
  }
}

/**
 * Find the office: attach to one already running on the port (the browser
 * launcher's, or this app's from before a restart — its agents keep going),
 * else start ours there, or on the next free port when something else holds it.
 */
export async function openOffice(appRoot: string, log: Log): Promise<Office> {
  const preferred = Number(process.env.OFICINA_PORT) || DEFAULT_PORT;
  for (let port = preferred; port < preferred + PORT_TRIES; port++) {
    if (await isOffice(port)) {
      const token = readToken();
      if (token) {
        log(`[app] Ya hay una oficina en el puerto ${port}: me conecto a esa`);
        return { url: `http://127.0.0.1:${port}/?token=${token}`, port, child: null };
      }
    }
    if (await isFree(port)) return startServer(appRoot, port, log);
    log(`[app] El puerto ${port} está ocupado por otro programa`);
  }
  throw new Error(`No hay un puerto libre entre ${preferred} y ${preferred + PORT_TRIES - 1}`);
}

/** Start dist/cli.js with this app's Node and wait for its tokened URL. */
function startServer(appRoot: string, port: number, log: Log): Promise<Office> {
  const cli = path.join(appRoot, 'dist', 'cli.js');
  log(`[app] Arranco la oficina en el puerto ${port}`);
  const child = spawn(process.execPath, [cli, '--port', String(port)], {
    cwd: os.homedir(),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      // Hooks run through this exe (no Node on the PC): claudeHookInstaller.
      OFICINA_HOOK_EXE: process.execPath,
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true,
  });
  return new Promise((resolve, reject) => {
    let found = false;
    const timer = setTimeout(() => {
      if (!found) reject(new Error('La oficina no arrancó a tiempo'));
    }, START_TIMEOUT_MS);
    const onLine = (chunk: Buffer, stream: string) => {
      const text = chunk.toString();
      for (const line of text.split(/\r?\n/))
        if (line.trim()) log(`[${stream}] ${redactToken(line)}`);
      const match = /(http:\/\/[^\s]+\?token=[A-Za-z0-9_-]+)/.exec(text);
      if (match && !found) {
        found = true;
        clearTimeout(timer);
        resolve({ url: match[1], port, child });
      }
    };
    child.stdout?.on('data', (c: Buffer) => onLine(c, 'oficina'));
    child.stderr?.on('data', (c: Buffer) => onLine(c, 'oficina!'));
    child.once('exit', (code) => {
      if (found) return;
      clearTimeout(timer);
      reject(new Error(`La oficina se cerró al arrancar (código ${String(code)})`));
    });
  });
}

/** Ask our server for its orderly shutdown (terminals stay resumable); kill
 *  it if it does not leave in time. */
export function stopServer(child: ChildProcess, waitMs = 8000): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    const timer = setTimeout(() => {
      child.kill();
      resolve();
    }, waitMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    try {
      child.send('oficina:shutdown');
    } catch {
      child.kill();
    }
  });
}
