import { useState } from 'react';

import { useBackgroundAgents } from '../agents/backgroundAgentsSetting.js';
import { Button } from '../components/ui/Button.js';
import { updatesBridge, type UpdateState } from './desktopUpdates.js';
import { NoticeHeader } from './NoticeHeader.js';
import { ReleaseNotesList } from './ReleaseNotesList.js';
import { agentsWord } from './updateWords.js';

const COLLAPSED_KEY = 'oficina.update.collapsed';

function readCollapsed(): string | null {
  try {
    return localStorage.getItem(COLLAPSED_KEY);
  } catch {
    return null;
  }
}

function writeCollapsed(version: string): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, version);
  } catch {
    /* only a convenience */
  }
}

/**
 * "Hay 1.0.N": what it brings and two ways to install it. "Instalar ahora"
 * asks first when someone is working (installing restarts the office);
 * "Cuando nadie esté trabajando" arms the install (useInstallWhenIdle).
 * Closed, it stays as a small pill until the next version.
 */
export function UpdateNotice({ update, busy }: { update: UpdateState; busy: number }) {
  const [collapsedFor, setCollapsedFor] = useState(readCollapsed);
  const [confirming, setConfirming] = useState(false);
  const [installing, setInstalling] = useState(false);
  if (update.status !== 'ready' || !update.version) return null;
  const version = update.version;
  const install = () => {
    setInstalling(true);
    updatesBridge()?.install();
  };
  if (collapsedFor === version && !installing) {
    return <UpdatePill update={update} version={version} onOpen={() => setCollapsedFor(null)} />;
  }
  const collapse = () => {
    writeCollapsed(version);
    setCollapsedFor(version);
    setConfirming(false);
  };
  return (
    <div role="status" className="pointer-events-auto soft-panel w-full p-10 flex flex-col gap-8">
      <NoticeHeader
        icon="system_update"
        title={`Hay una versión nueva: ${version}`}
        onClose={installing ? undefined : collapse}
        closeTitle="Achicar (sigue acá arriba)"
      />
      {installing ? (
        <span className="text-xs text-text">
          Instalando… La oficina se cierra y vuelve sola en un ratito.
        </span>
      ) : (
        <>
          {!update.whenIdle && <ReleaseNotesList notes={update.notes} version={version} />}
          {confirming ? (
            <ConfirmInstall busy={busy} onInstall={install} onBack={() => setConfirming(false)} />
          ) : (
            <InstallChoices
              update={update}
              busy={busy}
              onInstallNow={() => (busy > 0 ? setConfirming(true) : install())}
            />
          )}
        </>
      )}
    </div>
  );
}

/** The notice closed: one line that opens it again. */
function UpdatePill({
  update,
  version,
  onOpen,
}: {
  update: UpdateState;
  version: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="pointer-events-auto soft-panel flex items-center gap-6 py-4 px-10 text-xs text-text cursor-pointer"
      onClick={onOpen}
    >
      <span className="material-symbols-sharp text-sm text-accent" aria-hidden="true">
        system_update
      </span>
      {update.whenIdle ? `La ${version} se instala cuando nadie trabaje` : `Hay ${version}`}
    </button>
  );
}

/** The two buttons, or — once armed — what it is waiting for and "Cancelar". */
function InstallChoices({
  update,
  busy,
  onInstallNow,
}: {
  update: UpdateState;
  busy: number;
  onInstallNow: () => void;
}) {
  const bridge = updatesBridge();
  if (update.whenIdle) {
    return (
      <div className="flex flex-col gap-6">
        <span className="text-xs text-text">
          Se instala sola cuando nadie esté trabajando.{' '}
          <span className="text-text-muted">
            {busy > 0
              ? `Ahora hay ${agentsWord(busy)} trabajando.`
              : 'Nadie está trabajando: en unos segundos arranca.'}
          </span>
        </span>
        <div className="flex gap-4 justify-end">
          <Button size="sm" onClick={() => bridge?.setWhenIdle(false)}>
            Cancelar
          </Button>
          <Button size="sm" variant="accent" onClick={onInstallNow}>
            Instalar ahora
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-4 justify-end flex-wrap">
        <Button size="sm" onClick={() => bridge?.setWhenIdle(true)}>
          Cuando nadie esté trabajando
        </Button>
        <Button size="sm" variant="accent" onClick={onInstallNow}>
          Instalar ahora
        </Button>
      </div>
      <span className="text-2xs text-text-muted">
        Si no, se instala sola la próxima vez que apagues la oficina.
      </span>
    </div>
  );
}

/** Before restarting over someone's work: say what happens to it. */
function ConfirmInstall({
  busy,
  onInstall,
  onBack,
}: {
  busy: number;
  onInstall: () => void;
  onBack: () => void;
}) {
  const survive = useBackgroundAgents();
  return (
    <div className="flex flex-col gap-6">
      <span className="text-xs text-text">
        Hay {agentsWord(busy)} trabajando. Para instalar, la oficina se cierra y vuelve sola.{' '}
        {survive
          ? 'Tus agentes siguen trabajando en segundo plano y vuelven a aparecer al abrir.'
          : 'Lo que estén haciendo ahora se corta; al volver, se retoman con su conversación.'}
      </span>
      <div className="flex gap-4 justify-end">
        <Button size="sm" onClick={onBack}>
          Volver
        </Button>
        <Button size="sm" variant="accent" onClick={onInstall}>
          Instalar igual
        </Button>
      </div>
    </div>
  );
}
