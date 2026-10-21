import type { RefObject } from 'react';

import type { PermissionPending } from '../../../core/src/messages.js';
import { Button } from '../components/ui/Button.js';
import { TERMINAL_FONT_FAMILY } from '../constants.js';
import { useRiskyApprove } from '../permissions/useRiskyApprove.js';
import type { AgentView } from './agentViews.js';
import type { BoardActions } from './BoardCard.js';

/** What the pill asks, whole: the command a permission would run, the tool
 *  otherwise, or the "te toca". */
function askText(view: AgentView): string {
  const p = view.permission;
  if (!p) return view.yourTurn ?? view.statusText;
  const command = (p.toolInput as Record<string, unknown>).command;
  return typeof command === 'string' ? command : p.toolName;
}

/** Aprobar · Rechazar for a held permission: a risky one says why and asks
 *  for a second click (the same rule as its card, useRiskyApprove). */
function PermissionButtons({
  permission,
  onAllow,
  onDeny,
}: {
  permission: PermissionPending;
  onAllow: (requestId: string) => void;
  onDeny: (requestId: string) => void;
}) {
  const { risk, armed, approve } = useRiskyApprove(permission, onAllow);
  return (
    <>
      {risk && (
        <span className="basis-full text-2xs font-semibold text-danger">
          Riesgoso: {risk}
          {armed ? '. Tocá «Confirmar» para aprobarlo' : ''}
        </span>
      )}
      <Button
        size="sm"
        variant="accent"
        className={armed ? 'bg-danger! border-danger!' : ''}
        onClick={approve}
      >
        {armed ? 'Confirmar' : 'Aprobar'}
      </Button>
      <Button size="sm" onClick={() => onDeny(permission.requestId)}>
        Rechazar
      </Button>
    </>
  );
}

/** «Hecho · Abrir PR» for what a finished turn left you. */
function YourTurnButtons({
  view,
  actions,
  onClose,
}: {
  view: AgentView;
  actions: BoardActions;
  onClose: () => void;
}) {
  return (
    <>
      {view.yourTurnId && actions.onYourTurnDone && (
        <Button
          size="sm"
          variant="accent"
          title="Ya lo hice: sacarlo de «Te necesita»"
          onClick={() => {
            actions.onYourTurnDone!(view.yourTurnId!);
            onClose();
          }}
        >
          Hecho
        </Button>
      )}
      {view.prUrl && (
        <Button
          size="sm"
          title={view.prUrl}
          onClick={() => window.open(view.prUrl, '_blank', 'noopener')}
        >
          Abrir PR
        </Button>
      )}
    </>
  );
}

/**
 * The amber request pill on an agent's line to "Vos", grown into what you can
 * do with it: «Aprobar · Rechazar · Ver» for a permission, «Hecho · Abrir PR ·
 * Ver» for a "te toca". GraphView places it over the pill every frame
 * (`boxRef`) and keeps it hidden until it knows where.
 */
export function GraphPillActions({
  view,
  actions,
  boxRef,
  onOpen,
  onClose,
}: {
  view: AgentView;
  actions: BoardActions;
  boxRef: RefObject<HTMLDivElement | null>;
  /** "Ver": select it and open its terminal. */
  onOpen: () => void;
  onClose: () => void;
}) {
  const p = view.permission;
  const { onAllow, onDeny } = actions;
  return (
    <div
      ref={boxRef}
      role="group"
      aria-label={`Lo que pide ${view.name}`}
      className="absolute left-0 top-0 z-[70] w-[300px] rounded-lg border border-status-permission bg-status-permission-bg px-8 py-6 flex flex-col gap-6 shadow-soft"
      style={{ visibility: 'hidden' }}
    >
      <span
        className="text-2xs text-status-permission-text break-all line-clamp-3"
        style={{ fontFamily: p ? TERMINAL_FONT_FAMILY : undefined }}
      >
        {askText(view)}
      </span>
      <div className="flex items-center gap-4 flex-wrap">
        {p && onAllow && onDeny ? (
          <PermissionButtons
            permission={p}
            onAllow={(id) => {
              onAllow(id);
              onClose();
            }}
            onDeny={(id) => {
              onDeny(id);
              onClose();
            }}
          />
        ) : (
          !p && <YourTurnButtons view={view} actions={actions} onClose={onClose} />
        )}
        <Button size="sm" variant="ghost" title="Elegirlo y abrir su terminal" onClick={onOpen}>
          Ver
        </Button>
      </div>
    </div>
  );
}
