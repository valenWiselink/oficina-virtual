import { useCallback, useEffect, useState } from 'react';

import { Button } from '../components/ui/Button.js';
import { Modal } from '../components/ui/Modal.js';
import { transport } from '../transport/index.js';

interface UseHandOffInputs {
  /** Agents whose terminal lives in the office: the only possible receivers. */
  terminalAgentIds: number[];
  nameOf: (id: number) => string;
}

/**
 * "Take what this one did and carry on": pick another agent and the source's
 * latest answer is pasted into that agent's terminal, unsent, so the user can
 * add an instruction before pressing Enter.
 */
export function useHandOff({ terminalAgentIds, nameOf }: UseHandOffInputs): {
  requestHandOff: (fromId: number) => void;
  handOffDialog: React.ReactNode;
} {
  const [fromId, setFromId] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);

  const requestHandOff = useCallback((id: number) => {
    setOutcome(null);
    setFromId(id);
  }, []);

  useEffect(
    () =>
      transport.onMessage((msg) => {
        if (msg.type !== 'handOffDone') return;
        setOutcome(
          msg.ok
            ? `Listo: quedó escrito en la terminal de «${nameOf(msg.toId)}». Revisalo y mandalo con Enter.`
            : `No se pudo pasar: ${msg.reason ?? 'error desconocido'}.`,
        );
      }),
    [nameOf],
  );

  const targets = terminalAgentIds.filter((id) => id !== fromId);
  const close = (): void => {
    setFromId(null);
    setOutcome(null);
  };

  const handOffDialog = (
    <Modal
      isOpen={fromId !== null}
      onClose={close}
      title={`Pasar el resultado de «${fromId === null ? '' : nameOf(fromId)}»`}
      zIndex={54}
    >
      <div className="flex flex-col gap-8 px-10 text-text">
        {outcome ? (
          <>
            <p className="m-0">{outcome}</p>
            <div className="flex justify-end">
              <Button variant="accent" size="md" onClick={close}>
                Cerrar
              </Button>
            </div>
          </>
        ) : targets.length === 0 ? (
          <p className="m-0 text-text-muted">
            No hay otro agente con su terminal en la oficina. Lanzá uno con + Agente.
          </p>
        ) : (
          <>
            <p className="m-0 text-sm text-text-muted">
              Su última respuesta queda escrita (sin mandar) en la terminal del que elijas.
            </p>
            <div className="flex flex-col gap-4">
              {targets.map((id) => (
                <Button
                  key={id}
                  variant="default"
                  size="md"
                  className="text-left"
                  onClick={() => {
                    if (fromId !== null)
                      transport.send({ type: 'handOffResult', fromId, toId: id });
                  }}
                >
                  {nameOf(id)}
                </Button>
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  );

  return { requestHandOff, handOffDialog };
}
