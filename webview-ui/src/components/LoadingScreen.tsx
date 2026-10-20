import { useEffect, useState } from 'react';

const PHRASES = [
  'Despertando a los agentes…',
  'Buscando el mate…',
  'Acomodando las sillas…',
  'Prendiendo la oficina…',
  'Contando Clawds…',
];
const PHRASE_MS = 1600;

/**
 * What shows while the office connects: Clawd walking back and forth and a
 * line that changes every moment. Drawn inline (the agents' sprites arrive
 * with the connection, so they are not there yet).
 */
export function LoadingScreen() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setI((n) => (n + 1) % PHRASES.length), PHRASE_MS);
    return () => clearInterval(timer);
  }, []);
  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center gap-14 bg-bg-dark"
      role="status"
    >
      <div className="loading-track" aria-hidden="true">
        <svg className="loading-clawd" viewBox="-1 -1 18 16" width="64" height="56">
          <g className="loading-legs-a">
            <rect x="2" y="9" width="1.2" height="4.3" rx="0.6" />
            <rect x="10.8" y="9" width="1.2" height="4.3" rx="0.6" />
          </g>
          <g className="loading-legs-b">
            <rect x="4" y="9" width="1.2" height="4.3" rx="0.6" />
            <rect x="12.8" y="9" width="1.2" height="4.3" rx="0.6" />
          </g>
          <g className="loading-body">
            <rect x="0" y="3.6" width="2" height="2.6" rx="0.8" />
            <rect x="14" y="3.6" width="2" height="2.6" rx="0.8" />
            <rect x="1" y="0" width="14" height="10.4" rx="2" />
            <rect className="loading-eye" x="4" y="2.2" width="1.3" height="2.6" rx="0.65" />
            <rect className="loading-eye" x="10.7" y="2.2" width="1.3" height="2.6" rx="0.65" />
          </g>
        </svg>
      </div>
      <p key={i} className="anim-float-up m-0 text-sm text-text-muted">
        {PHRASES[i]}
      </p>
    </div>
  );
}
