import { EMOJI_CATS } from '../emojis.js';
import { $, esc } from '../utils.js';

export const PickerMethods = {
_pickerHTML(prefix, defEmoji) {
      const sec = (c) => `
        <div class="ep-section" data-cat="${c.id}" data-label="${c.label.toLowerCase()}">
          <div class="ep-head">${c.label}</div>
          <div class="emoji-grid">${c.emojis.map(([e, n]) => `<button type="button" class="emoji-opt${e === defEmoji ? ' sel' : ''}" data-emoji="${e}" title="${n}">${e}</button>`).join('')}</div>
        </div>`;
      const chips = EMOJI_CATS.map((c) => `<button type="button" class="ep-chip" data-goto="${c.id}">${c.label}</button>`).join('');
      return `
        <input id="${prefix}-search" class="ep-search" type="text" placeholder="Buscar emoji… (ex: remédio, futebol, série)" autocomplete="off" />
        <div class="ep-cats">${chips}</div>
        <div id="${prefix}-scroll" class="ep-scroll">${EMOJI_CATS.map(sec).join('')}</div>`;
    },
    _filterEmojis(scroll, q) {
      const query = q.trim().toLowerCase();
      // mapa emoji → nome (achatado do catálogo)
      if (!this._emojiNames) {
        this._emojiNames = {};
        EMOJI_CATS.forEach((c) => c.emojis.forEach(([e, n]) => { this._emojiNames[e] = n; }));
      }
      scroll.querySelectorAll('.ep-section').forEach((sec) => {
        const catLabel = sec.dataset.label || '';
        let anyVisible = false;
        sec.querySelectorAll('.emoji-opt').forEach((b) => {
          const name = this._emojiNames[b.dataset.emoji] || '';
          const match = !query || name.includes(query) || catLabel.includes(query);
          b.classList.toggle('hidden', !match);
          if (match) anyVisible = true;
        });
        sec.classList.toggle('hidden', !anyVisible);
      });
    },
    _bindPicker(prefix, getDefaultSel, onPick) {
      const scroll = $(`#${prefix}-scroll`);
      const search = $(`#${prefix}-search`);
      const select = (btn) => {
        scroll.querySelectorAll('.emoji-opt.sel').forEach((x) => x.classList.remove('sel'));
        btn.classList.add('sel');
        onPick(btn.dataset.emoji);
      };
      // seleção inicial (fallback: mantém default se nada marcado)
      let initial = scroll.querySelector('.emoji-opt.sel');
      if (!initial) onPick(getDefaultSel);
      scroll.querySelectorAll('.emoji-opt').forEach((b) => b.addEventListener('click', () => select(b)));
      // chips → rola até a categoria
      const pickerRoot = scroll.closest('.ep');
      if (pickerRoot) pickerRoot.querySelectorAll('.ep-chip').forEach((ch) => ch.addEventListener('click', () => {
        search.value = '';
        this._filterEmojis(scroll, '');
        const sec = scroll.querySelector(`.ep-section[data-cat="${ch.dataset.goto}"]`);
        if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }));
      // busca por nome do emoji + categoria
      if (search) search.addEventListener('input', () => this._filterEmojis(scroll, search.value));
      // drag-to-scroll + wheel horizontal na barra de categorias
      const catsBar = pickerRoot && pickerRoot.querySelector('.ep-cats');
      if (catsBar) {
        let down = false, startX = 0, startLeft = 0, moved = false;
        catsBar.addEventListener('mousedown', (e) => { down = true; moved = false; startX = e.pageX; startLeft = catsBar.scrollLeft; catsBar.classList.add('dragging'); });
        window.addEventListener('mousemove', (e) => {
          if (!down) return;
          const dx = e.pageX - startX;
          if (Math.abs(dx) > 4) moved = true;
          catsBar.scrollLeft = startLeft - dx;
        });
        window.addEventListener('mouseup', () => {
          if (!down) return;
          down = false; catsBar.classList.remove('dragging');
          // se arrastou, suprime o clique no chip logo solto
          if (moved) catsBar.dataset.suppressClick = '1';
          setTimeout(() => { catsBar.dataset.suppressClick = ''; }, 0);
        });
        catsBar.addEventListener('click', (e) => {
          if (catsBar.dataset.suppressClick === '1') { e.stopPropagation(); e.preventDefault(); }
        }, true);
        // wheel vertical rola a barra na horizontal quando o mouse está sobre ela
        catsBar.addEventListener('wheel', (e) => {
          if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
            const max = catsBar.scrollWidth - catsBar.clientWidth;
            const atStart = catsBar.scrollLeft <= 0 && e.deltaY < 0;
            const atEnd = catsBar.scrollLeft >= max && e.deltaY > 0;
            if (!atStart && !atEnd) { e.preventDefault(); catsBar.scrollLeft += e.deltaY; }
          }
        }, { passive: false });
      }
    },
};

