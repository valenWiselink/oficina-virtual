/** One choice out of a few, as a row of chips. */
export function Choices({
  legend,
  choices,
  value,
  disabled = false,
  onChange,
}: {
  legend: string;
  choices: ReadonlyArray<{ value: string | null; label: string }>;
  value: string | null;
  disabled?: boolean;
  onChange: (value: string | null) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-6 border-0 p-0 m-0" disabled={disabled}>
      <legend className="text-xs font-medium text-text mb-6">{legend}</legend>
      <div className="flex flex-wrap gap-4">
        {choices.map((c) => (
          <button
            key={c.label}
            type="button"
            aria-pressed={value === c.value}
            onClick={() => onChange(c.value)}
            className={`text-xs px-10 py-4 rounded-full border cursor-pointer transition-colors disabled:cursor-default disabled:opacity-50 ${
              value === c.value
                ? 'border-accent bg-active-bg text-text font-semibold'
                : 'border-border bg-bg text-text-muted hover:border-border-strong'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
