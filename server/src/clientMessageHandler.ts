import type { StateAdapter } from '../../core/src/adapter.js';
import type { HookProvider } from '../../core/src/provider.js';
import { resendAgentActivity } from './agentActivityResend.js';
import { readChat } from './agentChat.js';
import { buildAgentDiagnostics } from './agentDiagnostics.js';
import { cleanEffort, cleanModel, editAgent, setAgentRun, setSupervision } from './agentEdits.js';
import type { AgentRuntime } from './agentRuntime.js';
import type { AgentStateStore } from './agentStateStore.js';
import type { LoadedAssets, LoadedCharacterSprites, LoadedPetSprites } from './assetLoader.js';
import { claudeStatus, claudeTheme } from './claudeCheck.js';
import {
  getHooksConsent,
  getHooksEnabled,
  readConfig,
  setHooksEnabled,
  writeConfig,
} from './configPersistence.js';
import { HUE_SHIFT_MAX_DEG, PALETTE_COUNT, TERMINAL_REQUIRES_TOKEN_REASON } from './constants.js';
import { cleanFacts, savedDaySummary, writeDaySummary } from './daySummary.js';
import {
  handleDirectoryClientMessage,
  type HostDirectoryEntry,
  listDirectories,
} from './directories.js';
import { collectDirectorySuggestions } from './directorySuggestions.js';
import { pickFolder } from './folderPicker.js';
import { hostDirectory } from './hostDirectory.js';
import { loadLayout, readLayoutFromFile, writeLayoutToFile } from './layoutPersistence.js';
import { openInExplorer, resolveLocalPath } from './openPath.js';
import type { PermissionBroker } from './permissionBroker.js';
import { pendingPermissionMessage } from './permissionMessages.js';
import type { ConsentEffects } from './providers/hook/consentExecutor.js';
import { applyConsentChoice } from './providers/hook/consentExecutor.js';
import { hooksConsentRequest } from './providers/hook/consentGate.js';
import { claudeProvider, hookProviderById, hookProviders } from './providers/index.js';
import { parseScope } from './supervisors/supervision.js';
import { applySupervisionTeam, broadcastSupervision } from './supervisors/supervisionMessages.js';
import { adoptIntoOffice } from './terminal/adoptSession.js';
import { setBackgroundAgents, stopBackground } from './terminal/backgroundSessions.js';
import { handOff } from './terminal/handOff.js';
import type { PtySessionManager } from './terminal/ptySessionManager.js';
import { launchAgent } from './terminal/standaloneAgentLauncher.js';
import { ruleStatus, setRuleInClaudeMd } from './teTocaRule.js';

type WsSend = (message: Record<string, unknown>) => void;

/** Async hook toggle side effect (install/uninstall + script copy). Provided by cli.ts. */
export type SetHooksEnabledSideEffect = (
  providerId: string,
  enabled: boolean,
) => Promise<void> | void;

/**
 * Reload server-side assets after an external-asset-directory change and
 * re-broadcast the updated sprites to the requesting client. Provided by cli.ts,
 * which owns the dist root needed to re-run the loaders.
 */
export type ReloadAssetsSideEffect = (send: WsSend) => Promise<void> | void;

/** Cached assets loaded at server startup. Sent to each WebSocket client on webviewReady. */
export interface AssetCache {
  characters: LoadedCharacterSprites | null;
  pets: LoadedPetSprites | null;
  floorTiles: string[][][] | null;
  wallTiles: string[][][][] | null;
  carpetTiles: string[][][][] | null;
  furniture: LoadedAssets | null;
  defaultLayout: Record<string, unknown> | null;
}

export interface ClientMessageContext {
  store: AgentStateStore;
  runtime?: AgentRuntime;
  cache: AssetCache | null;
  /** Install/uninstall hooks side effect. Needs server url+token known only to cli.ts. */
  onSetHooksEnabled?: SetHooksEnabledSideEffect;
  /** Reload assets after an external-asset-directory change. Needs the dist root, known only to cli.ts. */
  onReloadAssets?: ReloadAssetsSideEffect;
  /**
   * Whether this client may change ANYTHING. An unprivileged client is
   * read-only: it may load and watch the office (`webviewReady`) and every
   * other message is refused at the top of handleClientMessage. Decided
   * per-connection by the transport (wsAuth.standaloneHandshakeVerdict, or the
   * embedded Bearer token); defaults to false so a caller that forgets to pass
   * it gets the safe answer.
   */
  privileged?: boolean;
  /** PTY terminals for standalone-launched agents. Absent in VS Code embedded
   *  mode, where the editor owns terminal lifecycle. */
  ptyManager?: PtySessionManager;
  /** Held PermissionRequests the office can answer. Absent = no approval cards. */
  permissionBroker?: PermissionBroker;
}

