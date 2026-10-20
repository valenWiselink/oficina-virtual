import { SearchAddon } from '@xterm/addon-search';
import { WebglAddon } from '@xterm/addon-webgl';
import type { Terminal } from '@xterm/xterm';

import type { TerminalScheme } from './terminalSchemes.js';

/** Search inside one terminal's output (what the search bar drives). */
export interface TerminalSearchHandle {
  next: (query: string) => void;
  previous: (query: string) => void;
  clear: () => void;
  /** "3 de 12": called whenever the matches change. */
  onResults: (listener: (index: number, count: number) => void) => () => void;
}

/** Load search on a terminal; matches are highlighted (in the colours of the
 *  scheme shown at the time) and counted. */
export function attachSearch(
  term: Terminal,
  colors: () => TerminalScheme['search'],
): {
  handle: TerminalSearchHandle;
  dispose: () => void;
} {
  const search = new SearchAddon();
  term.loadAddon(search);
  const options = () => ({ decorations: { ...colors() } });
  const handle: TerminalSearchHandle = {
    next: (q) => {
      if (q) safely(() => search.findNext(q, { ...options(), incremental: true }));
    },
    previous: (q) => {
      if (q) safely(() => search.findPrevious(q, options()));
    },
    clear: () => {
      search.clearDecorations();
      term.clearSelection();
    },
    onResults: (listener) => {
      const sub = search.onDidChangeResults((e) => listener(e.resultIndex, e.resultCount));
      return () => sub.dispose();
    },
  };
  return { handle, dispose: () => search.dispose() };
}

/** A failed search must never take the terminal down with it. */
function safely(run: () => void): void {
  try {
    run();
  } catch (err) {
    console.warn('[Oficina] La búsqueda falló:', err);
  }
}

/**
 * Draw with the GPU (smoother, and steadier redraws than the DOM renderer).
 * Only while the pane is on screen — browsers cap live WebGL contexts — and
 * if the browser drops the context, the terminal goes back to the DOM
 * renderer on its own. Returns the release.
 */
export function attachWebgl(term: Terminal): () => void {
  let addon: WebglAddon | null = null;
  try {
    addon = new WebglAddon();
    addon.onContextLoss(() => {
      addon?.dispose();
      addon = null;
    });
    term.loadAddon(addon);
  } catch {
    // No WebGL here: the DOM renderer keeps drawing, nothing to undo.
    addon?.dispose();
    addon = null;
  }
  return () => {
    addon?.dispose();
    addon = null;
  };
}
