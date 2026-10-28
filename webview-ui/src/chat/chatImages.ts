import type { ChatImageSaved } from '../../../core/src/messages.js';
import { transport } from '../transport/index.js';

/**
 * Images you send from a chat (pasted with Ctrl+V, dropped, or chosen): the
 * office saves each as a temporary file (server/src/chatImages.ts) and the
 * chat pastes its path, alone, into the agent's terminal — Claude Code
 * attaches it as an image. Previews stay in this page (object URLs).
 */

/** What Claude Code reads as an image. */
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
/** Per message: more is rarely what you meant. */
export const MAX_IMAGES = 6;
/** The office refuses more (server/src/chatImages.ts). */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const SAVE_WAIT_MS = 30_000;

export interface Attachment {
  key: string;
  file: File;
  /** An object URL for the preview; revoke it when it is dropped. */
  preview: string;
}

let nextKey = 0;

/** The images among what was pasted, dropped or chosen. */
export function imageFiles(files: Iterable<File> | ArrayLike<File>): File[] {
  return Array.from(files).filter((f) => (IMAGE_TYPES as readonly string[]).includes(f.type));
}

export function attach(file: File): Attachment {
  return { key: `img${++nextKey}`, file, preview: URL.createObjectURL(file) };
}

/**
 * The attachments plus the files just added: only images, none too big,
 * at most MAX_IMAGES. `refused` says why something was left out (castellano).
 */
export function addAttachments(
  current: readonly Attachment[],
  files: readonly File[],
): { next: Attachment[]; refused?: string } {
  const images = imageFiles(files);
  let refused =
    images.length < files.length
      ? 'Sólo se pueden mandar imágenes PNG, JPG, GIF o WebP.'
      : undefined;
  const fitting = images.filter((f) => f.size <= MAX_IMAGE_BYTES);
  if (fitting.length < images.length) refused = 'Esa imagen es muy grande (hasta 20 MB).';
  const room = Math.max(0, MAX_IMAGES - current.length);
  if (fitting.length > room) refused = `Hasta ${MAX_IMAGES} imágenes por mensaje.`;
  return { next: [...current, ...fitting.slice(0, room).map(attach)], refused };
}

function toBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      resolve(url.slice(url.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('No pude leer la imagen'));
    reader.readAsDataURL(file);
  });
}

const savedBy = new Map<number, (reply: ChatImageSaved) => void>();
let nextId = 0;

transport.onMessage((msg) => {
  if (msg.type === 'chatImageSaved') savedBy.get(msg.id as number)?.(msg as ChatImageSaved);
});

/** Saves one image in the office; resolves its path, or throws why not. */
export async function saveImage(file: Blob): Promise<string> {
  const data = await toBase64(file);
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      savedBy.delete(id);
      reject(new Error('La oficina no contestó: probá de nuevo'));
    }, SAVE_WAIT_MS);
    savedBy.set(id, (reply) => {
      clearTimeout(timer);
      savedBy.delete(id);
      if (reply.path) resolve(reply.path);
      else reject(new Error(reply.reason ?? 'No pude guardar la imagen'));
    });
    transport.send({ type: 'saveChatImage', id, data });
  });
}
