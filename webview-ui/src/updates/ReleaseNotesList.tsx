import type { ReleaseNote } from './desktopUpdates.js';
import { noteLines, releaseUrl } from './releaseNotesText.js';

/** Release notes as text, newest version first; each version gets its own
 *  heading when there are several (versions skipped since the last update). */
export function ReleaseNotesList({ notes, version }: { notes: ReleaseNote[]; version: string }) {
  const many = notes.length > 1;
  return (
    <div className="flex flex-col gap-6">
      {notes.length > 0 && (
        <div
          className="flex flex-col gap-6 overflow-auto pr-4 text-xs text-text"
          style={{ maxHeight: 200 }}
        >
          {notes.map((n) => (
            <div key={n.version} className="flex flex-col gap-2">
              {many && <span className="font-semibold text-text-muted">{n.version}</span>}
              {noteLines(n.note).map((line, i) => (
                <span key={i} className="leading-snug">
                  {line}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
      <a
        className="self-start text-2xs text-accent hover:underline"
        href={releaseUrl(version)}
        target="_blank"
        rel="noopener noreferrer"
      >
        {notes.length > 0 ? 'Ver la nota completa' : 'Mirá qué trae'}
      </a>
    </div>
  );
}
