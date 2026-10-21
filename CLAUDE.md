# Oficina virtual — reference

A local web app to manage Claude Code agents: a board (by state), a live graph
(who works with whom, sub-agents, workflow "juntas"), today's history, and each
agent's terminal or chat docked beside them. Fork of Pixel Agents (MIT): the
pixel-art office, the layout editor and the VS Code extension are gone; the
standalone server and its agent tracking remain.

The UI copy is Rioplatense Spanish (voseo: "Elegí", "Te toca"). Code, comments,
commit messages and this file are English.

## Layout

```
core/            Protocol only, no runtime side effects
  asyncapi.yaml  The wire contract — single source of truth
  src/messages.ts  GENERATED from asyncapi.yaml (npm run asyncapi:generate); never edit
server/src/      Fastify + WebSocket server, agent tracking (Node)
webview-ui/src/  React + Tailwind v4 SPA served by the server
instalar/        Windows launcher (hidden server + Edge/Chrome app window)
instalar.ps1     One-shot installer for a coworker's machine
desktop/         Electron main process (the .exe): window, tray, updates, hook relay
electron-builder.yml, build/installer.nsh   NSIS installer config
```

`core` depends on nothing; `server` and `webview-ui` depend only on `core`.

## Commands

```bash
npm install            # root + both workspaces
npm run build          # asyncapi:generate, check-types, lint, esbuild, vite
npm run build:app      # esbuild + vite only (what the installer runs)
npm test               # webview + server vitest
npm run lint
npm run asyncapi:generate   # after editing core/asyncapi.yaml
node dist/cli.js --port 3100
npm run dist:win       # desktop app + NSIS installer -> release/
npm run pack:win       # unpacked app only: release/win-unpacked/
```

## Desktop app (desktop/)

- `main.ts` starts `dist/cli.js` as a child with the app's own Node
  (`ELECTRON_RUN_AS_NODE=1`, IPC channel), or attaches to an office already
  answering `/api/health` on the port (`OFICINA_PORT`, default 3100) using the
  user's `~/.pixel-agents/standalone-token`. Closing the window hides it to
  the tray; "Apagar la oficina" sends `oficina:shutdown` over IPC (on Windows
  a signal from the parent is a hard kill that would skip the teardown).
- Hooks without Node: the server it starts gets `OFICINA_HOOK_EXE`, and the
  installer writes exec-form hooks (`command` = the exe, `args` =
  `["--oficina-hook", <script>]`, no shell). `hookRelay.ts` runs the script
  with `ELECTRON_RUN_AS_NODE` and `stdio: 'inherit'` (Electron's main process
  itself reads an EMPTY stdin — measured — so it must not read it).
- The uninstaller runs the exe with `--oficina-uninstall-hooks`
  (`dist/cli.js --uninstall-hooks`).
- electron-builder's dependency walk drops `@lydell/node-pty`: it is copied by
  an explicit file set in `electron-builder.yml`. Test runs set
  USERPROFILE/HOME/APPDATA/LOCALAPPDATA to a fake home (the app, its data
  folder and even a silent NSIS install follow them; the Desktop shortcut does
  not — it lands on the real desktop); `--remote-debugging-port` + CDP drives
  the UI.
- In dev, `electron.exe --oficina-hook x` loads `x` as the APP; use
  `electron . --oficina-hook x`. The packaged exe always runs its own main.

The server serves the built SPA from `dist/webview`: a webview-only change
needs `npm run build` (or `cd webview-ui && npm run build`) and a page reload,
not a server restart. Server changes need a restart, which cuts the turns of
running agents — never restart someone's office while their agents work.

The pre-push hook only checks that `messages.ts` matches `asyncapi.yaml`.

## Server (server/src)

- `cli.ts` — entry: config, token, runtime, HTTP/WS server, DayLog.
- `agentRuntime.ts` / `agentStateStore.ts` — lifecycle core and the single
  source of truth (typed mutations; `broadcast` fans out to every socket).
- `transcriptParser.ts`, `fileWatcher.ts`, `subagentWatch.ts` — read the
  Claude Code JSONL transcripts (`~/.claude/projects/<dir>/<session>.jsonl`).
- `workflowWatch.ts` — workflow runs (`<session>/subagents/workflows/<run>/journal.jsonl`)
  announced as sub-agents, so juntas show in the graph.
- `agentIdentity.ts` — name, branch, ticket, tasks, "te toca" (an explicit
  `Te toca:` line, else PR links), background work.
