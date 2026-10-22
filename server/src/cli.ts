#!/usr/bin/env node

/**
 * Standalone CLI entry point: `npx pixel-agents`
 *
 * Starts the Fastify server in standalone mode with SPA serving and WebSocket.
 * Loads all assets (PNGs -> SpriteData) on startup and caches in memory.
 * Each connecting WebSocket client receives the full state on webviewReady.
 */

import * as path from 'path';

import { AgentRuntime } from './agentRuntime.js';
import { AgentStateStore } from './agentStateStore.js';
import {
  buildAssetCache,
  loadAllCharacters,
  loadAllFurniture,
  loadAllPets,
} from './assetReload.js';
import type { AssetCache, ReloadAssetsSideEffect } from './clientMessageHandler.js';
import {
  getHooksConsent,
  getHooksEnabled,
  grantHooksConsent,
  readConfig,
} from './configPersistence.js';
import {
  MAX_PORT,
  MIN_PORT,
  TERMINAL_DISABLED_BY_FLAG_REASON,
  WILDCARD_HOSTNAMES,
} from './constants.js';
import { DayLog } from './dayLog.js';
import { FileStateAdapter } from './fileStateAdapter.js';
import { HookHealth, setCurrentHookHealth } from './hookHealth.js';
import { createPermissionBroker } from './permissionWiring.js';
import { uninstallHooks as uninstallClaudeHooks } from './providers/hook/claude/claudeHookInstaller.js';
import { claudeProvider, copyHookScript, hookProviderById } from './providers/index.js';
import { watchAgentPrs } from './prWatchWiring.js';
import { PixelAgentsServer } from './server.js';
import { officeJarvisKeeper } from './supervisors/jarvisWiring.js';
import { supervisors } from './supervisors/supervision.js';
import { SupervisorRelay } from './supervisors/supervisorRelay.js';
import { setBackgroundAgents } from './terminal/backgroundSessions.js';
import { PtySessionManager } from './terminal/ptySessionManager.js';
import { ResumableSessions } from './terminal/resumableSessions.js';
import { resumeOfficeSessions } from './terminal/standaloneAgentLauncher.js';
import { setStateGuessingAllowed } from './timerManager.js';
import { setRecapCallback } from './transcriptParser.js';
import { setRecordTap } from './transcriptTaps.js';
import { uninstallStatusLine } from './usageLimits/statusLineInstaller.js';
import { UsageLimitsWatch } from './usageLimits/usageLimitsWatch.js';
import { isLoopbackHost, normalizeHostname } from './wsAuth.js';

// ── Argument parsing ──────────────────────────────────────────

export interface CliArgs {
  /** Unset -> ephemeral (OS-assigned) port, so multiple standalone instances
   *  can run at once without a collision. --port picks a fixed one. */
  port?: number;
  host: string;
  /** False when --no-terminal was passed: the office only watches agents; the
   *  browser can neither launch them nor attach to their terminals. */
  terminal: boolean;
  /** --allowed-host names (repeatable): extra Host names, beyond loopback and a
   *  specific --host, that a tokened browser session is privileged under --
   *  typically a reverse proxy's public name. See wsAuth.privilegedHostnames. */
  allowedHosts: string[];
  /** --rotate-token: replace the persisted server token before starting. */
  rotateToken: boolean;
}

/** Thrown by parseArgs on an invalid --port. Kept separate from process.exit so
 *  the parsing logic stays a pure, unit-testable function -- main() is the only
 *  place that turns a bad argument into an exit code. */
