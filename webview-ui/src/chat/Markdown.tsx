import { type ReactNode, useContext } from 'react';

import { TERMINAL_FONT_FAMILY } from '../constants.js';
import { isRelativePath } from '../terminal/pathLinks.js';
import { transport } from '../transport/index.js';
import { PathAgentContext } from './pathAgent.js';

/**
 * Just enough Markdown for an agent's answers — headings, lists, code blocks,
 * tables, inline code, bold, links — built as React elements (never as HTML),
 * so nothing in an answer can inject markup into the office.
 */
export function Markdown({ text }: { text: string }) {
  const parts = text.split(/^```[^\n]*\n?/m);
  return (
    <div className="flex flex-col gap-6 min-w-0">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <pre
            key={i}
            className="m-0 p-8 rounded-lg bg-bg-thumb text-text text-xs overflow-x-auto"
            style={{ fontFamily: TERMINAL_FONT_FAMILY }}
          >
            {part.replace(/\n$/, '')}
          </pre>
        ) : (
          <Blocks key={i} text={part} />
        ),
      )}
    </div>
  );
}

function Blocks({ text }: { text: string }) {
  // Edge newlines trimmed: the text right after a code fence starts with one.
  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.replace(/^\n+|\n+$/g, ''))
    .filter((b) => b.trim());
  return (
    <>
      {blocks.map((block, i) => (
        <Block key={i} lines={block.split('\n')} />
      ))}
    </>
  );
}

const LIST_ITEM = /^\s*(?:[-*•]|\d+[.)])\s+/;

function Block({ lines }: { lines: string[] }) {
  const first = lines[0];
  const heading = first.match(/^(#{1,4})\s+(.*)$/);
  if (heading && lines.length === 1) {
    return <p className="m-0 text-sm font-semibold text-text">{inline(heading[2])}</p>;
  }
  if (lines.every((l) => l.trim().startsWith('|'))) {
    return <Table lines={lines} />;
  }
  if (lines.every((l) => LIST_ITEM.test(l) || /^\s{2,}\S/.test(l))) {
    const ordered = /^\s*\d/.test(first);
    const items = lines.filter((l) => LIST_ITEM.test(l));
    const Tag = ordered ? 'ol' : 'ul';
    return (
      <Tag
        className={`m-0 pl-18 flex flex-col gap-2 text-sm ${ordered ? 'list-decimal' : 'list-disc'}`}
      >
        {items.map((l, i) => (
          <li key={i}>{inline(l.replace(LIST_ITEM, ''))}</li>
        ))}
      </Tag>
    );
  }
  return (
    <p className="m-0 text-sm whitespace-pre-wrap break-words">
      {lines.map((l, i) => (
        <span key={i}>
          {i > 0 && '\n'}
          {inline(l.replace(/^#{1,4}\s+/, ''))}
        </span>
      ))}
    </p>
  );
}

function Table({ lines }: { lines: string[] }) {
  const rows = lines
    .filter((l) => !/^\s*\|[\s:|-]+\|\s*$/.test(l))
    .map((l) =>
      l
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((c) => c.trim()),
    );
  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse">
        <tbody>
          {rows.map((cells, r) => (
            <tr key={r} className={r === 0 ? 'font-semibold' : ''}>
              {cells.map((c, i) => (
                <td key={i} className="border border-border px-6 py-2 align-top">
                  {inline(c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Code, bold, links and Windows drive paths (C:\…), which become clickable. */
const INLINE =
  /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\((?:https?:\/\/|[A-Za-z]:[\\/])[^)\s]+\)|https?:\/\/[^\s)>]+|(?<![\w:/\\])[A-Za-z]:[\\/][^\s"'`<>|*?]*[^\s"'`<>|*?.,;:!)\]}»])/g;

/** A whole Windows drive path (what a click can show in the Explorer). */
const WINDOWS_PATH = /^[A-Za-z]:[\\/][^"<>|*?]*$/;

/** A path the agent mentioned: a click opens it (documents) or shows it in
 *  the Explorer — the server decides, never running anything. */
function PathLink({ path, children }: { path: string; children: ReactNode }) {
  const id = useContext(PathAgentContext);
  return (
    <button
      type="button"
      onClick={() => transport.send({ type: 'openPath', path, id })}
      title="Abrir en tu PC"
      className="inline p-0 border-0 bg-transparent text-accent-bright underline break-all cursor-pointer text-left [font:inherit]"
    >
      {children}
    </button>
  );
}

/** Inline code, bold and links inside a line of text. */
function inline(text: string): ReactNode[] {
  return text.split(INLINE).map((piece, i) => {
    if (i % 2 === 0) return piece;
    if (piece.startsWith('`')) {
      const body = piece.slice(1, -1);
      const code = (
        <code
          key={i}
          className="px-3 rounded-sm bg-bg-thumb text-[0.92em]"
          style={{ fontFamily: TERMINAL_FONT_FAMILY }}
        >
          {body}
        </code>
      );
      if (!WINDOWS_PATH.test(body.trim()) && !isRelativePath(body.trim())) return code;
      return (
        <PathLink key={i} path={body.trim()}>
          {code}
        </PathLink>
      );
    }
    if (piece.startsWith('**')) return <strong key={i}>{piece.slice(2, -2)}</strong>;
    const link = piece.match(/^\[([^\]]+)\]\((.+)\)$/);
    const href = link ? link[2] : piece;
    if (WINDOWS_PATH.test(href)) {
      return (
        <PathLink key={i} path={href}>
          {link ? link[1] : piece}
        </PathLink>
      );
    }
    return (
      <a
        key={i}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent-bright underline break-all"
      >
        {link ? link[1] : piece}
      </a>
    );
  });
}
