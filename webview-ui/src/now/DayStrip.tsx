import { hourText } from './nowTime.js';
import type { StripItem } from './stripRules.js';

const KIND_ICON: Record<StripItem['kind'], string> = {
  meeting: 'event',
  start: 'schedule',
  due: 'timer',
};

function Item({ item }: { item: StripItem }) {
  const tone = item.hot
    ? 'border-status-permission bg-status-permission-bg text-status-permission-text'
    : 'border-border bg-bg-thumb text-text';
  const body = (
    <>
      <span className="material-symbols-sharp text-sm" aria-hidden="true">
        {KIND_ICON[item.kind]}
      </span>
      <span className="font-mono text-2xs font-semibold whitespace-nowrap">{item.when}</span>
      <span className="text-xs truncate max-w-[260px]">{item.label}</span>
      {item.soon && <span className="text-2xs whitespace-nowrap opacity-80">· {item.soon}</span>}
    </>
  );
  const cls = `shrink-0 flex items-center gap-5 rounded-md border px-8 py-4 ${tone}`;
  return (
    <li>
      {item.joinUrl ? (
        <a
          href={item.joinUrl}
          target="_blank"
          rel="noreferrer"
          className={`${cls} no-underline hover:border-accent`}
          title={`Unirse: ${item.label}`}
        >
          {body}
        </a>
      ) : (
        <span className={cls} title={item.label}>
          {body}
        </span>
      )}
    </li>
  );
}

/**
 * The rest of today in one line, above «Ahora»: the meetings still ahead and
 * the pending asks with a time (the pase «a las 23», «antes de las 15»).
 * Amber within the hour. Nothing left today: it says so in one line.
 */
export function DayStrip({ items, now }: { items: StripItem[]; now: number }) {
  return (
    <section
      aria-label="Hoy"
      className="shrink-0 soft-panel flex items-center gap-10 px-10 py-6 min-w-0"
    >
      <span className="shrink-0 flex items-baseline gap-5">
        <span className="text-xs font-semibold text-text">Hoy</span>
        <span className="font-mono text-2xs text-text-muted">{hourText(now)}</span>
      </span>
      {items.length === 0 ? (
        <span className="text-xs text-text-muted">Nada más con hora por hoy.</span>
      ) : (
        <ul className="m-0 p-0 list-none flex items-center gap-6 overflow-x-auto min-w-0">
          {items.map((item) => (
            <Item key={item.key} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}
