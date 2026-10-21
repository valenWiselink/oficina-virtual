/**
 * The graph's keys, only while the graph has the focus (its canvas): never
 * with Ctrl, Alt or Meta, so Claude Code's keys and the office's own
 * (Alt+N, Alt+1…9, Ctrl+K) always pass. Pure: the key → what it does.
 */

export type GraphKey =
  | { kind: 'fit' }
  | { kind: 'zoomSelected' }
  | { kind: 'zoom'; factor: number }
  | { kind: 'pan'; dx: number; dy: number }
  | { kind: 'step'; dir: 1 | -1 }
  | { kind: 'open' }
  | { kind: 'approve' }
  | { kind: 'done' }
  | { kind: 'follow' }
  | { kind: 'release' }
  | { kind: 'help' };

export interface KeyLike {
  key: string;
  code: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

/** One arrow press moves the view this far (screen px); with Shift, more. */
export const PAN_STEP_PX = 80;
const PAN_SHIFT_K = 3;
export const ZOOM_STEP = 1.25;

/** The list "?" shows, in the order it shows it. */
export const GRAPH_KEYS_HELP: ReadonlyArray<[string, string]> = [
  ['Tab / Shift+Tab', 'Recorrer los agentes (primero los que te esperan)'],
  ['Enter', 'Abrir su terminal'],
  ['A', 'Aprobar su permiso (dos veces seguidas si es riesgoso o si no lo elegiste con Tab)'],
  ['H', 'Marcar «Hecho» lo que te dejó (dos veces si no lo elegiste con Tab)'],
  ['F', 'Seguirlo con la cámara'],
  ['Esc', 'Dejar de seguir, o soltarlo'],
  ['Shift+1', 'Ver a todos'],
  ['Shift+2', 'Acercarte al elegido'],
  ['+ / −', 'Acercar o alejar'],
  ['Flechas', 'Mover la vista (con Shift, más)'],
  ['?', 'Mostrar u ocultar esta lista'],
];

/** What the mouse (or a finger) does, under the keys in the same list. */
export const GRAPH_MOUSE_HELP: ReadonlyArray<[string, string]> = [
  ['Clic derecho', 'El menú del agente (con el dedo: mantenelo apretado)'],
  ['Ctrl+clic · Shift y arrastrar', 'Elegir varios'],
  ['Arrastrar un agente sobre otro', 'Pasarle su última respuesta'],
  ['Doble clic en el hueco de una junta', 'Enfocarla'],
  ['Mouse quieto sobre un agente', 'Su ficha, con su equipo resaltado'],
];

const ARROWS: Record<string, [number, number]> = {
  // The view moves toward the arrow: the content goes the other way.
  ArrowLeft: [1, 0],
  ArrowRight: [-1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
};

const LETTERS: Record<string, GraphKey> = {
  a: { kind: 'approve' },
  h: { kind: 'done' },
  f: { kind: 'follow' },
};

export function graphKeyOf(ev: KeyLike): GraphKey | null {
  if (ev.ctrlKey || ev.altKey || ev.metaKey) return null;
  // By position: Shift+1 is "!" on most layouts, and something else on others.
  if (ev.shiftKey && ev.code === 'Digit1') return { kind: 'fit' };
  if (ev.shiftKey && ev.code === 'Digit2') return { kind: 'zoomSelected' };
  if (ev.key === '+' || ev.key === '=' || ev.code === 'NumpadAdd') {
    return { kind: 'zoom', factor: ZOOM_STEP };
  }
  if (ev.key === '-' || ev.code === 'NumpadSubtract')
    return { kind: 'zoom', factor: 1 / ZOOM_STEP };
  const arrow = ARROWS[ev.key];
  if (arrow) {
    const step = PAN_STEP_PX * (ev.shiftKey ? PAN_SHIFT_K : 1);
    return { kind: 'pan', dx: arrow[0] * step, dy: arrow[1] * step };
  }
  if (ev.key === 'Tab') return { kind: 'step', dir: ev.shiftKey ? -1 : 1 };
  if (ev.key === 'Enter') return { kind: 'open' };
  if (ev.key === 'Escape') return { kind: 'release' };
  if (ev.key === '?') return { kind: 'help' };
  return LETTERS[ev.key.toLowerCase()] ?? null;
}

/** A key that acts on an agent (A, H) asks to be pressed twice in a row when
 *  it could be a slip: a risky permission, or an agent you did not pick with
 *  Tab (a click leaves the graph focused, and a stray "a" typed for the
 *  terminal must not approve anything). The first press arms it for
 *  `windowMs`; any other key in between disarms it (the caller forgets
 *  `armed`), so typing a word never confirms. */
export function twoPressStep(
  needsTwo: boolean,
  armed: { token: string; at: number } | null,
  token: string,
  now: number,
  windowMs: number,
): 'act' | 'arm' {
  if (!needsTwo) return 'act';
  const live = !!armed && armed.token === token && now - armed.at < windowMs;
  return live ? 'act' : 'arm';
}
