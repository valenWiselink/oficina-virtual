import type { CSSProperties } from 'react';

import { CLAWD_BODY_COLORS } from '../constants.js';
import { Caption } from './Caption.js';
import { IntroClawd } from './IntroClawd.js';
import { type CueAt, cueRun, useCues } from './useCues.js';

/** Between one Clawd and the next walking in. */
const STAGGER_MS = 260;

const CUES: readonly CueAt[] = [
  ...cueRun('step', 0, 140, 16),
  ...[0, 1, 2].map((i) => [300 + i * STAGGER_MS, 'pop', i] as const),
  ...cueRun('tap', 2000, 95, 22),
];

/**
 * Scene 2: the six Clawds walk in from both sides, legs stepping, each to its
 * desk; once seated they type away on their laptops.
 */
export function SceneTeam() {
  useCues(CUES);
  return (
    <div className="intro-scene flex flex-col items-center justify-center gap-28">
      <div className="flex items-end gap-[min(3vw,28px)]">
        {CLAWD_BODY_COLORS.map((color, i) => {
          const fromLeft = i < CLAWD_BODY_COLORS.length / 2;
          const order = fromLeft ? 2 - i : i - 3;
          const style = { '--d': `${order * STAGGER_MS}ms` } as CSSProperties;
          return (
            <div key={color} className="flex flex-col items-center" style={style}>
              <div className={fromLeft ? 'intro-walk-in-left' : 'intro-walk-in-right'}>
                <IntroClawd color={color} size={72} pose="walk" className="intro-arrives-typing" />
              </div>
              <Desk />
            </div>
          );
        })}
      </div>
      <Caption
        title="Varios agentes trabajando a la vez"
        sub="Cada uno en su tarea, todos a la vista"
      />
    </div>
  );
}

/** A little desk with a laptop whose screen flickers while they type. */
function Desk() {
  return (
    <div className="intro-desk relative -mt-10 w-[96px] h-[30px] rounded-lg">
      <div className="intro-laptop absolute left-1/2 -translate-x-1/2 -top-[9px] w-[30px] h-[12px] rounded-t-sm">
        <div className="intro-laptop-screen absolute inset-x-[3px] top-[2px] bottom-[2px] rounded-[1px]" />
      </div>
    </div>
  );
}
