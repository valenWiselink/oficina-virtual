import { useEffect, useRef } from 'react';

/**
 * Ctrl+K (Cmd+K on a Mac) opens the palette — except while typing in a
 * terminal, where Ctrl+K is the shell's "delete to the end of the line" and
 * must reach it.
 */
export function useCommandPaletteShortcut(onOpen: () => void): void {
  const openRef = useRef(onOpen);
  openRef.current = onOpen;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      if (e.key.toLowerCase() !== 'k') return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('.xterm')) return;
      e.preventDefault();
      openRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
