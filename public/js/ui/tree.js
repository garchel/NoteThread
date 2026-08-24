import { uid, now, esc, haptic, $ } from '../utils.js';
import { ICON, wrapSvg, COLOR_PALETTE, colorById, glyphSvg, GLYPH_ICONS } from '../icons.js';
import { Store } from '../store.js';
import { Sync } from '../sync-supabase.js';
import { Sound } from '../sound.js';

export const TreeMethods = {
bindTreeActions() {
      $('#btn-new-thread').addEventListener('click', () => this.createThread());
      $('#btn-new-folder').addEventListener('click', () => this.createFolder());
      $('#btn-back').addEventListener('click', () => $('#app').classList.remove('show-chat'));
    },

createThread() {
      let chosen = 'chat'; // id do ícone vetorial (GLYPH_ICONS)
      let chosenColor = null;
      const body = `
        <label style="display:block;font-size:13px;color:var(--text-dim);margin-bottom:6px;font-weight:600">Nome da conversa</label>
        <input id="nt-name" type="text" placeholder="ex: Ideias de Projetos, Tarefas Diárias…" autofocus />
        <label style="display:block;font-size:13px;color:var(--text-dim);margin:14px 0 6px;font-weight:600">Cor</label>
        ${this._colorSwatchesHTML('nt', null)}
        <label style="display:block;font-size:13px;color:var(--text-dim);margin:14px 0 6px;font-weight:600">Ícone</label>
        <div id="nt-glyphs">${this._glyphPickerHTML('nt', chosen)}</div>`;
      this.showModal('Nova conversa', body, () => {
        const v = ($('#nt-name').value || '').trim();
        if (!v) { $('#nt-name').focus(); return; }
        const t = { id: uid(), name: v, emoji: chosen, color: chosenColor || undefined, folderId: this.activeFolderContext || null, favorite: false, createdAt: now(), updatedAt: now(), lastPreview: '', userId: Store.user ? Store.user.mail : 'anon' };
        Store.upsertThread(t);
        Sync.send('thread:upsert', t);
        this.renderTree();
        this.closeModal();
        Sound.play('create'); haptic('success');
        this.openThread(t.id);
      });
      this._bindColorSwatches('nt', null, (c) => { chosenColor = c; });
      this._bindGlyphPicker('nt', (g) => { chosen = g; });
      setTimeout(() => $('#nt-name') && $('#nt-name').focus(), 50);
    },

createFolder() {
      let chosen = 'folder';
      let chosenColor = null;
      const body = `
        <label style="display:block;font-size:13px;color:var(--text-dim);margin-bottom:6px;font-weight:600">Nome da pasta</label>
        <input id="nf-name" type="text" placeholder="ex: Trabalho, Pessoal, Estudos…" autofocus />
        <label style="display:block;font-size:13px;color:var(--text-dim);margin:14px 0 6px;font-weight:600">Cor</label>
        ${this._colorSwatchesHTML('nf', null)}
        <label style="display:block;font-size:13px;color:var(--text-dim);margin:14px 0 6px;font-weight:600">Ícone</label>
        <div id="nf-glyphs">${this._glyphPickerHTML('nf', chosen)}</div>`;
      this.showModal('Nova pasta', body, () => {
        const v = ($('#nf-name').value || '').trim();
        if (!v) { $('#nf-name').focus(); return; }
        const f = { id: uid(), name: v, emoji: chosen, color: chosenColor || undefined, parentId: null, createdAt: now(), userId: Store.user ? Store.user.mail : 'anon' };
        Store.upsertFolder(f);
        Store.setExpanded(f.id, true);
        Sync.send('folder:upsert', f);
        this.closeModal();
        Sound.play('create'); haptic('success');
        this.renderTree();
      });
      this._bindColorSwatches('nf', null, (c) => { chosenColor = c; });
      this._bindGlyphPicker('nf', (g) => { chosen = g; });
      setTimeout(() => $('#nf-name') && $('#nf-name').focus(), 50);
    },

sortThreads(list) {
      const mode = (Store.data && Store.data.ui && Store.data.ui.sort) || 'recent';
      const arr = list.slice();
      if (mode === 'manual') arr.sort((a, b) => (a.order || 0) - (b.order || 0));
      else if (mode === 'name') arr.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' }));
      else arr.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      return arr;
    },

queueRenderTree() { clearTimeout(this._rtTimer); this._rtTimer = setTimeout(() => this.renderTree(), 90); },

renderTree() {
      this.renderFavorites();
      const tree = this.dom.tree;
      tree.innerHTML = '';
      const folders = Store.folderList();
      const threads = Store.threadList().filter((t) => !t.favorite && !t.folderId);

      if (!folders.length && !threads.length) {
        tree.innerHTML = `<div class="tree-empty">
          <div class="te-title">Comece sua primeira conversa</div>
          <div class="te-sub">Anote ideias, tarefas e reflexões como mensagens de chat.</div>
          <button class="te-btn" id="te-create">${wrapSvg(ICON.plus, 14)} Nova conversa</button>
        </div>`;
        const b = tree.querySelector('#te-create'); if (b) b.addEventListener('click', () => this.createThread());
      }

      // Pastas (com suas threads dentro)
      folders.forEach((f) => tree.appendChild(this.folderNode(f)));
      // Threads soltas (raiz)
      this.sortThreads(threads).forEach((t) => tree.appendChild(this.threadNode(t, 0)));
    },

folderNode(f) {
      const kids = this.sortThreads(Store.threadList().filter((t) => !t.favorite && t.folderId === f.id));
      const expanded = Store.isExpanded(f.id);

      const row = document.createElement('div');
      row.className = 'tnode folder-node' + (expanded ? '' : ' collapsed');
      row.dataset.fid = f.id;
      row.setAttribute('draggable', 'true');
      // ícone grande colorido (mesmo estilo dos cadernos); cor salva ou hash
      // estilos inline: independem do styles.css (cache-proof)
      const fcol = this._cadernoColor(f);
      const fglyph = glyphSvg(f.emoji);
      const fInner = fglyph || esc(f.emoji || '📁');
      const isGlyphF = !!fglyph;
      const fico = `<span class="caderno-ico" style="width:52px;height:52px;border-radius:12px;display:grid;place-items:center;flex-shrink:0;background:${fcol.bg};color:${fcol.fg};font-size:${isGlyphF ? '0' : '22px'};box-shadow:var(--shadow-sm)">${isGlyphF ? fInner.replace('<svg ', '<svg style="width:26px;height:26px" ') : fInner}</span>`;
      row.innerHTML = `<span class="twist">${wrapSvg(ICON.chevron, 10)}</span><span class="ico">${fico}</span>
                       <span class="label">${esc(f.name)}</span><span class="count">${kids.length || ''}</span>`;
      row.addEventListener('click', () => {
        const v = !Store.isExpanded(f.id);
        Store.setExpanded(f.id, v);
        row.classList.toggle('collapsed', !v);
        const ch = row.nextElementSibling;
        if (ch && ch.classList.contains('children')) {
          if (v) { ch.style.maxHeight = ch.scrollHeight + 'px'; setTimeout(() => { ch.style.maxHeight = 'none'; }, 240); }
          else { ch.style.maxHeight = ch.scrollHeight + 'px'; requestAnimationFrame(() => { ch.style.maxHeight = '0px'; }); }
        }
      });
      // menu de contexto na pasta (reutiliza thread ctx levemente)
      row.addEventListener('contextmenu', (e) => { e.preventDefault(); this.ctxFolderId = f.id; this.openFolderMenu(e, f); });
      // Long-press para mobile
      row.addEventListener('touchstart', (e) => {
        this.onTnodeTouchEnd();
        this.tnodeLongPressTimer = setTimeout(() => {
          const touch = e.touches[0];
          const fakeEvent = { clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => {}, stopPropagation: () => {} };
          this.ctxFolderId = f.id; this.openFolderMenu(fakeEvent, f);
        }, 500);
      }, { passive: true });
      row.addEventListener('touchend', () => this.onTnodeTouchEnd());
      row.addEventListener('touchmove', () => this.onTnodeTouchEnd());

      const wrap = document.createElement('div');
      wrap.appendChild(row);
      const children = document.createElement('div');
      children.className = 'children';
      if (!expanded) children.style.maxHeight = '0px';
      kids.forEach((t) => children.appendChild(this.threadNode(t, 1)));
      if (!kids.length) {
        // estado vazio da pasta: ícone + texto + ação direta de criar nota
        const empty = document.createElement('button');
        empty.type = 'button';
        empty.className = 'folder-empty';
        empty.title = 'Criar uma anotação nesta pasta';
        empty.innerHTML = `<span class="fe-ic">${wrapSvg(ICON.plus, 14)}</span>
                           <span class="fe-text"><strong>Pasta vazia</strong><small>Clique para criar a primeira anotação</small></span>`;
        empty.addEventListener('click', (e) => {
          e.stopPropagation();
          this.activeFolderContext = f.id;
          this.createThread();
          this.activeFolderContext = null;
        });
        children.appendChild(empty);
      }
      wrap.appendChild(children);
      return wrap;
    },

    _colorSwatchesHTML(prefix, selectedId) {
      return `<div class="color-swatches" id="${prefix}-colors">` +
        COLOR_PALETTE.map((c) => `<button type="button" class="color-swatch${c.id === selectedId ? ' sel' : ''}" data-color="${c.id}" style="background:${c.bg}" title="${c.id}" aria-label="Cor ${c.id}"></button>`).join('') +
        `</div>`;
    },
    _bindColorSwatches(prefix, initialId, onPick) {
      const root = $(`#${prefix}-colors`);
      if (!root) return;
      let current = initialId;
      root.querySelectorAll('.color-swatch').forEach((b) => b.addEventListener('click', () => {
        root.querySelectorAll('.color-swatch.sel').forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel');
        current = b.dataset.color;
        onPick(current);
      }));
      return () => current;
    },
    _cadernoColor(t) {
      // cor escolhida pelo usuário tem prioridade; senão, hash determinístico
      const chosen = t.color && colorById(t.color);
      if (chosen) return chosen;
      const palette = COLOR_PALETTE;
      let hash = 0;
      const str = t.id + (t.emoji || t.name || '');
      for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
      return palette[hash % palette.length];
    },
    threadNode(t, depth) {
      const el = document.createElement('div');
      el.className = 'tnode cozy-caderno' + (this.activeThread === t.id ? ' active' : '') + (t.favorite ? ' fav' : '');
      el.dataset.tid = t.id;
      el.setAttribute('draggable', 'true');
      el.style.paddingLeft = (8 + depth * 16) + 'px';
      let ic;
      const col = this._cadernoColor(t);
      // ícone escolhido (glifo vetorial) > emoji legado > favorito > fallback
      // estilos inline: independem do styles.css (cache-proof)
      const tGlyph = t.emoji && glyphSvg(t.emoji);
      const icoBase = `width:52px;height:52px;border-radius:12px;display:grid;place-items:center;flex-shrink:0;background:${col.bg};color:${col.fg};font-size:22px;box-shadow:var(--shadow-sm)`;
      if (tGlyph) ic = `<span class="caderno-ico" style="${icoBase};font-size:0">${tGlyph.replace('<svg ', '<svg style="width:26px;height:26px" ')}</span>`;
      else if (t.favorite) ic = `<span class="caderno-ico" style="${icoBase}">${wrapSvg(ICON.star, 20)}</span>`;
      else if (t.emoji) ic = `<span class="caderno-ico" style="${icoBase}">${esc(t.emoji)}</span>`;
      else ic = `<span class="caderno-ico" style="${icoBase};font-size:0">${glyphSvg('chat').replace('<svg ', '<svg style="width:26px;height:26px" ')}</span>`;
      const noteCount = Store.notesFor(t.id).length;
      const countEl = noteCount ? `<span class="note-count" title="${noteCount} nota${noteCount !== 1 ? 's' : ''}">${noteCount}</span>` : '';
      // badge ⏰ se a thread tem lembrete pendente
      const hasRemind = Store.notesFor(t.id).some((x) => x.remindAt && !x.remindFired);
      const remindEl = hasRemind ? '<span class="remind-badge" title="Lembrete pendente">⏰</span>' : '';
      el.innerHTML = `<span class="twist" style="visibility:hidden">${wrapSvg(ICON.chevron, 10)}</span>
                      <span class="ico">${ic}</span>
                      <span class="label">${esc(t.name)}</span>
                      ${remindEl}
                      ${countEl}
                      <span class="star" title="Favoritar">${wrapSvg(ICON.star, 13)}</span>`;
      el.addEventListener('click', () => this.openThread(t.id));
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); this.openThreadMenu(e, t); });
      // Long-press para mobile (touch)
      el.addEventListener('touchstart', (e) => this.onTnodeTouchStart(e, t), { passive: true });
      el.addEventListener('touchend', () => this.onTnodeTouchEnd());
      el.addEventListener('touchmove', () => this.onTnodeTouchEnd());
      el.querySelector('.star').addEventListener('click', (e) => { e.stopPropagation(); this.toggleFavorite(t.id); });
      return el;
    },

