/**
 * What a supervisor agent may approve for one of its agents, decided by the
 * office and not by the supervisor: whatever the supervisor thinks, anything
 * irreversible or outside the agent's folder stays for Valentín. Pure, so the
 * rules are tested one by one.
 *
 * It is an allowlist of tools plus a denylist of commands: an unknown tool, an
 * MCP tool or a command that matches anything risky is refused. False refusals
 * only mean the permission goes to Valentín, which is the safe side.
 *
 * A refusal is `askable` when Valentín may say yes to it in words, to Jarvis
 * (valentinConsent.ts): an external tool that does not touch production or
 * delete, a write outside the folder, a tool not listed here. What is risky
 * (RISKY, production, deleting) he approves himself, with the button or in the
 * terminal.
 */

import * as path from 'path';

export type GuardVerdict = { ok: true } | { ok: false; reason: string; askable?: boolean };

/** An MCP server that is production (`mariadb_prod`, `mongodb_production`). */
const MCP_PRODUCTION = /(^|[_-])(prod|production|produccion)([_-]|$)/i;
/** An MCP tool that deletes, publishes or deploys. */
const MCP_DESTRUCTIVE =
  /(delete|drop|remove|trash|destroy|purge|truncate|wipe|erase|kill|deploy|publish|merge)/i;

/** What an MCP tool may get from Valentín's word. */
function mcpVerdict(toolName: string): GuardVerdict {
  const [, server = '', tool = ''] = toolName.match(/^mcp__(.+?)__(.+)$/) ?? [];
  if (MCP_PRODUCTION.test(server)) {
    return { ok: false, reason: 'usa una herramienta externa (MCP) de producción' };
  }
  if (MCP_DESTRUCTIVE.test(tool)) {
    return { ok: false, reason: 'usa una herramienta externa (MCP) que borra o publica' };
  }
  return { ok: false, reason: 'usa una herramienta externa (MCP)', askable: true };
}

/** Reading and planning tools: nothing changes. */
const READ_ONLY = new Set([
  'Read',
  'Glob',
  'Grep',
  'LS',
  'NotebookRead',
  'WebSearch',
  'WebFetch',
  'TodoWrite',
  'TaskCreate',
  'TaskUpdate',
  'TaskList',
  'TaskGet',
  // Starting a subagent changes nothing by itself: its own tools ask again.
  'Agent',
  'Task',
]);

/** Tools that write one file: fine inside the agent's folder only. */
const FILE_WRITES = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

/** Shells whose command line is checked against RISKY. */
const SHELLS = new Set(['Bash', 'PowerShell']);

