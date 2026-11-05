import type { ArtifactEntry, ArtifactsList } from '../../../core/src/messages.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function dayStart(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "hace 12 min", "hace 3 h", "ayer", "12 oct": near things by the clock, the rest by the calendar. */
export function artifactWhen(at: number, now: number): string {
  const ago = now - at;
  if (ago < MINUTE) return 'recién';
  if (ago < HOUR) return `hace ${Math.floor(ago / MINUTE)} min`;
  const days = Math.round((dayStart(now) - dayStart(at)) / (24 * HOUR));
  if (days <= 0) return `hace ${Math.floor(ago / HOUR)} h`;
  if (days === 1) return 'ayer';
  const sameYear = new Date(at).getFullYear() === new Date(now).getFullYear();
  return new Date(at)
    .toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'short',
      ...(sameYear ? {} : { year: 'numeric' }),
    })
    .replace(/[.,]/g, '');
}

/** Who published it, as far as anyone knows. */
export function artifactAuthor(artifact: ArtifactEntry): string {
  return artifact.agent ?? artifact.folder ?? 'Agente desconocido';
}

/** Case and accents do not matter: «diseno» finds «Diseño». */
function folded(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Mark}/gu, '')
    .toLowerCase();
}

/** What matches every word typed, by title or by who made it; the order stays. */
export function filterArtifacts(artifacts: ArtifactEntry[], query: string): ArtifactEntry[] {
  const words = folded(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return artifacts;
  return artifacts.filter((artifact) => {
    const haystack = folded(`${artifact.title} ${artifact.agent ?? ''} ${artifact.folder ?? ''}`);
    return words.every((word) => haystack.includes(word));
  });
}

export function readArtifactsMessage(msg: Record<string, unknown>): ArtifactsList | null {
  if (msg.type !== 'artifactsList' || !Array.isArray(msg.artifacts)) return null;
  return msg as unknown as ArtifactsList;
}
