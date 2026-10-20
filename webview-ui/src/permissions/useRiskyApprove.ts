import { useEffect, useState } from 'react';

import type { PermissionPending } from '../../../core/src/messages.js';
import { riskyReason } from './riskyCommand.js';

/** How long the second click of a risky approval stays armed. */
const CONFIRM_WINDOW_MS = 4000;

/** The approve click for a permission: immediate, or armed-then-confirm when
 *  the request is risky. */
export function useRiskyApprove(
  permission: PermissionPending,
  onAllow: (requestId: string) => void,
): { risk: string | null; armed: boolean; approve: () => void } {
  const risk = riskyReason(permission.toolName, permission.toolInput as Record<string, unknown>);
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), CONFIRM_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [armed]);
  const approve = () => {
    if (risk && !armed) setArmed(true);
    else onAllow(permission.requestId);
  };
  return { risk, armed, approve };
}