onTnodeTouchStart(e, t) {
      this.onTnodeTouchEnd();
      this.tnodeLongPressTimer = setTimeout(() => {
        // Cria um evento fake com clientX/clientY do touch
        const touch = e.touches[0];
        const fakeEvent = { clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => {}, stopPropagation: () => {} };
        this.openThreadMenu(fakeEvent, t);
      }, 500);
    },

onTnodeTouchEnd() {
      if (this.tnodeLongPressTimer) { clearTimeout(this.tnodeLongPressTimer); this.tnodeLongPressTimer = null; }
    },

updateNoteCount() {
      Store.threadList().forEach((t) => {
        const count = Store.notesFor(t.id).length;
        document.querySelectorAll(`.tnode[data-tid="${t.id}"]`).forEach((el) => {
          let c = el.querySelector('.note-count');
          if (!count) { if (c) c.remove(); return; }
          if (!c) {
            c = document.createElement('span');
            c.className = 'note-count';
            const star = el.querySelector('.star');
            if (star) el.insertBefore(c, star); else el.appendChild(c);
          }
          c.textContent = count;
          c.title = `${count} nota${count !== 1 ? 's' : ''}`;
        });
      });
    },

renderFavorites() {
      const sec = this.dom.favSection, list = this.dom.favList;
      const favs = this.sortThreads(Store.threadList().filter((t) => t.favorite));
      if (!favs.length) { sec.classList.add('hidden'); return; }
      sec.classList.remove('hidden');
      list.innerHTML = '';
      favs.forEach((t) => list.appendChild(this.threadNode(t, 0)));
    },

