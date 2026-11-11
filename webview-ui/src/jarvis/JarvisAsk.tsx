import { useState } from 'react';

import { Button } from '../components/ui/Button.js';
import { ApproveButtons } from '../permissions/ApproveButtons.js';
import { describeToolInput } from '../permissions/describeToolInput.js';
import type { AgentView } from '../views/agentViews.js';
import type { BoardActions } from '../views/BoardCard.js';
import { ChoiceReplies } from '../views/CardExtras.js';
import {
  askedLine,
  type AskedPermission,
  jarvisLine,
  visorContext,
  visorKey,
} from './jarvisRules.js';

/**
 * What Jarvis waits on you for, where it never covers what you write (asked
 * 2026-11-11: the visor in the middle «me tapa todo, no puedo seguir
 * escribiendo»): a strip above its box in the chat (`docked`), or a small
 * card beside its round button while the chat is closed (`corner`). No
 * dimming, no focus taken, no Esc of its own. «Después» puts it away until
 * the next thing it asks; it stays in «Ahora» either way.
 * Another agent's permission it asks you about comes with Aprobar and
 * Rechazar; its «Te toca:» with Hecho (and its choices, in the corner — the
 * chat already shows them under its answer).
 */
export function JarvisAsk({
  jarvis,
  asked,
  actions,
  variant,
  onWrite,
  permissionsOnly = false,
}: {
  jarvis: AgentView | undefined;
  asked?: AskedPermission;
  actions: BoardActions;
  variant: 'docked' | 'corner';
  /** «Escribirle»: open its chat to write (corner only). */
  onWrite?: () => void;
  /** Its «Te toca:» shows elsewhere (a card): only permissions here. */
  permissionsOnly?: boolean;
}) {
  const key = visorKey(jarvis, asked);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  if (!jarvis || key === undefined || dismissed.has(key)) return null;
  const dismiss = () => setDismissed((d) => new Set(d).add(key));
  const ask = asked && key === `pide:${asked.permission.requestId}` ? asked : undefined;
  const permission = ask?.permission ?? jarvis.permission;
  if (permissionsOnly && !permission) return null;
  const command = permission
    ? describeToolInput(permission.toolName, permission.toolInput).sections[0]
    : undefined;
  const line = ask ? askedLine(ask) : jarvisLine(jarvis);
  const context = permission ? undefined : visorContext(jarvis.lastReplyHead, line);
  const turnId = jarvis.yourTurnId;
  const corner = variant === 'corner';
  return (
    <section
      aria-label="Jarvis te pide"
      className={`flex flex-col gap-6 rounded-lg border border-jarvis bg-bg px-10 py-8 ${
        corner ? 'soft-panel shadow-soft' : 'mx-10 mb-6'
      }`}
    >
      <div className="flex items-baseline gap-6">
        <span className="text-2xs font-bold tracking-[0.12em] text-jarvis shrink-0">
          JARVIS TE PIDE
        </span>
        {context && <span className="text-2xs text-text-muted truncate">{context}</span>}
      </div>
      <p
        className="m-0 text-sm leading-snug text-text line-clamp-3 whitespace-pre-line"
        title={line}
      >
        {line}
      </p>
      {command && (
        <pre className="m-0 max-h-80 overflow-auto text-left text-2xs bg-bg-dark border border-border rounded-md px-8 py-6 whitespace-pre-wrap break-all">
          {command.text}
        </pre>
      )}
      <div className="flex flex-wrap items-center gap-6">
        {permission && actions.onAllow && actions.onDeny ? (
          <ApproveButtons
            permission={permission}
            onAllow={actions.onAllow}
            onDeny={actions.onDeny}
          />
        ) : (
          <>
            {corner && (
              <ChoiceReplies
                view={jarvis}
                onSent={() => {
                  if (turnId) actions.onYourTurnDone?.(turnId);
                }}
              />
            )}
            {turnId && actions.onYourTurnDone && (
              <Button size="sm" onClick={() => actions.onYourTurnDone?.(turnId)}>
                Hecho
              </Button>
            )}
          </>
        )}
        {corner && onWrite && (
          <Button size="sm" onClick={onWrite}>
            Escribirle
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={dismiss}>
          Después
        </Button>
      </div>
    </section>
  );
}
