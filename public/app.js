// NoteThread — entry point (ES Modules, sem build step)
import { haptic, $, uid, esc, fmtTime, now } from './js/utils.js';
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

console.info('[NoteThread] bundle v32 — ES Modules');

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
        settingsPopover: $('#settings-popover'), btnSettings: $('#btn-settings'),
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
      // Nav cozy
      const navNew = $('#nav-new-note'); if (navNew) navNew.addEventListener('click', () => this.createThread());
      const navSet = $('#nav-settings'); if (navSet) navSet.addEventListener('click', (e) => { e.stopPropagation(); this.toggleSettingsPopover(); });
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
        t.classList.remove('show');
        setTimeout(() => t.remove(), 300);
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
    },

closeModal() { this.dom.modal.classList.add('hidden'); this.modalOkHandler = null; this.dom.modalOk.classList.remove('btn-danger'); this.dom.modalOk.textContent = 'OK'; },

showModal(title, bodyHtml, onOk) {
      this.dom.modalTitle.textContent = title;
      this.dom.modalBody.innerHTML = bodyHtml;
      this.modalOkHandler = onOk;
      this.dom.modal.classList.remove('hidden');
    },
  };

  // mescla os grupos de métodos extraídos
  Object.assign(UI, PickerMethods, NavigationMethods, MessagesMethods, MentionMethods, ReminderMethods,
    SettingsMethods, AuthMethods, TreeMethods, ComposerMethods, SyncEventsMethods);

  Store.load();
  // aplica tema salvo antes de montar a UI
  const savedTheme = (Store.data.ui && Store.data.ui.theme) || 'lavender';
  document.documentElement.dataset.theme = savedTheme;
  UI.init();

  // expõe para debugging/inspeção no console
  window.NoteThread = { Store, Sync, UI, Sound };

  // registra o Service Worker (PWA / offline)
  if ('serviceWorker' in navigator) {
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
    });
    window.addEventListener('online', () => { if (Sync.flushQueue) Sync.flushQueue(); });
  }
})();