toggleFavorite(id) {
      const t = Store.getThread(id); if (!t) return;
      t.favorite = !t.favorite; t.updatedAt = now();
      Store.upsertThread(t);
      Sync.send('thread:upsert', t);
      this.renderTree();
      Sound.play(t.favorite ? 'favorite' : 'pin'); haptic('light');
    },

    bindContextMenu() {
      document.addEventListener('click', (e) => {
        if (e.button === 2) return;
        if (!this.dom.ctx.contains(e.target)) this.dom.ctx.classList.add('hidden');
      });
      document.addEventListener('contextmenu', (e) => {
        if (!e.target.closest('.tnode')) this.dom.ctx.classList.add('hidden');
      });
      // handler global para ações do menu de thread (data-act)
      this.dom.ctx.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (b && b.dataset.act && ['fav', 'unfav', 'rename', 'delete', 'move'].includes(b.dataset.act)) {
          this.handleCtx(b.dataset.act);
        }
      });
    },

openThreadMenu(e, t) {
      this.ctxThreadId = t.id;
      const m = this.dom.ctx;
      m.querySelector('[data-act="fav"]').style.display = t.favorite ? 'none' : 'block';
      m.querySelector('[data-act="unfav"]').style.display = t.favorite ? 'block' : 'none';
      m.classList.remove('hidden');
      m.style.left = Math.min(e.clientX, window.innerWidth - 200) + 'px';
      m.style.top = Math.min(e.clientY, window.innerHeight - 220) + 'px';
      e.stopPropagation();
    },

    openFolderMenu(e, f) {
      const m = this.dom.ctx;
      m.innerHTML = `<button data-act="rename-folder">✎ Renomear pasta</button>
                     <button data-act="delete-folder" class="danger">🗑 Excluir caderno</button>`;
      m.classList.remove('hidden');
      m.style.left = Math.min(e.clientX, window.innerWidth - 200) + 'px';
      m.style.top = Math.min(e.clientY, window.innerHeight - 160) + 'px';
      m.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        const act = b.dataset.act;
        if (act === 'rename-folder') this.renameFolder(f.id);
        else if (act === 'delete-folder') this.confirmDeleteFolder(f.id);
        m.classList.add('hidden');
      }));
      e.stopPropagation();
    },
    renameFolder(id) {
      const f = Store.getFolder(id); if (!f) return;
      const body = `<label style="display:block;font-size:13px;color:var(--text-dim);margin-bottom:6px;font-weight:600">Novo nome do caderno</label>
        <input id="rename-folder-input" type="text" value="${esc(f.name)}" autofocus />`;
      this.showModal('Renomear caderno', body, () => {
        const v = ($('#rename-folder-input').value || '').trim();
        if (!v) { $('#rename-folder-input').focus(); return; }
        f.name = v; Store.upsertFolder(f); Sync.send('folder:upsert', f);
        this.renderTree(); this.closeModal();
      });
      setTimeout(() => { const el = $('#rename-folder-input'); if (el) { el.focus(); el.select(); } }, 50);
    },
    confirmDeleteFolder(id) {
      const f = Store.getFolder(id); if (!f) return;
      const count = Store.threadList().filter(t => t.folderId === id).length;
      const body = `
        <p style="font-size:14px;line-height:1.55;color:var(--text)">Tem certeza que deseja excluir o caderno <b>"${esc(f.name)}"</b>?</p>
        <p style="font-size:13px;color:var(--text-dim);margin-top:8px">${count ? `${count} conversa${count !== 1 ? 's' : ''} dentro voltará${count !== 1 ? 'ão' : ''} para a raiz.` : 'Nenhuma conversa neste caderno.'} Esta ação não pode ser desfeita.</p>`;
      this.showModal('Excluir caderno', body, () => {
        Store.deleteFolder(f.id, false); Sync.send('folder:delete', { id: f.id });
        this.renderTree(); this.closeModal();
        Sound.play('delete'); haptic('delete');
      });
      const okBtn = this.dom.modalOk;
      okBtn.classList.add('btn-danger');
      okBtn.textContent = 'Excluir';
    },

    renameThread(id) {
      const t = Store.getThread(id); if (!t) return;
      const body = `<label style="display:block;font-size:13px;color:var(--text-dim);margin-bottom:6px;font-weight:600">Novo nome da conversa</label>
        <input id="rename-thread-input" type="text" value="${esc(t.name)}" autofocus />`;
      this.showModal('Renomear conversa', body, () => {
        const v = ($('#rename-thread-input').value || '').trim();
        if (!v) { $('#rename-thread-input').focus(); return; }
        t.name = v; t.updatedAt = now(); Store.upsertThread(t); Sync.send('thread:upsert', t);
        this.renderTree(); this.closeModal();
        if (this.activeThread === id) $('#chat-name').textContent = v;
      });
      setTimeout(() => { const el = $('#rename-thread-input'); if (el) { el.focus(); el.select(); } }, 50);
    },
    handleCtx(act) {
      const id = this.ctxThreadId; const t = Store.getThread(id); if (!t) return;
      if (act === 'fav') this.toggleFavorite(id);
      else if (act === 'unfav') this.toggleFavorite(id);
      else if (act === 'rename') this.renameThread(id);
      else if (act === 'delete') {
        this.confirmDeleteThread(id);
      } else if (act === 'move') {
        const folders = Store.folderList();
        const opts = ['<option value="">— Raiz (sem pasta) —</option>']
          .concat(folders.map((f) => `<option value="${f.id}" ${t.folderId === f.id ? 'selected' : ''}>${esc(f.name)}</option>`)).join('');
        this.showModal('Mover para pasta', `<select id="move-sel">${opts}</select>`, () => {
          const v = $('#move-sel').value || null; t.folderId = v; t.updatedAt = now();
          Store.upsertThread(t); Sync.send('thread:upsert', t); this.renderTree(); this.closeModal();
        });
      }
      this.dom.ctx.classList.add('hidden');
    },

