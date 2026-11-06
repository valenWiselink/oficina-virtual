import { useState } from 'react';

import type { ArtifactEntry } from '../../../core/src/messages.js';
import { Button } from '../components/ui/Button.js';
import { useNow } from '../hooks/useNow.js';
import { useArtifacts } from './artifactsStore.js';
import { artifactAuthor, artifactWhen, filterArtifacts } from './artifactsView.js';

/** claude.ai's own list of them, with what this PC's agents did not publish. */
const GALLERY_URL = 'https://claude.ai/code/artifacts';
/** With fewer there is nothing to search for. */
const SEARCH_FROM = 8;

function ArtifactRow({ artifact, now }: { artifact: ArtifactEntry; now: number }) {
  const author = artifactAuthor(artifact);
  return (
    <li>
      <a
        href={artifact.url}
        target="_blank"
        rel="noopener noreferrer"
        title={`Abrir «${artifact.title}» en el navegador`}
        className="flex items-start gap-8 px-6 py-6 rounded-md no-underline hover:bg-bg-thumb focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span className="flex flex-col gap-1 min-w-0 flex-1">
          <span className="text-xs font-semibold text-text line-clamp-2">{artifact.title}</span>
          <span className="text-2xs text-text-muted truncate">
            {author} · {artifactWhen(artifact.at, now)}
          </span>
        </span>
        <span
          className="material-symbols-sharp text-sm text-text-muted shrink-0"
          aria-hidden="true"
        >
          open_in_new
        </span>
      </a>
    </li>
  );
}

/**
 * The artifacts your agents published, newest first; a click opens one in the
 * browser, where claude.ai asks for your session as ever: the panel shares
 * nothing. In the same spot as Historial: they open on purpose, one at a time.
 */
export function ArtifactsPanel({ onClose }: { onClose: () => void }) {
  const list = useArtifacts();
  const now = useNow();
  const [query, setQuery] = useState('');

  const artifacts = list?.artifacts ?? [];
  const shown = filterArtifacts(artifacts, query);
  return (
    <aside
      className="flex-1 min-w-0 min-h-0 soft-panel flex flex-col overflow-hidden"
      aria-label="Artifacts de tus agentes"
    >
      <header className="flex items-center gap-6 px-12 pt-10 pb-6">
        <span className="material-symbols-sharp text-base text-accent" aria-hidden="true">
          auto_awesome_mosaic
        </span>
        <h2 className="m-0 flex-1 text-sm font-semibold text-text">Artifacts</h2>
        <Button variant="ghost" size="icon" onClick={onClose} title="Cerrar" aria-label="Cerrar">
          ×
        </Button>
      </header>
      {artifacts.length >= SEARCH_FROM && (
        <div className="px-12 pb-8">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por título o agente"
            aria-label="Buscar artifacts"
            className="w-full box-border rounded-md border border-border bg-bg px-8 py-5 text-xs text-text placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-accent"
          />
        </div>
      )}
      {list?.scanning && (
        <p className="m-0 px-12 pb-6 text-2xs text-text-muted" role="status">
          Buscando en las conversaciones de tus agentes…
        </p>
      )}
      {shown.length === 0 && !list?.scanning && (
        <p className="m-0 px-12 py-8 text-xs text-text-muted">
          {artifacts.length === 0
            ? 'Todavía ningún agente publicó un artifact.'
            : 'Ningún artifact coincide con esa búsqueda.'}
        </p>
      )}
      <ul className="m-0 p-0 list-none overflow-y-auto flex-1 min-h-0 px-6 pb-4">
        {shown.map((artifact) => (
          <ArtifactRow key={artifact.id} artifact={artifact} now={now} />
        ))}
      </ul>
      <footer className="px-12 py-6 border-t border-border">
        <a
          href={GALLERY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-2xs font-semibold text-accent-bright no-underline rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-accent"
        >
          Ver todos en claude.ai
        </a>
      </footer>
    </aside>
  );
}
