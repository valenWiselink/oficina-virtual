import type { CSSProperties } from 'react';

const COUNT = 12;

/** Shades of one colour: itself, lighter and darker, so the sparks read as
 *  "that Clawd's" party, not a generic rainbow. */
const shades = (color: string) => [
  color,
  `color-mix(in srgb, ${color} 55%, white)`,
  `color-mix(in srgb, ${color} 70%, black)`,
];

/**
 * A burst of little squares flying out from the middle of the parent (which
 * must be positioned). One-shot: mount it when the celebration starts.
 */
export function Sparks({ color }: { color: string }) {
  const palette = shades(color);
  return (
    <span className="absolute left-1/2 top-1/2 pointer-events-none" aria-hidden="true">
      {Array.from({ length: COUNT }, (_, i) => {
        const angle = (i / COUNT) * Math.PI * 2 + (i % 2) * 0.3;
        const distance = 26 + ((i * 7) % 18);
        const style = {
          '--spark-color': palette[i % palette.length],
          '--spark-dx': `${Math.round(Math.cos(angle) * distance)}px`,
          '--spark-dy': `${Math.round(Math.sin(angle) * distance - 10)}px`,
          '--spark-delay': `${(i % 4) * 40}ms`,
          left: -3,
          top: -3,
        } as CSSProperties;
        return <span key={i} className="spark" style={style} />;
      })}
    </span>
  );
}