// ── Setting key constants (mirror adapters/vscode/constants.ts) ──
const KEY_SOUND_ENABLED = 'pixel-agents.soundEnabled';
const KEY_LAST_SEEN_VERSION = 'pixel-agents.lastSeenVersion';
const KEY_ALWAYS_SHOW_LABELS = 'pixel-agents.alwaysShowLabels';
const KEY_GHOST_HEADLESS_AGENTS = 'pixel-agents.ghostHeadlessAgents';
const KEY_WATCH_ALL_SESSIONS = 'pixel-agents.watchAllSessions';
const KEY_HOOKS_INFO_SHOWN = 'pixel-agents.hooksInfoShown';
const KEY_SHOW_AREAS = 'pixel-agents.showAreas';
const KEY_BYPASS_PERMISSIONS = 'pixel-agents.bypassPermissions';
const KEY_BACKGROUND_AGENTS = 'pixel-agents.backgroundAgents';
const KEY_SHOW_HOST_DIRECTORIES = 'pixel-agents.showHostDirectories';

/**
 * This host's own Directory contribution: the directory the server was started
 * from. Gated on ptyManager for the same reason directoriesLoaded is — no
 * ptyManager means VS Code embedded mode, whose adapter contributes its
 * workspace folders instead and must not have this server's cwd added to them.
 */
function hostDirectoriesFor(ctx: ClientMessageContext): HostDirectoryEntry[] {
  return ctx.ptyManager ? [hostDirectory()] : [];
}

/**
 * The host Directories the drawer lists: all of them while the host's Show
 * setting is on, none while it is off (the default). Only the LIST is gated --
 * a launch still names its agent from hostDirectoriesFor, so an agent started
 * in the start directory keeps its name (and its Area mapping) either way, and
 * a hidden start directory becomes something the suggestions can offer.
 */
function shownHostDirectoriesFor(ctx: ClientMessageContext): HostDirectoryEntry[] {
  return ctx.store.getAdapter()?.getSetting(KEY_SHOW_HOST_DIRECTORIES, false)
    ? hostDirectoriesFor(ctx)
    : [];
}

/**
 * Handle incoming ClientMessage from a WebSocket client.
 *
 * In standalone mode, the server is the authority for all state: assets,
 * layout, settings, agents. Assets are loaded once at startup and cached
 * in memory. Each connecting client receives the full state on webviewReady.
 */
