/**
 * Jarvis's tools (jarvis.ts): everything a supervisor has, plus opening an
 * agent, closing one, handing one agent's answer to another and its notebook.
 * Only the supervisor of everyone gets them (supervisorMcp.ts). What it opens,
 * closes and passes on is written in the notebook by the office itself, so the
 * notebook does not depend on Jarvis remembering to.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as path from 'path';
import { z } from 'zod';

import { readWhen, whenText } from '../../../core/src/askTime.js';
import { readChat } from '../agentChat.js';
import { cleanEffort, cleanModel } from '../agentEdits.js';
import { identityMessage, runningBackground, spokenName } from '../agentIdentity.js';
import type { AgentRuntime } from '../agentRuntime.js';
import type { AgentStateStore } from '../agentStateStore.js';
import { LAUNCH_PROMPT_MAX_LENGTH } from '../clientMessageHandler.js';
import { listDirectories, normalizeDirectoryPath, validateDirectoryPath } from '../directories.js';
import { collectDirectorySuggestions } from '../directorySuggestions.js';
import { hostDirectory } from '../hostDirectory.js';
import { type NewAsk } from '../pendingAsks/pendingAsks.js';
import { knownPrLinks } from '../pendingAsks/pendingAsksWatch.js';
import type { Proposed } from '../pendingAsks/resolutions.js';
import type { PendingPermission } from '../permissionBroker.js';
import { claudeProvider } from '../providers/index.js';
import { closeOfficeAgent } from '../terminal/closeAgent.js';
import { handOffText, sendToTerminal } from '../terminal/handOff.js';
import type { PtySessionManager } from '../terminal/ptySessionManager.js';
import { launchAgent } from '../terminal/standaloneAgentLauncher.js';
import { windowEnters } from '../terminal/windowInput.js';
import type { AgentState } from '../types.js';
import { JARVIS_NAME, Notebook } from './jarvis.js';
import { describeRequest } from './supervisorRelay.js';
import { SupervisorTools, type ToolDeps, VALENTIN_DECIDES } from './supervisorTools.js';
import type { HumanLine } from './valentinConsent.js';

/** The same limit as the launch dialog's name field. */
const NICKNAME_MAX = 32;

export interface JarvisLaunch {
  directoryPath: string;
  prompt: string;
  nickname: string;
  model?: string;
  effort?: string;
}

/** What only Jarvis can do, wired by the office (jarvisPowers). */
export interface JarvisDeps extends ToolDeps {
  /** Open an agent; resolves to its id, or null when it could not start. */
  launch?: (options: JarvisLaunch) => Promise<number | null>;
  close?: (id: number) => boolean;
  /** Where an agent can be opened: the office's folders and recent ones. */
  folders?: () => Array<{ name: string; path: string }>;
  notebook?: Notebook;
}

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });

/** What dejar_pendiente says when it cannot read a time. */
const UNREAD_TIME =
  'No entendí la hora. Sirven: HH:MM (14:45), «mañana», «mañana 11:00», «jueves 12 a las 11», «13/11 9:00», «el lunes», «esta noche», «después de: <reunión del calendario>» o «cuando se mergee #12». No lo dejé: probá de nuevo.';

export class JarvisTools extends SupervisorTools {
  private readonly notebook: Notebook;

  constructor(
    private readonly jarvis: JarvisDeps,
    supervisorId: number,
  ) {
    super(jarvis, supervisorId);
    this.notebook = jarvis.notebook ?? new Notebook();
  }

