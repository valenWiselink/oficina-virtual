/**
 * Claude Code speaks the office's Spanish in its terminals: the spinner's
 * verbs ("✻ Atando cabos…") and its tips (the office's own shortcuts, under
 * the "Oficina" prefix). Handed to every agent the office launches with
 * `--settings <file>` — the user's ~/.claude/settings.json is never touched,
 * and their own sessions outside the office keep Claude Code's defaults.
 * Keys and shapes: https://code.claude.com/docs/en/settings-reference
 * (`spinnerVerbs`, `spinnerTipsOverride`; tip objects need v2.1.247+).
 *
 * The file has one stable path and is never deleted: a background session
 * keeps its launch flags and reads the file again on waking, and Claude Code
 * refuses to start when a `--settings` file is missing (measured,
 * 2.1.306: "Settings file not found"). Turning the switch off (Ajustes →
 * Agentes) empties it to `{}` and stops passing the flag.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { SERVER_JSON_DIR } from '../../core/src/constants.js';

/** Mostly plain verbs, so 300 turns a day do not wear them out; only the
 *  last three are playful. Claude Code adds the "…". */
export const SPINNER_VERBS: readonly string[] = [
  'Analizando',
  'Revisando',
  'Leyendo',
  'Buscando',
  'Armando',
  'Ordenando',
  'Probando',
  'Atando cabos',
  'Dándole vueltas',
  'Comparando',
  'Investigando',
  'Acomodando',
  'Redactando',
  'Ajustando',
  'Corrigiendo',
  'Verificando',
  'Repasando',
  'Planificando',
  'Conectando',
  'Juntando piezas',
  'Puliendo',
  'Rastreando',
  'Desenredando',
  'Hilando fino',
  'Calculando',
  'Preparando',
  'Midiendo',
  'Craneando',
  'Laburando',
  'Cebando un mate',
];

/** Every session waits this many sessions before a tip comes back. */
const TIP_COOLDOWN_SESSIONS = 5;

/** Only what the office really does (officeKeys.ts, usePaletteShortcut.ts,
 *  terminalShortcuts.ts, focusMode.ts): a tip that lies is worse than none. */
export const SPINNER_TIPS: ReadonlyArray<{ id: string; text: string }> = [
  { id: 'oficina.alt-n', text: 'Alt+N te lleva al próximo que te necesita' },
  { id: 'oficina.alt-numero', text: 'Alt+1 a Alt+9 abren a cada agente' },
  {
    id: 'oficina.paleta',
    text: 'Ctrl+K, fuera de la terminal, abre la paleta: agentes, vistas y mensaje a varios',
  },
  {
    id: 'oficina.foco',
    text: 'el Modo foco te da 25 min sin plin (está en la paleta, Ctrl+K)',
  },
  { id: 'oficina.buscar', text: 'Ctrl+Shift+F busca en esta terminal' },
  {
    id: 'oficina.letra',
    text: 'Ctrl+más y Ctrl+menos agrandan o achican la letra de la terminal; Ctrl+0 la vuelve a su tamaño',
  },
  { id: 'oficina.chat', text: 'la pestaña Chat muestra esta charla en burbujas' },
  { id: 'oficina.hecho', text: '«Hecho» en la tarjeta saca un «Te toca» de Te necesita' },
];

/** What the file holds while the switch is on. */
export function spinnerSettings(): Record<string, unknown> {
  return {
    spinnerVerbs: { mode: 'replace', verbs: [...SPINNER_VERBS] },
    spinnerTipsOverride: {
      label: 'Oficina',
      excludeDefault: true,
      tips: SPINNER_TIPS.map((t) => ({ ...t, cooldownSessions: TIP_COOLDOWN_SESSIONS })),
    },
  };
}

export function spinnerSettingsPath(dataDir = path.join(os.homedir(), SERVER_JSON_DIR)): string {
  return path.join(dataDir, 'claude-en-castellano.json');
}

/** The setting (Ajustes → Agentes), on by default. */
let enabled = true;

/** Set the switch and bring the file in line with it (also at start, so a
 *  background session waking later reads what the switch says). */
export function setSpanishTerminal(on: boolean, file = spinnerSettingsPath()): void {
  enabled = on;
  writeIfChanged(file, on);
}

export function spanishTerminalOn(): boolean {
  return enabled;
}

/**
 * The flags for one launch (fresh, --resume, a relaunch, --bg): `--settings`
 * with the file while the switch is on, nothing otherwise. Never throws: an
 * agent in English beats one that does not start.
 */
export function spinnerLaunchArgs(file = spinnerSettingsPath(), on = enabled): string[] {
  if (!on) return [];
  return writeIfChanged(file, true) ? ['--settings', file] : [];
}

/** Whether the file now says what the switch says. */
function writeIfChanged(file: string, on: boolean): boolean {
  const text = `${JSON.stringify(on ? spinnerSettings() : {}, null, 2)}\n`;
  try {
    if (readOrNull(file) !== text) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
    }
    return true;
  } catch (err) {
    console.error(`[Pixel Agents] Could not write ${file}: ${String(err)}`);
    return false;
  }
}

function readOrNull(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return null;
  }
}
