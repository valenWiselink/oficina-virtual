/**
 * Development servers left behind by an agent that is gone (asked for
 * 2026-11-27): a `next dev` started from an agent's shell outlives its Claude
 * Code process. On 27/11 two of them held 22.6 and 9.5 GB, Windows ran out of
 * memory and Jarvis's own process died with it.
 *
 * The office finds them (Windows only): a Next.js dev server whose chain of
 * parents reaches a dead process without passing through a live Claude Code,
 * terminal or editor. It tells Jarvis once per server and closes one only
 * when Jarvis asks — another agent may still be using it (one opened that
 * port in Chrome the same morning), so it never closes them on its own.
 */

import { execFile } from 'child_process';
import * as fs from 'fs';

/** One row of the process table. */
export interface ProcRow {
  pid: number;
  ppid: number;
  name: string;
  cmd: string;
  /** Private bytes (commit): what counts toward running out of memory. */
  bytes: number;
  created?: string;
}

/** A dev server nobody owns any more. */
export interface OrphanServer {
  /** The topmost live process of its chain: closing it closes the server. */
  root: number;
  /** Every process that goes with it (root and descendants). */
  tree: number[];
  folder: string;
  ports: number[];
  bytes: number;
  created?: string;
}

export interface Snapshot {
  procs: ProcRow[];
  /** Listening TCP ports by owning process. */
  listen: Map<number, number[]>;
}

/** The process that serves a Next.js dev server (it holds the port). */
const NEXT_SERVER =
  /([A-Za-z]:[\\/][^"]*?)[\\/]node_modules[\\/]next[\\/]dist[\\/]server[\\/]lib[\\/]start-server\.js/i;

/** A live one of these up the chain: someone still owns the server. */
const OWNERS =
  /^(claude|code|cursor|windowsterminal|wt|explorer|pwsh|powershell|oficina virtual|electron|idea64|webstorm64)\.exe$/i;

/** Shells and runners an agent's command goes through on its way up. */
const SHELLS = /^(bash|sh|cmd|node|npm|npx|conhost)\.exe$/i;

function descendants(root: number, procs: ProcRow[]): number[] {
  const tree = [root];
  for (let i = 0; i < tree.length; i++) {
    for (const p of procs) if (p.ppid === tree[i] && !tree.includes(p.pid)) tree.push(p.pid);
  }
  return tree;
}

/** The orphaned dev servers in a snapshot, biggest first. */
export function findOrphanServers({ procs, listen }: Snapshot): OrphanServer[] {
  const byPid = new Map(procs.map((p) => [p.pid, p]));
  const found = new Map<number, OrphanServer>();
  for (const server of procs) {
    const folder = NEXT_SERVER.exec(server.cmd)?.[1];
    if (!folder) continue;
    let top = server;
    let owned = false;
    for (let hops = 0; hops < 32; hops++) {
      const parent = byPid.get(top.ppid);
      if (!parent) break; // a dead parent: the chain ends here
      if (OWNERS.test(parent.name)) {
        owned = true;
        break;
      }
      // Anything else alive (a service, a scheduler): not an agent's shell.
      if (!SHELLS.test(parent.name)) {
        owned = true;
        break;
      }
      top = parent;
    }
    if (owned || found.has(top.pid)) continue;
    const tree = descendants(top.pid, procs);
    found.set(top.pid, {
      root: top.pid,
      tree,
      folder,
      ports: [...(listen.get(server.pid) ?? [])].sort((a, b) => a - b),
      bytes: tree.reduce((sum, pid) => sum + (byPid.get(pid)?.bytes ?? 0), 0),
      created: server.created,
    });
  }
  return [...found.values()].sort((a, b) => b.bytes - a.bytes);
}

/** How much of the end of a transcript is searched for a server. */
const TRANSCRIPT_TAIL = 4 * 1024 * 1024;

function tailOf(file: string): string {
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const size = fs.fstatSync(fd).size;
      const length = Math.min(size, TRANSCRIPT_TAIL);
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, size - length);
      return buffer.toString('utf-8').toLowerCase();
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return '';
  }
}

/**
 * Whether a transcript talks about the server: its port (localhost:3200,
 * -p 3200, --port 3200) or its folder. An agent can start a server detached
 * from its own process (27/11: «noche» did, so its two servers had a dead
 * parent while it worked with them), so the process tree alone cannot tell.
 */
export function mentions(text: string, server: OrphanServer): boolean {
  for (const port of server.ports) {
    if (new RegExp(`(:|-p |--port[ =])${port}(?!\\d)`).test(text)) return true;
  }
  // As typed, as JSON writes it (doubled backslashes) and with slashes.
  const folder = server.folder.toLowerCase();
  const variants = [folder, folder.replaceAll('\\', '\\\\'), folder.replaceAll('\\', '/')];
  return variants.some((v) => text.includes(v));
}

