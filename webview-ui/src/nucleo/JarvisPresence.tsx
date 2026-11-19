import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

import type { AgentView } from '../views/agentViews.js';
import { NucleoEngine } from './nucleoEngine.js';
import {
  coordinating,
  isThinking,
  type PresenceMode,
  presencePhrase,
  speakingPlan,
} from './nucleoRules.js';

const LISTEN_HOLD_MS = 1500;
const NEED_HOLD_MS = 1800;
/** What arrives this soon after the page opens is the state, not news. */
const OPENING_MS = 3000;

export interface PresenceHandle {
  /** A key in Jarvis's box. */
  key(): void;
}

/**
 * Jarvis at the center of Núcleo: the glass sphere, his name and what he is
 * doing in one sentence. Everything it shows comes from events (a key, his
 * turn starting, a new answer, something that needs you); nothing moves on
 * its own (nucleoEngine.ts).
 */
export const JarvisPresence = forwardRef<
  PresenceHandle,
  {
    jarvis: AgentView | undefined;
    /** Changes when something new needs Valentín (a permission, a «Te toca»). */
    needKey: string;
    compact: boolean;
    /** Other agents at work right now (between turns he coordinates them). */
    working: number;
  }
>(function JarvisPresence({ jarvis, needKey, compact, working }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const engine = useRef<NucleoEngine | null>(null);
  const [still, setStill] = useState(false);
  const [mode, setMode] = useState<PresenceMode>('reposo');
  const modeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const hold = (next: PresenceMode, ms: number) => {
    setMode(next);
    if (modeTimer.current) clearTimeout(modeTimer.current);
    modeTimer.current = setTimeout(() => setMode('reposo'), ms);
  };

  useImperativeHandle(ref, () => ({
    key: () => {
      engine.current?.key();
      setMode((m) => (m === 'reposo' || m === 'escucha' ? 'escucha' : m));
      if (modeTimer.current) clearTimeout(modeTimer.current);
      modeTimer.current = setTimeout(
        () => setMode((m) => (m === 'escucha' ? 'reposo' : m)),
        LISTEN_HOLD_MS,
      );
    },
  }));

  // The engine lives as long as the canvas; the theme and the size redraw one frame.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    // The first ancestor that paints a background is what the glass sits on.
    const bg = () => {
      for (let node: Element | null = el; node; node = node.parentElement) {
        const color = getComputedStyle(node).backgroundColor;
        if (color && !/rgba\([^)]*,\s*0\)|transparent/.test(color)) return color;
      }
      return getComputedStyle(document.body).backgroundColor;
    };
    const e = new NucleoEngine(el, bg, setStill);
    engine.current = e;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const sizes = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => e.resize(), 150);
    });
    sizes.observe(el);
    const theme = new MutationObserver(() => e.draw());
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'style'],
    });
    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      sizes.disconnect();
      theme.disconnect();
      e.destroy();
      engine.current = null;
    };
  }, []);

  // His turn under way: the ember turns.
  const thinking = isThinking(jarvis);
  useEffect(() => {
    engine.current?.think(thinking);
    if (thinking) setMode((m) => (m === 'habla' ? m : 'piensa'));
    else setMode((m) => (m === 'piensa' ? 'reposo' : m));
  }, [thinking]);

  // Between turns with agents at work: the coordinating pose (still, one settle).
  const directing = coordinating(jarvis, working);
  useEffect(() => {
    engine.current?.coordinate(directing);
  }, [directing]);

  // A new answer: it beats with each word, then rests.
  const answer = jarvis?.lastReplyHead ?? '';
  const seenAnswer = useRef(answer);
  useEffect(() => {
    if (!answer || answer === seenAnswer.current) return;
    seenAnswer.current = answer;
    const e = engine.current;
    const { words, everyMs } = speakingPlan(answer);
    e?.think(false);
    e?.speak(true);
    setMode('habla');
    let said = 0;
    const beat = setInterval(() => {
      e?.word();
      if (++said >= words) {
        clearInterval(beat);
        e?.speak(false);
        setMode('reposo');
      }
    }, everyMs);
    return () => {
      clearInterval(beat);
      e?.speak(false);
    };
  }, [answer]);

  // Something new needs Valentín: a bud toward «Te necesita». What arrives
  // right after the page opens (the replay of what already waited) is where
  // things stand, not news.
  const seenNeed = useRef(needKey);
  const openedAt = useRef(Date.now());
  useEffect(() => {
    if (needKey === seenNeed.current) return;
    seenNeed.current = needKey;
    if (!needKey || Date.now() - openedAt.current < OPENING_MS) return;
    engine.current?.need();
    hold('necesita', NEED_HOLD_MS);
  }, [needKey]);

  useEffect(() => () => clearTimeout(modeTimer.current), []);

  return (
    <div
      ref={stage}
      data-mode={mode}
      data-coordinating={directing ? '' : undefined}
      className={`nucleo-stage shrink-0 flex flex-col items-center ${compact ? 'gap-2' : 'gap-6'}`}
    >
      <div
        className={`relative ${compact ? 'w-[170px] h-[150px]' : 'w-[300px] h-[250px]'} max-w-full`}
        aria-hidden="true"
      >
        <canvas ref={canvas} className={`w-full h-full ${still ? 'hidden' : 'block'}`} />
        {still && <div className="nucleo-still absolute inset-0 m-auto rounded-full" />}
      </div>
      <p className="m-0 flex items-baseline gap-10 min-w-0" aria-live="polite">
        <span
          className={`font-display font-bold tracking-tight text-text ${compact ? 'text-xl' : 'text-4xl'}`}
        >
          Jarvis
        </span>
        <span className="text-sm text-text-2 truncate">
          {presencePhrase(mode, jarvis, working)}
        </span>
      </p>
    </div>
  );
});
