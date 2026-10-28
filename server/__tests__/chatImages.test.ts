import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { imageExtension, saveChatImage } from '../src/chatImages.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
const GIF = Buffer.from('GIF89a', 'ascii');
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([1, 2, 3, 4]),
  Buffer.from('WEBPVP8 '),
]);

describe('imageExtension', () => {
  it('knows a PNG, JPEG, GIF and WebP by their first bytes', () => {
    expect(imageExtension(PNG)).toBe('png');
    expect(imageExtension(JPG)).toBe('jpg');
    expect(imageExtension(GIF)).toBe('gif');
    expect(imageExtension(WEBP)).toBe('webp');
  });

  it('refuses anything else, whatever it says it is', () => {
    expect(
      imageExtension(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
    ).toBeUndefined();
    expect(imageExtension(Buffer.from('MZ\x90\x00'))).toBeUndefined();
    expect(imageExtension(Buffer.alloc(0))).toBeUndefined();
  });
});

describe('saveChatImage', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-images-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('saves the image with its own extension and gives back where', () => {
    const saved = saveChatImage(PNG.toString('base64'), dir, Date.parse('2026-10-28T13:05:09Z'));
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(path.dirname(saved.path)).toBe(dir);
    expect(path.basename(saved.path)).toMatch(/^imagen-20261028-130509-[0-9a-f]{6}\.png$/);
    expect(fs.readFileSync(saved.path)).toEqual(PNG);
  });

  it('refuses what is not an image, saving nothing', () => {
    const saved = saveChatImage(Buffer.from('hola').toString('base64'), dir);
    expect(saved).toEqual({ ok: false, reason: expect.stringContaining('PNG, JPG') });
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('refuses one too big before decoding it', () => {
    const saved = saveChatImage('A'.repeat(28 * 1024 * 1024), dir);
    expect(saved).toEqual({ ok: false, reason: expect.stringContaining('muy grande') });
  });

  it('sweeps its own old images, never other files', () => {
    const now = Date.parse('2026-10-28T12:00:00Z');
    const old = path.join(dir, 'imagen-viejo.png');
    const other = path.join(dir, 'otra-cosa.txt');
    fs.writeFileSync(old, PNG);
    fs.writeFileSync(other, 'x');
    const longAgo = new Date(now - 4 * 24 * 60 * 60 * 1000);
    fs.utimesSync(old, longAgo, longAgo);
    fs.utimesSync(other, longAgo, longAgo);
    saveChatImage(PNG.toString('base64'), dir, now);
    expect(fs.existsSync(old)).toBe(false);
    expect(fs.existsSync(other)).toBe(true);
  });
});
