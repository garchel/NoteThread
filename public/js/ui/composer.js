import { uid, now, fmtTime, haptic, $ } from '../utils.js';
import { Store } from '../store.js';
import { Sync, getSupa, USE_SUPABASE } from '../sync-supabase.js';
import { Sound } from '../sound.js';

export const ComposerMethods = {
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
      ta.addEventListener('input', () => { resize(); send.disabled = ta.value.trim() === '' && !((this.pendingImages||[]).length); });
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
      fileInput.addEventListener('change', async () => {
        const f = fileInput.files && fileInput.files[0]; if (!f) return;
        if (f.size > 5 * 1024 * 1024) { alert('Imagem muito grande (máx 5 MB).'); fileInput.value = ''; return; }
        send.disabled = true;
        // tenta Storage (Supabase) primeiro — evita base64 no Postgres/localStorage
        if (USE_SUPABASE) {
          try {
            const supa = await getSupa();
            const { data: { session } } = await supa.auth.getSession();
            const uid = session && session.user ? session.user.id : null;
            if (uid) {
              const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, '_');
              const path = `${uid}/${Date.now()}-${safeName}`;
              const { error } = await supa.storage.from('note-images').upload(path, f, { cacheControl: '3600', upsert: false });
              if (!error) {
                const { data } = supa.storage.from('note-images').getPublicUrl(path);
                this.pendingImages.push(data.publicUrl);
                this.renderAttachPreview();
                send.disabled = false;
                fileInput.value = '';
                return;
              }
            }
          } catch (e) { console.warn('[storage] upload fail, fallback base64', e); }
        }
        const reader = new FileReader();
        reader.onload = () => { this.pendingImages.push(reader.result); this.renderAttachPreview(); send.disabled = false; };
        reader.readAsDataURL(f);
        fileInput.value = '';
      });
      this.attachPreview = prev;
      this.setupInfiniteScroll();
    },

    _initPullToRefresh() {
      const box = $('#messages'); if (!box) return;
      // cria indicador visual (ícone + texto) no topo do container
      let indicator = document.getElementById('pull-indicator');
      if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'pull-indicator';
        indicator.className = 'pull-indicator hidden';
        indicator.innerHTML = '<div class="pull-spinner"></div><span class="pull-text">Puxe para atualizar</span>';
        box.prepend(indicator);
      }
      const spinner = indicator.querySelector('.pull-spinner');
      const text = indicator.querySelector('.pull-text');
      let startY = 0, pulling = false, threshold = 75, triggered = false;

      const reset = () => {
        box.style.transform = '';
        box.style.transition = 'transform .25s ease';
        indicator.classList.add('hidden');
        indicator.style.opacity = '0';
        if (spinner) spinner.style.transform = 'rotate(0deg)';
        startY = 0; pulling = false; triggered = false;
        if (text) text.textContent = 'Puxe para atualizar';
      };

      box.addEventListener('touchstart', (e) => {
        if (box.scrollTop <= 2) startY = e.touches[0].clientY;
      }, { passive: true });

      box.addEventListener('touchmove', (e) => {
        if (!startY || box.scrollTop > 2) return;
        const dy = e.touches[0].clientY - startY;
        if (dy <= 10) return;
        // impede scroll nativo quando puxando no topo
        if (dy > 20) e.preventDefault();
        const pull = Math.min(80, Math.max(0, dy - 10));
        pulling = pull > 20;
        triggered = pull >= threshold;
        box.style.transform = `translateY(${pull / 2.2}px)`;
        box.style.transition = 'none';
        indicator.classList.remove('hidden');
        indicator.style.opacity = Math.min(1, pull / 50).toString();
        if (spinner) spinner.style.transform = `rotate(${pull * 4}deg)`;
        if (text) {
          text.textContent = triggered ? 'Solte para atualizar' : 'Puxe para atualizar';
          text.style.fontWeight = triggered ? '700' : '600';
          text.style.color = triggered ? 'var(--accent)' : 'var(--text-dim)';
        }
        if (triggered) indicator.classList.add('ready');
        else indicator.classList.remove('ready');
      }, { passive: false });

      const doRefresh = async () => {
        if (text) text.textContent = 'Atualizando…';
        if (spinner) spinner.classList.add('spinning');
        // tenta refresh suave via Supabase antes de recarregar a página
        try {
          if (Sync && Sync.connected && Sync.loadSnapshot) {
            await Sync.loadSnapshot();
            this.renderTree();
            if (this.activeThread) this.renderMessages(true);
            this.toast('Atualizado', { kind: 'success' });
          } else {
            location.reload();
            return;
          }
        } catch {
          location.reload();
          return;
        } finally {
          if (spinner) spinner.classList.remove('spinning');
        }
        reset();
      };

      box.addEventListener('touchend', () => {
        if (triggered) {
          box.style.transform = 'translateY(18px)';
          box.style.transition = 'transform .2s ease';
          doRefresh();
        } else {
          reset();
        }
      }, { passive: true });
      box.addEventListener('touchcancel', reset, { passive: true });
    },

    renderAttachPreview() {
      const prev = this.dom.attachPreview;
      if (!((this.pendingImages||[]).length)) { prev.classList.add('hidden'); prev.innerHTML = ''; return; }
      prev.innerHTML = this.pendingImages.map((src, i) =>
        `<div class="attach-thumb"><img src="${src}" alt="anexo"/><button class="attach-rm" data-i="${i}" title="Remover">×</button></div>`
      ).join('');
      prev.classList.remove('hidden');
      prev.querySelectorAll('.attach-rm').forEach((b) => b.addEventListener('click', () => {
        this.pendingImages.splice(+b.dataset.i, 1); this.renderAttachPreview();
      }));
    },

bindThreadTitle() {
      const name = $('#chat-name');
      name.addEventListener('click', () => this.editThreadTitleInline());
      name.setAttribute('title', 'Clique para renomear');
      name.style.cursor = 'text';
    },

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
      if ((!text && !(this.pendingImages && this.pendingImages.length)) || !this.activeThread) return;
      const clientId = uid();
      const note = {
        clientId, threadId: this.activeThread, text,
        images: (this.pendingImages || []).slice(), ts: now(),
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
};
