import { esc } from '../utils.js';
import { Store } from '../store.js';

export const MentionMethods = {
_mentionToken(ta) {
      // retorna {start, query} se o caret está logo após "@texto"
      const pos = ta.selectionStart;
      const before = ta.value.slice(0, pos);
      const m = before.match(/(?:^|\s)@([^\s@]{0,30})$/);
      return m ? { start: pos - m[1].length - 1, query: m[1] } : null;
    },
    _initMentions(ta) {
      let dd = document.getElementById('mention-dd');
      if (!dd) {
        dd = document.createElement('div');
        dd.id = 'mention-dd';
        dd.className = 'mention-dd hidden';
        document.body.appendChild(dd);
      }
      const close = () => dd.classList.add('hidden');
      this._mentionClose = close;

      const render = (token) => {
        const q = token.query.toLowerCase();
        const list = Store.threadList()
          .filter((t) => !q || (t.name || '').toLowerCase().includes(q))
          .slice(0, 6);
        if (!list.length) { close(); return; }
        dd.innerHTML = list.map((t, i) =>
          `<button type="button" class="mention-opt${i === 0 ? ' sel' : ''}" data-tid="${t.id}" data-name="${esc(t.name)}">${esc(t.emoji || '💬')} ${esc(t.name)}</button>`
        ).join('');
        dd.classList.remove('hidden');
        const r = ta.getBoundingClientRect();
        dd.style.left = Math.max(8, r.left) + 'px';
        dd.style.bottom = (window.innerHeight - r.top + 6) + 'px';
        dd.style.top = 'auto';
        dd.querySelectorAll('.mention-opt').forEach((b) => b.addEventListener('mousedown', (e) => {
          e.preventDefault(); // evita blur do textarea
          this._insertMention(ta, token.start, b.dataset.tid, b.dataset.name); close();
        }));
      };

      ta.addEventListener('input', () => {
        const token = this._mentionToken(ta);
        token ? render(token) : close();
      });
      ta.addEventListener('keydown', (e) => {
        if (dd.classList.contains('hidden')) return;
        const opts = Array.from(dd.querySelectorAll('.mention-opt'));
        let cur = opts.findIndex((o) => o.classList.contains('sel'));
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault(); e.stopImmediatePropagation();
          cur = (cur + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
          opts.forEach((o) => o.classList.remove('sel'));
          opts[cur].classList.add('sel');
        } else if (e.key === 'Enter') {
          e.preventDefault(); e.stopImmediatePropagation(); // não envia a nota
          const b = opts[Math.max(0, cur)];
          this._insertMention(ta, this._mentionToken(ta).start, b.dataset.tid, b.dataset.name);
          close();
        } else if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); }
      }, true); // capture: roda antes do handler de envio
      ta.addEventListener('blur', () => setTimeout(close, 120));
    },
    _insertMention(ta, start, tid, name) {
      const token = `@[${name}](t:${tid}) `;
      const pos = ta.selectionStart;
      ta.value = ta.value.slice(0, start) + token + ta.value.slice(pos);
      ta.selectionStart = ta.selectionEnd = start + token.length;
      ta.focus();
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    },

    // ---------- Lembretes (Notification API) ----------
    async _ensureNotifPermission() {
      if (!('Notification' in window)) return false;
      if (Notification.permission === 'granted') return true;
      if (Notification.permission === 'denied') return false;
      const p = await Notification.requestPermission();
      return p === 'granted';
    },
};

