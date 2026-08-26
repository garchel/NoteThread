import { esc } from './utils.js';

  // Renderiza markdown básico e SEGURO (escapa HTML primeiro, depois aplica).
  // Suporta: **negrito**, *itálico*, `código`, #tags (mantidas como chip),
  // listas (- ou * por linha), e quebras de linha. Não faz HTML cru passar.
  export const renderMarkdown = (raw, hideDone) => {
    if (!raw) return '';
    // 1) escapa tudo (sem risco de XSS)
    let s = esc(raw);
    // 2) código inline `...`  → <code> (antes do resto, para não confundir com *)
    s = s.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
    // 3) negrito **...** e __...__
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    // 4) itálico *...* e _..._
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');
    // 4.5) menções @[Nome](t:id) → chip clicável que abre a thread
    s = s.replace(/@\[([^\]]+)\]\(t:([a-z0-9]+)\)/gi,
      (_, name, tid) => `<button type="button" class="mention" data-tid="${tid}">@${name}</button>`);
    // 5) #tags NÃO são convertidas aqui — são renderizadas em bloco separado (.bubble-tags) no bubbleEl
    // 6) listas: linhas começando com - ou *
    // 7) checklist: linhas começando com [ ] ou [x]
    // 7.5) listas numeradas: linhas começando com "1. " etc.
    const lines = s.split('\n');
    let html = '', inList = false, inChk = false, inOl = false, chkIndex = 0;
    for (const line of lines) {
      const chk = line.match(/^\s*\[( |x)\]\s*(.*)$/i);
      if (chk) {
        if (inList) { html += '</ul>'; inList = false; }
        if (inOl) { html += '</ol>'; inOl = false; }
        if (!inChk) { html += '<div class="md-checklist">'; inChk = true; }
        const done = chk[1].toLowerCase() === 'x';
        const idx = chkIndex++;
        if (hideDone && done) continue; // oculto: mantém o índice p/ mapear o texto
        html += `<span class="md-check${done ? ' done' : ''}"><input type="checkbox" data-chk="${idx}" ${done ? 'checked' : ''}/><span>${chk[2]}</span></span>`;
        continue;
      }
      if (inChk) { html += '</div>'; inChk = false; }
      const om = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/);
      if (om) {
        if (inList) { html += '</ul>'; inList = false; }
        if (!inOl) { html += '<ol class="md-olist">'; inOl = true; }
        html += `<li><span class="md-ol-num">${om[2]}.</span> ${om[3]}</li>`;
        continue;
      }
      const m = line.match(/^(\s*)[-*]\s+(.*)$/);
      if (m) {
        if (inOl) { html += '</ol>'; inOl = false; }
        if (!inList) { html += '<ul class="md-list">'; inList = true; }
        html += `<li>${m[2]}</li>`;
      } else {
        if (inList) { html += '</ul>'; inList = false; }
        if (inOl) { html += '</ol>'; inOl = false; }
        html += line + '<br/>';
      }
    }
    if (inList) html += '</ul>';
    if (inChk) html += '</div>';
    if (inOl) html += '</ol>';
    // remove <br/> solitário no final
    html = html.replace(/<br\/>\s*$/, '');
    return html;
  };

