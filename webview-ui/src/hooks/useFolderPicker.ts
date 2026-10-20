import { useEffect, useRef, useState } from 'react';

import { transport } from '../transport/index.js';

/**
 * The host's folder picker: `pick()` opens it, `onPicked` gets the folder
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
    transport.send({ type: 'pickFolder' });
  };
  return { pick, picking };
}