export function handleClientMessage(
  msg: Record<string, unknown>,
  send: WsSend,
  ctx: ClientMessageContext,
): void {
  const { store, runtime, cache } = ctx;
  const adapter = store.getAdapter();

  // Tokenless is read-only. Refused HERE, once, rather than per message, so a
  // message type added later is privileged by default instead of open until
  // someone remembers to gate it.
  if (!ctx.privileged && msg.type !== 'webviewReady') {
    refuseReadOnly(msg, send, ctx);
    return;
  }

  switch (msg.type) {
    case 'webviewReady':
      handleWebviewReady(send, ctx);
      break;

    case 'launchAgent': {
      // Standalone can launch: the agent runs in a server-side PTY streamed to
      // the browser drawer (a shell running as the operator -- privileged, like
      // every message past the read-only gate above).
      if (!runtime || !ctx.ptyManager) break;
      // Permission posture is a persisted per-host setting, never a per-launch
      // field: the client sends where to launch, plus the name and colour
      // chosen in the launch dialog. No directoryPath falls back to the server
      // cwd (launchStandaloneAgent's own default). As a background session when
      // that mode is on (launchAgent), so it outlives the office.
      void launchAgent(
        { store, runtime, ptyManager: ctx.ptyManager, provider: claudeProvider },
        {
          directoryPath: msg.directoryPath as string | undefined,
          bypassPermissions: adapter?.getSetting(KEY_BYPASS_PERMISSIONS, false) ?? false,
          ...launchAppearance(msg),
          prompt: launchPrompt(msg),
          model: cleanModel(msg.model),
          effort: cleanEffort(msg.effort),
          supervision: parseScope(msg.supervision) ?? undefined,
        },
      ).then((id) => {
        // Born a supervisor: every office learns who it watches over.
        if (id !== null && msg.supervision) broadcastSupervision(store);
      });
      break;
    }

    case 'editAgent':
      // Name and colour, for any agent (the office's or an outside one).
      editAgent(store, runtime?.resumableSessions ?? undefined, Number(msg.id), msg);
      break;

    case 'setAgentRun': {
      // Model and effort: relaunches an office terminal with --resume. Async;
      // the reply goes only to the asking office.
      const id = Number(msg.id);
      if (!runtime || !ctx.ptyManager) {
        send({ type: 'agentRunResult', id, ok: false, reason: 'Esta oficina no tiene terminales' });
        break;
      }
      void setAgentRun(
        { store, runtime, ptyManager: ctx.ptyManager, provider: claudeProvider },
        id,
        msg,
        adapter?.getSetting(KEY_BYPASS_PERMISSIONS, false) ?? false,
      ).then((result) =>
        send({
          type: 'agentRunResult',
          id,
          ok: result.ok,
          newId: result.ok ? result.newId : undefined,
          // "queued": it was working; the change waits for its turn to end.
          reason: result.ok ? (result.queued ? 'queued' : undefined) : result.reason,
        }),
      );
      break;
    }

    case 'setSupervision': {
      // Make an office agent a supervisor (or a plain agent again): relaunches
      // it with --resume plus its MCP and role. Reply to the asking office only.
      const id = Number(msg.id);
      const scope = parseScope(msg.scope);
      const answer = (ok: boolean, reason?: string, newId?: number) =>
        send({ type: 'supervisionResult', id, ok, reason, newId });
      if (!runtime || !ctx.ptyManager) {
        answer(false, 'Esta oficina no tiene terminales');
        break;
      }
      if (scope === undefined) {
        answer(false, 'No entendí a quién tiene que supervisar');
        break;
      }
      void setSupervision(
        { store, runtime, ptyManager: ctx.ptyManager, provider: claudeProvider },
        id,
        scope,
        adapter?.getSetting(KEY_BYPASS_PERMISSIONS, false) ?? false,
        // A queued change lands later: every office hears it then.
        (done) => {
          if (done.ok) broadcastSupervision(store);
        },
      ).then((result) => {
        answer(
          result.ok,
          result.ok ? (result.queued ? 'queued' : undefined) : result.reason,
          result.ok ? result.newId : undefined,
        );
        if (result.ok && !result.queued) broadcastSupervision(store);
      });
      break;
    }

    case 'supervisionTeam':
      // The members the browser computed for a workspace / hand-picked supervisor.
      applySupervisionTeam(store, msg);
      break;

    case 'closeAgent': {
      // Two shapes now: a PTY-backed agent we launched (kill the process -- the
      // counterpart of VS Code's terminalRef.dispose()), or an external agent we
      // merely observed (dismiss the file so the scanner doesn't re-adopt it,
      // then remove). removeAgent fires agentRemoved, which httpServer maps to
      // an agentClosed broadcast.
      const id = msg.id as number;
      const agent = store.get(id);
      if (agent?.bgId && runtime) {
        // A background session would outlive its terminal: closing the agent
        // stops it and takes it off Claude Code's list (the transcript stays).
        agent.bgLeaving = true;
        runtime.resumableSessions?.remove(agent.sessionId);
        void stopBackground(agent.bgId, agent.cwd);
      }
      if (agent && runtime) {
        // dispose() is a no-op for agents with no terminal, so this is safe for
        // both shapes. The PTY's onExit handler does the store cleanup for
        // PTY-backed agents; do it here too so external agents (and a PTY that
        // never exits) are still removed promptly.
        ctx.ptyManager?.dispose(id);
        runtime.closeAgent(id);
      }
      break;
    }

    case 'adoptIntoOffice': {
      // Close a session in its outside terminal and resume it in the office.
      // Async (waits for the old process to exit); the reply goes only to the
      // asking office.
      if (!runtime || !ctx.ptyManager) break;
      const id = Number(msg.id);
      void adoptIntoOffice(
        { store, runtime, ptyManager: ctx.ptyManager, provider: claudeProvider },
        id,
        adapter?.getSetting(KEY_BYPASS_PERMISSIONS, false) ?? false,
      ).then((result) =>
        send({
          type: 'adoptDone',
          id,
          ok: result.ok,
          newId: result.ok ? result.newId : undefined,
          reason: result.ok ? undefined : result.reason,
        }),
      );
      break;
    }

    case 'shutdownOffice': {
      // Privileged by the gate above: the operator asked to turn it off.
      console.log('[Pixel Agents] Shutdown requested from the office');
      ctx.runtime?.requestShutdown?.();
      break;
    }

    case 'requestAgentChat': {
      // The chat view opened: the latest part of that agent's conversation,
      // to this office only (new lines follow as agentChatAppend).
      const agent = store.get(Number(msg.id));
      if (agent?.jsonlFile) {
        send({ type: 'agentChat', id: Number(msg.id), items: readChat(agent.jsonlFile) });
      }
      break;
    }

    case 'handOffResult': {
      // Paste one agent's latest answer into another's office terminal
      // (unsent). The reply goes only to the asking office.
      const result = handOff(store, ctx.ptyManager, Number(msg.fromId), Number(msg.toId));
      send({
        type: 'handOffDone',
        toId: Number(msg.toId),
        ok: result.ok,
        reason: result.ok ? undefined : result.reason,
      });
      break;
    }

    case 'permissionDecision': {
      // Privileged by the gate above. A stale requestId (answered in the
      // terminal a moment earlier) is simply gone; the resolved broadcast
      // already told every office to drop the card.
      const behavior = msg.behavior;
      if (typeof msg.requestId !== 'string' || !ctx.permissionBroker) break;
      if (behavior === 'allow') {
        ctx.permissionBroker.decide(msg.requestId, { behavior: 'allow' });
      } else if (behavior === 'deny') {
        const message = typeof msg.message === 'string' && msg.message ? msg.message : undefined;
        ctx.permissionBroker.decide(msg.requestId, { behavior: 'deny', message });
      }
      break;
    }

    case 'requestDiagnostics':
      // Point-to-point reply to the requesting socket (NOT a broadcast).
      send({ type: 'agentDiagnostics', agents: buildAgentDiagnostics(store) });
      break;

    case 'saveLayout':
      if (msg.layout) {
        writeLayoutToFile(msg.layout as Record<string, unknown>);
      }
      break;

    case 'saveAgentSeats':
      if (msg.seats) {
        const seats = msg.seats as Record<
          string,
          { palette?: number; hueShift?: number; seatId?: string }
        >;
        // Sync palette/hueShift back to AgentState so existingAgents stays
        // consistent across reconnects. Validate ranges to keep a remote
        // client (or a hand-edited payload) from corrupting the stored
        // values with out-of-range inputs that would render as a glitch.
        // Palette ceiling is dynamic: external asset directories can add
        // char_N.png beyond the bundled 6, so read the count from the asset
        // cache instead of hardcoding PALETTE_COUNT.
        const paletteCount = cache?.characters?.characters.length ?? PALETTE_COUNT;
        for (const [idStr, meta] of Object.entries(seats)) {
          const id = Number(idStr);
          const agent = store.get(id);
          if (agent) {
            if (
              meta.palette !== undefined &&
              Number.isInteger(meta.palette) &&
              meta.palette >= 0 &&
              meta.palette < paletteCount
            ) {
              agent.palette = meta.palette;
            }
            if (
              meta.hueShift !== undefined &&
              Number.isInteger(meta.hueShift) &&
              meta.hueShift >= 0 &&
              meta.hueShift <= HUE_SHIFT_MAX_DEG
            ) {
              agent.hueShift = meta.hueShift;
            }
          }
        }
        adapter?.saveSeats(seats);
      }
      break;

    case 'setSoundEnabled':
      adapter?.setSetting(KEY_SOUND_ENABLED, msg.enabled);
      break;

    case 'setLastSeenVersion':
      adapter?.setSetting(KEY_LAST_SEEN_VERSION, msg.version as string);
      break;

    case 'setAlwaysShowLabels':
      adapter?.setSetting(KEY_ALWAYS_SHOW_LABELS, msg.enabled);
      break;

    case 'setGhostHeadlessAgents':
      adapter?.setSetting(KEY_GHOST_HEADLESS_AGENTS, msg.enabled);
      break;

    case 'setWatchAllSessions': {
      const enabled = msg.enabled as boolean;
      adapter?.setSetting(KEY_WATCH_ALL_SESSIONS, enabled);
      if (runtime) runtime.watchAllSessions.current = enabled;
      break;
    }

    case 'setHooksEnabled': {
      const enabled = msg.enabled as boolean;
      // The provider id is echoed by the client, never originated: an unknown
      // id names nothing to install into, so it is dropped like a junk choice.
      const provider = hookProviderById(msg.providerId);
      if (!provider) break;
      void applyHooksPreference(ctx, send, provider, enabled);
      break;
    }

    case 'hooksConsentResponse': {
      // Fail-closed on the provider exactly like on the choice: an id naming
      // no registered provider writes nothing.
      const provider = hookProviderById(msg.providerId);
      if (!provider) break;
      void applyConsentChoice(
        provider.id,
        msg.choice,
        standaloneConsentEffects(ctx, send, provider),
      );
      break;
    }

    case 'setHooksInfoShown':
      adapter?.setSetting(KEY_HOOKS_INFO_SHOWN, true);
      break;

    case 'addExternalAssetDirectory': {
      const newPath = msg.path as string | undefined;
      if (!newPath) break;
      const cfg = readConfig();
      if (!cfg.externalAssetDirectories.includes(newPath)) {
        cfg.externalAssetDirectories.push(newPath);
        writeConfig(cfg);
      }
      send({ type: 'externalAssetDirectoriesUpdated', dirs: cfg.externalAssetDirectories });
      void ctx.onReloadAssets?.(send);
      break;
    }

    case 'removeExternalAssetDirectory': {
      const removePath = msg.path as string | undefined;
      if (!removePath) break;
      const cfg = readConfig();
      cfg.externalAssetDirectories = cfg.externalAssetDirectories.filter((d) => d !== removePath);
      writeConfig(cfg);
      send({ type: 'externalAssetDirectoriesUpdated', dirs: cfg.externalAssetDirectories });
      void ctx.onReloadAssets?.(send);
      break;
    }

    case 'saveAreaMappings': {
      const rawMappings = msg.mappings;
      if (!rawMappings || typeof rawMappings !== 'object') {
        break;
      }
      const cfg = readConfig();
      cfg.standalone.areaMappings = rawMappings as Record<string, string[]>;
      writeConfig(cfg);
      break;
    }

    case 'setShowAreas': {
      const enabled = msg.enabled as boolean;
      adapter?.setSetting(KEY_SHOW_AREAS, enabled);
      break;
    }

    case 'setBypassPermissions': {
      if (typeof msg.enabled !== 'boolean' || !adapter) break;
      adapter.setSetting(KEY_BYPASS_PERMISSIONS, msg.enabled);
      // Every launch reads the persisted posture, so every office must show it:
      // a second tab still reading "off" would launch with the flag regardless.
      // Published as read back, so a failed write shows the truth, not the ask.
      store.broadcast({
        type: 'bypassPermissionsUpdated',
        enabled: adapter.getSetting(KEY_BYPASS_PERMISSIONS, false),
      });
      break;
    }

    case 'setBackgroundAgents': {
      if (typeof msg.enabled !== 'boolean' || !adapter) break;
      adapter.setSetting(KEY_BACKGROUND_AGENTS, msg.enabled);
      const enabled = adapter.getSetting(KEY_BACKGROUND_AGENTS, true);
      setBackgroundAgents(enabled);
      store.broadcast({ type: 'backgroundAgentsUpdated', enabled });
      break;
    }

    case 'setTeTocaRuleGlobal': {
      // The "Te toca" rule in the global CLAUDE.md too (teTocaRule.ts); every
      // office hears where it stands now, the asker also why it failed.
      if (typeof msg.enabled !== 'boolean') break;
      const answer = setRuleInClaudeMd(msg.enabled);
      if (answer.error) send({ ...answer });
      else store.broadcast({ ...answer });
      break;
    }

    case 'setShowHostDirectories': {
      if (typeof msg.enabled !== 'boolean' || !adapter) break;
      adapter.setSetting(KEY_SHOW_HOST_DIRECTORIES, msg.enabled);
      // The list is what changed, so every office gets it again -- the same
      // signal a Directory mutation sends.
      store.broadcast({
        type: 'directoriesLoaded',
        directories: listDirectories(shownHostDirectoriesFor(ctx)),
      });
      break;
    }

    case 'pickFolder':
      void pickFolder().then((path) => send({ type: 'folderPicked', path }));
      break;

    case 'openPath': {
      // A relative path is the agent's: its folder, or one of its repos.
      const cwd = typeof msg.id === 'number' ? store.get(msg.id)?.cwd : undefined;
      openInExplorer(resolveLocalPath(msg.path, cwd));
      break;
    }

    case 'writeDaySummary': {
      // "Escribirlo como resumen": Haiku words today's achievements (from your
      // plan, only on request). Every office sees the result; a failure
      // answers the one that asked.
      const where = runtime?.dayLog?.storage();
      if (!where) {
        send({ type: 'daySummaryFailed', reason: 'Esta oficina no lleva historial' });
        break;
      }
      void writeDaySummary(cleanFacts(msg), where.day, where.dir).then((result) => {
        if (result.ok) store.broadcast({ ...result.summary });
        else send({ type: 'daySummaryFailed', reason: result.reason });
      });
      break;
    }

    case 'saveDirectory':
    case 'removeDirectory':
    case 'requestDirectorySuggestions':
      // Shared with the VS Code adapter: same validation, same union, same
      // machine-wide config. Success rebroadcasts to every connected office
      // (store.broadcast fans out to all sockets); a rejection — and the
      // suggestion list — answers only the client that asked.
      handleDirectoryClientMessage(msg, {
        hostDirectories: () => shownHostDirectoriesFor(ctx),
        broadcast: (message) => store.broadcast(message),
        reply: send,
        suggestions: () =>
          collectDirectorySuggestions(claudeProvider, shownHostDirectoriesFor(ctx)),
      });
      break;

    default:
      // focusAgent is handled entirely client-side in standalone (it focuses the
      // drawer tab, which the server has no say in). exportLayout / importLayout
      // still require IDE-specific handling.
      break;
  }
}

