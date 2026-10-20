import { Sparks } from '../components/Sparks.js';
import { CLAWD_BODY_COLORS } from '../constants.js';
import { Caption } from './Caption.js';
import { IntroClawd } from './IntroClawd.js';
import { beatAt, DAY_BEATS } from './introTimeline.js';
import { type CueAt, useCues } from './useCues.js';
import { useSceneClock } from './useSceneClock.js';

// Split so the "#" next to digits is not read as a colour.
const PR = 'PR #' + '812';

interface Row {
  project: string;
  agent: string;
  color: string;
  done: number;
  /** The beat the row lands on. */
  beat: number;
  line?: { text: string; kind: 'pr' | 'left' };
}

const ROWS: readonly Row[] = [
  {
    project: 'Wiselink',
    agent: 'Pagos',
    color: CLAWD_BODY_COLORS[0],
    done: 2,
    beat: 1,
    line: { text: `${PR} · el endpoint de cobros`, kind: 'pr' },
  },
  { project: 'Wiselink', agent: 'Web', color: CLAWD_BODY_COLORS[1], done: 2, beat: 2 },
  {
    project: 'Personal',
    agent: 'Blog',
    color: CLAWD_BODY_COLORS[2],
    done: 1,
    beat: 3,
    line: { text: 'Te dejó: revisar el post', kind: 'left' },
  },
];
const PROJECTS = ['Wiselink', 'Personal'] as const;

const CUES: readonly CueAt[] = [
  [DAY_BEATS[1], 'pop', 0],
  [DAY_BEATS[2], 'pop', 2],
  [DAY_BEATS[3], 'pop', 4],
  [DAY_BEATS[5], 'cheer'],
];

/**
 * "Tu día": the day told by project — each agent's row lands with what it
 * finished, the headline counts up, and the PR gets its "mergeado" stamp.
 */
export function SceneDay() {
  useCues(CUES);
  const beat = beatAt(useSceneClock(), DAY_BEATS);
  const landed = ROWS.filter((r) => beat >= r.beat);
  const total = landed.reduce((n, r) => n + r.done, 0);
  const merged = beat >= 5;
  return (
    <div className="intro-scene flex flex-col items-center justify-center gap-24">
      <div className="intro-panel intro-slide-in w-[min(460px,90vw)] rounded-2xl overflow-hidden">
        <div className="flex items-center gap-8 px-14 py-10 border-b border-border">
          <span className="text-sm font-semibold text-text">Tu día</span>
          <span className="ml-auto text-2xs text-text-muted">de 9:10 a 18:40</span>
        </div>
        <div className="flex flex-col gap-10 p-14 min-h-[236px]">
          <p className="m-0 text-base font-semibold text-text">
            Hoy terminaste{' '}
            <span key={total} className="intro-day-count inline-block text-accent">
              {total}
            </span>{' '}
            tareas en 2 proyectos
          </p>
          {PROJECTS.map((project) => {
            const rows = landed.filter((r) => r.project === project);
            if (rows.length === 0) return null;
            return (
              <section key={project} className="flex flex-col gap-6">
                <h3 className="m-0 text-2xs font-semibold uppercase tracking-wide text-text-muted intro-fade-up">
                  {project}
                </h3>
                {rows.map((r) => (
                  <div
                    key={r.agent}
                    className="intro-day-row intro-pop flex gap-8 p-8 rounded-lg border border-border"
                  >
                    <span className="relative shrink-0">
                      <IntroClawd
                        color={r.color}
                        size={26}
                        pose={merged && r.line?.kind === 'pr' ? 'happy' : 'idle'}
                      />
                      {merged && r.line?.kind === 'pr' && <Sparks color={r.color} />}
                    </span>
                    <span className="flex flex-col gap-2 min-w-0 flex-1">
                      <span className="text-xs font-semibold text-text">{r.agent}</span>
                      <span className="text-2xs text-status-success font-semibold">
                        ✓ {r.done} {r.done === 1 ? 'terminada' : 'terminadas'}
                      </span>
                      {r.line && (
                        <span
                          className={`text-2xs truncate ${r.line.kind === 'left' ? 'intro-needs-text' : 'text-text'}`}
                        >
                          {r.line.text}
                          {r.line.kind === 'pr' && merged && (
                            <span className="intro-merged intro-pop inline-block ml-6 rounded-md px-6 text-2xs font-semibold">
                              mergeado
                            </span>
                          )}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      </div>
      <Caption
        title="Lo que hiciste hoy, por proyecto"
        sub="Qué se terminó, los PRs y lo que te dejaron para vos"
        delayMs={2600}
      />
    </div>
  );
}
