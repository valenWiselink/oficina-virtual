import { useState } from 'react';

import { Button } from '../components/ui/Button.js';
import { NOTE_MAX_CHARS, setNote, useNote } from '../identity/agentNotes.js';
import { type Outfit, OUTFITS, setOutfit, useOutfit } from '../identity/clawdOutfit.js';
import { sendToAgent } from '../terminal/agentInput.js';
import type { AgentView } from './agentViews.js';
import { QUICK_REPLIES } from './cardRules.js';

/** "Dale, seguí" and friends: one tap writes it to the agent. */
export function QuickReplies({ view, onSent }: { view: AgentView; onSent: () => void }) {
  return (
    <div className="flex flex-wrap gap-4" onClick={(e) => e.stopPropagation()}>
      {QUICK_REPLIES.map((r) => (
        <button
          key={r.label}
          type="button"
          title={`Le escribe: «${r.text}»`}
          className="border border-border bg-bg-dark hover:bg-btn-hover text-text text-2xs font-medium rounded-full px-8 py-2 cursor-pointer"
          onClick={() => {
            if (sendToAgent(view.id, r.text)) onSent();
          }}
        >
          {r.label}
        </button>
      ))}
    </div>
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
        sendToAgent(view.id, '/compact');
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
