import type { ReactNode } from 'react';

import { Button } from '../components/ui/Button.js';
import { filePassesOf } from '../office/behaviors/fileLinksStore.js';
import { type AgentView, KIND_COLOR, type SubagentView } from './agentViews.js';
import { clawdColor } from './clawdColor.js';
import { lighten } from './graphDraw.js';

/** How many of its file passes the panel lists. */
const PASSES_SHOWN = 5;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-2xs font-semibold text-text-muted">{title}</span>
      {children}
    </div>
  );
}

/** The files it passed to its meeting or got from it, newest first. */
function Passes({ lead, member }: { lead: AgentView; member: SubagentView }) {
  const nameOf = (id: number) =>
    lead.subagents.find((s) => s.id === id)?.label ?? 'otro integrante';
  const passes = filePassesOf(member.id).slice(0, PASSES_SHOWN);
  if (passes.length === 0) return <span className="text-2xs text-text-muted">Ninguno todavía</span>;
  return passes.map((p) => (
    <span key={`${p.at}-${p.file}`} className="text-2xs text-text-2 break-words">
      {p.fromId === member.id ? `Le pasó «${p.file}» a ` : `Recibió «${p.file}» de `}
      <span className="font-semibold">{nameOf(p.fromId === member.id ? p.toId : p.fromId)}</span>
    </span>
  ));
}

/**
 * A meeting member's own panel (clicking it on the graph): its errand, what
 * it is doing, its latest tools and the files it passed, and back to its
 * lead. What it did once it finished (its transcript) is not read here yet.
 */
export function GraphMemberPanel({
  lead,
  member,
  onLead,
  onClose,
}: {
  lead: AgentView;
  member: SubagentView;
  onLead: () => void;
  onClose: () => void;
}) {
  const color = lighten(clawdColor(lead.palette, lead.hueShift), 0.3);
  return (
    <aside
      className="absolute top-14 right-14 z-20 w-[min(320px,calc(100%-28px))] soft-panel p-8 flex flex-col gap-8"
      aria-label={`Integrante ${member.label}`}
    >
      <div className="flex items-center gap-6 px-2">
        <Button size="sm" onClick={onLead}>
          Ver a su líder
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="ml-auto"
          onClick={onClose}
          title="Cerrar (Esc)"
          aria-label="Cerrar panel"
        >
          ×
        </Button>
      </div>
      <div className="relative bg-bg rounded-lg border border-border pl-14 pr-8 py-8 flex flex-col gap-6">
        <span
          className="absolute left-5 top-8 bottom-8 w-3 rounded-full"
          style={{ background: color }}
        />
        <span className="text-sm font-semibold text-text break-words">{member.label}</span>
        <span className="text-2xs text-text-muted">En la junta de {lead.name}</span>
        <span className="text-xs text-text-2 flex items-start gap-5 break-words">
          <span
            className="w-7 h-7 mt-4 rounded-full shrink-0"
            style={{ background: KIND_COLOR[member.kind] }}
          />
          {member.statusText}
        </span>
        <Section title="Lo último que hizo">
          {(member.recent ?? []).length === 0 ? (
            <span className="text-2xs text-text-muted">Todavía nada</span>
          ) : (
            member.recent!.map((tool, i) => (
              <span key={i} className="text-2xs text-text-2 break-words">
                {tool}
              </span>
            ))
          )}
        </Section>
        <Section title="Archivos que pasó">
          <Passes lead={lead} member={member} />
        </Section>
      </div>
    </aside>
  );
}
