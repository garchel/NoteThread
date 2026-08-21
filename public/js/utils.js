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
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmtTime = (ts) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
export const now = () => Date.now();

