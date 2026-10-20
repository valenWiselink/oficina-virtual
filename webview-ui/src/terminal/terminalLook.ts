import { useSyncExternalStore } from 'react';

import { TERMINAL_CUSTOM_DEFAULT, TERMINAL_PRESETS, type TerminalLook } from '../constants.js';
import {
  type CustomColors,
  customScheme,
  forClaude,
  isHexColor,
  presetFor,
  presetScheme,
  type TerminalScheme,
} from './terminalSchemes.js';

/**
 * The terminal's colour scheme, chosen in Ajustes and remembered in this
 * browser: "auto" (the scheme matching the theme chosen in Claude Code — the
 * server reads it from ~/.claude.json — since its colours are made for that
 * background), one of the presets, or "custom" (your own colours).
 */
export type TerminalLookChoice = 'auto' | 'custom' | string;

const KEY = 'oficina.terminalAspecto';
const CUSTOM_KEY = 'oficina.terminalPersonal';
const COLORIZE_KEY = 'oficina.terminalColorear';
// The last theme the server reported, so the terminal opens in it instead of
// flashing the other one until the handshake answers.
const CLAUDE_KEY = 'oficina.temaClaude';
/** Choices saved before the presets existed. */
const LEGACY: Record<string, string> = { light: 'papel', dark: 'calido' };

let choice = recall();
let custom = recallCustom();
let claudeLook = recallClaudeLook();
// On unless turned off: Claude's text arrives mostly in one colour.
let colorize = read(COLORIZE_KEY) !== 'no';
let scheme = resolve();
const listeners = new Set<() => void>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* blocked storage: it lasts this tab */
  }
}

function recallClaudeLook(): TerminalLook {
  // Claude Code's own default is dark.
  return read(CLAUDE_KEY) === 'light' ? 'light' : 'dark';
}

function recall(): TerminalLookChoice {
  const saved = read(KEY) ?? 'auto';
  const id = LEGACY[saved] ?? saved;
  const known = id === 'auto' || id === 'custom' || TERMINAL_PRESETS.some((p) => p.id === id);
  return known ? id : 'auto';
}

function recallCustom(): CustomColors {
  try {
    const raw = JSON.parse(read(CUSTOM_KEY) ?? '{}') as Partial<CustomColors>;
    const pick = (k: keyof CustomColors) =>
      typeof raw[k] === 'string' && isHexColor(raw[k]) ? raw[k] : TERMINAL_CUSTOM_DEFAULT[k];
    return {
      background: pick('background'),
      foreground: pick('foreground'),
      accent: pick('accent'),
    };
  } catch {
    return { ...TERMINAL_CUSTOM_DEFAULT };
  }
}

function resolve(): TerminalScheme {
  if (choice === 'custom') return forClaude(customScheme(custom), claudeLook);
  const preset =
    choice === 'auto' ? presetFor(claudeLook) : TERMINAL_PRESETS.find((p) => p.id === choice);
  return forClaude(presetScheme(preset ?? presetFor(claudeLook)), claudeLook);
}

function changed(): void {
  scheme = resolve();
  for (const l of listeners) l();
}

export function setTerminalLookChoice(next: TerminalLookChoice): void {
  if (next === choice) return;
  choice = next;
  write(KEY, next);
  changed();
}

/** Your own colours; picking them also selects "Personalizado". */
export function setCustomColors(next: Partial<CustomColors>): void {
  custom = { ...custom, ...next };
  write(CUSTOM_KEY, JSON.stringify(custom));
  choice = 'custom';
  write(KEY, 'custom');
  changed();
}

/** Whether the colour layer over Claude's text is on (Ajustes). */
export function setTerminalColorize(on: boolean): void {
  colorize = on;
  write(COLORIZE_KEY, on ? 'si' : 'no');
  changed();
}

export function useTerminalColorize(): boolean {
  return useSyncExternalStore(subscribe, () => colorize);
}

/** What Claude Code is set to, as the server reported it. */
export function setClaudeLook(look: TerminalLook): void {
  if (look === claudeLook) return;
  claudeLook = look;
  write(CLAUDE_KEY, look);
  changed();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The choice in Ajustes, re-rendering when it changes. */
export function useTerminalLookChoice(): TerminalLookChoice {
  return useSyncExternalStore(subscribe, () => choice);
}

/** Your own colours (for the pickers). */
export function useCustomColors(): CustomColors {
  return useSyncExternalStore(subscribe, () => custom);
}

/** What "Automático" would show (the scheme matching Claude Code's theme). */
export function useAutoScheme(): TerminalScheme {
  const look = useSyncExternalStore(subscribe, () => claudeLook);
  return presetScheme(presetFor(look));
}

/** Claude Code's light or dark, as the server reported it. */
export function useClaudeLook(): TerminalLook {
  return useSyncExternalStore(subscribe, () => claudeLook);
}

/** The scheme the terminal shows now, re-rendering when it changes. */
export function useTerminalScheme(): TerminalScheme {
  return useSyncExternalStore(subscribe, () => scheme);
}
