import type { CSSProperties } from 'react';

import { CLAWD_BODY_COLORS } from '../constants.js';
import { Caption } from './Caption.js';
import { IntroClawd } from './IntroClawd.js';
import { type CueAt, useCues } from './useCues.js';

/** The graph is drawn on a 760×300 board that scales as a whole. */
const W = 760;
const H = 300;
const VOS = { x: 70, y: 52 };
const NEEDS = { x: 240, y: 200, color: CLAWD_BODY_COLORS[0] };
const LEAD = { x: 480, y: 132, color: CLAWD_BODY_COLORS[1] };
const SOLO = { x: 668, y: 228, color: CLAWD_BODY_COLORS[2] };
const SUBAGENTS = [
  CLAWD_BODY_COLORS[3],
  CLAWD_BODY_COLORS[4],
  CLAWD_BODY_COLORS[5],
  CLAWD_BODY_COLORS[3],
];
const ORBIT_R = 78;

const CUES: readonly CueAt[] = [
  [0, 'pop', 0],
  [300, 'pop', 1],
  [500, 'pop', 2],
  [700, 'pop', 3],
  [900, 'whoosh'],
  [1300, 'ding'],
];

const at = (p: { x: number; y: number }): CSSProperties => ({
  left: `${(p.x / W) * 100}%`,
  top: `${(p.y / H) * 100}%`,
});

/**
 * Scene 4: the live graph — the links draw themselves, whoever needs you
 * sends a marching amber line to "Vos" with pulsing rings, and a lead's
 * meeting of subagents orbits around it.
 */
export function SceneGraph() {
  useCues(CUES);
  return (
    <div className="intro-scene flex flex-col items-center justify-center gap-24">
      <div className="relative w-[min(760px,92vw)] aspect-[760/300]">
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox={`0 0 ${W} ${H}`}
          aria-hidden="true"
        >
          <line
            className="intro-link intro-draw"
            x1={LEAD.x}
            y1={LEAD.y}
            x2={SOLO.x}
            y2={SOLO.y}
            pathLength={1}
          />
          <line
            className="intro-link-amber intro-draw"
            x1={NEEDS.x}
            y1={NEEDS.y}
            x2={VOS.x + 30}
            y2={VOS.y + 14}
            pathLength={1}
          />
          <line
            className="intro-link-amber intro-march"
            x1={NEEDS.x}
            y1={NEEDS.y}
            x2={VOS.x + 30}
            y2={VOS.y + 14}
          />
        </svg>
        <div
          className="intro-vos absolute -translate-x-1/2 -translate-y-1/2 intro-pop"
          style={at(VOS)}
        >
          Vos
        </div>
        <Node p={NEEDS} pose="wave" rings delayMs={300} />
        <Meeting />
        <Node p={SOLO} pose="type" delayMs={700} />
      </div>
      <Caption
        title="Mirá cómo trabajan entre ellos"
        sub="Quién está en una junta, quién investiga, quién te espera"
        delayMs={1800}
      />
    </div>
  );
}

function Node({
  p,
  pose,
  rings = false,
  delayMs,
  size = 64,
}: {
  p: { x: number; y: number; color: string };
  pose: 'wave' | 'type' | 'idle';
  rings?: boolean;
  delayMs: number;
  size?: number;
}) {
  const style = { ...at(p), '--clawd': p.color, animationDelay: `${delayMs}ms` } as CSSProperties;
  return (
    <div
      className="intro-node absolute -translate-x-1/2 -translate-y-1/2 intro-pop rounded-full"
      style={{ ...style, width: size, height: size }}
    >
      {rings && <span className="intro-ring intro-ring-round" aria-hidden="true" />}
      <IntroClawd color={p.color} size={size * 0.62} pose={pose} />
    </div>
  );
}

/** A lead with its subagents circling it (a "junta"). */
function Meeting() {
  return (
    <>
      <Node p={LEAD} pose="type" delayMs={500} size={72} />
      <div className="intro-orbit absolute" style={at(LEAD)} aria-hidden="true">
        {SUBAGENTS.map((color, i) => {
          const angle = (i / SUBAGENTS.length) * 360;
          return (
            <div
              key={i}
              className="intro-orbit-arm absolute"
              style={{ transform: `rotate(${angle}deg)` }}
            >
              <span className="intro-orbit-spoke absolute" style={{ width: ORBIT_R }} />
              <div className="absolute" style={{ left: ORBIT_R, top: 0 }}>
                <div
                  className="intro-orbit-sat -translate-x-1/2 -translate-y-1/2"
                  style={{ transform: `rotate(${-angle}deg)` }}
                >
                  <div
                    className="intro-orbit-counter rounded-full intro-node intro-sat"
                    style={{ '--clawd': color } as CSSProperties}
                  >
                    <IntroClawd color={color} size={24} pose="type" />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
