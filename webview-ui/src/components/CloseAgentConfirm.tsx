import { Button } from './ui/Button.js';
import { Modal } from './ui/Modal.js';

interface CloseAgentConfirmProps {
  /** Agent waiting for confirmation, or null when nothing is being closed. */
  agentLabel: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Closing an agent kills its Claude Code session, so it always asks first. */
export function CloseAgentConfirm({ agentLabel, onConfirm, onCancel }: CloseAgentConfirmProps) {
  return (
    <Modal isOpen={agentLabel !== null} onClose={onCancel} title="¿Cerrar el agente?" zIndex={54}>
      <div className="text-base text-text px-10 flex flex-col gap-8" style={{ lineHeight: 1.4 }}>
        <p className="m-0">
          Se corta la sesión de <strong>{agentLabel}</strong>. Si estaba trabajando, se detiene en
          el medio. La conversación queda guardada y se puede retomar con <code>/resume</code>.
        </p>
        <div className="flex gap-6 justify-end">
          <Button variant="default" size="md" onClick={onCancel} autoFocus>
            Cancelar
          </Button>
          <Button variant="accent" size="md" onClick={onConfirm}>
            Cerrar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