export class CliArgsError extends Error {}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    host: '127.0.0.1',
    terminal: true,
    allowedHosts: [],
    rotateToken: false,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port' || argv[i] === '-p') {
      const raw = argv[i + 1];
      if (raw === undefined) {
        throw new CliArgsError(
          `Missing value for ${argv[i]}: expected an integer between ${MIN_PORT} and ${MAX_PORT}.`,
        );
      }
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < MIN_PORT || parsed > MAX_PORT) {
        throw new CliArgsError(
          `Invalid --port "${raw}": must be an integer between ${MIN_PORT} and ${MAX_PORT}.`,
        );
      }
      args.port = parsed;
      i++;
    } else if (argv[i] === '--host' && argv[i + 1]) {
      args.host = argv[i + 1];
      i++;
    } else if (argv[i] === '--allowed-host') {
      const raw = argv[i + 1];
      const name = normalizeHostname(raw);
      if (name === null || (WILDCARD_HOSTNAMES as readonly string[]).includes(name)) {
        throw new CliArgsError(
          raw === undefined
            ? 'Missing value for --allowed-host: expected a host name, e.g. my-mac.tailnet.ts.net.'
            : `Invalid --allowed-host "${raw}": expected a host name, e.g. my-mac.tailnet.ts.net.`,
        );
      }
      args.allowedHosts.push(raw as string);
      i++;
    } else if (argv[i] === '--rotate-token') {
      args.rotateToken = true;
    } else if (argv[i] === '--no-terminal') {
      args.terminal = false;
    } else if (argv[i] === '--help') {
      console.log(`Usage: pixel-agents [options]

Options:
  --port, -p <number>   Port to listen on (default: OS-assigned ephemeral port)
  --host <string>       Host to bind to (default: 127.0.0.1)
  --allowed-host <name> Also accept the tokened URL at this host name, e.g. a
                        reverse proxy's (Tailscale Serve). Repeatable. Without
                        it, only localhost and a specific --host are privileged
  --rotate-token        Replace the server token. Every URL that carried the
                        old one (bookmarks, other devices) stops working
  --no-terminal         Disable the embedded terminal (watch agents only; no
                        launching or attaching from the browser)
  --help                Show this help message`);
      process.exit(0);
    }
  }
  return args;
}

// ── Hooks consent ─────────────────────────────────────────────
// First-run consent is asked IN THE APP, not here: the server sends a
// hooksConsentRequest to privileged (tokened) connections during the
// webviewReady handshake (clientMessageHandler.ts), and the browser renders
// the dialog — the same UX the VS Code webview shows. The CLI itself never
// prompts; a headless run just starts without hooks until consent is granted
// through the UI. The one exception that needs no dialog is the silent-grant
// migration below (our hooks already installed by a pre-consent version).

/**
 * Copy the bundled hook script into ~/.pixel-agents/hooks/, reporting failure.
 *
 * Callers run this BEFORE installing the settings.json entries and abort when
 * it returns false: an entry whose command points at a missing script makes
 * Claude Code spawn a dead `node` process for every event, which is strictly
 * worse than no hooks at all.
 */
function copyHookScriptOrReport(packageRoot: string, context = ''): boolean {
  if (copyHookScript(packageRoot)) return true;
  console.error(`[Pixel Agents] Hooks NOT installed${context}: hook script missing.`);
  return false;
}

// ── Terminal status reporting ─────────────────────────────────

/**
 * Log one clear line about terminal availability, plus a security warning when
 * a working terminal is bound to a non-loopback address.
 *
 * The reason string matters: the most likely failure (npm >=11.16 gating
 * node-pty's install scripts, so it imports but can't spawn) is invisible
 * otherwise -- the user would just see a + Agent button that does nothing.
 *
 * Opting out with --no-terminal is not a failure, so it gets a quiet
 * confirmation instead of the reinstall hint, and skips the non-loopback shell
 * warning (there is no shell surface to warn about).
 */
