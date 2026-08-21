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

console.info('[NoteThread] bundle v32 — ES Modules');

(() => {
  'use strict';

  // UI / CONTROLLER
  // ===================================================================
  const UI = {
    activeThread: null,
    renderedClientIds: new Set(),
    oldestTs: null,
    loading: false,
    ctxThreadId: null,
    pendingImages: [],
    dom: {},

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

    // ---------- Notificações (toast) ----------
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
    // ---------- Configurações ----------
    bindSettings() {
      this.dom.btnSettings.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleSettingsPopover();
      });
      document.addEventListener('click', (e) => {
        const p = this.dom.settingsPopover;
        if (!p.classList.contains('hidden') && !p.contains(e.target) && e.target !== this.dom.btnSettings) {
          p.classList.add('hidden');
        }
      });
      const p = this.dom.settingsPopover;
      // tema + ações data-set
      p.querySelectorAll('[data-set]').forEach((b) => b.addEventListener('click', () => this.handleSetting(b.dataset.set, b.dataset.val)));
      // tema ativo
      const theme = (Store.data && Store.data.ui && Store.data.ui.theme) || 'lavender';
      p.querySelectorAll('[data-set="theme"]').forEach((b) => b.classList.toggle('active', b.dataset.val === theme));
      // ordenação ativa
      const sort = (Store.data && Store.data.ui && Store.data.ui.sort) || 'recent';
      p.querySelectorAll('[data-set="sort"]').forEach((b) => b.classList.toggle('active', b.dataset.val === sort));
      // aplica o tema salvo (resolve "auto")
      this.applyTheme();
      // reage a mudanças de tema do sistema quando em "auto"
      if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
          const t = (Store.data && Store.data.ui && Store.data.ui.theme) || 'lavender';
          if (t === 'auto') this.applyTheme();
        });
      }

      // ---- Sons (cuelume) ----
      Sound.load();
      const s = (Store.data.ui && Store.data.ui.sounds) || { enabled: false, volume: 0.6, map: {} };
      const en = $('#sound-enabled'); if (en) en.checked = !!s.enabled;
      const vol = $('#sound-volume'); if (vol) vol.value = (typeof s.volume === 'number' ? s.volume : 0.6);
      // ---- Checklists: ocultar concluídos ----
      const hd = $('#chk-hide-done');
      if (hd) {
        hd.checked = !!(Store.data.ui && Store.data.ui.hideDoneChecks);
        hd.addEventListener('change', () => {
          Store.data.ui = Store.data.ui || {};
          Store.data.ui.hideDoneChecks = hd.checked; Store.save();
          if (this.activeThread) { this.renderedClientIds = new Set(); this.renderMessages(true); }
        });
      }
      // preenche selects com a lista de sons do cuelume
      const selects = p.querySelectorAll('select[data-sound]');
      selects.forEach((sel) => {
        const action = sel.dataset.sound;
        CUELUME_SOUNDS.forEach((name) => {
          const o = document.createElement('option'); o.value = name; o.textContent = name;
          sel.appendChild(o);
        });
        sel.value = (s.map && s.map[action]) || '';
        sel.addEventListener('change', () => {
          Store.data.ui.sounds = Store.data.ui.sounds || { enabled: false, volume: 0.6, map: {} };
          Store.data.ui.sounds.map = Store.data.ui.sounds.map || {};
          Store.data.ui.sounds.map[action] = sel.value || undefined;
          Store.save();
          if (sel.value) { Sound.play(action); } // pré-escuta
        });
      });
      if (en) en.addEventListener('change', () => {
        Store.data.ui.sounds = Store.data.ui.sounds || {};
        Store.data.ui.sounds.enabled = en.checked; Store.save(); Sound.apply();
        if (en.checked) Sound.play('create');
      });
      if (vol) vol.addEventListener('input', () => {
        Store.data.ui.sounds = Store.data.ui.sounds || {};
        Store.data.ui.sounds.volume = parseFloat(vol.value); Store.save(); Sound.apply();
      });
    },
    applyTheme() {
      const theme = (Store.data && Store.data.ui && Store.data.ui.theme) || 'lavender';
      let resolved = theme;
      if (theme === 'auto') {
        const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        resolved = dark ? 'midnight' : 'lavender';
      }
      document.documentElement.dataset.theme = resolved;
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) {
        const colors = { lavender:'#7c5cff', dark:'#191622', mint:'#1faa86', peach:'#ff7a59', ocean:'#2b8fd6', midnight:'#0e1525' };
        meta.setAttribute('content', colors[resolved] || '#7c5cff');
      }
    },
    handleSetting(act, val) {
      if (act === 'theme') {
        Store.data.ui = Store.data.ui || {}; Store.data.ui.theme = val; Store.save();
        this.applyTheme();
        this.dom.settingsPopover.querySelectorAll('[data-set="theme"]').forEach((b) => b.classList.toggle('active', b.dataset.val === val));
      } else if (act === 'sort') {
        Store.data.ui = Store.data.ui || {}; Store.data.ui.sort = val; Store.save();
        this.renderTree();
        this.dom.settingsPopover.querySelectorAll('[data-set="sort"]').forEach((b) => b.classList.toggle('active', b.dataset.val === val));
      } else if (act === 'export') {
        const data = JSON.stringify({ threads: Store.data.threads, folders: Store.data.folders, notes: Store.data.notes }, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'notethread.json'; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      } else if (act === 'clear') {
        if (confirm('Apagar TODAS as conversas, pastas e notas? Esta ação não pode ser desfeita.')) {
          Store.data.threads = {}; Store.data.folders = {}; Store.data.notes = {}; Store.save();
          this.activeThread = null; this.renderedClientIds = new Set(); this.oldestTs = null;
          $('#chat-name').textContent = 'Selecione uma conversa'; $('#messages').querySelectorAll('.bubble,.day-sep').forEach((n) => n.remove());
          $('#empty-state').classList.remove('hidden'); this.dom.btnPin.classList.add('hidden');
          this.setChatActiveUi(false);
          this.renderTree();
          this.dom.settingsPopover.classList.add('hidden');
        }
      } else if (act === 'reconnect') {
        try { if (Sync.ws) Sync.ws.close(); } catch {}
        Sync.connect();
        this.dom.settingsPopover.classList.add('hidden');
      }
    },
    toggleSettingsPopover() {
      const p = this.dom.settingsPopover;
      if (!p.classList.contains('hidden')) { p.classList.add('hidden'); return; }
      p.classList.remove('hidden');
      const r = this.dom.btnSettings.getBoundingClientRect();
      const pw = 330, ph = 460;
      let left = r.right - pw;
      let top = r.bottom + 8;
      if (left < 8) left = 8;
      if (left + pw > window.innerWidth) left = window.innerWidth - pw - 8;
      if (top + ph > window.innerHeight) top = r.top - ph - 8;
      p.style.left = left + 'px';
      p.style.top = top + 'px';
    },

    // ---------- Auth ----------
    _getSupa() {
      if (Sync && Sync.supa) return Sync.supa;
      return null;
    },
    async _ensureSupa() {
      if (this._getSupa()) return this._getSupa();
      if (!USE_SUPABASE) return null;
      const c = await getSupa();
      if (Sync) Sync.supa = c;
      return c;
    },
    _showAuthMsg(text, kind) {
      const el = $('#auth-msg'); if (!el) return;
      el.textContent = text; el.className = 'auth-msg ' + (kind || 'info'); el.classList.remove('hidden');
    },
    _clearAuthMsg() { const el = $('#auth-msg'); if (el) { el.textContent = ''; el.classList.add('hidden'); } },
    bindAuth() {
      const emailInput = $('#email-input'), passInput = $('#password-input'), passField = $('#password-field');
      const submitBtn = $('#email-submit'), links = $('#auth-links'), switchBtn = $('#btn-switch-mode');
      const toggleBtn = $('#toggle-pass'), forgotBtn = $('#btn-forgot');
      let mode = 'login'; // login | signup
      const setMode = (m) => {
        mode = m;
        if (switchBtn) switchBtn.textContent = m === 'login' ? 'Criar conta' : 'Já tenho conta';
        if (submitBtn) submitBtn.textContent = m === 'login' ? 'Entrar' : 'Criar conta';
      };
      setMode('login');
      const revealPassword = () => {
        if (passField) passField.classList.remove('hidden');
        if (links) links.classList.remove('hidden');
        if ($('#remember-row')) $('#remember-row').classList.remove('hidden');
        if (passInput) { passInput.required = true; passInput.focus(); }
      };
      // aplica "lembrar-me": unchecked → não auto-loga na próxima visita
      const applyRemember = () => {
        const rm = $('#remember-me');
        Store.data.ui = Store.data.ui || {};
        Store.data.ui.rememberMe = rm ? !!rm.checked : true;
        Store.save();
      };

      // toggle senha
      if (toggleBtn && passInput) {
        toggleBtn.addEventListener('click', () => {
          const isPass = passInput.type === 'password';
          passInput.type = isPass ? 'text' : 'password';
          toggleBtn.textContent = isPass ? '◑' : '◐';
        });
      }
      if (switchBtn) switchBtn.addEventListener('click', () => setMode(mode === 'login' ? 'signup' : 'login'));
      if (forgotBtn) forgotBtn.addEventListener('click', async () => {
        const mail = emailInput.value.trim(); if (!mail) { this._showAuthMsg('Digite seu e-mail primeiro', 'error'); return; }
        const supa = await this._ensureSupa(); if (!supa) { this._showAuthMsg('Recuperação indisponível offline', 'error'); return; }
        const { error } = await supa.auth.resetPasswordForEmail(mail, { redirectTo: location.origin });
        this._showAuthMsg(error ? error.message : 'Link de recuperação enviado — verifique seu e-mail', error ? 'error' : 'success');
      });

      $('#btn-google').addEventListener('click', async () => {
        if (USE_SUPABASE) {
          const supa = await this._ensureSupa();
          const { error } = await supa.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin } });
          if (error) this._showAuthMsg(error.message, 'error');
          return;
        }
        Store.setUser({ name: 'Google User', mail: 'voce@gmail.com', provider: 'google' });
        this.renderAuthOrApp();
      });

      $('#email-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const mail = emailInput.value.trim();
        if (!mail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) { this._showAuthMsg('E-mail inválido', 'error'); return; }
        // passo 1: revela senha se ainda escondida
        if (passField && passField.classList.contains('hidden')) {
          revealPassword();
          this._showAuthMsg(mode === 'login' ? 'Digite sua senha para entrar' : 'Crie uma senha (mín. 6 caracteres)', 'info');
          return;
        }
        const pass = passInput ? passInput.value : '';
        if (!pass || pass.length < 6) { this._showAuthMsg('Senha precisa de 6+ caracteres', 'error'); return; }
        this._clearAuthMsg(); submitBtn.disabled = true; submitBtn.textContent = 'Aguarde…';
        try {
          if (USE_SUPABASE) {
            const supa = await this._ensureSupa();
            if (mode === 'signup') {
              const { error } = await supa.auth.signUp({ email: mail, password: pass, options: { emailRedirectTo: location.origin } });
              if (error) throw error;
              this._showAuthMsg('Conta criada! Confirme seu e-mail — depois volte e entre com a senha', 'success');
              setMode('login');
            } else {
              const { error } = await supa.auth.signInWithPassword({ email: mail, password: pass });
              if (error) throw error;
              applyRemember();
              const { data: { session } } = await supa.auth.getSession();
              if (session && session.user) {
                Store.setUser({ name: session.user.email.split('@')[0], mail: session.user.email, provider: 'supabase', id: session.user.id });
                this.renderAuthOrApp();
                return;
              }
            }
          } else {
            Store.setUser({ name: mail.split('@')[0], mail, provider: 'email' });
            this.renderAuthOrApp();
          }
        } catch (err) {
          const msg = err && err.message ? err.message : 'Falha no login';
          // se usuário não existe e tentou login, sugerir criar conta
          if (/Invalid login/i.test(msg) || /Email not confirmed/i.test(msg)) {
            this._showAuthMsg(msg + ' — use Criar conta ou confirme o e-mail', 'error');
          } else {
            this._showAuthMsg(msg, 'error');
          }
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = mode === 'login' ? 'Entrar' : 'Criar conta';
        }
      });

      $('#btn-logout').addEventListener('click', async () => {
        const supa = this._getSupa();
        if (supa) try { await supa.auth.signOut(); } catch {}
        Store.setUser(null); this.renderAuthOrApp();
        // reseta form
        if (passField) passField.classList.add('hidden');
        if (links) links.classList.add('hidden');
        if (passInput) { passInput.value = ''; passInput.required = false; }
        this._clearAuthMsg(); setMode('login');
      });

      // se já há sessão Supabase, sincroniza — apenas 1 listener global
      if (USE_SUPABASE) {
        this._ensureSupa().then(supa => {
          if (!supa || supa._bound) return;
          supa._bound = true; // marca para não duplicar onAuthStateChange
          supa.auth.getSession().then(({ data: { session } }) => {
            if (session && session.user) {
              // "lembrar-me" desmarcado → encerra a sessão local (não auto-loga)
              if (Store.data.ui && Store.data.ui.rememberMe === false) { supa.auth.signOut(); return; }
              const wasLogged = !!Store.user;
              applyRemember();
              Store.setUser({ name: session.user.email.split('@')[0], mail: session.user.email, provider: 'supabase', id: session.user.id });
              if (!wasLogged) this.renderAuthOrApp();
            }
          });
          supa.auth.onAuthStateChange((_ev, sess) => {
            if (sess && sess.user && (!Store.user || Store.user.mail !== sess.user.email)) {
              Store.setUser({ name: sess.user.email.split('@')[0], mail: sess.user.email, provider: 'supabase', id: sess.user.id });
              this.renderAuthOrApp();
            }
          });
        });
      }
    },

    renderAuthOrApp() {
      if (Store.user) {
        $('#auth-screen').classList.add('hidden');
        $('#app').classList.remove('hidden');
        this.renderMe();
        this.renderTree();
        // conecta apenas 1× — evita channel duplicado a cada onAuthStateChange
        if (!Sync.connected && !Sync._connecting) Sync.connect();
        this.setChatActiveUi(false);
      } else {
        $('#auth-screen').classList.remove('hidden');
        $('#app').classList.add('hidden');
      }
    },
    renderMe() {
      const u = Store.user;
      $('#me-name').textContent = u.name || 'Usuário';
      $('#me-mail').textContent = u.mail || '';
      $('#me-avatar').textContent = (u.name || 'U').charAt(0).toUpperCase();
    },

    // ---------- Ações da árvore ----------
    bindTreeActions() {
      $('#btn-new-thread').addEventListener('click', () => this.createThread());
      $('#btn-new-folder').addEventListener('click', () => this.createFolder());
      $('#btn-back').addEventListener('click', () => $('#app').classList.remove('show-chat'));
    },

    createThread() {
      let chosen = '💬';
      const body = `
        <label style="display:block;font-size:13px;color:var(--text-dim);margin-bottom:6px;font-weight:600">Nome da conversa</label>
        <input id="nt-name" type="text" placeholder="ex: Ideias de Projetos, Tarefas Diárias…" autofocus />
        <label style="display:block;font-size:13px;color:var(--text-dim);margin:14px 0 6px;font-weight:600">Ícone</label>
        <div class="ep">${this._pickerHTML('nt', chosen)}</div>`;
      this.showModal('Nova conversa', body, () => {
        const v = ($('#nt-name').value || '').trim();
        if (!v) { $('#nt-name').focus(); return; }
        const t = { id: uid(), name: v, emoji: chosen, folderId: this.activeFolderContext || null, favorite: false, createdAt: now(), updatedAt: now(), lastPreview: '', userId: Store.user ? Store.user.mail : 'anon' };
        Store.upsertThread(t);
        Sync.send('thread:upsert', t);
        this.renderTree();
        this.closeModal();
        Sound.play('create'); haptic('success');
        this.openThread(t.id);
      });
      this._bindPicker('nt', '💬', (e) => { chosen = e; });
      setTimeout(() => $('#nt-name') && $('#nt-name').focus(), 50);
    },

    createFolder() {
      let chosen = '📁';
      const body = `
        <label style="display:block;font-size:13px;color:var(--text-dim);margin-bottom:6px;font-weight:600">Nome da pasta</label>
        <input id="nf-name" type="text" placeholder="ex: Trabalho, Pessoal, Estudos…" autofocus />
        <label style="display:block;font-size:13px;color:var(--text-dim);margin:14px 0 6px;font-weight:600">Ícone</label>
        <div class="ep">${this._pickerHTML('nf', chosen)}</div>`;
      this.showModal('Nova pasta', body, () => {
        const v = ($('#nf-name').value || '').trim();
        if (!v) { $('#nf-name').focus(); return; }
        const f = { id: uid(), name: v, emoji: chosen, parentId: null, createdAt: now(), userId: Store.user ? Store.user.mail : 'anon' };
        Store.upsertFolder(f);
        Store.setExpanded(f.id, true);
        Sync.send('folder:upsert', f);
        this.closeModal();
        Sound.play('create'); haptic('success');
        this.renderTree();
      });
      this._bindPicker('nf', '📁', (e) => { chosen = e; });
      setTimeout(() => $('#nf-name') && $('#nf-name').focus(), 50);
    },

    // ---------- Render da árvore (estilo IDE) ----------
    sortThreads(list) {
      const mode = (Store.data && Store.data.ui && Store.data.ui.sort) || 'recent';
      const arr = list.slice();
      if (mode === 'manual') arr.sort((a, b) => (a.order || 0) - (b.order || 0));
      else if (mode === 'name') arr.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' }));
      else arr.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      return arr;
    },
    _rtTimer: null,
    queueRenderTree() { clearTimeout(this._rtTimer); this._rtTimer = setTimeout(() => this.renderTree(), 90); },
    renderTree() {
      this.renderFavorites();
      const tree = this.dom.tree;
      tree.innerHTML = '';
      const folders = Store.folderList();
      const threads = Store.threadList().filter((t) => !t.favorite && !t.folderId);

      if (!folders.length && !threads.length) {
        tree.innerHTML = `<div class="tree-empty">
          <div class="te-title">Comece sua primeira conversa</div>
          <div class="te-sub">Anote ideias, tarefas e reflexões como mensagens de chat.</div>
          <button class="te-btn" id="te-create">${wrapSvg(ICON.plus, 14)} Nova conversa</button>
        </div>`;
        const b = tree.querySelector('#te-create'); if (b) b.addEventListener('click', () => this.createThread());
      }

      // Pastas (com suas threads dentro)
      folders.forEach((f) => tree.appendChild(this.folderNode(f)));
      // Threads soltas (raiz)
      this.sortThreads(threads).forEach((t) => tree.appendChild(this.threadNode(t, 0)));
    },

    folderNode(f) {
      const kids = this.sortThreads(Store.threadList().filter((t) => !t.favorite && t.folderId === f.id));
      const expanded = Store.isExpanded(f.id);

      const row = document.createElement('div');
      row.className = 'tnode folder-node' + (expanded ? '' : ' collapsed');
      row.dataset.fid = f.id;
      row.setAttribute('draggable', 'true');
      row.innerHTML = `<span class="twist">${wrapSvg(ICON.chevron, 10)}</span><span class="ico">${wrapSvg(ICON.folder, 15)}</span>
                       <span class="label">${esc(f.name)}</span><span class="count">${kids.length || ''}</span>`;
      row.addEventListener('click', () => {
        const v = !Store.isExpanded(f.id);
        Store.setExpanded(f.id, v);
        row.classList.toggle('collapsed', !v);
        const ch = row.nextElementSibling;
        if (ch && ch.classList.contains('children')) {
          if (v) { ch.style.maxHeight = ch.scrollHeight + 'px'; setTimeout(() => { ch.style.maxHeight = 'none'; }, 240); }
          else { ch.style.maxHeight = ch.scrollHeight + 'px'; requestAnimationFrame(() => { ch.style.maxHeight = '0px'; }); }
        }
      });
      // menu de contexto na pasta (reutiliza thread ctx levemente)
      row.addEventListener('contextmenu', (e) => { e.preventDefault(); this.ctxFolderId = f.id; this.openFolderMenu(e, f); });
      // Long-press para mobile
      row.addEventListener('touchstart', (e) => {
        this.onTnodeTouchEnd();
        this.tnodeLongPressTimer = setTimeout(() => {
          const touch = e.touches[0];
          const fakeEvent = { clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => {}, stopPropagation: () => {} };
          this.ctxFolderId = f.id; this.openFolderMenu(fakeEvent, f);
        }, 500);
      }, { passive: true });
      row.addEventListener('touchend', () => this.onTnodeTouchEnd());
      row.addEventListener('touchmove', () => this.onTnodeTouchEnd());

      const wrap = document.createElement('div');
      wrap.appendChild(row);
      const children = document.createElement('div');
      children.className = 'children';
      if (!expanded) children.style.maxHeight = '0px';
      kids.forEach((t) => children.appendChild(this.threadNode(t, 1)));
      if (!kids.length) {
        const empty = document.createElement('div');
        empty.className = 'tnode';
        empty.style.opacity = '.5'; empty.style.fontSize = '13px'; empty.style.paddingLeft = '34px';
        empty.textContent = 'sem conversas';
        children.appendChild(empty);
      }
      wrap.appendChild(children);
      return wrap;
    },

    threadNode(t, depth) {
      const el = document.createElement('div');
      el.className = 'tnode' + (this.activeThread === t.id ? ' active' : '') + (t.favorite ? ' fav' : '');
      el.dataset.tid = t.id;
      el.setAttribute('draggable', 'true');
      el.style.paddingLeft = (8 + depth * 16) + 'px';
      let ic;
      if (t.favorite) ic = wrapSvg(ICON.star, 15);
      else if (t.emoji) ic = esc(t.emoji); // emoji escolhido pelo usuário (unicode)
      else ic = wrapSvg(ICON.bubble, 15);
      const noteCount = Store.notesFor(t.id).length;
      const countEl = noteCount ? `<span class="note-count" title="${noteCount} nota${noteCount !== 1 ? 's' : ''}">${noteCount}</span>` : '';
      // badge ⏰ se a thread tem lembrete pendente
      const hasRemind = Store.notesFor(t.id).some((x) => x.remindAt && !x.remindFired);
      const remindEl = hasRemind ? '<span class="remind-badge" title="Lembrete pendente">⏰</span>' : '';
      el.innerHTML = `<span class="twist" style="visibility:hidden">${wrapSvg(ICON.chevron, 10)}</span>
                      <span class="ico">${ic}</span>
                      <span class="label">${esc(t.name)}</span>
                      ${remindEl}
                      ${countEl}
                      <span class="star" title="Favoritar">${wrapSvg(ICON.star, 13)}</span>`;
      el.addEventListener('click', () => this.openThread(t.id));
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); this.openThreadMenu(e, t); });
      // Long-press para mobile (touch)
      el.addEventListener('touchstart', (e) => this.onTnodeTouchStart(e, t), { passive: true });
      el.addEventListener('touchend', () => this.onTnodeTouchEnd());
      el.addEventListener('touchmove', () => this.onTnodeTouchEnd());
      el.querySelector('.star').addEventListener('click', (e) => { e.stopPropagation(); this.toggleFavorite(t.id); });
      return el;
    },

    // Long-press para tnodes (mobile)
    onTnodeTouchStart(e, t) {
      this.onTnodeTouchEnd();
      this.tnodeLongPressTimer = setTimeout(() => {
        // Cria um evento fake com clientX/clientY do touch
        const touch = e.touches[0];
        const fakeEvent = { clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => {}, stopPropagation: () => {} };
        this.openThreadMenu(fakeEvent, t);
      }, 500);
    },
    onTnodeTouchEnd() {
      if (this.tnodeLongPressTimer) { clearTimeout(this.tnodeLongPressTimer); this.tnodeLongPressTimer = null; }
    },

    // atualiza a contagem de notas na sidebar — cirúrgico, sem reconstruir a árvore
    updateNoteCount() {
      Store.threadList().forEach((t) => {
        const count = Store.notesFor(t.id).length;
        document.querySelectorAll(`.tnode[data-tid="${t.id}"]`).forEach((el) => {
          let c = el.querySelector('.note-count');
          if (!count) { if (c) c.remove(); return; }
          if (!c) {
            c = document.createElement('span');
            c.className = 'note-count';
            const star = el.querySelector('.star');
            if (star) el.insertBefore(c, star); else el.appendChild(c);
          }
          c.textContent = count;
          c.title = `${count} nota${count !== 1 ? 's' : ''}`;
        });
      });
    },

    renderFavorites() {
      const sec = this.dom.favSection, list = this.dom.favList;
      const favs = this.sortThreads(Store.threadList().filter((t) => t.favorite));
      if (!favs.length) { sec.classList.add('hidden'); return; }
      sec.classList.remove('hidden');
      list.innerHTML = '';
      favs.forEach((t) => list.appendChild(this.threadNode(t, 0)));
    },

    toggleFavorite(id) {
      const t = Store.getThread(id); if (!t) return;
      t.favorite = !t.favorite; t.updatedAt = now();
      Store.upsertThread(t);
      Sync.send('thread:upsert', t);
      this.renderTree();
      Sound.play(t.favorite ? 'favorite' : 'pin'); haptic('light');
    },

    // ---------- Menu de contexto (thread) ----------
    bindContextMenu() {
      document.addEventListener('click', () => this.dom.ctx.classList.add('hidden'));
      // handler global para ações do menu de thread (data-act)
      this.dom.ctx.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (b && b.dataset.act && ['fav', 'unfav', 'rename', 'delete', 'move'].includes(b.dataset.act)) {
          this.handleCtx(b.dataset.act);
        }
      });
    },
    openThreadMenu(e, t) {
      this.ctxThreadId = t.id;
      const m = this.dom.ctx;
      m.querySelector('[data-act="fav"]').style.display = t.favorite ? 'none' : 'block';
      m.querySelector('[data-act="unfav"]').style.display = t.favorite ? 'block' : 'none';
      m.classList.remove('hidden');
      m.style.left = Math.min(e.clientX, window.innerWidth - 200) + 'px';
      m.style.top = Math.min(e.clientY, window.innerHeight - 220) + 'px';
      e.stopPropagation();
    },
    openFolderMenu(e, f) {
      // menu simples de pasta: renomear / excluir
      const m = this.dom.ctx;
      m.innerHTML = `<button data-act="rename-folder">✎ Renomear pasta</button>
                     <button data-act="delete-folder" class="danger">🗑 Excluir pasta</button>`;
      m.classList.remove('hidden');
      m.style.left = Math.min(e.clientX, window.innerWidth - 200) + 'px';
      m.style.top = Math.min(e.clientY, window.innerHeight - 160) + 'px';
      m.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        const act = b.dataset.act;
        if (act === 'rename-folder') {
          const n = prompt('Renomear pasta', f.name); if (n) { f.name = n.trim(); Store.upsertFolder(f); Sync.send('folder:upsert', f); this.renderTree(); }
        } else if (act === 'delete-folder') {
          if (confirm(`Excluir "${f.name}"? As conversas dentro voltam para a raiz.`)) {
            Store.deleteFolder(f.id, false); Sync.send('folder:delete', { id: f.id }); this.renderTree();
          }
        }
        m.classList.add('hidden');
      }));
      e.stopPropagation();
    },

    // ---------- Modal (mover thread) ----------
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

    // ---------- Ações do menu ----------
    handleCtx(act) {
      const id = this.ctxThreadId; const t = Store.getThread(id); if (!t) return;
      if (act === 'fav') this.toggleFavorite(id);
      else if (act === 'unfav') this.toggleFavorite(id);
      else if (act === 'rename') {
        const n = prompt('Renomear conversa', t.name); if (n) { t.name = n.trim(); t.updatedAt = now(); Store.upsertThread(t); Sync.send('thread:upsert', t); this.renderTree(); }
      } else if (act === 'delete') {
        this.confirmDeleteThread(id);
      } else if (act === 'move') {
        const folders = Store.folderList();
        const opts = ['<option value="">— Raiz (sem pasta) —</option>']
          .concat(folders.map((f) => `<option value="${f.id}" ${t.folderId === f.id ? 'selected' : ''}>${esc(f.name)}</option>`)).join('');
        this.showModal('Mover para pasta', `<select id="move-sel">${opts}</select>`, () => {
          const v = $('#move-sel').value || null; t.folderId = v; t.updatedAt = now();
          Store.upsertThread(t); Sync.send('thread:upsert', t); this.renderTree(); this.closeModal();
        });
      }
      this.dom.ctx.classList.add('hidden');
    },

    // ---------- Modal de exclusão de thread ----------
    confirmDeleteThread(id) {
      const t = Store.getThread(id); if (!t) return;
      const noteCount = Store.notesFor(id).length;
      const body = `
        <p style="font-size:14px;line-height:1.55;color:var(--text)">Tem certeza que deseja excluir a conversa <b>"${esc(t.name)}"</b>?</p>
        <p style="font-size:13px;color:var(--text-dim);margin-top:8px">${noteCount ? `${noteCount} nota${noteCount !== 1 ? 's' : ''} serão removida${noteCount !== 1 ? 's' : ''} permanentemente.` : 'Nenhuma nota nesta conversa.'} Esta ação não pode ser desfeita.</p>`;
      this.showModal('Excluir conversa', body, () => {
        delete Store.data.threads[id]; delete Store.data.notes[id];
        if (this.activeThread === id) {
          this.activeThread = null;
          $('#chat-name').textContent = 'Selecione uma conversa';
          $('#messages').querySelectorAll('.bubble,.day-sep').forEach((n) => n.remove());
          $('#empty-state').classList.remove('hidden');
          $('#composer-input').disabled = true; $('#btn-send').disabled = true;
          this.dom.btnPin.classList.add('hidden');
          this.setChatActiveUi(false);
        }
        Store.save(); Sync.send('thread:delete', { id });
        this.renderTree();
        this.closeModal();
        Sound.play('delete'); haptic('delete');
      });
      // destaca o botão OK como perigoso
      const okBtn = this.dom.modalOk;
      okBtn.classList.add('btn-danger');
      okBtn.textContent = 'Excluir';
    },
    bindComposer() {
      const ta = $('#composer-input'), send = $('#btn-send');
      // auto-resize: cresce com o conteúdo até ~60vh, depois ativa scroll interno
      const MAX_VH = 0.60;
      const resize = () => {
        ta.style.height = 'auto';
        const maxH = Math.floor(window.innerHeight * MAX_VH);
        if (ta.value === '') {
          ta.style.height = 'auto';
          ta.style.overflowY = 'hidden';
          return;
        }
        const target = Math.min(ta.scrollHeight, maxH);
        ta.style.height = target + 'px';
        ta.style.overflowY = ta.scrollHeight > maxH ? 'auto' : 'hidden';
      };
      ta.addEventListener('input', () => { resize(); send.disabled = ta.value.trim() === '' && !this.pendingImages.length; });
      // autocomplete de menções @ (registrado ANTES do keydown de envio p/ interceptar Enter)
      this._initMentions(ta);
      // também recalcula no resize da janela (limite 60vh muda)
      window.addEventListener('resize', resize);
      // inicializa com estado correto (evita scrollbar fantasma no carregamento)
      resize();
      ta.addEventListener('focus', () => {
        setTimeout(() => { ta.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 300);
      });
      // visualViewport: quando teclado virtual muda altura, mantém composer visível
      if (window.visualViewport) {
        let lastH = window.visualViewport.height;
        window.visualViewport.addEventListener('resize', () => {
          const curH = window.visualViewport.height;
          if (curH < lastH - 80 && document.activeElement === ta) {
            setTimeout(() => ta.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
          }
          lastH = curH;
        });
      }
      // pull-to-refresh nos messages (puxar topo recarrega)
      this._initPullToRefresh();
      ta.addEventListener('keydown', (e) => {
        const mod = e.ctrlKey || e.metaKey;
        if (mod && (e.key === 'b' || e.key === 'B')) { e.preventDefault(); this.applyFormat('bold'); }
        else if (mod && (e.key === 'i' || e.key === 'I')) { e.preventDefault(); this.applyFormat('italic'); }
        else if (mod && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); this.applyFormat('code'); }
        else if (mod && (e.key === 'l' || e.key === 'L')) { e.preventDefault(); this.applyFormat('checklist'); }
        else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendNote(); }
        else if (e.key === 'Enter' && e.shiftKey) {
          // Shift+Enter: quebra linha; se a linha atual é item de checklist ou bullet,
          // continua a lista na próxima linha
          e.preventDefault();
          const pos = ta.selectionStart;
          const lineStart = ta.value.lastIndexOf('\n', pos - 1) + 1;
          const curLine = ta.value.slice(lineStart, pos);
          let ins = '\n';
          const mChk = curLine.match(/^(\[x\]|\[ \])\s+/i);
          const mBul = curLine.match(/^(\s*)[-*]\s+/);
          if (mChk) ins = '\n[ ] ';
          else if (mBul) ins = '\n' + mBul[1] + '- ';
          ta.value = ta.value.slice(0, pos) + ins + ta.value.slice(ta.selectionEnd);
          ta.selectionStart = ta.selectionEnd = pos + ins.length;
          ta.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
      // barra de formatação
      document.querySelectorAll('.fmt-btn').forEach((b) => b.addEventListener('click', () => this.applyFormat(b.dataset.fmt)));
      send.addEventListener('click', () => this.sendNote());
      // anexos
      const attach = this.dom.btnAttach, fileInput = this.dom.fileInput, prev = this.dom.attachPreview;
      attach.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', () => {
        const f = fileInput.files && fileInput.files[0]; if (!f) return;
        if (f.size > 1.5 * 1024 * 1024) { alert('Imagem muito grande (máx 1.5 MB).'); fileInput.value = ''; return; }
        const reader = new FileReader();
        reader.onload = () => {
          this.pendingImages.push(reader.result);
          this.renderAttachPreview();
          send.disabled = false;
        };
        reader.readAsDataURL(f);
        fileInput.value = '';
      });
      this.attachPreview = prev;
      this.setupInfiniteScroll();
    },
    _initPullToRefresh() {
      const box = $('#messages'); if (!box) return;
      let startY = 0, pulling = false;
      box.addEventListener('touchstart', (e) => { if (box.scrollTop <= 2) startY = e.touches[0].clientY; }, { passive: true });
      box.addEventListener('touchmove', (e) => {
        if (!startY) return;
        const dy = e.touches[0].clientY - startY;
        if (dy > 70 && box.scrollTop <= 2) { pulling = true; box.style.transform = `translateY(${Math.min(36, (dy-70)/2.5)}px)`; box.style.transition = 'none'; }
      }, { passive: true });
      const reset = () => { box.style.transform = ''; box.style.transition = 'transform .2s ease'; startY = 0; };
      box.addEventListener('touchend', () => {
        if (pulling) { pulling = false; reset(); this.toast('Atualizando…', { kind: 'info' }); setTimeout(() => location.reload(), 300); return; }
        reset(); pulling = false;
      }, { passive: true });
      box.addEventListener('touchcancel', reset, { passive: true });
    },
    renderAttachPreview() {
      const prev = this.dom.attachPreview;
      if (!this.pendingImages.length) { prev.classList.add('hidden'); prev.innerHTML = ''; return; }
      prev.innerHTML = this.pendingImages.map((src, i) =>
        `<div class="attach-thumb"><img src="${src}" alt="anexo"/><button class="attach-rm" data-i="${i}" title="Remover">×</button></div>`
      ).join('');
      prev.classList.remove('hidden');
      prev.querySelectorAll('.attach-rm').forEach((b) => b.addEventListener('click', () => {
        this.pendingImages.splice(+b.dataset.i, 1); this.renderAttachPreview();
      }));
    },

    // ---------- Edição inline do título da conversa ----------
    bindThreadTitle() {
      const name = $('#chat-name');
      name.addEventListener('click', () => this.editThreadTitleInline());
      name.setAttribute('title', 'Clique para renomear');
      name.style.cursor = 'text';
    },

    // ---------- Drag & drop de threads no explorador ----------
    bindTreeDnd() {
      const tree = this.dom.tree;
      this._dragId = null; // { type:'thread'|'folder', id }
      const clearMarks = () => tree.querySelectorAll('.dnd-over,.dnd-over-folder').forEach((e) => e.classList.remove('dnd-over', 'dnd-over-folder'));

      tree.addEventListener('dragstart', (e) => {
        const node = e.target.closest('.tnode'); if (!node) return;
        if (node.dataset.tid) { this._dragId = { type: 'thread', id: node.dataset.tid }; e.dataTransfer.effectAllowed = 'move'; }
        else if (node.dataset.fid) { this._dragId = { type: 'folder', id: node.dataset.fid }; e.dataTransfer.effectAllowed = 'move'; }
        else return;
        node.classList.add('dnd-dragging');
        e.dataTransfer.setData('text/plain', this._dragId.id);
      });
      tree.addEventListener('dragend', () => {
        tree.querySelectorAll('.dnd-dragging').forEach((e) => e.classList.remove('dnd-dragging'));
        clearMarks();
      });
      tree.addEventListener('dragover', (e) => {
        if (!this._dragId) return;
        e.preventDefault();
        clearMarks();
        const folder = e.target.closest('.folder-node');
        const tnode = e.target.closest('.tnode:not(.folder-node)');
        if (folder && folder.dataset.fid !== this._dragId.id) folder.classList.add('dnd-over-folder');
        else if (tnode && tnode.dataset.tid && tnode.dataset.tid !== this._dragId.id) tnode.classList.add('dnd-over');
      });
      tree.addEventListener('drop', (e) => {
        if (!this._dragId) return;
        e.preventDefault();
        const folder = e.target.closest('.folder-node');
        const tnode = e.target.closest('.tnode:not(.folder-node)');
        clearMarks();
        const drag = this._dragId; this._dragId = null;

        // mover PASTA
        if (drag.type === 'folder') {
          // (reordenação de pastas é simplificada: não implementada nesta etapa)
          return;
        }
        // mover THREAD
        if (folder && folder.dataset.fid !== drag.id) {
          Store.moveThread(drag.id, folder.dataset.fid, null);
          this.setManualSort();
          Sync.send('thread:move', { threadId: drag.id, folderId: folder.dataset.fid, beforeId: null });
          this.renderTree();
          Sound.play('move');
        } else if (tnode && tnode.dataset.tid && tnode.dataset.tid !== drag.id) {
          const targetT = Store.getThread(tnode.dataset.tid);
          const r = tnode.getBoundingClientRect();
          const before = (e.clientY < r.top + r.height / 2);
          const beforeId = before ? tnode.dataset.tid : this.nextSiblingTid(tnode);
          Store.moveThread(drag.id, targetT.folderId || null, beforeId);
          this.setManualSort();
          Sync.send('thread:move', { threadId: drag.id, folderId: targetT.folderId || null, beforeId });
          this.renderTree();
          Sound.play('move');
        } else {
          // solto na raiz (área vazia da árvore)
          const onRoot = e.target === tree || e.target.classList.contains('tree');
          if (onRoot) {
            Store.moveThread(drag.id, null, null);
            this.setManualSort();
            Sync.send('thread:move', { threadId: drag.id, folderId: null, beforeId: null });
            this.renderTree();
            Sound.play('move');
          }
        }
      });
    },
    nextSiblingTid(node) {
      let sib = node.nextElementSibling;
      while (sib && (!sib.dataset || !sib.dataset.tid)) sib = sib.nextElementSibling;
      return sib ? sib.dataset.tid : null;
    },
    setManualSort() {
      Store.data.ui = Store.data.ui || {};
      Store.data.ui.sort = 'manual';
      Store.save();
      // atualiza UI de ordenação ativa no settings (se aberto)
      document.querySelectorAll('[data-set="sort"]').forEach((b) => b.classList.toggle('active', b.dataset.val === 'manual'));
    },
    editThreadTitleInline() {
      if (!this.activeThread) return;
      const t = Store.getThread(this.activeThread); if (!t) return;
      const el = $('#chat-name');
      if (el.isContentEditable) return;
      el.setAttribute('contenteditable', 'true');
      el.classList.add('editing');
      el.textContent = t.name;
      const sel = window.getSelection(); const range = document.createRange();
      range.selectNodeContents(el); range.collapse(false); sel.removeAllRanges(); sel.addRange(range);
      el.focus();
      const finish = (save) => {
        el.removeAttribute('contenteditable');
        el.classList.remove('editing');
        el.removeEventListener('keydown', onKey);
        el.removeEventListener('blur', onBlur);
        if (save) {
          const v = el.textContent.trim();
          if (v && v !== t.name) {
            t.name = v; t.updatedAt = now(); Store.upsertThread(t);
            Sync.send('thread:upsert', t); this.renderTree();
            Sound.play('rename');
          } else { el.textContent = t.name; }
        } else { el.textContent = t.name; }
      };
      const onKey = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      };
      const onBlur = () => finish(true);
      el.addEventListener('keydown', onKey);
      el.addEventListener('blur', onBlur);
    },

    // aplica markdown na seleção (ou insere marcadores) do composer
    applyFormat(kind) {
      const ta = $('#composer-input'); if (ta.disabled) return;
      const start = ta.selectionStart, end = ta.selectionEnd;
      const sel = ta.value.slice(start, end);
      const before = ta.value.slice(0, start), after = ta.value.slice(end);
      let wrap, placeholder;
      if (kind === 'bold') { wrap = '**'; placeholder = 'negrito'; }
      else if (kind === 'italic') { wrap = '*'; placeholder = 'itálico'; }
      else if (kind === 'code') { wrap = '`'; placeholder = 'código'; }
      else if (kind === 'checklist') {
        // checklist: prefixa cada linha com "[ ]" (toggle para [x] se já for checkbox)
        const inner = sel || '';
        let listed;
        const prefixChk = (l) => {
          if (/^\[x\]\s/i.test(l)) return l.replace(/^\[x\]\s/i, '[ ] ');
          if (/^\[\s?\]\s/.test(l)) return l; // já é checkbox
          return '[ ] ' + l;
        };
        if (inner) {
          listed = inner.split('\n').map(prefixChk).join('\n');
          ta.value = before + listed + after;
          ta.selectionStart = start; ta.selectionEnd = start + listed.length;
        } else {
          const lineStart = before.lastIndexOf('\n') + 1;
          const lineHead = before.slice(0, lineStart);
          const curLine = before.slice(lineStart);
          const newLine = prefixChk(curLine);
          ta.value = lineHead + newLine + after;
          // cursor no fim do texto digitado (ou após "[ ] " se linha vazia)
          ta.selectionStart = ta.selectionEnd = lineStart + newLine.length;
        }
        ta.focus(); ta.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      } else if (kind === 'list') {
        // lista: prefixa cada linha da seleção (ou insere "- " no cursor se vazio).
        const inner = sel || '';
        let listed;
        if (inner) {
          // seleção: prefixa cada linha
          const lines = inner.split('\n');
          listed = lines.map((l) => (l.startsWith('- ') ? l : '- ' + l)).join('\n');
          ta.value = before + listed + after;
          ta.selectionStart = start; ta.selectionEnd = start + listed.length;
        } else {
          // sem seleção: prefixa a linha atual (do início da linha até o cursor)
          const lineStart = before.lastIndexOf('\n') + 1;
          const lineHead = before.slice(0, lineStart);
          const lineText = after; // não usado — só para clareza
          const prefix = '- ';
          const newBefore = lineHead + prefix;
          ta.value = newBefore + before.slice(lineStart) + after;
          ta.selectionStart = start + prefix.length; ta.selectionEnd = end + prefix.length;
        }
        ta.focus(); ta.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      } else return;
      const inner = sel || placeholder;
      const text = before + wrap + inner + wrap + after;
      ta.value = text;
      // mantém a seleção sobre o conteúdo interno (ou posiciona no fim do placeholder)
      if (sel) { ta.selectionStart = start + wrap.length; ta.selectionEnd = start + wrap.length + inner.length; }
      else { ta.selectionStart = start + wrap.length; ta.selectionEnd = start + wrap.length + inner.length; }
      ta.focus();
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    },
    sendNote() {
      const ta = $('#composer-input');
      const text = ta.value.trim();
      if ((!text && !this.pendingImages.length) || !this.activeThread) return;
      const clientId = uid();
      const note = {
        clientId, threadId: this.activeThread, text,
        images: this.pendingImages.slice(), ts: now(),
        userId: Store.user ? Store.user.mail : 'anon', pending: true, local: true
      };
      Store.upsertNote(note);
      this.appendNoteRealtime(note);
      // limpa composer + anexos
      ta.value = ''; $('#btn-send').disabled = true;
      this.pendingImages = []; this.renderAttachPreview();
      // tenta enviar; independente do resultado, limpa o estado "enviando"
      // (modo offline-first: a nota já está salva localmente e será reconciliada no reconnect)
      Sync.send('note:upsert', Object.assign({}, note, { pending: false }));
      // marca como enviada localmente (remove o "enviando…" da tela)
      this.markSent(note.clientId);
      this.updateNoteCount();
      Sound.play('send'); haptic('light');
    },

    // remove o estado "enviando" da nota e da bolha
    markSent(clientId) {
      const arr = Store.notesFor(this.activeThread); const n = arr.find((x) => x.clientId === clientId);
      if (n && n.pending) { n.pending = false; Store.save(); }
      const el = document.querySelector(`.bubble[data-client-id="${clientId}"]`);
      if (el) {
        el.classList.remove('pending');
        const meta = el.querySelector('.meta'); if (meta) meta.textContent = fmtTime((n && n.ts) || now());
      }
    },

    appendNoteRealtime(n) {
      const box = $('#messages');
      $('#empty-state').classList.add('hidden');
      // echo guard: se a bolha já está no DOM (enviada por ESTE dispositivo), não duplica
      const existing = box.querySelector(`.bubble[data-client-id="${n.clientId}"]`);
      if (existing) { existing.classList.remove('pending'); return; }
      const el = this.bubbleEl(n);
      el.classList.add('just-sent');
      box.appendChild(el);
      box.scrollTop = box.scrollHeight;
      const meta = el.querySelector('.meta'); if (meta) meta.textContent = fmtTime(n.ts);
      el.classList.remove('pending');
      setTimeout(() => el.classList.remove('just-sent'), 320);
    },

    deleteNote(clientId) {
      if (!this.activeThread) return;
      const arr = Store.notesFor(this.activeThread);
      const n = arr.find((x) => x.clientId === clientId);
      Store.deleteNote(this.activeThread, clientId);
      Sync.send('note:delete', { threadId: this.activeThread, clientId });
      const el = document.querySelector(`.bubble[data-client-id="${clientId}"]`); if (el) el.remove();
      this.renderedClientIds.delete(clientId);
      this.updateNoteCount();
      // oferece desfazer (buffer em memória por 10s)
      if (n) {
        const backup = Object.assign({}, n);
        this._undoBuffer = { threadId: this.activeThread, note: backup, timer: null };
        const undo = () => {
          if (this._undoBuffer && this._undoBuffer.note === backup) this.undoDelete();
        };
        const t = setTimeout(() => { if (this._undoBuffer && this._undoBuffer.note === backup) this._undoBuffer = null; }, 10000);
        this._undoBuffer.timer = t;
        this.toast('Nota excluída', {
          kind: 'info',
          action: { label: 'Desfazer', fn: undo }
        });
      }
    },
    undoDelete() {
      if (!this._undoBuffer) return;
      const { threadId, note } = this._undoBuffer;
      this._undoBuffer = null;
      Store.upsertNote(note);
      Sync.send('note:upsert', Object.assign({}, note, { pending: false }));
      if (this.activeThread === threadId) {
        this.renderedClientIds.delete(note.clientId);
        this.renderMessages(true);
      }
      this.updateNoteCount();
      Sound.play('create');
    },

    // ---------- Sync integration ----------
    bindSync() {
      Sync.on('snapshot', (db) => {
        if (db.threads) Object.values(db.threads).forEach((t) => Store.upsertThread(t));
        if (db.folders) Object.values(db.folders).forEach((f) => Store.upsertFolder(f));
        if (db.notes) Object.entries(db.notes).forEach(([tid, arr]) => arr.forEach((n) => Store.upsertNote(n)));
        this.renderTree();
        if (this.activeThread) { this.oldestTs = null; this.renderMessages(true); this.updatePinButton(); }
      });
      Sync.on('note:upsert', (n) => {
        // o servidor já exclui o remetente, então qualquer evento aqui veio de OUTRO dispositivo
        Store.upsertNote(n);
        if (this.activeThread === n.threadId) this.appendNoteRealtime(n);
        this.updateNoteCount();
        const th = Store.getThread(n.threadId);
        this.toast(`Nova nota em "${th ? th.name : 'conversa'}"`, { kind: 'success' });
      });
      Sync.on('note:edit', ({ threadId, clientId, text, edited, editedAt, rev }) => {
        const arr = Store.notesFor(threadId); const n = arr.find((x) => x.clientId === clientId); if (!n) return;
        // resolução de conflito: last-write-wins por timestamp (editado mais recente vence).
        // em empate, desempata pelo contador de revisão (rev) — quem editou "depois" tem rev maior.
        const incoming = editedAt || 0, local = n.editedAt || 0;
        const incomingRev = rev || 0, localRev = n.rev || 0;
        if (incoming < local || (incoming === local && incomingRev <= localRev)) return; // mantém o local
        n.text = text; n.edited = edited; n.editedAt = editedAt; n.rev = incomingRev; Store.save();
        if (this.activeThread === threadId) this._replaceBubble(clientId, n);
      });
      Sync.on('note:tags', ({ threadId, clientId, tags }) => {
        const arr = Store.notesFor(threadId); const n = arr.find((x) => x.clientId === clientId); if (!n) return;
        n.tags = tags || []; Store.save();
        if (this.activeThread === threadId) this._replaceBubble(clientId, n);
      });
      Sync.on('note:pin', ({ threadId, clientId }) => {
        const th = Store.getThread(threadId); if (!th) return;
        const wasPinned = (th.pinnedId === clientId);
        th.pinnedId = wasPinned ? null : clientId; Store.save();
        if (this.activeThread === threadId) {
          this.renderedClientIds = new Set(); this.renderMessages(true); this.updatePinButton();
        }
        // notifica em ambos os casos (fixou / desfixou)
        this.toast(wasPinned ? `Nota desfixada em "${th.name}"` : `Nota fixada em "${th.name}"`, { kind: 'pin' });
      });
      Sync.on('note:reorder', ({ threadId, order }) => {
        const arr = Store.notesFor(threadId); if (!arr || !order) return;
        order.forEach(({ clientId, sortOrder }) => {
          const n = arr.find((x) => x.clientId === clientId); if (n) n.sortOrder = sortOrder;
        });
        // re-renderiza na nova ordem
        if (this.activeThread === threadId) {
          this.oldestTs = null; this.renderedClientIds = new Set(); this.renderMessages(true);
        }
      });
      Sync.on('note:delete', ({ threadId, clientId }) => { Store.deleteNote(threadId, clientId); const el = document.querySelector(`.bubble[data-client-id="${clientId}"]`); if (el) el.remove(); this.renderedClientIds.delete(clientId); if (this.activeThread === threadId) this.updatePinButton(); });
      Sync.on('thread:upsert', (t) => {
        const isNew = !Store.data.threads[t.id];
        Store.upsertThread(t); this.queueRenderTree();
        if (this.activeThread === t.id) this.updatePinButton();
        if (isNew) this.toast(`Nova conversa: "${t.name}"`);
      });
      Sync.on('thread:delete', ({ id }) => { delete Store.data.threads[id]; delete Store.data.notes[id]; Store.save(); this.queueRenderTree(); });
      Sync.on('folder:upsert', (f) => { Store.upsertFolder(f); this.queueRenderTree(); });
      Sync.on('folder:delete', ({ id }) => { Store.deleteFolder(id, false); this.queueRenderTree(); });
      Sync.on('thread:move', ({ threadId, folderId, beforeId }) => {
        Store.moveThread(threadId, folderId || null, beforeId || null);
        this.setManualSort();
        this.queueRenderTree();
      });
    },
  };

  // mescla os grupos de métodos extraídos
  Object.assign(UI, PickerMethods, NavigationMethods, MessagesMethods, MentionMethods, ReminderMethods);

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
                UI.toast('Nova versão disponível', {
                  kind: 'info',
                  duration: 8000,
                  action: { label: 'Recarregar', fn: () => location.reload() }
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
  }
})();

