import { useState } from 'react';

import { CharacterMugShot } from '../components/CharacterMugShot.js';
import { Sparks } from '../components/Sparks.js';
import { Button } from '../components/ui/Button.js';
import { TERMINAL_FONT_FAMILY } from '../constants.js';
import { useCalmMode } from '../effects/calmMode.js';
import { useNow } from '../hooks/useNow.js';
import { useOutfit } from '../identity/clawdOutfit.js';
import { useTellMerged } from '../identity/mergeToldStore.js';
import { seenAt } from '../identity/seenStore.js';
import { ApproveButtons } from '../permissions/ApproveButtons.js';
import { describeToolInput } from '../permissions/describeToolInput.js';
import { useWritableAgents } from '../terminal/agentInput.js';
import { MoveMenu } from '../workspaces/MoveMenu.js';
import { useWorkspaces } from '../workspaces/workspaceStore.js';
import { type AgentView, KIND_COLOR, waitedFor } from './agentViews.js';
import {
  AgentNote,
  ChoiceReplies,
  CompactButton,
  OpenLinkButton,
  OutfitMenu,
  OutfitOverlay,
  QuickReplies,
  TellMergedButton,
} from './CardExtras.js';
import type { CardMotion } from './cardMotion.js';
import { isImpatient, offersCompact, offersQuickReplies } from './cardRules.js';
import { useCheer } from './celebrate.js';
import { clawdColor } from './clawdColor.js';
import { isUnread } from './unread.js';
import { effortLabel, modelShortName, usageDetail } from './usageText.js';

/** From this wait on, "hace N min" is set in bold (never in red: red means
 *  a broken terminal here). */
const LONG_WAIT_MS = 5 * 60_000;

export interface BoardActions {
  onSelect: (id: number) => void;
  onAllow?: (requestId: string) => void;
  onDeny?: (requestId: string) => void;
  onAdopt?: (id: number) => void;
  onHandOff?: (id: number) => void;
  /** Pass its latest answer straight to another agent (a drop on the graph). */
  onHandOffTo?: (fromId: number, toId: number) => void;
  /** "Mensaje a varios" with these already chosen (picked on the graph). */
  onMessageMany?: (ids: number[]) => void;
  onClose?: (id: number) => void;
  /** Name, colour, model and effort (agents/useEditAgent.tsx). */
  onEdit?: (id: number) => void;
  /** You handled what its finished turn left you ("te toca"). */
  onYourTurnDone?: (turnId: string) => void;
  /** Show its terminal (not its chat): where a permission the office no
   *  longer holds is answered. */
  onOpenTerminal?: (id: number) => void;
}

/** First line of what a held permission would run, for the inline request. */
function permissionSummary(view: AgentView): { title: string; detail?: string } | null {
  const p = view.permission;
  if (!p) return null;
  const d = describeToolInput(p.toolName, p.toolInput);
  return { title: d.title, detail: d.sections.find((s) => s.code)?.text };
}

/** One agent on the board: who it is, what it does, and what you can do with it.
 *  When you mark its "Hecho", its Clawd hops with sparks in its colour; after
 *  10 min waiting on you it fidgets. It wears what you pick, carries your
 *  sticky note, and offers one-tap replies and "Compactar" when they fit. */
