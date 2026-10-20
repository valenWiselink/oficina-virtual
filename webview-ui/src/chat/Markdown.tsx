import { type ReactNode, useContext, useState } from 'react';

import { TERMINAL_FONT_FAMILY } from '../constants.js';
import { writeClipboardText } from '../terminal/clipboard.js';
import { isRelativePath } from '../terminal/pathLinks.js';
import { transport } from '../transport/index.js';
import { type ListItem, type MdBlock, parseMarkdown } from './markdownBlocks.js';
import { PathAgentContext } from './pathAgent.js';

/**
 * An agent's answer, formatted: paragraphs, headings, quotes, nested lists,
 * code with a copy button, tables that scroll on their own and the "Te toca:"
 * line as a notice — built as React elements (never as HTML), so nothing in
 * an answer can inject markup into the office. Sizes are relative (em), so
 * the chat's own font size scales all of it.
 */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-[0.6em] min-w-0 leading-relaxed">
      {parseMarkdown(text).map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </div>
  );
}

function Block({ block }: { block: MdBlock }): ReactNode {
  switch (block.kind) {
    case 'para':
      return (
        <p className="m-0 break-words">
          {block.lines.map((l, i) => (
            <span key={i}>
              {i > 0 && <br />}
              {inline(l)}
            </span>
          ))}
        </p>
      );
    case 'heading':
      return (
        <p
          className={`m-0 mt-[0.3em] text-text font-semibold ${
            block.level === 1 ? 'text-[1.2em]' : block.level === 2 ? 'text-[1.08em]' : ''
          }`}
        >
          {inline(block.text)}
        </p>
      );
    case 'quote':
      return (
        <blockquote className="m-0 pl-[0.8em] border-0 border-l-3 border-solid border-border-strong text-text-2">
          {block.lines.map((l, i) => (
            <span key={i}>
              {i > 0 && <br />}
              {inline(l)}
            </span>
          ))}
        </blockquote>
      );
    case 'list':
      return <List block={block} depth={0} />;
    case 'code':
      return <CodeBlock lang={block.lang} text={block.text} />;
    case 'table':
      return <Table header={block.header} rows={block.rows} />;
    case 'yourTurn':
      return (
        <div className="rounded-lg border border-status-permission bg-status-permission-bg text-status-permission-text px-[0.7em] py-[0.45em]">
          <strong>Te toca:</strong> {inline(block.text)}
        </div>
      );
    case 'rule':
      return <hr className="m-0 border-0 border-t border-solid border-border" />;
  }
}

function List({ block, depth }: { block: Extract<MdBlock, { kind: 'list' }>; depth: number }) {
  const Tag = block.ordered ? 'ol' : 'ul';
  const marker = block.ordered ? 'list-decimal' : depth === 0 ? 'list-disc' : 'list-[circle]';
  return (
    <Tag
      start={block.ordered ? block.start : undefined}
      className={`m-0 pl-[1.4em] flex flex-col gap-[0.25em] ${marker}`}
    >
      {block.items.map((item, i) => (
        <Item key={i} item={item} depth={depth} />
      ))}
    </Tag>
  );
}

function Item({ item, depth }: { item: ListItem; depth: number }) {
  return (
    <li className="pl-[0.15em]">
      {inline(item.text)}
      {item.children.map((child, i) =>
        child.kind === 'list' ? (
          <div key={i} className="mt-[0.25em]">
            <List block={child} depth={depth + 1} />
          </div>
        ) : null,
      )}
    </li>
  );
}

function CodeBlock({ lang, text }: { lang: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void writeClipboardText(text).then((ok) => {
      if (!ok) return;
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="rounded-lg bg-bg-thumb min-w-0">
      <div className="flex items-center justify-between px-[0.7em] pt-[0.35em] text-[0.75em] text-text-muted">
        <span>{lang}</span>
        <button
          type="button"
          onClick={copy}
          className="bg-transparent border-0 p-0 cursor-pointer text-text-muted hover:text-text [font:inherit]"
        >
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <pre
        className="m-0 px-[0.7em] pb-[0.6em] pt-[0.2em] text-text text-[0.86em] overflow-x-auto"
        style={{ fontFamily: TERMINAL_FONT_FAMILY }}
      >
        {text}
      </pre>
    </div>
  );
}

function Table({ header, rows }: { header: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-solid border-border">
      <table className="w-full border-collapse text-[0.9em]">
        <thead>
          <tr className="bg-bg-thumb">
            {header.map((c, i) => (
              <th key={i} className="text-left font-semibold px-[0.6em] py-[0.35em] align-top">
                {inline(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, r) => (
            <tr key={r} className="border-0 border-t border-solid border-border">
              {cells.map((c, i) => (
                <td key={i} className="px-[0.6em] py-[0.35em] align-top">
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
          className="px-[0.25em] rounded-sm bg-bg-thumb text-[0.9em]"
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
