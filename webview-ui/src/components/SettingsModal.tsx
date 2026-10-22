import type { ReactNode } from 'react';
import { useState } from 'react';

import { setBackgroundAgents, useBackgroundAgents } from '../agents/backgroundAgentsSetting.js';
import { setSpanishTerminal, useSpanishTerminal } from '../agents/spanishTerminalSetting.js';
import { APP_THEME_CHOICES, setAppThemeChoice, useAppThemeChoice } from '../effects/appTheme.js';
import { setCalm, useCalmMode } from '../effects/calmMode.js';
import { TERMINAL_DOCKS, type TerminalDock } from '../hooks/useTerminalDock.js';
import { JarvisVoiceSettings } from '../jarvis/JarvisVoiceSettings.js';
import { chooseSoundMode, SOUND_MODES, useSoundMode } from '../notificationSound.js';
import { TeTocaRuleSetting } from '../onboarding/TeTocaRuleSetting.js';
import { transport } from '../transport/index.js';
import { hasDesktopUpdates } from '../updates/desktopUpdates.js';
import { UpdateHelpRows } from '../updates/UpdateHelpRows.js';
import { setOperatorName, useOperatorName } from '../views/officeMemory.js';
import { TerminalSchemePicker } from './TerminalSchemePicker.js';
import { Button } from './ui/Button.js';
import { Modal } from './ui/Modal.js';
import { Switch } from './ui/Switch.js';
import { TextInput } from './ui/TextInput.js';

// The pixel office's settings (export/import layout, furniture asset folders,
// always-on name labels, ghosts, areas) left with it on 2026-10-19: the board
// and the graph have no layout, and offering them would be a lie.
interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDebugMode: boolean;
  onToggleDebugMode: () => void;
  watchAllSessions: boolean;
  onToggleWatchAllSessions: () => void;
  /** ACTUAL install state (the hooksStatus message), not the hooksEnabled
   *  preference. The preference defaults to true while first-run consent is
   *  still pending, so binding the checkbox to it renders "on" over an empty
   *  ~/.claude/settings.json. */
  hooksInstalled: boolean;
  onToggleHooksEnabled: () => void;
  /** Permission posture applied by the host to every launch from this office. */
  bypassPermissions: boolean;
  onToggleBypassPermissions: () => void;
  /** Whether the launch drawer lists the host's own Directories. */
  showHostDirectories: boolean;
  onToggleShowHostDirectories: () => void;
  /** Where the terminal panel docks; absent where there is no panel. */
  terminalDock?: TerminalDock;
  onTerminalDockChange: (dock: TerminalDock) => void;
  /** Turn the office off (standalone only). */
  onShutdown?: () => void;
  /** Run the guided tour again. */
  onShowGuide?: () => void;
  /** Play the animated presentation again. */
  onShowIntro?: () => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  isDebugMode,
  onToggleDebugMode,
  watchAllSessions,
  onToggleWatchAllSessions,
  hooksInstalled,
  onToggleHooksEnabled,
  bypassPermissions,
  onToggleBypassPermissions,
  showHostDirectories,
  onToggleShowHostDirectories,
  terminalDock,
  onTerminalDockChange,
  onShutdown,
  onShowGuide,
  onShowIntro,
}: SettingsModalProps) {
  const soundMode = useSoundMode();
  const backgroundAgents = useBackgroundAgents();
  const spanishTerminal = useSpanishTerminal();
  const calm = useCalmMode();
  const appTheme = useAppThemeChoice();
  const operatorName = useOperatorName();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Ajustes" width={500}>
      <Section title="Vos">
        <div className="flex items-center justify-between gap-8 py-7 px-8">
          <span className="flex flex-col gap-1">
            <span className="text-sm text-text">Tu nombre</span>
            <span className="text-xs text-text-muted">Para que la oficina te salude</span>
          </span>
          <TextInput
            className="w-160"
            maxLength={40}
            placeholder="Por ejemplo: Valentín"
            defaultValue={operatorName}
            onChange={(e) => setOperatorName(e.target.value)}
          />
        </div>
      </Section>
      <Section title="Apariencia">
        <ChoiceRow
          label="Tema"
          description="Según la hora: oscuro de 20 a 7"
          choices={APP_THEME_CHOICES}
          value={appTheme}
          onChange={setAppThemeChoice}
        />
        {terminalDock && (
          <ChoiceRow
            label="Lado de la terminal"
            description="De qué lado de la ventana aparece"
            choices={TERMINAL_DOCKS}
            value={terminalDock}
            onChange={onTerminalDockChange}
          />
        )}
        <TerminalSchemePicker />
        <Switch
          label="Modo calma"
          description="Sin efectos decorativos: queda sólo lo que dice el estado"
          checked={calm}
          onChange={() => setCalm(!calm)}
        />
      </Section>
      <Section title="Avisos">
        <ChoiceRow
          label="Sonidos"
          description="Toc-toc cuando te necesitan; un plin suave cuando terminan sin nada para vos"
          choices={SOUND_MODES}
          value={soundMode}
          onChange={(next) =>
            chooseSoundMode(next, (enabled) => transport.send({ type: 'setSoundEnabled', enabled }))
          }
        />
        <TeTocaRuleSetting />
      </Section>
      <Section title="Agentes">
        <Switch
          label="Ver todas las sesiones"
          description="También las de otras carpetas, aunque no las hayas abierto desde acá"
          checked={watchAllSessions}
          onChange={onToggleWatchAllSessions}
        />
        <Switch
          label="Ofrecer la carpeta de inicio"
          description="Suma al menú de «+ Agente» la carpeta desde donde arrancó la oficina"
          checked={showHostDirectories}
          onChange={onToggleShowHostDirectories}
        />
        <Switch
          label="Agentes que sobreviven a reinicios"
          description="Corren como sesiones en segundo plano de Claude Code: actualizar o cerrar la oficina no los corta"
          checked={backgroundAgents}
          onChange={() => setBackgroundAgents(!backgroundAgents)}
        />
        <Switch
          label="Claude en castellano"
          description="En la terminal de los agentes nuevos: «Atando cabos…» en vez de «Percolating…», y consejos de la oficina"
          checked={spanishTerminal}
          onChange={() => setSpanishTerminal(!spanishTerminal)}
        />
        {/* Permission posture, set once instead of per launch: while on, the
            host adds the CLI's skip-permissions flag to every agent it launches. */}
        <Switch
          label="Saltear permisos"
          description="Los agentes nuevos hacen todo sin preguntarte. Peligroso."
          danger
          checked={bypassPermissions}
          onChange={onToggleBypassPermissions}
        />
      </Section>
      <Section title="Jarvis">
        <JarvisVoiceSettings />
      </Section>
      <Section title="Avanzado">
        <Switch
          label="Detección al instante"
          description="Los hooks de Claude Code: permisos y avisos en el momento"
          checked={hooksInstalled}
          onChange={onToggleHooksEnabled}
        />
        <Switch
          label="Vista de depuración"
          description="Muestra lo que la oficina recibe de cada agente"
          checked={isDebugMode}
          onChange={onToggleDebugMode}
        />
      </Section>
      <HelpSection onShowGuide={onShowGuide} onShowIntro={onShowIntro} />
      {onShutdown && <ShutdownRow onShutdown={onShutdown} />}
    </Modal>
  );
}