export function BoardCard({
  view,
  actions,
  motion,
  highlightMember,
}: {
  view: AgentView;
  actions: BoardActions;
  motion?: CardMotion;
  /** The member you clicked on the graph: its row stands out. */
  highlightMember?: number;
}) {
  const calm = useCalmMode();
  const cheering = useCheer(view.id) && !calm;
  const now = useNow();
  const writable = useWritableAgents().has(view.id);
  const outfit = useOutfit(view.key);
  const [editingNote, setEditingNote] = useState(false);
  const [outfitOpen, setOutfitOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const hasWorkspaces = useWorkspaces().workspaces.length > 0;
  const replies = offersQuickReplies(view, writable);
  const compact = offersCompact(view, writable);
  const fidget = !calm && !cheering && isImpatient(view, now);
  const meta = [view.ticket, view.folder, view.progress && `tareas ${view.progress}`]
    .filter(Boolean)
    .join(' · ');
  const ask = permissionSummary(view);
  const color = clawdColor(view.palette, view.hueShift);
  const tellMerged = useTellMerged(view.mergedPr, writable);
  const unread = isUnread(view, seenAt(view.key));
  const opensTerminal = !!view.asksInTerminal && view.hasTerminal && !!actions.onOpenTerminal;
  const hasActions =
    (!!view.yourTurnId && !!actions.onYourTurnDone) ||
    !!view.prUrl ||
    !!view.replyLink ||
    tellMerged ||
    (!view.hasTerminal && !view.inClaudeApp && !!actions.onAdopt) ||
    opensTerminal ||
    compact;
  return (
    <article
      className={`group relative bg-bg rounded-lg pl-14 pr-8 py-8 flex flex-col gap-6 cursor-pointer transition-shadow hover:shadow-soft ${
        motion && !calm ? (motion === 'pop' ? 'anim-pop-in' : 'anim-hop') : ''
      } ${
        view.kind === 'needs'
          ? 'border-2 border-status-permission shadow-soft'
          : 'border border-border'
      }`}
      onClick={() => actions.onSelect(view.id)}
      aria-label={`${view.name}: ${view.statusText}`}
    >
      {/* The agent's colour, so a card reads as "that Clawd" at a glance. */}
      <span
        className="absolute left-5 top-8 bottom-8 w-3 rounded-full"
        style={{ background: color }}
      />
      <div className="flex gap-8 items-center">
        <span
          className={`relative shrink-0 ${cheering ? 'anim-cheer' : fidget ? 'anim-impatient' : ''}`}
          title={fidget ? 'Te espera hace rato' : undefined}
        >
          <CharacterMugShot palette={view.palette} hueShift={view.hueShift} size={32} />
          <OutfitOverlay outfit={outfit} />
          {cheering && <Sparks color={color} />}
        </span>
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <span className="flex items-center gap-6 min-w-0">
            <span className="text-sm font-semibold text-text overflow-hidden text-ellipsis whitespace-nowrap">
              {view.name}
            </span>
            {unread && (
              <span
                className="shrink-0 w-8 h-8 rounded-full bg-accent"
                role="img"
                aria-label="Sin leer"
                title="Sin leer: terminó después de la última vez que abriste su chat o su terminal"
              />
            )}
            {/* Only where the office could host it: a viewer without terminals
                would see every agent marked. */}
            {!view.hasTerminal && actions.onAdopt && (
              <span
                className="shrink-0 text-2xs text-text-muted border border-border rounded-full px-6 whitespace-nowrap"
                title={
                  view.inClaudeApp
                    ? 'Está en la app de escritorio de Claude: esa conversación se maneja desde la app, la oficina sólo la muestra'
                    : 'Corre fuera de la oficina (VS Code, otra consola): no tiene terminal acá'
                }
              >
                {view.inClaudeApp ? 'en la app de Claude' : 'afuera'}
              </span>
            )}
          </span>
          <span
            className={`text-xs flex items-start gap-5 min-w-0 ${
              view.kind === 'needs'
                ? 'text-status-permission-text font-medium'
                : view.kind === 'done'
                  ? 'text-status-success'
                  : 'text-text-muted'
            }`}
          >
            <span
              className="w-7 h-7 mt-4 rounded-full shrink-0"
              style={{ background: KIND_COLOR[view.kind] }}
            />
            {/* A "te toca" in up to three lines, whole on hover; the rest on one. */}
            <span
              className={
                view.yourTurn
                  ? 'line-clamp-3 break-words'
                  : 'overflow-hidden text-ellipsis whitespace-nowrap'
              }
              title={view.yourTurn ? view.statusText : undefined}
            >
              {view.statusText}
            </span>
          </span>
          {view.kind === 'done' && view.lastReplyHead && (
            <span
              className="text-2xs text-text-muted overflow-hidden text-ellipsis whitespace-nowrap"
              title={view.lastReplyHead}
            >
              {view.lastReplyHead}
            </span>
          )}
          {view.waitingSince !== undefined && <WaitedFor since={view.waitingSince} />}
          {meta && (
            <span className="text-2xs text-text-muted overflow-hidden text-ellipsis whitespace-nowrap">
              {meta}
            </span>
          )}
        </div>
      </div>

      <AgentNote view={view} editing={editingNote} onDone={() => setEditingNote(false)} />

      {(view.contextPct !== undefined || view.model) && <UsageRow view={view} />}
      <SupervisionLine view={view} />

      {ask && view.permission && (
        <div className="flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
          <span className="text-xs text-text">{ask.title}</span>
          {ask.detail && (
            <pre
              className="m-0 p-6 rounded-md bg-bg-dark text-text text-2xs whitespace-pre-wrap break-all overflow-auto"
              style={{ maxHeight: 120, fontFamily: TERMINAL_FONT_FAMILY }}
            >
              {ask.detail}
            </pre>
          )}
          {actions.onAllow && actions.onDeny && (
            <ApproveButtons
              permission={view.permission}
              onAllow={actions.onAllow}
              onDeny={actions.onDeny}
            />
          )}
        </div>
      )}

      {view.subagents.length > 0 && (
        <ul className="m-0 p-0 list-none flex flex-col gap-1 border-l-2 border-border pl-6">
          {view.subagents.map((s) => (
            <li
              key={s.id}
              className={`text-2xs text-text-muted flex items-center gap-4 min-w-0 rounded-sm ${
                s.id === highlightMember ? 'bg-active-bg -ml-4 pl-4 font-semibold' : ''
              }`}
              aria-current={s.id === highlightMember ? 'true' : undefined}
            >
              <span
                className="w-5 h-5 rounded-full shrink-0"
                style={{ background: KIND_COLOR[s.kind] }}
              />
              <span className="text-text shrink-0">{s.label}</span>
              <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                {s.statusText}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* What it asks of you stays in sight; the rest shows on hover. */}
      {replies && (
        <ChoiceReplies
          view={view}
          onSent={() => view.yourTurnId && actions.onYourTurnDone?.(view.yourTurnId)}
        />
      )}
      {replies && (
        <QuickReplies
          view={view}
          onSent={() => view.yourTurnId && actions.onYourTurnDone?.(view.yourTurnId)}
        />
      )}
      {hasActions && (
        <div className="flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
          {opensTerminal && (
            <Button
              size="sm"
              variant="accent"
              title="La oficina ya no puede contestarlo: contestale en su terminal"
              onClick={() => actions.onOpenTerminal!(view.id)}
            >
              Abrir terminal
            </Button>
          )}
          {view.yourTurnId && actions.onYourTurnDone && (
            <Button
              size="sm"
              variant="accent"
              title="Ya lo hice: sacarlo de «Te necesita»"
              onClick={() => actions.onYourTurnDone!(view.yourTurnId!)}
            >
              Hecho
            </Button>
          )}
          {tellMerged && <TellMergedButton view={view} />}
          {view.prUrl && (
            <Button
              size="sm"
              title={view.prUrl}
              onClick={() => window.open(view.prUrl, '_blank', 'noopener')}
            >
              Abrir PR
            </Button>
          )}
          {view.replyLink && <OpenLinkButton url={view.replyLink} />}
          {compact && <CompactButton view={view} />}
          {!view.hasTerminal && !view.inClaudeApp && actions.onAdopt && (
            <Button
              size="sm"
              title="Traer a la oficina (para escribirle desde acá)"
              onClick={() => actions.onAdopt!(view.id)}
            >
              Traer
            </Button>
          )}
        </div>
      )}
      <span
        className="absolute right-4 top-4 flex gap-1 rounded-lg bg-bg opacity-0 group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        {hasWorkspaces && (
          <CardIcon
            icon="drive_file_move"
            title="Mover a otro espacio"
            onClick={() => {
              setOutfitOpen(false);
              setMoveOpen((open) => !open);
            }}
          />
        )}
        {actions.onEdit && (
          <CardIcon
            icon="edit"
            title="Editar (nombre, color, modelo)"
            onClick={() => actions.onEdit!(view.id)}
          />
        )}
        <CardIcon icon="sticky_note_2" title="Nota" onClick={() => setEditingNote(true)} />
        <CardIcon
          icon="checkroom"
          title="Qué se pone"
          onClick={() => {
            setMoveOpen(false);
            setOutfitOpen((open) => !open);
          }}
        />
        {actions.onHandOff && (
          <CardIcon
            icon="forward"
            title="Pasar su última respuesta a otro agente"
            onClick={() => actions.onHandOff!(view.id)}
          />
        )}
        {actions.onClose && (
          <CardIcon icon="close" title="Cerrar agente" onClick={() => actions.onClose!(view.id)} />
        )}
      </span>
      {outfitOpen && <OutfitMenu view={view} onClose={() => setOutfitOpen(false)} />}
      {moveOpen && <MoveMenu view={view} onClose={() => setMoveOpen(false)} />}
    </article>
  );
}

function WaitedFor({ since }: { since: number }) {
  const now = useNow();
  return (
    <span
      className={`text-2xs text-status-permission-text ${now - since >= LONG_WAIT_MS ? 'font-bold' : ''}`}
    >
      Te espera {waitedFor(since, now)}
    </span>
  );
}

function CardIcon({ icon, title, onClick }: { icon: string; title: string; onClick: () => void }) {
  return (
    <Button size="icon" variant="ghost" title={title} aria-label={title} onClick={onClick}>
      <span className="material-symbols-sharp text-sm" aria-hidden="true">
        {icon}
      </span>
    </Button>
  );
}

/** Model, context gauge and its percentage on one line; the tooltip adds the
 *  window and what the session spent. */
function UsageRow({ view }: { view: AgentView }) {
  const pct = view.contextPct;
  const detail = usageDetail(view);
  return (
    <div
      className="flex items-center gap-6 text-2xs text-text-muted"
      title={detail}
      aria-label={detail}
    >
      {view.model && (
        <span className="shrink-0 font-semibold">
          {modelShortName(view.model)}
          {effortLabel(view.effort) && (
            <span className="font-normal"> · {effortLabel(view.effort)}</span>
          )}
        </span>
      )}
      {pct !== undefined && (
        <>
          <span className="flex-1 h-4 rounded-full overflow-hidden bg-bg-thumb">
            <span
              className="block h-full rounded-full"
              style={{
                width: `${Math.min(100, pct)}%`,
                // Grey, red only near the limit: amber would claim it needs you.
                background: pct >= 90 ? 'var(--color-danger)' : 'var(--color-text-muted)',
              }}
            />
          </span>
          <span className={`shrink-0 tabular-nums ${pct >= 90 ? 'text-danger font-semibold' : ''}`}>
            {pct}%
          </span>
        </>
      )}
    </div>
  );
}

/** "Supervisa «Wiselink» · 4" on a supervisor, "Lo supervisa «Jefa»" on its team. */
function SupervisionLine({ view }: { view: AgentView }) {
  const scope = view.supervision;
  let text: string | undefined;
  if (scope) {
    // The supervisor of everyone (Jarvis) also opens and closes them: it directs.
    const what =
      scope.kind === 'workspace'
        ? `Supervisa «${scope.name ?? 'su espacio'}»`
        : scope.kind === 'all'
          ? 'Dirige a todos'
          : 'Supervisa a sus elegidos';
    text = `${what} · ${view.teamSize} ${view.teamSize === 1 ? 'agente' : 'agentes'}`;
  } else if (view.supervisorNames.length > 0) {
    text = `Lo supervisa ${view.supervisorNames.map((n) => `«${n}»`).join(' y ')}`;
  }
  if (!text) return null;
  return (
    <div className="flex items-center gap-4 text-2xs text-text-muted">
      <span className="material-symbols-sharp text-xs" aria-hidden="true">
        supervisor_account
      </span>
      {text}
    </div>
  );
}
