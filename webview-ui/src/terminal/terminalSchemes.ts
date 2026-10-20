import type { ITheme } from '@xterm/xterm';

import {
  MIX_BLACK,
  MIX_WHITE,
  TERMINAL_PRESETS,
  type TerminalLook,
  type TerminalPalette,
  type TerminalPreset,
} from '../constants.js';
import type { PaintColors } from './promptMarks.js';

/**
 * A terminal colour scheme ready to use: xterm's theme plus everything the
 * office paints over the terminal (your messages' band, search matches),
 * derived from the scheme's own background, text and accent so any preset —
 * or your own colours — gets matching decorations. Pure.
 */
export interface TerminalScheme {
  id: string;
  look: TerminalLook;
  theme: ITheme;
  prompt: { background: string; foreground: string; ruler: string };
  /** The colour layer over Claude's text (answerPaint.ts). */
  paint: PaintColors;
  search: {
    matchBackground: string;
    matchOverviewRuler: string;
    activeMatchBackground: string;
    activeMatchBorder: string;
    activeMatchColorOverviewRuler: string;
  };
}

/** Your own colours ("Personalizado"); the rest comes from the base scheme. */
export interface CustomColors {
  background: string;
  foreground: string;
  accent: string;
}

const HEX = /^#[0-9a-f]{6}$/i;
export const isHexColor = (c: string): boolean => HEX.test(c);

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (v: number[]) =>
  '#' +
  v
    .map((c) =>
      Math.round(Math.max(0, Math.min(255, c)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');

/** `a` moved toward `b` by k (0..1), as #rrggbb (what xterm decorations take). */
export function mix(a: string, b: string, k: number): string {
  const ca = channels(a);
  const cb = channels(b);
  return toHex(ca.map((v, i) => v + (cb[i] - v) * k));
}

/** Relative luminance 0..1: dark backgrounds are below 0.4. */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function schemeFrom(id: string, look: TerminalLook, p: TerminalPalette): TerminalScheme {
  const { accent, background: bg, foreground: fg } = p;
  return {
    id,
    look,
    theme: {
      ...p,
      cursor: accent,
      cursorAccent: bg,
      selectionBackground: `${accent}59`,
    },
    prompt: {
      background: mix(bg, accent, look === 'dark' ? 0.2 : 0.16),
      foreground: look === 'dark' ? mix(fg, MIX_WHITE, 0.3) : mix(fg, MIX_BLACK, 0.2),
      ruler: accent,
    },
    paint: {
      tool: { foreground: p.blue },
      dim: { foreground: p.brightBlack },
      yourTurn: {
        foreground: p.yellow,
        background: mix(bg, p.yellow, look === 'dark' ? 0.14 : 0.12),
      },
      listMark: { foreground: accent },
    },
    search: {
      matchBackground: mix(bg, fg, 0.22),
      matchOverviewRuler: mix(bg, fg, 0.5),
      activeMatchBackground: mix(bg, accent, 0.42),
      activeMatchBorder: accent,
      activeMatchColorOverviewRuler: accent,
    },
  };
}

export const presetScheme = (p: TerminalPreset): TerminalScheme =>
  schemeFrom(p.id, p.look, p.palette);

/**
 * A scheme as Claude Code will paint over it. Claude Code's theme is made for
 * one background: on a light one it writes its dim marks in ANSI black,
 * which on a dark scheme sank into the background (the contrast floor only
 * greyed it out). When the scheme's brightness is the opposite of Claude
 * Code's, black and white trade places so those marks land on the readable side.
 */
export function forClaude(scheme: TerminalScheme, claudeLook: TerminalLook): TerminalScheme {
  if (scheme.look === claudeLook) return scheme;
  const { black, white } = scheme.theme;
  return { ...scheme, theme: { ...scheme.theme, black: white, white: black } };
}

/** The first preset of a look ("Automático" uses it). */
export function presetFor(look: TerminalLook): TerminalPreset {
  return TERMINAL_PRESETS.find((p) => p.look === look) ?? TERMINAL_PRESETS[0];
}

/** Your colours over the ANSI colours of the base scheme that suits the
 *  background (a light background keeps the light scheme's darker ANSI). */
export function customScheme(c: CustomColors): TerminalScheme {
  const look: TerminalLook = luminance(c.background) < 0.4 ? 'dark' : 'light';
  return schemeFrom('custom', look, { ...presetFor(look).palette, ...c });
}