  /**
   * A permission the office keeps for Valentín: what is risky he approves
   * himself; the rest he may approve in words, once the office showed it to
   * him and checked that his yes is his (valentinConsent.ts).
   */
  protected override refused(
    request: PendingPermission,
    agent: AgentState,
    verdict: { reason: string; askable?: boolean },
  ): string {
    const desk = this.jarvis.consent;
    if (!verdict.askable || !desk) {
      return `${VALENTIN_DECIDES} (${verdict.reason}). Esto lo aprueba él mismo, con el botón de la oficina o en la terminal: no le pidas un sí de palabra. El permiso sigue pendiente.`;
    }
    const consent = desk.check(
      request.requestId,
      this.valentinLines(),
      windowEnters(this.supervisorId),
    );
    if (consent.ok) {
      this.showToValentin(undefined);
      return this.allow(request, agent, ' con el sí de Valentín');
    }
    if (!consent.showAgain) {
      return `${consent.reason} El permiso sigue pendiente: si te dice que sí, volvé a llamar a aprobar_permiso; si dice que no, rechazar_permiso; o que use los botones.`;
    }
    desk.show(request.requestId);
    this.showToValentin(request.requestId);
    return `Esto lo decide Valentín (${verdict.reason}), y te lo puede autorizar de palabra. La oficina ya le muestra este permiso en el medio de la pantalla, con Aprobar y Rechazar. Preguntáselo en una línea «Te toca:»: que «${spokenName(agent)}» quiere ${describeRequest(request.toolName, request.toolInput)}, y tu recomendación. Si te contesta que sí, por voz o en tu chat, volvé a llamar a aprobar_permiso con este mismo id: la oficina verifica que el sí sea suyo.`;
  }

  /** What Valentín has pending right now, with the ids to close it. */
  pendientes(): string {
    const asks = this.jarvis.pendingAsks?.();
    if (!asks) return 'Esta oficina no lleva la lista de pendientes.';
    const open = asks.pending();
    if (open.length === 0) return 'Valentín no tiene nada pendiente en la lista.';
    return open
      .map((a) => {
        const notes = [
          a.heldUntil !== undefined && a.heldUntil > Date.now()
            ? `lo dejó «${a.from}» al cerrarse; él todavía no lo ve: si se lo pasás, usá dejar_pendiente con reemplaza ${a.id}; si no hace falta, cerralo`
            : undefined,
          a.question ? 'una pregunta tuya sin «Te toca:» que anotó la oficina' : undefined,
          a.answeredAt !== undefined
            ? `ya te contestó (${a.answeredHow ?? 'en el chat'}): comprobalo y cerralo`
            : undefined,
          a.seemsDone ? `parece resuelto: ${a.seemsDone}; comprobalo y cerralo` : undefined,
          a.staleSince !== undefined
            ? 'nadie lo movió en un día: preguntale si sigue o cerralo'
            : undefined,
          a.key ? `clave ${a.key}` : undefined,
        ].filter(Boolean);
        const note = notes.length > 0 ? ` (${notes.join('; ')})` : '';
        return `- ${a.id} · de ${a.from} · ${new Date(a.at).toLocaleString('es-AR')}: ${a.text}${note}`;
      })
      .join('\n');
  }

  dejarPendiente(
    texto: string,
    comando?: string,
    more: {
      paraAntesDe?: string;
      noAntesDe?: string;
      porQue?: string;
      siNo?: string;
      clave?: string;
      opciones?: string[];
      reemplaza?: string[];
      cuando?: string;
    } = {},
  ): string {
    const asks = this.jarvis.pendingAsks?.();
    if (!asks) return 'Esta oficina no lleva la lista de pendientes.';
    const times = this.timesFor(more);
    if (typeof times === 'string') return times;
    const noted = asks.open().filter((a) => a.question);
    const before = new Set(asks.pending().map((a) => a.id));
    const ask = asks.add({
      from: JARVIS_NAME,
      text: texto,
      command: comando?.trim() || undefined,
      knownPrs: knownPrLinks(this.deps.store),
      ...times,
      why: more.porQue,
      ifNot: more.siNo,
      key: more.clave,
      options: more.opciones,
      replaces: more.reemplaza,
    });
    if (!ask) return 'Falta el texto: qué tiene que hacer Valentín.';
    const twin = noted
      .filter((a) => a.id !== ask.id)
      .map((a) => `${a.id} («${a.text}»)`)
      .join(', ');
    const hint = twin
      ? ` La oficina ya le había anotado una pregunta tuya: ${twin}. Si es lo mismo, cerrala con cerrar_pendiente.`
      : '';
    const joined = before.has(ask.id)
      ? `Era lo mismo que ${ask.id}: lo junté ahí, con tus palabras nuevas.`
      : `Quedó en sus Pendientes como ${ask.id}, sin interrumpirlo.`;
    return `${joined}${this.whenSaid(times)} Si él te contesta, se marca solo; cerralo con cerrar_pendiente cuando compruebes que se hizo.${hint}`;
  }

