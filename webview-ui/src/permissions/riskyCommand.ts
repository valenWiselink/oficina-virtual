/**
 * Requests that are hard to undo or reach outside this PC: pushing, merging,
 * deleting recursively, dropping data, containers, cloud, deploys. They get a
 * red mark and a second click to approve — the cost of a careless "Aprobar"
 * there is not a retry.
 */
const RISKY: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bgit\s+push\b/i, reason: 'sube cambios al remoto' },
  { pattern: /\bgh\s+pr\s+merge\b/i, reason: 'mergea un PR' },
  { pattern: /\bgit\s+(reset\s+--hard|clean\s+-\w*f)/i, reason: 'descarta cambios' },
  {
    pattern: /\brm\s+(-\w*r\w*f|-\w*f\w*r)\b|\bRemove-Item\b[^\n]*-Recurse/i,
    reason: 'borra en forma recursiva',
  },
  { pattern: /\b(drop|truncate)\s+(table|database|schema)\b/i, reason: 'borra datos' },
  { pattern: /\bdelete\s+from\b/i, reason: 'borra filas' },
  { pattern: /\bdocker\b/i, reason: 'usa Docker' },
  { pattern: /\b(aws|kubectl|terraform)\b/i, reason: 'toca la nube' },
  { pattern: /\bdeploy\b/i, reason: 'despliega' },
  { pattern: /--force\b|\s-f\s+origin\b/i, reason: 'fuerza la operación' },
];

/** Why a tool request is risky, or null. Reads the command (shells) or the
 *  whole input otherwise. */
export function riskyReason(toolName: string, toolInput: Record<string, unknown>): string | null {
  const text =
    typeof toolInput.command === 'string' ? toolInput.command : JSON.stringify(toolInput ?? {});
  if (toolName !== 'Bash' && toolName !== 'PowerShell' && typeof toolInput.command !== 'string') {
    return null;
  }
  return RISKY.find((r) => r.pattern.test(text))?.reason ?? null;
}
