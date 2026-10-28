/**
 * Images sent from a chat (pasted, dropped or chosen in the office): saved as
 * temporary files whose path the page pastes into the agent's terminal —
 * Claude Code attaches an image whose path is pasted on its own (measured
 * 2026-10-28: with text around it, it only reads the file with Read). The
 * kind comes from the file's first bytes, never from what the page says.
 * Files older than KEEP_MS are swept on every save.
 */

import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** Bigger than any screenshot; Claude Code shrinks what it sends. */
export const CHAT_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
/** Long enough for the agent to look at it again later in the day. */
const KEEP_MS = 3 * 24 * 60 * 60 * 1000;

export function chatImagesDir(): string {
  return path.join(os.tmpdir(), 'oficina-imagenes');
}

/** The extension of a PNG, JPEG, GIF or WebP, by its first bytes. */
export function imageExtension(bytes: Buffer): string | undefined {
  const starts = (sig: number[], at = 0) => sig.every((b, i) => bytes[at + i] === b);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (starts([0xff, 0xd8, 0xff])) return 'jpg';
  if (starts([0x47, 0x49, 0x46, 0x38])) return 'gif';
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return 'webp';
  return undefined;
}

export type SavedImage = { ok: true; path: string } | { ok: false; reason: string };

/** Saves a base64 image; the reason is for the chat (castellano). */
export function saveChatImage(base64: string, dir = chatImagesDir(), now = Date.now()): SavedImage {
  // base64 is 4/3 of the bytes: refuse before decoding a huge string.
  if (base64.length > Math.ceil((CHAT_IMAGE_MAX_BYTES * 4) / 3) + 4) {
    return { ok: false, reason: 'La imagen es muy grande (hasta 20 MB)' };
  }
  const bytes = Buffer.from(base64, 'base64');
  const ext = imageExtension(bytes);
  if (!ext) return { ok: false, reason: 'Sólo se pueden mandar imágenes PNG, JPG, GIF o WebP' };
  try {
    fs.mkdirSync(dir, { recursive: true });
    sweep(dir, now);
    const stamp = new Date(now).toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    const file = path.join(dir, `imagen-${stamp}-${randomBytes(3).toString('hex')}.${ext}`);
    fs.writeFileSync(file, bytes);
    return { ok: true, path: file };
  } catch (err) {
    return { ok: false, reason: `No pude guardar la imagen: ${(err as Error).message}` };
  }
}

function sweep(dir: string, now: number): void {
  for (const name of fs.readdirSync(dir)) {
    if (!name.startsWith('imagen-')) continue;
    const file = path.join(dir, name);
    try {
      if (now - fs.statSync(file).mtimeMs > KEEP_MS) fs.unlinkSync(file);
    } catch {
      // Gone already, or in use: the next save tries again.
    }
  }
}
