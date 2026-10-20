import { describe, expect, it } from 'vitest';

import { describeToolInput } from '../src/permissions/describeToolInput.js';

describe('describeToolInput', () => {
  it('shows the exact shell command, untouched', () => {
    const command = 'Remove-Item -Recurse -Force "F:\\x y"\n  && echo   ok';
    const d = describeToolInput('PowerShell', { command, description: 'Borrar carpeta' });
    expect(d.sections[0]).toEqual({ label: 'Comando', text: command, code: true });
    expect(d.sections[1]).toEqual({ label: 'Para qué', text: 'Borrar carpeta', code: false });
  });

  it('shows file, old and new text for an Edit', () => {
    const d = describeToolInput('Edit', {
      file_path: 'F:\\a.ts',
      old_string: 'a',
      new_string: 'b',
      replace_all: true,
    });
    expect(d.sections.map((s) => [s.label, s.text])).toEqual([
      ['Archivo', 'F:\\a.ts'],
      ['Reemplaza', 'a'],
      ['Por', 'b'],
      ['Alcance', 'Todas las apariciones'],
    ]);
  });

  it('shows the whole content of a Write', () => {
    const content = 'x'.repeat(10_000);
    const d = describeToolInput('Write', { file_path: 'F:\\b.txt', content });
    expect(d.sections[1].text).toBe(content);
  });

  it('falls back to the full JSON for unknown and MCP tools', () => {
    const input = { sql: 'DELETE FROM t', db: 'prod' };
    const mcp = describeToolInput('mcp__mariadb_prod__mysql_query', input);
    expect(mcp.title).toBe('Quiere usar mysql_query (mariadb_prod)');
    expect(JSON.parse(mcp.sections[0].text)).toEqual(input);
    expect(JSON.parse(describeToolInput('Frobnicate', input).sections[0].text)).toEqual(input);
  });

  it('never shows an empty card for a known tool without its usual fields', () => {
    const d = describeToolInput('Bash', { cmd: 'rm -rf /' });
    expect(JSON.parse(d.sections[0].text)).toEqual({ cmd: 'rm -rf /' });
  });
});
