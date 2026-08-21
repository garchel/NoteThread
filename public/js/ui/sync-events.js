import { $ } from '../utils.js';
import { Store } from '../store.js';
import { Sync } from '../sync-supabase.js';

export const SyncEventsMethods = {
bindSync() {
      Sync.on('snapshot', (db) => {
        if (db.threads) Object.values(db.threads).forEach((t) => Store.upsertThread(t));
        if (db.folders) Object.values(db.folders).forEach((f) => Store.upsertFolder(f));
        if (db.notes) Object.entries(db.notes).forEach(([tid, arr]) => arr.forEach((n) => Store.upsertNote(n)));
        this.renderTree();
        if (this.activeThread) { this.oldestTs = null; this.renderMessages(true); this.updatePinButton(); }
      });
      Sync.on('note:upsert', (n) => {
        Store.upsertNote(n);
        if (this.activeThread === n.threadId) this.appendNoteRealtime(n);
        this.updateNoteCount();
        // atualiza backlinks se a thread aberta foi mencionada
        if (this.activeThread && n.text && n.text.includes(`(t:${this.activeThread})`)) this.renderBacklinks(this.activeThread);
        const th = Store.getThread(n.threadId);
        if (this.activeThread !== n.threadId) this.toast(`Nova nota em "${th ? th.name : 'conversa'}"`, { kind: 'success' });
      });
      Sync.on('note:edit', ({ threadId, clientId, text, edited, editedAt, rev }) => {
        const arr = Store.notesFor(threadId); const n = arr.find((x) => x.clientId === clientId); if (!n) return;
        const incoming = editedAt || 0, local = n.editedAt || 0;
        const incomingRev = rev || 0, localRev = n.rev || 0;
        if (incoming < local || (incoming === local && incomingRev <= localRev)) return;
        n.text = text; n.edited = edited; n.editedAt = editedAt; n.rev = incomingRev; Store.save();
        if (this.activeThread === threadId) this._replaceBubble(clientId, n);
        if (this.activeThread && text && text.includes(`(t:${this.activeThread})`)) this.renderBacklinks(this.activeThread);
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
