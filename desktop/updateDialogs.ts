import { dialog } from 'electron';

/**
 * Native fallbacks for a page that cannot show updates itself: the app can
 * attach to an office started elsewhere (OFICINA_PORT, the browser launcher)
 * whose page predates the in-office notice. Without these, that page would
 * never hear of a new version. The wording matches the notice: closing the
 * window only hides it, so nothing here talks about "closing".
 */

/** "Hay una versión nueva": true when the person chose to install now. */
export async function askToInstall(version: string): Promise<boolean> {
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: 'Oficina virtual',
    message: `Hay una versión nueva (${version}).`,
    detail:
      'Al instalarla, la oficina se cierra y vuelve sola. Si no, se instala sola la próxima vez que apagues la oficina.',
    buttons: ['Instalar ahora', 'Más tarde'],
    defaultId: 0,
    cancelId: 1,
  });
  return response === 0;
}

/** The answer to "Buscar actualizaciones" when nothing new was found. */
export async function answerCheck(outcome: 'none' | 'error', current: string): Promise<void> {
  await dialog.showMessageBox(
    outcome === 'none'
      ? { type: 'info', title: 'Oficina virtual', message: `Tenés la última versión (${current}).` }
      : {
          type: 'warning',
          title: 'Oficina virtual',
          message: 'No pude buscar actualizaciones ahora. Probá más tarde.',
        },
  );
}
