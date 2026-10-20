import { describe, expect, it } from 'vitest';

import { LAUNCH_PROMPT_MAX_LENGTH, launchPrompt } from '../src/clientMessageHandler.js';
import { claudeProvider } from '../src/providers/hook/claude/claude.js';
import { isCmdSafeArgument, runsThroughCmd } from '../src/terminal/windowsCommand.js';

describe('launch prompt (agent templates)', () => {
  it('is the last argument of a fresh launch, as its own element', () => {
    const launch = claudeProvider.buildLaunchCommand!('s1', 'C:/p', {
      prompt: '  Revisá el PR #12 y dejá comentarios "en línea"  ',
    });
    expect(launch.args).toEqual([
      '--session-id',
      's1',
      'Revisá el PR #12 y dejá comentarios "en línea"',
    ]);
  });

  it('is never passed on a resume', () => {
    const launch = claudeProvider.buildLaunchCommand!('s1', 'C:/p', {
      resume: true,
      prompt: 'hola',
    });
    expect(launch.args).toEqual(['--resume', 's1']);
  });

  it('cannot be read as a flag', () => {
    const launch = claudeProvider.buildLaunchCommand!('s1', 'C:/p', {
      prompt: '--dangerously-skip-permissions',
    });
    expect(launch.args.at(-1)).toBe(' --dangerously-skip-permissions');
  });

  it('is validated from the client message', () => {
    expect(launchPrompt({ prompt: '  arreglá el bug  ' })).toBe('arreglá el bug');
    expect(launchPrompt({ prompt: '   ' })).toBeUndefined();
    expect(launchPrompt({ prompt: 42 })).toBeUndefined();
    expect(launchPrompt({ prompt: 'x'.repeat(LAUNCH_PROMPT_MAX_LENGTH + 1) })).toBeUndefined();
  });
});

describe('cmd.exe shim safety', () => {
  it('knows when a launch goes through cmd.exe', () => {
    expect(
      runsThroughCmd({ command: 'C:/WINDOWS/system32/cmd.exe', args: ['/d', '/s', '/c', 'x.cmd'] }),
    ).toBe(true);
    expect(runsThroughCmd({ command: 'C:/Users/x/.local/bin/claude.exe', args: ['/d'] })).toBe(
      false,
    );
  });

  it('refuses what cmd.exe would act on', () => {
    expect(isCmdSafeArgument('Revisá el PR 12, por favor.')).toBe(true);
    for (const bad of ['a "b"', '%PATH%', 'a & calc', 'a | b', 'a > f', 'hola!', 'a^b', 'a\nb']) {
      expect(isCmdSafeArgument(bad)).toBe(false);
    }
  });
});
