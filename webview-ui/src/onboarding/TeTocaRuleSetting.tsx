import { Switch } from '../components/ui/Switch.js';
import { setTeTocaRuleGlobal, useTeTocaRule } from './teTocaRule.js';

/**
 * The "Te toca" rule for the sessions outside the office (the welcome and
 * Ajustes → Avisos). The office's own agents always get it; this switch also
 * adds it to the global CLAUDE.md, or takes back what it added. Wording the
 * user wrote is theirs: it only says so.
 */
export function TeTocaRuleSetting() {
  const rule = useTeTocaRule();
  if (rule === null) return null;
  if (rule.status === 'own') {
    return (
      <p className="m-0 py-7 px-8 text-xs text-text-muted leading-relaxed">
        Ya tenías la regla del «Te toca» en tu CLAUDE.md global: tus agentes la usan también fuera
        de la oficina.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Switch
        label="«Te toca» también fuera de la oficina"
        description="Tus agentes de la oficina ya cierran con «Te toca: …» cuando te dejan algo. Esto suma la misma regla a tu CLAUDE.md global, para las sesiones que abrís por tu cuenta"
        checked={rule.status === 'office'}
        onChange={() => setTeTocaRuleGlobal(rule.status !== 'office')}
      />
      {rule.error && (
        <span className="px-8 text-xs text-danger" role="alert">
          {rule.error}
        </span>
      )}
    </div>
  );
}
