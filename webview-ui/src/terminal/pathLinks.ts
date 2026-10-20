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
