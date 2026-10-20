/** Names for a new Clawd when you don't have one in mind (the dice). */
export const NICKNAMES = [
  'Pinza',
  'Tenaza',
  'Clawdio',
  'Cangrejo Veloz',
  'Cascarita',
  'Langostino',
  'Pinzita',
  'Crustáceo',
  'Don Cangrejo',
  'Burbuja',
  'Mariscal',
  'Caparazón',
  'Pancho Pinza',
  'Coral',
  'Arrecife',
  'Marea',
] as const;

/** The name at a dice roll (0..1), never the one already in the field. */
export function rollNickname(roll: number, current: string): string {
  const options = NICKNAMES.filter((n) => n !== current.trim());
  return options[Math.min(options.length - 1, Math.floor(roll * options.length))];
}
