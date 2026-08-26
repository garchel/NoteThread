// Build leve: minifica CSS/JS de public/ → dist/ sem dependências externas.
// Uso: npm run build  (dev continua servindo public/ normalmente)
// Estratégia conservadora: remove comentários/whitespace redundantes.
// NÃO renomeia identificadores (segurança p/ ES Modules).
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync, existsSync, rmSync } from 'fs';
import { join, dirname } from 'path';

const SRC = 'public';
const OUT = 'dist';

function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')          // comentários
    .replace(/\s+/g, ' ')                       // whitespace múltiplo
    .replace(/\s*([{}:;,>~])\s*/g, '$1')        // espaços em torno de pontuação
    .replace(/;}/g, '}')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function minifyJs(js) {
  let out = '';
  let inStr = null, inTpl = false, inLine = false, inBlock = false, inRegex = false, prev = '';
  for (let i = 0; i < js.length; i++) {
    const c = js[i], next = js[i + 1];
    if (inLine) { if (c === '\n') { inLine = false; out += c; } continue; }
    if (inBlock) { if (c === '*' && next === '/') { inBlock = false; i++; } continue; }
    if (inStr) {
      out += c;
      if (c === '\\') { out += next; i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (!inRegex && (c === '"' || c === "'")) { inStr = c; out += c; prev = c; continue; }
    if (c === '`') { inTpl = !inTpl; out += c; prev = c; continue; }
    if (!inTpl && c === '/' && next === '/') { inLine = true; i++; continue; }
    if (!inTpl && c === '/' && next === '*') { inBlock = true; i++; continue; }
    out += c; prev = c;
  }
  return out.replace(/\n{3,}/g, '\n\n');
}

function walk(dir, cb) {
  for (const f of readdirSync(dir)) {
    const full = join(dir, f);
    if (statSync(full).isDirectory()) walk(full, cb);
    else cb(full);
  }
}

if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(OUT, { recursive: true });

let origTotal = 0, minTotal = 0;
walk(SRC, (file) => {
  const rel = file.slice(SRC.length + 1);
  const dest = join(OUT, rel);
  mkdirSync(dirname(dest), { recursive: true });
  const ext = file.split('.').pop();
  if (ext === 'css' || ext === 'js') {
    const src = readFileSync(file, 'utf8');
    const min = ext === 'css' ? minifyCss(src) : minifyJs(src);
    origTotal += src.length; minTotal += min.length;
    writeFileSync(dest, min);
  } else {
    copyFileSync(file, dest);
    origTotal += statSync(file).size; minTotal += statSync(file).size;
  }
});

const saved = Math.round((1 - minTotal / origTotal) * 100);
console.log(`✓ build em dist/ — ${Math.round(origTotal / 1024)}KB → ${Math.round(minTotal / 1024)}KB (${saved}% menor)`);
