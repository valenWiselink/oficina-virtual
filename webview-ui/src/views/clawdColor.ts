import { CLAWD_BODY_COLORS } from '../constants.js';

/**
 * An agent's body colour: its palette's, turned by its hue shift. There are
 * six palettes; from the seventh agent on the server repeats one with a hue
 * shift, and drawing the plain palette colour made two agents look the same.
 */
export function clawdColor(palette: number, hueShift = 0): string {
  const base =
    CLAWD_BODY_COLORS[
      ((palette % CLAWD_BODY_COLORS.length) + CLAWD_BODY_COLORS.length) % CLAWD_BODY_COLORS.length
    ];
  return hueShift ? rotateHue(base, hueShift) : base;
}

/** A #rrggbb colour with its hue turned by `degrees` (lightness and saturation kept). */
export function rotateHue(hex: string, degrees: number): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return hex;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (((h * 60 + degrees) % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(r1)}${to(g1)}${to(b1)}`;
}
