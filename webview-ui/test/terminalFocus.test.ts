import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { isTypingInField, isTypingInTerminal } from '../src/terminal/terminalDom.js';

// The suite runs without a DOM: just enough of one for instanceof.
class FakeElement {
  isContentEditable = false;
  readonly classes: string[];
  classList = { contains: (name: string) => this.classes.includes(name) };
  constructor(classes: string[] = []) {
    this.classes = classes;
  }
}
class FakeTextArea extends FakeElement {}
class FakeInput extends FakeElement {
  type: string;
  constructor(type = 'text') {
    super();
    this.type = type;
  }
}

const g = globalThis as Record<string, unknown>;
const saved = ['HTMLElement', 'HTMLTextAreaElement', 'HTMLInputElement'].map((k) => [k, g[k]]);

beforeAll(() => {
  g.HTMLElement = FakeElement;
  g.HTMLTextAreaElement = FakeTextArea;
  g.HTMLInputElement = FakeInput;
});
afterAll(() => {
  for (const [k, v] of saved) g[k as string] = v;
});

const el = (x: FakeElement) => x as unknown as Element;

describe('a terminal that shows up does not take the focus from where you write', () => {
  it('the chat box and text fields are writing; a terminal is not', () => {
    expect(isTypingInField(el(new FakeTextArea()))).toBe(true);
    expect(isTypingInField(el(new FakeInput('search')))).toBe(true);
    const xterm = el(new FakeTextArea(['xterm-helper-textarea']));
    expect(isTypingInTerminal(xterm)).toBe(true);
    expect(isTypingInField(xterm)).toBe(false);
  });

  it('a button, a checkbox or nothing focused is not writing', () => {
    expect(isTypingInField(el(new FakeInput('checkbox')))).toBe(false);
    expect(isTypingInField(el(new FakeElement()))).toBe(false);
    expect(isTypingInField(null)).toBe(false);
  });
});
