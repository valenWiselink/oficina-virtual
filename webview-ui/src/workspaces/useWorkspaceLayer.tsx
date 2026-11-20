import { type ReactNode, useCallback, useEffect, useState } from 'react';

import type { Directory } from '../hooks/useExtensionMessages.js';
import type { AgentView } from '../views/agentViews.js';
import { inOfficeOnly } from '../views/inOffice.js';
import { useWorkspaceViews } from './useWorkspaceViews.js';
import { WorkspaceBar } from './WorkspaceBar.js';
import { WorkspaceDialog } from './WorkspaceDialog.js';
import { ALL, needsByWorkspace, type Workspace, workspaceToShow } from './workspaceRules.js';
import { selectWorkspace } from './workspaceStore.js';

const lastSegment = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

/**
 * Everything the office needs from workspaces in one place: the agents to
 * show, the terminal tabs to list, the tabs strip and its dialog, and an
 * "open this agent" that first switches to a workspace where it is visible.
 * Off (`enabled` false, e.g. mobile) everyone shows and nothing renders.
 */
export function useWorkspaceLayer(input: {
  enabled: boolean;
  views: AgentView[];
  terminalAgentIds: number[];
  shownAgentId: number | null;
  showTab: (agentId: number) => void;
  directories: Directory[];
  /** The screen shows only the office's own agents (`showsOfficeOnly`). */
  officeOnly?: boolean;
}): {
  shown: AgentView[];
  tabIds: number[] | undefined;
  space: string | undefined;
  spaceOf: (view: AgentView) => string | undefined;
  revealIn: (agentId: number) => void;
  bar: ReactNode;
  dialog: ReactNode;
} {
  const { enabled, views, terminalAgentIds, shownAgentId, showTab } = input;
  const ws = useWorkspaceViews(views);
  // The tabs' «waiting» counts what the screen shows: on Núcleo, the graph
  // and the Asistente, a session from outside the office is not counted.
  const needs = input.officeOnly ? needsByWorkspace(inOfficeOnly(views), ws.state) : ws.needs;
  const [editing, setEditing] = useState<Workspace | null | undefined>(undefined);
  const filtering = enabled && ws.state.current !== ALL;
  const shown = filtering ? ws.shown : views;
  const shownIds = new Set(shown.map((v) => v.id));
  const tabIds = filtering ? terminalAgentIds.filter((id) => shownIds.has(id)) : undefined;

  // A workspace switch shows one of its own terminals (if it has any).
  const firstTab = tabIds?.[0];
  const shownInside = shownAgentId === null || !tabIds || tabIds.includes(shownAgentId);
  useEffect(() => {
    if (!shownInside && firstTab !== undefined) showTab(firstTab);
  }, [shownInside, firstTab, showTab]);

  const revealIn = useCallback(
    (agentId: number) => {
      const v = views.find((x) => x.id === agentId);
      if (enabled && v) selectWorkspace(workspaceToShow(v, ws.state));
    },
    [enabled, views, ws.state],
  );
  const folders = [
    ...new Set([
      ...views.flatMap((v) => (v.dir ? [v.dir] : [])),
      ...input.directories.map((d) => lastSegment(d.path)),
    ]),
  ];
  const current = ws.state.workspaces.find((w) => w.id === ws.state.current);
  return {
    shown,
    tabIds,
    space: filtering ? current?.name : undefined,
    spaceOf: ws.spaceOf,
    revealIn,
    bar: enabled ? (
      <WorkspaceBar
        state={ws.state}
        needs={needs}
        onNew={() => setEditing(null)}
        onEdit={setEditing}
      />
    ) : null,
    dialog: enabled ? (
      <WorkspaceDialog editing={editing} folders={folders} onClose={() => setEditing(undefined)} />
    ) : null,
  };
}
