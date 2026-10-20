import type { CSSProperties } from 'react';

export type ClawdPose = 'idle' | 'walk' | 'wave' | 'type' | 'happy' | 'sleep';

/**
 * Clawd drawn smooth (rounded rects, like the app icon) for the presentation:
 * body in `color`, dark eyes, arm nubs and four legs, with a pose that the
 * CSS animates (legs stepping, an arm waving, arms typing, happy or closed eyes).
 */
export function IntroClawd({
  color,
  size = 64,
  pose = 'idle',
  className = '',
  style,
}: {
  color: string;
  size?: number;
  pose?: ClawdPose;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      className={`intro-clawd intro-pose-${pose} ${className}`}
      viewBox="-1 -2 18 16"
      width={size}
      height={(size * 16) / 18}
      style={{ ...style, '--clawd': color } as CSSProperties}
      aria-hidden="true"
    >
      <g className="intro-legs-a">
        <rect x="2" y="9" width="1.2" height="4.3" rx="0.6" />
        <rect x="10.8" y="9" width="1.2" height="4.3" rx="0.6" />
      </g>
      <g className="intro-legs-b">
        <rect x="4" y="9" width="1.2" height="4.3" rx="0.6" />
        <rect x="12.8" y="9" width="1.2" height="4.3" rx="0.6" />
      </g>
      <g className="intro-body">
        <rect className="intro-arm-l" x="0" y="3.6" width="2" height="2.6" rx="0.8" />
        <rect className="intro-arm-r" x="14" y="3.6" width="2" height="2.6" rx="0.8" />
        <rect x="1" y="0" width="14" height="10.4" rx="2" />
        {pose === 'sleep' ? (
          <g className="intro-eye-happy">
            <path d="M3.9 3.6 H5.4" />
            <path d="M10.6 3.6 H12.1" />
          </g>
        ) : pose === 'happy' ? (
          <g className="intro-eye-happy">
            <path d="M3.9 3.6 Q4.65 2.4 5.4 3.6" />
            <path d="M10.6 3.6 Q11.35 2.4 12.1 3.6" />
          </g>
        ) : (
          <g className="intro-eyes">
            <rect className="intro-eye" x="4" y="2.2" width="1.3" height="2.6" rx="0.65" />
            <rect className="intro-eye" x="10.7" y="2.2" width="1.3" height="2.6" rx="0.65" />
          </g>
        )}
      </g>
    </svg>
  );
}
