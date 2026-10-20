import { useState } from 'react';

import type { PermissionPending } from '../../../core/src/messages.js';
import { Button } from '../components/ui/Button.js';
import { TERMINAL_FONT_FAMILY } from '../constants.js';
import { describeToolInput } from './describeToolInput.js';
import { useRiskyApprove } from './useRiskyApprove.js';

interface PermissionCardsProps {
  cards: PermissionPending[];
  describeAgent: (card: PermissionPending) => string;
  onAllow: (requestId: string) => void;
  onDeny: (requestId: string, message?: string) => void;
}

/**
 * Stack of approval cards, top-left beside the zoom buttons (the terminal
 * drawer opens on the right, and a card over it hid the very terminal it is
 * about). Each card shows the exact tool input before the buttons — the user
 * approves what they read, never a summary. The same request stays answerable
 * in the agent's terminal; whichever answers first wins and the card goes.
 */
export function PermissionCards({ cards, describeAgent, onAllow, onDeny }: PermissionCardsProps) {
  if (cards.length === 0) return null;
  return (
    <div
      className="fixed top-8 left-56 flex flex-col gap-8 overflow-y-auto pointer-events-none"
      style={{
        zIndex: 60,
        width: 'min(460px, calc(100vw - 72px))',
        maxHeight: 'calc(100% - 16px)',
      }}
      aria-live="polite"
    >
      {cards.map((card) => (
        <PermissionCard
          key={card.requestId}
          card={card}
          agentLabel={describeAgent(card)}
          onAllow={onAllow}
          onDeny={onDeny}
        />
      ))}
    </div>
  );
}

interface PermissionCardProps {
  card: PermissionPending;
  agentLabel: string;
  onAllow: (requestId: string) => void;
  onDeny: (requestId: string, message?: string) => void;
}

function PermissionCard({ card, agentLabel, onAllow, onDeny }: PermissionCardProps) {
  const [reason, setReason] = useState('');
  const [askingReason, setAskingReason] = useState(false);
  const { title, sections } = describeToolInput(card.toolName, card.toolInput);
  const { risk, armed, approve } = useRiskyApprove(card, onAllow);

  return (
    <section
      className={`pointer-events-auto bg-bg border-2 rounded-xl shadow-soft p-10 flex flex-col gap-6 ${
        risk ? 'border-danger' : 'border-status-permission'
      }`}
      aria-label={`Permiso para ${agentLabel}`}
    >
      <header className="flex flex-col gap-2">
        <span className="text-status-permission-text text-xs font-semibold">{agentLabel}</span>
        <span className="text-text text-base font-semibold">{title}</span>
        {risk && <span className="text-danger text-xs font-semibold">Riesgoso: {risk}</span>}
      </header>

      {sections.map((s) => (
        <div key={s.label} className="flex flex-col gap-2">
          <span className="text-text-muted text-xs">{s.label}</span>
          {s.code ? (
            <pre
              className="m-0 p-6 rounded-md bg-bg-dark text-text text-xs overflow-auto whitespace-pre-wrap break-all"
              // Exact command text: monospace like the terminal content, so
              // spacing and quoting read as they will run.
              style={{ maxHeight: 240, fontFamily: TERMINAL_FONT_FAMILY }}
            >
              {s.text}
            </pre>
          ) : (
            <span className="text-text text-sm">{s.text}</span>
          )}
        </div>
      ))}

      {askingReason && (
        <input
          autoFocus
          className="bg-bg-dark text-text border border-border rounded-md p-6 text-sm"
          placeholder="Qué querés que haga en cambio (opcional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onDeny(card.requestId, reason.trim() || undefined);
          }}
        />
      )}

      <div className="flex gap-6 justify-end">
        {askingReason ? (
          <Button
            variant="default"
            size="md"
            onClick={() => onDeny(card.requestId, reason.trim() || undefined)}
          >
            Rechazar
          </Button>
        ) : (
          <Button variant="default" size="md" onClick={() => setAskingReason(true)}>
            Rechazar…
          </Button>
        )}
        <Button
          variant="accent"
          size="md"
          className={armed ? 'bg-danger! border-danger!' : ''}
          onClick={approve}
        >
          {armed ? 'Confirmar' : 'Aprobar'}
        </Button>
      </div>
      <span className="text-text-muted text-xs">
        También podés contestarlo en la terminal: vale el primero que conteste.
      </span>
    </section>
  );
}
