import { useEffect, useState } from 'react';

import { Button } from '../components/ui/Button.js';
import type { AgentView } from '../views/agentViews.js';
import { updatesBridge, type UpdateState, useDesktopUpdate } from './desktopUpdates.js';
import { busyCount } from './installWhenIdle.js';
import { NoticeHeader } from './NoticeHeader.js';
import { ReleaseNotesList } from './ReleaseNotesList.js';
import { UpdateNotice } from './UpdateNotice.js';
import { checkAnswerText } from './updateWords.js';
import { useInstallWhenIdle } from './useInstallWhenIdle.js';

/** How long the answer to a check you asked for stays up. */
const CHECK_ANSWER_MS = 8_000;

/**
 * The desktop app's updates, top right of the office: what the version you
 * just got brings (once), a new version ready to install, and the answer to
 * "Buscar actualizaciones" from the tray. Nothing in a browser: there is no
 * updater there.
 */
export function UpdateCorner({
  views,
  permissions,
}: {
  views: AgentView[];
  permissions: ReadonlyArray<{ id?: number }>;
}) {
  const update = useDesktopUpdate();
  const busy = busyCount(views, permissions);
  useInstallWhenIdle(update, busy);
  if (!update) return null;
  return (
    <div className="absolute top-10 right-14 z-40 w-[min(380px,calc(100%-28px))] flex flex-col items-end gap-8 pointer-events-none">
      {update.whatsNew && <WhatsNew whatsNew={update.whatsNew} />}
      <UpdateNotice update={update} busy={busy} />
      <CheckAnswer update={update} />
    </div>
  );
}

/** "Ahora tenés la 1.0.N: trae…", until you close it. */
function WhatsNew({ whatsNew }: { whatsNew: NonNullable<UpdateState['whatsNew']> }) {
  const close = () => updatesBridge()?.whatsNewSeen();
  return (
    <div role="status" className="pointer-events-auto soft-panel w-full p-10 flex flex-col gap-8">
      <NoticeHeader
        icon="celebration"
        title={`Ahora tenés la ${whatsNew.version}${whatsNew.notes.length > 0 ? ': trae…' : ''}`}
        onClose={close}
        closeTitle="Cerrar"
      />
      <ReleaseNotesList notes={whatsNew.notes} version={whatsNew.version} />
      <div className="flex justify-end">
        <Button size="sm" variant="accent" onClick={close}>
          Listo
        </Button>
      </div>
    </div>
  );
}

/** What a check you asked for found, for a few seconds (a download in
 *  progress stays until the notice replaces it). */
function CheckAnswer({ update }: { update: UpdateState }) {
  const check = update.lastCheck;
  const [shownAt, setShownAt] = useState<number | null>(null);
  useEffect(() => {
    if (!check?.manual) return;
    setShownAt(check.at);
    const timer = setTimeout(() => setShownAt(null), CHECK_ANSWER_MS);
    return () => clearTimeout(timer);
  }, [check?.at, check?.manual]);
  const text = checkAnswerText(update, shownAt !== null);
  if (!text) return null;
  return (
    <span role="status" className="pointer-events-auto soft-panel py-4 px-10 text-xs text-text">
      {text}
    </span>
  );
}
