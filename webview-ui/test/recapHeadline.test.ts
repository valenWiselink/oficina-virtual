import { describe, expect, it } from 'vitest';

import { recapHeadline } from '../src/history/recapHeadline.js';

describe('recapHeadline', () => {
  it('keeps what got done and cuts from what is missing or next', () => {
    expect(
      recapHeadline(
        'La carga de productos del catálogo desde un PDF con IA ya está en dev, con la clave de OpenAI funcionando en el deploy. Falta probarla en dev con un PDF chico, que cuesta unos centavos: la probás vos o me pedís que la corra yo.\n\nTe toca: probar "Desde un PDF" en dev o pedirme que lo corra yo (disable recaps in /config)',
      ),
    ).toBe(
      'La carga de productos del catálogo desde un PDF con IA ya está en dev, con la clave de OpenAI funcionando en el deploy.',
    );
    expect(
      recapHeadline(
        'Aplicamos los ajustes de diseño de WiseScan y la regla de buscadores blancos sobre fondo gris, y abrí el PR 109 contra main con todos los tests pasando. Te queda revisarlo, mergearlo y avisarme. (disable recaps in /config)',
      ),
    ).toBe(
      'Aplicamos los ajustes de diseño de WiseScan y la regla de buscadores blancos sobre fondo gris, y abrí el PR 109 contra main con todos los tests pasando.',
    );
    expect(
      recapHeadline(
        '"Mis datos" del panel del expositor (WISE-5879) ya está en dev, sin datos laborales, y lo revisé en pantalla. El ticket quedó en "En validación". Si querés, el próximo paso es pasarlo a producción cuando me lo pidas. (disable recaps in /config)',
      ),
    ).toBe(
      '"Mis datos" del panel del expositor (WISE-5879) ya está en dev, sin datos laborales, y lo revisé en pantalla. El ticket quedó en "En validación".',
    );
  });

  it('cuts a clause that asks inside a sentence', () => {
    expect(
      recapHeadline(
        'Estamos renombrando la app vieja de la App Store a "Wiselink CRM"; ya reenviaste la versión 1.1 a revisión. Lo próximo: cuando Apple la apruebe, ponerle "Wiselink" a la de Flutter.',
      ),
    ).toBe(
      'Estamos renombrando la app vieja de la App Store a "Wiselink CRM"; ya reenviaste la versión 1.1 a revisión.',
    );
    expect(recapHeadline('Armé el endpoint de cobro; falta el test de punta a punta.')).toBe(
      'Armé el endpoint de cobro.',
    );
  });

  it('cuts a plan for later', () => {
    expect(
      recapHeadline(
        'Estoy rediseñando la pantalla de revisión de "Desde un PDF" y ya está mergeada a develop. Cuando termine el deploy a dev, la pruebo y te paso una captura.',
      ),
    ).toBe(
      'Estoy rediseñando la pantalla de revisión de "Desde un PDF" y ya está mergeada a develop.',
    );
  });

  it('gives nothing when nothing happened yet or all of it asks', () => {
    expect(
      recapHeadline(
        'Todavía no arrancamos ninguna tarea: sólo nos saludamos. Contame en qué querés trabajar hoy y lo encaramos. (disable recaps in /config)',
      ),
    ).toBeUndefined();
    expect(recapHeadline('Falta que revises el PR #12.')).toBeUndefined();
  });
});
