// Utilitários compartilhados
export const PAGE_SIZE = 25;

// helper para feedback tátil (mobile)
export function haptic(type) {
  if (!navigator.vibrate) return;
  const patterns = {
    light: [10],
    medium: [20],
    heavy: [30],
    success: [10, 50, 10],
    error: [30, 30, 30],
    delete: [15, 30, 15],
  };
  try { navigator.vibrate(patterns[type] || patterns.light); } catch {}
}

export const $ = (s) => document.querySelector(s);
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmtTime = (ts) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
export const now = () => Date.now();

/* M2 fix: saída animada p/ popovers, modais e ctx-menus.
   Adiciona .leaving (150ms ease-in) antes do .hidden — nada mais some seco.
   Retorna imediatamente; o elemento é escondido ao fim da animação. */
export function hideWithExit(el) {
  if (!el || el.classList.contains('hidden') || el._leaving) return;
  el._leaving = true;
  el.classList.add('leaving');
  const finish = () => {
    // se foi reaberto durante a saída, aborta o hide (evita modal fantasma)
    if (el._reopenRequested) { el._reopenRequested = false; el._leaving = false; el.classList.remove('leaving'); return; }
    el.classList.add('hidden');
    el.classList.remove('leaving');
    el._leaving = false;
  };
  // prefers-reduced-motion derruba a duração para ~0 → cai no timeout
  const dur = parseFloat(getComputedStyle(el).getPropertyValue('--exit-duration')) || 150;
  setTimeout(finish, dur);
}

