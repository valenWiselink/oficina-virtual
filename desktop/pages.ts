import { CLAWD, CLAWD_EYE, INK, INK_DARK, PAPER, PAPER_DARK } from './colors.js';

/**
 * The two pages the app shows before the office answers: Clawd walking while
 * it starts, and a plain message if it could not. Inline (data: URLs) — the
 * office's own pages come from its server, which is not up yet.
 */

const CLAWD_SVG = `<svg viewBox="-1 -1 18 16" width="64" height="56" aria-hidden="true">
<g class="legs-a"><rect x="2" y="9" width="1.2" height="4.3" rx="0.6"/><rect x="10.8" y="9" width="1.2" height="4.3" rx="0.6"/></g>
<g class="legs-b"><rect x="4" y="9" width="1.2" height="4.3" rx="0.6"/><rect x="12.8" y="9" width="1.2" height="4.3" rx="0.6"/></g>
<g class="body"><rect x="0" y="3.6" width="2" height="2.6" rx="0.8"/><rect x="14" y="3.6" width="2" height="2.6" rx="0.8"/>
<rect x="1" y="0" width="14" height="10.4" rx="2"/><rect class="eye" x="4" y="2.2" width="1.3" height="2.6" rx="0.65"/>
<rect class="eye" x="10.7" y="2.2" width="1.3" height="2.6" rx="0.65"/></g></svg>`;

const STYLE = `
:root{color-scheme:light dark}
body{margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;
font-family:"Segoe UI",system-ui,sans-serif;background:${PAPER};color:${INK}}
@media (prefers-color-scheme:dark){body{background:${PAPER_DARK};color:${INK_DARK}}}
p{margin:0;font-size:14px;opacity:.75;max-width:420px;text-align:center;line-height:1.5}
.track{width:180px;display:flex}
svg{fill:${CLAWD};animation:walk 3.2s ease-in-out infinite}
.eye{fill:${CLAWD_EYE}}.body{animation:bob .4s ease-in-out infinite}
.legs-a{animation:step .4s ease-in-out infinite}.legs-b{animation:step .4s ease-in-out infinite reverse}
@keyframes walk{0%{transform:translateX(0)}45%{transform:translateX(116px)}50%{transform:translateX(116px) scaleX(-1)}95%{transform:translateX(0) scaleX(-1)}100%{transform:translateX(0)}}
@keyframes bob{50%{transform:translateY(-.6px)}}@keyframes step{50%{transform:translateY(-1.2px)}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}`;

const page = (body: string) =>
  'data:text/html;charset=utf-8,' +
  encodeURIComponent(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Oficina</title><style>${STYLE}</style></head><body>${body}</body></html>`,
  );

export const startingPage = () =>
  page(`<div class="track">${CLAWD_SVG}</div><p>Abriendo la oficina…</p>`);

const escape = (s: string) =>
  s.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string,
  );

export const errorPage = (message: string, logDir: string) =>
  page(
    `<div class="track">${CLAWD_SVG}</div><p><b>La oficina no pudo arrancar.</b><br>${escape(message)}</p>` +
      `<p>El detalle quedó en ${escape(logDir)}</p>`,
  );
