import { describe, expect, it } from 'vitest';

import type { PermissionPending } from '../../core/src/messages.js';
import { askedLine, askedPermission, visorKey } from '../src/jarvis/jarvisRules.js';
import type { AgentView } from '../src/views/agentViews.js';

const view = (id: number, over: Partial<AgentView> = {}): AgentView =>
  ({
    id,
    name: `A${id}`,
    kind: 'idle',
    statusText: 'Sin tarea',
    supervisedBy: [],
    supervisorNames: [],
    teamSize: 0,
    subagents: [],
    tasks: [],
    ...over,
  }) as AgentView;

const jira = {
  requestId: 'p-jira',
  toolName: 'mcp__claude_ai_Atlassian_MCP__editJiraIssue',
  toolInput: { issueIdOrKey: 'WISE-6400' },
} as unknown as PermissionPending;

describe('the permission Jarvis asks you about', () => {
  const pagos = view(3, { name: 'Pagos', kind: 'needs', permission: jira });

  it('is the one it names, while that agent still waits on it', () => {
    const jarvis = view(9, { name: 'Jarvis', asksPermission: 'p-jira' });
    expect(askedPermission(jarvis, [jarvis, pagos])?.agent.name).toBe('Pagos');
    expect(askedPermission(jarvis, [jarvis, view(3, { name: 'Pagos' })])).toBeUndefined();
    expect(askedPermission(view(9), [pagos])).toBeUndefined();
  });

  it('takes the visor first, even when Jarvis is not waiting on you', () => {
    const jarvis = view(9, { name: 'Jarvis', kind: 'work', asksPermission: 'p-jira' });
    const asked = askedPermission(jarvis, [pagos]);
    expect(visorKey(jarvis, asked)).toBe('pide:p-jira');
    expect(visorKey(jarvis, undefined)).toBeUndefined();
  });

  it('is said in Jarvis’s words', () => {
    const line = askedLine({ agent: pagos, permission: jira });
    expect(line).toMatch(/^«Pagos» quiere /);
    expect(line).toMatch(/¿Lo autorizo, señor\?$/);
  });
});
