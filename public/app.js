/* =====================================================================
 * NoteThread — App client (v2)
 * Novidades:
 *   - Árvore estilo IDE no menu lateral (pastas expansíveis/recolhíveis).
 *   - Favoritos: threads fixadas no topo (seção dedicada).
 *   - Pastas podem conter threads (ou subpastas, opcional).
 *   - Criar pasta, renomear, mover, favoritar, excluir via menu de contexto.
 * Arquitetura base (offline-first + real-time sync) mantida da v1.
 * ===================================================================== */

(() => {
  'use strict';

  const PAGE_SIZE = 25;

  // ---------------------------------------------------------------------
  // CONFIGURAÇÃO DE SINCRONIZAÇÃO
  // `SYNC_URL` define onde o websocket de sync deve se conectar.
  //  - Vazio (default): usa o host que serviu a página + porta 3001.
  //    (funciona quando rodando em localhost / na LAN via npm start)
  //  - No APK (Capacitor) ou em produção, defina explicitamente a URL,
  //    ex.: 'wss://notethread.meu-servidor.com' (sem barra no final).
  // Prioridade: window.NOTE_THREAD_SYNC_URL > constantes abaixo > auto.
  const SYNC_URL =
    (typeof window !== 'undefined' && window.NOTE_THREAD_SYNC_URL) ||
    // mesma origem: usa o mesmo host/porta que serviu a página (funciona em
    // localhost, na LAN e em produção com um único servidor + HTTPS)
    ((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  // ---------------------------------------------------------------------

  // helper para feedback tátil (mobile)
  function haptic(type) {
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

  // ---------- Util ----------
  const $ = (s) => document.querySelector(s);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtTime = (ts) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const now = () => Date.now();

  // ---------- Ícones SVG customizados ----------
  const SVG = (p, fill) => `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="${fill || 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const ICON = {
    plus: SVG('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
    folder: SVG('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
    bubble: SVG('<path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 9 9 0 0 1-4-1L3 20l1.5-5.5a8.5 8.5 0 1 1 16.5-3z"/>'),
    chevron: SVG('<polyline points="6 9 12 15 18 9"/>'),
    star: SVG('<polygon points="12 2 15 9 22 9.3 17 14 18.5 21 12 17 5.5 21 7 14 2 9.3 9 9"/>'),
    pin: '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor" stroke="none"><path d="M12 2 C9.5 2 8 4 8 6.5 c0 1.6 .7 2.7 1.6 3.6 L6 17.5 a1 1 0 0 0 .9 1.5 h10.2 a1 1 0 0 0 .9-1.5 L14.4 10.1 c.9-.9 1.6-2 1.6-3.6 C16 4 14.5 2 12 2 z"/></svg>',
    pencil: SVG('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
    trash: SVG('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>'),
    arrowDownRight: SVG('<line x1="7" y1="7" x2="17" y2="17"/><polyline points="17 7 17 17 7 17"/>'),
    pinOff: SVG('<path d="M9 4h6l-1 7 4 3v2H6l4-3-1-7z"/><line x1="12" y1="16" x2="12" y2="21"/><line x1="3" y1="3" x2="21" y2="21"/>'),
    move: SVG('<polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/>'),
    logout: SVG('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>'),
  };
  const wrapSvg = (svg, size) => `<span class="svg-ic" style="width:${size || 16}px;height:${size || 16}px;display:inline-block">${svg}</span>`;

  // Renderiza markdown básico e SEGURO (escapa HTML primeiro, depois aplica).
  // Suporta: **negrito**, *itálico*, `código`, #tags (mantidas como chip),
  // listas (- ou * por linha), e quebras de linha. Não faz HTML cru passar.
  const renderMarkdown = (raw) => {
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
    // 5) #tags NÃO são convertidas aqui — são renderizadas em bloco separado (.bubble-tags) no bubbleEl
    // 6) listas: linhas começando com - ou *
    const lines = s.split('\n');
    let html = '', inList = false;
    for (const line of lines) {
      const m = line.match(/^(\s*)[-*]\s+(.*)$/);
      if (m) {
        if (!inList) { html += '<ul class="md-list">'; inList = true; }
        html += `<li>${m[2]}</li>`;
      } else {
        if (inList) { html += '</ul>'; inList = false; }
        html += line + '<br/>';
      }
    }
    if (inList) html += '</ul>';
    // remove <br/> solitário no final
    html = html.replace(/<br\/>\s*$/, '');
    return html;
  };

  // Sons sintetizados via cuelume (Web Audio, ESM-only, carregado por CDN).
  // Repositório: https://github.com/Danilaa1/cuelume  (MIT, zero deps)
  const CUELUME_SOUNDS = [
    'chime', 'sparkle', 'droplet', 'bloom', 'whisper', 'tick', 'press',
    'release', 'toggle', 'success', 'error', 'page', 'loading', 'ready',
    'pulse', 'scan', 'arrival', 'copy'
  ];
  const Sound = {
    lib: null,
    ready: false,
    loadPromise: null,
    load() {
      if (this.loadPromise) return this.loadPromise;
      this.loadPromise = import('https://esm.sh/cuelume@latest')
        .then((m) => { this.lib = m; this.ready = true; this.apply(); })
        .catch((err) => { console.warn('[cuelume] falha ao carregar sons:', err); });
      return this.loadPromise;
    },
    // aplica estado (ligado/desligado + volume) a partir do Store
    apply() {
      if (!this.lib) return;
      const s = (Store.data && Store.data.ui && Store.data.ui.sounds) || {};
      try { this.lib.setEnabled(!!s.enabled); } catch {}
      try { this.lib.setVolume(typeof s.volume === 'number' ? s.volume : 0.6); } catch {}
    },
    play(action) {
      if (!this.lib || !this.ready) return;
      const s = (Store.data && Store.data.ui && Store.data.ui.sounds) || {};
      if (!s.enabled) return;
      const name = s.map && s.map[action];
      if (!name) return;
      try { this.lib.play(name, { volume: typeof s.volume === 'number' ? s.volume : 0.6 }); } catch (e) { /* noop */ }
    }
  };

  // ===================================================================
  // STORE (offline-first, localStorage)
  // data: { user, threads:{}, folders:{}, notes:{}, ui:{expanded:{}} }
  // thread: { id, name, emoji, folderId|null, favorite:bool, createdAt, updatedAt, lastPreview }
  // folder: { id, name, parentId|null, createdAt }
  // ===================================================================
  const Store = {
    KEY: 'notethread.v2',
    data: null,

    load() {
      let d = { user: null, threads: {}, folders: {}, notes: {}, ui: { expanded: {} } };
      try { const raw = localStorage.getItem(this.KEY); if (raw) d = Object.assign(d, JSON.parse(raw)); } catch (e) {}
      d.threads = d.threads || {}; d.folders = d.folders || {}; d.notes = d.notes || {};
      d.ui = d.ui || {}; d.ui.expanded = d.ui.expanded || {};
      // sons padrão para novos usuários (mapeamento de ação -> som cuelume)
      const defaultSounds = { enabled: false, volume: 0.6, map: {
        send: 'scan', pin: 'bloom', favorite: 'sparkle', delete: 'pulse', create: 'bloom', error: 'error', open: 'tick'
      } };
      d.ui.sounds = d.ui.sounds || defaultSounds;
      d.ui.theme = d.ui.theme || 'lavender';
      // migração: limpa flag "pending" de notas antigas (dados de versões anteriores)
      let migrated = false;
      Object.values(d.notes).forEach((arr) => arr.forEach((n) => { if (n.pending) { n.pending = false; migrated = true; } }));
      this.data = d;
      if (migrated) this.save();
      return d;
    },
    save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) {} },
    setUser(u) { this.data.user = u; this.save(); },
    get user() { return this.data.user; },

    // userId estável por dispositivo — usado para isolar dados no sync server.
    // Em produção, trocar pelo ID real do usuário autenticado (OAuth).
    getUserId() {
      if (!this.data.userId) {
        this.data.userId = (crypto.randomUUID ? crypto.randomUUID() : 'u-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
        this.save();
      }
      return this.data.userId;
    },

    // ---- folders ----
    folderList() { return Object.values(this.data.folders).sort((a, b) => a.name.localeCompare(b.name)); },
    getFolder(id) { return this.data.folders[id]; },
    upsertFolder(f) { this.data.folders[f.id] = Object.assign(this.data.folders[f.id] || {}, f); this.save(); },
    deleteFolder(id, recursive) {
      const del = (fid) => {
        Object.values(this.data.threads).forEach((t) => { if (t.folderId === fid) { if (recursive) delete this.data.threads[t.id]; else t.folderId = null; } });
        Object.values(this.data.folders).forEach((f) => { if (f.parentId === fid) del(f.id); });
        delete this.data.folders[fid];
        delete this.data.ui.expanded[fid];
      };
      del(id); this.save();
    },
    isExpanded(id) { return this.data.ui.expanded[id] !== false; }, // pastas abertas por padrão
    setExpanded(id, v) { this.data.ui.expanded[id] = v; this.save(); },

    // ---- threads ----
    threadList() { return Object.values(this.data.threads); },
    getThread(id) { return this.data.threads[id]; },
    upsertThread(t) { this.data.threads[t.id] = Object.assign(this.data.threads[t.id] || {}, t); this.save(); },
    favoriteCount() { return this.threadList().filter((t) => t.favorite).length; },
    // move uma thread para outra pasta (ou raiz) e a posiciona antes de `beforeId` (ou no fim)
    moveThread(threadId, targetFolderId, beforeId) {
      const t = this.data.threads[threadId]; if (!t) return;
      t.folderId = targetFolderId || null;
      t.updatedAt = now();
      // recalcula ordem das threads irmãs (mesmo folderId)
      const siblings = this.threadList().filter((x) => x.id !== threadId && (x.folderId || null) === (targetFolderId || null));
      if (beforeId) {
        const idx = siblings.findIndex((x) => x.id === beforeId);
        if (idx >= 0) siblings.splice(idx, 0, t); else siblings.push(t);
      } else {
        siblings.push(t);
      }
      siblings.forEach((x, i) => { x.order = i; });
      if (!siblings.includes(t)) t.order = siblings.length;
      this.save();
    },

    // ---- notes ----
    notesFor(threadId) { return this.data.notes[threadId] || []; },
    upsertNote(n) {
      this.data.notes[n.threadId] = this.data.notes[n.threadId] || [];
      const arr = this.data.notes[n.threadId];
      const i = arr.findIndex((x) => x.clientId === n.clientId);
      if (i >= 0) arr[i] = Object.assign({}, arr[i], n); else { arr.push(n); arr.sort((a, b) => (a.sortOrder || a.ts) - (b.sortOrder || b.ts)); }
      // garantir sortOrder em notas antigas
      arr.forEach((x, idx) => { if (x.sortOrder == null) x.sortOrder = idx; });
      const th = this.data.threads[n.threadId];
      if (th) { th.updatedAt = n.ts; th.lastPreview = n.text.slice(0, 60); }
      this.save();
    },
    deleteNote(threadId, clientId) {
      if (!this.data.notes[threadId]) return;
      this.data.notes[threadId] = this.data.notes[threadId].filter((x) => x.clientId !== clientId);
      // se a nota pinada foi excluída, limpar pin
      const th = this.data.threads[threadId];
      if (th && th.pinnedId === clientId) th.pinnedId = null;
      this.save();
    },
    editNote(threadId, clientId, newText) {
      const arr = this.data.notes[threadId]; if (!arr) return null;
      const n = arr.find((x) => x.clientId === clientId); if (!n) return null;
      n.text = newText; n.edited = true;
      n.editedAt = Date.now();
      n.rev = (n.rev || 0) + 1; // contador de revisões para desempate de conflito
      const th = this.data.threads[threadId];
      if (th) th.lastPreview = newText.slice(0, 60);
      this.save(); return n;
    },
    setPinned(threadId, clientId) {
      const th = this.data.threads[threadId]; if (!th) return;
      th.pinnedId = (th.pinnedId === clientId) ? null : clientId;
      this.save(); return th.pinnedId;
    },
    setTags(threadId, clientId, tags) {
      const arr = this.data.notes[threadId]; if (!arr) return;
      const n = arr.find((x) => x.clientId === clientId); if (!n) return null;
      n.tags = tags.filter(Boolean).map((t) => t.trim().replace(/^#/, '').slice(0, 24));
      this.save(); return n;
    },
    getPinned(threadId) {
      const th = this.data.threads[threadId]; if (!th || !th.pinnedId) return null;
      const arr = this.data.notes[threadId] || [];
      return arr.find((x) => x.clientId === th.pinnedId) || null;
    },
    reorderNote(threadId, clientId, newIndex) {
      const arr = this.data.notes[threadId]; if (!arr) return;
      const idx = arr.findIndex((x) => x.clientId === clientId); if (idx < 0) return;
      const [n] = arr.splice(idx, 1);
      arr.splice(Math.max(0, Math.min(newIndex, arr.length)), 0, n);
      // reatribuir sortOrder
      arr.forEach((x, i) => { x.sortOrder = i; });
      this.save();
    },
    pageNotes(threadId, beforeTs, count) {
      // ordem por sortOrder (drag) ou ts (criação) como fallback
      const all = this.notesFor(threadId).slice().sort((a, b) => {
        const ao = a.sortOrder != null ? a.sortOrder : a.ts;
        const bo = b.sortOrder != null ? b.sortOrder : b.ts;
        return ao - bo;
      });
      const ref = all[0] && all[0].sortOrder != null;
      const key = (x) => ref ? x.sortOrder : x.ts;
      const beforeKey = beforeTs == null ? null : beforeTs;
      const idx = beforeKey == null ? all.length : all.findIndex((x) => key(x) >= beforeKey);
      const end = idx < 0 ? all.length : idx;
      const start = Math.max(0, end - count);
      return { items: all.slice(start, end), hasMore: start > 0 };
    },
  };

  // ===================================================================
  // SYNC (real-time, WebSocket + fallback)
  // ===================================================================
  const Sync = {
    ws: null, connected: false, handlers: {}, reconnectTimer: null, lastSync: 0,
    url: SYNC_URL,
    on(type, fn) { this.handlers[type] = fn; },
    emit(type, payload) { this.lastSync = Date.now(); if (this.handlers[type]) this.handlers[type](payload); },
    connect() {
      this.setStatus('connecting');
      try { this.ws = new WebSocket(this.url); } catch (e) { this.scheduleReconnect(); return; }
      this.ws.onopen = () => {
        this.connected = true; this.setStatus('online');
        // identifica este dispositivo/usuário para o servidor isolar os dados
        // - se logado: usa o e-mail (mesma conta partilha os dados entre aparelhos)
        // - se anônimo: usa um UUID por dispositivo (anexo isolado)
        this.send('hello', { userId: Store.user ? Store.user.mail : Store.getUserId() });
        this.flushPending();
      };
      this.flushPending = () => {
        // reenvia notas que ficaram pendentes (criadas offline) para o servidor
        const all = Store.data.notes || {};
        Object.entries(all).forEach(([tid, arr]) => arr.forEach((n) => {
          if (n.pending) this.send('note:upsert', Object.assign({}, n, { pending: false }));
        }));
      };
      this.ws.onmessage = (ev) => {
        let msg; try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.type === 'snapshot') this.emit('snapshot', msg.payload);
        else this.emit(msg.type, msg.payload);
      };
      this.ws.onclose = () => { this.connected = false; this.setStatus('offline'); this.scheduleReconnect(); };
      this.ws.onerror = () => { try { Sound.play('error'); haptic('error'); } catch {} try { this.ws.close(); } catch {} };
    },
    scheduleReconnect() { if (this.reconnectTimer) return; this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.connect(); }, 2500); },
    send(type, payload) { if (this.ws && this.connected && this.ws.readyState === 1) { this.lastSync = Date.now(); this.ws.send(JSON.stringify({ type, payload })); } },
    setStatus(s) {
      const el = $('#sync-status'); if (!el) return;
      el.className = 'sync-status ' + s;
      el.dataset.state = s;
      el.dataset.status = s === 'online' ? 'Sincronizado' : s === 'connecting' ? 'Conectando…' : 'Offline — suas notas ficam salvas neste dispositivo';
      // garante que o conteúdo do botão seja apenas o ícone: remove qualquer
      // texto residual que possa ter ficado de versões antigas do app/cache.
      while (el.firstChild) el.removeChild(el.firstChild);
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('width', '14');
      svg.setAttribute('height', '14');
      svg.setAttribute('fill', 'currentColor');
      const circle = document.createElementNS(NS, 'circle');
      circle.setAttribute('cx', '12');
      circle.setAttribute('cy', '12');
      circle.setAttribute('r', '7');
      svg.appendChild(circle);
      el.appendChild(svg);
      if (UI && UI.updateSyncLabel) UI.updateSyncLabel();
    },
  };

  // ===================================================================
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

    init() {
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

    // ---------- Busca ----------
    bindSearch() {
      const input = this.dom.searchInput, clear = this.dom.searchClear, results = this.dom.searchResults;
      const run = () => this.runSearch(input.value.trim(), results, clear);
      input.addEventListener('input', run);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { input.value = ''; run(); input.blur(); }
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const items = Array.from(results.querySelectorAll('.search-result'));
          if (!items.length) return;
          const cur = items.indexOf(document.activeElement);
          let next = e.key === 'ArrowDown' ? cur + 1 : cur - 1;
          if (next < 0) next = items.length - 1; if (next >= items.length) next = 0;
          items[next].focus();
        } else if (e.key === 'Enter') {
          const first = results.querySelector('.search-result'); if (first) first.click();
        }
      });
      clear.addEventListener('click', () => { input.value = ''; input.focus(); run(); });
      // fecha resultados ao clicar fora
      document.addEventListener('click', (e) => {
        if (!results.classList.contains('hidden') && !results.contains(e.target) && e.target !== input && e.target !== clear) {
          results.classList.add('hidden');
        }
      });
    },
    runSearch(q, results, clear) {
      if (!q) { this._searchShowAll = false; results.classList.add('hidden'); results.innerHTML = ''; clear.classList.add('hidden'); return; }
      clear.classList.remove('hidden');
      const ql = q.toLowerCase();
      // notas
      const hits = [];
      const tagQ = ql.startsWith('#') ? ql.slice(1) : ql; // busca por #tag
      Object.entries(Store.data.notes).forEach(([tid, arr]) => {
        const th = Store.getThread(tid); if (!th) return;
        arr.forEach((n) => {
          const inText = n.text && n.text.toLowerCase().includes(ql);
          const inTag = n.tags && n.tags.some((t) => t.toLowerCase().includes(tagQ));
          if (inText || inTag) hits.push({ tid, th, n });
        });
      });
      // threads (por nome)
      Store.threadList().forEach((th) => {
        if (th.name && th.name.toLowerCase().includes(ql)) hits.push({ tid: th.id, th, n: null });
      });
      // ordena: nota mais recente primeiro
      hits.sort((a, b) => (b.n ? b.n.ts : 0) - (a.n ? a.n.ts : 0));
      if (!hits.length) {
        results.innerHTML = '<div class="sr-empty">Nenhum resultado para "' + esc(q) + '"</div>';
        results.classList.remove('hidden');
        return;
      }
      const max = 30;
      const showAll = this._searchShowAll;
      const visible = showAll ? hits : hits.slice(0, max);
      const extra = hits.length - visible.length;
      const itemHtml = visible.map((h) => {
        if (h.n) {
          const idx = h.n.text.toLowerCase().indexOf(ql);
          const start = Math.max(0, idx - 24);
          const snippet = (start > 0 ? '…' : '') + h.n.text.slice(start, start + 80);
          return `<button class="search-result" data-tid="${h.tid}" data-cid="${h.n.clientId}">
            <div class="sr-thread">${wrapSvg(ICON.bubble, 13)} ${esc(h.th.name || 'Sem título')}</div>
            <div class="sr-text">${esc(snippet).replace(new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>')}</div>
            <div class="sr-meta">${fmtTime(h.n.ts)}${h.n.edited ? ' · editada' : ''}</div>
          </button>`;
        }
        return `<button class="search-result" data-tid="${h.tid}">
          <div class="sr-thread">${wrapSvg(ICON.bubble, 13)} ${esc(h.th.name || 'Sem título')}</div>
          <div class="sr-meta">Conversa</div>
        </button>`;
      }).join('');
      const extraHtml = (extra > 0)
        ? `<button class="search-more" id="sr-more">+${extra} resultado${extra !== 1 ? 's' : ''} — mostrar tudo</button>`
        : '';
      const countHtml = `<div class="sr-count">${hits.length} resultado${hits.length !== 1 ? 's' : ''}</div>`;
      results.innerHTML = countHtml + itemHtml + extraHtml;
      results.querySelectorAll('.search-result').forEach((b) => b.addEventListener('click', () => {
        const tid = b.dataset.tid, cid = b.dataset.cid;
        results.classList.add('hidden');
        this.openThread(tid);
        if (cid) setTimeout(() => this.scrollToNote(cid), 250);
      }));
      const moreBtn = results.querySelector('#sr-more');
      if (moreBtn) moreBtn.addEventListener('click', () => { this._searchShowAll = true; this.runSearch(q, results, clear); });
      results.classList.remove('hidden');
    },
    scrollToNote(cid) {
      // garante que a nota está renderizada (carrega páginas antigas se preciso)
      const el = document.querySelector(`.bubble[data-client-id="${cid}"]`);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); return; }
      // não está na tela: pagina até encontrar
      let guard = 0;
      const tryMore = () => {
        const found = document.querySelector(`.bubble[data-client-id="${cid}"]`);
        if (found) { found.scrollIntoView({ behavior: 'smooth', block: 'center' }); found.classList.remove('flash'); void found.offsetWidth; found.classList.add('flash'); return; }
        if (guard++ > 20) return;
        const { hasMore } = Store.pageNotes(this.activeThread, this.oldestTs, 25);
        if (hasMore) { this.oldestTs = Store.notesFor(this.activeThread).slice(-1)[0] ? this.oldestTs : this.oldestTs; this.renderMessages(true); setTimeout(tryMore, 60); }
      };
      tryMore();
    },

    // ---------- Atalhos de teclado ----------
    bindShortcuts() {
      document.addEventListener('keydown', (e) => {
        const tag = (e.target.tagName || '').toLowerCase();
        const typing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
        const mod = e.ctrlKey || e.metaKey;

        // Ctrl/Cmd+K → foca a busca (mesmo digitando, rouba o foco)
        if (mod && e.key.toLowerCase() === 'k') {
          e.preventDefault();
          const s = this.dom.searchInput; if (s) { s.focus(); s.select(); }
          return;
        }
        // Ctrl/Cmd+N → nova conversa
        if (mod && e.key.toLowerCase() === 'n' && !e.shiftKey) {
          e.preventDefault(); if (Store.user) this.createThread(); return;
        }
        // Ctrl/Cmd+Shift+F → nova pasta
        if (mod && e.shiftKey && e.key.toLowerCase() === 'f') {
          e.preventDefault(); if (Store.user) this.createFolder(); return;
        }
        // Ctrl/Cmd+[ e Ctrl/Cmd+] → conversa anterior/próxima na sidebar
        if (mod && !e.shiftKey && (e.key === '[' || e.key === ']')) {
          e.preventDefault(); this.navThreads(e.key === ']' ? 1 : -1); return;
        }
        // ? → painel de atalhos (fora de input)
        if (e.key === '?' && !typing) {
          e.preventDefault(); this.showShortcutsHelp(); return;
        }
        // Esc → fecha popovers/modal abertos
        if (e.key === 'Escape') {
          ['msgPopover', 'pinPopover', 'settingsPopover', 'searchResults'].forEach((k) => {
            if (this.dom[k]) this.dom[k].classList.add('hidden');
          });
          if (this.dom.ctx) this.dom.ctx.classList.add('hidden');
          if (this.dom.modal && !this.dom.modal.classList.contains('hidden')) this.closeModal();
        }
      });
    },
    // navega entre as conversas visíveis na sidebar (favoritas + soltas + dentro de pastas)
    navThreads(dir) {
      const els = Array.from(document.querySelectorAll('.tnode')).filter((el) => !el.classList.contains('children') && el.dataset && el.dataset.tid);
      if (!els.length) return;
      const ids = els.map((el) => el.dataset.tid);
      let idx = this.activeThread ? ids.indexOf(this.activeThread) : -1;
      idx = (idx + dir + ids.length) % ids.length;
      const next = ids[idx];
      if (next) { this.openThread(next); els.find((el) => el.dataset.tid === next).scrollIntoView({ block: 'nearest' }); }
    },
    showShortcutsHelp() {
      const rows = [
        ['Ctrl/⌘ + K', 'Buscar notas e conversas'],
        ['Ctrl/⌘ + N', 'Nova conversa'],
        ['Ctrl/⌘ + Shift + F', 'Nova pasta'],
        ['Ctrl/⌘ + [ / ]', 'Conversa anterior / próxima'],
        ['Enter', 'Enviar nota (no composer)'],
        ['Shift + Enter', 'Quebra de linha (no composer)'],
        ['Esc', 'Fechar popovers / modal'],
        ['?', 'Abrir este painel'],
      ];
      const body = '<div style="display:flex;flex-direction:column;gap:8px">' + rows.map(([k, v]) =>
        `<div style="display:flex;justify-content:space-between;gap:16px;font-size:14px"><span style="font-weight:700;color:var(--accent)">${k}</span><span style="color:var(--text-dim)">${v}</span></div>`
      ).join('') + '</div>';
      this.showModal('Atalhos de teclado', body, () => this.closeModal());
    },

    // ---------- Swipe (mobile) ----------
    bindSwipe() {
      let sx = 0, sy = 0, st = 0;
      const app = $('#app');
      const SWIPE_THRESH = 60; // px mínimo para considerar swipe
      const SWIPE_TIME = 400;  // ms máximo para considerar swipe rápido
      const VERTICAL_SLOP = 80; // tolerância vertical

      document.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        sx = t.clientX; sy = t.clientY; st = Date.now();
      }, { passive: true });

      document.addEventListener('touchend', (e) => {
        if (!sx && !sy) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - sx;
        const dy = t.clientY - sy;
        const dt = Date.now() - st;
        sx = sy = st = 0;

        if (dt > SWIPE_TIME || Math.abs(dy) > VERTICAL_SLOP) return;

        // Swipe da esquerda para direita (mostra sidebar) — quando no chat
        if (dx > SWIPE_THRESH && app.classList.contains('show-chat')) {
          app.classList.remove('show-chat');
        }
        // Swipe da direita para esquerda (esconde sidebar) — quando na sidebar
        else if (dx < -SWIPE_THRESH && !app.classList.contains('show-chat')) {
          app.classList.add('show-chat');
        }
      }, { passive: true });
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
    bindAuth() {
      $('#btn-google').addEventListener('click', () => {
        Store.setUser({ name: 'Google User', mail: 'voce@gmail.com', provider: 'google' });
        this.renderAuthOrApp();
      });
      $('#email-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const mail = $('#email-input').value.trim();
        if (!mail) return;
        Store.setUser({ name: mail.split('@')[0], mail, provider: 'email' });
        this.renderAuthOrApp();
      });
      $('#btn-logout').addEventListener('click', () => { Store.setUser(null); this.renderAuthOrApp(); });
    },

    renderAuthOrApp() {
      if (Store.user) {
        $('#auth-screen').classList.add('hidden');
        $('#app').classList.remove('hidden');
        this.renderMe();
        this.renderTree();
        Sync.connect();
        // garante que o chat UI comece oculto até o usuário selecionar uma thread
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
      const EMOJIS = ['💬', '💡', '📝', '📚', '🎯', '🔥', '🌱', '⭐', '🧠', '💼', '🏡', '🎨'];
      const opts = EMOJIS.map((e) => `<button type="button" class="emoji-opt" data-emoji="${e}">${e}</button>`).join('');
      const body = `
        <label style="display:block;font-size:13px;color:var(--text-dim);margin-bottom:6px;font-weight:600">Nome da conversa</label>
        <input id="nt-name" type="text" placeholder="ex: Ideias de Projetos, Tarefas Diárias…" autofocus />
        <label style="display:block;font-size:13px;color:var(--text-dim);margin:14px 0 6px;font-weight:600">Ícone</label>
        <div id="nt-emojis" class="emoji-grid">${opts}</div>`;
      let chosen = '💬';
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
      // seleção de emoji
      const grid = $('#nt-emojis');
      grid.querySelectorAll('.emoji-opt').forEach((b) => b.addEventListener('click', () => {
        grid.querySelectorAll('.emoji-opt').forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel'); chosen = b.dataset.emoji;
      }));
      grid.querySelector('.emoji-opt').classList.add('sel');
      setTimeout(() => $('#nt-name') && $('#nt-name').focus(), 50);
    },

    createFolder() {
      const ICONS = ['📁', '📂', '📚', '🗂️', '🗃️', '📦', '🎯', '💡', '🔒', '🌟', '🏷️', '🧩'];
      const opts = ICONS.map((e) => `<button type="button" class="emoji-opt" data-emoji="${e}">${e}</button>`).join('');
      const body = `
        <label style="display:block;font-size:13px;color:var(--text-dim);margin-bottom:6px;font-weight:600">Nome da pasta</label>
        <input id="nf-name" type="text" placeholder="ex: Trabalho, Pessoal, Estudos…" autofocus />
        <label style="display:block;font-size:13px;color:var(--text-dim);margin:14px 0 6px;font-weight:600">Ícone</label>
        <div id="nf-emojis" class="emoji-grid">${opts}</div>`;
      let chosen = '📁';
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
      const grid = $('#nf-emojis');
      grid.querySelectorAll('.emoji-opt').forEach((b) => b.addEventListener('click', () => {
        grid.querySelectorAll('.emoji-opt').forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel'); chosen = b.dataset.emoji;
      }));
      grid.querySelector('.emoji-opt').classList.add('sel');
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
      el.innerHTML = `<span class="twist" style="visibility:hidden">${wrapSvg(ICON.chevron, 10)}</span>
                      <span class="ico">${ic}</span>
                      <span class="label">${esc(t.name)}</span>
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

    // atualiza a contagem de notas na sidebar (re-render leve da árvore)
    updateNoteCount() {
      this.renderTree();
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

    // ---------- Threads: abrir / mensagens ----------
    openThread(id) {
      if (this.activeThread === id) return; // evita re-tocar som ao reabrir a mesma
      this.activeThread = id;
      this.renderedClientIds = new Set();
      this.oldestTs = null; this.loading = false;
      Sound.play('open');
      $('#app').classList.add('show-chat');
      const t = Store.getThread(id);
      $('#chat-name').textContent = t ? t.name : 'Conversa';
      $('#composer-input').disabled = false; $('#btn-send').disabled = false;
      this.dom.pinPopover.classList.add('hidden');
      this.updatePinButton();
      this.renderTree();
      this.renderMessages(true);
      this.setChatActiveUi(true);
    },
    setChatActiveUi(show) {
      const el = $('#chat-active-ui');
      if (!el) return;
      el.classList.toggle('visible', show);
    },

    renderMessages(reset) {
      const box = $('#messages');
      const empty = $('#empty-state');
      const notes = Store.notesFor(this.activeThread);
      if (!notes.length) {
        empty.classList.remove('hidden');
        $('#load-older').classList.add('hidden');
        box.querySelectorAll('.bubble, .day-sep').forEach((n) => n.remove());
        return;
      }
      empty.classList.add('hidden');
      const { items, hasMore } = Store.pageNotes(this.activeThread, this.oldestTs, PAGE_SIZE);
      if (reset) { box.querySelectorAll('.bubble, .day-sep').forEach((n) => n.remove()); this.renderedClientIds.clear(); this.oldestTs = items.length ? items[0].ts : null; }
      const loader = $('#load-older');
      loader.classList.toggle('hidden', !hasMore);
      const frag = document.createDocumentFragment();
      const before = box.querySelector('.bubble, .day-sep');
      // Em load-older (não reset), sincroniza o dia-base com a bolha já existente
      // para que o separador certo apareça entre notas novas (mais antigas) e as já renderizadas.
      let lastDay = before && !reset ? before.dataset.day || null : null;
      items.forEach((n) => {
        if (this.renderedClientIds.has(n.clientId)) return;
        this.renderedClientIds.add(n.clientId);
        const dayKey = new Date(n.ts).toDateString();
        if (lastDay !== null && dayKey !== lastDay) {
          frag.appendChild(this.daySepEl(dayKey));
        }
        lastDay = dayKey;
        frag.appendChild(this.bubbleEl(n));
      });
      box.insertBefore(frag, before || loader);
      if (reset) box.scrollTop = box.scrollHeight;
    },

    bubbleEl(n) {
      const div = document.createElement('div');
      const mine = n.userId === (Store.user && Store.user.mail) || n.local;
      const thread = Store.getThread(this.activeThread);
      const isPinned = thread && thread.pinnedId === n.clientId;
      div.className = 'bubble' + (mine ? '' : ' remote') + (n.pending ? ' pending' : '') + (isPinned ? ' pinned' : '');
      div.dataset.clientId = n.clientId;
      div.dataset.day = new Date(n.ts).toDateString();
      div.setAttribute('draggable', 'true');

      const editedMark = n.edited ? '<span class="edited">editada</span>' : '';
      const meta = `<span class="meta">${editedMark}${n.pending ? 'enviando…' : fmtTime(n.ts)}</span>`;
      const pinBadge = isPinned ? `<span class="pin-badge" title="Mensagem fixada">${wrapSvg(ICON.pin, 12)}</span>` : '';
      const toggle = `<button class="msg-toggle" title="Ações" aria-label="Ações">${wrapSvg(ICON.chevron, 12)}</button>`;
      const tags = (n.tags && n.tags.length) ? `<div class="bubble-tags">${n.tags.map((t) => `<span class="tag-chip">#${esc(t)}</span>`).join('')}</div>` : '';
      const imgs = (n.images && n.images.length) ? `<div class="bubble-images">${n.images.map((src) => `<img class="bubble-img" src="${src}" alt="anexo" loading="lazy"/>`).join('')}</div>` : '';

      div.innerHTML = `${pinBadge}${imgs}${renderMarkdown(n.text)}${tags}${meta}${toggle}`;

      // Seta ▾ → popover
      div.querySelector('.msg-toggle').addEventListener('click', (e) => { e.stopPropagation(); this.openMsgPopover(div, n); });
      // Long-press (mobile)
      div.addEventListener('touchstart', (e) => this.onTouchStart(e, div, n), { passive: true });
      div.addEventListener('touchend', () => this.onTouchEnd());
      div.addEventListener('touchmove', () => this.onTouchEnd());
      // Drag-and-drop desktop
      div.addEventListener('dragstart', (e) => this.onDragStart(e, n));
      div.addEventListener('dragover', (e) => this.onDragOver(e, div));
      div.addEventListener('dragleave', () => div.classList.remove('drag-over'));
      div.addEventListener('drop', (e) => this.onDrop(e, n));
      div.addEventListener('dragend', () => this.onDragEnd());
      // Lightbox: clicar na imagem abre em tela cheia
      div.querySelectorAll('.bubble-img').forEach((img) => {
        img.style.cursor = 'zoom-in';
        img.addEventListener('click', (e) => { e.stopPropagation(); this.openLightbox(img.src); });
      });

      return div;
    },

    openLightbox(src) {
      let ov = document.getElementById('lightbox');
      if (!ov) {
        ov = document.createElement('div');
        ov.id = 'lightbox';
        ov.className = 'lightbox hidden';
        ov.innerHTML = '<img class="lightbox-img" alt="imagem ampliada"/><button class="lightbox-close" aria-label="Fechar">×</button>';
        document.body.appendChild(ov);
        ov.addEventListener('click', (e) => { if (e.target === ov || e.target.classList.contains('lightbox-close')) { ov.classList.add('hidden'); const img = ov.querySelector('.lightbox-img'); img.style.transform = ''; img.dataset.scale = '1'; } });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !ov.classList.contains('hidden')) { ov.classList.add('hidden'); const img = ov.querySelector('.lightbox-img'); img.style.transform = ''; img.dataset.scale = '1'; } });
        // pinch-to-zoom
        const img = ov.querySelector('.lightbox-img');
        let startDist = 0, startScale = 1, curScale = 1;
        img.addEventListener('touchstart', (e) => {
          if (e.touches.length === 2) {
            e.preventDefault();
            startDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            startScale = curScale;
          }
        }, { passive: false });
        img.addEventListener('touchmove', (e) => {
          if (e.touches.length === 2) {
            e.preventDefault();
            const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            curScale = Math.min(4, Math.max(1, startScale * (dist / startDist)));
            img.style.transform = `scale(${curScale})`;
            img.style.transformOrigin = 'center center';
          }
        }, { passive: false });
        img.addEventListener('touchend', (e) => {
          if (e.touches.length < 2) { if (curScale <= 1.1) { curScale = 1; img.style.transform = ''; } }
        });
        // double-tap to reset/zoom
        let lastTap = 0;
        img.addEventListener('touchend', (e) => {
          const now = Date.now();
          if (now - lastTap < 300 && e.touches.length === 0) {
            curScale = curScale > 1 ? 1 : 2;
            img.style.transform = curScale === 1 ? '' : `scale(${curScale})`;
          }
          lastTap = now;
        });
      }
      const img = ov.querySelector('.lightbox-img');
      img.style.transform = ''; img.dataset.scale = '1';
      img.src = src;
      ov.classList.remove('hidden');
    },

    daySepEl(dayKey) {
      // "Hoje", "Ontem" ou data por extenso
      const d = new Date();
      const today = d.toDateString();
      const yest = new Date(d.getTime() - 864e5).toDateString();
      let label;
      const resolved = dayKey || today;
      if (resolved === today) label = 'Hoje';
      else if (resolved === yest) label = 'Ontem';
      else label = new Date(resolved).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
      const wrap = document.createElement('div');
      wrap.className = 'day-sep-wrap';
      wrap.innerHTML = `<span class="day-sep">${esc(label)}</span>`;
      return wrap;
    },

    // ---------- Popover de ações da mensagem ----------
    bindMsgPopover() {
      const p = this.dom.msgPopover;
      // fecha em qualquer clique fora
      document.addEventListener('click', (e) => {
        if (p.classList.contains('hidden')) return;
        if (p.contains(e.target) || e.target.classList && e.target.classList.contains('msg-toggle')) return;
        p.classList.add('hidden');
      });
      // ação
      p.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b || !b.dataset.msg) return;
        const act = b.dataset.msg;
        const cid = this.popoverClientId;
        p.classList.add('hidden');
        if (!cid) return;
        if (act === 'edit') this.editNoteInline(cid);
        else if (act === 'delete') this.confirmDeleteNote(cid);
        else if (act === 'pin' || act === 'unpin') this.togglePin(cid);
        else if (act === 'tags') this.editTags(cid);
        else if (act === 'copy') this.copyNote(cid);
      });
    },
    openMsgPopover(bubbleEl, note) {
      const p = this.dom.msgPopover;
      this.popoverClientId = note.clientId;
      const thread = Store.getThread(this.activeThread);
      const isPinned = thread && thread.pinnedId === note.clientId;
      p.querySelector('[data-msg="pin"]').classList.toggle('hidden', isPinned);
      p.querySelector('[data-msg="unpin"]').classList.toggle('hidden', !isPinned);
      p.classList.remove('hidden');
      // posicionar perto do bubble, ancorado à seta ▾
      const r = bubbleEl.getBoundingClientRect();
      const pw = 220, ph = 180;
      let left = r.right - pw + 30; // alinha canto direito
      let top = r.bottom + 6;
      if (top + ph > window.innerHeight) top = r.top - ph - 6;
      if (left < 8) left = 8;
      if (left + pw > window.innerWidth) left = window.innerWidth - pw - 8;
      p.style.left = left + 'px';
      p.style.top = top + 'px';
    },

    // ---------- Long-press (mobile) ----------
    onTouchStart(e, bubbleEl, note) {
      this.onTouchEnd();
      this.longPressTimer = setTimeout(() => {
        this.openMsgPopover(bubbleEl, note);
      }, 500);
    },
    onTouchEnd() {
      if (this.longPressTimer) { clearTimeout(this.longPressTimer); this.longPressTimer = null; }
    },

    // ---------- Drag-and-drop ----------
    onDragStart(e, note) {
      this.dragClientId = note.clientId;
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', note.clientId); } catch (_) {}
      e.target.classList.add('dragging');
    },
    onDragOver(e, div) {
      if (!this.dragClientId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      div.classList.add('drag-over');
    },
    onDrop(e, targetNote) {
      e.preventDefault();
      e.target.closest('.bubble').classList.remove('drag-over');
      const srcId = this.dragClientId; if (!srcId || srcId === targetNote.clientId) return;
      const arr = Store.notesFor(this.activeThread);
      const from = arr.findIndex((x) => x.clientId === srcId);
      const to = arr.findIndex((x) => x.clientId === targetNote.clientId);
      if (from < 0 || to < 0) return;
      Store.reorderNote(this.activeThread, srcId, to);
      Sync.send('note:reorder', { threadId: this.activeThread, clientId: srcId, newIndex: to });
      // re-render completo da thread atual (simples e correto)
      this.oldestTs = null;
      this.renderedClientIds = new Set();
      this.renderMessages(true);
    },
    onDragEnd() {
      this.dragClientId = null;
      document.querySelectorAll('.bubble.dragging').forEach((b) => b.classList.remove('dragging'));
      document.querySelectorAll('.bubble.drag-over').forEach((b) => b.classList.remove('drag-over'));
    },

    // ---------- Ações de nota: editar (in-line) / pin / excluir ----------
    editNoteInline(clientId) {
      const el = document.querySelector(`.bubble[data-client-id="${clientId}"]`);
      if (!el || el.isContentEditable) return;
      const arr = Store.notesFor(this.activeThread); const n = arr.find((x) => x.clientId === clientId); if (!n) return;
      // separa o texto (primeiro filho de texto) da meta/toggle que ficam no final
      const meta = el.querySelector('.meta'); const toggle = el.querySelector('.msg-toggle');
      const pinBadge = el.querySelector('.pin-badge');
      el.setAttribute('contenteditable', 'true');
      el.classList.add('editing');
      // conteúdo editável = só o texto (remove meta/toggle temporariamente)
      el.textContent = n.text;
      // recoloca meta e toggle
      if (meta) el.appendChild(meta);
      if (toggle) el.appendChild(toggle);
      if (pinBadge) el.insertBefore(pinBadge, el.firstChild);

      // posiciona cursor no final
      const sel = window.getSelection(); const range = document.createRange();
      range.selectNodeContents(el); range.collapse(false);
      sel.removeAllRanges(); sel.addRange(range);

      const finish = (save) => {
        el.removeAttribute('contenteditable');
        el.classList.remove('editing');
        el.removeEventListener('keydown', onKey);
        el.removeEventListener('blur', onBlur);
        if (save) {
          const v = el.textContent.replace(/\s+$/, '').trim();
          // remove qualquer lixo de meta que possa ter ficado
          const clean = v;
          if (clean && clean !== n.text) {
            const updated = Store.editNote(this.activeThread, clientId, clean);
            if (updated) {
              Sync.send('note:edit', { threadId: this.activeThread, clientId, text: updated.text, edited: updated.edited, editedAt: updated.editedAt, rev: updated.rev });
              // re-render para voltar ao formato normal (com meta/editado)
              this.renderedClientIds.delete(clientId);
              const fresh = document.querySelector(`.bubble[data-client-id="${clientId}"]`);
              if (fresh) fresh.outerHTML = this.bubbleEl(Store.notesFor(this.activeThread).find((x) => x.clientId === clientId)).outerHTML;
            }
          } else {
            // restaura
            this.renderedClientIds.delete(clientId);
            const fresh = document.querySelector(`.bubble[data-client-id="${clientId}"]`);
            if (fresh) fresh.outerHTML = this.bubbleEl(n).outerHTML;
          }
        } else {
          this.renderedClientIds.delete(clientId);
          const fresh = document.querySelector(`.bubble[data-client-id="${clientId}"]`);
          if (fresh) fresh.outerHTML = this.bubbleEl(n).outerHTML;
        }
      };
      const onKey = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(true); }
        else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      };
      const onBlur = () => finish(true);
      el.addEventListener('keydown', onKey);
      el.addEventListener('blur', onBlur);
      setTimeout(() => el.focus(), 20);
    },
    confirmDeleteNote(clientId) {
      if (!confirm('Excluir esta nota?')) return;
      this.deleteNote(clientId);
      Sound.play('delete'); haptic('delete');
    },
    async copyNote(clientId) {
      const arr = Store.notesFor(this.activeThread); const n = arr.find((x) => x.clientId === clientId); if (!n) return;
      const text = n.text || '';
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
        else { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
        this.toast('Nota copiada', { kind: 'success' });
        Sound.play('copy');
      } catch (e) {
        this.toast('Não foi possível copiar', { kind: 'info' });
      }
    },
    editTags(clientId) {
      const arr = Store.notesFor(this.activeThread); const n = arr.find((x) => x.clientId === clientId); if (!n) return;
      const cur = (n.tags || []).join(', ');
      const body = `<label style="display:block;font-size:13px;color:var(--text-dim);margin-bottom:6px;font-weight:600">Etiquetas (separadas por vírgula)</label>
        <input id="tag-input" type="text" placeholder="ex: trabalho, urgente, ideia" value="${esc(cur)}" autofocus />
        <div style="font-size:11px;color:var(--text-dim);margin-top:6px">Use <b>#tag</b> na busca para filtrar.</div>`;
      this.showModal('Etiquetas da nota', body, () => {
        const val = ($('#tag-input').value || '').split(',').map((s) => s.trim()).filter(Boolean);
        const updated = Store.setTags(this.activeThread, clientId, val);
        if (updated) {
          Sync.send('note:tags', { threadId: this.activeThread, clientId, tags: updated.tags });
          this.renderedClientIds.delete(clientId);
          const fresh = document.querySelector(`.bubble[data-client-id="${clientId}"]`);
          if (fresh) fresh.outerHTML = this.bubbleEl(updated).outerHTML;
        }
        this.closeModal();
      });
    },
    togglePin(clientId) {
      const th = Store.getThread(this.activeThread); if (!th) return;
      const newPin = Store.setPinned(this.activeThread, clientId);
      Sync.send('note:pin', { threadId: this.activeThread, clientId });
      // re-render mensagens (para atualizar borda dourada + badge) + header
      this.renderedClientIds = new Set();
      this.renderMessages(true);
      this.updatePinButton();
      Sound.play('pin'); haptic('medium');
    },

    // ---------- Botão de pin no header ----------
    bindPinButton() {
      this.dom.btnPin.addEventListener('click', (e) => { e.stopPropagation(); this.togglePinPopover(); });
      document.addEventListener('click', (e) => {
        if (!this.dom.pinPopover.classList.contains('hidden')) {
          if (!this.dom.pinPopover.contains(e.target) && e.target !== this.dom.btnPin) {
            this.dom.pinPopover.classList.add('hidden');
          }
        }
      });
    },
    updatePinButton() {
      const th = Store.getThread(this.activeThread);
      const pinned = th ? Store.getPinned(this.activeThread) : null;
      this.dom.btnPin.classList.toggle('hidden', !th);
      this.dom.btnPin.classList.toggle('has-pin', !!pinned);
    },
    togglePinPopover() {
      const th = Store.getThread(this.activeThread);
      const pinned = th ? Store.getPinned(this.activeThread) : null;
      if (!pinned) { this.dom.pinPopover.classList.add('hidden'); return; }
      // preenche conteúdo
      this.dom.pinBody.innerHTML = `<div>${esc(pinned.text)}</div><span class="ts">${fmtTime(pinned.ts)}${pinned.edited ? ' · editada' : ''}</span>`;
      this.dom.pinPopover.dataset.clientId = pinned.clientId;
      this.dom.pinPopover.classList.remove('hidden');
      // posiciona abaixo do botão pin (canto superior esquerdo da área de mensagens)
      const r = this.dom.btnPin.getBoundingClientRect();
      const pw = Math.min(480, window.innerWidth - 24), ph = 240;
      let left = r.left;
      let top = r.bottom + 8;
      if (left < 8) left = 8;
      if (left + pw > window.innerWidth) left = window.innerWidth - pw - 8;
      if (top + ph > window.innerHeight) top = r.top - ph - 8;
      this.dom.pinPopover.style.left = left + 'px';
      this.dom.pinPopover.style.top = top + 'px';
    },
    bindPinPopover() {
      this.dom.pinPopover.querySelector('#pin-jump').addEventListener('click', () => {
        const cid = this.dom.pinPopover.dataset.clientId;
        this.dom.pinPopover.classList.add('hidden');
        if (!cid) return;
        const el = document.querySelector(`.bubble[data-client-id="${cid}"]`);
        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
      });
      this.dom.pinPopover.querySelector('#pin-edit').addEventListener('click', () => {
        const cid = this.dom.pinPopover.dataset.clientId;
        this.dom.pinPopover.classList.add('hidden');
        this.editNoteInline(cid);
      });
      this.dom.pinPopover.querySelector('#pin-unpin').addEventListener('click', () => {
        const cid = this.dom.pinPopover.dataset.clientId;
        this.dom.pinPopover.classList.add('hidden');
        this.togglePin(cid);
      });
    },

    setupInfiniteScroll() {
      const box = $('#messages');
      box.addEventListener('scroll', () => {
        if (box.scrollTop < 60 && !this.loading && this.activeThread) {
          const { hasMore } = Store.pageNotes(this.activeThread, this.oldestTs, PAGE_SIZE);
          if (!hasMore) return;
          this.loading = true;
          const prevHeight = box.scrollHeight, prevTop = box.scrollTop;
          const { items } = Store.pageNotes(this.activeThread, this.oldestTs, PAGE_SIZE);
          this.oldestTs = items.length ? items[0].ts : this.oldestTs;
          const frag = document.createDocumentFragment();
          const loader = $('#load-older');
          items.forEach((n) => { if (this.renderedClientIds.has(n.clientId)) return; this.renderedClientIds.add(n.clientId); frag.appendChild(this.bubbleEl(n)); });
          box.insertBefore(frag, loader.nextSibling);
          box.scrollTop = box.scrollHeight - prevHeight + prevTop;
          this.loading = false;
        }
      });
    },

    // ---------- Composer ----------
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
      // também recalcula no resize da janela (limite 60vh muda)
      window.addEventListener('resize', resize);
      // inicializa com estado correto (evita scrollbar fantasma no carregamento)
      resize();
      ta.addEventListener('focus', () => {
        // No mobile, rola para o composer ficar visível acima do teclado
        setTimeout(() => {
          ta.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 300);
      });
      ta.addEventListener('keydown', (e) => {
        const mod = e.ctrlKey || e.metaKey;
        if (mod && (e.key === 'b' || e.key === 'B')) { e.preventDefault(); this.applyFormat('bold'); }
        else if (mod && (e.key === 'i' || e.key === 'I')) { e.preventDefault(); this.applyFormat('italic'); }
        else if (mod && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); this.applyFormat('code'); }
        else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendNote(); }
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
      else if (kind === 'list') {
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
      const el = this.bubbleEl(n);
      el.classList.add('just-sent');
      box.appendChild(el);
      box.scrollTop = box.scrollHeight;
      const meta = el.querySelector('.meta'); if (meta) meta.textContent = fmtTime(n.ts);
      el.classList.remove('pending');
      // remove a classe após a animação pop-in para não reanimar em re-renders
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
        if (this.activeThread === threadId) {
          const el = document.querySelector(`.bubble[data-client-id="${clientId}"]`);
          if (el) { el.outerHTML = this.bubbleEl(n).outerHTML; }
        }
      });
      Sync.on('note:tags', ({ threadId, clientId, tags }) => {
        const arr = Store.notesFor(threadId); const n = arr.find((x) => x.clientId === clientId); if (!n) return;
        n.tags = tags || []; Store.save();
        if (this.activeThread === threadId) {
          const el = document.querySelector(`.bubble[data-client-id="${clientId}"]`);
          if (el) el.outerHTML = this.bubbleEl(n).outerHTML;
        }
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
        // o servidor já exclui o remetente; qualquer evento aqui é de outro dispositivo
        Store.upsertThread(t); this.renderTree();
        if (this.activeThread === t.id) this.updatePinButton();
        this.toast(`Nova conversa: "${t.name}"`);
      });
      Sync.on('thread:delete', ({ id }) => { delete Store.data.threads[id]; delete Store.data.notes[id]; Store.save(); this.renderTree(); });
      Sync.on('folder:upsert', (f) => { Store.upsertFolder(f); this.renderTree(); });
      Sync.on('folder:delete', ({ id }) => { Store.deleteFolder(id, false); this.renderTree(); });
      Sync.on('thread:move', ({ threadId, folderId, beforeId }) => {
        Store.moveThread(threadId, folderId || null, beforeId || null);
        this.setManualSort();
        this.renderTree();
      });
    },
  };

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
      // updateViaCache: 'none' garante que o navegador sempre baixe o sw.js
      // novo e não use uma versão em cache para a verificação de update.
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
        .then((reg) => { try { reg.update(); } catch {} })
        .catch(() => { /* SW opcional */ });
    });
  }
})();
    