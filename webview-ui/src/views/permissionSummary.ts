import { describeToolInput } from '../permissions/describeToolInput.js';
import type { AgentView } from './agentViews.js';

/** First line of what a held permission would run, for the inline request
 *  (the board's card and Control's chip). */
export function permissionSummary(view: AgentView): { title: string; detail?: string } | null {
  const p = view.permission;
  if (!p) return null;
  const d = describeToolInput(p.toolName, p.toolInput);
  return { title: d.title, detail: d.sections.find((s) => s.code)?.text };
}