/**
 * Run the install/uninstall side effect, then persist the provider's preference — only after it settled and only when
 * the on-disk result agrees. Writing it first strands the user when an uninstall fails: entries keep firing while the
 * persisted hooks-off makes the next startup skip the gate entirely. Shared by the Settings toggle and the consent
 * dialog's Install (both are grants). Never rejects — it is fire-and-forget and bound by the ConsentEffects contract,
 * so a failure surfaces on the console here or nowhere.
 */
async function applyHooksPreference(
  ctx: ClientMessageContext,
  send: WsSend,
  provider: HookProvider,
  enabled: boolean,
): Promise<void> {
  try {
    await ctx.onSetHooksEnabled?.(provider.id, enabled);
    const installed = await provider.areHooksInstalled();
    if (installed === enabled) {
      setHooksEnabled(provider.id, enabled);
      // The runtime's single hooksEnabled ref gates the CLAUDE scanners; it
      // follows only the Claude provider until the scanners grow per-provider
      // awareness alongside the Settings UI.
      if (ctx.runtime && provider.id === claudeProvider.id) {
        ctx.runtime.hooksEnabled.current = enabled;
      }
    }
    // Always report the ACTUAL install state — the toggle expresses intent,
    // not outcome (the installer refuses to touch an unparseable file).
    send({ type: 'hooksStatus', providerId: provider.id, installed });
  } catch (err) {
    console.error('[Pixel Agents] Applying the hooks preference failed:', err);
  }
}

