/**
 * First-run memory, per browser: was the welcome done, was the guided tour
 * seen. Storage can be blocked (a private window); then both simply show
 * again, which is harmless.
 */

const WELCOME_KEY = 'oficina.bienvenida';
const TOUR_KEY = 'oficina.recorrido';

function read(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'hecho';
  } catch {
    return false;
  }
}

function mark(key: string): void {
  try {
    localStorage.setItem(key, 'hecho');
  } catch {
    // Nothing to keep it in: it shows again next time.
  }
}

export const welcomeDone = (): boolean => read(WELCOME_KEY);
export const markWelcomeDone = (): void => mark(WELCOME_KEY);
export const tourDone = (): boolean => read(TOUR_KEY);
export const markTourDone = (): void => mark(TOUR_KEY);
