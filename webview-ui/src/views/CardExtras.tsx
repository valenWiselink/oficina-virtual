import { useState } from 'react';

import { Button } from '../components/ui/Button.js';
import { NOTE_MAX_CHARS, setNote, useNote } from '../identity/agentNotes.js';
import { type Outfit, OUTFITS, setOutfit, useOutfit } from '../identity/clawdOutfit.js';
import { markMergeTold, useMergeTold } from '../identity/mergeToldStore.js';
import { playBonkSound } from '../notificationSound.js';
import { sendToAgent } from '../terminal/agentInput.js';
import type { AgentView } from './agentViews.js';
import { choiceButtons, QUICK_REPLIES } from './cardRules.js';
import { markReplySent, useSentReply } from './sentReplies.js';

/** "Dale, seguí" and friends: one tap writes it to the agent. It counts as
 *  done (onSent) only once it reached the agent's terminal; then its button
 *  keeps a ✓ until the agent reads it (sentReplies.ts). */
export function QuickReplies({ view, onSent }: { view: AgentView; onSent: () => void }) {
  const { state, tapped, send } = useAgentSend(view);
  const marked = useSentReply(view.id, view.lastRecordAt);
  return (
    <div className="flex flex-wrap items-center gap-4" onClick={(e) => e.stopPropagation()}>
      {QUICK_REPLIES.map((r) => {
        const key = `q:${r.label}`;
        return (
          <ReplyButton
            key={key}
            look="quick"
            label={r.label}
            text={r.text}
            sending={state === 'sending'}
            tapped={tapped === key}
            sent={marked === key}
            onClick={() => send(r.text, onSent, key)}
          />
        );
      })}
      {state === 'failed' && (
        <span className="text-2xs text-danger" role="status">
          No le llegó: su terminal no está conectada. Probá de nuevo.
        </span>
      )}
    </div>
  );
}

const REPLY_LOOK = {
  quick:
    'border bg-bg-dark hover:bg-btn-hover text-text text-2xs font-medium rounded-full px-8 py-2 cursor-pointer disabled:cursor-wait',
  choice:
    'max-w-full overflow-hidden text-ellipsis whitespace-nowrap border bg-active-bg hover:bg-btn-hover text-text text-2xs font-semibold rounded-full px-8 py-2 cursor-pointer disabled:cursor-default',
} as const;

/** One reply button: while a reply goes out the others dim and the one you
 *  tapped stays lit; once it reached the terminal it carries a ✓. */
function ReplyButton({
  look,
  label,
  text,
  sending,
  tapped,
  sent,
  onClick,
}: {
  look: keyof typeof REPLY_LOOK;
  label: string;
  text: string;
  sending: boolean;
  tapped: boolean;
  sent: boolean;
  onClick: () => void;
}) {
  const border = sent
    ? 'border-status-success'
    : look === 'choice'
      ? 'border-accent/40'
      : 'border-border';
  return (
    <button
      type="button"
      title={sent ? `Le llegó: «${text}»` : `Le escribe: «${text}»`}
      aria-label={sent ? `${label}: le llegó` : undefined}
      disabled={sending}
      className={`${REPLY_LOOK[look]} ${border} ${tapped ? '' : 'disabled:opacity-60'}`}
      onClick={onClick}
    >
      {sent && (
        <span className="text-status-success" aria-hidden="true">
          ✓{' '}
        </span>
      )}
      {label}
    </button>
  );
}

/**
 * Write to an agent and learn whether it really went out: the answer can
 * take a while (its terminal may be reconnecting), so the buttons wait,
 * then run `onSent` — or say it did not arrive, with a "bonk". A reply
 * with a `key` is marked as sent (sentReplies.ts) before `onSent`, which
 * may move the card.
 */
function useAgentSend(view: AgentView) {
  const [state, setState] = useState<'idle' | 'sending' | 'failed'>('idle');
  const [tapped, setTapped] = useState<string>();
  const send = (
    text: string,
    onSent: () => void,
    key?: string,
    track?: () => (sent: boolean) => void,
  ) => {
    if (state === 'sending') return;
    const settle = track?.();
    setState('sending');
    setTapped(key);
    const recordAt = view.lastRecordAt;
    void sendToAgent(view.id, text).then((ok) => {
      settle?.(ok);
      setState(ok ? 'idle' : 'failed');
      setTapped(undefined);
      if (!ok) {
        void playBonkSound();
        return;
      }
      if (key) markReplySent(view.id, key, recordAt);
      onSent();
    });
  };
  return { state, tapped, send };
}

function NotArrived() {
  return <span className="text-2xs text-danger">No le llegó: fijate en su terminal.</span>;
}

/** The options its answer offers ("1 · Solo el dropdown") and "Como
 *  recomendás": one tap writes "Andá con la 1." to the agent. `onSent`
 *  only runs when the message really went out; `track` (the chat) hears of
 *  it before it goes, and whether it arrived. */
export function ChoiceReplies({
  view,
  onSent,
  track,
}: {
  view: AgentView;
  onSent: (text: string) => void;
  track?: (text: string) => (sent: boolean) => void;
}) {
  const { state, tapped, send } = useAgentSend(view);
  const marked = useSentReply(view.id, view.lastRecordAt);
  const buttons = choiceButtons(view.choices);
  if (buttons.length === 0) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-4"
      onClick={(e) => e.stopPropagation()}
      role="group"
      aria-label="Elegí una opción"
    >
      {buttons.map((b) => {
        const key = `c:${b.key}`;
        return (
          <ReplyButton
            key={key}
            look="choice"
            label={b.label}
            text={b.text}
            sending={state === 'sending'}
            tapped={tapped === key}
            sent={marked === key}
            onClick={() => send(b.text, () => onSent(b.text), key, track && (() => track(b.text)))}
          />
        );
      })}
      {state === 'failed' && <NotArrived />}
    </div>
  );
}

