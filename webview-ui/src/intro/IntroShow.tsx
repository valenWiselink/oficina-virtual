import type { CSSProperties } from 'react';
import { useCallback, useEffect, useState } from 'react';

import { cue, introSoundOn, padTo, setIntroSound, stopPad, wakeIntroSound } from './introSound.js';
import { markIntroSeen } from './introStore.js';
import { nextScene, prevScene, type SceneId, SCENES } from './introTimeline.js';
import { SceneBoard } from './SceneBoard.js';
import { SceneChat } from './SceneChat.js';
import { SceneDay } from './SceneDay.js';
import { SceneFinale } from './SceneFinale.js';
import { SceneGraph } from './SceneGraph.js';
import { SceneLogo } from './SceneLogo.js';
import { SceneSpaces } from './SceneSpaces.js';
import { SceneTeam } from './SceneTeam.js';

/**
 * The first-run presentation: eight short animated scenes that show what the
 * office is for (the team, the board, workspaces, the graph, the chat, the
 * day) before the setup, with a soft pad and a sound for each thing that
 * happens (muted with the speaker button, remembered).
 * Scenes advance on their own; ←/→ (or the dots) move between them,
 * Enter/Space goes on, Esc or «Saltar» skips. Either way it counts as seen.
 */
export function IntroShow({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const [soundOn, setSoundOn] = useState(introSoundOn);
  const scene = SCENES[index];
  const finish = useCallback(() => {
    markIntroSeen();
    onDone();
  }, [onDone]);

  // The pad follows the scenes; every change after the first one whooshes.
  useEffect(() => {
    padTo(index);
    if (index > 0) cue('whoosh');
  }, [index]);
  useEffect(() => stopPad, []);

  useEffect(() => {
    if (scene.ms === null) return;
    const timer = setTimeout(() => setIndex(nextScene), scene.ms);
    return () => clearTimeout(timer);
  }, [index, scene.ms]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      wakeIntroSound();
      if (e.key === 'Escape') finish();
      else if (e.key === 'ArrowRight') setIndex(nextScene);
      else if (e.key === 'ArrowLeft') setIndex(prevScene);
      else if ((e.key === 'Enter' || e.key === ' ') && SCENES[index].ms !== null) {
        e.preventDefault();
        setIndex(nextScene);
      } else return;
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [finish, index]);

  return (
    <div
      className="intro-show fixed inset-0 z-[90] overflow-hidden"
      role="dialog"
      aria-label="Presentación de la oficina"
      onPointerDown={wakeIntroSound}
    >
      <div key={scene.id} className="absolute inset-0">
        <SceneView id={scene.id} onStart={finish} />
      </div>
      <button
        type="button"
        onClick={() => {
          setIntroSound(!soundOn);
          setSoundOn(!soundOn);
        }}
        aria-label={soundOn ? 'Silenciar' : 'Activar el sonido'}
        title={soundOn ? 'Silenciar' : 'Activar el sonido'}
        className="absolute top-16 right-[88px] z-10 border-0 bg-transparent text-text-muted hover:text-text cursor-pointer px-8 py-6 rounded-lg flex"
      >
        <SpeakerIcon on={soundOn} />
      </button>
      <button
        type="button"
        onClick={finish}
        className="absolute top-16 right-16 z-10 border-0 bg-transparent text-sm text-text-muted hover:text-text cursor-pointer px-10 py-6 rounded-lg"
      >
        Saltar
      </button>
      <Progress index={index} onPick={setIndex} />
    </div>
  );
}

function SceneView({ id, onStart }: { id: SceneId; onStart: () => void }) {
  switch (id) {
    case 'logo':
      return <SceneLogo />;
    case 'team':
      return <SceneTeam />;
    case 'board':
      return <SceneBoard />;
    case 'spaces':
      return <SceneSpaces />;
    case 'graph':
      return <SceneGraph />;
    case 'chat':
      return <SceneChat />;
    case 'day':
      return <SceneDay />;
    case 'finale':
      return <SceneFinale onStart={onStart} />;
  }
}

/** Story-style segments: past ones full, the current one filling over its time. */
function Progress({ index, onPick }: { index: number; onPick: (i: number) => void }) {
  return (
    <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-10 flex gap-6" role="tablist">
      {SCENES.map((s, i) => (
        <button
          key={s.id}
          type="button"
          role="tab"
          aria-selected={i === index}
          aria-label={`Parte ${i + 1} de ${SCENES.length}`}
          onClick={() => onPick(i)}
          className="intro-dot border-0 p-0 cursor-pointer rounded-full overflow-hidden"
        >
          <span
            key={i === index ? `on-${index}` : 'off'}
            className={`intro-dot-fill block h-full ${i < index ? 'intro-dot-full' : i === index ? 'intro-dot-running' : ''}`}
            style={{ '--scene-ms': `${s.ms ?? 1}ms` } as CSSProperties}
          />
        </button>
      ))}
    </div>
  );
}

/** A speaker with sound waves, or crossed out when muted. */
function SpeakerIcon({ on }: { on: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" />
      {on ? (
        <>
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M18.5 5.5a9 9 0 0 1 0 13" />
        </>
      ) : (
        <path d="m16 9 6 6m0-6-6 6" />
      )}
    </svg>
  );
}
