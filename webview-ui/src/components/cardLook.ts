import { createContext } from 'react';

/**
 * How the agents' tabs look: their pixel Clawd, or — in Núcleo, asked
 * 2026-11-19: «nada que parezca un juego» — two letters of their name in mono
 * with the state dot.
 */
export type CardLook = 'clawd' | 'sober';

export const CardLookContext = createContext<CardLook>('clawd');

/** What a sober tab shows: three letters of a one-word name («pase3» → «PAS»,
 *  «panel» → «PAN»: two would make them both «PA»), else the initials of its
 *  first two words («wiselink app» → «WA»). */
export function initialsOf(label: string | undefined, agentId: number): string {
  const words = (label ?? '')
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean);
  if (words.length === 0) return String(agentId);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 3);
  return letters.toUpperCase();
}
