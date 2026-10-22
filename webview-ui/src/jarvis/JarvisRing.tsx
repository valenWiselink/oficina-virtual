import type { JarvisMood } from './jarvisRules.js';

/** Jarvis's only body: a ring in its own colour. The dashed arc turns while it
 *  works; grey when it is not in the office. Decorative (the bar says it). */
export function JarvisRing({ mood, size = 34 }: { mood: JarvisMood; size?: number }) {
  const tone = mood === 'away' ? 'text-border-strong' : 'text-jarvis';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 34 34"
      aria-hidden="true"
      className={`shrink-0 ${tone}`}
    >
      <circle
        cx="17"
        cy="17"
        r="15"
        fill="none"
        stroke="currentColor"
        strokeWidth={mood === 'needs' ? 2.5 : 1.5}
        opacity={mood === 'needs' ? 0.6 : 0.35}
      />
      <g className={mood === 'busy' ? 'jarvis-turn' : undefined}>
        <circle
          cx="17"
          cy="17"
          r="10"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeDasharray="40 12"
          strokeLinecap="round"
        />
      </g>
      <circle cx="17" cy="17" r="3.5" fill="currentColor" />
    </svg>
  );
}

/** A row of bars, as if it were speaking: the visor's mark. */
export function JarvisVoiceBars() {
  const heights = [10, 20, 32, 24, 36, 18, 28, 14, 22, 8];
  return (
    <div aria-hidden="true" className="flex items-center gap-5 h-36 text-jarvis">
      {heights.map((h, i) => (
        <span
          key={i}
          className="jarvis-bar block w-4 rounded-full bg-current"
          style={{ height: h, animationDelay: `${(i % 5) * 0.14}s` }}
        />
      ))}
    </div>
  );
}
