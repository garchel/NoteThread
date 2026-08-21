
  // ===================================================================
  // STORE (offline-first, localStorage)
  // data: { user, threads:{}, folders:{}, notes:{}, ui:{expanded:{}} }
  // thread: { id, name, emoji, folderId|null, favorite:bool, createdAt, updatedAt, lastPreview }
  // folder: { id, name, parentId|null, createdAt }
  // ===================================================================
  export const Store = {
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
