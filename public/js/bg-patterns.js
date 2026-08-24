// Gerador de padrões de fundo — glifo escala DENTRO do tile fixo (320px).
// O slider muda só o tamanho do ícone; o espaçamento permanece constante.
export const PATTERN_TILE = 320;

// Desenho de cada glifo em coordenadas de tile 320x320 (posição fixa, sem sobreposição)
const GLYPHS = {
  stars: [
    { d: 'M46 46l4.2 8.5 9.4 1.1-6.9 6.7 1.7 9.3-8.4-4.5-8.4 4.5 1.7-9.3-6.9-6.7 9.4-1.1z', stroke: '#c9a86a', sw: 2.4, fill: false },
    { star: true, cx: 216, cy: 204, r: 7.5, fill: '#c9a86a' },
  ],
  hearts: [
    { heart: true, cx: 67, cy: 62, r: 15, stroke: '#d98a8a', sw: 2.4, fill: false, rot: -10 },
    { heart: true, cx: 236, cy: 222, r: 9, fill: '#d98a8a', rot: 12 },
  ],
  clouds: [
    { cloud: true, x: 34, y: 36, s: 1.0, stroke: '#a9bfcf', sw: 2.4, fill: false },
    { cloud: true, x: 208, y: 188, s: 0.65, fill: '#a9bfcf', opacity: .45 },
  ],
  leaves: [
    { leaf: true, cx: 54, cy: 52, r: 17, stroke: '#8fb89a', sw: 2.2, fill: false, rot: 28 },
    { leaf: true, cx: 229, cy: 210, r: 11, fill: '#8fb89a', rot: -30 },
  ],
  circles: [
    { circle: true, cx: 50, cy: 44, r: 12.5, stroke: '#d9cdb8', sw: 2.4, fill: false },
    { circle: true, cx: 200, cy: 176, r: 6.5, stroke: '#d9cdb8', sw: 2.2, fill: false },
    { circle: true, cx: 263, cy: 63, r: 4.5, fill: '#d9cdb8' },
  ],
};

function starPath(cx, cy, r) {
  let pts = [];
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.42;
    pts.push(`${(cx + rad * Math.cos(ang)).toFixed(1)} ${(cy + rad * Math.sin(ang)).toFixed(1)}`);
  }
  return 'M' + pts.join('L') + 'Z';
}

// Seeded random para jitter determinístico (evita padrão em grade)
function seededRandom(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  h = (h ^ 0x9e3779b9) >>> 0;
  return () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 4294967296;
  };
}

function glyphInner(g, scale, jitterX, jitterY) {
  // desenha o glifo escalado em torno do seu próprio centro, com jitter de posição
  let inner = '';
  const jx = jitterX, jy = jitterY;
  if (g.star) {
    const cx = g.cx + jx, cy = g.cy + jy;
    inner = `<path d="${starPath(cx, cy, g.r * scale)}" fill="${g.fill || 'none'}"${g.stroke ? ` stroke="${g.stroke}" stroke-width="${(g.sw || 2) * scale}"` : ''} stroke-linejoin="round"/>`;
  } else if (g.heart) {
    const cx = g.cx + jx, cy = g.cy + jy;
    const r = g.r * scale;
    const d = `M${cx} ${cy + r * 0.95} C${cx - r * 1.3} ${cy}, ${cx - r} ${cy - r * 0.75}, ${cx - r * 0.35} ${cy - r * 0.78} C${cx - r * 0.08} ${cy - r * 0.8}, ${cx} ${cy - r * 0.55}, ${cx} ${cy - r * 0.35} C${cx} ${cy - r * 0.55}, ${cx + r * 0.08} ${cy - r * 0.8}, ${cx + r * 0.35} ${cy - r * 0.78} C${cx + r} ${cy - r * 0.75}, ${cx + r * 1.3} ${cy}, ${cx} ${cy + r * 0.95} Z`;
    inner = `<path d="${d}" transform="rotate(${g.rot || 0} ${cx} ${cy})" fill="${g.fill || 'none'}"${g.stroke ? ` stroke="${g.stroke}" stroke-width="${(g.sw || 2) * scale}"` : ''} stroke-linejoin="round"/>`;
  } else if (g.cloud) {
    const cx = g.x + jx, cy = g.y + jy;
    inner = `<g transform="translate(${cx} ${cy}) scale(${scale})"><path d="M8 26 a7.2 7.2 0 0 1 2.7-13.8 A10.8 10.8 0 0 1 32.5 18 a6.3 6.3 0 0 1 .9 11.1 z" fill="${g.fill || 'none'}"${g.stroke ? ` stroke="${g.stroke}" stroke-width="${g.sw}"` : ''}${g.opacity ? ` opacity="${g.opacity}"` : ''} stroke-linecap="round"/></g>`;
  } else if (g.leaf) {
    const r = g.r * scale;
    const cx = g.cx + jx, cy = g.cy + jy;
    const d = `M${cx} ${cy - r} C${cx + r * 1.0} ${cy - r * 0.55}, ${cx + r * 1.05} ${cy + r * 0.45}, ${cx} ${cy + r} C${cx - r * 1.05} ${cy + r * 0.45}, ${cx - r} ${cy - r * 0.55}, ${cx} ${cy - r} Z`;
    inner = `<g transform="rotate(${g.rot || 0} ${cx} ${cy})">` +
      `<path d="${d}" fill="${g.fill || 'none'}"${g.stroke ? ` stroke="${g.stroke}" stroke-width="${(g.sw || 2) * scale}"` : ''} stroke-linejoin="round"/>` +
      (g.fill ? '' : `<line x1="${cx}" y1="${cy - r * 0.72}" x2="${cx}" y2="${cy + r * 0.82}" stroke="${g.stroke}" stroke-width="${(g.sw || 2) * 0.8 * scale}" stroke-linecap="round"/><line x1="${cx}" y1="${cy + r * 1.02}" x2="${cx}" y2="${cy + r * 1.42}" stroke="${g.stroke}" stroke-width="${(g.sw || 2) * 0.8 * scale}" stroke-linecap="round"/>`) +
      `</g>`;
  } else if (g.circle) {
    const cx = g.cx + jx, cy = g.cy + jy;
    inner = `<circle cx="${cx}" cy="${cy}" r="${g.r * scale}" fill="${g.fill || 'none'}"${g.stroke ? ` stroke="${g.stroke}" stroke-width="${(g.sw || 2) * scale}"` : ''}/>`;
  } else {
    const cx = (g.cx || 0) + jx, cy = (g.cy || 0) + jy;
    inner = `<g transform="translate(${cx} ${cy}) scale(${scale}) translate(${-(g.cx || 0)} ${-(g.cy || 0)})"><path d="${g.d}" fill="${g.fill || 'none'}"${g.stroke ? ` stroke="${g.stroke}" stroke-width="${(g.sw || 2) * scale}"` : ''} stroke-linejoin="round"/></g>`;
  }
  return inner;
}

export function buildPattern(name, scale) {
  const glyphs = GLYPHS[name];
  if (!glyphs) return '';
  const rng = seededRandom(name);
  const parts = glyphs.map((g, i) => {
    // jitter determinístico de ±10px para quebrar a grade
    const jx = (rng() - 0.5) * 20;
    const jy = (rng() - 0.5) * 20;
    return glyphInner(g, scale, jx, jy);
  }).join('');
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${PATTERN_TILE}' height='${PATTERN_TILE}'>${parts}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27')}")`;
}
