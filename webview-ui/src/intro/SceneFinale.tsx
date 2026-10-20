import type { CSSProperties } from 'react';

import { CLAWD_BODY_COLORS } from '../constants.js';
import { IntroClawd } from './IntroClawd.js';
import { type CueAt, useCues } from './useCues.js';

const CONFETTI = 54;

const CUES: readonly CueAt[] = [
  ...[0, 1, 2, 3, 4, 5].map((i) => [i * 90, 'pop', i] as const),
  [420, 'cheer'],
  [900, 'chime'],
];

/**
 * Scene 6: every Clawd waves, confetti rains in their colours, and the big
 * "Empezar" button hands over to the setup.
 */
export function SceneFinale({ onStart }: { onStart: () => void }) {
  useCues(CUES);
  return (
    <div className="intro-scene flex flex-col items-center justify-center gap-24">
      <Confetti />
      <div className="flex items-end gap-[min(2.4vw,22px)]">
        {CLAWD_BODY_COLORS.map((color, i) => (
          <div key={color} className="intro-pop" style={{ animationDelay: `${i * 90}ms` }}>
            <IntroClawd
              color={color}
              size={70}
              pose="wave"
              style={{ '--wave-delay': `${i * 140}ms` } as CSSProperties}
            />
          </div>
        ))}
      </div>
      <div className="flex flex-col items-center gap-8 text-center">
        <h2 className="m-0 text-text intro-title intro-fade-up" style={{ animationDelay: '500ms' }}>
          ¡Listo! Armemos tu oficina
        </h2>
        <p
          className="m-0 text-base text-text-muted intro-fade-up"
          style={{ animationDelay: '750ms' }}
        >
          Elegís una carpeta, creás tu primer agente y arrancás.
        </p>
      </div>
      <button
        type="button"
        autoFocus
        onClick={onStart}
        className="intro-start intro-fade-up border-0 rounded-xl px-28 py-12 text-lg font-semibold cursor-pointer outline-none focus-visible:ring-4 focus-visible:ring-accent/30"
        style={{ animationDelay: '1000ms' }}
      >
        Empezar
      </button>
    </div>
  );
}

/** Pieces falling from the top, spread and timed by their index (no randomness). */
function Confetti() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {Array.from({ length: CONFETTI }, (_, i) => {
        const style = {
          left: `${(i * 37) % 100}%`,
          background: CLAWD_BODY_COLORS[i % CLAWD_BODY_COLORS.length],
          animationDelay: `${(i * 97) % 1600}ms`,
          animationDuration: `${2600 + ((i * 53) % 1600)}ms`,
          '--sway': `${((i * 29) % 60) - 30}px`,
          '--spin': `${360 + ((i * 71) % 540)}deg`,
        } as CSSProperties;
        return (
          <span
            key={i}
            className={`intro-confetti ${i % 3 === 0 ? 'intro-confetti-round' : ''}`}
            style={style}
          />
        );
      })}
    </div>
  );
}
