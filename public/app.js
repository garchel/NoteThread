// NoteThread — entry point (ES Modules, sem build step)
import { haptic, $, uid, esc, fmtTime, now, hideWithExit } from './js/utils.js';
import { ICON, wrapSvg } from './js/icons.js';
import { renderMarkdown } from './js/markdown.js';
import { Store } from './js/store.js';
import { CUELUME_SOUNDS, Sound } from './js/sound.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, USE_SUPABASE, getSupa, Sync } from './js/sync-supabase.js';
import { PickerMethods } from './js/ui/picker.js';
import { NavigationMethods } from './js/ui/navigation.js';
import { MessagesMethods } from './js/ui/messages.js';
import { MentionMethods } from './js/ui/mentions.js';
import { ReminderMethods } from './js/ui/reminders.js';
import { SettingsMethods } from './js/ui/settings.js';
import { AuthMethods } from './js/ui/auth.js';
import { TreeMethods } from './js/ui/tree.js';
import { ComposerMethods } from './js/ui/composer.js';
import { SyncEventsMethods } from './js/ui/sync-events.js';

// bundle ES Modules carregado

(() => {
  'use strict';

  // UI / CONTROLLER
  // ===================================================================
  const UI = {
async init() {
      this.dom = {
        tree: $('#tree'), favSection: $('#fav-section'), favList: $('#fav-list'),
        ctx: $('#ctx-menu'), modal: $('#modal'), modalTitle: $('#modal-title'),
        modalBody: $('#modal-body'), modalOk: $('#modal-ok'), modalCancel: $('#modal-cancel'),
        msgPopover: $('#msg-popover'), pinPopover: $('#pin-popover'),
        pinBody: $('#pin-body'), btnPin: $('#btn-pin'),
        settingsPopover: $('#settings-popover'), btnSettings: $('#btn-settings'), navSettings: $('#nav-settings'),
        searchInput: $('#search-input'), searchClear: $('#search-clear'), searchResults: $('#search-results'),
        btnAttach: $('#btn-attach'), fileInput: $('#file-input'), attachPreview: $('#attach-preview'),
      };
      this.longPressTimer = null;
      this.tnodeLongPressTimer = null;
      this.bindAuth();
      this.bindTreeActions();
      this.bindTreeDnd();
      this.bindComposer();
      this.bindThreadTitle();
      this.bindSync();
      this.bindContextMenu();
      // Explorer: lembretes no header
      const expRem = document.getElementById('explorer-reminders');
      if (expRem) {
        expRem.addEventListener('click', () => this.showRemindersPage());
        const backRem = document.getElementById('reminders-back');
        if (backRem) backRem.addEventListener('click', () => this.hideRemindersPage());
        this.updateRemBadge();
      }
      const notifBtn = document.getElementById('btn-notifications');
      if (notifBtn) {
        notifBtn.addEventListener('click', (e) => { e.stopPropagation(); this.toggleNotifPopover(); });
        document.addEventListener('click', (e) => {
          const p = document.getElementById('notif-popover');
          if (p && !p.classList.contains('hidden') && !p.contains(e.target) && !notifBtn.contains(e.target)) p.classList.add('hidden');
        });
        this.updateNotifBadge();
        // atualiza badge quando lembretes mudam
        const origCheck = this._checkReminders.bind(this);
        this._checkReminders = () => { origCheck(); this.updateNotifBadge(); };
      }
      const backSearch = document.getElementById('search-back');
      if (backSearch) backSearch.addEventListener('click', () => this.hideSearchPage());
      // Perfil popover
      const profileBtn = document.getElementById('profile-btn');
      const profilePop = document.getElementById('profile-popover');
      if (profileBtn && profilePop) {
        profileBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          profilePop.classList.toggle('hidden');
          // posiciona acima do footer
          const r = profileBtn.getBoundingClientRect();
          const pw = 200, ph = 100;
          let left = r.left;
          let top = r.top - ph - 8;
          if (top < 8) top = r.bottom + 8;
          profilePop.style.left = left + 'px';
          profilePop.style.top = top + 'px';
        });
        document.addEventListener('click', (e) => {
          if (!profilePop.contains(e.target) && !profileBtn.contains(e.target)) profilePop.classList.add('hidden');
        });
        document.getElementById('profile-config')?.addEventListener('click', (e) => {
          e.stopPropagation();
          profilePop.classList.add('hidden');
          // pequeno delay para não ser fechado pelo handler global do settings popover
          setTimeout(() => this.toggleSettingsPopover(), 10);
        });
        document.getElementById('profile-logout')?.addEventListener('click', async () => {
          const supa = this._getSupa && this._getSupa();
          if (supa) try { await supa.auth.signOut(); } catch {}
          Store.setUser(null); this.renderAuthOrApp();
          profilePop.classList.add('hidden');
        });
      }
      // (o toggle do popover de configurações é ligado em bindSettings, ancorado no #nav-settings)
      this.bindModal();
      this.bindMsgPopover();
      this.bindPinPopover();
      this.bindPinButton();
      this.bindSettings();
      this.bindFooter();
      this.bindSearch();
      this.bindShortcuts();
      this.bindSwipe();
      this.initReminders();
      // persistência de login: restaura sessão Supabase antes do primeiro render
      if (USE_SUPABASE) {
        try {
          // timeout 3s: se esm.sh/Supabase não responder, renderiza offline mesmo assim
          const supa = await Promise.race([
            this._ensureSupa(),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000))
          ]);
          if (supa) {
            const { data: { session } } = await supa.auth.getSession();
            if (session && session.user) {
              // lembrar-me desmarcado na última sessão → não restaura login
              if (Store.data.ui && Store.data.ui.rememberMe === false) { try { await supa.auth.signOut(); } catch {} Store.setUser(null); }
              else Store.setUser({ name: session.user.email.split('@')[0], mail: session.user.email, provider: 'supabase', id: session.user.id });
            }
          }
        } catch (e) { /* offline/timeout, mantém Store.user local */ }
      }
      this.renderAuthOrApp();
      // atualiza o rótulo de "última sincronização" a cada 15s
      setInterval(() => this.updateSyncLabel(), 15000);
    },

