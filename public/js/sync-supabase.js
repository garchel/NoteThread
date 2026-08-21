import { $ } from './utils.js';
import { Store } from './store.js';

// CONFIGURAÇÃO DE SINCRONIZAÇÃO (Supabase — definido em index.html)
  // ---------------------------------------------------------------------
  // CONFIGURAÇÃO DE SINCRONIZAÇÃO (Supabase — definido em index.html)
  export const SUPABASE_URL = (typeof window !== 'undefined' && window.SUPABASE_URL) || '';
  export const SUPABASE_ANON_KEY = (typeof window !== 'undefined' && window.SUPABASE_ANON_KEY) || '';
  export const USE_SUPABASE = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
  // singleton Supabase client — memoiza a PROMISE para chamadas concorrentes
  let _supaPromise = null;
  export function getSupa() {
    if (!_supaPromise) {
      _supaPromise = import('https://esm.sh/@supabase/supabase-js@2.112.3').then(m => m.createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
    }
    return _supaPromise;
  }

  // ===================================================================
  // SYNC (Supabase: Postgres + Realtime + RLS — sem backend próprio)
  // ===================================================================
  export const SupaSync = {
    supa: null, channel: null, handlers: {}, lastSync: 0, connected: false,
    on(type, fn) { this.handlers[type] = fn; },
    emit(type, payload) { this.lastSync = Date.now(); if (this.handlers[type]) this.handlers[type](payload); },
    _connecting: false,
    _uidCache: null,
    _lastStatus: null, _lastStatusAt: 0,
    setStatus(s) {
      if (s === this._lastStatus) return;
      const now = Date.now();
      // debounce só para 'connecting' (evita frenesi); online/offline sempre aplicam
      if (s === 'connecting' && this._lastStatus && now - this._lastStatusAt < 400) return;
      this._lastStatus = s; this._lastStatusAt = now;
      const el = $('#sync-status'); if (!el) return;
      el.className = 'sync-status ' + s;
      el.dataset.state = s;
      el.dataset.status = s === 'online' ? 'Sincronizado' : s === 'connecting' ? 'Conectando…' : 'Offline — suas notas ficam salvas neste dispositivo';
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
      if (window.NoteThread && window.NoteThread.UI) window.NoteThread.UI.updateSyncLabel();
    },
    // uid da sessão LOCAL (sem rede) — getUser() fazia request por evento e falhava silencioso
    async _uid() {
      if (!this.supa) return null;
      if (this._uidCache) return this._uidCache;
      const { data: { session } } = await this.supa.auth.getSession();
      this._uidCache = session && session.user ? session.user.id : null;
      return this._uidCache;
    },
    // grava linha na tabela profiles ao logar
    async ensureProfile(user) {
      if (!this.supa || !user) return;
      try {
        await this.supa.from('profiles').upsert({ id: user.id, email: user.email, name: (user.email || 'u').split('@')[0] });
      } catch (e) { console.warn('[supabase] profile save fail', e); }
    },
    async connect() {
      if (this._connecting || (this.connected && this.supa)) return;
      // offline: não tenta conectar repetidamente
      if (typeof navigator !== 'undefined' && navigator.onLine === false) { this.setStatus('offline'); return; }
      this._connecting = true;
      this.setStatus('connecting');
      if (!USE_SUPABASE) { this._connecting = false; this.setStatus('offline'); return; }
      const t = setTimeout(() => { if (!this.connected) { this.setStatus('offline'); console.warn('[supabase] connect timeout'); } this._connecting = false; }, 8000);
      try {
        this.supa = await getSupa();
        const { data: { session } } = await this.supa.auth.getSession();
        this._uidCache = session && session.user ? session.user.id : null;
        this.supa.auth.onAuthStateChange((_ev, sess) => {
          if (sess && sess.user) {
            Store.setUser({ name: sess.user.email.split('@')[0], mail: sess.user.email, provider: 'supabase', id: sess.user.id });
            this._uidCache = sess.user.id;
            this.ensureProfile(sess.user);
            if (window.NoteThread && window.NoteThread.UI) window.NoteThread.UI.renderMe();
          } else {
            this._uidCache = null;
          }
        });
        if (session && session.user) {
          Store.setUser({ name: session.user.email.split('@')[0], mail: session.user.email, provider: 'supabase', id: session.user.id });
          this.ensureProfile(session.user);
        }
        this.connected = true; this.setStatus('online'); clearTimeout(t); this._connecting = false;
        // online: 1º reenvia eventos pendentes (checkboxes/edições), DEPOIS snapshot
        // (assim o snapshot já traz o estado mais novo e não desfaz mudanças locais)
        if (navigator.onLine !== false) {
          await this.flushQueue();
          await this.loadSnapshot();
        }
        if (this.connected) this.subscribe();
      } catch (e) { clearTimeout(t); this._connecting = false; console.warn('[supabase] connect fail', e); this.setStatus('offline'); }
    },
    async loadSnapshot() {
      // paginado: só últimas 200 notas para não pesar Brave (base64) — infinite scroll carrega resto sob demanda
      const [th, fo, no] = await Promise.all([
        this.supa.from('threads').select('*').order('updated_at', { ascending: false }).limit(100),
        this.supa.from('folders').select('*').limit(100),
        this.supa.from('notes').select('*').order('ts', { ascending: false }).limit(200)
      ]);
      const payload = {
        threads: Object.fromEntries((th.data || []).map(t => [t.id, { id: t.id, name: t.name, emoji: t.emoji, folderId: t.folder_id, favorite: t.favorite, pinnedId: t.pinned_id, createdAt: new Date(t.created_at).getTime(), updatedAt: new Date(t.updated_at).getTime(), lastPreview: t.last_preview }])),
        folders: Object.fromEntries((fo.data || []).map(f => [f.id, { id: f.id, name: f.name, emoji: f.emoji, parentId: f.parent_id, createdAt: new Date(f.created_at).getTime() }])),
        notes: (() => { const m = {}; (no.data || []).forEach(n => { (m[n.thread_id] = m[n.thread_id] || []).push({ clientId: n.client_id, threadId: n.thread_id, text: n.text, images: n.images || [], tags: n.tags || [], ts: Number(n.ts), sortOrder: n.sort_order, edited: n.edited, editedAt: n.edited_at, rev: n.rev, remindAt: n.remind_at ? Number(n.remind_at) : null, remindFired: !!n.remind_fired, userId: Store.user ? Store.user.mail : 'anon' }); }); return m; })()
      };
      this.emit('snapshot', payload);
    },
    subscribe() {
      if (this.channel) try { this.supa.removeChannel(this.channel); } catch {}
      // usa sessão local (sem rede); filtra por user_id
      this.supa.auth.getSession().then(({ data: { session } }) => {
        const uid = session && session.user ? session.user.id : null;
        const filt = uid ? `user_id=eq.${uid}` : undefined;
        const ch = this.supa.channel('notethread')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'notes', ...(filt?{filter:filt}:{}) }, (p) => {
            const r = p.new || p.old; if (!r) return;
            if (p.eventType === 'DELETE') this.emit('note:delete', { threadId: r.thread_id, clientId: r.client_id });
            else this.emit('note:upsert', { clientId: r.client_id, threadId: r.thread_id, text: r.text, images: (r.images||[]).slice(0,2), tags: r.tags || [], ts: Number(r.ts), sortOrder: r.sort_order, edited: r.edited, editedAt: r.edited_at, rev: r.rev });
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'threads', ...(filt?{filter:filt}:{}) }, (p) => {
            const r = p.new || p.old; if (!r) return;
            if (p.eventType === 'DELETE') this.emit('thread:delete', { id: r.id });
            else this.emit('thread:upsert', { id: r.id, name: r.name, emoji: r.emoji, folderId: r.folder_id, favorite: r.favorite, pinnedId: r.pinned_id, createdAt: new Date(r.created_at).getTime(), updatedAt: new Date(r.updated_at).getTime(), lastPreview: r.last_preview });
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'folders', ...(filt?{filter:filt}:{}) }, (p) => {
            const r = p.new || p.old; if (!r) return;
            if (p.eventType === 'DELETE') this.emit('folder:delete', { id: r.id });
            else this.emit('folder:upsert', { id: r.id, name: r.name, emoji: r.emoji, parentId: r.parent_id, createdAt: new Date(r.created_at).getTime() });
          })
          .subscribe();
        this.channel = ch;
      });
    },
    // fila de eventos que falharam — persistida em localStorage e reenviada ao conectar
    _queueKey: 'notethread.syncq',
    _loadQueue() { try { return JSON.parse(localStorage.getItem(this._queueKey) || '[]'); } catch { return []; } },
    _saveQueue(q) { try { localStorage.setItem(this._queueKey, JSON.stringify(q.slice(-200))); } catch {} },
    _enqueue(type, payload) {
      const q = this._loadQueue();
      q.push({ type, payload, ts: Date.now() });
      this._saveQueue(q);
    },
    async flushQueue() {
      const q = this._loadQueue();
      if (!q.length || !this.supa) return;
      const rest = [];
      for (const item of q) {
        try {
          this.lastSync = Date.now();
          await this._doSend(item.type, item.payload); // lança se falhar
        } catch (e) { rest.push(item); }
      }
      this._saveQueue(rest);
      if (q.length && !rest.length && window.NoteThread && window.NoteThread.UI) window.NoteThread.window.NoteThread.UI.toast('Sincronização restaurada', { kind: 'success' });
    },
    async send(type, payload) {
      if (!this.supa) return;
      this.lastSync = Date.now();
      try {
        await this._doSend(type, payload);
      } catch (e) {
        console.warn('[supabase] send fail', type, e);
        this._enqueue(type, payload); // tenta de novo ao reconectar
        if (!this._warnedFail && window.NoteThread && window.NoteThread.UI) {
          this._warnedFail = true;
          window.NoteThread.UI.toast('Falha ao sincronizar — será reenviado automaticamente', { kind: 'error' });
        }
      }
    },
    async fetchNotesPage(threadId, beforeTs, count) {
      if (!this.supa) return [];
      let q = this.supa.from('notes').select('*').eq('thread_id', threadId).order('ts', { ascending: false }).limit(count || 25);
      if (beforeTs != null) q = q.lt('ts', beforeTs);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).reverse().map(n => ({ clientId: n.client_id, threadId: n.thread_id, text: n.text, images: n.images||[], tags: n.tags||[], ts: Number(n.ts), sortOrder: n.sort_order, edited: n.edited, editedAt: n.edited_at, rev: n.rev, remindAt: n.remind_at ? Number(n.remind_at) : null, remindFired: !!n.remind_fired, userId: Store.user ? Store.user.mail : 'anon' }));
    },
    async _doSend(type, payload) {
      const uid = await this._uid(); if (!uid) throw new Error('sem sessão');
      if (type === 'note:upsert') {
        const n = payload; await this.supa.from('notes').upsert({ client_id: n.clientId, thread_id: n.threadId, text: n.text, images: n.images || [], tags: n.tags || [], ts: n.ts, sort_order: n.sortOrder || 0, edited: !!n.edited, edited_at: n.editedAt || null, rev: n.rev || 0, remind_at: n.remindAt || null, remind_fired: !!n.remindFired, user_id: uid }, { onConflict: 'client_id' });
      } else if (type === 'note:remind') {
        await this.supa.from('notes').update({ remind_at: payload.remindAt || null, remind_fired: !!payload.remindFired }).eq('client_id', payload.clientId);
      } else if (type === 'thread:upsert') {
        const t = payload; await this.supa.from('threads').upsert({ id: t.id, name: t.name, emoji: t.emoji, folder_id: t.folderId || null, favorite: !!t.favorite, pinned_id: t.pinnedId || null, updated_at: new Date().toISOString(), last_preview: t.lastPreview || '', user_id: uid }, { onConflict: 'id' });
      } else if (type === 'thread:delete') {
        await this.supa.from('threads').delete().eq('id', payload.id);
      } else if (type === 'folder:upsert') {
        const f = payload; await this.supa.from('folders').upsert({ id: f.id, name: f.name, emoji: f.emoji, parent_id: f.parentId || null, user_id: uid }, { onConflict: 'id' });
      } else if (type === 'folder:delete') {
        await this.supa.from('folders').delete().eq('id', payload.id);
      } else if (type === 'note:delete') {
        await this.supa.from('notes').delete().eq('client_id', payload.clientId);
      } else if (type === 'note:edit') {
        await this.supa.from('notes').update({ text: payload.text, edited: payload.edited !== undefined ? !!payload.edited : true, edited_at: payload.editedAt, rev: payload.rev }).eq('client_id', payload.clientId);
      } else if (type === 'note:tags') {
        await this.supa.from('notes').update({ tags: payload.tags }).eq('client_id', payload.clientId);
      } else if (type === 'note:pin') {
        // usa estado explícito do payload (não recomputa — Store local já foi flipado)
        const cur = payload.pinned ? payload.clientId : null;
        await this.supa.from('threads').update({ pinned_id: cur }).eq('id', payload.threadId);
      } else if (type === 'thread:move') {
        await this.supa.from('threads').update({ folder_id: payload.folderId || null }).eq('id', payload.threadId);
      }
    }
  };

  export const Sync = SupaSync;