/** "Avisarle": its PR got merged and nobody told it yet — one tap writes
 *  "Ya mergeé el PR #N." (only shown where it can be written to). */
export function TellMergedButton({ view }: { view: AgentView }) {
  const merged = view.mergedPr;
  const told = useMergeTold(merged?.turnId);
  const { state, send } = useAgentSend(view);
  if (!merged || merged.told || told) return null;
  const text = `Ya mergeé el PR #${merged.number}.`;
  return (
    <>
      <Button
        size="sm"
        variant="accent"
        title={`Le escribe: «${text}»`}
        disabled={state === 'sending'}
        onClick={(e) => {
          e.stopPropagation();
          send(text, () => markMergeTold(merged.turnId));
        }}
      >
        Avisarle
      </Button>
      {state === 'failed' && <NotArrived />}
    </>
  );
}

/** "Abrir": the first link of its answer that is not the PR (dev, an
 *  artifact, a release). */
export function OpenLinkButton({ url }: { url: string }) {
  return (
    <Button
      size="sm"
      title={url}
      onClick={(e) => {
        e.stopPropagation();
        window.open(url, '_blank', 'noopener');
      }}
    >
      Abrir
    </Button>
  );
}

/** Its context is nearly full: one tap sends /compact. */
export function CompactButton({ view }: { view: AgentView }) {
  return (
    <Button
      size="sm"
      title="Le manda /compact: resume la charla para liberar contexto"
      onClick={(e) => {
        e.stopPropagation();
        // If its terminal is reconnecting it waits; if it never comes back the
        // terminal itself says so.
        void sendToAgent(view.id, '/compact');
      }}
    >
      Compactar ({view.contextPct}%)
    </Button>
  );
}

/** The sticky note: shown when there is one, edited in place. */
export function AgentNote({
  view,
  editing,
  onDone,
}: {
  view: AgentView;
  editing: boolean;
  onDone: () => void;
}) {
  const note = useNote(view.key);
  const [draft, setDraft] = useState(note);
  if (editing) {
    return (
      <form
        className="flex gap-4"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          setNote(view.key, draft);
          onDone();
        }}
      >
        <input
          autoFocus
          maxLength={NOTE_MAX_CHARS}
          value={draft}
          placeholder="Qué le pediste, para qué lo abriste…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onDone()}
          className="flex-1 min-w-0 text-xs py-4 px-6 rounded-md bg-note border border-note-border text-text outline-none"
        />
        <Button size="sm" type="submit">
          Listo
        </Button>
      </form>
    );
  }
  if (!note) return null;
  return (
    <p className="m-0 text-xs text-text bg-note border border-note-border rounded-md px-6 py-3 -rotate-[0.6deg] whitespace-pre-wrap break-words">
      {note}
    </p>
  );
}

/** Pick what this Clawd wears. */
export function OutfitMenu({ view, onClose }: { view: AgentView; onClose: () => void }) {
  const current = useOutfit(view.key);
  return (
    <div
      className="absolute right-4 top-36 z-30 soft-panel p-4 flex flex-col"
      onClick={(e) => e.stopPropagation()}
      role="menu"
      aria-label="Qué se pone"
    >
      {OUTFITS.map((o) => (
        <button
          key={o.id}
          type="button"
          role="menuitemradio"
          aria-checked={current === o.id}
          className={`border-0 text-left text-xs px-8 py-4 rounded-md cursor-pointer ${
            current === o.id
              ? 'bg-active-bg text-text font-medium'
              : 'bg-transparent text-text hover:bg-btn-hover'
          }`}
          onClick={() => {
            setOutfit(view.key, o.id);
            onClose();
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** The chosen outfit drawn over the board's 32 px mug shot. */
export function OutfitOverlay({ outfit }: { outfit: Outfit }) {
  if (outfit === 'none') return null;
  return (
    <svg
      className="absolute left-0 -top-7 pointer-events-none"
      width="32"
      height="16"
      viewBox="0 0 32 16"
      aria-hidden="true"
    >
      {outfit === 'cap' && (
        <g className="outfit-cap">
          <rect x="7" y="5" width="18" height="6" rx="3" />
          <rect x="20" y="9" width="10" height="2.5" rx="1.2" />
        </g>
      )}
      {outfit === 'bow' && (
        <g className="outfit-bow">
          <path d="M16 9 L9 5 L9 13 Z" />
          <path d="M16 9 L23 5 L23 13 Z" />
          <circle cx="16" cy="9" r="2" />
        </g>
      )}
      {outfit === 'crown' && (
        <path className="outfit-crown" d="M8 13 L8 5 L12 9 L16 3 L20 9 L24 5 L24 13 Z" />
      )}
      {outfit === 'headphones' && (
        <g className="outfit-headphones">
          <path d="M5 15 Q5 3 16 3 Q27 3 27 15" fill="none" strokeWidth="2.2" />
          <rect x="2" y="11" width="5" height="5" rx="1.5" />
          <rect x="25" y="11" width="5" height="5" rx="1.5" />
        </g>
      )}
    </svg>
  );
}