updateSyncLabel() {
      const el = $('#sync-status'); if (!el) return;
      const state = el.dataset.state;
      const base = el.dataset.status || 'Sincronizado';
      if (state === 'online' && Sync.lastSync) {
        const secs = Math.round((Date.now() - Sync.lastSync) / 1000);
        let rel;
        if (secs < 5) rel = 'agora';
        else if (secs < 60) rel = `há ${secs}s`;
        else if (secs < 3600) rel = `há ${Math.floor(secs / 60)}min`;
        else rel = `há ${Math.floor(secs / 3600)}h`;
        el.title = `${base} ${rel}`;
      } else {
        el.title = base;
      }
    },

bindFooter() {
      const st = $('#sync-status');
      if (st) st.addEventListener('click', (e) => {
        e.stopPropagation();
        const label = st.dataset.status || 'Status';
        // toast leve no mobile (desktop já tem title no hover)
        const t = document.createElement('div');
        t.textContent = label;
        t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--text);color:#fff;padding:8px 16px;border-radius:10px;font-size:13px;z-index:999;box-shadow:var(--shadow-md);opacity:0;transition:opacity .2s';
        document.body.appendChild(t);
        requestAnimationFrame(() => { t.style.opacity = '1'; });
        setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 250); }, 1600);
      });
    },

toast(msg, opts) {
      opts = opts || {};
      const t = document.createElement('div');
      t.className = 'app-toast' + (opts.kind ? ' ' + opts.kind : '');
      const span = document.createElement('span');
      span.className = 'toast-msg';
      span.textContent = msg;
      t.appendChild(span);
      let hideTimer = null;
      const hide = () => {
        if (hideTimer) clearTimeout(hideTimer);
        if (t._leaving) return;
        t._leaving = true;
        // animação de saída: desliza para cima + fade antes de remover
        t.classList.remove('show');
        t.classList.add('leaving');
        setTimeout(() => t.remove(), 180);
      };
      if (opts.action && opts.action.fn) {
        const btn = document.createElement('button');
        btn.className = 'toast-action';
        btn.textContent = opts.action.label || 'Desfazer';
        btn.addEventListener('click', (e) => { e.stopPropagation(); opts.action.fn(); hide(); });
        t.appendChild(btn);
      }
      document.body.appendChild(t);
      requestAnimationFrame(() => { t.classList.add('show'); });
      hideTimer = setTimeout(hide, opts.duration || 2600);
    },

bindModal() {
      this.dom.modalCancel.addEventListener('click', () => this.closeModal());
      this.dom.modalOk.addEventListener('click', () => this.modalOkHandler && this.modalOkHandler());
      // Focus trap (a11y): Tab circula só dentro do modal; Esc fecha
      this.dom.modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); this.closeModal(); return; }
        if (e.key !== 'Tab') return;
        const focusables = this.dom.modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        const list = [...focusables].filter((el) => !el.disabled && el.offsetParent !== null);
        if (!list.length) return;
        const first = list[0], last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      });
    },

