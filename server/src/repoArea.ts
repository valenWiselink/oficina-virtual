import * as fs from 'fs';
import * as path from 'path';

/** Office areas, one per kind of repo, plus the catch-all. */
export type RepoArea = 'backend' | 'webapp' | 'flutter' | 'otros';

/** Repo folder name → area. Wiselink's layout: Go services are
 *  `backend/wiselink_api_*`, plus the webapp and the Flutter app. */
const AREA_RULES: Array<[RegExp, RepoArea]> = [
  [/^wiselink_api_/i, 'backend'],
  [/^wiselink_frontend_webapp$/i, 'webapp'],
  [/^wiselink_flutter_app$/i, 'flutter'],
];

const repoRootCache = new Map<string, string | null>();

/**
 * The repository a folder belongs to — its main checkout, also for a git
 * worktree, whose `.git` FILE points back into the main repo
 * (`gitdir: F:/…/wiselink_api_crm/.git/worktrees/crm-oleada8`). Worktree
 * names (`crm-oleada8`, `webapp-WISE-6366`) do not say which repo they are,
 * so this reads where they point instead of guessing from the name.
 */
export function repoRootOf(cwd: string): string | null {
  const cached = repoRootCache.get(cwd);
  if (cached !== undefined) return cached;

  let root: string | null = null;
  for (let dir = path.resolve(cwd); ; dir = path.dirname(dir)) {
    const dotGit = path.join(dir, '.git');
    let stat: fs.Stats | undefined;
    try {
      stat = fs.statSync(dotGit);
    } catch {
      /* not here: keep walking up */
    }
    if (stat?.isDirectory()) {
      root = dir;
      break;
    }
    if (stat?.isFile()) {
      root = mainRepoOfWorktree(dotGit) ?? dir;
      break;
    }
    if (path.dirname(dir) === dir) break;
  }
  repoRootCache.set(cwd, root);
  return root;
}

function mainRepoOfWorktree(dotGitFile: string): string | null {
  try {
    const match = fs.readFileSync(dotGitFile, 'utf-8').match(/^gitdir:\s*(.+)$/m);
    if (!match) return null;
    // <main>/.git/worktrees/<name>  →  <main>
    const gitdir = path.resolve(path.dirname(dotGitFile), match[1].trim());
    const parts = gitdir.split(/[\\/]/);
    const at = parts.lastIndexOf('worktrees');
    if (at < 2 || parts[at - 1] !== '.git') return null;
    return parts.slice(0, at - 1).join(path.sep);
  } catch {
    return null;
  }
}

/** Repo name and office area for a session's working folder. */
export function repoAreaOf(cwd: string | undefined): { repo?: string; area: RepoArea } {
  const root = cwd ? repoRootOf(cwd) : null;
  const repo = root ? path.basename(root) : undefined;
  const area = repo
    ? (AREA_RULES.find(([pattern]) => pattern.test(repo))?.[1] ?? 'otros')
    : 'otros';
  return { repo, area };
}
