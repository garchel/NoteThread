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
    tooltip.textContent = name;
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

  // Adiciona nomes para elementos dinâmicos (bolhas, cadernos)
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      m.addedNodes.forEach((n) => {
        if (n.nodeType === 1) {
          if (n.classList.contains('bubble') && !n.hasAttribute('data-friendly-name')) {
            const isCheck = n.classList.contains('bubble-checklist');
            const isIdea = n.classList.contains('bubble-idea');
            n.setAttribute('data-friendly-name', isCheck ? 'Mensagem Checklist' : isIdea ? 'Mensagem Ideia' : n.classList.contains('remote') ? 'Mensagem Recebida' : 'Mensagem Enviada');
          }
          if (n.classList.contains('tnode') && !n.hasAttribute('data-friendly-name')) {
            n.setAttribute('data-friendly-name', 'Caderno: ' + (n.querySelector('.label')?.textContent || 'sem nome'));
          }
        }
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
