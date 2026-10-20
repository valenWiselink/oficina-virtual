/**
 * How an agent's model, context and session spend read on screen: "Opus 5.5",
 * "contexto 142 k de 1 M (14%)", "en la sesión: 3,1 M leídos (2,9 M de caché)
 * y 48 k escritos". Pure, so it is tested without a DOM.
 */

/** What a session spent, by kind of token (summed over its requests). */
export interface Spend {
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
}

/** "claude-opus-5-5" → "Opus 5.5"; an id it can't read comes back as is. */
export function modelShortName(id: string): string {
  const parts = id
    .replace(/\[.*\]$/, '')
    .replace(/^claude-/, '')
    .split('-')
    // Release dates (20250929) are not part of the name.
    .filter((p) => !/^\d{8}$/.test(p));
  const family = parts.find((p) => /^[a-z]+$/i.test(p));
  if (!family) return id;
  const numbers = parts.filter((p) => /^\d{1,2}$/.test(p));
  const name = family.charAt(0).toUpperCase() + family.slice(1);
  return numbers.length > 0 ? `${name} ${numbers.join('.')}` : name;
}

const oneDecimal = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });

/** 850 → "850", 4200 → "4,2 k", 142000 → "142 k", 3100000 → "3,1 M". */
export function formatTokens(n: number): string {
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) return `${oneDecimal.format(n < 10_000 ? n / 1000 : Math.round(n / 1000))} k`;
  return `${oneDecimal.format(n / 1_000_000)} M`;
}

/** "contexto 142 k de 1 M (14%)". */
export function contextSummary(tokens: number, max: number): string {
  const pct = max > 0 ? Math.round((tokens / max) * 100) : 0;
  return `contexto ${formatTokens(tokens)} de ${formatTokens(max)} (${pct}%)`;
}

/** "en la sesión: 3,1 M leídos (2,9 M de caché) y 48 k escritos". */
export function spendSummary(spend: Spend): string {
  const read = spend.input + spend.cacheRead + spend.cacheWrite;
  const cache = spend.cacheRead > 0 ? ` (${formatTokens(spend.cacheRead)} de caché)` : '';
  return `en la sesión: ${formatTokens(read)} leídos${cache} y ${formatTokens(spend.output)} escritos`;
}

/** Everything in one line, for a tooltip: model · context · spend. */
export function usageDetail(usage: {
  model?: string;
  contextTokens?: number;
  maxContextTokens?: number;
  spend?: Spend;
}): string {
  return [
    usage.model && modelShortName(usage.model),
    usage.contextTokens && usage.maxContextTokens
      ? contextSummary(usage.contextTokens, usage.maxContextTokens)
      : undefined,
    usage.spend && spendSummary(usage.spend),
  ]
    .filter(Boolean)
    .join(' · ');
}

const EFFORT_WORDS: Record<string, string> = {
  low: 'esfuerzo bajo',
  medium: 'esfuerzo medio',
  high: 'esfuerzo alto',
  xhigh: 'esfuerzo muy alto',
  max: 'esfuerzo máximo',
};

/** "high" → "esfuerzo alto"; nothing for an effort it doesn't know. */
export function effortLabel(effort: string | undefined): string | undefined {
  return effort ? EFFORT_WORDS[effort.trim().toLowerCase()] : undefined;
}
