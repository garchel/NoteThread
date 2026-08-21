import { PAGE_SIZE, esc, fmtTime, now, haptic, $ } from '../utils.js';
import { ICON, wrapSvg } from '../icons.js';
import { renderMarkdown } from '../markdown.js';
import { Store } from '../store.js';
import { Sync } from '../sync-supabase.js';
import { Sound } from '../sound.js';

export const MessagesMethods = {
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
      // destaca a thread ativa sem reconstruir a árvore (evita re-render do explorador)
      document.querySelectorAll('.tnode.active').forEach((el) => el.classList.remove('active'));
      document.querySelectorAll(`.tnode[data-tid="${id}"]`).forEach((el) => el.classList.add('active'));
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
      const clientId = n.clientId; // escopo p/ os handlers abaixo
      const mine = n.userId === (Store.user && Store.user.mail) || n.local;
      const thread = Store.getThread(this.activeThread);
      const isPinned = thread && thread.pinnedId === n.clientId;
      div.className = 'bubble' + (mine ? '' : ' remote') + (n.pending ? ' pending' : '') + (isPinned ? ' pinned' : '');
      div.dataset.clientId = n.clientId;
      div.dataset.day = new Date(n.ts).toDateString();
      div.setAttribute('draggable', 'true');
      // seleção de texto: arrastar o mouse DESLIGA o drag nativo (que rouba a seleção)
      div.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        const sx = e.clientX, sy = e.clientY;
        let off = false;
        const mv = (ev) => {
          if (!off && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 6) {
            off = true;
            div.setAttribute('draggable', 'false'); // browser assume seleção
          }
        };
        const up = () => {
          window.removeEventListener('mousemove', mv);
          window.removeEventListener('mouseup', up);
          // restaura o drag depois que a seleção termina
          setTimeout(() => { if (!el_isEditing()) div.setAttribute('draggable', 'true'); }, 60);
        };
        const el_isEditing = () => div.isContentEditable || div.classList.contains('editing');
        window.addEventListener('mousemove', mv);
        window.addEventListener('mouseup', up);
      });

      const editedMark = n.edited ? '<span class="edited">editada</span>' : '';
      const meta = `<span class="meta">${editedMark}${n.pending ? 'enviando…' : fmtTime(n.ts)}</span>`;
      const pinBadge = isPinned ? `<span class="pin-badge" title="Mensagem fixada">${wrapSvg(ICON.pin, 12)}</span>` : '';
      const toggle = `<button class="msg-toggle" title="Ações" aria-label="Ações">${wrapSvg(ICON.chevron, 12)}</button>`;
      const tags = (n.tags && n.tags.length) ? `<div class="bubble-tags">${n.tags.map((t) => `<span class="tag-chip">#${esc(t)}</span>`).join('')}</div>` : '';
      const imgs = (n.images && n.images.length) ? `<div class="bubble-images">${n.images.map((src) => `<img class="bubble-img" src="${src}" alt="anexo" loading="lazy"/>`).join('')}</div>` : '';

      const hideDone = !!(Store.data.ui && Store.data.ui.hideDoneChecks);
      div.innerHTML = `${pinBadge}${imgs}${renderMarkdown(n.text, hideDone)}${tags}${meta}${toggle}`;

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
      // Checkboxes clicáveis: marcar/desmarcar persiste no texto da nota
      div.querySelectorAll('.md-check input[type="checkbox"]').forEach((cb) => {
        cb.addEventListener('click', (e) => e.stopPropagation());
        cb.addEventListener('change', () => {
          try { this.toggleNoteCheckbox(clientId, +cb.dataset.chk, cb.checked); }
          catch (err) { console.error('[checklist] falha ao alternar:', err); }
        });
      });
      // Menções @: clicar abre a thread referenciada
      div.querySelectorAll('.mention').forEach((m) => {
        m.addEventListener('click', (e) => { e.stopPropagation(); const tid = m.dataset.tid; if (Store.getThread(tid)) this.openThread(tid); });
      });

      return div;
    },

    // marca/desmarca o N-ésimo checkbox do texto ([ ] ↔ [x]) e sincroniza
    toggleNoteCheckbox(clientId, index, checked) {
      const arr = Store.notesFor(this.activeThread); const n = arr.find((x) => x.clientId === clientId); if (!n) return;
      let i = -1;
      const lines = (n.text || '').split('\n');
      const newLines = lines.map((l) => {
        const m = l.match(/^(\s*)\[( |x)\]\s*(.*)$/i);
        if (!m) return l;
        i += 1;
        if (i !== index) return l;
        return `${m[1]}[${checked ? 'x' : ' '}] ${m[3]}`;
      });
      if (i < index) return; // índice inválido
      n.text = newLines.join('\n'); n.editedAt = now(); n.rev = (n.rev || 0) + 1; Store.save();
      Sync.send('note:edit', { threadId: this.activeThread, clientId, text: n.text, edited: !!n.edited, editedAt: n.editedAt, rev: n.rev });
      const hideDone = !!(Store.data.ui && Store.data.ui.hideDoneChecks);
      if (hideDone && checked) {
        // fade out suave e remoção DIRETA do nó (reflow automático do flex/gap)
        const el = document.querySelector(`.bubble[data-client-id="${clientId}"]`);
        const input = el && el.querySelector(`.md-check input[data-chk="${index}"]`);
        const wrap = input && input.closest('.md-check');
        if (wrap) {
          wrap.style.maxHeight = wrap.scrollHeight + 'px'; // fixa altura atual p/ animar colapso
          requestAnimationFrame(() => {
            wrap.classList.add('chk-out');
            const remove = () => { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); };
            wrap.addEventListener('transitionend', remove, { once: true });
            setTimeout(remove, 350); // fallback
          });
          return;
        }
      }
      this._replaceBubble(clientId, n);
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
        else if (act === 'remind') this.showReminderModal(cid);
        else if (act === 'cancel-remind') this.cancelReminder(cid);
      });
    },
    openMsgPopover(bubbleEl, note) {
      const p = this.dom.msgPopover;
      this.popoverClientId = note.clientId;
      const thread = Store.getThread(this.activeThread);
      const isPinned = thread && thread.pinnedId === note.clientId;
      const hasRemind = !!(note.remindAt && !note.remindFired);
      p.querySelector('[data-msg="pin"]').classList.toggle('hidden', isPinned);
      p.querySelector('[data-msg="unpin"]').classList.toggle('hidden', !isPinned);
      p.querySelector('[data-msg="cancel-remind"]').classList.toggle('hidden', !hasRemind);
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
      // sem ghost image (1px transparente)
      try {
        const img = new Image();
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        e.dataTransfer.setDragImage(img, 0, 0);
      } catch (_) {}
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
    // substitui a bolha preservando listeners (outerHTML perde eventos → arrow morta)
    _replaceBubble(clientId, note) {
      const fresh = document.querySelector(`.bubble[data-client-id="${clientId}"]`);
      if (fresh) fresh.replaceWith(this.bubbleEl(note));
    },
    editNoteInline(clientId) {
      const el = document.querySelector(`.bubble[data-client-id="${clientId}"]`);
      if (!el || el.isContentEditable) return;
      const arr = Store.notesFor(this.activeThread); const n = arr.find((x) => x.clientId === clientId); if (!n) return;
      const meta = el.querySelector('.meta'); const toggle = el.querySelector('.msg-toggle');
      const pinBadge = el.querySelector('.pin-badge');
      el.setAttribute('contenteditable', 'true');
      el.classList.add('editing');
      el.textContent = n.text;
      if (meta) el.appendChild(meta);
      if (toggle) el.appendChild(toggle);
      if (pinBadge) el.insertBefore(pinBadge, el.firstChild);

      const sel = window.getSelection(); const range = document.createRange();
      range.selectNodeContents(el); range.collapse(false);
      sel.removeAllRanges(); sel.addRange(range);

      let done = false;
      const finish = (save) => {
        if (done) return; done = true; // Enter + blur disparavam 2× (timer duplicado)
        el.removeAttribute('contenteditable');
        el.classList.remove('editing');
        el.removeEventListener('keydown', onKey);
        el.removeEventListener('blur', onBlur);
        if (save) {
          // lê SÓ o texto digitado — ignora meta/toggle (antes textContent incluía "10:30" → timer duplicado)
          const clone = el.cloneNode(true);
          clone.querySelectorAll('.meta,.msg-toggle,.pin-badge,.md-checklist').forEach((r) => r.remove());
          const v = clone.textContent.replace(/\s+$/, '').trim() || clone.textContent.replace(/[\n\r]+$/, '');
          if (v && v !== n.text) {
            const updated = Store.editNote(this.activeThread, clientId, v);
            if (updated) {
              Sync.send('note:edit', { threadId: this.activeThread, clientId, text: updated.text, edited: updated.edited, editedAt: updated.editedAt, rev: updated.rev });
              this.renderedClientIds.delete(clientId);
              this._replaceBubble(clientId, Store.notesFor(this.activeThread).find((x) => x.clientId === clientId) || updated);
              return;
            }
          }
        }
        this.renderedClientIds.delete(clientId);
        this._replaceBubble(clientId, n);
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
      const arr = Store.notesFor(this.activeThread); const n = arr.find((x) => x.clientId === clientId); if (!n) return;
      const body = `<p class="del-note-hint">A nota será excluída permanentemente. Você poderá desfazer por 10 segundos após excluir.</p>`;
      this.showModal('Excluir nota', body, () => {
        this.closeModal();
        this.deleteNote(clientId);
        Sound.play('delete'); haptic('delete');
      });
      const okBtn = this.dom.modalOk;
      okBtn.classList.add('btn-danger');
      okBtn.textContent = 'Excluir';
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
          this._replaceBubble(clientId, updated);
        }
        this.closeModal();
      });
    },
    togglePin(clientId) {
      const th = Store.getThread(this.activeThread); if (!th) return;
      const newPin = Store.setPinned(this.activeThread, clientId);
      // envia estado EXPLÍCITO (evita recomputar errado após flip local)
      Sync.send('note:pin', { threadId: this.activeThread, clientId, pinned: newPin != null });
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
};