/**
 * This surface's half of carrying out a consent answer for one provider. The choice→action rule and the write order
 * live in the shared consent modules; only these effects are standalone-specific (console, socket), each bound to the
 * one provider being answered.
 */
function standaloneConsentEffects(
  ctx: ClientMessageContext,
  send: WsSend,
  provider: HookProvider,
): ConsentEffects {
  return {
    setHooksEnabled: (enabled) => applyHooksPreference(ctx, send, provider, enabled),
    uninstallHooks: async () => {
      // The same side effect the toggle runs, minus the preference write. The
      // catch keeps the never-reject contract true by construction — the host
      // callback's own contract is unstated.
      try {
        await ctx.onSetHooksEnabled?.(provider.id, false);
      } catch (err) {
        console.error('[Pixel Agents] Hook uninstall failed:', err);
      }
    },
    areHooksInstalled: () => provider.areHooksInstalled(),
    syncHooksPreferenceOff: () => {
      // Durable writes are the executor's own atomic recordHooksDecline; this
      // only mirrors the live runtime ref the CLAUDE scanners read, so another
      // provider's answer can never flip Claude's fallback behavior.
      if (ctx.runtime && provider.id === claudeProvider.id) {
        ctx.runtime.hooksEnabled.current = false;
      }
    },
    reportHooksStatus: async () => {
      try {
        send({
          type: 'hooksStatus',
          providerId: provider.id,
          installed: await provider.areHooksInstalled(),
        });
      } catch {
        // Never let a status broadcast mask the error already surfaced.
      }
    },
  };
}

