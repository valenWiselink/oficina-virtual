import { useState } from 'react';

import { Button } from '../components/ui/Button.js';
import { assignAgent, useWorkspaces } from '../workspaces/workspaceStore.js';
import type { AgentView } from './agentViews.js';
import type { BoardActions } from './BoardCard.js';
import { clawdColor } from './clawdColor.js';
import { simplePermissions } from './graphPick.js';

/** How many names the panel lists before "y N más". */
const NAMES_SHOWN = 8;

function Names({ views }: { views: AgentView[] }) {
  return (
    <div className="flex flex-wrap gap-4">
      {views.slice(0, NAMES_SHOWN).map((v) => (
        <span key={v.id} className="flex items-center gap-4 text-2xs text-text">
          <span
            className="w-6 h-6 rounded-full shrink-0"
            style={{ background: clawdColor(v.palette, v.hueShift) }}
          />
          {v.name}
        </span>
      ))}
      {views.length > NAMES_SHOWN && (
        <span className="text-2xs text-text-muted">y {views.length - NAMES_SHOWN} más</span>
      )}
    </div>
  );
}

function MoveTo({ views, onDone }: { views: AgentView[]; onDone: () => void }) {
  const { workspaces } = useWorkspaces();
  return (
    <div className="flex flex-wrap gap-4">
      {[
        ...workspaces.map((w) => ({ id: w.id as string | null, name: w.name })),
        { id: null, name: 'Ninguno' },
      ].map((w) => (
        <Button
          key={w.id ?? 'ninguno'}
          size="sm"
          onClick={() => {
            for (const v of views) assignAgent(v.key, w.id);
            onDone();
          }}
        >
          {w.name}
        </Button>
      ))}
    </div>
  );
}

/**
 * Several agents picked on the graph (Ctrl+click, Shift + box): who, and
 * what to do with all of them at once.
 */
export function GraphPickPanel({
  views,
  actions,
  onClear,
}: {
  views: AgentView[];
  actions: BoardActions;
  onClear: () => void;
}) {
  const [moving, setMoving] = useState(false);
  const hasWorkspaces = useWorkspaces().workspaces.length > 0;
  const simple = simplePermissions(views);
  const risky = views.filter((v) => v.permission).length - simple.length;
  const n = views.length;
  return (
    <aside
      className="absolute top-14 right-14 z-20 w-[min(320px,calc(100%-28px))] soft-panel p-10 flex flex-col gap-8"
      aria-label={`${n} agentes elegidos`}
    >
      <div className="flex items-center gap-6">
        <span className="text-sm font-semibold text-text">
          {n} {n === 1 ? 'elegido' : 'elegidos'}
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="ml-auto"
          onClick={onClear}
          title="Soltarlos (Esc)"
          aria-label="Soltarlos"
        >
          ×
        </Button>
      </div>
      <Names views={views} />
      <div className="flex flex-col gap-4 items-start">
        {actions.onMessageMany && (
          <Button size="sm" onClick={() => actions.onMessageMany!(views.map((v) => v.id))}>
            Mensaje a {n === 1 ? 'este' : `estos ${n}`}
          </Button>
        )}
        {actions.onAllow && simple.length > 0 && (
          <Button
            size="sm"
            variant="accent"
            onClick={() => simple.forEach((p) => actions.onAllow!(p.requestId))}
          >
            Aprobar {simple.length === 1 ? 'el pedido simple' : `los ${simple.length} simples`}
          </Button>
        )}
        {risky > 0 && (
          <span className="text-2xs text-text-muted">
            {risky === 1 ? 'Hay 1 riesgoso' : `Hay ${risky} riesgosos`}: aprobalos de a uno.
          </span>
        )}
        {hasWorkspaces && (
          <Button size="sm" onClick={() => setMoving((m) => !m)}>
            Mover a espacio
          </Button>
        )}
        {moving && <MoveTo views={views} onDone={() => setMoving(false)} />}
      </div>
      <span className="text-2xs text-text-muted">
        Ctrl+clic suma o saca uno · Shift y arrastrá para elegir varios
      </span>
    </aside>
  );
}
