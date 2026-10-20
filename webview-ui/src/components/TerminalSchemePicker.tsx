import { TERMINAL_PRESETS } from '../constants.js';
import {
  setCustomColors,
  setTerminalColorize,
  setTerminalLookChoice,
  useAutoScheme,
  useClaudeLook,
  useCustomColors,
  useTerminalColorize,
  useTerminalLookChoice,
  useTerminalScheme,
} from '../terminal/terminalLook.js';
import {
  type CustomColors,
  customScheme,
  presetScheme,
  type TerminalScheme,
} from '../terminal/terminalSchemes.js';
import { Switch } from './ui/Switch.js';

/**
 * The terminal's colours: "Automático" (as Claude Code), each preset as a
 * tiny terminal showing what really shows most — background, text, your
 * message's band, Claude's dim marks — and "Personalizado" with your own
 * background, text and accent. When the chosen scheme is the opposite
 * brightness of Claude Code's theme, a note says how to make Claude Code use
 * the scheme's colours (its ANSI-only theme).
 */
export function TerminalSchemePicker() {
  const choice = useTerminalLookChoice();
  const auto = useAutoScheme();
  const custom = useCustomColors();
  const shown = useTerminalScheme();
  const claudeLook = useClaudeLook();
  const colorize = useTerminalColorize();
  return (
    <div className="flex flex-col gap-8 py-7 px-8">
      <span className="flex flex-col gap-1">
        <span className="text-sm text-text">Colores de la terminal</span>
        <span className="text-xs text-text-muted">
          Automático usa claro u oscuro según el tema que elegiste en Claude Code
        </span>
      </span>
      <div className="grid grid-cols-5 gap-6" role="radiogroup" aria-label="Colores de la terminal">
        <Swatch
          label="Automático"
          scheme={auto}
          selected={choice === 'auto'}
          onPick={() => setTerminalLookChoice('auto')}
        />
        {TERMINAL_PRESETS.map((p) => (
          <Swatch
            key={p.id}
            label={p.label}
            scheme={presetScheme(p)}
            selected={choice === p.id}
            onPick={() => setTerminalLookChoice(p.id)}
          />
        ))}
        <Swatch
          label="Personalizado"
          scheme={customScheme(custom)}
          selected={choice === 'custom'}
          onPick={() => setTerminalLookChoice('custom')}
        />
      </div>
      {choice === 'custom' && <CustomColorsRow colors={custom} />}
      <Switch
        label="Colorear lo que escribe Claude"
        description="Herramientas, su salida apagada, «Te toca» y listas, con los colores del tema"
        checked={colorize}
        onChange={() => setTerminalColorize(!colorize)}
      />
      {shown.look !== claudeLook && (
        <p className="m-0 text-xs text-text-muted leading-relaxed bg-bg-dark rounded-md px-8 py-6">
          Tu Claude Code está en tema {claudeLook === 'light' ? 'claro' : 'oscuro'} y esta terminal
          es {shown.look === 'light' ? 'clara' : 'oscura'}: sus marcas salen en gris. Para que use
          los colores del tema, en su terminal escribí <code>/theme</code> y elegí{' '}
          <strong>
            {shown.look === 'dark'
              ? 'Dark mode (ANSI colors only)'
              : 'Light mode (ANSI colors only)'}
          </strong>
          .
        </p>
      )}
    </div>
  );
}

/** One scheme as a tiny terminal, as it really looks: your message on its
 *  band, Claude's answer, a dim tool line, a diff. */
function Swatch({
  label,
  scheme,
  selected,
  onPick,
}: {
  label: string;
  scheme: TerminalScheme;
  selected: boolean;
  onPick: () => void;
}) {
  const t = scheme.theme;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      title={label}
      onClick={onPick}
      className={`flex flex-col gap-3 p-3 rounded-lg border-2 cursor-pointer bg-transparent ${
        selected ? 'border-accent' : 'border-transparent hover:border-border-strong'
      }`}
    >
      <span
        className="flex flex-col gap-2 rounded-md p-5 text-left font-mono leading-none overflow-hidden"
        style={{ background: t.background, fontSize: 8 }}
        aria-hidden="true"
      >
        <span
          className="-mx-5 px-5"
          style={{ background: scheme.prompt.background, color: scheme.prompt.foreground }}
        >
          ❯ hola
        </span>
        <span style={{ color: t.foreground }}>● Listo</span>
        <span style={{ color: t.brightBlack }}>&nbsp;⎿ 3 líneas</span>
        <span>
          <span style={{ color: t.green }}>+ok </span>
          <span style={{ color: t.red }}>-mal</span>
        </span>
      </span>
      <span className="text-2xs text-text truncate">{label}</span>
    </button>
  );
}

const CUSTOM_FIELDS: ReadonlyArray<{ key: keyof CustomColors; label: string }> = [
  { key: 'background', label: 'Fondo' },
  { key: 'foreground', label: 'Texto' },
  { key: 'accent', label: 'Acento' },
];

/** Your own background, text and accent (the ANSI colours follow the base
 *  scheme that suits the background). */
function CustomColorsRow({ colors }: { colors: CustomColors }) {
  return (
    <div className="flex gap-12">
      {CUSTOM_FIELDS.map((f) => (
        <label key={f.key} className="flex items-center gap-6 text-xs text-text cursor-pointer">
          <input
            type="color"
            value={colors[f.key]}
            onChange={(e) => setCustomColors({ [f.key]: e.target.value })}
            className="w-28 h-28 p-0 border border-border rounded-md bg-transparent cursor-pointer"
          />
          {f.label}
        </label>
      ))}
    </div>
  );
}
