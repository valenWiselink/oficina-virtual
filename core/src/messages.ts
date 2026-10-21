/**
 * AUTO-GENERATED FROM core/asyncapi.yaml. DO NOT EDIT MANUALLY.
 *
 * Run `npm run asyncapi:generate` to regenerate.
 *
 * Source of truth: the yaml at core/asyncapi.yaml.
 * Editors and clients in any language can consume the spec directly.
 */

export type ServerMessage =
  | ProviderCapabilities
  | AgentCreated
  | AgentClosed
  | AgentSelected
  | ExistingAgents
  | AgentStatus
  | AgentToolStart
  | AgentToolDone
  | AgentToolsClear
  | AgentToolPermission
  | AgentToolPermissionClear
  | PermissionPending
  | PermissionResolved
  | SubagentToolStart
  | SubagentToolDone
  | SubagentClear
  | SubagentToolPermission
  | SubagentFileLink
  | AgentTeamInfo
  | AgentContextUsage
  | AgentIdentity
  | LayoutLoaded
  | FurnitureAssetsLoaded
  | CharacterSpritesLoaded
  | PetSpritesLoaded
  | FloorTilesLoaded
  | WallTilesLoaded
  | CarpetTilesLoaded
  | ServerHello
  | OfficeAccess
  | SettingsLoaded
  | BypassPermissionsUpdated
  | BackgroundAgentsUpdated
  | UsageLimits
  | HooksStatus
  | HookHealth
  | HooksConsentRequest
  | ClaudeStatus
  | TeTocaRuleStatus
  | FolderPicked
  | ExternalAssetDirectoriesUpdated
  | AreaMappingsLoaded
  | DirectoriesLoaded
  | DirectorySaved
  | DirectoryRejected
  | DirectorySuggestions
  | TerminalAvailability
  | TerminalSessionOpened
  | TerminalSessionClosed
  | AgentLaunchFailed
  | HandOffDone
  | AdoptDone
  | AgentRunResult
  | SupervisionResult
  | AgentAppearance
  | DayLog
  | DayLogAppended
  | DaySummary
  | DaySummaryFailed
  | PrStatusChanged
  | PrStatuses
  | AgentChat
  | AgentChatAppend
  | AgentDiagnostics;

export type ClientMessage =
  | WebviewReady
  | RequestAgentChat
  | ShutdownOffice
  | LaunchAgent
  | FocusAgent
  | CloseAgent
  | PermissionDecision
  | HandOffResult
  | AdoptIntoOffice
  | EditAgent
  | SetAgentRun
  | SetSupervision
  | SupervisionTeam
  | SaveAgentSeats
  | SaveLayout
  | SetSoundEnabled
  | SetLastSeenVersion
  | SetAlwaysShowLabels
  | SetGhostHeadlessAgents
  | SetHooksEnabled
  | HooksConsentResponse
  | SetHooksInfoShown
  | SetWatchAllSessions
  | ExportLayout
  | ImportLayout
  | OpenSessionsFolder
  | AddExternalAssetDirectory
  | RemoveExternalAssetDirectory
  | SaveAreaMappings
  | SetShowAreas
  | SetBypassPermissions
  | SetBackgroundAgents
  | SetUsageLimits
  | SetTeTocaRuleGlobal
  | SetShowHostDirectories
  | SaveDirectory
  | RemoveDirectory
  | RequestDirectorySuggestions
  | PickFolder
  | OpenPath
  | RequestDiagnostics
  | WriteDaySummary;

export interface ProviderCapabilities {
  type: 'providerCapabilities';
  readingTools: string[];
  subagentToolNames: string[];
}

export interface AgentCreated {
  type: 'agentCreated';
  id: number;
  directoryName?: string;
  isExternal?: boolean;
  palette?: number;
  hueShift?: number;
}

export interface AgentClosed {
  type: 'agentClosed';
  id: number;
}

export interface AgentSelected {
  type: 'agentSelected';
  id: number;
}

export interface ExistingAgents {
  type: 'existingAgents';
  agents: number[];
  agentMeta: Record<string, AgentSeatMeta>;
  directoryNames: Record<string, string>;
  externalAgents: Record<string, boolean>;
}

export interface AgentSeatMeta {
  palette?: number;
  hueShift?: number;
  seatId?: string;
}