/** Commands that are never the supervisor's call, with the reason told back. */
const RISKY: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bgit\s+push\b/i, reason: 'sube cambios al repositorio remoto' },
  {
    pattern:
      /\bgit\s+(reset\s+--hard|clean\s+-\w*f|branch\s+-D|checkout\s+--\s|filter-branch|rebase)\b/i,
    reason: 'puede borrar trabajo en git',
  },
  {
    pattern: /(^|[\s;&|(])(rm|del|erase|rmdir|rd|unlink|shred|rimraf)(\s|$)/i,
    reason: 'borra archivos',
  },
  { pattern: /\b(Remove-Item|Clear-Content)\b/i, reason: 'borra archivos' },
  { pattern: /\b(npm|pnpm|yarn|vsce|cargo|twine)\s+(un)?publish\b/i, reason: 'publica un paquete' },
  {
    pattern: /\bgh\s+(pr\s+(merge|close)|release\s+(create|delete)|repo\s+(delete|edit))\b/i,
    reason: 'cambia algo en GitHub',
  },
  {
    pattern: /\b(deploy|kubectl|terraform|helm|serverless|docker\s+push|vercel|netlify)\b/i,
    reason: 'despliega o toca infraestructura',
  },
  {
    pattern:
      /\b(migrate|db:migrate|migration:run|flyway|liquibase|alembic\s+upgrade|goose\s+up)\b/i,
    reason: 'corre una migración',
  },
  {
    pattern:
      /\b(DROP\s+(TABLE|DATABASE|SCHEMA|INDEX|VIEW)|DELETE\s+FROM|TRUNCATE|ALTER\s+TABLE|UPDATE\s+\S+\s+SET)\b/i,
    reason: 'modifica una base de datos',
  },
  {
    pattern:
      /\b(curl|wget|http)\b[^|;&]*(\s-X\s*(POST|PUT|PATCH|DELETE)|\s--request\s+(POST|PUT|PATCH|DELETE)|\s(-d|--data\S*|-F|--form|-T|--upload-file)\b)/i,
    reason: 'manda datos a un servidor',
  },
  {
    pattern:
      /\b(Invoke-WebRequest|Invoke-RestMethod|iwr|irm)\b[^|;]*-(Method\s+(Post|Put|Patch|Delete)|Body)\b/i,
    reason: 'manda datos a un servidor',
  },
  {
    pattern: /\|\s*(sh|bash|zsh|pwsh|powershell|iex|Invoke-Expression)\b/i,
    reason: 'ejecuta lo que baja de internet',
  },
  {
    pattern:
      /\b(sudo|runas|shutdown|Restart-Computer|Stop-Computer|format\s+[a-z]:|reg\s+(add|delete)|Set-ExecutionPolicy|taskkill|Stop-Process|kill\s+-9)\b/i,
    reason: 'toca el sistema',
  },
];

/** Commands that write somewhere: their absolute paths must be in the folder. */
const WRITES_TO =
  /(>|\b(Out-File|Set-Content|Add-Content|Copy-Item|Move-Item|New-Item|cp|mv|mkdir|tee|touch)\b)/i;
/** Where output is thrown away, not written. */
const DISCARD = /^\/dev\/null$/i;
const ABSOLUTE_PATH = /(?<![\w/\\])([A-Za-z]:[\\/][^\s"'`|;&<>]*|\/(?:[\w.-]+\/)*[\w.-]+)/g;

/** True when `target` is the agent's folder or inside it (case-insensitive). */
function inside(folder: string, target: string): boolean {
  const rel = path.win32.relative(path.win32.resolve(folder), path.win32.resolve(folder, target));
  return rel === '' || (!rel.startsWith('..') && !path.win32.isAbsolute(rel));
}

/**
 * May a supervisor approve this permission request? `cwd` is the folder the
 * asking agent works in (writes outside it are refused).
 */
export function supervisorMayApprove(
  toolName: string,
  input: Record<string, unknown>,
  cwd?: string,
): GuardVerdict {
  if (toolName.startsWith('mcp__')) return mcpVerdict(toolName);
  if (READ_ONLY.has(toolName)) return { ok: true };

  if (FILE_WRITES.has(toolName)) {
    const file = input.file_path ?? input.notebook_path;
    if (typeof file !== 'string' || !cwd) {
      return { ok: false, reason: 'no sé dónde escribe', askable: true };
    }
    return inside(cwd, file)
      ? { ok: true }
      : { ok: false, reason: 'escribe fuera de su carpeta', askable: true };
  }

  if (SHELLS.has(toolName)) {
    const command = typeof input.command === 'string' ? input.command : '';
    if (!command.trim()) return { ok: false, reason: 'no sé qué comando corre' };
    for (const rule of RISKY) {
      if (rule.pattern.test(command)) return { ok: false, reason: rule.reason };
    }
    if (WRITES_TO.test(command)) {
      if (!cwd) {
        return { ok: false, reason: 'escribe y no sé en qué carpeta trabaja', askable: true };
      }
      for (const match of command.matchAll(ABSOLUTE_PATH)) {
        if (DISCARD.test(match[1])) continue;
        if (!inside(cwd, match[1])) {
          return { ok: false, reason: 'escribe fuera de su carpeta', askable: true };
        }
      }
    }
    return { ok: true };
  }

  return { ok: false, reason: `«${toolName}» no está entre lo que puede aprobar`, askable: true };
}
