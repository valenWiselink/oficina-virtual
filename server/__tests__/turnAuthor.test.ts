import { describe, expect, it } from 'vitest';

import { identityMessage, observeIdentity, spokenReply } from '../src/agentIdentity.js';
import { wakePrompt } from '../src/supervisors/jarvisKeeper.js';
import type { AgentState } from '../src/types.js';
import { promptAuthor } from '../src/voice/turnAuthor.js';

const blank = (): AgentState => ({}) as AgentState;

// Record shapes as Claude Code 2.1 writes them.
const prompt = (content: unknown) => ({ type: 'user', message: { role: 'user', content } });
const queued = (text: string) => ({
  type: 'attachment',
  attachment: { type: 'queued_command', prompt: text },
});
const toolResult = () => prompt([{ type: 'tool_result', tool_use_id: 't', content: 'ok' }]);
const answer = (text: string) => ({
  type: 'assistant',
  message: { content: [{ type: 'text', text }] },
});

function feed(...records: Array<Record<string, unknown>>): AgentState {
  const agent = blank();
  for (const r of records) observeIdentity(agent, r);
  return agent;
}

const NOTICE = '[Oficina] «Coral» terminó: abrió el PR #12.';
const WITH_ASK = 'Anotado, señor. Coral abrió el PR.\n\nTe toca: mergear el PR #12 del webapp';

describe('who a prompt is from', () => {
  it('his typed or spoken words and his commands are his', () => {
    expect(promptAuthor('¿Cómo va Coral?')).toBe('valentin');
    expect(promptAuthor('[Voz] abrí un agente en el webapp')).toBe('valentin');
    expect(promptAuthor('<command-name>/compact</command-name>')).toBe('valentin');
  });

  it('notices, supervisors, background jobs and the morning wake-up are not', () => {
    expect(promptAuthor(NOTICE)).toBe('office');
    expect(promptAuthor('[Supervisor «Jarvis»] seguí con el ticket')).toBe('office');
    expect(promptAuthor('<task-notification><task-id>b1</task-id></task-notification>')).toBe(
      'office',
    );
    expect(promptAuthor(wakePrompt('manana'))).toBe('office');
  });

  it('harness output is no prompt', () => {
    expect(promptAuthor('<local-command-stdout>ok</local-command-stdout>')).toBeUndefined();
    expect(promptAuthor('')).toBeUndefined();
  });
});

describe('what Jarvis says aloud', () => {
  it('all of an answer to Valentín, typed or spoken', () => {
    const typed = feed(prompt('¿Cómo va todo?'), answer('Todo en orden, señor.'));
    expect(spokenReply(typed)).toBe('Todo en orden, señor.');
    const spoken = feed(prompt([{ type: 'text', text: '[Voz] ¿cómo va?' }]), answer(WITH_ASK));
    expect(spokenReply(spoken)).toBe(WITH_ASK);
  });

  it('nothing of an answer to a notice', () => {
    const agent = feed(prompt(NOTICE), answer('Anotado, señor.'));
    expect(spokenReply(agent)).toBeUndefined();
    expect(identityMessage(1, agent).saysAloud).toBeUndefined();
    expect(identityMessage(1, agent).lastReplyHead).toBe('Anotado, señor.');
  });

  it('only the «Te toca:» line of an answer to a notice', () => {
    const agent = feed(prompt(NOTICE), answer(WITH_ASK));
    expect(spokenReply(agent)).toBe('mergear el PR #12 del webapp');
    expect(identityMessage(1, agent).saysAloud).toBe(true);
  });

  it('PR links alone are no «Te toca:» line', () => {
    const agent = feed(prompt(NOTICE), answer('Abrió https://github.com/a/webapp/pull/12'));
    expect(agent.yourTurn?.text).toBe('revisar el PR #12 (webapp)');
    expect(spokenReply(agent)).toBeUndefined();
  });

  it('tool results inside a turn do not change whose turn it is', () => {
    const his = feed(prompt('Abrí a Coral'), toolResult(), answer('Abrí a Coral, señor.'));
    expect(spokenReply(his)).toBe('Abrí a Coral, señor.');
    const office = feed(prompt(NOTICE), toolResult(), answer('Abrí a Coral, señor.'));
    expect(spokenReply(office)).toBeUndefined();
  });

  it('what he sends while it answers a notice makes the turn his', () => {
    const agent = feed(prompt(NOTICE), queued('y avisale a Coral'), answer('Le avisé, señor.'));
    expect(spokenReply(agent)).toBe('Le avisé, señor.');
  });

  it('a notice absorbed into his turn leaves it his', () => {
    const agent = feed(prompt('¿Qué hay?'), queued(NOTICE), answer('Coral terminó, señor.'));
    expect(spokenReply(agent)).toBe('Coral terminó, señor.');
  });

  it('each turn starts over', () => {
    const agent = feed(prompt('¿Qué hay?'), answer('Nada, señor.'), prompt(NOTICE));
    observeIdentity(agent, answer('Anotado, señor.'));
    expect(spokenReply(agent)).toBeUndefined();
    observeIdentity(agent, prompt('[Voz] gracias'));
    observeIdentity(agent, answer('A usted, señor.'));
    expect(spokenReply(agent)).toBe('A usted, señor.');
  });

  it('a background job reporting back is not his turn', () => {
    const agent = feed(
      prompt('Corré los tests'),
      answer('Los corro en segundo plano, señor.'),
      prompt('<task-notification><task-id>b1</task-id></task-notification>'),
      answer('Pasaron todos, señor.'),
    );
    expect(spokenReply(agent)).toBeUndefined();
  });

  it('subagents and meta records do not count', () => {
    const agent = feed(prompt('¿Cómo va?'));
    observeIdentity(agent, { ...prompt(NOTICE), isSidechain: true });
    observeIdentity(agent, { ...prompt('<system-reminder>x</system-reminder>'), isMeta: true });
    observeIdentity(agent, answer('Bien, señor.'));
    expect(spokenReply(agent)).toBe('Bien, señor.');
  });
});

describe('a prompt Claude Code recorded as pasted', () => {
  const pasted = (text: string) =>
    `\n\n<pasted_content id="0047">\n${text}\n</pasted_content id="0047">\n`;

  it('is still his, or the office', () => {
    expect(promptAuthor(pasted('el plano 3d a veces se rompe'))).toBe('valentin');
    expect(promptAuthor(pasted(NOTICE))).toBe('office');
  });
});
