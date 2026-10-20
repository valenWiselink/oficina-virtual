import { useEffect, useState } from 'react';

import type { AgentLaunchFailed } from '../../../core/src/messages.js';
import { transport } from '../transport/index.js';
import { Button } from './ui/Button.js';

/** Says out loud that + Agent (or a resume) failed, and why. Stays until closed. */
export function LaunchFailedNotice() {
  const [failure, setFailure] = useState<AgentLaunchFailed | null>(null);

  useEffect(
    () =>
      transport.onMessage((msg) => {
        if (msg.type === 'agentLaunchFailed') setFailure(msg);
      }),
    [],
  );

  if (!failure) return null;
  return (
    <div
      role="alert"
      className="fixed bottom-80 left-8 bg-bg border border-danger shadow-soft p-8 flex flex-col gap-4"
      style={{ zIndex: 60, width: 'min(460px, calc(100vw - 32px))' }}
    >
      <span className="text-text text-lg">No se pudo lanzar el agente</span>
      <span className="text-text-muted text-sm break-all">{failure.directoryPath}</span>
      <span className="text-text text-sm break-all">{failure.reason}</span>
      <div className="flex justify-end">
        <Button variant="default" size="md" onClick={() => setFailure(null)}>
          Cerrar
        </Button>
      </div>
    </div>
  );
}
