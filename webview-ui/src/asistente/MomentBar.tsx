import { type Moment, momentLabel } from './asistenteRules.js';

const OPTIONS: Array<[Moment, string, string]> = [
  ['escribir', 'edit', 'Sólo la conversación: lo que espera, en una línea'],
  ['decidir', 'bolt', 'Lo que espera, en cartas arriba del cuadro, con el equipo y lo que viene'],
  ['reunion', 'groups', 'Jarvis callado, sólo lo urgente; lo que le escribís queda como nota'],
  ['cierre', 'bedtime', 'Lo que se hizo hoy, lo que queda y a quién cerrar'],
];

/**
 * The moments, the one on screen lit. The office picks it (and says why);
 * a click picks one by hand until the situation changes, and «Automático»
 * gives it back to the office.
 */
export function MomentBar({
  moment,
  onChoose,
  onAuto,
  chosen,
  reason,
  waiting,
}: {
  moment: Moment;
  onChoose: (m: Moment) => void;
  onAuto: () => void;
  /** Picked by hand (not the office's). */
  chosen: boolean;
  reason?: string;
  waiting: number;
}) {
  return (
    <div className="shrink-0 flex flex-wrap items-center gap-x-10 gap-y-4">
      <div className="flex rounded-lg bg-bg-thumb p-2" role="group" aria-label="Momento">
        {OPTIONS.map(([id, icon, title]) => (
          <button
            key={id}
            type="button"
            aria-pressed={moment === id}
            title={title}
            onClick={() => onChoose(id)}
            className={`flex items-center gap-4 border-0 rounded-md px-10 py-4 text-xs font-medium cursor-pointer ${
              moment === id
                ? 'bg-accent text-white'
                : 'bg-transparent text-text-muted hover:text-text'
            }`}
          >
            <span className="material-symbols-sharp text-sm" aria-hidden="true">
              {icon}
            </span>
            {momentLabel(id, id === 'decidir' ? waiting : 0)}
          </button>
        ))}
      </div>
      {reason && <span className="text-2xs text-text-muted">{reason}</span>}
      {chosen && (
        <button
          type="button"
          onClick={onAuto}
          className="border-0 bg-transparent p-0 text-2xs text-accent cursor-pointer hover:underline"
          title="Que la oficina elija el momento según la hora, tu calendario y lo que espera"
        >
          Automático
        </button>
      )}
      {moment !== 'decidir' && waiting > 0 && (
        <button
          type="button"
          onClick={() => onChoose('decidir')}
          className="border-0 bg-transparent p-0 text-2xs text-text-muted hover:text-text cursor-pointer"
        >
          {waiting === 1 ? '1 decisión espera' : `${waiting} decisiones esperan`} · ver
        </button>
      )}
    </div>
  );
}
