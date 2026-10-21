import { describe, expect, it } from 'vitest';

import type { AgentIdentity } from '../../core/src/messages.js';
import { markSeen, noteFirstSight, seenAt } from '../src/identity/seenStore.js';
import {
  type AgentView,
  buildAgentViews,
  type CharacterFacts,
  type ViewInputs,
} from '../src/views/agentViews.js';
import { choiceButtons } from '../src/views/cardRules.js';
import { byLatest, isUnread } from '../src/views/unread.js';

const ch: CharacterFacts = {
  palette: 1,
  hueShift: 0,
  isActive: false,
  bubbleType: null,
  contextTokens: 0,
  maxContextTokens: 1_000_000,
};

const PR = 'https://github.com/o/web/pull/77';

function finished(identity: Partial<AgentIdentity>, done: string[] = []): AgentView {
  const input: ViewInputs = {
    agentIds: [1],
    characters: new Map([[1, ch]]),
    agentTools: {},
    subagents: [],
    subagentTools: {},
    permissions: [],
    terminalAgentIds: [1],
    identity: () => ({ type: 'agentIdentity', id: 1, tasks: [], ...identity }) as AgentIdentity,
    finished: () => true,
    yourTurnDone: (t) => done.includes(t),
    inTurn: () => false,
    researching: () => false,
  };
  return buildAgentViews(input)[0];
}

const ask = {
  yourTurn: 'mergear el PR #77 y avisarme',
  yourTurnId: 't1',
  yourTurnUrl: PR,
  replyLink: 'https://dev.wiselink.app/es/ferias',
  replyChoices: { options: [{ n: 1, label: 'Mergear ya' }], recommends: true },
};

describe('a "te toca" on the board', () => {
  it('carries the whole ask, its link and its choices while it waits on you', () => {
    expect(finished(ask)).toMatchObject({
      kind: 'needs',
      statusText: 'Te toca: mergear el PR #77 y avisarme',
      yourTurn: 'mergear el PR #77 y avisarme',
      prUrl: PR,
      replyLink: 'https://dev.wiselink.app/es/ferias',
      choices: ask.replyChoices,
    });
  });

  it('is done once its PR got merged: "Terminó", with "Avisarle" unless it was told', () => {
    const merged = finished({ ...ask, yourTurnMerged: { number: 77, url: PR, told: false } });
    expect(merged).toMatchObject({
      kind: 'done',
      statusText: 'Se mergeó el PR #77',
      mergedPr: { number: 77, told: false, turnId: 't1' },
      yourTurnId: undefined,
      prUrl: undefined,
    });
    const told = finished({ ...ask, yourTurnMerged: { number: 77, url: PR, told: true } });
    expect(told.statusText).toBe('Se mergeó el PR #77 y ya se enteró');
  });

  it('a "Terminó" without an ask still offers its link and choices', () => {
    const v = finished({ replyLink: 'https://x.dev', replyChoices: ask.replyChoices });
    expect(v).toMatchObject({ kind: 'done', statusText: 'Terminó', replyLink: 'https://x.dev' });
    expect(v.yourTurn).toBeUndefined();
  });
});

describe('choiceButtons', () => {
  it('one per option, plus "Como recomendás" when it recommended', () => {
    expect(
      choiceButtons({
        options: [
          { n: 1, label: 'Solo el dropdown' },
          { n: 2, label: 'Solo el nombre' },
        ],
        recommends: true,
      }).map((b) => [b.label, b.text]),
    ).toEqual([
      ['1 · Solo el dropdown', 'Andá con la 1.'],
      ['2 · Solo el nombre', 'Andá con la 2.'],
      ['Como recomendás', 'Dale, andá como recomendás.'],
    ]);
    expect(choiceButtons(undefined)).toEqual([]);
  });
});

const view = (over: Partial<AgentView>) =>
  ({ id: 1, key: 'k', kind: 'done', tasks: [], subagents: [], ...over }) as AgentView;

describe('"Terminó": latest first, unread marked', () => {
  it('sorts by the latest record, the unknown last', () => {
    const list = [
      view({ id: 1, lastRecordAt: 100 }),
      view({ id: 2 }),
      view({ id: 3, lastRecordAt: 300 }),
    ];
    expect(list.sort(byLatest).map((v) => v.id)).toEqual([3, 1, 2]);
  });

  it('is unread when it answered after your last look, and only in "Terminó"', () => {
    expect(isUnread(view({ lastRecordAt: 200 }), 100)).toBe(true);
    expect(isUnread(view({ lastRecordAt: 50 }), 100)).toBe(false);
    expect(isUnread(view({ lastRecordAt: 200 }), undefined)).toBe(false);
    expect(isUnread(view({ kind: 'needs', lastRecordAt: 200 }), 100)).toBe(false);
  });

  it('looks are kept per stable key and never move back; first sight counts as a look', () => {
    noteFirstSight(['sesion-a'], 1000);
    expect(seenAt('sesion-a')).toBe(1000);
    noteFirstSight(['sesion-a'], 5000);
    expect(seenAt('sesion-a')).toBe(1000);
    expect(markSeen([{ key: 'sesion-a', at: 3000 }])).toBe(true);
    expect(markSeen([{ key: 'sesion-a', at: 2000 }])).toBe(false);
    expect(seenAt('sesion-a')).toBe(3000);
  });
});