const gb = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1).replace('.', ',')} GB`;

/** «puerto 3210 en F:\…\dark-mode, 2,5 GB». */
export function describeServer(s: OrphanServer): string {
  const port = s.ports[0] ? `puerto ${s.ports[0]}` : 'sin puerto';
  return `${port} en ${s.folder}, ${gb(s.bytes)}`;
}

const SNAPSHOT_SCRIPT = [
  "$ErrorActionPreference='SilentlyContinue'",
  "$p = Get-CimInstance Win32_Process | ForEach-Object { [pscustomobject]@{ pid=[int]$_.ProcessId; ppid=[int]$_.ParentProcessId; name=[string]$_.Name; cmd=[string]$_.CommandLine; bytes=[double]$_.PrivatePageCount; created=$(if ($_.CreationDate) { $_.CreationDate.ToString('o') } else { $null }) } }",
  '$l = Get-NetTCPConnection -State Listen | ForEach-Object { [pscustomobject]@{ port=[int]$_.LocalPort; pid=[int]$_.OwningProcess } }',
  '[pscustomobject]@{ procs=@($p); listen=@($l) } | ConvertTo-Json -Depth 3 -Compress',
].join('; ');

export type SnapshotReader = () => Promise<Snapshot | undefined>;

export function parseSnapshot(out: string): Snapshot | undefined {
  try {
    // Windows PowerShell 5.1 leaves control characters of a command line
    // unescaped (27/11: the whole listing failed to parse); outside strings
    // they are only whitespace, so a space is safe everywhere.

    const raw = JSON.parse(out.replace(/[\u0000-\u001f]/g, ' ')) as {
      procs?: Array<Partial<ProcRow>>;
      listen?: Array<{ port?: number; pid?: number }>;
    };
    const procs = (raw.procs ?? [])
      .filter((p) => typeof p.pid === 'number')
      .map((p) => ({
        pid: p.pid!,
        ppid: p.ppid ?? 0,
        name: p.name ?? '',
        cmd: p.cmd ?? '',
        bytes: p.bytes ?? 0,
        created: p.created ?? undefined,
      }));
    const listen = new Map<number, number[]>();
    for (const l of raw.listen ?? []) {
      if (typeof l.pid !== 'number' || typeof l.port !== 'number') continue;
      const ports = listen.get(l.pid) ?? [];
      if (!ports.includes(l.port)) ports.push(l.port);
      listen.set(l.pid, ports);
    }
    return { procs, listen };
  } catch {
    return undefined;
  }
}

const readWindowsSnapshot: SnapshotReader = () =>
  new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(undefined);
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', SNAPSHOT_SCRIPT],
      { encoding: 'utf-8', timeout: 60_000, windowsHide: true, maxBuffer: 64 * 1024 * 1024 },
      (err, out) => resolve(err ? undefined : parseSnapshot(out)),
    );
  });

const killTree = (pid: number): Promise<boolean> =>
  new Promise((resolve) => {
    execFile('taskkill', ['/T', '/F', '/PID', String(pid)], { windowsHide: true }, (err) =>
      resolve(!err),
    );
  });

const TICK_MS = 10 * 60_000;
const FIRST_LOOK_MS = 2 * 60_000;

export interface DevServerWatchDeps {
  /** Tell Jarvis (nothing when it is not in the office). */
  tell: (line: string) => void;
  /** The transcripts of the agents open in the office: a server one of them
   *  talks about is theirs, whatever its process tree says. */
  transcripts?: () => string[];
  read?: SnapshotReader;
  kill?: (pid: number) => Promise<boolean>;
}

export class DevServerWatch {
  private timer: ReturnType<typeof setInterval> | undefined;
  private first: ReturnType<typeof setTimeout> | undefined;
  /** Roots already told about (each server is news once). */
  private readonly told = new Set<number>();
  private deps: DevServerWatchDeps | undefined;

  start(deps: DevServerWatchDeps): void {
    this.deps = deps;
    this.first ??= setTimeout(() => void this.tick(), FIRST_LOOK_MS);
    this.first.unref?.();
    this.timer ??= setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.first) clearTimeout(this.first);
    if (this.timer) clearInterval(this.timer);
    this.first = undefined;
    this.timer = undefined;
  }

  async list(): Promise<OrphanServer[]> {
    const snapshot = await (this.deps?.read ?? readWindowsSnapshot)();
    if (!snapshot) return [];
    const orphans = findOrphanServers(snapshot);
    if (orphans.length === 0) return [];
    const texts = (this.deps?.transcripts?.() ?? []).map(tailOf).filter(Boolean);
    return orphans.filter((server) => !texts.some((text) => mentions(text, server)));
  }

  /** Look once and tell Jarvis about the servers it has not heard of. */
  async tick(): Promise<void> {
    const deps = this.deps;
    if (!deps) return;
    const orphans = await this.list();
    const live = new Set(orphans.map((s) => s.root));
    for (const root of this.told) if (!live.has(root)) this.told.delete(root);
    const fresh = orphans.filter((s) => !this.told.has(s.root));
    if (fresh.length === 0) return;
    for (const s of fresh) this.told.add(s.root);
    const lines = fresh.map((s) => describeServer(s)).join('; ');
    deps.tell(
      `Quedaron servidores de desarrollo sin el agente que los levantó (su sesión se cerró o se cayó): ${lines}. ` +
        'Ocupan memoria: el 27/11 dos así dejaron a Windows sin memoria. Si ningún agente los usa (mirá en equipo quién trabaja en esa carpeta o abrió ese puerto), cerralos con cerrar_servidor. La oficina no los cierra sola.',
    );
  }

  /** Close the orphaned server on a port: only one the office found. */
  async close(port: number): Promise<string> {
    const server = (await this.list()).find((s) => s.ports.includes(port));
    if (!server) {
      return `No hay un servidor sin agente en el puerto ${port} (o ya se cerró). Sólo cierro los que la oficina encontró huérfanos; mirá servidores_sin_agente.`;
    }
    const ok = await (this.deps?.kill ?? killTree)(server.root);
    if (!ok) return `No pude cerrar el servidor del ${describeServer(server)}.`;
    this.told.delete(server.root);
    console.log(`[Pixel Agents] Dev server closed for Jarvis: ${describeServer(server)}`);
    return `Cerré el servidor del ${describeServer(server)} (${server.tree.length} procesos).`;
  }
}

/** The office's one watch (cli.ts starts it; Jarvis's tools use it). */
export const devServerWatch = new DevServerWatch();
