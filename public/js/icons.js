  // ---------- Ícones SVG customizados ----------
  const SVG = (p, fill) => `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="${fill || 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  export const ICON = {
    plus: SVG('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
    folder: SVG('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
    bubble: SVG('<path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 9 9 0 0 1-4-1L3 20l1.5-5.5a8.5 8.5 0 1 1 16.5-3z"/>'),
    chevron: SVG('<polyline points="6 9 12 15 18 9"/>'),
    star: SVG('<polygon points="12 2 15 9 22 9.3 17 14 18.5 21 12 17 5.5 21 7 14 2 9.3 9 9"/>'),
    pin: '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor" stroke="none"><path d="M12 2 C9.5 2 8 4 8 6.5 c0 1.6 .7 2.7 1.6 3.6 L6 17.5 a1 1 0 0 0 .9 1.5 h10.2 a1 1 0 0 0 .9-1.5 L14.4 10.1 c.9-.9 1.6-2 1.6-3.6 C16 4 14.5 2 12 2 z"/></svg>',
    pencil: SVG('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
    trash: SVG('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>'),
    arrowDownRight: SVG('<line x1="7" y1="7" x2="17" y2="17"/><polyline points="17 7 17 17 7 17"/>'),
    pinOff: SVG('<path d="M9 4h6l-1 7 4 3v2H6l4-3-1-7z"/><line x1="12" y1="16" x2="12" y2="21"/><line x1="3" y1="3" x2="21" y2="21"/>'),
    move: SVG('<polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/>'),
    logout: SVG('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>'),
  };
  export const wrapSvg = (svg, size) => `<span class="svg-ic" style="width:${size || 16}px;height:${size || 16}px;display:inline-block">${svg}</span>`;
