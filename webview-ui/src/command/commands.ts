import type { AgentView } from '../views/agentViews.js';

/** One line of the quick palette (Ctrl+K). */
export interface PaletteCommand {
  id: string;
  label: string;
  /** Second line, muted (an agent's status). */
  hint?: string;
  /** Material Symbols icon name. */
  icon: string;
  /** Extra words it also answers to ("terminal", "pr"…). */
  keywords?: string;
  run: () => void;
}

export interface PaletteActions {
  onOpenAgent: (id: number) => void;
  onNewAgent: () => void;
  onSetView: (view: 'tablero' | 'grafo') => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
  onBroadcast: () => void;
  onToggleFocus: () => void;
  onOpenPrs: () => void;
}

/**
 * Every command: the agents first (whoever needs you on top, then by name),
 * then the office's own actions.
 */
export function buildCommands(
  views: readonly AgentView[],
  actions: PaletteActions,
  focused: boolean,
  /** The workspace an agent is in (its name joins the hint and the search). */
  spaceOf: (view: AgentView) => string | undefined = () => undefined,
): PaletteCommand[] {
  const agents = [...views]
    .sort(
      (a, b) =>
        (a.kind === 'needs' ? 0 : 1) - (b.kind === 'needs' ? 0 : 1) || a.name.localeCompare(b.name),
    )
    .map<PaletteCommand>((v) => ({
      id: `agente-${v.id}`,
      label: `Ir a ${v.name}`,
      hint: [v.statusText, spaceOf(v)].filter(Boolean).join(' · '),
      icon: v.kind === 'needs' ? 'priority_high' : 'smart_toy',
      keywords: [v.folder, v.ticket, v.branch, spaceOf(v), 'agente terminal']
        .filter(Boolean)
        .join(' '),
      run: () => actions.onOpenAgent(v.id),
    }));
  const office: PaletteCommand[] = [
    {
      id: 'nuevo',
      label: 'Nuevo agente',
      icon: 'add',
      keywords: 'crear lanzar',
      run: actions.onNewAgent,
    },
    {
      id: 'tablero',
      label: 'Ver tablero',
      icon: 'view_kanban',
      run: () => actions.onSetView('tablero'),
    },
    { id: 'grafo', label: 'Ver grafo', icon: 'hub', run: () => actions.onSetView('grafo') },
    {
      id: 'historial',
      label: 'Historial',
      icon: 'history',
      keywords: 'hoy dia',
      run: actions.onOpenHistory,
    },
    {
      id: 'prs',
      label: 'PRs',
      icon: 'merge',
      keywords: 'pull request github',
      run: actions.onOpenPrs,
    },
    {
      id: 'varios',
      label: 'Mensaje a varios agentes',
      icon: 'campaign',
      keywords: 'mandar todos broadcast',
      run: actions.onBroadcast,
    },
    {
      id: 'foco',
      label: focused ? 'Terminar modo foco' : 'Modo foco (25 min)',
      icon: 'do_not_disturb_on',
      keywords: 'silencio concentrar',
      run: actions.onToggleFocus,
    },
    {
      id: 'ajustes',
      label: 'Ajustes',
      icon: 'settings',
      keywords: 'tema configuracion',
      run: actions.onOpenSettings,
    },
  ];
  return [...agents, ...office];
}

/** Lower case, without accents: "Acción" and "accion" are the same. */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * How well a query matches a text, or null: every query character in order
 * (a subsequence); contiguous runs and word starts score higher.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = fold(query).replace(/\s+/g, '');
  const t = fold(text);
  if (!q) return 0;
  let score = 0;
  let from = 0;
  let last = -2;
  for (const ch of q) {
    const at = t.indexOf(ch, from);
    if (at < 0) return null;
    score += at === last + 1 ? 3 : 1;
    if (at === 0 || /[\s\-_/]/.test(t[at - 1])) score += 2;
    last = at;
    from = at + 1;
  }
  return score - t.length * 0.01;
}

/** The commands that match, best first (the original order breaks ties). */
export function filterCommands(
  commands: readonly PaletteCommand[],
  query: string,
): PaletteCommand[] {
  if (!query.trim()) return [...commands];
  return commands
    .map((c, i) => {
      const own = fuzzyScore(query, c.label);
      const extra = fuzzyScore(query, `${c.label} ${c.hint ?? ''} ${c.keywords ?? ''}`);
      const score = own !== null ? own + 5 : extra;
      return { c, i, score };
    })
    .filter((m): m is { c: PaletteCommand; i: number; score: number } => m.score !== null)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((m) => m.c);
}