function reportTerminalStatus(
  ptyManager: PtySessionManager,
  host: string,
  enabledByFlag: boolean,
): void {
  if (!enabledByFlag) {
    console.log(
      '[Pixel Agents] Terminal disabled (--no-terminal): agents can be watched but not launched from the browser.',
    );
    return;
  }

  if (!ptyManager.isAvailable()) {
    console.warn(
      `[Pixel Agents] Terminal disabled: ${ptyManager.unavailableReason()}\n` +
        `[Pixel Agents] The office still works; you just can't launch agents from the browser.\n` +
        `[Pixel Agents] To enable it, reinstall so the optional PTY module is present.`,
    );
    return;
  }

  console.log(`[Pixel Agents] Terminal enabled (via ${ptyManager.moduleId()})`);

  if (!isLoopbackHost(host)) {
    console.warn(
      `[Pixel Agents] WARNING: bound to ${host}, not loopback. The terminal is a shell:\n` +
        `[Pixel Agents] anyone who can reach this port AND has the auth token can run commands\n` +
        `[Pixel Agents] as you, and plain HTTP sends that token unencrypted. Behind a reverse\n` +
        `[Pixel Agents] proxy (e.g. Tailscale Serve), keep --host 127.0.0.1 and pass the proxy's\n` +
        `[Pixel Agents] name with --allowed-host instead.`,
    );
  }
}

// ── Main ──────────────────────────────────────────────────────

