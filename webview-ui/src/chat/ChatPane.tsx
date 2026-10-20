import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { ChatItem } from '../../../core/src/messages.js';
import { Button } from '../components/ui/Button.js';
import { ApproveButtons } from '../permissions/ApproveButtons.js';
import type { AgentView } from '../views/agentViews.js';
import type { BoardActions } from '../views/BoardCard.js';
import { clawdColor } from '../views/clawdColor.js';
import { useAgentChat } from './chatStore.js';
import { Markdown } from './Markdown.js';
import { PathAgentContext } from './pathAgent.js';

/** A run of tool notes collapses into one line. */
type Row = { kind: 'msg'; item: ChatItem } | { kind: 'tools'; key: string; items: ChatItem[] };

function rowsOf(items: ChatItem[]): Row[] {
  const rows: Row[] = [];
  for (const item of items) {
    const last = rows[rows.length - 1];
    if (item.role === 'tool' && last?.kind === 'tools') last.items.push(item);
    else if (item.role === 'tool') rows.push({ kind: 'tools', key: item.id, items: [item] });
    else rows.push({ kind: 'msg', item });
  }
  return rows;
}

const hm = (at?: number) => {
  if (at === undefined) return '';
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * An agent's conversation as a chat: your messages on the right in a warm
 * bubble, its answers on the left formatted, its tools as small foldable
 * lines, what it is doing now at the bottom, and a box to write to it (sent
 * to its terminal exactly as if typed there).
 */
export function ChatPane({
  view,
  actions,
  onSend,
  onShowTerminal,
}: {
  view: AgentView;
  actions: BoardActions;
  /** Type the text into the agent's terminal and press Enter. */
  onSend: (text: string) => void;
  onShowTerminal: () => void;
}) {
  const { items, failed, retry } = useAgentChat(view.id);
  const scroller = useRef<HTMLDivElement>(null);
  const pinnedToEnd = useRef(true);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && pinnedToEnd.current) el.scrollTop = el.scrollHeight;
  }, [items, view.statusText]);

  const color = clawdColor(view.palette, view.hueShift);
  return (
    // -inset-4: cover the dark gap the terminal keeps around itself.
    <div className="absolute -inset-4 flex flex-col bg-bg-dark pointer-events-auto">
      <div
        ref={scroller}
        className="flex-1 min-h-0 overflow-y-auto px-12 py-12 flex flex-col gap-10"
        onScroll={(e) => {
          const el = e.currentTarget;
          pinnedToEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {items === null && !failed && (
          <p className="m-auto text-xs text-text-muted">Cargando la conversación…</p>
        )}
        {failed && (
          <div className="m-auto flex flex-col items-center gap-6 text-center max-w-[280px]">
            <p className="m-0 text-xs text-text-muted">
              No llegó la conversación. Si la oficina se actualizó hace poco, falta reiniciarla (el
              servidor que corre todavía no sabe mandarla).
            </p>
            <div className="flex gap-4">
              <Button size="sm" onClick={retry}>
                Reintentar
              </Button>
              <Button size="sm" variant="ghost" onClick={onShowTerminal}>
                Ver la terminal
              </Button>
            </div>
          </div>
        )}
        {/* A fresh session may be waiting in the terminal (the first run
            asks for a theme and a login there), which the chat cannot show. */}
        {items?.length === 0 && (
          <div className="m-auto flex flex-col items-center gap-8 max-w-260 text-center">
            <p className="m-0 text-sm text-text">Todavía no hay mensajes.</p>
            <p className="m-0 text-xs text-text-muted leading-relaxed">
              Si recién arrancó, puede estar esperándote en la terminal: la primera vez Claude te
              pide elegir unas opciones e iniciar sesión.
            </p>
            <Button size="sm" onClick={onShowTerminal}>
              Ver la terminal
            </Button>
          </div>
        )}
        {items &&
          rowsOf(items).map((row) =>
            row.kind === 'tools' ? (
              <ToolLines key={row.key} items={row.items} />
            ) : row.item.role === 'user' ? (
              <UserBubble key={row.item.id} item={row.item} />
            ) : (
              <AgentMessage key={row.item.id} item={row.item} color={color} agentId={view.id} />
            ),
          )}
        <AgentNow view={view} actions={actions} onShowTerminal={onShowTerminal} />
      </div>
      <Composer view={view} onSend={onSend} />
    </div>
  );
}

function UserBubble({ item }: { item: ChatItem }) {
  return (
    <div className="self-end max-w-[85%] flex flex-col items-end gap-2">
      <div className="bg-active-bg text-text text-sm rounded-2xl rounded-br-sm px-10 py-6 whitespace-pre-wrap break-words">
        {item.text}
      </div>
      <span className="text-2xs text-text-muted">Vos · {hm(item.at)}</span>
    </div>
  );
}

function AgentMessage({
  item,
  color,
  agentId,
}: {
  item: ChatItem;
  color: string;
  agentId: number;
}) {
  return (
    <div className="self-start max-w-[92%] flex flex-col gap-2">
      <span className="text-2xs text-text-muted flex items-center gap-4">
        <span className="w-6 h-6 rounded-full" style={{ background: color }} />
        Claude · {hm(item.at)}
      </span>
      <div className="bg-bg text-text border border-border rounded-2xl rounded-tl-sm px-10 py-8">
        <PathAgentContext.Provider value={agentId}>
          <Markdown text={item.text} />
        </PathAgentContext.Provider>
      </div>
    </div>
  );
}

function ToolLines({ items }: { items: ChatItem[] }) {
  const [open, setOpen] = useState(false);
  const head = items
    .slice(0, 2)
    .map((i) => i.text)
    .join(' · ');
  return (
    <div className="self-start max-w-[92%] pl-10">
      <button
        type="button"
        className="bg-transparent border-0 p-0 cursor-pointer text-2xs text-text-muted text-left hover:text-text"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? '▾' : '▸'} {head}
        {items.length > 2 && ` (+${items.length - 2})`}
      </button>
      {open && (
        <ul className="m-0 mt-2 pl-12 list-none flex flex-col gap-1">
          {items.map((i) => (
            <li key={i.id} className="text-2xs text-text-muted">
              {i.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** What the agent is doing right now, under the last message. */
function AgentNow({
  view,
  actions,
  onShowTerminal,
}: {
  view: AgentView;
  actions: BoardActions;
  onShowTerminal: () => void;
}) {
  if (view.permission && actions.onAllow && actions.onDeny) {
    return (
      <div className="self-stretch soft-panel border-status-permission p-8 flex flex-col gap-6">
        <span className="text-xs font-semibold text-status-permission-text">
          Necesita tu permiso
        </span>
        <ApproveButtons
          permission={view.permission}
          onAllow={actions.onAllow}
          onDeny={actions.onDeny}
        />
      </div>
    );
  }
  if (view.kind === 'needs' && view.blocking) {
    return (
      <div className="self-stretch soft-panel p-8 flex items-center justify-between gap-8">
        <span className="text-xs text-status-permission-text font-semibold">
          Te hizo una pregunta con opciones: se contesta en la terminal.
        </span>
        <Button size="sm" variant="accent" onClick={onShowTerminal}>
          Ir a la terminal
        </Button>
      </div>
    );
  }
  const busy =
    view.kind === 'work' ||
    view.kind === 'think' ||
    view.kind === 'meet' ||
    view.kind === 'research';
  if (!busy) return null;
  return (
    <div className="self-start text-2xs text-text-muted flex items-center gap-6 pl-10">
      <span className="soft-pulse">●</span>
      {view.statusText}
    </div>
  );
}

function Composer({ view, onSend }: { view: AgentView; onSend: (text: string) => void }) {
  const [text, setText] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  // Typing while its terminal shows a dialog would answer the dialog instead.
  const blocked = !!view.permission || (view.kind === 'needs' && view.blocking);
  useEffect(() => {
    const el = box.current;
    // Hidden (the panel closed) it measures 0: keep the CSS height until shown.
    if (!el || el.offsetParent === null) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    el.style.overflowY = el.scrollHeight > 140 ? 'auto' : 'hidden';
  }, [text]);
  const send = () => {
    const t = text.trim();
    if (!t || blocked) return;
    onSend(t);
    setText('');
  };
  return (
    <div className="border-t border-border bg-bg px-10 py-8 flex items-end gap-6">
      <textarea
        ref={box}
        rows={1}
        value={text}
        disabled={blocked}
        placeholder={blocked ? 'Primero contestá lo que te pidió' : `Escribile a ${view.name}…`}
        aria-label={`Mensaje para ${view.name}`}
        className="flex-1 min-h-34 resize-none text-sm bg-bg text-text border border-border rounded-lg px-10 py-7 outline-none placeholder:text-text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/20"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
      />
      <Button variant="accent" size="md" disabled={blocked || !text.trim()} onClick={send}>
        Enviar
      </Button>
    </div>
  );
}
