import type { Workspace } from '../workspaces/workspaceRules.js';
import { Choices } from './Choices.js';
import type { SupervisionScope, TeamCandidate } from './supervisionRules.js';

const KINDS: ReadonlyArray<{ value: string | null; label: string }> = [
  { value: null, label: 'Nadie' },
  { value: 'workspace', label: 'Un espacio' },
  { value: 'agents', label: 'Elegidos' },
  { value: 'all', label: 'Todos' },
];

/**
 * "Supervisa": nobody (a regular agent), a workspace's agents (whoever joins
 * it later too), a hand-picked few, or everyone in every workspace. Its team
 * then sends it their permissions, questions and finished turns.
 */
export function SupervisionField({
  scope,
  picked,
  workspaces,
  candidates,
  disabled,
  onChange,
}: {
  scope: SupervisionScope;
  picked: string[];
  workspaces: readonly Workspace[];
  candidates: ReadonlyArray<TeamCandidate & { name: string }>;
  disabled: boolean;
  onChange: (scope: SupervisionScope, picked: string[]) => void;
}) {
  const pick = (kind: string | null) => {
    if (kind === 'workspace') {
      const first = workspaces[0];
      if (first) onChange({ kind: 'workspace', workspaceId: first.id, name: first.name }, picked);
    } else if (kind === 'agents' || kind === 'all') {
      onChange({ kind }, picked);
    } else {
      onChange({ kind: 'none' }, picked);
    }
  };
  const toggle = (key: string) =>
    onChange(
      scope,
      picked.includes(key) ? picked.filter((k) => k !== key) : [...picked, key].sort(),
    );

  return (
    <div className="flex flex-col gap-6">
      <Choices
        legend="Supervisa"
        choices={workspaces.length > 0 ? KINDS : KINDS.filter((k) => k.value !== 'workspace')}
        value={scope.kind === 'none' ? null : scope.kind}
        disabled={disabled}
        onChange={pick}
      />
      {scope.kind === 'workspace' && (
        <Choices
          legend="Qué espacio"
          choices={workspaces.map((w) => ({ value: w.id, label: w.name }))}
          value={scope.workspaceId}
          disabled={disabled}
          onChange={(id) => {
            const w = workspaces.find((x) => x.id === id);
            if (w) onChange({ kind: 'workspace', workspaceId: w.id, name: w.name }, picked);
          }}
        />
      )}
      {scope.kind === 'agents' && (
        <fieldset
          className="flex flex-col gap-2 border-0 p-0 m-0 max-h-160 overflow-y-auto thin-scrollbar"
          disabled={disabled}
        >
          <legend className="text-xs font-medium text-text mb-4">A quiénes</legend>
          {candidates.length === 0 && (
            <span className="text-2xs text-text-muted">
              Todavía no hay otros agentes para elegir.
            </span>
          )}
          {candidates.map((c) => (
            <label key={c.key} className="flex items-center gap-6 text-xs text-text cursor-pointer">
              <input
                type="checkbox"
                checked={picked.includes(c.key)}
                onChange={() => toggle(c.key)}
              />
              {c.name}
              {c.dir && <span className="text-text-muted">· {c.dir}</span>}
            </label>
          ))}
        </fieldset>
      )}
      {scope.kind !== 'none' && (
        <span className="text-2xs text-text-muted">
          Le llegan los permisos, las preguntas y los turnos terminados de su equipo: aprueba lo
          seguro, te pide lo demás y te cuenta qué hizo cada uno.
        </span>
      )}
    </div>
  );
}