async function main(): Promise<void> {
  // The desktop app's uninstaller: take our hooks out of Claude Code's
  // settings (they point at the exe being removed) and exit.
  if (process.argv.includes('--uninstall-hooks')) {
    try {
      await uninstallClaudeHooks();
      await uninstallStatusLine();
      process.exit(0);
    } catch (err) {
      console.error(`[Pixel Agents] ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  }

  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`[Pixel Agents] ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  // dist/ contains both the CLI bundle and the assets/ + webview/ directories
  const distRoot = __dirname;
  const packageRoot = path.dirname(distRoot);
  const staticDir = path.join(distRoot, 'webview');

  // ── Load assets on startup (same pipeline as VS Code extension) ──
  // External asset directories are merged at startup too, so directories added
  // in a previous session survive a restart. buildAssetCache is the shared
  // loader used by both the standalone server and the VS Code adapter.
  console.log('[Pixel Agents] Loading assets...');
  const assetCache: AssetCache = await buildAssetCache(
    distRoot,
    readConfig().externalAssetDirectories,
  );
  const charCount = assetCache.characters?.characters.length ?? 0;
  const petCount = assetCache.pets?.pets.length ?? 0;
  const furnitureCount = assetCache.furniture?.catalog.length ?? 0;
  console.log(
    `[Pixel Agents] Assets loaded: ${charCount} characters, ${petCount} pets, ${furnitureCount} furniture items`,
  );

  // ── Store + adapter (shared settings + standalone-scoped agents/seats) ──
  const store = new AgentStateStore();
  const adapter = new FileStateAdapter({ namespace: 'standalone' });
  store.setAdapter(adapter);

  // ── Create server ──
  const server = new PixelAgentsServer();

  // Terminals for agents this server launches. Construction is cheap -- the
  // native module is resolved (and probed) lazily on first use, so a user who
  // never opens a terminal never pays for it. With --no-terminal, a disabled
  // manager reports "unavailable" through the same plumbing (availability
  // broadcast, session route, launcher), so nothing downstream special-cases it.
  const ptyManager = args.terminal
    ? new PtySessionManager()
    : PtySessionManager.disabled(TERMINAL_DISABLED_BY_FLAG_REASON);

  try {
    // Create runtime first (before server.start, so we can pass it in)
    const runtime = new AgentRuntime(store, claudeProvider);
    // Before any client can launch: every launched session is recorded here.
    if (ptyManager.enabled) runtime.resumableSessions = new ResumableSessions();
    // Today's history (standalone only: it writes under ~/.pixel-agents).
    runtime.dayLog = new DayLog(store);
    runtime.dayLog.start();
    // Its recaps: the ones arriving live, and today's already in the transcripts.
    const dayLog = runtime.dayLog;
    setRecapCallback((id, text, at) => dayLog.recap(id, text, at));
    for (const root of claudeProvider.getAllSessionRoots?.() ?? []) dayLog.readRecapsFrom(root);
    runtime.prWatch = watchAgentPrs(store, runtime.dayLog, {
      terminalOf: (id) => ptyManager.get(id),
    });
    // The plan's usage limits, read from the office's status line (opt-in).
    runtime.usageLimits = new UsageLimitsWatch({
      broadcast: (message) => store.broadcast({ ...message }),
      packageRoot,
    });
    runtime.usageLimits.start();

    // Supervisor agents: who supervises whom, and what reaches them (their
    // agents' permissions, questions and finished turns).
    supervisors().attach(store);
    const supervisorRelay = new SupervisorRelay({
      store,
      registry: supervisors(),
      terminalOf: (id) => ptyManager.get(id),
    });
    store.on('broadcast', (message: Record<string, unknown>) => supervisorRelay.observe(message));

    // Wire hook events: HTTP POST -> runtime -> hookEventHandler -> agents
    server.onHookEvent((providerId, event) => {
      supervisorRelay.observeHook(event);
      runtime.handleHookEvent(providerId, event);
    });

    // Approval cards: PermissionRequest hooks wait here for a decision from the
    // office while the terminal prompt stays answerable in parallel.
    const { broker: permissionBroker, asks: terminalAsks } = createPermissionBroker(store);

    // Whether Claude Code's hooks reach us: the transcripts list every one of
    // ours it cut or saw fail; past a threshold the office says so.
    const hookHealth = new HookHealth((status) => store.broadcast({ ...status }));
    setCurrentHookHealth(hookHealth);
    setRecordTap((_agentId, record) => hookHealth.observe(record));

    // onSetHooksEnabled side effect: install/uninstall the named provider's
    // hooks when the user toggles in the UI (or answers the consent ask).
    // Captures config from the outer scope after server.start().
    let currentConfig: { port: number; token: string } | null = null;
    const onSetHooksEnabled = async (providerId: string, enabled: boolean): Promise<void> => {
      if (!currentConfig) return;
      const provider = hookProviderById(providerId);
      if (!provider) return; // unknown id: nothing to install into
      if (enabled) {
        // An explicit toggle in the UI IS the consent to modify the
        // provider's settings file. The bundled claude-hook.js script belongs
        // to the Claude provider alone; another provider's install must
        // neither copy it nor be blocked by it.
        grantHooksConsent(provider.id);
        if (
          provider.id === claudeProvider.id &&
          !copyHookScriptOrReport(packageRoot, ' (user toggle)')
        ) {
          return;
        }
        try {
          await provider.installHooks(
            `http://127.0.0.1:${currentConfig.port}`,
            currentConfig.token,
          );
        } catch (err) {
          console.error(`[Pixel Agents] ${err instanceof Error ? err.message : String(err)}`);
          return;
        }
        console.log('[Pixel Agents] Hooks installed (user toggle)');
        if (provider.id === claudeProvider.id) setStateGuessingAllowed(false);
      } else {
        try {
          await provider.uninstallHooks();
          console.log('[Pixel Agents] Hooks uninstalled (user toggle)');
          if (provider.id === claudeProvider.id) setStateGuessingAllowed(true);
        } catch (err) {
          console.error(`[Pixel Agents] ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    };

    // onReloadAssets side effect: re-run the shared loaders (bundled + external
    // dirs) after an external-asset-directory change, then re-broadcast the
    // updated sprites to the requesting client. Mutates the assetCache object in
    // place so already-open sockets (which captured the same reference) and
    // future webviewReady handshakes both observe the new assets. Only
    // characters/pets/furniture can come from external dirs, so only those three
    // are reloaded and re-sent (mirrors the VS Code reload path).
    const onReloadAssets: ReloadAssetsSideEffect = async (send): Promise<void> => {
      const externalDirs = readConfig().externalAssetDirectories;
      const [characters, pets, furniture] = await Promise.all([
        loadAllCharacters(distRoot, externalDirs),
        loadAllPets(distRoot, externalDirs),
        loadAllFurniture(distRoot, externalDirs),
      ]);
      assetCache.characters = characters;
      assetCache.pets = pets;
      assetCache.furniture = furniture;
      if (characters) {
        send({ type: 'characterSpritesLoaded', characters: characters.characters });
      }
      if (pets) {
        send({
          type: 'petSpritesLoaded',
          pets: pets.pets,
          petNames: pets.manifests.map((m) => m.name),
        });
      }
      if (furniture) {
        send({
          type: 'furnitureAssetsLoaded',
          catalog: furniture.catalog,
          sprites: Object.fromEntries(furniture.sprites),
        });
      }
      console.log('[Pixel Agents] Assets reloaded (external directory change)');
    };

    const config = await server.start({
      store,
      runtime,
      embedded: false,
      host: args.host,
      port: args.port,
      staticDir,
      assetCache,
      onSetHooksEnabled,
      onReloadAssets,
      ptyManager,
      permissionBroker,
      allowedHosts: args.allowedHosts,
      rotateToken: args.rotateToken,
    });
    currentConfig = { port: config.port, token: config.token };
    // Supervisors reach the office's MCP endpoint over loopback.
    supervisors().setOfficeUrl(`http://127.0.0.1:${config.port}`);
    if (args.rotateToken) {
      console.log(
        '[Pixel Agents] Server token rotated: URLs carrying the old token no longer grant access. Open the new URL below on each device.',
      );
    }

    reportTerminalStatus(ptyManager, args.host, args.terminal);

    // Sync runtime refs with persisted settings BEFORE first scan tick. The
    // runtime's single hooksEnabled ref follows the Claude provider until the
    // scanners grow per-provider awareness alongside the Settings UI.
    runtime.hooksEnabled.current = getHooksEnabled(claudeProvider.id);
    runtime.watchAllSessions.current = adapter.getSetting('pixel-agents.watchAllSessions', false);

    // Install hooks on startup if the persisted setting says so — gated on the
    // one-time consent to modify ~/.claude/settings.json.
    if (runtime.hooksEnabled.current) {
      let consent = getHooksConsent(claudeProvider.id) === 'granted';
      if (!consent && (await claudeProvider.areHooksInstalled())) {
        // Our hooks are already installed and already firing — a pre-consent
        // version put them there. Grant and continue with NO prompt: the
        // install below is the 14 -> 12 migration, and it only ever REDUCES
        // scope (it drops UserPromptSubmit and TaskCreated, the two events that
        // forwarded prompt text and were consumed by nothing). Asking would buy
        // this user no protection they do not already have, so they are not
        // asked. A fresh install still is, in full — in the browser UI, when a
        // tokened client connects (clientMessageHandler's webviewReady).
        grantHooksConsent(claudeProvider.id);
        consent = true;
      }
      if (!consent) {
        console.log(
          '[Pixel Agents] Hooks not installed: modifying ~/.claude/settings.json needs one-time approval — open the URL below to review and approve it.',
        );
      } else if (copyHookScriptOrReport(packageRoot)) {
        try {
          await claudeProvider.installHooks(`http://127.0.0.1:${config.port}`, config.token);
          console.log('[Pixel Agents] Hooks installed');
          setStateGuessingAllowed(false);
        } catch (err) {
          console.error(`[Pixel Agents] ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } else {
      // Without this line, a persisted hooks-off makes startup skip the entire
      // consent/install flow with zero output — indistinguishable from a bug.
      console.log(
        '[Pixel Agents] Hooks disabled — enable "Instant Detection (Hooks)" in the UI settings to install them.',
      );
    }

    // After the hook install, so resumed sessions report through hooks from
    // their first event.
    // Background sessions (on by default): agents outlive the office, which
    // only attaches to them (terminal/backgroundSessions.ts).
    setBackgroundAgents(adapter.getSetting('pixel-agents.backgroundAgents', true));
    // Jarvis is always there: once the sessions are back, it gets its new role
    // or starts on its own, and every morning a clean conversation.
    const jarvisKeeper = ptyManager.enabled
      ? officeJarvisKeeper({
          store,
          runtime,
          ptyManager,
          bypass: () => adapter.getSetting('pixel-agents.bypassPermissions', false),
          hasPending: (agent) =>
            permissionBroker.pending().some((p) => p.sessionId === agent.sessionId),
        })
      : undefined;
    void resumeOfficeSessions(
      { store, runtime, ptyManager, provider: claudeProvider },
      adapter.getSetting('pixel-agents.bypassPermissions', false),
    )
      .then((resumed) => {
        if (resumed > 0) {
          console.log(`[Pixel Agents] Resumed ${resumed} session(s) from the previous run`);
        }
        return jarvisKeeper?.onOfficeStart();
      })
      .then(() => jarvisKeeper?.start())
      .catch((err: unknown) => console.error(`[Pixel Agents] Jarvis keeper: ${String(err)}`));

    // Start scanning for external sessions (Claude running in user's terminal)
    const cwd = process.cwd();
    const dirs = claudeProvider.getSessionDirs?.(cwd);
    if (dirs && dirs[0]) {
      const projectDir = dirs[0];
      console.log(`[Pixel Agents] Scanning project dir: ${projectDir}`);
      runtime.startProjectScan(projectDir);
      runtime.startExternalScanning(projectDir);
      runtime.startStaleCheck();
    }

    // The URL the operator opens has to be REACHABLE (a wildcard bind address
    // is a bind target, not an address you can browse to — `--host 0.0.0.0`
    // used to print a dead `http://0.0.0.0:PORT`) and has to carry the token,
    // which is what makes the session it loads privileged enough to approve a
    // hook install (see standaloneTokenValid in httpServer.ts). Under `--host
    // 0.0.0.0` the office stays readable from the LAN at this machine's own
    // address; only the consent-bearing toggle needs the token.
    const displayHost =
      args.host === '0.0.0.0' || args.host === '::' || args.host === '' ? '127.0.0.1' : args.host;
    console.log(
      `\n  Pixel Agents server running at http://${displayHost}:${config.port}/?token=${config.token}\n`,
    );

    // ── Graceful shutdown ──
    let shuttingDown = false;
    async function shutdown(): Promise<void> {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log('\nShutting down...');
      // Kill child terminals before the runtime tears their agents down, and
      // wait for them: exiting now would cancel the SIGKILL escalation and
      // leave a child that ignores SIGHUP orphaned on a dead server.
      // The terminals die here, their sessions do not: keep them resumable,
      // and keep what the surviving ones still ask in their terminal.
      jarvisKeeper?.stop();
      runtime.resumableSessions?.freeze();
      terminalAsks.freeze();
      await ptyManager.disposeAll();
      permissionBroker.dispose();
      runtime.dispose();
      server.stop();
      process.exit(0);
    }

    // "Apagar la oficina" (Ajustes): the same orderly shutdown as Ctrl+C.
    runtime.requestShutdown = () => void shutdown();
    process.on('SIGINT', () => void shutdown());
    process.on('SIGTERM', () => void shutdown());
    // Windows: closing the console window raises SIGHUP, Ctrl+Break SIGBREAK.
    // Without these the process dies mid-teardown and the dying terminals'
    // exit handlers could drop sessions that must stay resumable.
    process.on('SIGHUP', () => void shutdown());
    if (process.platform === 'win32') process.on('SIGBREAK', () => void shutdown());
    // The desktop app (desktop/main.ts) asks over its IPC channel: on Windows
    // a signal from the parent is a hard kill, which would skip this teardown.
    process.on('message', (message) => {
      if (message === 'oficina:shutdown') void shutdown();
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

// Only auto-run when this file is executed directly (`node dist/cli.js`), not
// when it's imported for its exports (e.g. `parseArgs` in tests) -- importing
// it unconditionally used to start a real server and install real Claude
// hooks as a side effect of module load.
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
