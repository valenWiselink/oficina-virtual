import { describe, expect, it } from 'vitest';

import { optionLabel, replyChoices } from '../src/replyChoices.js';

// Shapes taken from real answers (2026-10-10 to 21), shortened. Measured over
// 1343 of them: 23 offer options (21 real choices, 2 not), 35 only "Como
// recomendás" (33 real, 2 not); no list of steps or of changes made fired.

describe('replyChoices: options', () => {
  it('a list right after a question is a choice', () => {
    const reply = [
      'No toco nada hasta que me confirmes. ¿Cuál vale?',
      '1. **Solo el motor ve quiénes.** Hay que sumar una ruta interna.',
      '2. **Queda como está.** No hago nada.',
    ].join('\n');
    expect(replyChoices(reply)).toEqual({
      options: [
        { n: 1, label: 'Solo el motor ve quiénes' },
        { n: 2, label: 'Queda como está' },
      ],
      recommends: false,
    });
  });

  it('a choice asked after the list, with a recommendation', () => {
    const reply = [
      'Hay dos formas de correrlo:',
      '1. **Lo corrés vos** desde DataGrip. Es lo que recomiendo.',
      '2. **Lo corro yo con `mysqlsh`.** Necesito que me lo confirmes.',
      '',
      '¿Cuál preferís?',
    ].join('\n');
    expect(replyChoices(reply)).toMatchObject({
      options: [{ n: 1 }, { n: 2 }],
      recommends: true,
    });
  });

  it('options whose items carry their own paragraphs, chosen by the "te toca"', () => {
    const reply = [
      'Opciones para dejar un solo control:',
      '',
      '1. **Solo el dropdown (recomendada).** La línea viene elegida.',
      '   Se puede cambiar desde el chip.',
      '2. **El dropdown primero.** Debajo aparece el nombre.',
      '3. **Solo el nombre.** Lo más simple.',
      '',
      'Te toca: elegir 1, 2 o 3 para la línea',
    ].join('\n');
    const choices = replyChoices(reply, 'elegir 1, 2 o 3 para la línea');
    expect(choices?.options.map((o) => o.label)).toEqual([
      'Solo el dropdown (recomendada)',
      'El dropdown primero',
      'Solo el nombre',
    ]);
    expect(choices?.recommends).toBe(true);
  });

  it('"Mi recomendación es hacer ahora la 1" after two numbered paragraphs', () => {
    const reply = [
      'Hay dos cosas distintas, con costos muy distintos:',
      '**1. Una imagen en la lista** (barato):',
      '- No hay que tocar el motor.',
      '**2. Una imagen en el push** (más trabajo):',
      '- En iOS hace falta código nativo.',
      '',
      'Mi recomendación es hacer ahora la 1: se reconoce de un vistazo.',
      '¿Hago la 1?',
    ].join('\n');
    expect(replyChoices(reply)?.options).toHaveLength(2);
  });
});

describe('replyChoices: lists that are not a choice', () => {
  it.each([
    [
      'steps',
      'Para probarlo:\n1. Abrí Compass.\n2. Pegá estas líneas.\n3. Corré la verificación.\n\n¿Lo corro yo en dev?',
    ],
    [
      'changes made',
      'Arreglé dos cosas:\n1. **El buscador** ya no se corta.\n2. **La puerta** muestra ingresos.',
    ],
    [
      'a plan',
      'Este es el plan de la prueba:\n1. Creo dos empresas.\n2. Toco Enviar accesos.\n\nSi tenés una edición que prefieras, decime cuál.',
    ],
    [
      'a version summary',
      'Esta versión agrega:\n1. Alta manual de un cliente.\n2. Edición de datos.\n3. Correcciones.',
    ],
    [
      'something chosen inside an item',
      'Qué hace al hacer doble clic:\n1. Se fija si corre.\n2. Abrí y elegí la carpeta.',
    ],
    ['a list inside code', '```\n1. uno\n2. dos\n```\n¿Cuál preferís?'],
  ])('%s', (_name, reply) => {
    expect(replyChoices(reply)).toBeUndefined();
  });
});

describe('replyChoices: several questions at once', () => {
  it('a list of decisions gets only "Como recomendás"', () => {
    const reply = [
      '**Decisiones abiertas que necesito que definas** (con lo que implementé):',
      '1. **Cuándo está completo:** cubre las obligatorias.',
      '2. **Actividades:** el default es "alguna". ¿Lo dejamos así?',
      '3. **"No está" con el padrón congelado:** recomiendo arreglarlo.',
      '4. **PR de la app:** ¿va contra `main`?',
    ].join('\n');
    expect(replyChoices(reply)).toEqual({ options: [], recommends: true });
  });

  it('two lists of options at once: only the recommendation', () => {
    const reply = [
      '¿Qué QR baja el botón?',
      '1. La tarjeta',
      '2. El vCard',
      '¿Dónde va el botón?',
      '1. Arriba',
      '2. Abajo',
      'Yo iría por la 1 en las dos.',
    ].join('\n');
    expect(replyChoices(reply)).toEqual({ options: [], recommends: true });
  });

  it('several questions without a recommendation offer nothing', () => {
    const reply = 'Tres preguntas:\n1. ¿Mergeo ahora?\n2. ¿Uso X o Y?\n3. ¿Aviso a Gian?';
    expect(replyChoices(reply)).toBeUndefined();
  });
});

describe('replyChoices: a recommendation alone', () => {
  it('counts when the answer asks something', () => {
    expect(
      replyChoices(
        'Pregunta si crea él el evento.\n\nTe toca: decirle si lo crea (te recomiendo que sí)',
        'decirle si lo crea (te recomiendo que sí)',
      ),
    ).toEqual({ options: [], recommends: true });
    expect(replyChoices('Me inclino por privado. ¿Cuál preferís?')?.recommends).toBe(true);
  });

  it('not in an answer that asks nothing', () => {
    expect(
      replyChoices('Listo. Te recomiendo reiniciar la oficina cuando puedas.'),
    ).toBeUndefined();
  });
});

describe('optionLabel', () => {
  it('takes the bold title, else the first clause, and keeps it short', () => {
    expect(optionLabel('**Lo dejo vacío y lo marco como obsoleto**, a favor del dato.')).toBe(
      'Lo dejo vacío y lo marco como…',
    );
    expect(optionLabel('WISE-6365, QR y firma (es el que recomienda)')).toBe('WISE-6365');
    expect(optionLabel('Agrandar C: con espacio de F:')).toBe('Agrandar C');
    expect(optionLabel('Sólo el selector, sin migración.')).toBe('Sólo el selector');
  });
});