/** Longest nickname kept; the label has room for a short name, not a sentence. */
const NICKNAME_MAX_LENGTH = 32;

/** The launch dialog's choices, keeping only well-formed values: a bad field
 *  falls back to the automatic name/colour instead of refusing the launch. */
/** Longest first message accepted: well under Windows' 32 767-char command line. */
export const LAUNCH_PROMPT_MAX_LENGTH = 4000;

/** The launch's first message (a template), trimmed; none when empty or too long. */
export function launchPrompt(msg: Record<string, unknown>): string | undefined {
  if (typeof msg.prompt !== 'string') return undefined;
  const prompt = msg.prompt.trim();
  return prompt && prompt.length <= LAUNCH_PROMPT_MAX_LENGTH ? prompt : undefined;
}

function launchAppearance(msg: Record<string, unknown>): {
  nickname?: string;
  palette?: number;
  hueShift?: number;
} {
  const nickname =
    typeof msg.nickname === 'string' ? msg.nickname.trim().slice(0, NICKNAME_MAX_LENGTH) : '';
  const palette =
    Number.isInteger(msg.palette) &&
    (msg.palette as number) >= 0 &&
    (msg.palette as number) < PALETTE_COUNT
      ? (msg.palette as number)
      : undefined;
  const hueShift =
    palette !== undefined &&
    Number.isInteger(msg.hueShift) &&
    (msg.hueShift as number) >= 0 &&
    (msg.hueShift as number) <= HUE_SHIFT_MAX_DEG
      ? (msg.hueShift as number)
      : palette !== undefined
        ? 0
        : undefined;
  return { nickname: nickname || undefined, palette, hueShift };
}