export interface AgentStatus {
  type: 'agentStatus';
  id: number;
  status: AgentActivityStatus;
  awaitingInput?: boolean;
}

export type AgentActivityStatus = 'active' | 'waiting';

export interface AgentToolStart {
  type: 'agentToolStart';
  id: number;
  toolId: string;
  status: string;
  toolName?: string;
  permissionActive?: boolean;
  runInBackground?: boolean;
  isTeammateSpawn?: boolean;
  fileOp?: FileOp;
}

export interface FileOp {
  op: FileOpKind;
  path: string;
}

export type FileOpKind = 'read' | 'write';

export interface AgentToolDone {
  type: 'agentToolDone';
  id: number;
  toolId: string;
}

export interface AgentToolsClear {
  type: 'agentToolsClear';
  id: number;
}

export interface AgentToolPermission {
  type: 'agentToolPermission';
  id: number;
  since?: number;
}

export interface AgentToolPermissionClear {
  type: 'agentToolPermissionClear';
  id: number;
}

export interface PermissionPending {
  type: 'permissionPending';
  requestId: string;
  id?: number;
  toolName: string;
  toolInput: Record<string, any>;
  cwd?: string;
  createdAt: number;
}

export interface PermissionResolved {
  type: 'permissionResolved';
  requestId: string;
  id?: number;
  outcome: PermissionOutcome;
}

export type PermissionOutcome = 'allow' | 'deny' | 'terminal' | 'expired';

export interface SubagentToolStart {
  type: 'subagentToolStart';
  id: number;
  parentToolId: string;
  toolId: string;
  status: string;
}

export interface SubagentToolDone {
  type: 'subagentToolDone';
  id: number;
  parentToolId: string;
  toolId: string;
}

export interface SubagentClear {
  type: 'subagentClear';
  id: number;
  parentToolId: string;
}

export interface SubagentToolPermission {
  type: 'subagentToolPermission';
  id: number;
  parentToolId: string;
}

export interface SubagentFileLink {
  type: 'subagentFileLink';
  id: number;
  fromParentToolId: string;
  toParentToolId: string;
  fileName: string;
}

export interface AgentTeamInfo {
  type: 'agentTeamInfo';
  id: number;
  teamName?: string;
  agentName?: string;
  isTeamLead?: boolean;
  leadAgentId?: number;
  teamUsesTmux?: boolean;
}

export interface AgentContextUsage {
  type: 'agentContextUsage';
  id: number;
  contextTokens: number;
  maxContextTokens: number;
  model?: string;
  spentInput?: number;
  spentCacheRead?: number;
  spentCacheWrite?: number;
  spentOutput?: number;
}

export interface AgentIdentity {
  type: 'agentIdentity';
  id: number;
  nickname?: string;
  title?: string;
  ticket?: string;
  cwd?: string;
  gitBranch?: string;
  entrypoint?: string;
  effort?: string;
  runModel?: string;
  runEffort?: string;
  canSetRun?: boolean;
  supervision?: SupervisionScope;
  supervisedBy?: number[];
  repo?: string;
  area?: RepoArea;
  tasks: AgentTask[];
  sessionId?: string;
  yourTurn?: string;
  yourTurnId?: string;
  yourTurnAt?: number;
  yourTurnUrl?: string;
  yourTurnMerged?: MergedAsk;
  replyLink?: string;
  replyChoices?: ReplyChoices;
  lastReplyHead?: string;
  lastRecordAt?: number;
  backgroundTasks?: number;
  backgroundLabel?: string;
}

export interface SupervisionScope {
  kind: AnonymousSchema_107;
  workspaceId?: string;
  name?: string;
}

export type AnonymousSchema_107 = 'workspace' | 'agents' | 'all';

export type RepoArea = 'backend' | 'webapp' | 'flutter' | 'otros';

export interface AgentTask {
  id: string;
  subject: string;
  activeForm?: string;
  status: AgentTaskStatus;
}

export type AgentTaskStatus = 'pending' | 'in_progress' | 'completed';

export interface MergedAsk {
  number: number;
  url: string;
  told: boolean;
}

export interface ReplyChoices {
  options: ReplyChoice[];
  recommends: boolean;
}

export interface ReplyChoice {
  n: number;
  label: string;
}

export interface LayoutLoaded {
  type: 'layoutLoaded';
  layout: Record<string, any> | null;
  wasReset?: boolean;
}

