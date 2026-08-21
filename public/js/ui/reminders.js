import { now, haptic, $ } from '../utils.js';
import { Store } from '../store.js';
import { Sync } from '../sync-supabase.js';

export const ReminderMethods = {
showReminderModal(clientId) {
      const arr = Store.notesFor(this.activeThread); const n = arr.find((x) => x.clientId === clientId); if (!n) return;
      const def = new Date(Date.now() + 60 * 60 * 1000);
      const toLocal = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      const has = n.remindAt && !n.remindFired;
      const body = `
        <label style="display:block;font-size:13px;color:var(--text-dim);margin-bottom:6px;font-weight:600">Lembrar-me em</label>
        <input id="remind-at" type="datetime-local" value="${toLocal(def)}" style="width:100%" />
        ${has ? `<p style="font-size:12.5px;color:var(--text-dim);margin-top:8px">Lembrete ativo para ${new Date(n.remindAt).toLocaleString('pt-BR')}</p>` : ''}
        <p style="font-size:12.5px;color:var(--text-dim);margin-top:8px">A notificação aparece com o app aberto. Permissão do navegador será solicitada.</p>`;
      this.showModal('Lembrete', body, () => {
        const v = $('#remind-at').value;
        if (!v) return;
        n.remindAt = new Date(v).getTime();
        n.remindFired = false;
        Store.save();
        Sync.send('note:remind', { clientId, remindAt: n.remindAt, remindFired: false });
        this._ensureNotifPermission();
        this.queueRenderTree();
        this.closeModal();
        this.toast(`Lembrete: ${new Date(n.remindAt).toLocaleString('pt-BR')}`, { kind: 'success' });
      });
    },
    cancelReminder(clientId) {
      const arr = Store.notesFor(this.activeThread); const n = arr.find((x) => x.clientId === clientId); if (!n) return;
      n.remindAt = null; n.remindFired = false; Store.save();
      Sync.send('note:remind', { clientId, remindAt: null, remindFired: false });
      this.queueRenderTree();
      this.toast('Lembrete cancelado', { kind: 'info' });
    },
    initReminders() {
      if (this._remindTimer) return;
      this._remindTimer = setInterval(() => this._checkReminders(), 20000);
      this._checkReminders();
    },
    _checkReminders() {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      const nowTs = Date.now();
      Object.entries(Store.data.notes).forEach(([tid, arr]) => {
        arr.forEach((n) => {
          if (!n.remindAt || n.remindFired || n.remindAt > nowTs) return;
          n.remindFired = true; Store.save();
          Sync.send('note:remind', { clientId: n.clientId, remindAt: n.remindAt, remindFired: true });
          const th = Store.getThread(tid);
          const title = `⏰ ${th ? th.name : 'NoteThread'}`;
          const body = (n.text || '').slice(0, 120) || 'Lembrete';
          try { new Notification(title, { body, tag: n.clientId }); } catch {}
          this.toast(`⏰ ${th ? th.name : ''}: ${body}`, { kind: 'pin', duration: 6000 });
          haptic('medium');
          this.queueRenderTree();
        });
      });
    },

    // ---------- Composer ----------,
};

