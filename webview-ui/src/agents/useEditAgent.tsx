import { useCallback, useState } from 'react';

import { Button } from '../components/ui/Button.js';
import { Modal } from '../components/ui/Modal.js';
import { TextInput } from '../components/ui/TextInput.js';
import { ClawdColorPicker } from '../launch/ClawdColorPicker.js';
import type { AgentView } from '../views/agentViews.js';
import { useWorkspaces } from '../workspaces/workspaceStore.js';
import {
  editAgent,
  EFFORT_CHOICES,
  MODEL_CHOICES,
  sendTeam,
  setAgentRun,
  setSupervision,
} from './agentEdits.js';
import { Choices } from './Choices.js';
import { SupervisionField } from './SupervisionField.js';
import { type SupervisionScope, teamCandidates } from './supervisionRules.js';

interface Draft {
  id: number;
  name: string;
  palette: number;
  model: string | null;
  effort: string | null;
  /** What it supervises, and the agents picked when it is "elegidos". */
  scope: SupervisionScope;
  picked: string[];
  /** What it started with, to send only what changed. */
  was: {
    name: string;
    palette: number;
    model: string | null;
    effort: string | null;
    scope: SupervisionScope;
    picked: string[];
  };
  canSetRun: boolean;
}

const scopeOf = (view: AgentView): SupervisionScope => {
  const s = view.supervision;
  if (s?.kind === 'workspace' && s.workspaceId) {
    return { kind: 'workspace', workspaceId: s.workspaceId, name: s.name ?? '' };
  }
  if (s?.kind === 'agents' || s?.kind === 'all') return { kind: s.kind };
  return { kind: 'none' };
};
const sameScope = (a: SupervisionScope, b: SupervisionScope) =>
  a.kind === b.kind &&
  (a.kind !== 'workspace' || (b.kind === 'workspace' && a.workspaceId === b.workspaceId));

type Phase = 'edit' | 'restarting' | { done: string };

/**
 * "Editar agente": its name and colour (any agent), and the model, effort
 * and what it supervises (office terminals only: it is relaunched on the
 * same conversation with the new flags, so it must not be mid-turn).
 */
export function useEditAgent(views: readonly AgentView[]): {
  requestEdit: (id: number) => void;
  editDialog: React.ReactNode;
} {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [phase, setPhase] = useState<Phase>('edit');
  const workspaces = useWorkspaces();

  const requestEdit = useCallback(
    (id: number) => {
      const view = views.find((v) => v.id === id);
      if (!view) return;
      const was = {
        name: view.name,
        palette: view.palette,
        model: view.runModel ?? null,
        effort: view.runEffort ?? null,
        scope: scopeOf(view),
        picked: views.filter((v) => v.supervisedBy.includes(id)).map((v) => v.key),
      };
      setPhase('edit');
      setDraft({ id, ...was, was, canSetRun: view.canSetRun });
    },
    [views],
  );

  const close = () => setDraft(null);

  const save = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    const change: { nickname?: string; palette?: number } = {};
    if (name !== draft.was.name.trim()) change.nickname = name;
    if (draft.palette !== draft.was.palette) change.palette = draft.palette;
    if (change.nickname !== undefined || change.palette !== undefined) editAgent(draft.id, change);

    const runChanged = draft.model !== draft.was.model || draft.effort !== draft.was.effort;
    const scopeChanged = !sameScope(draft.scope, draft.was.scope);
    const pickedChanged =
      draft.scope.kind === 'agents' &&
      (scopeChanged || draft.picked.join() !== draft.was.picked.join());
    if (!runChanged && !scopeChanged) {
      if (pickedChanged) sendTeam(draft.id, draft.picked);
      close();
      return;
    }
    setPhase('restarting');
    let id = draft.id;
    let answer: { ok: boolean; reason?: string; newId?: number } = { ok: true };
    if (runChanged) {
      answer = await setAgentRun(id, { model: draft.model, effort: draft.effort });
      id = answer.newId ?? id;
    }
    // Queued: the office joins a second change to the one already waiting.
    if (answer.ok && scopeChanged) {
      answer = await setSupervision(id, draft.scope);
      id = answer.newId ?? id;
    }
    if (answer.ok && pickedChanged) sendTeam(id, draft.picked);
    setPhase({
      done: !answer.ok
        ? `No se pudo cambiar: ${answer.reason ?? 'error desconocido'}.`
        : answer.reason === 'queued'
          ? 'Está trabajando: queda anotado y lo cambio solo cuando termine su turno.'
          : 'Listo: retomó la misma conversación con los cambios.',
    });
  };

  const editDialog = (
    <Modal isOpen={draft !== null} onClose={close} title="Editar agente" zIndex={54}>
      {draft &&
        (typeof phase === 'object' ? (
          <div className="flex flex-col gap-8 px-8 py-2 text-text">
            <p className="m-0 text-sm">{phase.done}</p>
            <div className="flex justify-end">
              <Button variant="accent" size="md" onClick={close}>
                Cerrar
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="flex flex-col gap-12 px-8 py-2 text-text"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label className="flex flex-col gap-3 text-xs font-medium text-text">
              Nombre
              <TextInput
                autoFocus
                maxLength={32}
                value={draft.name}
                placeholder="Sin nombre usa el título de la sesión"
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>

            <ClawdColorPicker
              value={draft.palette}
              onChange={(palette) => setDraft({ ...draft, palette })}
            />

            <Choices
              legend="Modelo"
              choices={MODEL_CHOICES}
              value={draft.model}
              disabled={!draft.canSetRun}
              onChange={(model) => setDraft({ ...draft, model })}
            />
            <Choices
              legend="Esfuerzo"
              choices={EFFORT_CHOICES}
              value={draft.effort}
              disabled={!draft.canSetRun}
              onChange={(effort) => setDraft({ ...draft, effort })}
            />
            <SupervisionField
              scope={draft.scope}
              picked={draft.picked}
              workspaces={workspaces.workspaces}
              candidates={teamCandidates(views, draft.id)}
              disabled={!draft.canSetRun}
              onChange={(scope, picked) => setDraft({ ...draft, scope, picked })}
            />
            <p className="m-0 text-2xs text-text-muted">
              {draft.canSetRun
                ? 'Cambiar el modelo, el esfuerzo o lo que supervisa lo reinicia en la misma conversación: tiene que estar quieto (no en medio de un turno).'
                : 'El modelo, el esfuerzo y la supervisión sólo se cambian en agentes con terminal en la oficina (para los de afuera, usá «Traer»).'}
            </p>

            <div className="flex gap-8 justify-end pt-4">
              <Button type="button" variant="ghost" size="md" onClick={close}>
                Cancelar
              </Button>
              <Button type="submit" variant="accent" size="md" disabled={phase === 'restarting'}>
                {phase === 'restarting' ? 'Reiniciando…' : 'Guardar'}
              </Button>
            </div>
          </form>
        ))}
    </Modal>
  );

  return { requestEdit, editDialog };
}
