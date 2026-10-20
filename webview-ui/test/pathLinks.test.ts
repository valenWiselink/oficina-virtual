import { describe, expect, it } from 'vitest';

import { findWindowsPaths } from '../src/terminal/pathLinks.js';

const texts = (line: string) => findWindowsPaths(line).map((m) => m.text);

describe('findWindowsPaths', () => {
  it('finds a folder in a sentence, without the comma after it', () => {
    const line = 'está en F:\\proyectos\\Wiselink\\videos\\ronda-pt-br\\, armada sobre';
    expect(texts(line)).toEqual(['F:\\proyectos\\Wiselink\\videos\\ronda-pt-br\\']);
    const [m] = findWindowsPaths(line);
    expect(line.slice(m.start, m.end)).toBe(m.text);
  });

  it('takes forward slashes, backticks and trailing dots', () => {
    expect(texts('Abrí `C:/Users/vos/notas.md`.')).toEqual(['C:/Users/vos/notas.md']);
    expect(texts('Guardado en D:\\out\\video.mp4.')).toEqual(['D:\\out\\video.mp4']);
  });

  it('finds several and ignores what only looks like one', () => {
    expect(texts('de C:\\a\\b a F:\\c\\d')).toEqual(['C:\\a\\b', 'F:\\c\\d']);
    expect(texts('https://x.com/C:/no y http:\\\\host')).toEqual([]);
    expect(texts('la hora 10:30 y el ratio 3:/')).toEqual([]);
  });
});
