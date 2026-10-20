/**
 * Windows paths in a terminal line ("F:\proyectos\…\", "C:/Users/…"), so a
 * click opens them in the Explorer (the server's openPath). A path ends at a
 * space or a quote; trailing punctuation from the sentence around it is not
 * part of it. Paths with spaces are cut at the first space — the folder up to
 * there still opens when it exists, and nothing opens when it does not.
 */
export interface PathMatch {
  /** First and one-past-last index in the line. */
  start: number;
  end: number;
  text: string;
}

const PATH = /(?<![\w:/\\])[A-Za-z]:[\\/][^\s"'`<>|*?]*/g;
const TRAILING = /[.,;:!)\]}»]+$/;

export function findWindowsPaths(line: string): PathMatch[] {
  const found: PathMatch[] = [];
  for (const m of line.matchAll(PATH)) {
    const text = m[0].replace(TRAILING, '');
    if (text.length < 4) continue;
    found.push({ start: m.index, end: m.index + text.length, text });
  }
  return found;
}

/** A path relative to the agent's folder ("migrations/x.sql", "src\a.ts"):
 *  at least one folder and a file extension, so plain words never match. */
const RELATIVE =
  /(?<![\w:/\\.@-])(?:\.[\\/])?(?:[\w.-]+[\\/])+[\w-][\w.-]*\.[A-Za-z0-9]{1,8}(?![\w/\\-])/g;

/** Relative file paths in a terminal line; the office looks them up in the
 *  agent's folder and its repos (the server's openPath). */
export function findRelativePaths(line: string): PathMatch[] {
  const found: PathMatch[] = [];
  for (const m of line.matchAll(RELATIVE)) {
    found.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
  }
  return found;
}

/** The whole text is one relative file path (a path in backticks). */
export function isRelativePath(text: string): boolean {
  const found = findRelativePaths(text);
  return found.length === 1 && found[0].start === 0 && found[0].end === text.length;
}
