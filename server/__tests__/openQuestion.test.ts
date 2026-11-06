import { describe, expect, it } from 'vitest';

import { openQuestionOf } from '../src/pendingAsks/openQuestion.js';

/**
 * Real endings of Jarvis's turns (its transcripts, 2026-10-30 to 2026-11-06):
 * 17 of 1968 ends of turn wait on Valentín without a «Te toca:» line.
 */
describe('a question Jarvis leaves without «Te toca:»', () => {
  it.each([
    [
      'Excelente, señor, ya lo saqué de la lista.\n\n¿Ya puedo dejar que los agentes vuelvan a usar el navegador? Lo necesitan para las pruebas del pase de seguridad de esta noche.',
      '¿Ya puedo dejar que los agentes vuelvan a usar el navegador? Lo necesitan para las pruebas del pase de seguridad de esta noche.',
    ],
    [
      'Sigue pendiente lo del modo evento: ¿marco la edición de prueba como demo en producción para que el mapa lo muestre a usted solo?',
      'Sigue pendiente lo del modo evento: ¿marco la edición de prueba como demo en producción para que el mapa lo muestre a usted solo?',
    ],
    [
      'Ya está, señor.\n\nQueda pendiente Pablo: hoy está bloqueado. ¿Lo borramos también dentro de una semana, junto con los otros dos? Le recomiendo que sí.',
      '¿Lo borramos también dentro de una semana, junto con los otros dos? Le recomiendo que sí.',
    ],
    [
      'Le quedan a usted tres cosas. Lo de Andy es lo primero: ¿le aviso a Pase que sigamos así?',
      'Lo de Andy es lo primero: ¿le aviso a Pase que sigamos así?',
    ],
    [
      'Falta una confirmación suya: ¿borró la clave «wiselink»? Si la lista de contraseñas ya no la muestra, está hecho.',
      'Falta una confirmación suya: ¿borró la clave «wiselink»? Si la lista de contraseñas ya no la muestra, está hecho.',
    ],
    [
      'Todo está sumado al pase de esta noche, señor, y no hay choques. Lo único que frena las pruebas es el navegador: cuando salga de la reunión, avíseme y se lo habilito a los agentes.',
      'Lo único que frena las pruebas es el navegador: cuando salga de la reunión, avíseme y se lo habilito a los agentes.',
    ],
    [
      'Perfecto, señor. Avíseme cuando la 2.0 aparezca en TestFlight; si falla, páseme el log.',
      'Avíseme cuando la 2.0 aparezca en TestFlight;',
    ],
  ])('waits on him: %s', (reply, expected) => {
    expect(openQuestionOf(reply)).toBe(expected);
  });

  it.each([
    // With «Te toca:» it is in Pendientes already.
    '¿Lo mergeo?\n\nTe toca: decirme si mergeo el PR treinta; recomiendo que sí.',
    // Courtesy.
    'Sí, señor, lo escucho perfectamente. ¿En qué lo ayudo?',
    'Hola, señor, lo escucho. ¿En qué lo ayudo?',
    'Se le cortó la frase. ¿Me quería decir algo más sobre eso?',
    // A quoted question: a screen's title, a video's tagline.
    'La alineación ya quedó en develop. Le recomiendo esperar a que «portada» termine la pantalla nueva de «¿A qué venís?», y reinstalar todo junto.',
    '«Mapa» sigue puliendo el video, bajo la idea «Llenaste la feria. ¿Dónde estuvo la gente?».',
    // A message written for someone else.
    'Mándele esto:\n\n> Gian, ¿podés revisar en el teléfono de soporte si hay dispositivos vinculados?',
    // A question earlier on, then the turn goes on to something else.
    '¿Lo arranco ahora?\n\nYa lo arranqué: le aviso cuando termine.',
    // Just in case, or whenever he likes: nothing waits.
    'Está en cola. Si sigue en «queued» después de diez minutos, avíseme y lo pasamos al M2.',
    'Lo dejo apagado; cuando quiera probar, dígame y «app nueva» lo levanta.',
    'Avíseme cuando vuelva y retomamos.',
    // No question at all.
    'Listo, señor: el PR quedó mergeado y el pase salió bien.',
    '',
  ])('asks nothing: %s', (reply) => {
    expect(openQuestionOf(reply)).toBeUndefined();
  });

  it('a long one is cut', () => {
    const q = openQuestionOf(`¿${'a'.repeat(400)}?`);
    expect(q).toHaveLength(240);
    expect(q?.endsWith('…')).toBe(true);
  });

  it('code is not a question of its own', () => {
    expect(openQuestionOf('Corré esto:\n\n```\necho ¿ok?\n```')).toBeUndefined();
  });
});