confirmDeleteThread(id) {
      const t = Store.getThread(id); if (!t) return;
      const noteCount = Store.notesFor(id).length;
      const body = `
        <p style="font-size:14px;line-height:1.55;color:var(--text)">Tem certeza que deseja excluir a conversa <b>"${esc(t.name)}"</b>?</p>
        <p style="font-size:13px;color:var(--text-dim);margin-top:8px">${noteCount ? `${noteCount} nota${noteCount !== 1 ? 's' : ''} serão removida${noteCount !== 1 ? 's' : ''} permanentemente.` : 'Nenhuma nota nesta conversa.'} Esta ação não pode ser desfeita.</p>`;
      this.showModal('Excluir conversa', body, () => {
        delete Store.data.threads[id]; delete Store.data.notes[id];
        if (this.activeThread === id) {
          this.activeThread = null;
          $('#chat-name').textContent = 'Selecione uma conversa';
          $('#messages').querySelectorAll('.bubble,.day-sep').forEach((n) => n.remove());
          $('#empty-state').classList.remove('hidden');
          $('#composer-input').disabled = true; $('#btn-send').disabled = true;
          this.dom.btnPin.classList.add('hidden');
          this.setChatActiveUi(false);
        }
        Store.save(); Sync.send('thread:delete', { id });
        this.renderTree();
        this.closeModal();
        Sound.play('delete'); haptic('delete');
      });
      // destaca o botão OK como perigoso
      const okBtn = this.dom.modalOk;
      okBtn.classList.add('btn-danger');
      okBtn.textContent = 'Excluir';
    },
};
