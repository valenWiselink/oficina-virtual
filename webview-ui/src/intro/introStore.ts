/**
 * Whether the first-run presentation (IntroShow) was already seen in this
 * browser, and the `?intro=1` preview switch that shows it again on demand.
 */
const KEY = 'oficina.presentacion';

export function introSeen(): boolean {
  try {
    return localStorage.getItem(KEY) === 'vista';
  } catch {
    // Blocked storage: do not replay it on every load.
    return true;
  }
}

export function markIntroSeen(): void {
  try {
    localStorage.setItem(KEY, 'vista');
  } catch {
    /* blocked storage: nothing to remember */
  }
}

/** `?intro=1` in the address: show the presentation even if it was seen. */
export function wantsIntroPreview(search: string = location.search): boolean {
  return new URLSearchParams(search).get('intro') === '1';
}
