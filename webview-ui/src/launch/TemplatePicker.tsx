import { AGENT_TEMPLATES, type AgentTemplate } from './agentTemplates.js';

/** Chips with the ready-made starts (agentTemplates.ts). */
export function TemplatePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (template: AgentTemplate) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs font-medium text-text">Para qué</span>
      <div className="flex flex-wrap gap-4" role="radiogroup" aria-label="Plantilla">
        {AGENT_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={value === t.id}
            onClick={() => onChange(t)}
            className={`border rounded-full px-10 py-3 text-xs font-medium cursor-pointer ${
              value === t.id
                ? 'border-accent bg-active-bg text-text'
                : 'border-border bg-bg text-text-muted hover:text-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
