import type { CSSProperties } from 'react';

import { CLAWD_BODY_COLORS } from '../constants.js';
import { IntroClawd } from './IntroClawd.js';
import { type CueAt, useCues } from './useCues.js';

const TITLE = 'Tu oficina de agentes';
/** Delay before the first letter, and between letters. */
const LETTERS_FROM_MS = 900;
const LETTER_STEP_MS = 42;

const CUES: readonly CueAt[] = [
  [450, 'pop'],
  [LETTERS_FROM_MS, 'chime'],
];

/**
 * Scene 1: Clawd drops onto the paper with a squash and a stretch, the title
 * writes itself letter by letter and the subtitle settles under it.
 */
export function SceneLogo() {
  useCues(CUES);
  return (
    <div className="intro-scene flex flex-col items-center justify-center gap-18">
      <div className="intro-halo" aria-hidden="true" />
      <div className="intro-hop-in">
        <IntroClawd color={CLAWD_BODY_COLORS[0]} size={168} />
      </div>
      <h1 className="m-0 text-text text-center intro-title" aria-label={TITLE}>
        {[...TITLE].map((ch, i) => (
          <span
            key={i}
            className="intro-letter"
            style={{ animationDelay: `${LETTERS_FROM_MS + i * LETTER_STEP_MS}ms` } as CSSProperties}
          >
            {ch === ' ' ? ' ' : ch}
          </span>
        ))}
      </h1>
      <p
        className="m-0 text-lg text-text-muted intro-fade-up"
        style={{ animationDelay: `${LETTERS_FROM_MS + TITLE.length * LETTER_STEP_MS + 200}ms` }}
      >
        Todos tus Claude Code en un solo lugar
      </p>
    </div>
  );
}
