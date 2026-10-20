import { useCallback, useState } from 'react';

import type { LaunchAgent } from '../../../core/src/messages.js';
import { EFFORT_CHOICES, MODEL_CHOICES } from '../agents/agentEdits.js';
import { Choices } from '../agents/Choices.js';
import { Button } from '../components/ui/Button.js';
import { Modal } from '../components/ui/Modal.js';
import { TextInput } from '../components/ui/TextInput.js';
import type { Directory } from '../hooks/useExtensionMessages.js';
import { transport } from '../transport/index.js';
import { ClawdColorPicker } from './ClawdColorPicker.js';
import { CLAWD_COLOR_NAMES } from './clawdColors.js';
import {
  freshLaunchChoice,
  recallLaunchChoice,
  rememberLaunchChoice,
  type TakenLook,
} from './launchMemory.js';
import { NicknameDice } from './NicknameDice.js';
import { TemplatePicker } from './TemplatePicker.js';

interface PendingLaunch {
  directory: Directory;
  nickname: string;
  palette: number;
  model: string | null;
  effort: string | null;
  /** First message (a template's, edited or not). */
  prompt: string;
  template: string;
}

/**
 * Every launch goes through a small dialog: the agent's name and colour,
 * pre-filled with what was chosen last time in that folder (numbered and in
 * another colour when an agent in the office already has them, see
 * freshLaunchChoice). Returns the function that starts it and the dialog.
 */
export function useLaunchDialog(taken: () => readonly TakenLook[]): {
  requestLaunch: (directory: Directory) => void;
  launchDialog: React.ReactNode;
} {
  const [pending, setPending] = useState<PendingLaunch | null>(null);

  const requestLaunch = useCallback(
    (directory: Directory) => {
      const start = freshLaunchChoice(
        recallLaunchChoice(directory.path),
        taken(),
        CLAWD_COLOR_NAMES.length,
      );
      setPending({
        directory,
        ...start,
        model: start.model ?? null,
        effort: start.effort ?? null,
        prompt: '',
        template: 'nada',
      });
    },
    [taken],
  );

  const launch = (): void => {
    if (!pending) return;
    const nickname = pending.nickname.trim();
    rememberLaunchChoice(pending.directory.path, {
      nickname,
      palette: pending.palette,
      model: pending.model,
      effort: pending.effort,
    });
    transport.send({
      type: 'launchAgent',
      directoryPath: pending.directory.path,
      nickname: nickname || undefined,
      palette: pending.palette,
      hueShift: 0,
      prompt: pending.prompt.trim() || undefined,
      model: pending.model ?? undefined,
      effort: (pending.effort ?? undefined) as LaunchAgent['effort'],
    });
    setPending(null);
  };

  const launchDialog = (
    <Modal
      isOpen={pending !== null}
      onClose={() => setPending(null)}
      title={`Nuevo agente en ${pending?.directory.name ?? ''}`}
      zIndex={54}
    >
      {pending && (
        <form
          className="flex flex-col gap-12 px-8 py-2 text-text"
          onSubmit={(e) => {
            e.preventDefault();
            launch();
          }}
        >
          <label className="flex flex-col gap-3 text-xs font-medium text-text">
            <span>
              Nombre <span className="font-normal text-text-muted">(opcional)</span>
            </span>
            <span className="flex items-center gap-4">
              <TextInput
                autoFocus
                maxLength={32}
                className="flex-1"
                placeholder="Por ejemplo: Pagos, WISE-6082, Revisor"
                value={pending.nickname}
                onChange={(e) => setPending({ ...pending, nickname: e.target.value })}
              />
              <NicknameDice
                current={pending.nickname}
                onRoll={(nickname) => setPending({ ...pending, nickname })}
              />
            </span>
            <span className="font-normal text-text-muted">
              Sin nombre, usa el título que Claude le pone a la sesión.
            </span>
          </label>

          <TemplatePicker
            value={pending.template}
            onChange={(t) =>
              setPending({
                ...pending,
                template: t.id,
                prompt: t.prompt,
                nickname: pending.nickname.trim() ? pending.nickname : t.nickname,
              })
            }
          />
          <label className="flex flex-col gap-3 text-xs font-medium text-text">
            <span>
              Primer mensaje <span className="font-normal text-text-muted">(opcional)</span>
            </span>
            <textarea
              rows={3}
              value={pending.prompt}
              placeholder="Lo que querés que haga apenas arranque"
              onChange={(e) => setPending({ ...pending, prompt: e.target.value })}
              className="text-sm font-normal py-7 px-10 bg-bg border border-border rounded-lg text-text outline-none resize-y placeholder:text-text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </label>

          <ClawdColorPicker
            value={pending.palette}
            onChange={(palette) => setPending({ ...pending, palette })}
          />

          <Choices
            legend="Modelo"
            choices={MODEL_CHOICES}
            value={pending.model}
            onChange={(model) => setPending({ ...pending, model })}
          />
          <Choices
            legend="Esfuerzo"
            choices={EFFORT_CHOICES}
            value={pending.effort}
            onChange={(effort) => setPending({ ...pending, effort })}
          />

          <div className="flex gap-8 justify-end pt-4">
            <Button type="button" variant="ghost" size="md" onClick={() => setPending(null)}>
              Cancelar
            </Button>
            <Button type="submit" variant="accent" size="md">
              Crear agente
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );

  return { requestLaunch, launchDialog };
}