function handleWebviewReady(send: WsSend, ctx: ClientMessageContext): void {
  const { store, runtime, cache } = ctx;
  const adapter = store.getAdapter();

  // 0. Access, first: a read-only office hides every control that would send
  // a change (all refused by refuseReadOnly), so it must know before it draws
  // them.
  send({ type: 'officeAccess', readOnly: ctx.privileged !== true });

  // 1. Provider capabilities (must arrive before any agent messages)
  send({
    type: 'providerCapabilities',
    readingTools: [...claudeProvider.readingTools],
    subagentToolNames: [...claudeProvider.subagentToolNames],
  });

  // 1b. Terminal availability. Gates the whole terminal UI (the + Agent button
  // and the drawer), so it must land before the client can act on agents.
  // Absent ptyManager = VS Code embedded mode, which owns its own terminals and
  // must not be told the standalone terminal is unavailable.
  // Availability is per CONNECTION, not per server: an untokened client is told
  // the terminal is unavailable (with the reason) because launchAgent and the
  // terminal socket would refuse it anyway -- better a disabled button that
  // says why than one that silently does nothing.
  if (ctx.ptyManager) {
    const privileged = ctx.privileged === true;
    send({
      type: 'terminalAvailability',
      available: privileged && ctx.ptyManager.isAvailable(),
      reason:
        ctx.ptyManager.unavailableReason() ??
        (privileged ? undefined : TERMINAL_REQUIRES_TOKEN_REASON),
    });
  }

  // 2. Assets (from server cache, loaded at startup via pngjs)
  if (cache) {
    if (cache.characters) {
      send({ type: 'characterSpritesLoaded', characters: cache.characters.characters });
    }
    if (cache.pets) {
      send({
        type: 'petSpritesLoaded',
        pets: cache.pets.pets,
        petNames: cache.pets.manifests.map((m) => m.name),
      });
    }
    if (cache.floorTiles) {
      send({ type: 'floorTilesLoaded', sprites: cache.floorTiles });
    }
    if (cache.wallTiles) {
      send({ type: 'wallTilesLoaded', sets: cache.wallTiles });
    }
    if (cache.carpetTiles) {
      send({ type: 'carpetTilesLoaded', sets: cache.carpetTiles });
    }
    if (cache.furniture) {
      send({
        type: 'furnitureAssetsLoaded',
        catalog: cache.furniture.catalog,
        sprites: Object.fromEntries(cache.furniture.sprites),
      });
    }
  }

  // 3. Layout is sent AFTER existingAgents — see step 7 below. The webview
  // buffers agents from existingAgents and only materializes them on the next
  // layoutLoaded (useExtensionMessages.ts: "Buffer agents — they'll be added
  // in layoutLoaded"), so layout-first would leave a client that connects
  // after agent creation with no characters.

  // 4. Settings (from adapter, with sensible defaults when adapter is absent)
  const cfg = readConfig();
  const settings = settingsSnapshot(adapter);
  const { watchAllSessions, hooksEnabled } = settings;
  send(settings);

  // 4a. Actual install state, distinct from the hooksEnabled preference —
  // hooksEnabled defaults true while first-run consent is still pending. The
  // provider checks are async, so these land as follow-ups right after the
  // synchronous handshake; the webview's default (not installed) is the safe
  // assumption until each arrives. One status + at most one ask PER PROVIDER.
  for (const provider of hookProviders) {
    // One provider's unreadable settings file must degrade to
    // installed=false (matching the executor's fail-closed read: no choice
    // ever uninstalls on a guess) rather than surface as an unhandled
    // rejection that can take the process down — and must never block the
    // other providers' statuses.
    void provider
      .areHooksInstalled()
      .catch((err: unknown) => {
        console.error(`[Pixel Agents] hooks status check failed for provider ${provider.id}:`, err);
        return false;
      })
      .then((installed) => {
        send({ type: 'hooksStatus', providerId: provider.id, installed });
        // 4a-bis. First-run consent, asked in the app: this connect is the moment the user can be asked, so the ask
        // rides the handshake and consentGate owns every condition (VS Code calls the same function). The record is
        // re-read here rather than taken from startup — another tab may have answered while this one loaded.
        // Dismissing sends nothing, so the ask returns on the next connect: fail-closed, never nagging in-session.
        const request = hooksConsentRequest(
          {
            installed,
            hooksEnabled: getHooksEnabled(provider.id),
            consentAnswered: getHooksConsent(provider.id) !== 'unanswered',
            privileged: ctx.privileged === true,
          },
          provider,
        );
        if (request) send({ ...request }); // spread: WsSend takes an index-signature shape
      });
  }

  // 4b. Directory→Area mappings (must arrive before existingAgents so the
  // webview seat-preference logic has the dict when characters are created).
  send({
    type: 'areaMappingsLoaded',
    mappings: cfg.standalone.areaMappings ?? {},
  });

  // 4c. Directories: the user-defined ones from the shared config merged with
  // standalone's native context, the directory the server was started from —
  // one read-only host entry, the counterpart of VS Code contributing its
  // workspace folders. Gated on ptyManager for the same reason
  // terminalAvailability is: no ptyManager means VS Code embedded mode, whose
  // adapter contributes its own Directories.
  if (ctx.ptyManager) {
    send({
      type: 'directoriesLoaded',
      directories: listDirectories(shownHostDirectoriesFor(ctx)),
    });
  }

  // Sync runtime refs with the persisted settings so scanners behave correctly
  // from the first tick after a server restart.
  if (runtime) {
    runtime.watchAllSessions.current = watchAllSessions;
    runtime.hooksEnabled.current = hooksEnabled;
  }

  // 5. Restore persisted external agents (standalone only; VS Code handles its own restore)
  runtime?.restoreExternalAgents();

  // 6. Existing agents (either just restored, or from VS Code adapter if present)
  const agentIds: number[] = [];
  const directoryNames: Record<number, string> = {};
  const externalAgents: Record<number, boolean> = {};
  const persistedSeats = adapter?.loadSeats() ?? {};
  const agentMeta: Record<number, { palette?: number; hueShift?: number; seatId?: string }> = {};
  for (const [id, agent] of store) {
    agentIds.push(id);
    if (agent.directoryName) {
      directoryNames[id] = agent.directoryName;
    }
    if (agent.isExternal) {
      externalAgents[id] = true;
    }
    const persisted = persistedSeats[String(id)];
    agentMeta[id] = {
      palette: agent.palette,
      hueShift: agent.hueShift,
      seatId: persisted?.seatId,
    };
  }
  send({
    type: 'existingAgents',
    agents: agentIds,
    agentMeta,
    directoryNames,
    externalAgents,
  });

  // 7. Layout last (see step 3): flushes the webview's buffered existingAgents
  // into characters once seats are rebuilt.
  // loadLayout (not a plain file read) so a newer bundled revision replaces
  // an outdated saved office here too, as it already did in VS Code. It may
  // write the file; a failed write (Windows EPERM) must not cut the handshake
  // short, so fall back to what can be read.
  let loaded: ReturnType<typeof loadLayout>;
  try {
    loaded = loadLayout(cache?.defaultLayout);
  } catch (err) {
    console.error(`[Pixel Agents] Layout load failed, using what is readable: ${String(err)}`);
    const fallback = readLayoutFromFile() ?? cache?.defaultLayout ?? null;
    loaded = fallback ? { layout: fallback, wasReset: false } : null;
  }
  send({
    type: 'layoutLoaded',
    layout: loaded?.layout ?? null,
    wasReset: loaded?.wasReset || undefined,
  });

  // 8. Agent state, AFTER layoutLoaded -- the characters they target only
  // exist once the layout flush creates them. Without this a reconnecting
  // client shows bare characters until each agent takes another turn.
  resendAgentActivity(send, store);
  ctx.runtime?.workflowWatch.resend(send);
  const history = ctx.runtime?.dayLog?.today();
  if (history) send({ type: 'dayLog', entries: history });
  const where = ctx.runtime?.dayLog?.storage();
  const summary = where && savedDaySummary(where.dir, where.day);
  if (summary) send({ ...summary });
  // Which of the agents' PRs are merged: what is already known, not news.
  const prs = ctx.runtime?.prWatch?.all();
  if (ctx.privileged && prs) send({ type: 'prStatuses', items: prs });
  // For the first-run welcome: can an agent start here at all? And is the
  // "Te toca" rule already in the global CLAUDE.md (welcome and Ajustes)?
  if (ctx.privileged) {
    void Promise.all([claudeStatus(), claudeTheme()]).then(([status, theme]) =>
      send({ ...status, theme }),
    );
    send({ type: 'teTocaRuleStatus', status: ruleStatus() });
  }

  // 9. Re-announce live terminals AFTER existingAgents, so a browser that
  // reloaded (or a second tab) rebuilds its drawer tabs. The PTY outlives the
  // socket, so these sessions are still attachable and their scrollback replays
  // on connect. Privileged connections only: an untokened client was told the
  // terminal is unavailable and could not attach anyway.
  if (ctx.ptyManager && ctx.privileged) {
    for (const id of agentIds) {
      if (ctx.ptyManager.has(id)) {
        send({ type: 'terminalSessionOpened', agentId: id });
      }
    }
  }

  // 10. Approval cards still answerable, so a reloaded tab shows them too.
  if (ctx.permissionBroker && ctx.privileged) {
    for (const request of ctx.permissionBroker.pending()) {
      send(pendingPermissionMessage(request, store));
    }
  }
}