/** Ayuda: the guide and the presentation (desktop layout), and inside the
 *  desktop app the version installed and "Buscar actualizaciones". */
function HelpSection({
  onShowGuide,
  onShowIntro,
}: {
  onShowGuide?: () => void;
  onShowIntro?: () => void;
}) {
  if (!onShowGuide && !hasDesktopUpdates()) return null;
  return (
    <Section title="Ayuda">
      {onShowGuide && (
        <ActionRow
          label="Guía"
          description="Un recorrido rápido por la oficina"
          action="Ver la guía"
          onClick={onShowGuide}
        />
      )}
      {onShowGuide && onShowIntro && (
        <ActionRow
          label="Presentación"
          description="De qué se trata la oficina, en menos de un minuto"
          action="Ver la presentación"
          onClick={onShowIntro}
        />
      )}
      <UpdateHelpRows />
    </Section>
  );
}

function ActionRow({
  label,
  description,
  action,
  onClick,
}: {
  label: string;
  description: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-8 py-7 px-8">
      <span className="flex flex-col gap-1">
        <span className="text-sm text-text">{label}</span>
        <span className="text-xs text-text-muted">{description}</span>
      </span>
      <Button size="sm" onClick={onClick}>
        {action}
      </Button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col pt-6 pb-4">
      <h3 className="m-0 px-8 pb-2 text-2xs font-semibold uppercase tracking-wide text-text-muted">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** A setting with a few named options, as a segmented control. */
function ChoiceRow<T extends string>({
  label,
  description,
  choices,
  value,
  onChange,
}: {
  label: string;
  description: string;
  choices: ReadonlyArray<{ id: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-8 py-7 px-8">
      <span className="flex flex-col gap-1">
        <span className="text-sm text-text">{label}</span>
        <span className="text-xs text-text-muted">{description}</span>
      </span>
      <div className="flex rounded-lg bg-bg-thumb p-2 shrink-0" role="group" aria-label={label}>
        {choices.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={value === c.id}
            onClick={() => onChange(c.id)}
            className={`border-0 rounded-md px-8 py-3 text-xs font-medium cursor-pointer ${
              value === c.id
                ? 'bg-bg text-text shadow-soft'
                : 'bg-transparent text-text-muted hover:text-text'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** "Apagar la oficina", with the consequence spelled out before it happens. */
function ShutdownRow({ onShutdown }: { onShutdown: () => void }) {
  const [asking, setAsking] = useState(false);
  return (
    <div className="flex flex-col gap-4 py-8 px-8 border-t border-border mt-4">
      {asking ? (
        <>
          <span className="text-xs text-text">
            Se cierran las terminales de tus agentes. La próxima vez que abras la oficina se retoman
            con su conversación; lo que estén haciendo en este momento se corta.
          </span>
          <div className="flex gap-4 justify-end">
            <Button size="sm" onClick={() => setAsking(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              variant="accent"
              className="bg-danger! border-danger!"
              onClick={onShutdown}
            >
              Apagar
            </Button>
          </div>
        </>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="self-start px-0! hover:bg-transparent! hover:text-danger!"
          onClick={() => setAsking(true)}
        >
          Apagar la oficina…
        </Button>
      )}
    </div>
  );
}
