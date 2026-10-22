import type { JarvisHeard } from '../../../core/src/messages.js';
import { transport } from '../transport/index.js';
import { type OfficeEars, pcm16Base64 } from './jarvisEars.js';

/**
 * The office writes down what you said (whisper.cpp on the graphics card,
 * server/src/voice/gpuEars.ts): the text, '' when it heard no voice, or
 * undefined when it cannot (no NVIDIA card, still installing, it failed) and
 * this page's Whisper has to.
 */

const OFFICE_WAIT_MS = 25_000;
const heardBy = new Map<number, (reply: JarvisHeard | undefined) => void>();
let nextId = 0;

transport.onMessage((msg) => {
  if (msg.type === 'jarvisHeard') heardBy.get(msg.id)?.(msg);
});

export const officeEars: OfficeEars = (audio) => {
  const id = ++nextId;
  return new Promise((resolve) => {
    const timer = setTimeout(() => done(undefined), OFFICE_WAIT_MS);
    const done = (reply: JarvisHeard | undefined) => {
      clearTimeout(timer);
      heardBy.delete(id);
      resolve(reply?.local ? undefined : reply?.text);
    };
    heardBy.set(id, done);
    transport.send({ type: 'jarvisHear', id, audio: pcm16Base64(audio) });
  });
};
