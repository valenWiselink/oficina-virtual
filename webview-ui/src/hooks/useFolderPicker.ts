import { useEffect, useRef, useState } from 'react';

import { transport } from '../transport/index.js';

/** The desktop app's bridge (desktop/preload.ts); absent in a browser. */
const desktop = (window as { oficinaDesktop?: { pickFolder?: () => Promise<string | undefined> } })
  .oficinaDesktop;

/**
 * The host's folder picker (the desktop app's own when there is one, else the
 * server's): `pick()` opens it, `onPicked` gets the folder
 * chosen (nothing when cancelled). `picking` is true while it is open.
 */
export function useFolderPicker(onPicked: (path: string) => void) {
  const [picking, setPicking] = useState(false);
  const latest = useRef(onPicked);
  useEffect(() => {
    latest.current = onPicked;
  });

  useEffect(
    () =>
      transport.onMessage((msg) => {
        if (msg.type !== 'folderPicked') return;
        setPicking(false);
        if (msg.path) latest.current(msg.path);
      }),
    [],
  );

  const pick = () => {
    setPicking(true);
    if (desktop?.pickFolder) {
      desktop.pickFolder().then(
        (path) => {
          setPicking(false);
          if (path) latest.current(path);
        },
        () => setPicking(false),
      );
      return;
    }
    transport.send({ type: 'pickFolder' });
  };
  return { pick, picking };
}
