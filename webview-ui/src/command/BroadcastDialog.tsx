import { useEffect, useState } from 'react';

import { Button } from '../components/ui/Button.js';
import { Modal } from '../components/ui/Modal.js';
import { sendToAgent, useWritableAgents } from '../terminal/agentInput.js';
import type { AgentView } from '../views/agentViews.js';
import { groupByFolder } from './broadcast.js';

/** How long "Mandado a N agentes" shows before the dialog closes. */
const SENT_SHOWN_MS = 1400;

interface BroadcastDialogProps {
  open: boolean;
  onClose: () => void;
  views: AgentView[];
}

/**
 * "Mensaje a varios agentes": one message, typed once, sent to each chosen
 * agent as if written in its terminal. Grouped by folder, with "todos" per
 * folder; an agent without a terminal in this office cannot be chosen.
 */
export function BroadcastDialog({ open, onClose, views }: BroadcastDialogProps) {
  return (
    <Modal isOpen={open} onClose={onClose} title="Mensaje a varios agentes" width={520} zIndex={60}>
      {open && <BroadcastBody views={views} onClose={onClose} />}
    </Modal>
  );
}

function BroadcastBody({ views, onClose }: { views: AgentView[]; onClose: () => void }) {
  const writable = useWritableAgents();
  const [text, setText] = useState('');
  const [chosen, setChosen] = useState<ReadonlySet<number>>(() => new Set());
  const [sentTo, setSentTo] = useState<number | null>(null);
  const groups = groupByFolder(views);

  useEffect(() => {
    if (sentTo === null) return;
    const timer = setTimeout(onClose, SENT_SHOWN_MS);
    return () => clearTimeout(timer);
  }, [sentTo, onClose]);

  const toggle = (ids: number[], on: boolean) => {
    const next = new Set(chosen);
    for (const id of ids) {
      if (!writable.has(id)) continue;
      if (on) next.add(id);
      else next.delete(id);
    }
    setChosen(next);
  };
  const send = () => {
    const message = text.trim();
    if (!message) return;
    let n = 0;
    for (const id of chosen) if (sendToAgent(id, message)) n++;
    setSentTo(n);
  };

  if (sentTo !== null) {
    return (
      <p className="m-0 px-8 py-16 text-sm text-text text-center" role="status">
        Mandado a {sentTo === 1 ? '1 agente' : `${sentTo} agentes`}.
      </p>
    );
  }
  const allIds = views.filter((v) => writable.has(v.id)).map((v) => v.id);
  return (
    <form
      className="flex flex-col gap-12 px-8 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <textarea
        autoFocus
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Por ejemplo: hagan pull de develop antes de seguir"
        aria-label="Mensaje"
        className="text-sm py-7 px-10 bg-bg border border-border rounded-lg text-text outline-none resize-y placeholder:text-text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
      <AgentChecklist
        groups={groups}
        writable={writable}
        chosen={chosen}
        allIds={allIds}
        onToggle={toggle}
      />
      <div className="flex gap-8 justify-end pt-4">
        <Button type="button" variant="ghost" size="md" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          type="submit"
          variant={text.trim() && chosen.size > 0 ? 'accent' : 'disabled'}
          size="md"
          disabled={!text.trim() || chosen.size === 0}
        >
          Mandar{chosen.size > 0 ? ` a ${chosen.size}` : ''}
        </Button>
      </div>
    </form>
  );
}

function AgentChecklist({
  groups,
  writable,
  chosen,
  allIds,
  onToggle,
}: {
  groups: Array<{ folder: string; agents: AgentView[] }>;
  writable: ReadonlySet<number>;
  chosen: ReadonlySet<number>;
  allIds: number[];
  onToggle: (ids: number[], on: boolean) => void;
}) {
  const all = allIds.length > 0 && allIds.every((id) => chosen.has(id));
  return (
    <div className="flex flex-col gap-8 max-h-[40vh] overflow-y-auto thin-scrollbar">
      <CheckRow
        label="Todos"
        bold
        checked={all}
        disabled={allIds.length === 0}
        onChange={(on) => onToggle(allIds, on)}
      />
      {groups.map((g) => {
        const ids = g.agents.filter((a) => writable.has(a.id)).map((a) => a.id);
        return (
          <fieldset key={g.folder} className="m-0 p-0 border-0 flex flex-col gap-2">
            <CheckRow
              label={g.folder}
              bold
              hint={ids.length > 1 ? 'todos' : undefined}
              checked={ids.length > 0 && ids.every((id) => chosen.has(id))}
              disabled={ids.length === 0}
              onChange={(on) => onToggle(ids, on)}
            />
            {g.agents.map((a) => (
              <CheckRow
                key={a.id}
                indent
                label={a.name}
                hint={writable.has(a.id) ? a.statusText : 'no tiene terminal acá'}
                checked={chosen.has(a.id)}
                disabled={!writable.has(a.id)}
                onChange={(on) => onToggle([a.id], on)}
              />
            ))}
          </fieldset>
        );
      })}
    </div>
  );
}

function CheckRow(props: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  bold?: boolean;
  indent?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label
      className={`flex items-center gap-8 text-sm ${props.indent ? 'pl-22' : ''} ${
        props.disabled ? 'opacity-50 cursor-default' : 'cursor-pointer'
      }`}
    >
      <input
        type="checkbox"
        className="accent-accent"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span className={`text-text truncate ${props.bold ? 'font-semibold' : ''}`}>
        {props.label}
      </span>
      {props.hint && <span className="text-2xs text-text-muted truncate">{props.hint}</span>}
    </label>
  );
}
