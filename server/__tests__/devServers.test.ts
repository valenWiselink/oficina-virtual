import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import {
  describeServer,
  DevServerWatch,
  findOrphanServers,
  mentions,
  parseSnapshot,
  type ProcRow,
  type Snapshot,
} from '../src/devServers.js';

/**
 * Dev servers left behind by an agent that is gone (27/11): the process
 * table below is the shape measured that day — `npx next dev` started from a
 * Claude Code Bash tool, whose claude.exe had died.
 */

const GB = 1024 ** 3;
const NEXT = (folder: string) =>
  `"C:\\Program Files\\nodejs\\node.exe" ${folder}\\node_modules\\next\\dist\\server\\lib\\start-server.js`;

/** bash < bash < npx < cmd < next < start-server, under `parent`. */
function chain(base: number, parent: number, folder: string, bytes: number): ProcRow[] {
  return [
    { pid: base, ppid: parent, name: 'bash.exe', cmd: 'bash', bytes: 0.01 * GB },
    { pid: base + 1, ppid: base, name: 'bash.exe', cmd: 'bash -c npx next dev', bytes: 0.01 * GB },
    {
      pid: base + 2,
      ppid: base + 1,
      name: 'node.exe',
      cmd: 'npx-cli.js next dev',
      bytes: 0.1 * GB,
    },
    { pid: base + 3, ppid: base + 2, name: 'cmd.exe', cmd: 'cmd /c next dev', bytes: 0 },
    {
      pid: base + 4,
      ppid: base + 3,
      name: 'node.exe',
      cmd: `${folder}\\node_modules\\.bin\\next dev`,
      bytes: 0.1 * GB,
    },
    {
      pid: base + 5,
      ppid: base + 4,
      name: 'node.exe',
      cmd: NEXT(folder),
      bytes,
      created: '2026-11-26T17:09:36',
    },
  ];
}

function snapshot(procs: ProcRow[], listen: Array<[number, number]> = []): Snapshot {
  const map = new Map<number, number[]>();
  for (const [pid, port] of listen) map.set(pid, [...(map.get(pid) ?? []), port]);
  return { procs, listen: map };
}

