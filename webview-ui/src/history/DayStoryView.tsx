import type { DayPr, WriteDaySummary } from '../../../core/src/messages.js';
import { CharacterMugShot } from '../components/CharacterMugShot.js';
import { Button } from '../components/ui/Button.js';
import { usePrStatuses } from '../prs/prStatusStore.js';
import type { AgentView } from '../views/agentViews.js';
import { useDayLog } from './dayLogStore.js';
import { timeRange } from './dayLogView.js';
import { type DayStory, dayStory, type WorkStream } from './dayStory.js';
import { useDaySummary, writeDaySummary } from './daySummaryStore.js';

/** How many completed tasks a stream lists before "y N más". */
const TASKS_SHOWN = 4;
const LEFT_SHOWN = 2;

const PR_STATE: Record<string, string> = { open: 'abierto', merged: 'mergeado', closed: 'cerrado' };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const withoutTeToca = (text: string) => text.replace(/^Te toca:\s*/i, '');
const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

/** What Haiku is handed: the achievements, the PRs and the tasks of the day. */
function factsOf(story: DayStory): Omit<WriteDaySummary, 'type'> {
  const streams = story.projects.flatMap((p) => p.streams);
  const prs = new Map<string, DayPr>();
  for (const pr of streams.flatMap((s) => s.prs)) {
    if (pr.state !== 'closed') prs.set(pr.url, { title: pr.label, state: pr.state });
  }
  return {
    achievements: story.achievements,
    prs: [...prs.values()],
    tasks: [...new Set(streams.flatMap((s) => s.done))],
  };
}

/**
 * "Tu día": what you achieved today, per project — no agents, no PRs, no
 * pending work — or, when you asked for it, the same written as a summary by
 * Haiku. Below, folded, the day per agent (what each session achieved, its
 * PRs and what it left you) and the sessions where nothing got done. A click
 * on an agent takes you to it.
 */
export function DayStoryView({
  views,
  onOpenAgent,
}: {
  views: AgentView[];
  onOpenAgent: (agentId: number) => void;
}) {
  const story = dayStory(useDayLog(), views, usePrStatuses());
  const summary = useDaySummary();
  const canWrite = story.achievements.length > 0 || story.projects.length > 0;
  return (
    <div className="overflow-y-auto flex-1 px-12 pb-12 flex flex-col gap-12">
      <div className="flex flex-col gap-2">
        <p className="m-0 text-base font-semibold text-text leading-snug">Lo que hiciste hoy</p>
        {story.span && (
          <p className="m-0 text-xs text-text-muted">
            Actividad de {timeRange(story.span.from, story.span.to)}
          </p>
        )}
      </div>
      {canWrite && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-8 flex-wrap">
            <Button
              size="sm"
              variant={summary.writing ? 'disabled' : 'default'}
              disabled={summary.writing}
              onClick={() => writeDaySummary(factsOf(story))}
            >
              {summary.writing
                ? 'Escribiendo…'
                : summary.text
                  ? 'Actualizar el resumen'
                  : 'Escribirlo como resumen'}
            </Button>
            <span className="text-2xs text-text-muted">
              Usa Haiku: consume un poco de tu plan de Claude.
            </span>
          </div>
          {summary.failed && (
            <p className="m-0 text-xs text-status-permission-text">
              No se pudo escribir: {summary.failed}
            </p>
          )}
        </div>
      )}
      {summary.text ? (
        <section className="flex flex-col gap-4">
          <p className="m-0 text-2xs text-text-muted">
            Resumen escrito por Claude{summary.at ? ` a las ${clock(summary.at)}` : ''}
          </p>
          <div className="text-sm text-text leading-relaxed whitespace-pre-wrap">
            {summary.text}
          </div>
        </section>
      ) : (
        <Achievements achievements={story.achievements} />
      )}
      {(story.projects.length > 0 || story.minor.length > 0) && (
        <details className="flex flex-col gap-8">
          <summary className="cursor-pointer text-xs text-text-muted">
            Por agente · {story.headline}
          </summary>
          <div className="flex flex-col gap-12 mt-8">
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
              <div className="text-xs text-text-muted">
                <p className="m-0">
                  Y {plural(story.minor.length, 'sesión corta', 'sesiones cortas')} sin nada hecho:
                </p>
                <ul className="m-0 mt-4 pl-16 flex flex-col gap-2">
                  {story.minor.map((s) => (
                    <li key={s.agent}>
                      {s.agent} · {timeRange(s.from, s.to)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

/** One item per thing done, the project as a small heading. */
function Achievements({ achievements }: { achievements: DayStory['achievements'] }) {
  if (achievements.length === 0) {
    return (
      <p className="m-0 text-sm text-text-muted">
        Todavía no hay nada terminado hoy: aparece cuando tus agentes cuentan lo que lograron.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-12">
      {achievements.map((a) => (
        <section key={a.project} className="flex flex-col gap-4">
          <h3 className="m-0 text-2xs font-semibold uppercase tracking-wide text-text-muted">
            {a.project}
          </h3>
          <ul className="m-0 pl-16 flex flex-col gap-4">
            {a.items.map((item) => (
              <li key={item} className="text-sm text-text leading-snug">
                {item}
              </li>
            ))}
          </ul>
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
  const extraTasks = s.done.length - TASKS_SHOWN;
  // A session with nothing but its name to lead with (a day logged before
  // recaps) leads with its PR or what it left you.
  const named = s.title !== s.agent;
  const aside = named || s.done.length > 0 ? 'text-2xs text-text-muted' : 'text-xs text-text';
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
        {named && <span className="text-sm text-text leading-snug line-clamp-4">{s.title}</span>}
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
