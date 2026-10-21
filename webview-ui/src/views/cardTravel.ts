import { type RefObject, useEffect, useLayoutEffect, useRef } from 'react';

/**
 * Cards travel instead of teleporting (FLIP: measure where each card was,
 * let the board lay itself out, then slide each moved card from its old
 * place to the new one with element.animate). A card that changes column
 * glides there, and the ones around it close the gap or make room. No
 * bounce, no sound, and it can be clicked on the way. Nothing travels on
 * the first look, when more than MAX_MOVES things change at once (a
 * reconnect), on a workspace switch, in calm mode or with reduced motion.
 */

/** How long a card takes to get where it goes. */
export const TRAVEL_MS = 250;
/** Decelerates gently and never overshoots. */
const TRAVEL_EASING = 'cubic-bezier(0.2, 0, 0, 1)';
/** More cards than this arriving, leaving or changing column at once is not
 *  a move to follow with the eye: they all just appear in place. */
export const MAX_MOVES = 4;
/** The hop on arrival and the cheer wait for the travel (index.css reads
 *  --card-travel); after this long nothing is left waiting on it. */
const ARRIVAL_CLEAR_MS = 2_500;

/** Where a card sits on the board (px, within the grid; transforms ignored). */
export interface Placed {
  column: string;
  x: number;
  y: number;
}

/** A card to slide: it starts `dx`, `dy` away from its new place. */
export interface Travel {
  id: number;
  dx: number;
  dy: number;
  /** It changed column (it rides over the others, and its arrival waits). */
  crossing: boolean;
}

/** Which cards travel, from where each one was to where it is now. */
export function planTravel(
  before: ReadonlyMap<number, Placed>,
  after: ReadonlyMap<number, Placed>,
): Travel[] {
  if (before.size === 0) return [];
  let moves = 0;
  for (const [id, now] of after) if (before.get(id)?.column !== now.column) moves++;
  for (const id of before.keys()) if (!after.has(id)) moves++;
  if (moves > MAX_MOVES) return [];
  const travels: Travel[] = [];
  for (const [id, now] of after) {
    const was = before.get(id);
    if (!was) continue;
    const dx = was.x - now.x;
    const dy = was.y - now.y;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    travels.push({ id, dx, dy, crossing: was.column !== now.column });
  }
  return travels;
}

/** Position of `el` within `root`, summed up the offsetParent chain:
 *  layout only, so a card mid-flight measures where it will land. */
function offsetWithin(el: HTMLElement, root: HTMLElement): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== root) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

function cardsIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-card-id]'));
}

function measure(root: HTMLElement): Map<number, Placed> {
  const placed = new Map<number, Placed>();
  for (const el of cardsIn(root)) {
    placed.set(Number(el.dataset.cardId), {
      column: el.dataset.cardColumn ?? '',
      ...offsetWithin(el, root),
    });
  }
  return placed;
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** How far a card mid-flight still is from its place (its animated translate). */
function flightOffset(el: HTMLElement): { x: number; y: number } {
  const t = getComputedStyle(el).transform;
  if (!t || t === 'none') return { x: 0, y: 0 };
  const m = new DOMMatrixReadOnly(t);
  return { x: m.m41, y: m.m42 };
}

/** A card still flying when the board changes again starts from where it is
 *  on screen, not from where it was heading. */
function fromWhereTheyAre(
  before: Map<number, Placed>,
  after: Map<number, Placed>,
  flights: Map<number, Animation>,
): Map<number, Placed> {
  const from = new Map(before);
  for (const [id, anim] of flights) {
    const was = before.get(id);
    const now = after.get(id);
    const el = anim.effect instanceof KeyframeEffect ? anim.effect.target : null;
    if (!was || !now || !(el instanceof HTMLElement) || !el.isConnected) continue;
    if (was.x === now.x && was.y === now.y) continue;
    const off = flightOffset(el);
    from.set(id, { ...was, x: was.x + off.x, y: was.y + off.y });
  }
  return from;
}

const arrivalTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

/** Lets the card's hop and cheer wait until it lands (index.css). */
function delayArrival(el: HTMLElement): void {
  el.style.setProperty('--card-travel', `${TRAVEL_MS}ms`);
  clearTimeout(arrivalTimers.get(el));
  arrivalTimers.set(
    el,
    setTimeout(() => el.style.removeProperty('--card-travel'), ARRIVAL_CLEAR_MS),
  );
}

function fly(el: HTMLElement, travel: Travel, flights: Map<number, Animation>): void {
  if (typeof el.animate !== 'function') return;
  flights.get(travel.id)?.cancel();
  if (travel.crossing) delayArrival(el);
  el.style.zIndex = travel.crossing ? '2' : '1';
  const anim = el.animate(
    [{ transform: `translate(${travel.dx}px, ${travel.dy}px)` }, { transform: 'none' }],
    { duration: TRAVEL_MS, easing: TRAVEL_EASING },
  );
  flights.set(travel.id, anim);
  const land = () => {
    if (flights.get(travel.id) !== anim) return;
    flights.delete(travel.id);
    el.style.zIndex = '';
  };
  anim.addEventListener('finish', land);
  anim.addEventListener('cancel', land);
}

/**
 * Slides the board's cards (elements marked `data-card-id` and
 * `data-card-column` inside `grid`) whenever `layout` — which card is in
 * which column, in order — changes. `scene` is what is on the board (the
 * workspace): a new one just appears. `still`: calm mode.
 */
export function useCardTravel(
  grid: RefObject<HTMLElement | null>,
  layout: string,
  scene: string,
  still: boolean,
): void {
  const placed = useRef(new Map<number, Placed>());
  const last = useRef<{ layout: string; scene: string } | null>(null);
  const flights = useRef(new Map<number, Animation>());

  // Every render: where the cards were is where the next change starts from.
  useLayoutEffect(() => {
    const root = grid.current;
    if (!root) return;
    const before = placed.current;
    const after = measure(root);
    placed.current = after;
    const prev = last.current;
    last.current = { layout, scene };
    if (!prev || prev.layout === layout || prev.scene !== scene) return;
    if (still || prefersReducedMotion()) return;
    const from = fromWhereTheyAre(before, after, flights.current);
    const byId = new Map(cardsIn(root).map((el) => [Number(el.dataset.cardId), el]));
    for (const travel of planTravel(from, after)) {
      const el = byId.get(travel.id);
      if (el) fly(el, travel, flights.current);
    }
  });

  // A resize (the window, the terminal panel) moves cards without a render.
  useEffect(() => {
    const root = grid.current;
    if (!root || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      placed.current = measure(root);
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, [grid]);
}
