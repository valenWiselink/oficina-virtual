import { CharacterMugShot } from '../components/CharacterMugShot.js';
import { usePrStatuses } from '../prs/prStatusStore.js';
import type { AgentView } from '../views/agentViews.js';
import { useDayLog } from './dayLogStore.js';
import { timeRange } from './dayLogView.js';
import { dayStory, type WorkStream } from './dayStory.js';

/** How many turns a stream tells (newest first) before the rest. */
const DID_SHOWN = 3;
/** How many completed tasks a stream lists before "y N más". */
const TASKS_SHOWN = 4;
const LEFT_SHOWN = 2;

const PR_STATE: Record<string, string> = { open: 'abierto', merged: 'mergeado', closed: 'cerrado' };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const withoutTeToca = (text: string) => text.replace(/^Te toca:\s*/i, '');

/**
 * "¿Qué hice hoy?": the day by project and agent — first what each one did,
 * then its PRs and what it left you — with one headline on top and the
 * sessions where nothing got done folded at the end. A click on an agent
 * takes you to it.
 */
export function DayStoryView({
  views,
  onOpenAgent,
}: {
  views: AgentView[];
  onOpenAgent: (agentId: number) => void;
}) {
  const story = dayStory(useDayLog(), views, usePrStatuses());
  return (
    <div className="overflow-y-auto flex-1 px-12 pb-12 flex flex-col gap-12">
      <div className="flex flex-col gap-2">
        <p className="m-0 text-base font-semibold text-text leading-snug">{story.headline}</p>
        {story.span && (
          <p className="m-0 text-xs text-text-muted">
            Actividad de {timeRange(story.span.from, story.span.to)}
          </p>
        )}
      </div>
      {story.projects.map((project) => (
        <section key={project.name} className="flex flex-col gap-6">
          <h3 className="m-0 text-2xs font-semibold uppercase tracking-wide text-text-muted">
            {project.name}
          </h3>
          {project.streams.map((s) => (
            <Stream key={s.agent} stream={s} onOpenAgent={onOpenAgent} />
          ))}
        </section>
      ))}
      {story.minor.length > 0 && (
        <details className="text-xs text-text-muted">
          <summary className="cursor-pointer">
            Y {plural(story.minor.length, 'sesión corta', 'sesiones cortas')} sin nada hecho
          </summary>
          <ul className="m-0 mt-4 pl-16 flex flex-col gap-2">
            {story.minor.map((s) => (
              <li key={s.agent}>
                {s.agent} · {timeRange(s.from, s.to)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Stream({
  stream: s,
  onOpenAgent,
}: {
  stream: WorkStream;
  onOpenAgent: (agentId: number) => void;
}) {
  const extraTasks = s.done.length - TASKS_SHOWN;
  const extraTurns = s.did.length - DID_SHOWN;
  // A session without a word of what it did (a day logged before turns were
  // summed up) still leads with its PR or what it left you.
  const aside = s.did.length + s.done.length > 0 ? 'text-2xs text-text-muted' : 'text-xs text-text';
  const footer = [
    s.turns > 0 && plural(s.turns, 'turno', 'turnos'),
    s.edits > 0 && plural(s.edits, 'archivo editado', 'archivos editados'),
    s.answered > 0 && plural(s.answered, 'permiso', 'permisos'),
  ].filter(Boolean);
  return (
    <button
      type="button"
      disabled={s.agentId === undefined}
      onClick={() => s.agentId !== undefined && onOpenAgent(s.agentId)}
      className="text-left flex gap-8 p-8 rounded-lg border border-border bg-bg hover:shadow-soft cursor-pointer disabled:cursor-default"
    >
      {s.palette !== undefined && (
        <CharacterMugShot palette={s.palette} hueShift={s.hueShift ?? 0} size={24} />
      )}
      <span className="flex flex-col gap-4 min-w-0 flex-1">
        <span className="flex items-baseline gap-6 min-w-0">
          <span className="text-xs font-semibold text-text-muted truncate">{s.agent}</span>
          <span className="ml-auto text-2xs text-text-muted tabular-nums shrink-0">
            {timeRange(s.from, s.to)}
          </span>
        </span>
        {s.did.slice(0, DID_SHOWN).map((d, i) => (
          <span
            key={d}
            className={`text-text leading-snug line-clamp-3 ${i === 0 ? 'text-sm' : 'text-xs'}`}
          >
            {d}
          </span>
        ))}
        {extraTurns > 0 && (
          <span className="text-2xs text-text-muted">
            y {plural(extraTurns, 'turno más', 'turnos más')}
          </span>
        )}
        {s.done.length > 0 && (
          <span className="text-xs text-text">
            <span className="text-status-success font-semibold">✓ {s.done.length}</span>{' '}
            {s.done.slice(0, TASKS_SHOWN).join(' · ')}
            {extraTasks > 0 && <span className="text-text-muted"> y {extraTasks} más</span>}
          </span>
        )}
        {s.prs.map((p) => (
          <span key={p.url} className={`${aside} truncate`}>
            PR: {p.label}
            {p.state && <> · {PR_STATE[p.state]}</>}
          </span>
        ))}
        {s.leftForYou.slice(0, LEFT_SHOWN).map((t) => (
          <span key={t} className={`${aside} line-clamp-2`}>
            Te dejó: {withoutTeToca(t)}
          </span>
        ))}
        {footer.length > 0 && (
          <span className="text-2xs text-text-muted">{footer.join(' · ')}</span>
        )}
      </span>
    </button>
  );
}
