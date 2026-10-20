import { useEffect, useRef, useState } from 'react';

import type { Directory } from '../hooks/useExtensionMessages.js';
import { isBrowserRuntime } from '../runtime.js';
import type { OfficeView } from '../views/useOfficeView.js';
import { LaunchDrawer } from './LaunchDrawer.js';
import { Button } from './ui/Button.js';

interface BottomToolbarProps {
  /** Which view fills the office: the board or the live graph. */
  view: OfficeView;
  onViewChange: (view: OfficeView) => void;
  isSettingsOpen: boolean;
  onToggleSettings: () => void;
  /** Today's history panel. */
  isHistoryOpen: boolean;
  onToggleHistory: () => void;
  directories: Directory[];
  /** Drawer's pinned `+ Directory` row — opens the Directory modal empty. */
  onAddDirectory: () => void;
  /** Pencil on a user-defined row — opens the modal pre-filled. */
  onEditDirectory: (directory: Directory) => void;
  /** Standalone: server has a working PTY, so agents can be launched here. */
  terminalAvailable: boolean;
  /** Why the terminal is off (shown on the disabled button's tooltip). */
  terminalUnavailableReason: string | null;
  /** Launch into a Directory (the office asks name and colour first). */
  onLaunch: (directory: Directory) => void;
  /** Bumped to open the launch drawer from elsewhere (Ctrl+K "Nuevo agente"). */
  launchSignal?: number;
}

export function BottomToolbar({
  view,
  onViewChange,
  isSettingsOpen,
  onToggleSettings,
  isHistoryOpen,
  onToggleHistory,
  directories,
  onAddDirectory,
  onEditDirectory,
  terminalAvailable,
  terminalUnavailableReason,
  onLaunch,
  launchSignal = 0,
}: BottomToolbarProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [lastSignal, setLastSignal] = useState(launchSignal);
  // Adjusting state on a prop change during render (React's documented way).
  if (launchSignal !== lastSignal) {
    setLastSignal(launchSignal);
    setIsDrawerOpen(true);
  }
  const launchRef = useRef<HTMLDivElement>(null);

  // Close the launch drawer on outside press (the dropdown convention here).
  useEffect(() => {
    if (!isDrawerOpen) return;
    const handlePress = (e: PointerEvent) => {
      if (launchRef.current && !launchRef.current.contains(e.target as Node)) {
        setIsDrawerOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePress);
    return () => document.removeEventListener('pointerdown', handlePress);
  }, [isDrawerOpen]);

  // A plain press never launches: it opens the drawer, and the launch happens
  // from a Directory row. Opening (not toggling) so a click that follows the
  // hover — which already opened the drawer — doesn't close it.
  const handleAgentClick = () => {
    setIsDrawerOpen(true);
  };

  const handleDirectorySelect = (directory: Directory) => {
    setIsDrawerOpen(false);
    onLaunch(directory);
  };

  // Standalone can launch agents whenever the server has a working PTY. When it
  // doesn't, show the button disabled with the reason rather than hiding it —
  // silently missing UI reads as a bug, and the cause (a native module that
  // couldn't install) is not something a user would otherwise ever discover.
  const canLaunch = !isBrowserRuntime || terminalAvailable;
  const showUnavailable = isBrowserRuntime && !terminalAvailable;

  return (
    // Bottom-left. The terminal panel docks on the right edge, so it never
    // reaches these buttons and no lift is needed.
    <div className="absolute left-14 bottom-14 z-20 flex items-center gap-6 soft-panel p-5">
      {showUnavailable && (
        <Button
          variant="disabled"
          disabled
          title={terminalUnavailableReason ?? 'La terminal no está disponible en este servidor.'}
        >
          + Agente
        </Button>
      )}
      {canLaunch && (
        <div
          ref={launchRef}
          className="relative"
          data-tour="agente"
          // Hover is the desktop secondary gesture (long-press is the mobile
          // one): it opens the drawer without committing to a launch.
          onMouseEnter={() => setIsDrawerOpen(true)}
          onMouseLeave={() => setIsDrawerOpen(false)}
        >
          <Button
            variant="accent"
            onClick={handleAgentClick}
            className={`flex items-center gap-4 ${isDrawerOpen ? 'bg-accent-bright' : 'bg-accent hover:bg-accent-bright'}`}
          >
            <Icon name="add" />
            Agente
          </Button>
          <LaunchDrawer
            isOpen={isDrawerOpen}
            directories={directories}
            onSelect={handleDirectorySelect}
            onAddDirectory={() => {
              setIsDrawerOpen(false);
              onAddDirectory();
            }}
            onEditDirectory={(directory) => {
              setIsDrawerOpen(false);
              onEditDirectory(directory);
            }}
          />
        </div>
      )}
      {/* Two views of the same agents: a segmented switch, not two buttons. */}
      <div
        className="flex rounded-lg bg-bg-thumb p-2"
        role="group"
        aria-label="Vista"
        data-tour="vistas"
      >
        {(
          [
            ['tablero', 'view_kanban', 'Tablero', 'Agentes por estado'],
            ['grafo', 'hub', 'Grafo', 'Cómo trabajan entre ellos'],
          ] as const
        ).map(([id, icon, label, title]) => (
          <button
            key={id}
            type="button"
            aria-pressed={view === id}
            onClick={() => onViewChange(id)}
            title={title}
            className={`flex items-center gap-4 border-0 rounded-md px-10 py-5 text-sm font-medium cursor-pointer ${
              view === id
                ? 'bg-bg text-text shadow-soft'
                : 'bg-transparent text-text-muted hover:text-text'
            }`}
          >
            <Icon name={icon} />
            {label}
          </button>
        ))}
      </div>
      <Button
        variant={isHistoryOpen ? 'active' : 'ghost'}
        onClick={onToggleHistory}
        data-tour="historial"
        title="Lo que pasó hoy"
        className="flex items-center gap-4"
      >
        <Icon name="history" />
        Historial
      </Button>
      <Button
        variant={isSettingsOpen ? 'active' : 'ghost'}
        className="flex items-center gap-4"
        onClick={onToggleSettings}
        data-tour="ajustes"
        title="Ajustes"
      >
        <Icon name="settings" />
        Ajustes
      </Button>
    </div>
  );
}

function Icon({ name }: { name: string }) {
  return (
    <span className="material-symbols-sharp text-base" aria-hidden="true">
      {name}
    </span>
  );
}
