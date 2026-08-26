import { uid, now, fmtTime, haptic, $ } from '../utils.js';
import { Store } from '../store.js';
import { Sync, getSupa, USE_SUPABASE } from '../sync-supabase.js';
import { Sound } from '../sound.js';

export const ComposerMethods = {
    // ---------- Banner de erro de sync no composer (retry inline) ----------
    showSyncError() {
      const b = $('#sync-error-banner');
      if (b) b.classList.remove('hidden');
    },
    hideSyncError() {
      const b = $('#sync-error-banner');
      if (b) b.classList.add('hidden');
    },

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
      ta.addEventListener('input', () => { resize(); this._updateSendAudioState(ta, send); this._renderMentionHighlight(ta); });
      // retry inline do banner de sync
      const retryBtn = $('#sync-retry');
      if (retryBtn) retryBtn.addEventListener('click', async () => {
        retryBtn.disabled = true; retryBtn.textContent = 'Conectando…';
        try { if (Sync.ws) Sync.ws.close(); } catch {}
        Sync.connect();
        setTimeout(() => { retryBtn.disabled = false; retryBtn.textContent = 'Tentar agora'; }, 2500);
      });
      // autocomplete de menções @ (registrado ANTES do keydown de envio p/ interceptar Enter)
      this._initMentions(ta);
      // highlight inicial (caso o rascunho já tenha menções) e ao abrir thread nova
      setTimeout(() => this._renderMentionHighlight(ta), 0);
      window.addEventListener('resize', () => { if (this._hlSync) this._hlSync(); });
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
        else if (e.key === 'Enter' && !e.shiftKey) {
          // mobile: Enter também continua listas (desktop usa Shift+Enter p/ enviar)
          const isTouch = window.matchMedia('(hover: none)').matches;
          if (isTouch && this._listContinuation(ta)) { e.preventDefault(); return; }
          e.preventDefault(); this.sendNote();
        }
        else if (e.key === 'Enter' && e.shiftKey) {
          // Shift+Enter: quebra linha; se a linha atual é item de checklist, bullet
          // ou lista numerada, continua a lista na próxima linha
          e.preventDefault();
          this._listContinuation(ta);
        }
      });
      // barra de formatação
      document.querySelectorAll('.fmt-btn').forEach((b) => b.addEventListener('click', () => this.applyFormat(b.dataset.fmt)));
      // botão único send/áudio: em modo áudio grava; com texto envia
      send.addEventListener('click', () => {
        if (this._audioMode) { this._startAudioRecording(send); return; }
        if (this._recording) return;
        this.sendNote();
      });
      // estado inicial do botão (microfone quando vazio)
      this._updateSendAudioState(ta, send);
      // anexos
      const attach = this.dom.btnAttach, fileInput = this.dom.fileInput, prev = this.dom.attachPreview;
      attach.addEventListener('click', () => fileInput.click());
      // compressão client-side via canvas (1280px, 0.7) antes do upload
      const compressImage = (file) => new Promise((resolve) => {
        if (!file.type.startsWith('image/')) return resolve(file);
        const img = new Image();
        img.onload = () => {
          const max = 1280, q = 0.7;
          let { width: w, height: h } = img;
          if (w > max || h > max) {
            if (w > h) { h = Math.round(h * max / w); w = max; }
            else { w = Math.round(w * max / h); h = max; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          canvas.toBlob((blob) => {
            URL.revokeObjectURL(img.src);
            resolve(blob ? new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }) : file);
          }, 'image/jpeg', q);
        };
        img.onerror = () => resolve(file);
        img.src = URL.createObjectURL(file);
      });
      fileInput.addEventListener('change', async () => {
        const f = fileInput.files && fileInput.files[0]; if (!f) return;
        if (f.size > 5 * 1024 * 1024) { alert('Imagem muito grande (máx 5 MB).'); fileInput.value = ''; return; }
        send.disabled = true;
        const fileToUpload = await compressImage(f);
        if (USE_SUPABASE) {
          try {
            const supa = await getSupa();
            const { data: { session } } = await supa.auth.getSession();
            const uid = session && session.user ? session.user.id : null;
            if (uid) {
              const safeName = fileToUpload.name.replace(/[^a-zA-Z0-9._-]/g, '_');
              const path = `${uid}/${Date.now()}-${safeName}`;
              const { error } = await supa.storage.from('note-images').upload(path, fileToUpload, { cacheControl: '3600', upsert: false });
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
        reader.readAsDataURL(fileToUpload);
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
      // bold/italic: TOGGLE de modo — enquanto ativo, as próximas palavras saem formatadas
      if (kind === 'bold' || kind === 'italic') {
        this._fmtMode = this._fmtMode || {};
        // se há seleção, aplica wrap direto na seleção (comportamento clássico)
        if (ta.selectionStart !== ta.selectionEnd) { this._wrapSelection(ta, kind); return; }
        const wrap = kind === 'bold' ? '**' : '*';
        if (this._fmtMode[kind]) {
          // desliga: fecha o par aberto (se houver texto depois do último marcador)
          this._fmtMode[kind] = false;
          const pos = ta.selectionStart;
          const before = ta.value.slice(0, pos), after = ta.value.slice(pos);
          const marker = kind === 'bold' ? '**' : '*';
          const lastOpen = before.lastIndexOf(marker);
          if (lastOpen !== -1 && !before.slice(lastOpen + marker.length).includes(marker)) {
            ta.value = ta.value.slice(0, pos) + marker + ta.value.slice(pos);
            ta.selectionStart = ta.selectionEnd = pos;
          }
          this.toast(kind === 'bold' ? 'Negrito desligado' : 'Itálico desligado', { kind: 'info', duration: 1500 });
        } else {
          // liga: abre o par no cursor
          this._fmtMode[kind] = true;
          const marker2 = kind === 'bold' ? '**' : '*';
          const pos = ta.selectionStart;
          ta.value = ta.value.slice(0, pos) + marker2 + ta.value.slice(pos);
          ta.selectionStart = ta.selectionEnd = pos + marker2.length;
          this.toast(kind === 'bold' ? 'Negrito ligado — as próximas palavras sairão em negrito' : 'Itálico ligado — as próximas palavras sairão em itálico', { kind: 'info', duration: 1800 });
        }
        this._updateFmtToggleUI(ta);
        ta.focus(); ta.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
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
      } else if (kind === 'ordered-list') {
        // lista numerada: numera cada linha da seleção (ou insere "1. " no cursor se vazio)
        const inner = sel || '';
        let listed;
        const stripNum = (l) => l.replace(/^\d+\.\s+/, '');
        if (inner) {
          let n = 1;
          listed = inner.split('\n').map((l) => {
            const clean = stripNum(l);
            return n++ + '. ' + clean;
          }).join('\n');
          ta.value = before + listed + after;
          ta.selectionStart = start; ta.selectionEnd = start + listed.length;
        } else {
          const lineStart = before.lastIndexOf('\n') + 1;
          const lineHead = before.slice(0, lineStart);
          const curLine = before.slice(lineStart);
          // continua a numeração se a linha anterior já é item numerado
          const prevMatch = lineHead.match(/(\d+)\.\s+[^\n]*\n?$/) || curLine.match(/^(\d+)\.\s+/);
          const next = prevMatch ? parseInt(prevMatch[1], 10) + 1 : 1;
          const prefix = next + '. ';
          const newBefore = lineHead + prefix + stripNum(curLine);
          ta.value = newBefore + after;
          ta.selectionStart = ta.selectionEnd = newBefore.length;
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

    // envolve a seleção com marcador (bold/italic clássico sobre texto selecionado)
    _wrapSelection(ta, kind) {
      const wrap = kind === 'bold' ? '**' : '*';
      const start = ta.selectionStart, end = ta.selectionEnd;
      const inner = ta.value.slice(start, end);
      ta.value = ta.value.slice(0, start) + wrap + inner + wrap + ta.value.slice(end);
      ta.selectionStart = start + wrap.length;
      ta.selectionEnd = start + wrap.length + inner.length;
      this._updateFmtToggleUI(ta);
      ta.focus(); ta.dispatchEvent(new Event('input', { bubbles: true }));
    },

    // atualiza estado visual dos botões toggle (bold/italic) conforme o modo ativo
    // e o modo é desligado automaticamente se o par de marcadores já foi fechado no texto
    _updateFmtToggleUI(ta) {
      document.querySelectorAll('.fmt-btn.fmt-toggle').forEach((b) => {
        const k = b.dataset.fmt;
        const active = !!(this._fmtMode && this._fmtMode[k]);
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', String(active));
      });
      this._renderMentionHighlight(ta);
    },

    // Shift+Enter / Enter(mobile): continua checklist, bullet ou lista numerada
    _listContinuation(ta) {
      const pos = ta.selectionStart;
      const lineStart = ta.value.lastIndexOf('\n', pos - 1) + 1;
      const curLine = ta.value.slice(lineStart, pos);
      let ins = '\n';
      const mChk = curLine.match(/^(\[x\]|\[ \])\s+/i);
      const mBul = curLine.match(/^(\s*)[-*]\s+/);
      const mNum = curLine.match(/^(\s*)(\d+)[.)]\s+/);
      if (mChk) ins = '\n[ ] ';
      else if (mNum) ins = '\n' + mNum[1] + (parseInt(mNum[2], 10) + 1) + '. ';
      else if (mBul) ins = '\n' + mBul[1] + '- ';
      else return false; // não é lista — deixa o chamador decidir (enviar nota)
      ta.value = ta.value.slice(0, pos) + ins + ta.value.slice(ta.selectionEnd);
      ta.selectionStart = ta.selectionEnd = pos + ins.length;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    },

    // botão único send/áudio: com texto (ou anexo) mostra ✈ enviar; vazio mostra 🎤 gravar
    _updateSendAudioState(ta, send) {
      const hasContent = ta.value.trim() !== '' || ((this.pendingImages || []).length > 0);
      this._audioMode = !hasContent;
      send.classList.toggle('audio-mode', this._audioMode);
      send.disabled = false; // áudio está sempre disponível
      const micSvg = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
      const sendSvg = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
      const want = this._audioMode ? micSvg : sendSvg;
      if (!send.innerHTML.includes(this._audioMode ? 'M12 1a3' : 'x1="22"')) {
        send.innerHTML = want;
        send.setAttribute('aria-label', this._audioMode ? 'Gravar áudio' : 'Enviar');
        send.title = this._audioMode ? 'Gravar áudio' : 'Enviar';
      }
    },

    // gravação de áudio via MediaRecorder; envia como anexo de áudio na nota
    async _startAudioRecording(send) {
      if (this._recording) {
        // parar e enviar
        this._mediaRecorder.stop();
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const rec = new MediaRecorder(stream);
        const chunks = [];
        rec.ondataavailable = (e) => chunks.push(e.data);
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
          const duration = Math.round((Date.now() - this._recStart) / 1000);
          this._recording = false;
          clearInterval(this._recTimer);
          send.classList.remove('recording');
          if (duration < 1) { this.toast('Gravação muito curta', { kind: 'info' }); return; }
          const file = new File([blob], `audio-${Date.now()}.webm`, { type: blob.type });
          (this.pendingImages = this.pendingImages || []).push(file);
          this.renderAttachPreview();
          this.toast(`Áudio de ${duration}s anexado`, { kind: 'success' });
        };
        this._mediaRecorder = rec;
        this._recStart = Date.now();
        this._recording = true;
        rec.start();
        send.classList.add('recording');
        let secs = 0;
        this._recTimer = setInterval(() => { secs++; send.title = `Gravando… ${secs}s (clique para parar)`; }, 1000);
        this.toast('Gravando áudio — clique novamente para parar', { kind: 'info', duration: 2500 });
      } catch (err) {
        this.toast('Não foi possível acessar o microfone', { kind: 'error' });
      }
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

appendNoteRealtime(n, fromRemote) {
      const box = $('#messages');
      $('#empty-state').classList.add('hidden');
      // echo guard: se a bolha já está no DOM (enviada por ESTE dispositivo), não duplica
      const existing = box.querySelector(`.bubble[data-client-id="${n.clientId}"]`);
      if (existing) { existing.classList.remove('pending'); return; }
      const el = this.bubbleEl(n, { isNew: true });
      if (!fromRemote) {
        // envio próprio: pop com spring (A2)
        el.classList.add('just-sent');
      }
      box.appendChild(el);
      box.scrollTop = box.scrollHeight;
      const meta = el.querySelector('.meta'); if (meta) meta.textContent = fmtTime(n.ts);
      el.classList.remove('pending');
      // M1 fix: limpa .is-new após a entrada para não re-animar em renders futuros
      el.addEventListener('animationend', () => el.classList.remove('is-new'), { once: true });
      setTimeout(() => { if (!fromRemote) el.classList.remove('just-sent'); }, 320);
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
