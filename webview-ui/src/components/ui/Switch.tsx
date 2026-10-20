import type { ReactNode } from 'react';

interface SwitchProps {
  checked: boolean;
  onChange: () => void;
  label: ReactNode;
  /** One line saying what it does (or what it risks). */
  description?: ReactNode;
  /** Turning it on is risky: the description reads in red. */
  danger?: boolean;
}

/** An on/off setting: the whole row toggles it, the pill shows the state. */
export function Switch({ checked, onChange, label, description, danger = false }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="flex items-center justify-between gap-12 w-full py-7 px-8 bg-transparent border-none rounded-lg cursor-pointer text-left hover:bg-btn-bg"
    >
      <span className="flex flex-col gap-1 min-w-0">
        <span className="text-sm text-text">{label}</span>
        {description && (
          <span className={`text-xs ${danger ? 'text-danger' : 'text-text-muted'}`}>
            {description}
          </span>
        )}
      </span>
      <span
        className={`relative shrink-0 w-34 h-20 rounded-full transition-colors ${
          checked ? (danger ? 'bg-danger' : 'bg-accent') : 'bg-border-strong'
        }`}
        aria-hidden="true"
      >
        <span
          className={`absolute top-2 w-16 h-16 rounded-full bg-bg shadow-soft transition-all ${
            checked ? 'left-16' : 'left-2'
          }`}
        />
      </span>
    </button>
  );
}