/**
 * The settingsLoaded snapshot: sent on connect, and re-sent to a read-only
 * client whose setting change was refused (refuseReadOnly), so its optimistic
 * toggle snaps back to the truth.
 */
function settingsSnapshot(adapter: StateAdapter | undefined) {
  return {
    type: 'settingsLoaded',
    soundEnabled: adapter?.getSetting(KEY_SOUND_ENABLED, true) ?? true,
    lastSeenVersion: adapter?.getSetting(KEY_LAST_SEEN_VERSION, '') ?? '',
    extensionVersion: process.env.PIXEL_AGENTS_VERSION ?? '',
    watchAllSessions: adapter?.getSetting(KEY_WATCH_ALL_SESSIONS, false) ?? false,
    // On by default: an office of look-alike characters is unreadable unless
    // each one says who it is without hovering.
    alwaysShowLabels: adapter?.getSetting(KEY_ALWAYS_SHOW_LABELS, true) ?? true,
    ghostHeadlessAgents: adapter?.getSetting(KEY_GHOST_HEADLESS_AGENTS, false) ?? false,
    // A single boolean carrying the CLAUDE provider's preference until the
    // Settings UI grows a per-provider list -- its sole webview reader is the
    // hooks tooltip gate.
    hooksEnabled: getHooksEnabled(claudeProvider.id),
    hooksInfoShown: adapter?.getSetting(KEY_HOOKS_INFO_SHOWN, false) ?? false,
    externalAssetDirectories: readConfig().externalAssetDirectories,
    showAreas: adapter?.getSetting(KEY_SHOW_AREAS, false) ?? false,
    bypassPermissions: adapter?.getSetting(KEY_BYPASS_PERMISSIONS, false) ?? false,
    showHostDirectories: adapter?.getSetting(KEY_SHOW_HOST_DIRECTORIES, false) ?? false,
    backgroundAgents: adapter?.getSetting(KEY_BACKGROUND_AGENTS, true) ?? true,
  } as const;
}

/** Message types already reported as refused, so a read-only client that keeps
 *  sending (seat saves, layout saves) logs once per type, not per message. */
const reportedRefusals = new Set<string>();

/**
 * Drop a message from a read-only (unprivileged) client. Where the UI changes
 * optimistically before the server answers, the refused client is re-sent the
 * real state so the control snaps back instead of showing a change that was
 * never made -- the same "answer with the truth" rule as a failed hooks install.
 */
function refuseReadOnly(
  msg: Record<string, unknown>,
  send: WsSend,
  ctx: ClientMessageContext,
): void {
  const type = String(msg.type);
  if (!reportedRefusals.has(type)) {
    reportedRefusals.add(type);
    console.warn(
      `[Pixel Agents] Ignoring ${type} from a read-only client. Changes need the tokened URL the CLI printed (at localhost or an --allowed-host name).`,
    );
  }
  switch (msg.type) {
    case 'setHooksEnabled': {
      const provider = hookProviderById(msg.providerId);
      if (!provider) return;
      void provider
        .areHooksInstalled()
        .then((installed) => send({ type: 'hooksStatus', providerId: provider.id, installed }));
      return;
    }
    case 'setSoundEnabled':
    case 'setAlwaysShowLabels':
    case 'setGhostHeadlessAgents':
    case 'setWatchAllSessions':
    case 'setShowAreas':
    case 'setBypassPermissions':
    case 'setShowHostDirectories':
      send(settingsSnapshot(ctx.store.getAdapter()));
      return;
    case 'addExternalAssetDirectory':
    case 'removeExternalAssetDirectory':
      send({
        type: 'externalAssetDirectoriesUpdated',
        dirs: readConfig().externalAssetDirectories,
      });
      return;
    case 'saveAreaMappings':
      send({ type: 'areaMappingsLoaded', mappings: readConfig().standalone.areaMappings ?? {} });
      return;
  }
}