  /**
   * dejar_pendiente's times: «cuando» (a date, «mañana», «el lunes»,
   * «después de: Demo AgroActiva», «cuando se mergee #12») and the older
   * para_antes_de / no_antes_de, which now take a day too. A string is why
   * it could not tell.
   */
  private timesFor(more: {
    paraAntesDe?: string;
    noAntesDe?: string;
    cuando?: string;
  }): Pick<NewAsk, 'due' | 'notBefore' | 'after' | 'afterPr'> | string {
    const now = Date.now();
    const meetings = this.deps.meetings?.() ?? [];
    const read = (said: string) => readWhen(said, now, meetings);
    const out: Pick<NewAsk, 'due' | 'notBefore' | 'after' | 'afterPr'> = {};
    if (more.paraAntesDe) {
      const due = read(more.paraAntesDe);
      if (!due) return UNREAD_TIME;
      out.due = due.at;
    }
    const start = more.cuando ?? more.noAntesDe;
    if (!start) return out;
    const pr = /\bmerge\w*\b.*?(#\d+|https:\/\/github\.com\/\S+\/pull\/\d+)/i.exec(start);
    if (pr) {
      const url = pr[1].startsWith('#')
        ? knownPrLinks(this.deps.store).get(Number(pr[1].slice(1)))
        : pr[1];
      if (!url) return `No sé de qué repo es el PR ${pr[1]}: pasalo con su link de GitHub.`;
      return { ...out, afterPr: url };
    }
    const when = read(start);
    if (!when) {
      return /^\s*(?:después de|despues de)\b/i.test(start)
        ? `No encuentro «${start}» en su calendario: pasame el día y la hora (por ejemplo «jueves 12 11:00»). No lo dejé.`
        : UNREAD_TIME;
    }
    return { ...out, notBefore: when.at, ...(when.after ? { after: when.after } : {}) };
  }

  /** What Jarvis is told about the times it set, so he can tell it was understood. */
  private whenSaid(times: Pick<NewAsk, 'due' | 'notBefore' | 'after' | 'afterPr'>): string {
    const now = Date.now();
    const parts = [
      times.after
        ? `Le aparece después de «${times.after}» (${whenText(times.notBefore ?? now, now)}) y se mueve con esa reunión.`
        : times.notBefore !== undefined
          ? `No le aparece adelante antes de ${whenText(times.notBefore, now)}.`
          : undefined,
      times.afterPr ? `Le aparece cuando se mergee ${times.afterPr}.` : undefined,
      times.due !== undefined ? `Vence ${whenText(times.due, now)}.` : undefined,
    ].filter(Boolean);
    return parts.length ? ` ${parts.join(' ')}` : '';
  }

  /**
   * Several asks settled from one sentence of Valentín's: the office shows
   * how each was taken, with «Deshacer», and applies it in a few seconds.
   */
  resolverPendientes(items: readonly Proposed[]): string {
    const resolutions = this.deps.askResolutions?.();
    if (!resolutions) return 'Esta oficina no resuelve pendientes desde acá: usá cerrar_pendiente.';
    if (items.length === 0) return 'No me pasaste ninguno.';
    const { taken, refused } = resolutions.propose(items);
    const parts = [
      taken.length
        ? `Le muestro cómo lo tomé, con «Deshacer»; se aplica en unos segundos si no lo deshace: ${taken.join('; ')}. Un merge lo hace él manteniendo apretado el botón.`
        : undefined,
      refused.length ? `No tomé: ${refused.join('; ')}.` : undefined,
    ].filter(Boolean);
    return parts.join(' ');
  }

  cerrarPendiente(id: string, motivo?: string): string {
    const asks = this.jarvis.pendingAsks?.();
    if (!asks) return 'Esta oficina no lleva la lista de pendientes.';
    const known = asks.find(id);
    if (!known) return `No hay ningún pendiente «${id}». Abiertos:\n${this.pendientes()}`;
    if (known.closedAt !== undefined) {
      return `${known.id} ya estaba cerrado (${known.closedHow ?? 'sin motivo'}).`;
    }
    const why = motivo?.trim();
    asks.closeById(known.id, why ? `Lo cerró ${JARVIS_NAME}: ${why}` : `Lo cerró ${JARVIS_NAME}`);
    return `Cerré ${known.id}: «${known.text}». Valentín lo puede reabrir si no era así.`;
  }

  override rechazarPermiso(requestId: string, motivo?: string): string {
    const answer = super.rechazarPermiso(requestId, motivo);
    if (this.jarvis.consent?.shownRequest() === requestId.trim()) {
      this.jarvis.consent.done(requestId.trim());
      this.showToValentin(undefined);
    }
    return answer;
  }

  /** Valentín's lines in Jarvis's own chat (typed or spoken), oldest first. */
  private valentinLines(): HumanLine[] {
    const me = this.jarvis.store.get(this.supervisorId);
    if (!me?.jsonlFile) return [];
    return readChat(me.jsonlFile).flatMap((item) =>
      item.role === 'user' && item.at !== undefined
        ? [{ id: item.id, at: item.at, text: item.text }]
        : [],
    );
  }

  /** What the visor shows Valentín: this permission, or none. */
  private showToValentin(requestId: string | undefined): void {
    const me = this.jarvis.store.get(this.supervisorId);
    if (!me || me.asksValentin === requestId) return;
    me.asksValentin = requestId;
    this.jarvis.store.broadcast(identityMessage(this.supervisorId, me));
  }

  protected override outsideNote(): string {
    return 'no corre en la oficina (escribile con SendMessage)';
  }

  protected override noTerminal(name: string): string {
    return `«${name}» no corre en la oficina: escribile con SendMessage (buscalo con ListAgents).`;
  }

  /** Every folder Jarvis may open an agent in, deduped, the office's own first. */
  private folderList(): Array<{ name: string; path: string }> {
    const seen = new Set<string>();
    const out: Array<{ name: string; path: string }> = [];
    const add = (name: string, folder: string | undefined) => {
      if (!folder) return;
      const key = normalizeDirectoryPath(folder);
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ name, path: folder });
    };
    for (const f of this.jarvis.folders?.() ?? []) add(f.name, f.path);
    for (const [, agent] of this.members()) add(path.basename(agent.cwd ?? ''), agent.cwd);
    return out;
  }

  carpetas(): string {
    const folders = this.folderList();
    if (folders.length === 0) {
      return 'No conozco ninguna carpeta todavía: pasale a lanzar_agente la ruta completa.';
    }
    return folders.map((f) => `- «${f.name}»: ${f.path}`).join('\n');
  }

  /** A folder by its name (exact, then a unique partial match) or its full path. */
  private folder(query: string): string | { error: string } {
    const q = query.trim().replace(/^«|»$/g, '');
    if (!q)
      return { error: 'Decime en qué carpeta: su nombre (mirá carpetas) o la ruta completa.' };
    if (path.isAbsolute(q)) {
      const valid = validateDirectoryPath(q);
      return valid.ok ? valid.path : { error: `Esa carpeta no existe: ${q}` };
    }
    const folders = this.folderList();
    const lower = q.toLowerCase();
    const exact = folders.filter((f) => f.name.toLowerCase() === lower);
    if (exact.length === 1) return exact[0].path;
    const partial = folders.filter((f) => f.name.toLowerCase().includes(lower));
    if (partial.length === 1) return partial[0].path;
    const names = folders.map((f) => `«${f.name}»`).join(', ');
    return {
      error:
        partial.length > 1 || exact.length > 1
          ? `Hay más de una carpeta que coincide con «${q}»: pasame la ruta completa. Carpetas: ${names}.`
          : `No conozco la carpeta «${q}». Carpetas: ${names || 'ninguna todavía'}. También sirve la ruta completa.`,
    };
  }

  override async lanzarAgente(input: {
    carpeta: string;
    tarea: string;
    apodo: string;
    modelo?: string;
    esfuerzo?: string;
  }): Promise<string> {
    if (!this.jarvis.launch) return 'Esta oficina no puede abrir agentes (no tiene terminales).';
    const tarea = input.tarea.trim();
    if (!tarea) return 'Falta la tarea: un agente sin tarea no sirve.';
    if (tarea.length > LAUNCH_PROMPT_MAX_LENGTH) {
      return `La tarea es muy larga (máximo ${LAUNCH_PROMPT_MAX_LENGTH} caracteres): resumila y, si hace falta, pasale el resto después con escribir_a_agente.`;
    }
    const apodo = input.apodo.trim().replace(/^«|»$/g, '');
    if (!apodo) return 'Falta el apodo: uno corto y fácil de decir.';
    if (apodo.length > NICKNAME_MAX) return `El apodo es muy largo (máximo ${NICKNAME_MAX}).`;
    // Among top-level agents (subagents are not called by name).
    const taken = [...this.deps.store.values()].some(
      (a) =>
        a.leadAgentId === undefined &&
        !a.spawnToolUseId &&
        spokenName(a).toLowerCase() === apodo.toLowerCase(),
    );
    if (taken) return `Ya hay un agente «${apodo}»: elegí otro apodo.`;
    const model = input.modelo ? cleanModel(input.modelo) : undefined;
    if (input.modelo && !model)
      return `No conozco el modelo «${input.modelo}» (usá opus, sonnet, haiku o fable).`;
    const effort = input.esfuerzo ? cleanEffort(input.esfuerzo) : undefined;
    if (input.esfuerzo && !effort) return `No conozco el esfuerzo «${input.esfuerzo}».`;
    const folder = this.folder(input.carpeta);
    if (typeof folder !== 'string') return folder.error;

    const id = await this.jarvis.launch({
      directoryPath: folder,
      prompt: tarea,
      nickname: apodo,
      model,
      effort,
    });
    if (id === null)
      return `No pude abrir a «${apodo}» en ${folder}: la oficina muestra el motivo.`;
    this.notebook.add(`Abrí a «${apodo}» (id ${id}) en ${path.basename(folder)}: ${tarea}`);
    return `Abrí a «${apodo}» (id ${id}) en ${folder}. Ya arrancó con la tarea; te aviso cuando termine.`;
  }

  override cerrarAgente(query: string): string {
    if (!this.jarvis.close) return 'Esta oficina no puede cerrar agentes.';
    const found = this.find(query);
    if (typeof found === 'string') return found;
    const [id, agent] = found;
    const name = spokenName(agent);
    if (!agent.officeTerminal) return `«${name}» no corre en la oficina: no lo puedo cerrar.`;
    if (this.pendingOf(agent).length > 0) {
      return `«${name}» tiene un permiso pendiente: primero hay que contestarlo.`;
    }
    if (!agent.isWaiting) {
      return `«${name}» está trabajando: no lo cierro. Si hay que cortarlo, que lo decida Valentín.`;
    }
    if (runningBackground(agent).length > 0) {
      return `«${name}» está esperando algo que corre en segundo plano: no lo cierro todavía.`;
    }
    const left = agent.yourTurn && !agent.yourTurn.merged ? agent.yourTurn : undefined;
    if (!this.jarvis.close(id)) return `No pude cerrar a «${name}».`;
    this.notebook.add(`Cerré a «${name}».`);
    return `Cerré a «${name}». Su conversación queda guardada.${this.leftBehind(left)}`;
  }

  /** What an agent just closed had asked of Valentín and nobody settled, in words.
   *  The office has already kept it (PendingAsksWatch), so nothing is lost if
   *  Jarvis forgets; it says so because Jarvis may have relayed it already. */
  private leftBehind(left: AgentState['yourTurn']): string {
    if (!left) return '';
    const asks = this.jarvis.pendingAsks?.();
    if (!asks)
      return ` Le había dejado a Valentín: «${left.text}»: pasáselo si todavía no lo hiciste.`;
    const ask = asks.byTurn(left.id);
    if (!ask) return ''; // He had marked it done before.
    if (ask.closedAt !== undefined) return '';
    if (ask.heldUntil !== undefined) {
      return ` Le había dejado a Valentín: «${ask.text}». La oficina lo guarda como ${ask.id} y se lo muestra en 5 minutos si no lo tomás vos: si se lo pasás, usá dejar_pendiente con reemplaza ${ask.id} (queda uno solo, con tus palabras); si ya no hace falta, cerralo con cerrar_pendiente.`;
    }
    return ` Le había dejado a Valentín: «${ask.text}». Quedó en sus Pendientes como ${ask.id}: si ya se lo pasaste con un pedido tuyo, cerralo con cerrar_pendiente.`;
  }

  pasarResultado(de: string, a: string, nota?: string): string {
    const from = this.find(de);
    if (typeof from === 'string') return from;
    const to = this.find(a);
    if (typeof to === 'string') return to;
    const [fromId, fromAgent] = from;
    const [toId, toAgent] = to;
    if (fromId === toId) return 'Es el mismo agente: no tiene sentido pasárselo a sí mismo.';
    const reply = fromAgent.lastReply?.trim();
    if (!reply) return `«${spokenName(fromAgent)}» todavía no respondió nada.`;
    const terminal = this.deps.terminalOf(toId);
    if (!terminal) return this.noTerminal(spokenName(toAgent));
    const extra = nota?.trim();
    const body = handOffText(spokenName(fromAgent), reply);
    sendToTerminal(terminal, `${this.signature()} ${extra ? `${extra}\n\n${body}` : body}`);
    this.notebook.add(
      `Le pasé a «${spokenName(toAgent)}» lo de «${spokenName(fromAgent)}»${extra ? `: ${extra}` : '.'}`,
    );
    return `Listo: «${spokenName(toAgent)}» recibió lo último de «${spokenName(fromAgent)}».`;
  }

  protected override wrote(agent: AgentState, message: string): void {
    this.notebook.add(`Le escribí a «${spokenName(agent)}»: ${message}`);
  }

  bitacora(): string {
    return this.notebook.read();
  }

  anotar(nota: string): string {
    if (!nota.trim()) return 'La nota está vacía.';
    return this.notebook.add(nota) ? 'Anotado.' : 'No pude guardar la nota.';
  }
}