export interface FurnitureAssetsLoaded {
  type: 'furnitureAssetsLoaded';
  catalog: FurnitureAssetMessage[];
  sprites: Record<string, string[][]>;
}

export interface FurnitureAssetMessage {
  id: string;
  name: string;
  label: string;
  category: string;
  file: string;
  width: number;
  height: number;
  footprintW: number;
  footprintH: number;
  isDesk: boolean;
  canPlaceOnWalls: boolean;
  groupId?: string;
  canPlaceOnSurfaces?: boolean;
  backgroundTiles?: number;
  orientation?: string;
  state?: string;
  mirrorSide?: boolean;
  rotationScheme?: string;
  animationGroup?: string;
  frame?: number;
}

export interface CharacterSpritesLoaded {
  type: 'characterSpritesLoaded';
  characters: CharacterSpriteSet[];
}

export interface CharacterSpriteSet {
  down: string[][][];
  up: string[][][];
  right: string[][][];
}

export interface PetSpritesLoaded {
  type: 'petSpritesLoaded';
  pets: PetSpriteFrameSet[];
  petNames: string[];
}

export interface PetSpriteFrameSet {
  walkDown: string[][][];
  idleDown: string[][][];
  walkUp: string[][][];
  idleUp: string[][][];
  walkRight: string[][][];
}

export interface FloorTilesLoaded {
  type: 'floorTilesLoaded';
  sprites: string[][][];
}

export interface WallTilesLoaded {
  type: 'wallTilesLoaded';
  sets: string[][][][];
}

export interface CarpetTilesLoaded {
  type: 'carpetTilesLoaded';
  sets: string[][][][];
}

export interface ServerHello {
  type: 'serverHello';
  bootId: string;
}

export interface OfficeAccess {
  type: 'officeAccess';
  readOnly: boolean;
}

export interface SettingsLoaded {
  type: 'settingsLoaded';
  soundEnabled: boolean;
  lastSeenVersion: string;
  extensionVersion: string;
  watchAllSessions: boolean;
  alwaysShowLabels: boolean;
  ghostHeadlessAgents: boolean;
  hooksEnabled: boolean;
  hooksInfoShown: boolean;
  externalAssetDirectories: string[];
  showAreas: boolean;
  bypassPermissions: boolean;
  showHostDirectories: boolean;
  backgroundAgents?: boolean;
}

export interface BypassPermissionsUpdated {
  type: 'bypassPermissionsUpdated';
  enabled: boolean;
}

export interface BackgroundAgentsUpdated {
  type: 'backgroundAgentsUpdated';
  enabled: boolean;
}

export interface UsageLimits {
  type: 'usageLimits';
  setup: StatusLineSetup;
  fiveHour?: RateWindow;
  sevenDay?: RateWindow;
  observedAt?: number;
  error?: string;
}

export type StatusLineSetup = 'off' | 'ours' | 'foreign' | 'unknown';

export interface RateWindow {
  usedPercentage: number;
  resetsAt: number;
}

export interface HooksStatus {
  type: 'hooksStatus';
  providerId: string;
  installed: boolean;
}

export interface HookHealth {
  type: 'hookHealth';
  failing: boolean;
  failures: number;
  timedOut: number;
  slowestMs?: number;
  lastError?: string;
}

export interface HooksConsentRequest {
  type: 'hooksConsentRequest';
  providerId: string;
  headline: string;
  disclosure: string;
}

export interface ClaudeStatus {
  type: 'claudeStatus';
  installed: boolean;
  version?: string;
  theme?: TerminalLook;
}

export type TerminalLook = 'light' | 'dark';

export interface TeTocaRuleStatus {
  type: 'teTocaRuleStatus';
  status: TeTocaRuleWhere;
  error?: string;
}

export type TeTocaRuleWhere = 'none' | 'office' | 'own';

export interface FolderPicked {
  type: 'folderPicked';
  path?: string;
}

export interface ExternalAssetDirectoriesUpdated {
  type: 'externalAssetDirectoriesUpdated';
  dirs: string[];
}

export interface AreaMappingsLoaded {
  type: 'areaMappingsLoaded';
  mappings: Record<string, string[]>;
}

export interface DirectoriesLoaded {
  type: 'directoriesLoaded';
  directories: Directory[];
}

export interface Directory {
  name: string;
  path: string;
  source: DirectorySource;
}