closeModal() {
      // M2: saída animada antes de esconder
      hideWithExit(this.dom.modal);
      this.modalOkHandler = null;
      this.dom.modalOk.classList.remove('btn-danger', 'danger');
      this.dom.modalOk.classList.add('primary');
      this.dom.modalOk.textContent = 'OK';
      // devolve o foco ao gatilho que abriu o modal
      if (this._modalTrigger && document.contains(this._modalTrigger)) {
        try { this._modalTrigger.focus({ preventScroll: true }); } catch { this._modalTrigger.focus(); }
      }
      this._modalTrigger = null;
    },

showModal(title, bodyHtml, onOk) {
      // lembra quem abriu para devolver o foco no fecho
      const ae = document.activeElement;
      this._modalTrigger = (ae && ae !== document.body && !this.dom.modal.contains(ae)) ? ae : null;
      this.dom.modalTitle.textContent = title;
      this.dom.modalBody.innerHTML = bodyHtml;
      this.modalOkHandler = onOk;
      // se o modal está saindo (leaving), marca reabertura p/ o hideWithExit abortar
      if (this.dom.modal._leaving) this.dom.modal._reopenRequested = true;
      this.dom.modal.classList.remove('hidden');
      // foco inicial no primeiro controle focável do modal
      requestAnimationFrame(() => {
        const f = this.dom.modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (f) f.focus();
      });
    },
  };

  // mescla os grupos de métodos extraídos
  Object.assign(UI, PickerMethods, NavigationMethods, MessagesMethods, MentionMethods, ReminderMethods,
    SettingsMethods, AuthMethods, TreeMethods, ComposerMethods, SyncEventsMethods);

  Store.load();
  // aplica tema salvo antes de montar a UI
  const savedTheme = (Store.data.ui && Store.data.ui.theme) || 'peach';
  document.documentElement.dataset.theme = savedTheme;
  UI.init();

  // expõe para debugging/inspeção no console
  window.NoteThread = { Store, Sync, UI, Sound };

  // registra o Service Worker (PWA / offline)
  // kill-switch: adicione ?nosw=1 à URL para desregistrar todos os SWs e limpar caches
  const url = new URL(location.href);
  if (url.searchParams.has('nosw')) {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
    }
    if (window.caches && caches.keys) {
      caches.keys().then((ks) => ks.forEach((k) => caches.delete(k)));
    }
    console.warn('[NoteThread] SW desregistrado e caches limpos (?nosw=1). Recarregue sem o parâmetro.');
  } else if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
        .then((reg) => {
          try { reg.update(); } catch {}
          reg.addEventListener('updatefound', () => {
            const nw = reg.installing;
            if (!nw) return;
            nw.addEventListener('statechange', () => {
              if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                // busca changelog curto para mostrar no toast
                fetch('CHANGELOG.md').then(r => r.text()).then(t => {
                  const m = t.match(/## \[.*?\][^\n]*\n([\s\S]*?)(?=\n## |\n$)/);
                  const whats = m ? m[1].split('\n').filter(l=>l.trim().startsWith('-')).slice(0,2).map(l=>l.replace(/^-\s*/,'')).join(' · ') : 'Melhorias de performance e correções';
                  UI.toast(`Nova versão — ${whats}`, { kind: 'info', duration: 9000, action: { label: 'Recarregar', fn: () => location.reload() } });
                }).catch(() => {
                  UI.toast('Nova versão disponível', { kind: 'info', duration: 8000, action: { label: 'Recarregar', fn: () => location.reload() } });
                });
              }
            });
          });
        })
        .catch(() => { /* SW opcional */ });
    });
    let refreshed = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshed) return; refreshed = true; location.reload();
    });
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'notethread-sync' && Sync.flushQueue) Sync.flushQueue();
      // clique numa notificação de lembrete → abre o caderno
      if (e.data && e.data.type === 'notethread-open-thread' && e.data.threadId) {
        if (Store.getThread(e.data.threadId)) UI.openThread(e.data.threadId);
      }
    });
    // abertura via notificação com app fechado (?thread=<id>)
    const bootUrl = new URL(location.href);
    const bootThread = bootUrl.searchParams.get('thread');
    if (bootThread && Store.getThread(bootThread)) {
      UI.openThread(bootThread);
      history.replaceState(null, '', location.pathname);
    }
    window.addEventListener('online', () => { if (Sync.flushQueue) Sync.flushQueue(); });
  }
})();

