import { CharacterMugShot } from '../components/CharacterMugShot.js';
import { CLAWD_COLOR_NAMES } from './clawdColors.js';

/** The agent's colour, as the Clawd it will be. */
export function ClawdColorPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (palette: number) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-6 border-0 p-0 m-0">
      <legend className="text-xs font-medium text-text mb-6">Color</legend>
      <div className="flex flex-wrap gap-6">
        {CLAWD_COLOR_NAMES.map((color, palette) => (
          <button
            key={color}
            type="button"
            aria-pressed={value === palette}
            title={color}
            onClick={() => onChange(palette)}
            className={`flex flex-col items-center gap-2 w-60 py-6 rounded-xl border cursor-pointer transition-colors ${
              value === palette
                ? 'border-accent bg-active-bg ring-2 ring-accent/25'
                : 'border-border bg-bg hover:border-border-strong'
            }`}
          >
            <CharacterMugShot palette={palette} hueShift={0} size={32} />
            <span className="text-2xs text-text-muted">{color}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
