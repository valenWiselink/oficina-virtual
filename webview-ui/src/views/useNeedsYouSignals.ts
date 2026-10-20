import { useEffect, useRef } from 'react';

import { useNow } from '../hooks/useNow.js';
import { notifyWindows } from '../permissions/windowsNotify.js';
import type { AgentView } from './agentViews.js';

const TITLE = 'Oficina';
const ICON_SIZE = 64;
/** A wait this long earns one system notice (only while the tab is hidden). */
const NOTIFY_AFTER_MS = 30_000;

/**
 * What the browser tab says about "Te necesita": "(3) Oficina" counting
 * everything there (permissions, questions and "te toca", not only
 * permissions), an amber dot on the tab icon, and one Windows notice per wait
 * that passes 30 s. Permissions already notify the moment they arrive, so the
 * notice here is for the rest, once each, without extra sound.
 */
export function useNeedsYouSignals(views: AgentView[]): void {
  // A supervised agent's needs come to you through its supervisor.
  const needing = views.filter((v) => v.kind === 'needs' && v.supervisedBy.length === 0);
  const count = needing.length;

  useEffect(() => {
    document.title = count > 0 ? `(${count}) ${TITLE}` : TITLE;
    setIconDot(count > 0);
  }, [count]);

  const notified = useRef(new Set<string>());
  const needingRef = useRef(needing);
  needingRef.current = needing;
  const now = useNow();
  useEffect(() => {
    for (const v of needingRef.current) {
      if (v.permission || v.waitingSince === undefined) continue;
      const key = `${v.id}:${v.yourTurnId ?? v.statusText}`;
      if (notified.current.has(key) || now - v.waitingSince < NOTIFY_AFTER_MS) continue;
      notified.current.add(key);
      notifyWindows(v.name, v.statusText, `oficina-espera-${v.id}`);
    }
  }, [now, count]);
}

let baseIcon: HTMLImageElement | null = null;

/** Redraw the tab icon with (or without) the amber dot. The page declares
 *  several (the SVG first, then a PNG per size) and the browser may show any
 *  of them, so all of them get the dotted one, drawn from the first. */
function setIconDot(on: boolean): void {
  const links = [...document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')];
  if (links.length === 0) return;
  for (const l of links) l.dataset.original ??= l.href;
  const original = links[0].dataset.original!;
  if (!on) {
    for (const l of links) l.href = l.dataset.original!;
    return;
  }
  const draw = (img: HTMLImageElement) => {
    const canvas = document.createElement('canvas');
    canvas.width = ICON_SIZE;
    canvas.height = ICON_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, ICON_SIZE, ICON_SIZE);
    const amber = getComputedStyle(document.documentElement)
      .getPropertyValue('--color-status-permission')
      .trim();
    ctx.beginPath();
    ctx.arc(ICON_SIZE - 14, 14, 13, 0, Math.PI * 2);
    ctx.fillStyle = amber;
    ctx.fill();
    const dotted = canvas.toDataURL('image/png');
    for (const l of links) l.href = dotted;
  };
  if (baseIcon?.complete) {
    draw(baseIcon);
    return;
  }
  baseIcon = new Image();
  baseIcon.onload = () => draw(baseIcon!);
  baseIcon.src = original;
}
