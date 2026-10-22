/**
 * Jarvis's ears on the graphics card: whisper.cpp with large-v3-turbo (8-bit,
 * the same text as the full model and over twice as fast on a GTX 1660 Ti),
 * Spanish, an initial prompt with «Jarvis» and the agents' nicknames, and
 * voice detection (Silero) so silence is never written down.
 * Installed by itself the first time you dictate: whisper.cpp's CUDA build
 * and the model (~1.5 GB) go to the roomiest drive that is not the system's
 * (OFICINA_OIDO_DIR moves it). It runs as a whisper-server on 127.0.0.1.
 * Without Windows, an NVIDIA card or the download, it is unavailable and the
 * page writes with its own Whisper, as before.
 */

import { type ChildProcess, execFile, spawn } from 'child_process';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import type { ReadableStream as WebReadableStream } from 'stream/web';

const RELEASE = 'b5454';
const BIN_URL = `https://github.com/ggml-org/whisper.cpp/releases/download/${RELEASE}/whisper-bin-win-cuda-12.4.0-x64.zip`;
const MODEL_FILE = 'ggml-large-v3-turbo-q8_0.bin';
const MODEL_URL = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODEL_FILE}`;
const MODEL_BYTES = 874_188_075;
/** Silero voice detection: only the stretches with a voice reach Whisper, so
 *  silence and room noise cannot turn into «sí, sí, sí…». */
const VAD_FILE = 'ggml-silero-v6.2.0.bin';
const VAD_URL = `https://huggingface.co/ggml-org/whisper-vad/resolve/main/${VAD_FILE}`;
const VAD_BYTES = 885_098;
/** What the install needs free, with room to spare (zip + extracted + model). */
const MIN_FREE_BYTES = 4 * 1024 ** 3;
/** Up to this long, the encoder looks at 15 s instead of 30: half the time,
 *  same text. Shorter windows make large-v3-turbo babble; longer audio needs
 *  the whole window. */
const SHORT_SECONDS = 13;
const SHORT_AUDIO_CTX = 768;
const SAMPLE_RATE = 16_000;
/** Tries (install + start) before giving up until the office restarts. */
const TRIES_MAX = 3;

export type GpuEarsStatus = 'off' | 'installing' | 'starting' | 'ready' | 'unavailable';

const log = (line: string) => console.log(`[Pixel Agents] Oído (whisper.cpp): ${line}`);

/** The non-system drive with the most room, if any has enough. */
function roomiestDrive(): string | undefined {
  const system = (process.env.SystemDrive ?? 'C:').toUpperCase();
  let best: string | undefined;
  let bestFree = MIN_FREE_BYTES;
  for (const letter of 'DEFGHIJKLMNOPQRSTUVWXYZ') {
    if (`${letter}:` === system) continue;
    try {
      const s = fs.statfsSync(`${letter}:\\`);
      const free = s.bavail * s.bsize;
      if (free > bestFree) [best, bestFree] = [`${letter}:\\`, free];
    } catch {
      // No such drive, or no disc in it.
    }
  }
  return best;
}

/** Where whisper.cpp and its model live (resolved on use). */
export function hearingDir(): string {
  if (process.env.OFICINA_OIDO_DIR) return process.env.OFICINA_OIDO_DIR;
  const drive = roomiestDrive();
  return drive
    ? path.join(drive, 'OficinaVirtual', 'oido')
    : path.join(os.homedir(), '.pixel-agents', 'oido');
}