/** Register Jarvis's own tools (the shared ones are registered by the caller). */
export function registerJarvisTools(server: McpServer, tools: JarvisTools): void {
  server.registerTool(
    'carpetas',
    { description: 'Las carpetas donde podés abrir un agente: su nombre y su ruta.' },
    () => text(tools.carpetas()),
  );
  server.registerTool(
    'lanzar_agente',
    {
      description:
        'Abre un agente nuevo de Claude Code en la oficina, con su primera tarea. Valentín lo ve en el tablero y te llegan sus avisos como los de cualquier otro.',
      inputSchema: {
        carpeta: z.string().describe('Nombre de la carpeta (ver carpetas) o ruta completa'),
        tarea: z
          .string()
          .describe('Su primer mensaje: qué hacer, en qué repo o ticket y qué entregar'),
        apodo: z.string().describe('Corto, fácil de decir y distinto de los que ya hay'),
        modelo: z
          .string()
          .optional()
          .describe('opus, sonnet, haiku o fable; sin esto, el de siempre'),
        esfuerzo: z
          .string()
          .optional()
          .describe('low, medium, high, xhigh o max; sin esto, el de siempre'),
      },
    },
    async (input) => text(await tools.lanzarAgente(input)),
  );
  server.registerTool(
    'cerrar_agente',
    {
      description:
        'Cierra un agente de la oficina que terminó (su conversación queda guardada). No cierra uno que está trabajando, esperando algo o con un permiso pendiente.',
      inputSchema: { agente: z.string().describe('Nombre o id del agente') },
    },
    ({ agente }) => text(tools.cerrarAgente(agente)),
  );
  server.registerTool(
    'pasar_resultado',
    {
      description:
        'Le manda a un agente lo último que respondió otro, con una nota tuya opcional (qué hacer con eso).',
      inputSchema: {
        de: z.string().describe('Nombre o id del agente que lo hizo'),
        a: z.string().describe('Nombre o id del agente que lo recibe'),
        nota: z.string().optional().describe('Qué tiene que hacer con eso'),
      },
    },
    ({ de, a, nota }) => text(tools.pasarResultado(de, a, nota)),
  );
  server.registerTool(
    'bitacora',
    {
      description:
        'Tu libreta: lo que abriste, cerraste y pasaste, y lo que anotaste (decisiones, pendientes). Lo más nuevo, al final.',
    },
    () => text(tools.bitacora()),
  );
  server.registerTool(
    'pendientes',
    {
      description:
        'Lo que Valentín tiene pendiente en su lista de la oficina, con quién lo pidió, desde cuándo y el id para cerrarlo.',
    },
    () => text(tools.pendientes()),
  );
  server.registerTool(
    'dejar_pendiente',
    {
      description:
        'Deja un pedido en los Pendientes de Valentín SIN interrumpirlo: no aparece en el medio de la pantalla ni se dice en voz alta. Para lo que puede esperar; lo urgente va en una línea «Te toca:». Su vista «Ahora» le muestra primero lo que vence antes, frena a más agentes o va a producción: dale la hora y el motivo cuando los sepas. Si es un merge, pasá el comando `gh pr merge <número> --repo <dueño/repo> --merge` (con --match-head-commit si corresponde): tendrá un botón «Mergear».',
      inputSchema: {
        texto: z.string().describe('Qué tiene que hacer él, en una línea'),
        comando: z
          .string()
          .optional()
          .describe('El comando a correr, si lo hay: tendrá un botón para copiarlo'),
        cuando: z
          .string()
          .optional()
          .describe(
            'Desde cuándo corresponde: no le aparece adelante antes. Sirve «23:00», «mañana», «mañana 11:00», «jueves 12 a las 11», «13/11 9:00», «el lunes», «esta noche», «después de: Demo AgroActiva» (una reunión de su calendario: se mueve con ella) o «cuando se mergee #12». Para algo de mañana, SIEMPRE pasalo: si no, le aparece hoy',
          ),
        para_antes_de: z
          .string()
          .optional()
          .describe('Hora límite: HH:MM de hoy (14:45) o con día («viernes 18:00», «13/11 12:00»)'),
        no_antes_de: z
          .string()
          .optional()
          .describe('Lo mismo que cuando (se mantiene por compatibilidad)'),
        por_que: z.string().optional().describe('Por qué ahora, en pocas palabras'),
        si_no: z.string().optional().describe('Qué pasa si no lo hace, en pocas palabras'),
        clave: z
          .string()
          .optional()
          .describe(
            'Un nombre corto y estable para esto (por ejemplo «merge-webapp-2954» o «migracion-M2»): si lo volvés a pedir con la misma clave, se actualiza el mismo pendiente en vez de sumar otro',
          ),
        opciones: z
          .array(z.string())
          .optional()
          .describe(
            'Si espera una respuesta, las opciones (por ejemplo ["Sí", "No"] o ["La A", "La B"]): tendrá un botón por opción',
          ),
        reemplaza: z
          .array(z.string())
          .optional()
          .describe(
            'Ids de pendientes que este reemplaza o repite (por ejemplo el que dejó un agente al cerrarse): se juntan en uno solo',
          ),
      },
    },
    ({
      texto,
      comando,
      cuando,
      para_antes_de,
      no_antes_de,
      por_que,
      si_no,
      clave,
      opciones,
      reemplaza,
    }) =>
      text(
        tools.dejarPendiente(texto, comando, {
          cuando,
          paraAntesDe: para_antes_de,
          noAntesDe: no_antes_de,
          porQue: por_que,
          siNo: si_no,
          clave,
          opciones,
          reemplaza,
        }),
      ),
  );
  server.registerTool(
    'resolver_pendientes',
    {
      description:
        'Cuando Valentín contesta varios pendientes en una sola frase (por ejemplo, hablando: «mergealo y lo de las páginas públicas, sí; lo de AgroActiva pasalo a mañana»), pasá cómo tomaste cada uno. La oficina se lo muestra con «Deshacer» y lo aplica en unos segundos si no lo deshace. Un merge nunca se hace por voz: queda con un botón que él mantiene apretado. Si no estás seguro de qué pendiente es, preguntale en vez de adivinar.',
      inputSchema: {
        resoluciones: z
          .array(
            z.object({
              id: z.string().describe('El pendiente (p12)'),
              como: z
                .enum(['respuesta', 'hecho', 'posponer', 'mergear'])
                .describe(
                  'respuesta: contestó (Sí, No, una opción); hecho: dijo que ya lo hizo; posponer: para otro momento; mergear: pidió mergear su PR',
                ),
              respuesta: z
                .string()
                .optional()
                .describe('Con como respuesta: lo que contestó («Sí»)'),
              cuando: z
                .string()
                .optional()
                .describe('Con como posponer: «mañana», «el lunes», «después de: Demo AgroActiva»'),
            }),
          )
          .describe('Cómo tomaste cada pendiente de lo que dijo'),
      },
    },
    ({ resoluciones }) => text(tools.resolverPendientes(resoluciones)),
  );
  server.registerTool(
    'cerrar_pendiente',
    {
      description:
        'Cierra un pendiente de Valentín cuando comprobaste que se hizo (o que ya no hace falta). Queda entre los cerrados y él lo puede reabrir.',
      inputSchema: {
        id: z.string().describe('Su id, como lo muestra pendientes (por ejemplo p3)'),
        motivo: z.string().optional().describe('Cómo lo comprobaste, en pocas palabras'),
      },
    },
    ({ id, motivo }) => text(tools.cerrarPendiente(id, motivo)),
  );
  server.registerTool(
    'anotar',
    {
      description:
        'Anota una línea en tu bitácora: una decisión de Valentín, un pendiente, a quién le toca qué.',
      inputSchema: { nota: z.string().describe('Lo que no querés olvidar, en una línea') },
    },
    ({ nota }) => text(tools.anotar(nota)),
  );
}

/** The office's side of Jarvis's tools: how it opens, closes and lists folders. */
export function jarvisPowers(office: {
  store: AgentStateStore;
  runtime?: AgentRuntime;
  ptyManager?: PtySessionManager;
}): Pick<JarvisDeps, 'launch' | 'close' | 'folders'> {
  const { store, runtime, ptyManager } = office;
  if (!runtime || !ptyManager) return {};
  return {
    launch: (o) =>
      launchAgent(
        { store, runtime, ptyManager, provider: claudeProvider },
        {
          ...o,
          // The host's permission posture, like every launch from the office.
          bypassPermissions:
            store.getAdapter()?.getSetting('pixel-agents.bypassPermissions', false) ?? false,
        },
      ),
    close: (id) => closeOfficeAgent({ store, runtime, ptyManager }, id),
    folders: () => {
      const hosts = [hostDirectory()];
      return [
        ...listDirectories(hosts).map((d) => ({ name: d.name, path: d.path })),
        ...collectDirectorySuggestions(claudeProvider, hosts).map((p) => ({
          name: path.basename(p),
          path: p,
        })),
      ];
    },
  };
}
