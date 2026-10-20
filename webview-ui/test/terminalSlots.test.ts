import { describe, expect, it } from 'vitest';

import { terminalSlots } from '../src/components/terminalSlots.js';

describe('terminalSlots', () => {
  it('one terminal fills the panel under its header', () => {
    const [slot] = terminalSlots(1, 'rows', 36);
    expect(slot.header).toMatchObject({ top: '0%', left: '0%', right: '0%', height: 36 });
    expect(slot.pane).toMatchObject({ top: 'calc(0% + 40px)', bottom: 'calc(0% + 4px)' });
  });

  it('two stack in halves in a tall panel', () => {
    const [a, b] = terminalSlots(2, 'rows', 36);
    expect(a.pane).toMatchObject({ top: 'calc(0% + 40px)', bottom: 'calc(50% + 4px)' });
    expect(b.header).toMatchObject({ top: '50%' });
    expect(b.pane).toMatchObject({ top: 'calc(50% + 40px)', bottom: 'calc(0% + 4px)' });
  });

  it('two sit side by side in a wide panel', () => {
    const [a, b] = terminalSlots(2, 'cols', 36);
    expect(a.pane).toMatchObject({ left: 'calc(0% + 4px)', right: 'calc(50% + 4px)' });
    expect(b.header).toMatchObject({ left: '50%', right: '0%', top: '0%' });
  });
});
