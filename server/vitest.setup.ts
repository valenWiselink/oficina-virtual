/**
 * Tests never touch the real home. They point HOME at a temp folder and expect
 * os.homedir() to follow, which it only does off Windows: there it reads
 * USERPROFILE, so a test run rewrote the running office's ~/.pixel-agents
 * (config.json lost its hooks consent and the office came back without hooks,
 * 2026-10-30). Here os.homedir() follows HOME, and both start in a temp home.
 */
import * as fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import * as path from 'node:path';

const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-test-home-'));
process.env.HOME = fakeHome;
process.env.USERPROFILE = fakeHome;
os.homedir = () => process.env.HOME || fakeHome;
syncBuiltinESMExports();
