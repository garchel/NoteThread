// Friendly Names — toggle para mostrar nomes de componentes no hover (estilo devtools)
(() => {
  const STORAGE_KEY = 'notethread.friendly';
  let active = localStorage.getItem(STORAGE_KEY) === '1';
  const btn = document.getElementById('friendly-toggle');
  const tooltip = document.getElementById('friendly-tooltip');
  let currentEl = null;

  const updateBtn = () => {
    if (!btn) return;
    btn.classList.toggle('active', active);
    btn.classList.toggle('inactive', !active);
    btn.style.background = active ? '#22c55e' : '#ef4444';
    btn.style.color = '#fff';
    btn.title = active ? 'Desativar Friendly Names' : 'Ativar Friendly Names';
    localStorage.setItem(STORAGE_KEY, active ? '1' : '0');
  };

  const showTooltip = (el) => {
    const name = el.getAttribute('data-friendly-name');
    if (!name || !tooltip) return;
    // mostra nome + id/classe para referência precisa (estilo devtools)
    const id = el.id ? `#${el.id}` : '';
    const cls = el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/).filter(c=>c && c!=='hidden').slice(0,2).join('.') : '';
    const extra = id || cls ? ` <span style="opacity:.6;font-weight:400">${id}${cls}</span>` : '';
    tooltip.innerHTML = `${name}${extra}`;
    tooltip.classList.remove('hidden');
    const rect = el.getBoundingClientRect();
    let top = rect.top - 28;
    let left = rect.left + rect.width / 2;
    if (top < 8) top = rect.bottom + 8;
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
    tooltip.style.transform = 'translateX(-50%)';
  };

  const hideTooltip = () => {
    if (tooltip) tooltip.classList.add('hidden');
    if (currentEl) {
      currentEl.classList.remove('friendly-highlight');
      currentEl = null;
    }
  };

  const onMouseOver = (e) => {
    if (!active) return;
    const el = e.target.closest('[data-friendly-name]');
    if (!el || el === currentEl) return;
    if (currentEl) currentEl.classList.remove('friendly-highlight');
    currentEl = el;
    el.classList.add('friendly-highlight');
    showTooltip(el);
  };

  const onMouseOut = (e) => {
    if (!active) return;
    const el = e.target.closest('[data-friendly-name]');
    if (el && el === currentEl) hideTooltip();
  };

  const onMouseMove = (e) => {
    if (!active || !tooltip || tooltip.classList.contains('hidden')) return;
    // segue o mouse levemente para melhor UX tipo devtools
    const x = e.clientX;
    tooltip.style.left = x + 'px';
  };

  if (btn) {
    updateBtn();
    btn.addEventListener('click', () => {
      active = !active;
      updateBtn();
      if (!active) hideTooltip();
    });
  }

  document.addEventListener('mouseover', onMouseOver);
  document.addEventListener('mouseout', onMouseOut);
  document.addEventListener('mousemove', onMouseMove);

  // Adiciona nomes granulares para elementos dinâmicos (bolhas por tipo, cadernos, inputs)
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      m.addedNodes.forEach((n) => {
        if (n.nodeType !== 1) return;
        // Bolhas — por tipo de conteúdo
        if (n.classList.contains('bubble') && !n.hasAttribute('data-friendly-name')) {
          const isCheck = n.classList.contains('bubble-checklist');
          const isIdea = n.classList.contains('bubble-idea');
          const snippet = (n.textContent || '').trim().slice(0, 24).replace(/\s+/g, ' ');
          const base = isCheck ? 'Mensagem Checklist' : isIdea ? 'Mensagem Ideia' : n.classList.contains('remote') ? 'Mensagem Recebida' : 'Mensagem Enviada';
          n.setAttribute('data-friendly-name', `${base}: "${snippet}..."`);
          // sub-componentes da bolha
          const meta = n.querySelector('.meta');
          if (meta) meta.setAttribute('data-friendly-name', 'Bolha: timestamp/status');
          const toggle = n.querySelector('.msg-toggle');
          if (toggle) toggle.setAttribute('data-friendly-name', 'Bolha: Menu (▾)');
        }
        if (n.classList.contains('tnode') && !n.hasAttribute('data-friendly-name')) {
          const label = n.querySelector('.label')?.textContent || 'sem nome';
          const isFolder = n.classList.contains('folder-node');
          n.setAttribute('data-friendly-name', `${isFolder ? 'Pasta' : 'Caderno'}: ${label}`);
        }
        // Composer sub-componentes
        if (n.id === 'composer-input') n.setAttribute('data-friendly-name', 'Input: Escreva sua anotação');
        if (n.id === 'btn-send') n.setAttribute('data-friendly-name', 'Input: Botão Enviar (→)');
        if (n.id === 'btn-attach') n.setAttribute('data-friendly-name', 'Input: Anexar');
        if (n.closest && n.closest('.md-check')) {
          n.setAttribute('data-friendly-name', 'Checklist: item');
        }
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Inicializa elementos já existentes no DOM
  document.querySelectorAll('#composer-input').forEach(el => el.setAttribute('data-friendly-name', 'Input: Escreva sua anotação'));
  document.querySelectorAll('#btn-send').forEach(el => el.setAttribute('data-friendly-name', 'Input: Botão Enviar'));
  document.querySelectorAll('#btn-attach').forEach(el => el.setAttribute('data-friendly-name', 'Input: Anexar'));
  document.querySelectorAll('.fmt-btn').forEach(el => {
    const fmt = el.dataset.fmt;
    el.setAttribute('data-friendly-name', `Input: Formatação ${fmt}`);
  });
  document.querySelectorAll('.search-box').forEach(el => {
    if (!el.hasAttribute('data-friendly-name')) el.setAttribute('data-friendly-name', 'Explorer: Campo de Busca');
  });
})();
