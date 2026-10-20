import { useCallback, useEffect, useState } from 'react';

import { Button } from '../components/ui/Button.js';
import { Modal } from '../components/ui/Modal.js';
import { getIdentity } from '../identity/identityStore.js';
import { transport } from '../transport/index.js';

/**
 * "Bring it into the office" for an agent seen from an outside terminal
 * (VS Code, a console): after a confirmation, the server closes it there and
 * resumes the same conversation in an office terminal you can type into.
 * A session of the Claude desktop app only gets an explanation: the app keeps
 * it, and the office can show it but not take it.
 */
export function useAdopt(nameOf: (id: number) => string): {
  requestAdopt: (id: number) => void;
  adoptDialog: React.ReactNode;
} {
  const [agentId, setAgentId] = useState<number | null>(null);
  const [state, setState] = useState<'ask' | 'working' | { done: string }>('ask');

  const requestAdopt = useCallback((id: number) => {
    setState('ask');
    setAgentId(id);
  }, []);

  useEffect(
    () =>
      transport.onMessage((msg) => {
        if (msg.type !== 'adoptDone') return;
        setState({
          done: msg.ok
            ? 'Listo: la conversación sigue acá, en su terminal de la oficina.'
            : `No se pudo traer: ${msg.reason ?? 'error desconocido'}.`,
        });
      }),
    [],
  );

  const close = (): void => setAgentId(null);
  const name = agentId === null ? '' : nameOf(agentId);
  const inClaudeApp = agentId !== null && getIdentity(agentId)?.entrypoint === 'claude-desktop';

  const adoptDialog = (
    <Modal isOpen={agentId !== null} onClose={close} title="Traer a la oficina" zIndex={54}>
      <div className="flex flex-col gap-8 px-10 text-text" style={{ lineHeight: 1.4 }}>
        {inClaudeApp ? (
          <>
            <p className="m-0">
              «{name}» está abierto en la app de escritorio de Claude. Esa conversación se maneja
              desde la app: la oficina la muestra, pero no la puede traer. Para escribirle, usá la
              app de Claude.
            </p>
            <div className="flex justify-end">
              <Button variant="accent" size="md" onClick={close}>
                Entendido
              </Button>
            </div>
          </>
        ) : typeof state === 'object' ? (
          <>
            <p className="m-0">{state.done}</p>
            <div className="flex justify-end">
              <Button variant="accent" size="md" onClick={close}>
                Cerrar
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="m-0">
              «{name}» corre fuera de la oficina, por eso no tiene terminal acá. Si lo traés, se
              cierra donde está abierto (por ejemplo, VS Code) y la misma conversación sigue acá, en
              una terminal de la oficina donde le podés escribir.
            </p>
            <p className="m-0 text-text-muted text-sm">
              Si está en medio de un turno no se toca: esperá a que termine. Las sesiones de Claude
              Desktop se quedan en la app.
            </p>
            <div className="flex gap-6 justify-end">
              <Button variant="default" size="md" onClick={close}>
                Cancelar
              </Button>
              <Button
                variant="accent"
                size="md"
                disabled={state === 'working'}
                onClick={() => {
                  if (agentId === null) return;
                  setState('working');
                  transport.send({ type: 'adoptIntoOffice', id: agentId });
                }}
              >
                {state === 'working' ? 'Trayendo…' : 'Traer'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );

  return { requestAdopt, adoptDialog };
}