export type DirectorySource = 'user' | 'host';

export interface DirectorySaved {
  type: 'directorySaved';
  directory: Directory;
}

export interface DirectoryRejected {
  type: 'directoryRejected';
  path: string;
  reason: string;
}

export interface DirectorySuggestions {
  type: 'directorySuggestions';
  paths: string[];
}

export interface TerminalAvailability {
  type: 'terminalAvailability';
  available: boolean;
  reason?: string;
}

export interface TerminalSessionOpened {
  type: 'terminalSessionOpened';
  agentId: number;
}

export interface TerminalSessionClosed {
  type: 'terminalSessionClosed';
  agentId: number;
  exitCode?: number;
}

export interface AgentLaunchFailed {
  type: 'agentLaunchFailed';
  directoryPath: string;
  reason: string;
}

export interface HandOffDone {
  type: 'handOffDone';
  toId: number;
  ok: boolean;
  reason?: string;
}

export interface AdoptDone {
  type: 'adoptDone';
  id: number;
  ok: boolean;
  newId?: number;
  reason?: string;
}

export interface AgentRunResult {
  type: 'agentRunResult';
  id: number;
  ok: boolean;
  reason?: string;
  newId?: number;
}

export interface SupervisionResult {
  type: 'supervisionResult';
  id: number;
  ok: boolean;
  reason?: string;
  newId?: number;
}

export interface AgentAppearance {
  type: 'agentAppearance';
  id: number;
  palette: number;
  hueShift: number;
}

export interface DayLog {
  type: 'dayLog';
  entries: DayLogEntry[];
}

export interface DayLogEntry {
  at: number;
  agentId?: number;
  agent: string;
  kind: DayLogKind;
  text: string;
  waitedMs?: number;
  prUrl?: string;
  folder?: string;
  summary?: string;
  edits?: number;
  sessionId?: string;
}

export type DayLogKind =
  | 'permiso'
  | 'respuesta'
  | 'termino'
  | 'tetoca'
  | 'tarea'
  | 'cerrado'
  | 'contexto'
  | 'mergeado'
  | 'recap';

export interface DayLogAppended {
  type: 'dayLogAppended';
  entry: DayLogEntry;
}

export interface DaySummary {
  type: 'daySummary';
  day: string;
  text: string;
  at: number;
}

export interface DaySummaryFailed {
  type: 'daySummaryFailed';
  reason: string;
}

export interface PrStatusChanged {
  type: 'prStatus';
  url: string;
  state: PrState;
  title?: string;
  mergedAt?: string;
}

export type PrState = 'open' | 'merged' | 'closed';

export interface PrStatuses {
  type: 'prStatuses';
  items: PrStatus[];
}

export interface PrStatus {
  url: string;
  state: PrState;
  title?: string;
  mergedAt?: string;
}

export interface AgentChat {
  type: 'agentChat';
  id: number;
  items: ChatItem[];
}

export interface ChatItem {
  id: string;
  role: ChatRole;
  text: string;
  at?: number;
}

export type ChatRole = 'user' | 'assistant' | 'tool';

export interface AgentChatAppend {
  type: 'agentChatAppend';
  id: number;
  items: ChatItem[];
}

export interface AgentDiagnostics {
  type: 'agentDiagnostics';
  agents: Record<string, any>[];
}

export interface WebviewReady {
  type: 'webviewReady';
}

export interface RequestAgentChat {
  type: 'requestAgentChat';
  id: number;
}

export interface ShutdownOffice {
  type: 'shutdownOffice';
}

export interface LaunchAgent {
  type: 'launchAgent';
  directoryPath?: string;
  nickname?: string;
  palette?: number;
  hueShift?: number;
  prompt?: string;
  model?: string;
  effort?: AnonymousSchema_371;
  supervision?: AnonymousSchema_372;
}

export type AnonymousSchema_371 = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface AnonymousSchema_372 {
  kind: AnonymousSchema_373;
  workspaceId?: string;
  name?: string;
}

export type AnonymousSchema_373 = 'none' | 'workspace' | 'agents' | 'all';

export interface FocusAgent {
  type: 'focusAgent';
  id: number;
}

export interface CloseAgent {
  type: 'closeAgent';
  id: number;
}

export interface PermissionDecision {
  type: 'permissionDecision';
  requestId: string;
  behavior: PermissionBehavior;
  message?: string;
}

