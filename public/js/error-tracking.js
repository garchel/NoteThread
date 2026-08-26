/* ============================================================
   Observabilidade leve (IMP-5) — error tracking sem dependências
   - Captura window.onerror + unhandledrejection
   - Envia ao endpoint configurado (window.ERROR_ENDPOINT) se houver
     (ex.: Sentry custom endpoint, Vercel log drain, webhook próprio)
   - Sempre registra em buffer local p/ debug (?errors=1 mostra)
   - Zero custo quando nada configurado; silencioso por padrão
   ============================================================ */
(function () {
  const MAX = 25;
  const buffer = [];

  function record(kind, message, source, lineno, colno, error) {
    try {
      const entry = {
        kind,
        message: String(message).slice(0, 300),
        source: source ? String(source).split('/').pop() : undefined,
        line: lineno, col: colno,
        stack: error && error.stack ? String(error.stack).slice(0, 800) : undefined,
        theme: document.documentElement.dataset.theme,
        href: location.href.slice(0, 120),
        ts: Date.now(),
      };
      buffer.push(entry);
      if (buffer.length > MAX) buffer.shift();
      // destino externo opcional (configurar antes do load deste arquivo):
      if (typeof window.ERROR_ENDPOINT === 'string' && window.ERROR_ENDPOINT) {
        fetch(window.ERROR_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry),
          keepalive: true,
        }).catch(() => {});
      }
      if (location.search.includes('errors=1')) console.warn('[error-tracker]', entry);
    } catch { /* tracker nunca derruba o app */ }
  }

  window.addEventListener('error', (e) => {
    if (e.target && e.target.tagName && !e.message) return; // resource error (img/script) — ignorar
    record('uncaught', e.message, e.filename, e.lineno, e.colno, e.error);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    record('promise', r && r.message ? r.message : String(r), null, null, null, r instanceof Error ? r : null);
  });

  // inspeção manual no console / página de suporte futura
  window.__errorBuffer = buffer;
})();
