/**
 * The backdrop follows the day: the brightest paper in the morning, the
 * usual warm paper in the afternoon, a peach dusk and a deeper warm night.
 * Each is a token that index.css also defines for the dark theme. Pure, so
 * the node-side tests can import it; the hook lives in dayTint.ts.
 */
export function dayTintVar(hour: number): string {
  if (hour >= 6 && hour < 12) return '--color-bg';
  if (hour >= 12 && hour < 18) return '--color-bg-dark';
  if (hour >= 18 && hour < 20) return '--color-sky-dusk';
  return '--color-sky-night';
}

/** When "Tema: Según la hora" is dark. */
export function isNightHour(hour: number): boolean {
  return hour >= 20 || hour < 7;
}
