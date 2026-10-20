import type { AgentView } from '../views/agentViews.js';

/** Agents without a folder go under this group. */
export const NO_FOLDER = 'Sin carpeta';

/** Agents grouped by folder (folders by name, agents by name inside). */
export function groupByFolder(
  views: readonly AgentView[],
): Array<{ folder: string; agents: AgentView[] }> {
  const groups = new Map<string, AgentView[]>();
  for (const v of views) {
    const folder = v.folder || NO_FOLDER;
    groups.set(folder, [...(groups.get(folder) ?? []), v]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([folder, agents]) => ({
      folder,
      agents: agents.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}
