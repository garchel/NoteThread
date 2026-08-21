import { PAGE_SIZE, esc, fmtTime, $ } from '../utils.js';
import { ICON, wrapSvg } from '../icons.js';
import { Store } from '../store.js';

export const NavigationMethods = {
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
};