describe('dev servers left behind', () => {
  it('finds a next dev whose agent died, with its port, folder and memory', () => {
    const procs = chain(100, 99_999, 'F:\\wt\\dark-mode-desde-cero', 2.4 * GB);
    const [server, ...rest] = findOrphanServers(
      snapshot(procs, [
        [105, 63881],
        [105, 3210],
      ]),
    );
    expect(rest).toHaveLength(0);
    expect(server.root).toBe(100);
    expect(server.tree).toHaveLength(6);
    expect(server.folder).toBe('F:\\wt\\dark-mode-desde-cero');
    expect(server.ports).toEqual([3210, 63881]);
    expect(describeServer(server)).toBe('puerto 3210 en F:\\wt\\dark-mode-desde-cero, 2,6 GB');
  });

  it('leaves alone a server whose agent or terminal is alive', () => {
    const procs = [
      { pid: 1, ppid: 0, name: 'claude.exe', cmd: 'claude', bytes: 0 },
      ...chain(100, 1, 'F:\\wt\\noche', GB),
      { pid: 2, ppid: 0, name: 'WindowsTerminal.exe', cmd: 'wt', bytes: 0 },
      { pid: 3, ppid: 2, name: 'pwsh.exe', cmd: 'pwsh', bytes: 0 },
      ...chain(200, 3, 'F:\\wt\\a-mano', GB),
      // Git Bash's own window (mintty) is someone's terminal too.
      { pid: 4, ppid: 0, name: 'mintty.exe', cmd: 'mintty', bytes: 0 },
      ...chain(300, 4, 'F:\\wt\\git-bash', GB),
    ];
    expect(findOrphanServers(snapshot(procs))).toEqual([]);
  });

  it('lists the biggest first and each server once', () => {
    const procs = [
      ...chain(100, 99_998, 'F:\\wt\\chico', 0.5 * GB),
      ...chain(200, 99_999, 'F:\\wt\\grande', 9 * GB),
    ];
    expect(findOrphanServers(snapshot(procs)).map((s) => s.folder)).toEqual([
      'F:\\wt\\grande',
      'F:\\wt\\chico',
    ]);
  });

  it('reads what PowerShell prints', () => {
    const parsed = parseSnapshot(
      JSON.stringify({
        procs: [{ pid: 5, ppid: 4, name: 'node.exe', cmd: 'x', bytes: 10, created: null }],
        listen: [
          { port: 3200, pid: 5 },
          { port: 3200, pid: 5 },
        ],
      }),
    );
    expect(parsed?.procs[0]).toMatchObject({ pid: 5, ppid: 4, bytes: 10 });
    expect(parsed?.listen.get(5)).toEqual([3200]);
    expect(parseSnapshot('not json')).toBeUndefined();
    // A command line with a raw control character, as Windows PowerShell 5.1 prints it.
    const raw = `{"procs":[{"pid":7,"ppid":1,"name":"a.exe","cmd":"x${String.fromCharCode(1)}y${String.fromCharCode(9)}z","bytes":1}],"listen":[]}`;
    expect(parseSnapshot(raw)?.procs[0].pid).toBe(7);
  });

  it('knows a server an agent talks about, by port or by folder', () => {
    const [server] = findOrphanServers(
      snapshot(chain(100, 99_999, 'F:\\wt\\WISE-6652', GB), [[105, 3200]]),
    );
    expect(mentions('navigate to http://localhost:3200/es/home', server)).toBe(true);
    expect(mentions('npx next dev -p 3200', server)).toBe(true);
    expect(mentions('localhost:32001', server)).toBe(false);
    expect(mentions('{"cwd":"f:\\\\wt\\\\wise-6652"}', server)).toBe(true);
    expect(mentions('cd f:/wt/wise-6652', server)).toBe(true);
    expect(mentions('otra cosa en el 3210', server)).toBe(false);
  });

  it('leaves out a server an open agent talks about (27/11: «noche» starts them detached)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-dev-'));
    const noche = path.join(dir, 'noche.jsonl');
    fs.writeFileSync(noche, '{"message":"abro http://localhost:3220/es"}\n');
    const procs = [
      ...chain(100, 99_998, 'F:\\wt\\dark-mode-sobrio', GB),
      ...chain(200, 99_999, 'F:\\wt\\dark-mode-base', GB),
    ];
    const watch = new DevServerWatch();
    watch.start({
      tell: () => {},
      read: async () =>
        snapshot(procs, [
          [105, 3220],
          [205, 3211],
        ]),
      transcripts: () => [noche, path.join(dir, 'no-existe.jsonl')],
    });
    watch.stop();
    expect((await watch.list()).map((s) => s.ports[0])).toEqual([3211]);
    expect(await watch.close(3220)).toMatch(/No hay un servidor sin agente/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('tells Jarvis once per server, and closes only an orphan on that port', async () => {
    let procs = chain(100, 99_999, 'F:\\wt\\base', GB);
    const told: string[] = [];
    const killed: number[] = [];
    const watch = new DevServerWatch();
    watch.start({
      tell: (line) => told.push(line),
      read: async () => snapshot(procs, [[105, 3211]]),
      kill: async (pid) => {
        killed.push(pid);
        procs = [];
        return true;
      },
    });
    watch.stop();
    await watch.tick();
    await watch.tick();
    expect(told).toHaveLength(1);
    expect(told[0]).toContain('puerto 3211 en F:\\wt\\base');
    expect(told[0]).toContain('cerrar_servidor');

    expect(await watch.close(3200)).toMatch(/No hay un servidor sin agente en el puerto 3200/);
    expect(killed).toEqual([]);
    expect(await watch.close(3211)).toMatch(/^Cerré el servidor del puerto 3211/);
    expect(killed).toEqual([100]);
  });
});
