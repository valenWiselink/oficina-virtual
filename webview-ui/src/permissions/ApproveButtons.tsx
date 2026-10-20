import type { PermissionPending } from '../../../core/src/messages.js';
import { Button } from '../components/ui/Button.js';
import { useRiskyApprove } from './useRiskyApprove.js';

/**
 * Rechazar / Aprobar for one held permission. A risky one (push, merge,
 * recursive delete, deploy…) shows why in red and asks for a second click.
 */
export function ApproveButtons({
  permission,
  onAllow,
  onDeny,
  size = 'sm',
}: {
  permission: PermissionPending;
  onAllow: (requestId: string) => void;
  onDeny: (requestId: string) => void;
  size?: 'sm' | 'md';
}) {
  const { risk, armed, approve } = useRiskyApprove(permission, onAllow);
  return (
    <div className="flex items-center gap-4 justify-end flex-wrap">
      {risk && (
        <span className="text-2xs font-semibold text-danger mr-auto" title="Pide un segundo clic">
          Riesgoso: {risk}
        </span>
      )}
      <Button size={size} onClick={() => onDeny(permission.requestId)}>
        Rechazar
      </Button>
      <Button
        size={size}
        variant="accent"
        className={armed ? 'bg-danger! border-danger!' : ''}
        onClick={approve}
      >
        {armed ? 'Confirmar' : 'Aprobar'}
      </Button>
    </div>
  );
}
