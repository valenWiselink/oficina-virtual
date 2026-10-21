import { useState } from 'react';

import { pickNext } from './graphPick.js';

/** Several agents picked together on the graph (Ctrl+click, Shift + box). */
export function useGraphPicks(selected: () => number | null) {
  const [picked, setPicked] = useState<number[]>([]);
  return {
    picked,
    set: new Set(picked),
    any: picked.length > 0,
    clear: () => setPicked((prev) => (prev.length > 0 ? [] : prev)),
    onPick: (ids: number[], how: 'toggle' | 'add') =>
      setPicked((prev) => pickNext(prev, ids, how, selected())),
  };
}
