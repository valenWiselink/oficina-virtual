import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { repoAreaOf, repoRootOf } from '../src/repoArea.js';

let base: string;

beforeAll(() => {
  // <base>/backend/wiselink_api_crm/.git/worktrees/crm-oleada8  (main repo)
  // <base>/.worktrees/crm-oleada8/.git  → file pointing back to it
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-repo-area-'));
  const crm = path.join(base, 'backend', 'wiselink_api_crm');
  fs.mkdirSync(path.join(crm, '.git', 'worktrees', 'crm-oleada8'), { recursive: true });
  fs.mkdirSync(path.join(crm, 'internal', 'handlers'), { recursive: true });
  const wt = path.join(base, '.worktrees', 'crm-oleada8');
  fs.mkdirSync(wt, { recursive: true });
  fs.writeFileSync(
    path.join(wt, '.git'),
    `gitdir: ${path.join(crm, '.git', 'worktrees', 'crm-oleada8').replace(/\\/g, '/')}\n`,
  );
  const webapp = path.join(base, 'wiselink_frontend_webapp');
  fs.mkdirSync(path.join(webapp, '.git'), { recursive: true });
  fs.mkdirSync(path.join(base, 'sin-repo'), { recursive: true });
});

afterAll(() => {
  fs.rmSync(base, { recursive: true, force: true });
});

describe('repoAreaOf', () => {
  it('finds the repo from a subfolder', () => {
    const cwd = path.join(base, 'backend', 'wiselink_api_crm', 'internal', 'handlers');
    expect(repoAreaOf(cwd)).toEqual({ repo: 'wiselink_api_crm', area: 'backend' });
  });

  it('follows a worktree back to its main repo instead of guessing from its name', () => {
    expect(repoRootOf(path.join(base, '.worktrees', 'crm-oleada8'))).toBe(
      path.join(base, 'backend', 'wiselink_api_crm'),
    );
    expect(repoAreaOf(path.join(base, '.worktrees', 'crm-oleada8')).area).toBe('backend');
  });

  it('classifies the webapp, and anything else as otros', () => {
    expect(repoAreaOf(path.join(base, 'wiselink_frontend_webapp')).area).toBe('webapp');
    expect(repoAreaOf(undefined)).toEqual({ repo: undefined, area: 'otros' });
  });
});
