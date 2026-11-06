import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import {
  dockClasses,
  dockShape,
  readSidePanel,
  toggledPanel,
} from '../src/sideDock/sideDockRules.ts';

describe('the side panel remembered', () => {
  it('comes back as one of the three panels', () => {
    assert.equal(readSidePanel('pendientes'), 'pendientes');
    assert.equal(readSidePanel('historial'), 'historial');
    assert.equal(readSidePanel('artifacts'), 'artifacts');
  });

  it('is nothing for anything else', () => {
    assert.equal(readSidePanel(null), null);
    assert.equal(readSidePanel(''), null);
    assert.equal(readSidePanel('reuniones'), null);
  });

  it('closes on its own button and switches on another', () => {
    assert.equal(toggledPanel('pendientes', 'pendientes'), null);
    assert.equal(toggledPanel('pendientes', 'historial'), 'historial');
    assert.equal(toggledPanel(null, 'artifacts'), 'artifacts');
  });
});

describe('the left column', () => {
  it('holds what is open: a panel, the meetings, or both', () => {
    assert.equal(dockShape(false, false), 'none');
    assert.equal(dockShape(true, false), 'panel');
    assert.equal(dockShape(false, true), 'meetings');
    assert.equal(dockShape(true, true), 'both');
  });

  it('renders nothing when empty', () => {
    assert.equal(dockClasses('none', false), 'hidden');
  });

  it('ends above the toolbar and keeps a gap from the edge', () => {
    for (const shape of ['meetings', 'panel', 'both'] as const) {
      const classes = dockClasses(shape, false).split(' ');
      assert.ok(classes.includes('mb-80'), shape);
      assert.ok(classes.includes('ml-14'), shape);
    }
  });

  it('keeps the meetings alone out of a narrow office unless opened by hand', () => {
    assert.match(dockClasses('meetings', false), /hidden @min-\[760px\]:flex/);
    assert.doesNotMatch(dockClasses('meetings', true), /hidden/);
  });

  it('a panel never hides with the width', () => {
    assert.doesNotMatch(dockClasses('panel', false), /hidden/);
    assert.doesNotMatch(dockClasses('both', false), /hidden/);
  });

  it('stacks both, and puts them side by side in a wide office', () => {
    const both = dockClasses('both', false);
    assert.match(both, /\bflex-col\b/);
    assert.match(both, /@min-\[1280px\]:flex-row/);
  });
});
