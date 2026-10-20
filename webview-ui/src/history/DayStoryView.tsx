import { CharacterMugShot } from '../components/CharacterMugShot.js';
import { usePrStatuses } from '../prs/prStatusStore.js';
import type { AgentView } from '../views/agentViews.js';
import { useDayLog } from './dayLogStore.js';
import { timeRange } from './dayLogView.js';
import { dayStory, type WorkStream } from './dayStory.js';

/** How many completed tasks a stream lists before "y N más". */
const TASKS_SHOWN = 4;
const LEFT_SHOWN = 2;

const PR_STATE: Record<string, string> = { open: 'abierto', merged: 'mergeado', closed: 'cerrado' };

/**
 * "¿Qué hice hoy?": the day by project and agent — what got done, the PRs
 * and what was left for you — with one headline on top. A click on an agent
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
  const extra = s.done.length - TASKS_SHOWN;
  const footer = [
    s.turns > 0 && `${s.turns} ${s.turns === 1 ? 'turno' : 'turnos'}`,
    s.answered > 0 && `${s.answered} ${s.answered === 1 ? 'permiso' : 'permisos'}`,
    timeRange(s.from, s.to),
  ].filter(Boolean);
  return (
    <button
      type="button"
      disabled={s.agentId === undefined}
      onClick={() => s.agentId !== undefined && onOpenAgent(s.agentId)}
      className="text-left flex gap-8 p-8 rounded-lg border border-border bg-bg hover:shadow-soft cursor-pointer disabled:cursor-default"
    >
      {s.palette !== undefined && (
        <CharacterMugShot palette={s.palette} hueShift={s.hueShift ?? 0} size={28} />
      )}
      <span className="flex flex-col gap-4 min-w-0 flex-1">
        <span className="text-sm font-semibold text-text truncate">{s.agent}</span>
        {s.done.length > 0 && (
          <span className="text-xs text-text">
            <span className="text-status-success font-semibold">✓ {s.done.length}</span>{' '}
            {s.done.slice(0, TASKS_SHOWN).join(' · ')}
            {extra > 0 && <span className="text-text-muted"> y {extra} más</span>}
          </span>
        )}
        {s.prs.map((p) => (
          <span key={p.url} className="text-xs text-text truncate">
            PR: {p.label}
            {p.state && <span className="text-text-muted"> · {PR_STATE[p.state]}</span>}
          </span>
        ))}
        {s.leftForYou.slice(0, LEFT_SHOWN).map((t) => (
          <span key={t} className="text-xs text-status-permission-text line-clamp-2">
            Te dejó: {t}
          </span>
        ))}
        <span className="text-2xs text-text-muted">{footer.join(' · ')}</span>
      </span>
    </button>
  );
}