- `teTocaRule.ts` — the rule that makes agents write that line: office agents
  get it by `--append-system-prompt-file` unless the global CLAUDE.md has it
  (one such flag per launch: a supervisor's role file wins); the welcome and
  Ajustes can append/take back the exact block in the global CLAUDE.md.
- `serverBoot.ts` — this run's id. Agent ids restart at 1 on every start, so
  `/ws` greets with `serverHello` (the page reloads on a new run) and the
  terminal socket refuses a `?boot=` from another run.
- `agentChat.ts` — a transcript as chat items (`requestAgentChat`).
- `dayLog.ts` — today's history, persisted to `~/.pixel-agents/historial-AAAA-MM-DD.jsonl`.
  What already exists at first sight (a restart) is never logged as news.
- `sessionDedupe.ts` — one agent per Claude session.
- `clientMessageHandler.ts` — every client message; the `webviewReady`
  handshake sends the whole state. Unprivileged (untokened) clients are read-only.
- `claudeCheck.ts` (is `claude` installed), `folderPicker.ts` (Windows folder
  dialog) — for the first-run welcome.
- `providers/hook/` — Claude Code hooks: install into `~/.claude/settings.json`
  only after consent (`consentGate.ts` decides, `consentExecutor.ts` performs;
  rationale was upstream's ADR 0001). Never rewrite a settings shape we did not
  author; hook identity is the `/.pixel-agents/hooks/claude-hook.js` suffix of
  the command's first token, case-insensitive.
- `usageLimits/` — the plan's usage limits (5-hour session, week). The only
  documented source is the status line's JSON (`rate_limits`,
  https://code.claude.com/docs/en/statusline), so on request (`setUsageLimits`)
  the office sets `statusLine` in `~/.claude/settings.json` to
  `~/.pixel-agents/hooks/statusline.cmd` (never over the user's own). The
  wrapper runs `statusline.js` with the office's runtime (the exe with
  `ELECTRON_RUN_AS_NODE`: one process), which keeps the newest numbers in
  `~/.pixel-agents/limites.json` (later window wins; within a window, higher
  use wins, so an idle session re-running cannot roll them back) and prints
  them under the prompt. `UsageLimitsWatch` polls that file and sends
  `usageLimits`. Never read the OAuth credentials for this.
- `terminal/` — PTYs (`@lydell/node-pty`, prebuilt) streamed to the browser.

Agent tracking also still loads the old office assets and layout: the
webview's `OfficeState` (office/engine) is kept as the character registry
(ids, palettes, sub-agents), though nothing draws the office anymore.

## Webview (webview-ui/src)

- `App.tsx` — composition root.
- `views/` — `agentViews.ts` turns state into `AgentView`s (kind: needs /
  work / meet / research / think / done / idle); `BoardView`, `BoardCard`;
  the graph: `GraphView`, `useGraphCanvas` (camera, gestures, minimap),
  `graphScene` (layout, drawing), `graphDraw` (procedural Clawd), `graphSim`.
- `components/TerminalDrawer.tsx` and friends — the docked panel: agent tabs,
  per-pane header, Chat | Terminal, split with a pinned agent, search.
- `chat/` — chat view of a transcript; sending pastes into the agent's PTY.
- Writing to an agent: `terminal/agentInput.ts` `sendToAgent` resolves whether
  it reached the PTY (only `true` may count as done). A whole message sent
  while its terminal reconnects waits up to 30 s (`terminal/heldInput.ts`) and
  goes as paste + Enter; keys typed by hand are never held — sent late they
  could answer a permission — they are dropped and the terminal says so. The
  control socket holds messages only briefly and never one that changes an
  agent by id (`transport/sendQueue.ts`).
- Sounds: `notificationSound.ts` (Ajustes: Todo / Sólo cuando te necesitan /
  Nada) and `effects/turnSounds.ts` (toc-toc for a need, a spaced soft plin
  for a turn with nothing for you, chosen 1.5 s after the turn ends).
- `onboarding/` — first-run welcome (checks, hooks consent, folder, first
  agent) and the guided tour (`data-tour` marks on its targets).
- `history/`, `permissions/`, `handoff/`, `effects/`, `identity/`.
- `components/ui/` — Button, Modal, Switch, TextInput, Dropdown.

Styling: tokens in `index.css` (`:root`), Tailwind v4 with a 1px spacing unit
(`p-8` = 8px). Font: Plus Jakarta Sans. The `no-inline-colors` lint rule
allows colour literals only in `constants.ts` (canvas colours) and CSS.

## Testing

- `vitest` in both workspaces. Server tests write config under the home
  directory: run them with a fresh fake home
  (`USERPROFILE=<new dir> HOME=<new dir> npx vitest run`), never the real one.
- Manual checks: run a second server on another port with a fake home and a
  self-made token file (`<fake home>/.pixel-agents/standalone-token`), and open
  `http://127.0.0.1:<port>/?token=<that token>`. Never read the real token.

## Lessons

- `fs.watch` is unreliable on Windows — always pair it with polling.
- Buffer partial lines when tailing append-only files.
- A user record's `content` is a string or an array (tool results).
- `/clear` starts a NEW JSONL file; the old one just stops.
- Idle detection: `system`/`turn_duration` for tool turns, a 5 s text-idle
  timer for text-only turns. `idle_prompt` notifications mean idle, not a question.
- Context usage is a snapshot against the model's window (1M for current
  models): sum `input_tokens` with both cache counters.
- PowerShell 5.1 reads BOM-less `.ps1` files as ANSI: keep scripts ASCII.
