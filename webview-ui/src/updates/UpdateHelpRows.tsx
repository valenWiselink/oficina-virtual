import { useState } from 'react';

import { Button } from '../components/ui/Button.js';
import { checkForUpdatesNow, useDesktopUpdate } from './desktopUpdates.js';
import { settingsCheckText } from './updateWords.js';

/** Ajustes → Ayuda: the version installed and "Buscar actualizaciones". */
export function UpdateHelpRows() {
  const update = useDesktopUpdate();
  const [asked, setAsked] = useState(false);
  const [checking, setChecking] = useState(false);
  if (!update) return null;
  const check = async () => {
    setChecking(true);
    try {
      await checkForUpdatesNow();
    } finally {
      setChecking(false);
      setAsked(true);
    }
  };
  return (
    <div className="flex items-center justify-between gap-8 py-7 px-8">
      <span className="flex flex-col gap-1">
        <span className="text-sm text-text">Versión {update.current}</span>
        <span className="text-xs text-text-muted">
          {asked || update.status === 'ready' || !update.enabled
            ? settingsCheckText(update)
            : 'Se fija sola cada 20 minutos'}
        </span>
      </span>
      {update.enabled && (
        <Button size="sm" disabled={checking} onClick={() => void check()}>
          {checking ? 'Buscando…' : 'Buscar actualizaciones'}
        </Button>
      )}
    </div>
  );
}
