// SaveChat — atualização do app (PWA)
// Check na abertura: compara a versão local (window.APP_VERSION do index.html)
// com a versão publicada (1ª linha "## [x.y.z]" do CHANGELOG.md servido).
// Indicador no popover do perfil; clique = baixa e instala a nova versão.
//
// Estados do chip:
//   checking  → "verificando…" (spinner leve)
//   current   → "v1.4.1 ✓" (verde --ok)  — já está na mais recente
//   update    → "v1.4.2 disponível" (âmbar) + dot no avatar — clique atualiza
//   offline   → "offline" (cinza) — sem rede p/ verificar
//   error     → "não foi possível verificar" (cinza)

import { $ } from './utils.js';

const V = () => (window.APP_VERSION || '0.0.0');

let lastCheck = null; // { state, remote, ts } — memo p/ clique imediato

function chipEl() { return $('#update-chip'); }

function setChip(state, remote) {
  const chip = chipEl(); if (!chip) return;
  const labels = {
    checking: 'verificando…',
    current: `${V()} ✓`,
    update: `${remote} disponível`,
    offline: 'offline',
    error: 'indisponível',
  };
  chip.dataset.state = state;
  chip.textContent = labels[state] || '';
  chip.classList.remove('hidden');
  // botão inteiro viva o estado (title/aria dinâmicos p/ screen readers)
  const btn = $('#profile-update');
  if (btn) {
    const titles = {
      checking: 'Verificando atualizações…',
      current: `Você está na versão mais recente (${V()})`,
      update: `Baixar e instalar a versão ${remote}`,
      offline: 'Sem conexão para verificar atualizações',
      error: 'Não foi possível verificar atualizações agora',
    };
    btn.title = titles[state] || '';
    btn.setAttribute('aria-label', titles[state] || 'Atualizar app');
  }
  // dot âmbar no avatar quando há novidade (sinal visível mesmo com popover fechado)
  const avatar = $('#me-avatar');
  if (avatar) avatar.classList.toggle('has-update', state === 'update');
}

async function remoteVersion() {
  // cache-buster obrigatório: CHANGELOG.md passa a ser network-first no SW,
  // mas o HTTP cache do browser ainda pode servir stale sem o parâmetro
  const r = await fetch(`CHANGELOG.md?_=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) throw new Error('changelog ' + r.status);
  const t = await r.text();
  const m = t.match(/^## \[(\d+\.\d+\.\d+)\]/m);
  if (!m) throw new Error('sem versão no changelog');
  return m[1];
}

function newer(a, b) { // a > b ?
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

async function check({ silent } = {}) {
  if (!navigator.onLine) { lastCheck = { state: 'offline', ts: Date.now() }; setChip('offline'); return lastCheck; }
  setChip('checking');
  try {
    const remote = await remoteVersion();
    const state = newer(remote, V()) ? 'update' : 'current';
    lastCheck = { state, remote, ts: Date.now() };
    setChip(state, remote);
    // toast silencioso apenas quando há novidade e não foi pedido manual
    if (state === 'update' && silent && window.NoteThread && window.NoteThread.UI) {
      window.NoteThread.UI.toast(`Nova versão ${remote} disponível`, { kind: 'info', duration: 6000 });
    }
  } catch (e) {
    lastCheck = { state: 'error', ts: Date.now(), err: String(e && e.message || e) };
    setChip('error');
  }
  return lastCheck;
}

async function applyUpdate() {
  const btn = $('#profile-update');
  const busy = () => btn && btn.classList.contains('updating');
  const setBusy = (on) => { if (btn) { btn.classList.toggle('updating', on); btn.disabled = on; } };

  // 1) refresh da página controlada: SW waiting assume o controle
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const waiting = reg && reg.waiting;
      if (waiting) {
        setBusy(true);
        waiting.postMessage({ type: 'SKIP_WAITING' }); // controllerchange → app.js recarrega
        setTimeout(() => setBusy(false), 8000); // destrava se o reload não vier
        return;
      }
    } catch { /* segue para o fallback abaixo */ }
  }

  // 2) sem SW waiting (ou sem SW): o navegador pode já ter a versão nova no HTTP
  //    cache após o check network-first — um reload puro a adota.
  setBusy(true);
  location.reload();
}

export const Updater = {
  V,
  check,
  applyUpdate,
  get lastCheck() { return lastCheck; },
};
