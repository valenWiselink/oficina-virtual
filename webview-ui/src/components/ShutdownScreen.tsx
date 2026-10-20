import { useEffect, useState } from 'react';

import { CLAWD_BODY_COLORS } from '../constants.js';
import { IntroClawd } from '../intro/IntroClawd.js';
import { cue } from '../intro/introSound.js';
import { transport } from '../transport/index.js';
import { Button } from './ui/Button.js';

/** What the desktop app's preload exposes (desktop/preload.ts); absent in a browser. */
interface OficinaDesktop {
  quit: () => void;
}
const desktop = (window as { oficinaDesktop?: OficinaDesktop }).oficinaDesktop;

/** Long enough to read the goodbye before the desktop app closes itself. */
const DESKTOP_CLOSE_MS = 3500;

/**
 * The goodbye after "Apagar la oficina": Clawd falls asleep while the server
 * winds down, then says the office is off and the agents will pick up where
 * they left. The desktop app closes itself; in a browser the tab stays, and if
 * the office comes back (opened again) the page reloads into it.
 */
export function ShutdownScreen() {
  const [off, setOff] = useState(transport.state !== 'connected');

  useEffect(
    () =>
      transport.onStateChange((state) => {
        if (state !== 'connected') setOff(true);
        else if (off) location.reload();
      }),
    [off],
  );

  useEffect(() => {
    if (off) cue('goodnight');
  }, [off]);

  useEffect(() => {
    if (!off || !desktop) return;
    const timer = setTimeout(() => desktop.quit(), DESKTOP_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [off]);

  return (
    <div
      className="intro-show shutdown-screen fixed inset-0 z-[300] flex flex-col items-center justify-center gap-18 px-16 text-center"
      role="status"
      aria-live="polite"
    >
      <div className="intro-halo" aria-hidden="true" />
      <div className="relative">
        <IntroClawd color={CLAWD_BODY_COLORS[0]} size={150} pose={off ? 'sleep' : 'idle'} />
        {off && (
          <span className="shutdown-zzz" aria-hidden="true">
            <span>z</span>
            <span>z</span>
            <span>z</span>
          </span>
        )}
      </div>
      <h1 className="m-0 intro-caption">{off ? 'La oficina se apagó' : 'Apagando la oficina…'}</h1>
      <p className="m-0 max-w-[460px] text-base text-text-muted intro-fade-up">
        {off
          ? 'Tus agentes quedaron guardados: la próxima vez que la abras, cada uno retoma su conversación donde la dejó.'
          : 'Guardando las conversaciones de tus agentes.'}
      </p>
      {off &&
        (desktop ? (
          <Button variant="accent" onClick={() => desktop.quit()}>
            Cerrar
          </Button>
        ) : (
          <p className="m-0 text-sm text-text-muted intro-fade-up">
            Ya podés cerrar esta pestaña. Para volver, abrí el acceso «Oficina virtual».
          </p>
        ))}
    </div>
  );
}
