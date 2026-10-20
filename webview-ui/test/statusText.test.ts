import { describe, expect, it } from 'vitest';

import { statusText } from '../src/identity/statusText.js';

describe('statusText', () => {
  it.each([
    ['Reading handler.go', 'Leyendo handler.go'],
    ['Running: git status', 'Corriendo: git status'],
    ['Running subtask', 'Corriendo una subtarea'],
    ['Editing notebook', 'Editando un notebook'],
    ['Editing App.tsx', 'Editando App.tsx'],
    ['Subtask: Revisar seguridad', 'Subtarea: Revisar seguridad'],
    ['Using mcp__mariadb_prod__mysql_query', 'Usando mcp__mariadb_prod__mysql_query'],
    ['Needs approval', 'Necesita tu permiso'],
    ['Idle', 'Sin tarea'],
  ])('%s → %s', (english, spanish) => {
    expect(statusText(english)).toBe(spanish);
  });

  it('leaves anything else (an agent task phrase) untouched', () => {
    expect(statusText('Revisando el SP de pagos')).toBe('Revisando el SP de pagos');
  });
});
