import { describe, expect, it } from 'vitest';

import { findRelativePaths, findWindowsPaths, isRelativePath } from '../src/terminal/pathLinks.js';

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

describe('findRelativePaths', () => {
  const rel = (line: string) => findRelativePaths(line).map((m) => m.text);

  it('finds the paths an agent names inside its repos', () => {
    expect(rel('correr migrations/20261020a_wise4628_metricas_expo_online.sql del repo')).toEqual([
      'migrations/20261020a_wise4628_metricas_expo_online.sql',
    ]);
    expect(rel('mirá src\\views\\graphDraw.ts y ./README.md.')).toEqual([
      'src\\views\\graphDraw.ts',
      './README.md',
    ]);
  });

  it('leaves words, URLs, absolute paths and versions alone', () => {
    expect(rel('la 1.0.12 está en https://github.com/a/b.ts y F:\\x\\y.sql')).toEqual([]);
    expect(rel('README.md y y/o sin extensión')).toEqual([]);
    expect(isRelativePath('migrations/a.sql')).toBe(true);
    expect(isRelativePath('npm run test')).toBe(false);
  });
});
