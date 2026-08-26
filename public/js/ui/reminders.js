import { now, haptic, $, esc } from '../utils.js';
import { Store } from '../store.js';
import { Sync } from '../sync-supabase.js';
import { ICON, wrapSvg } from '../icons.js';

// SVG inline para substituir emojis estruturais (⏰/⚠) na UI
const svgClock = (s = 12) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="vertical-align:-2px">${ICON.clock}</svg>`;
const svgAlert = (s = 12) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="vertical-align:-2px"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;

export const ReminderMethods = {
showReminderModal(clientId) {
      const arr = Store.notesFor(this.activeThread); const n = arr.find((x) => x.clientId === clientId); if (!n) return;
      const def = new Date(Date.now() + 60 * 60 * 1000);
      const toLocal = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      const has = n.remindAt && !n.remindFired;
      const perm = ('Notification' in window) ? Notification.permission : 'unsupported';
      const permMsg = perm === 'granted'
        ? '<p id="rem-perm" style="font-size:12px;color:var(--ok);margin-top:8px">✓ Notificações ativadas neste dispositivo</p>'
        : perm === 'denied'
          ? '<p id="rem-perm" style="font-size:12px;color:var(--danger);margin-top:8px">⚠ Notificações bloqueadas nas configurações do navegador — o lembrete aparecerá apenas no badge ⏰</p>'
          : '<p id="rem-perm" style="font-size:12px;color:var(--text-dim);margin-top:8px">Ao salvar, será pedido permissão para notificá-lo (inclusive no celular, se o app estiver instalado).</p>';
      const body = `
        <div class="rem-quick">
          <button type="button" data-mins="60">Em 1 hora</button>
          <button type="button" data-mins="180">Em 3 horas</button>
          <button type="button" data-mins="1440">Amanhã</button>
          <button type="button" data-mins="10080">Próx. semana</button>
        </div>
        <label style="display:block;font-size:13px;color:var(--text-dim);margin-bottom:6px;font-weight:600">Lembrar-me em</label>
        <input id="remind-at" type="datetime-local" value="${toLocal(def)}" style="width:100%" />
        ${has ? `<p style="font-size:12.5px;color:var(--text-dim);margin-top:8px">Lembrete ativo para ${new Date(n.remindAt).toLocaleString('pt-BR')}</p>` : ''}
        ${permMsg}`;
      this.showModal('Lembrete', body, () => {
        const v = $('#remind-at').value;
        if (!v) return;
        n.remindAt = new Date(v).getTime();
        n.remindFired = false;
        Store.save();
        Sync.send('note:remind', { clientId, remindAt: n.remindAt, remindFired: false });
        this._ensureNotifPermissionSilent().then((granted) => {
          if (!granted && ('Notification' in window) && Notification.permission === 'denied') {
            this.toast('Notificações bloqueadas — o lembrete aparecerá no badge ⏰', { kind: 'info', duration: 4000 });
          }
        });
        this.updateRemBadge();
        this.queueRenderTree();
        this.closeModal();
        this.toast(`Lembrete: ${new Date(n.remindAt).toLocaleString('pt-BR')}`, { kind: 'success' });
      });
      // atalhos rápidos de horário
      document.querySelectorAll('.rem-quick button').forEach((b) => b.addEventListener('click', () => {
        const d = new Date(Date.now() + (+b.dataset.mins) * 60000);
        $('#remind-at').value = toLocal(d);
      }));
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
      // checa já na abertura do app (pega lembretes vencidos enquanto fechado)
      this._checkReminders();
      // re-checa quando a aba ganha foco / app volta ao primeiro plano
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) this._checkReminders();
      });
      window.addEventListener('focus', () => this._checkReminders());
      this._remindTimer = setInterval(() => this._checkReminders(), 20000);
    },
    async _notifyReminder(title, body, tag, threadId) {
      const havePermission = await this._ensureNotifPermissionSilent();
      if (!havePermission) return false;
      try {
        // PWA instalado (mobile/desktop): usa o Service Worker → notificação do sistema/CELULAR
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg && reg.showNotification) {
            await reg.showNotification(title, {
              body,
              tag,
              icon: './icon-192.png',
              badge: './icon-192.png',
              data: { threadId },
            });
            return true;
          }
        }
        // fallback web: Notification API padrão
        new Notification(title, { body, tag });
        return true;
      } catch (err) {
        console.warn('[reminders] falha ao notificar:', err);
        return false;
      }
    },
    _checkReminders() {
      const nowTs = Date.now();
      let fired = 0;
      Object.entries(Store.data.notes).forEach(([tid, arr]) => {
        arr.forEach((n) => {
          if (!n.remindAt || n.remindFired || n.remindAt > nowTs) return;
          n.remindFired = true; Store.save();
          Sync.send('note:remind', { clientId: n.clientId, remindAt: n.remindAt, remindFired: true });
          const th = Store.getThread(tid);
          const title = `⏰ ${th ? th.name : 'SaveChat'}`;
          const body = (n.text || '').slice(0, 120) || 'Lembrete';
          fired++;
          // notifica (SW no mobile/PWA; Notification API no desktop) e sempre mostra toast in-app
          this._notifyReminder(title, body, n.clientId, tid);
          this.toast(`⏰ ${th ? th.name : ''}: ${body}`, { kind: 'pin', duration: 6000 });
          haptic('medium');
          this.queueRenderTree();
        });
      });
      
      this.updateRemBadge();
      // se o popover estiver aberto, atualiza a lista
      const p = document.getElementById('rem-popover');
      if (p && !p.classList.contains('hidden')) this.renderRemindersList();
    },

    // pede permissão apenas se ainda não decidida (sem popup agressivo)
    async _ensureNotifPermissionSilent() {
      if (!('Notification' in window)) return false;
      if (Notification.permission === 'granted') return true;
      if (Notification.permission === 'denied') return false;
      const p = await Notification.requestPermission();
      return p === 'granted';
    },

    // ---------- Nav: popover de lembretes ----------
    pendingReminders() {
      const out = [];
      Object.entries(Store.data.notes).forEach(([tid, arr]) => {
        (arr || []).forEach((n) => {
          if (n.remindAt && !n.remindFired) out.push({ threadId: tid, note: n });
        });
      });
      return out.sort((a, b) => a.note.remindAt - b.note.remindAt);
    },

    updateRemBadge() {
      const badge = document.getElementById('rem-badge');
      if (!badge) return;
      const count = this.pendingReminders().length;
      if (count > 0) { badge.textContent = count > 9 ? '9+' : String(count); badge.classList.remove('hidden'); }
      else badge.classList.add('hidden');
      this.updateFaviconBadge(count);
    },

    // Favicon dinâmico: bolinha coral com contagem de lembretes pendentes na aba
    updateFaviconBadge(count) {
      try {
        const size = 64, r = 22;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, size, size);
          if (count > 0) {
            // círculo vermelho no canto superior direito
            ctx.beginPath();
            ctx.arc(size - r - 2, r + 2, r, 0, Math.PI * 2);
            ctx.fillStyle = '#e5484d';
            ctx.fill();
            ctx.lineWidth = 3; ctx.strokeStyle = '#ffffff'; ctx.stroke();
            const label = count > 9 ? '9+' : String(count);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold ' + (label.length > 1 ? 20 : 24) + 'px system-ui, sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(label, size - r - 2, r + 4);
          }
          let link = document.querySelector('link[rel="icon"][type="image/png"]');
          if (!link) {
            link = document.createElement('link');
            link.rel = 'icon'; link.type = 'image/png';
            document.head.appendChild(link);
          }
          link.href = canvas.toDataURL('image/png');
        };
        img.src = 'favicon-32.png';
      } catch { /* favicon dinâmico é cosmético — nunca quebrar o app */ }
    },

    toggleRemindersPopover() {
      const p = document.getElementById('rem-popover');
      if (!p) return;
      if (!p.classList.contains('hidden')) { p.classList.add('hidden'); return; }
      this.renderRemindersList();
      p.classList.remove('hidden');
      p.style.visibility = 'hidden';
      const anchor = document.getElementById('nav-reminders');
      const r = anchor.getBoundingClientRect();
      const pw = Math.min(320, window.innerWidth - 16);
      p.style.left = '0px'; p.style.top = '0px';
      let left = r.right + 12;
      if (left + pw > window.innerWidth - 8) left = Math.max(8, r.left - pw - 12);
      let top = Math.max(8, Math.min(r.top, window.innerHeight - p.offsetHeight - 8));
      p.style.left = left + 'px';
      p.style.top = top + 'px';
      p.style.visibility = '';
    },

    renderRemindersList() {
      const list = document.getElementById('rem-list');
      if (!list) return;
      const items = this.pendingReminders();
      if (!items.length) {
        list.innerHTML = '<div class="rem-empty">Nenhum lembrete pendente 🎉</div>';
        return;
      }
      list.innerHTML = items.map(({ threadId, note }) => {
        const th = Store.getThread(threadId);
        const when = new Date(note.remindAt).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
        const snippet = esc((note.text || '').replace(/^(\s*)\[( |x)\]\s*/gm, '').slice(0, 60)) || 'Lembrete';
        const overdue = note.remindAt < Date.now();
        return `<button type="button" class="rem-item" data-tid="${threadId}" data-cid="${note.clientId}">
                  <span class="rem-when${overdue ? ' overdue' : ''}">${overdue ? svgAlert() : svgClock()} ${when}</span>
                  <span class="rem-snippet">${snippet}</span>
                  <span class="rem-thread">${esc(th ? th.name : '')}</span>
                </button>`;
      }).join('');
      list.querySelectorAll('.rem-item').forEach((b) => b.addEventListener('click', () => {
        document.getElementById('rem-popover').classList.add('hidden');
        if (Store.getThread(b.dataset.tid)) this.openThread(b.dataset.tid);
      }));
    },

    // ---------- Notificações: histórico ----------
    allRemindersHistory() {
      const out = [];
      Object.entries(Store.data.notes).forEach(([tid, arr]) => {
        (arr || []).forEach((n) => { if (n.remindAt) out.push({ threadId: tid, note: n }); });
      });
      return out.sort((a, b) => b.note.remindAt - a.note.remindAt);
    },
    updateNotifBadge() {
      const badge = document.getElementById('notif-badge');
      if (!badge) return;
      const count = this.allRemindersHistory().length;
      if (count > 0) { badge.textContent = count > 9 ? '9+' : String(count); badge.classList.remove('hidden'); }
      else badge.classList.add('hidden');
    },
    toggleNotifPopover() {
      const p = document.getElementById('notif-popover');
      if (!p) return;
      if (!p.classList.contains('hidden')) { p.classList.add('hidden'); return; }
      this.renderNotifHistory();
      p.classList.remove('hidden');
      p.style.visibility = 'hidden';
      const anchor = document.getElementById('btn-notifications');
      const r = anchor.getBoundingClientRect();
      const pw = Math.min(360, window.innerWidth - 16);
      p.style.left = '0px'; p.style.top = '0px';
      let left = r.right + 12;
      if (left + pw > window.innerWidth - 8) left = Math.max(8, r.left - pw - 12);
      let top = Math.max(8, Math.min(r.top, window.innerHeight - p.offsetHeight - 8));
      p.style.left = left + 'px';
      p.style.top = top + 'px';
      p.style.visibility = '';
    },
    renderNotifHistory() {
      const list = document.getElementById('notif-list');
      if (!list) return;
      const items = this.allRemindersHistory();
      if (!items.length) { list.innerHTML = '<div class="rem-empty">Nenhum lembrete ainda</div>'; return; }
      list.innerHTML = items.map(({ threadId, note }) => {
        const th = Store.getThread(threadId);
        const when = new Date(note.remindAt).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
        const snippet = esc((note.text || '').replace(/^(\s*)\[( |x)\]\s*/gm, '').slice(0, 60)) || 'Lembrete';
        const fired = note.remindFired;
        return `<button type="button" class="rem-item" data-tid="${threadId}" data-cid="${note.clientId}">
                  <span class="rem-when${fired ? '' : ' overdue'}">${fired ? svgAlert() : svgClock()} ${when} ${fired ? '· disparado' : '· pendente'}</span>
                  <span class="rem-snippet">${snippet}</span>
                  <span class="rem-thread">${esc(th ? th.name : '')}</span>
                </button>`;
      }).join('');
      list.querySelectorAll('.rem-item').forEach((b) => b.addEventListener('click', () => {
        document.getElementById('notif-popover').classList.add('hidden');
        if (Store.getThread(b.dataset.tid)) this.openThread(b.dataset.tid);
      }));
    },

    // ---------- Composer ----------,
};