/** What whisper.cpp is told it will hear: names it must spell right. */
export function hearingPrompt(names: Iterable<string | undefined>): string {
  const clean = new Set<string>();
  for (const n of names) {
    const name = n
      ?.replace(/[^\p{L}\p{N} '-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (name && name.length <= 40 && clean.size < 30) clean.add(name);
  }
  return ['Jarvis', ...clean].join(', ') + '. Listo, dale, ya probé, ya está.';
}

/** 16-bit 16 kHz mono PCM wrapped as a WAV file. */
export function wav(pcm: Buffer): Buffer {
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + pcm.length, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(SAMPLE_RATE, 24);
  head.writeUInt32LE(SAMPLE_RATE * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([head, pcm]);
}

/** The encoder window for `pcm`: 15 s for short phrases, the whole one else. */
export function audioCtx(pcm: Buffer): number {
  return pcm.length / (SAMPLE_RATE * 2) <= SHORT_SECONDS ? SHORT_AUDIO_CTX : 0;
}

function run(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) =>
    execFile(file, args, { windowsHide: true, timeout: 120_000 }, (err, stdout) =>
      err ? reject(err) : resolve(stdout),
    ),
  );
}

async function hasNvidia(): Promise<boolean> {
  try {
    return /GPU \d/.test(await run('nvidia-smi', ['-L']));
  } catch {
    return false;
  }
}

async function download(url: string, dest: string, bytes?: number): Promise<void> {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`${url} respondió ${res.status}`);
  const part = `${dest}.part`;
  await pipeline(
    Readable.fromWeb(res.body as unknown as WebReadableStream),
    fs.createWriteStream(part),
  );
  const size = fs.statSync(part).size;
  if (bytes !== undefined && size !== bytes) throw new Error(`${url}: bajó ${size} de ${bytes}`);
  fs.renameSync(part, dest);
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

export class GpuEars {
  status: GpuEarsStatus = process.platform === 'win32' ? 'off' : 'unavailable';
  private child: ChildProcess | undefined;
  private port = 0;
  private tries = 0;
  private preparing: Promise<void> | undefined;

  private paths() {
    const dir = hearingDir();
    const bin = path.join(dir, 'bin', 'Release');
    return {
      dir,
      bin,
      exe: path.join(bin, 'whisper-server.exe'),
      model: path.join(dir, MODEL_FILE),
      vad: path.join(dir, VAD_FILE),
      done: path.join(dir, 'listo.json'),
      pid: path.join(dir, 'whisper-server.pid'),
    };
  }

  installed(): boolean {
    const p = this.paths();
    try {
      const done = JSON.parse(fs.readFileSync(p.done, 'utf-8')) as { release?: string };
      return done.release === RELEASE && [p.exe, p.model, p.vad].every((f) => fs.existsSync(f));
    } catch {
      return false;
    }
  }

  /** Get it ready (install the first time); safe to call often. */
  prepare(install = true): Promise<void> {
    if (this.status === 'ready' || this.status === 'unavailable') return Promise.resolve();
    if (!install && !this.installed()) return Promise.resolve();
    this.preparing ??= this.bringUp().finally(() => (this.preparing = undefined));
    return this.preparing;
  }

  private async bringUp(): Promise<void> {
    this.tries++;
    try {
      if (!(await hasNvidia())) {
        log('no hay placa NVIDIA: sigue el oído de la página');
        this.status = 'unavailable';
        return;
      }
      if (!this.installed()) await this.install();
      await this.start();
    } catch (err) {
      log(`no pude prepararlo: ${err instanceof Error ? err.message : String(err)}`);
      this.stop();
      this.status = this.tries >= TRIES_MAX ? 'unavailable' : 'off';
    }
  }

  private async install(): Promise<void> {
    this.status = 'installing';
    const p = this.paths();
    fs.mkdirSync(p.dir, { recursive: true });
    log(`instalando en ${p.dir}`);
    const zip = path.join(p.dir, `whisper-${RELEASE}.zip`);
    if (!fs.existsSync(p.exe)) {
      await download(BIN_URL, zip);
      fs.mkdirSync(path.join(p.dir, 'bin'), { recursive: true });
      // Windows's own tar reads zip files.
      const tar = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
      await run(tar, [
        '-xf',
        zip,
        '-C',
        path.join(p.dir, 'bin'),
        'Release/whisper-server.exe',
        'Release/*.dll',
      ]);
      fs.rmSync(zip, { force: true });
    }
    if (!fs.existsSync(p.model)) await download(MODEL_URL, p.model, MODEL_BYTES);
    if (!fs.existsSync(p.vad)) await download(VAD_URL, p.vad, VAD_BYTES);
    fs.writeFileSync(p.done, JSON.stringify({ release: RELEASE, model: MODEL_FILE }));
    log('instalado');
  }

  /** A whisper-server left by an office that died without stopping it (and
   *  only that: the pid could belong to something else by now). */
  private async killLeftover(pidFile: string): Promise<void> {
    try {
      const pid = Number(fs.readFileSync(pidFile, 'utf-8'));
      if (!(pid > 0)) return;
      const task = await run('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH']);
      if (/whisper-server\.exe/i.test(task)) process.kill(pid);
    } catch {
      // None, or already gone.
    }
  }

  private async start(): Promise<void> {
    this.status = 'starting';
    const p = this.paths();
    await this.killLeftover(p.pid);
    this.port = await freePort();
    const threads = String(Math.min(4, os.cpus().length));
    // Greedy, one candidate: beams cost time on a card without tensor cores
    // and gave the same text.
    const args = ['-m', p.model, '-l', 'es', '--host', '127.0.0.1', '--port', String(this.port)];
    args.push('-t', threads, '-nt', '-bs', '1', '-bo', '1', '--vad', '-vm', p.vad);
    const child = spawn(p.exe, args, {
      cwd: p.bin,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child = child;
    if (child.pid) fs.writeFileSync(p.pid, String(child.pid));
    let said = '';
    const listen = (chunk: Buffer) => (said = (said + chunk.toString()).slice(-8000));
    child.stdout?.on('data', listen);
    child.stderr?.on('data', listen);
    child.once('exit', (code) => {
      if (this.child !== child) return;
      this.child = undefined;
      log(`whisper-server terminó (${code})`);
      if (this.status === 'ready' || this.status === 'starting') this.status = 'off';
    });
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      if (!this.child) throw new Error(`no arrancó: ${said.slice(-300)}`);
      if (/no GPU found/.test(said)) throw new Error('whisper.cpp no ve la placa');
      try {
        await fetch(`http://127.0.0.1:${this.port}/`, { signal: AbortSignal.timeout(1000) });
        this.status = 'ready';
        log(`listo en la placa (puerto ${this.port})`);
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    throw new Error('no respondió en 60 s');
  }

  /** What you said, or undefined when it could not (the page does it then). */
  async hear(pcm: Buffer, prompt: string): Promise<string | undefined> {
    if (this.status !== 'ready') {
      void this.prepare();
      return undefined;
    }
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(wav(pcm))], { type: 'audio/wav' }), 'voz.wav');
    form.append('prompt', prompt);
    form.append('language', 'es');
    form.append('temperature', '0');
    form.append('audio_ctx', String(audioCtx(pcm)));
    form.append('response_format', 'json');
    try {
      const res = await fetch(`http://127.0.0.1:${this.port}/inference`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`respondió ${res.status}`);
      const body = (await res.json()) as { text?: unknown };
      return typeof body.text === 'string' ? body.text.trim() : '';
    } catch (err) {
      log(`no pudo escribir: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    }
  }

  stop(): void {
    const child = this.child;
    this.child = undefined;
    child?.kill();
    try {
      fs.rmSync(this.paths().pid, { force: true });
    } catch {
      // Nothing to clean.
    }
    if (this.status === 'ready' || this.status === 'starting') this.status = 'off';
  }
}

/** The office's one pair of ears. */
export const gpuEars = new GpuEars();
