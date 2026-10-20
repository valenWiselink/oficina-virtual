import type { CSSProperties } from 'react';

import { Sparks } from '../components/Sparks.js';
import { CLAWD_BODY_COLORS } from '../constants.js';
import { Caption } from './Caption.js';
import { IntroClawd } from './IntroClawd.js';
import {
  beatAt,
  BOARD_BEATS,
  type BoardCardId,
  boardLayout,
  type BoardSlot,
} from './introTimeline.js';
import { type CueAt, useCues } from './useCues.js';
import { useSceneClock } from './useSceneClock.js';

const COLUMNS = ['Te necesita', 'Trabajando', 'Terminó', 'Sin tarea'] as const;
const ROW_TOP_PX = 46;
const ROW_STEP_PX = 74;

const CUES: readonly CueAt[] = [
  ...[0, 1, 2, 3].map((i) => [BOARD_BEATS[1] + i * 110, 'pop', i] as const),
  [BOARD_BEATS[2], 'ding'],
  [BOARD_BEATS[4], 'click'],
  [BOARD_BEATS[5], 'cheer'],
];

const CARDS: ReadonlyArray<{ id: BoardCardId; name: string; color: string }> = [
  { id: 'pagos', name: 'Pagos', color: CLAWD_BODY_COLORS[0] },
  { id: 'web', name: 'Web', color: CLAWD_BODY_COLORS[1] },
  { id: 'api', name: 'API', color: CLAWD_BODY_COLORS[2] },
  { id: 'docs', name: 'Docs', color: CLAWD_BODY_COLORS[3] },
];

/** What a card says in each column. */
const STATUS: Record<BoardCardId, readonly [string, string, string, string]> = {
  pagos: ['Te toca: revisar el PR', 'Escribiendo el endpoint', 'Terminó', 'Sin tarea'],
  web: ['', 'Corriendo los tests', 'Terminó', 'Sin tarea'],
  api: ['', 'Arrancó la migración', 'Terminó', 'Sin tarea'],
  docs: ['', 'Escribiendo', 'Terminó', 'Sin tarea'],
};

/**
 * Scene 3: the board builds up, cards take their columns, "Pagos" jumps to
 * "Te necesita" with the amber pulse, a cursor clicks "Hecho" and the card
 * flies to "Terminó" in a burst of sparks.
 */
export function SceneBoard() {
  useCues(CUES);
  const beat = beatAt(useSceneClock(), BOARD_BEATS);
  const layout = boardLayout(beat);
  const needing = beat >= 2 && beat < 5;
  return (
    <div className="intro-scene flex flex-col items-center justify-center gap-24">
      <div className="intro-board relative w-[min(760px,92vw)] h-[230px]">
        {COLUMNS.map((title, col) => (
          <Column key={title} title={title} col={col} hot={col === 0 && needing} layout={layout} />
        ))}
        {CARDS.map((c) => (
          <Card key={c.id} card={c} slot={layout[c.id]} beat={beat} />
        ))}
        {beat >= 3 && <Cursor clicking={beat === 4} />}
      </div>
      <Caption
        title="Te avisa cuando te necesita"
        sub="Un permiso, una pregunta o un PR para revisar"
        delayMs={2400}
      />
    </div>
  );
}

function Column({
  title,
  col,
  hot,
  layout,
}: {
  title: string;
  col: number;
  hot: boolean;
  layout: ReturnType<typeof boardLayout>;
}) {
  const count = Object.values(layout).filter((s) => s.shown && s.col === col).length;
  return (
    <div
      className={`intro-column absolute top-0 bottom-0 rounded-xl border ${hot ? 'intro-column-hot' : ''}`}
      style={{ left: `${col * 25 + 0.5}%`, width: '24%', animationDelay: `${col * 120}ms` }}
    >
      <div className="flex items-center gap-6 px-10 pt-10 text-sm font-semibold text-text">
        {title}
        <span className="intro-count text-2xs rounded-full px-6 py-[1px]" key={count}>
          {count}
        </span>
      </div>
    </div>
  );
}

function Card({
  card,
  slot,
  beat,
}: {
  card: (typeof CARDS)[number];
  slot: BoardSlot;
  beat: number;
}) {
  const needs = slot.col === 0;
  const flewToDone = card.id === 'pagos' && beat >= 5;
  const style = {
    left: `calc(${slot.col * 25 + 1.5}%)`,
    top: ROW_TOP_PX + slot.row * ROW_STEP_PX,
    width: '22%',
    opacity: slot.shown ? 1 : 0,
    '--pop-delay': `${CARDS.indexOf(card) * 110}ms`,
  } as CSSProperties;
  return (
    <div
      className={`intro-card absolute rounded-lg ${needs ? 'intro-card-needs' : ''}`}
      style={style}
    >
      {needs && <span className="intro-ring" aria-hidden="true" />}
      <div className="flex items-center gap-6 p-6">
        <span className="relative shrink-0">
          <IntroClawd
            color={card.color}
            size={26}
            pose={flewToDone ? 'happy' : needs ? 'wave' : 'type'}
          />
          {flewToDone && <Sparks color={card.color} />}
        </span>
        <span className="flex flex-col min-w-0">
          <span className="text-xs font-semibold text-text truncate">{card.name}</span>
          <span className={`text-2xs truncate ${needs ? 'intro-needs-text' : 'text-text-muted'}`}>
            {STATUS[card.id][slot.col]}
          </span>
        </span>
      </div>
      {needs && (
        <div className="px-6 pb-6">
          <span className="intro-done-chip inline-block text-2xs font-semibold rounded-md px-8 py-1">
            Hecho
          </span>
        </div>
      )}
    </div>
  );
}

/** The pointer that glides to "Hecho" and clicks it. */
function Cursor({ clicking }: { clicking: boolean }) {
  return (
    <div
      className={`intro-cursor absolute ${clicking ? 'intro-cursor-click' : ''}`}
      aria-hidden="true"
    >
      <svg width="22" height="22" viewBox="0 0 24 24">
        <path
          className="intro-cursor-arrow"
          d="M4 2 L4 19 L9 14.5 L12.5 21.5 L15.5 20 L12 13 L19 13 Z"
        />
      </svg>
      {clicking && <span className="intro-click-ripple" />}
    </div>
  );
}
