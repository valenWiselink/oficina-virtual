import type { CSSProperties } from 'react';

import { CLAWD_BODY_COLORS } from '../constants.js';
import { Caption } from './Caption.js';
import { IntroClawd } from './IntroClawd.js';
import {
  beatAt,
  SPACES_BEATS,
  type SpacesAgentId,
  spacesView,
  type SpaceTab,
} from './introTimeline.js';
import { type CueAt, useCues } from './useCues.js';
import { useSceneClock } from './useSceneClock.js';

const AGENTS: Record<SpacesAgentId, { name: string; color: string; status: string }> = {
  pagos: { name: 'Pagos', color: CLAWD_BODY_COLORS[0], status: 'Escribiendo el endpoint' },
  web: { name: 'Web', color: CLAWD_BODY_COLORS[1], status: 'Corriendo los tests' },
  blog: { name: 'Blog', color: CLAWD_BODY_COLORS[2], status: 'Escribiendo el post' },
  api: { name: 'API', color: CLAWD_BODY_COLORS[3], status: 'Arrancó la migración' },
  docs: { name: 'Docs', color: CLAWD_BODY_COLORS[4], status: 'Ordenando el README' },
  fotos: { name: 'Fotos', color: CLAWD_BODY_COLORS[5], status: 'Achicando imágenes' },
};

const TABS: ReadonlyArray<{ id: SpaceTab; label: string; width: number }> = [
  { id: 'todos', label: 'Todos', width: 76 },
  { id: 'wiselink', label: 'Wiselink', width: 96 },
  { id: 'personal', label: 'Personal', width: 116 },
];
const BAR_PAD_PX = 4;
const TAB_GAP_PX = 4;
const CARDS_TOP_PX = 66;
const ROW_STEP_PX = 78;

/** Where the pointer's tip goes to click a tab (the middle of it). */
function tabCenter(id: SpaceTab): { left: number; top: number } {
  let x = BAR_PAD_PX;
  for (const t of TABS) {
    if (t.id === id) return { left: x + t.width / 2, top: BAR_PAD_PX + 15 };
    x += t.width + TAB_GAP_PX;
  }
  return { left: 0, top: 0 };
}

const CUES: readonly CueAt[] = [
  ...[0, 1, 2, 3, 4, 5].map((i) => [150 + i * 90, 'pop', i] as const),
  [SPACES_BEATS[2], 'click'],
  [SPACES_BEATS[2] + 120, 'whoosh'],
  [SPACES_BEATS[3], 'ding'],
  [SPACES_BEATS[5], 'click'],
  [SPACES_BEATS[5] + 120, 'whoosh'],
];

/**
 * Workspaces: the tab bar over six agents; a click on "Wiselink" keeps only
 * its four, "Personal" lights a needs-you count, and a click there shows its
 * two with "Blog" waving for you.
 */
export function SceneSpaces() {
  useCues(CUES);
  const beat = beatAt(useSceneClock(), SPACES_BEATS);
  const view = spacesView(beat);
  const pointer =
    beat >= 4 ? tabCenter('personal') : beat >= 1 ? tabCenter('wiselink') : { left: 470, top: 230 };
  const clicking = beat === 2 || beat === 5;
  return (
    <div className="intro-scene flex flex-col items-center justify-center gap-24">
      <div className="relative w-[min(760px,92vw)] h-[236px]">
        <div
          className="intro-spaces-bar intro-pop absolute left-0 top-0 flex rounded-xl"
          style={{ padding: BAR_PAD_PX, gap: TAB_GAP_PX }}
        >
          {TABS.map((t) => (
            <span
              key={t.id}
              className={`intro-space-tab relative flex items-center justify-center rounded-lg text-sm ${view.tab === t.id ? 'intro-space-tab-on' : ''}`}
              style={{ width: t.width }}
            >
              {t.label}
              {t.id === 'personal' && view.badge && (
                <span className="intro-space-badge intro-pop relative ml-6 rounded-full text-2xs font-bold">
                  1
                  <span className="intro-ring intro-ring-round inset-[-4px]!" aria-hidden="true" />
                </span>
              )}
            </span>
          ))}
          <span
            className="intro-space-tab flex items-center justify-center rounded-lg text-sm"
            style={{ width: 30 }}
          >
            +
          </span>
        </div>
        {(Object.keys(AGENTS) as SpacesAgentId[]).map((id, i) => (
          <Card
            key={id}
            id={id}
            index={i}
            place={view.cards[id]}
            needsYou={id === 'blog' && beat >= 3}
          />
        ))}
        <div
          className={`intro-pointer absolute ${clicking ? 'intro-cursor-click' : ''}`}
          style={{ left: pointer.left - 4, top: pointer.top - 2, opacity: beat >= 1 ? 1 : 0 }}
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
      </div>
      <Caption
        title="Un espacio para cada proyecto"
        sub="Cada uno muestra sólo sus agentes, y te avisa si alguien te necesita"
        delayMs={1900}
      />
    </div>
  );
}

function Card({
  id,
  index,
  place,
  needsYou,
}: {
  id: SpacesAgentId;
  index: number;
  place: { slot: number; shown: boolean };
  needsYou: boolean;
}) {
  const agent = AGENTS[id];
  const col = place.slot % 3;
  const row = Math.floor(place.slot / 3);
  const style = {
    left: `${col * 33.5}%`,
    top: CARDS_TOP_PX + row * ROW_STEP_PX,
    width: '31.5%',
    opacity: place.shown ? 1 : 0,
    transform: place.shown ? 'none' : 'scale(0.85)',
    animationDelay: `${150 + index * 90}ms`,
  } as CSSProperties;
  return (
    <div
      className={`intro-card intro-space-card intro-pop absolute rounded-lg ${needsYou ? 'intro-card-needs' : ''}`}
      style={style}
    >
      {needsYou && place.shown && <span className="intro-ring" aria-hidden="true" />}
      <div className="flex items-center gap-8 p-8">
        <IntroClawd color={agent.color} size={28} pose={needsYou ? 'wave' : 'type'} />
        <span className="flex flex-col min-w-0">
          <span className="text-xs font-semibold text-text truncate">{agent.name}</span>
          <span
            className={`text-2xs truncate ${needsYou ? 'intro-needs-text' : 'text-text-muted'}`}
          >
            {needsYou ? 'Te toca: revisar el post' : agent.status}
          </span>
        </span>
      </div>
    </div>
  );
}