export type PermissionBehavior = 'allow' | 'deny';

export interface HandOffResult {
  type: 'handOffResult';
  fromId: number;
  toId: number;
}

export interface AdoptIntoOffice {
  type: 'adoptIntoOffice';
  id: number;
}

export interface EditAgent {
  type: 'editAgent';
  id: number;
  nickname?: string;
  palette?: number;
}

export interface SetAgentRun {
  type: 'setAgentRun';
  id: number;
  model?: string | null;
  effort?: string | null;
}

export interface SetSupervision {
  type: 'setSupervision';
  id: number;
  scope: AnonymousSchema_398;
}

export interface AnonymousSchema_398 {
  kind: AnonymousSchema_399;
  workspaceId?: string;
  name?: string;
}

export type AnonymousSchema_399 = 'none' | 'workspace' | 'agents' | 'all';

export interface SupervisionTeam {
  type: 'supervisionTeam';
  supervisorId: number;
  members: string[];
}

export interface SaveAgentSeats {
  type: 'saveAgentSeats';
  seats: Record<string, SeatAssignment>;
}

export interface SeatAssignment {
  palette: number;
  hueShift: number;
  seatId: string | null;
}

export interface SaveLayout {
  type: 'saveLayout';
  layout: Record<string, any>;
}

export interface SetSoundEnabled {
  type: 'setSoundEnabled';
  enabled: boolean;
}

export interface SetLastSeenVersion {
  type: 'setLastSeenVersion';
  version: string;
}

export interface SetAlwaysShowLabels {
  type: 'setAlwaysShowLabels';
  enabled: boolean;
}

export interface SetGhostHeadlessAgents {
  type: 'setGhostHeadlessAgents';
  enabled: boolean;
}

export interface SetHooksEnabled {
  type: 'setHooksEnabled';
  providerId: string;
  enabled: boolean;
}

export interface HooksConsentResponse {
  type: 'hooksConsentResponse';
  providerId: string;
  choice: HooksConsentChoice;
}

export type HooksConsentChoice = 'install' | 'notNow' | 'never';

export interface SetHooksInfoShown {
  type: 'setHooksInfoShown';
}

export interface SetWatchAllSessions {
  type: 'setWatchAllSessions';
  enabled: boolean;
}

export interface ExportLayout {
  type: 'exportLayout';
}

export interface ImportLayout {
  type: 'importLayout';
}

export interface OpenSessionsFolder {
  type: 'openSessionsFolder';
}

export interface AddExternalAssetDirectory {
  type: 'addExternalAssetDirectory';
  path?: string;
}

export interface RemoveExternalAssetDirectory {
  type: 'removeExternalAssetDirectory';
  path: string;
}

export interface SaveAreaMappings {
  type: 'saveAreaMappings';
  mappings: Record<string, string[]>;
}

export interface SetShowAreas {
  type: 'setShowAreas';
  enabled: boolean;
}

export interface SetBypassPermissions {
  type: 'setBypassPermissions';
  enabled: boolean;
}

export interface SetBackgroundAgents {
  type: 'setBackgroundAgents';
  enabled: boolean;
}

export interface SetUsageLimits {
  type: 'setUsageLimits';
  enabled: boolean;
}

export interface SetTeTocaRuleGlobal {
  type: 'setTeTocaRuleGlobal';
  enabled: boolean;
}

export interface SetShowHostDirectories {
  type: 'setShowHostDirectories';
  enabled: boolean;
}

export interface SaveDirectory {
  type: 'saveDirectory';
  name: string;
  path: string;
  previousPath?: string;
}

export interface RemoveDirectory {
  type: 'removeDirectory';
  path: string;
}

export interface RequestDirectorySuggestions {
  type: 'requestDirectorySuggestions';
}

export interface PickFolder {
  type: 'pickFolder';
}

export interface OpenPath {
  type: 'openPath';
  path: string;
  id?: number;
}

export interface RequestDiagnostics {
  type: 'requestDiagnostics';
}

export interface WriteDaySummary {
  type: 'writeDaySummary';
  achievements: DayAchievements[];
  prs: DayPr[];
  tasks: string[];
}

export interface DayAchievements {
  project: string;
  items: string[];
}

export interface DayPr {
  title: string;
  state?: PrState;
}
